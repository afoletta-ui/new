// Sea Drive multiplayer server: serves the game, relays players, owns the accounts, land, leaderboard and chat.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
// optional voice-chat relay for players on strict networks: set TURN_URL, TURN_USERNAME, TURN_PASSWORD on Render
const TURN = process.env.TURN_URL ? [{ urls: process.env.TURN_URL.split(',').map(u => u.trim()).filter(Boolean), username: process.env.TURN_USERNAME || '', credential: process.env.TURN_PASSWORD || '' }] : [];
const FILE = path.join(__dirname, 'data.json');
let UR = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, ''), UT = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
let SAVE_MODE = 'file'; // 'upstash' = safe, 'file' = wiped whenever Render sleeps or redeploys
const COLORS = ['#e8445a', '#2f8ccc', '#3fae5a', '#a85aa8', '#ff8a1e', '#2ee6c8', '#ff6fae', '#9fb4c8'];
const BLOCKS = 12;                      // beachfront blocks, numbered 0-11 left to right
const MASS = [1, 1.5, 3, 6, 12];        // paddleboard, kayak, tinny, boat, yacht
const RAD = [0.9, 1.1, 1.7, 2.3, 3.6];  // collision size of each vessel (metres)
const AX = 0, AZ = -62, AR = 8;        // the boxing ring behind the leaderboard
const inRing = q => Math.abs(q.x - AX) < AR && Math.abs(q.z - AZ) < AR;

let land = {};    // pid -> { pref, n }  who owns land, remembered while they are offline
let board = [];
// ponds: 10 plots behind the houses. { pid, n, c, f: [{si,L,va,m,t}], log: [{n,si,at}] }  (kept while the owner is offline)
const PONDX = [-135, -108, -81, -54, -27, 27, 54, 81, 108, 135], PONDZ = -74, PBX = 9, PBZ = 7, POND_MAX = 20, GROW = 3 * 24 * 3600 * 1000;
let ponds = PONDX.map(() => null);
const FENCE = [[9, 7], [10.5, 8.2], [12, 9.4], [13, 10.5]], FENCE_COST = [0, 500000, 2500000, 10000000];
const fenceOf = i => FENCE[ponds[i] && ponds[i].fl > 0 ? Math.min(3, ponds[i].fl | 0) : 0];
const inPond = (i, x, z) => { const F = fenceOf(i); return Math.abs(x - PONDX[i]) < F[0] && Math.abs(z - PONDZ) < F[1]; };
const pondsPub = () => ponds.map(o => o && { pid: o.pid, n: o.n, c: o.c, f: o.f, fl: o.fl || 0 });   // top 5 fish by value: [{ n, sp, L, v }]
const owners = {}; // block -> { pid, n, c }  ONLY players who are online right now
const chat = [];   // last 20 chat lines
let accounts = {}; // NAME -> { name, salt, hash, pid, save }  (with Upstash these load one at a time)
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 32, (e, k) => (e ? no(e) : ok(k.toString('hex')))));
const sha8 = v => crypto.createHash('sha1').update(String(v)).digest('hex').slice(0, 8);

// ---------- saving (Upstash Redis if set up, otherwise data.json) ----------
async function kvGet(k) {
  const r = await fetch(UR + '/get/' + encodeURIComponent(k), { headers: { Authorization: 'Bearer ' + UT } });
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}
// saves retry a few times, so a hiccup never loses progress
async function kvSet(k, v, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(UR + '/set/' + encodeURIComponent(k), { method: 'POST', headers: { Authorization: 'Bearer ' + UT }, body: JSON.stringify(v) });
      if (r.ok) return true; console.error('Upstash save failed (' + r.status + ') for ' + k); } catch (e) { console.error('Upstash save error for ' + k + ': ' + e.message); }
    await new Promise(ok => setTimeout(ok, 800 * (i + 1)));
  }
  return false;
}
// check the save database really works before trusting it
async function checkUpstash() {
  if (!UR && !UT) { console.error('!!! NO SAVE DATABASE: add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Render > Environment, or everyone\'s progress is wiped when Render sleeps.'); return; }
  if (!/^https:\/\//.test(UR) && !process.env.UPSTASH_ALLOW_HTTP) { console.error('!!! UPSTASH_REDIS_REST_URL must be the REST URL that starts with https:// (not the redis:// or rediss:// one). Got: ' + UR.slice(0, 30)); UR = ''; return; }
  if (!UT) { console.error('!!! UPSTASH_REDIS_REST_TOKEN is missing.'); UR = ''; return; }
  try {
    const stamp = String(Date.now());
    const ok = await kvSet('ping', stamp, 2);
    const back = ok ? await kvGet('ping') : null;
    if (back === stamp || String(back) === stamp) { SAVE_MODE = 'upstash'; console.log('Saving accounts to Upstash - progress is safe.'); return; }
    console.error('!!! Upstash did not save properly - check the URL and token (use the REST token, not the read-only one).');
  } catch (e) { console.error('!!! Could not reach Upstash: ' + e.message); }
  UR = '';
}

async function load() {
  await checkUpstash();
  if (SAVE_MODE !== 'upstash') console.error('!!! Saving to data.json only. Accounts will be lost when Render restarts.');
  try {
    let d;
    if (UR) d = { land: await kvGet('land'), board: await kvGet('board'), owners: await kvGet('owners'), ponds: await kvGet('ponds') };
    else d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (d.land) land = d.land;
    else {
      // older versions saved { blockIndex: {pid,n,c} } - turn that into one block per player
      const old = d.owners || (d.board === undefined ? d : null) || {};
      for (const i of Object.keys(old)) {
        const o = old[i];
        if (o && o.pid && +i >= 0 && +i < BLOCKS && !land[o.pid]) land[o.pid] = { pref: +i, n: o.n };
      }
    }
    if (Array.isArray(d.ponds)) ponds = PONDX.map((_, i) => d.ponds[i] && d.ponds[i].pid ? d.ponds[i] : null);
    if (Array.isArray(d.board)) board = d.board.filter(b => b && b.v > 0).slice(0, 5);
    if (!UR && d.accounts) accounts = d.accounts;
  } catch (e) { /* first run: nothing saved yet */ }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (UR) { kvSet('land', land); kvSet('board', board); kvSet('ponds', ponds); }
    else fs.writeFile(FILE, JSON.stringify({ land, board, accounts, ponds }), () => {});
  }, 300);
}
// accounts: with Upstash each account is its own key, so it survives Render going to sleep
const acctTimers = {};
function saveAcct(key) {
  if (!UR) return save();
  clearTimeout(acctTimers[key]);
  acctTimers[key] = setTimeout(() => kvSet('acct:' + key, accounts[key]), 800);
}
async function getAcct(key) {
  if (accounts[key]) return accounts[key];
  if (!UR) return null;
  try { const a = await kvGet('acct:' + key); if (a) accounts[key] = a; return a || null; } catch (e) { return undefined; }
}
const okSave = o => o && typeof o === 'object' && !Array.isArray(o) && JSON.stringify(o).length < 300000;

// ---------- web page ----------
// the game file can be in a "public" folder or right next to server.js - either works
// the game file can be in a "public" folder or next to server.js, and can be called "index (1).html" etc.
function findGame() {
  const out = [];
  for (const dir of [path.join(__dirname, 'public'), __dirname]) {
    try { for (const n of fs.readdirSync(dir)) if (/^index.*\.html$/i.test(n)) out.push(path.join(dir, n)); } catch (e) {}
  }
  out.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size); // the newest game is the biggest file
  return out[0];
}
const GAME = findGame();
if (GAME) console.log('Serving the game from ' + path.relative(__dirname, GAME));
if (!GAME) console.error('Could not find index.html - put it in a folder called public, or next to server.js');
const page = () => fs.readFileSync(GAME, 'utf8')
  .replace('<!--MP-->', '<script>window.MP_ON=true;window.ICE_X=' + JSON.stringify(TURN).replace(/</g, '\\u003c') + '</script>');
let THREE_JS = null;
const srv = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (req.url.split('?')[0] === '/vendor/three.module.min.js') {
    try { const js = THREE_JS || (THREE_JS = fs.readFileSync(path.join(path.dirname(require.resolve('three')), 'three.module.min.js'))); res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }); return res.end(js); }
    catch (e) { res.writeHead(404); return res.end('three.js not installed'); }
  }
  if (!GAME) { res.writeHead(500); return res.end('index.html is missing - upload it next to server.js'); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page());
});

// ---------- players ----------
const wss = new WebSocketServer({ server: srv });
const players = new Map(); // ws -> player
let nextId = 1;
const cd = new Map();      // cooldowns for rams / punches
const num = v => (Number.isFinite(v) ? v : 0);
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const all = o => { for (const w of wss.clients) send(w, o); };
const others = (me, o) => { for (const w of wss.clients) if (w !== me) send(w, o); };
const byId = id => { for (const p of players.values()) if (p.id === id && p.pid) return p; return null; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const cleanName = (n, id) => String(n || '').toUpperCase().replace(/[^A-Z0-9 _.!?-]/g, '').trim().slice(0, 14) || 'PLAYER' + id;
const online = pid => [...players.values()].some(p => p.pid === pid);

// your land only shows while you're online; if someone online took your spot you get the first free one
function placeLand(p) {
  const L = land[p.pid];
  if (!L) return;
  for (const i in owners) if (owners[i].pid === p.pid) return;
  let i = L.pref >= 0 && L.pref < BLOCKS && !owners[L.pref] ? L.pref : -1;
  if (i < 0) for (let k = 0; k < BLOCKS; k++) if (!owners[k]) { i = k; break; }
  if (i < 0) return; // every block is in use by people online right now
  if (i !== L.pref) { L.pref = i; save(); send(p.ws, { t: 'moved', i }); }
  owners[i] = { pid: p.pid, n: p.n, c: p.c };
  all({ t: 'own', i, o: owners[i] });
}
function removeLand(pid) {
  for (const i of Object.keys(owners)) if (owners[i].pid === pid) { delete owners[i]; all({ t: 'own', i: +i, o: null }); }
}

wss.on('connection', ws => {
  const id = nextId++;
  const p = { id, ws, n: 'PLAYER' + id, c: COLORS[id % COLORS.length], x: 0, z: -6, h: 0, w: 1, v: -1, s: 0, st: 0, pid: null };
  players.set(ws, p);

  ws.on('message', async raw => {
    let d; try { d = JSON.parse(raw); } catch (e) { return; }

    if (d.t === 'login') {
      // username + password. A new name makes a new account; an existing name needs its password.
      const now = Date.now();
      if (p.busy) return;
      if (p.lockUntil > now) return send(ws, { t: 'loginres', ok: 0, why: 'TOO MANY TRIES - WAIT 30 SECONDS' });
      const name = String(d.n || '').toUpperCase().replace(/[^A-Z0-9 _.!?-]/g, '').trim().slice(0, 14), pw = String(d.pw || '');
      if (!name) return send(ws, { t: 'loginres', ok: 0, why: 'TYPE A USERNAME FIRST' });
      if (pw.length < 4 || pw.length > 64) return send(ws, { t: 'loginres', ok: 0, why: 'PASSWORD MUST BE AT LEAST 4 CHARACTERS' });
      p.busy = true;
      try {
        let a = await getAcct(name), isNew = false;
        if (a === undefined) return send(ws, { t: 'loginres', ok: 0, why: 'SAVE SERVER BUSY - TRY AGAIN' });
        if (a) {
          if (a.lockUntil > now) return send(ws, { t: 'loginres', ok: 0, why: 'ACCOUNT LOCKED FOR A MINUTE - TOO MANY WRONG PASSWORDS' });
          const h = await scrypt(pw, a.salt);
          if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(a.hash, 'hex'))) {
            p.fails = (p.fails || 0) + 1; if (p.fails >= 5) { p.fails = 0; p.lockUntil = now + 30000; }
            a.fails = (a.fails || 0) + 1; if (a.fails >= 10) { a.fails = 0; a.lockUntil = now + 60000; }
            return send(ws, { t: 'loginres', ok: 0, why: 'WRONG PASSWORD FOR ' + name });
          }
          if (a.fails) a.fails = 0;
        } else {
          isNew = true;
          const salt = crypto.randomBytes(16).toString('hex');
          a = accounts[name] = { name, salt, hash: await scrypt(pw, salt), pid: sha8('acct:' + name), save: okSave(d.seed) ? d.seed : null, made: now };
          // land bought before accounts existed moves to the new account
          const old = d.tok ? sha8(d.tok) : null;
          if (old && land[old] && !land[a.pid]) { land[a.pid] = land[old]; delete land[old]; save(); }
          saveAcct(name);
        }
        // only one session per account: kick the older one
        for (const [w, q] of players) if (q !== p && q.key === name) { send(w, { t: 'kicked' }); q.pid = null; q.key = null; removeLand(a.pid); w.close(); }
        p.key = name; p.n = name; p.pid = a.pid;
        send(ws, { t: 'loginres', ok: 1, save: a.save || null, isNew, persist: SAVE_MODE === 'upstash' ? 1 : 0 });
        if (land[p.pid] && land[p.pid].n !== p.n) { land[p.pid].n = p.n; save(); }
        placeLand(p);
        send(ws, { t: 'init', id, pid: p.pid, c: p.c, owners, board, chat, ponds: pondsPub(), now: Date.now(),
          players: [...players.values()].filter(q => q !== p && q.pid).map(q => ({ id: q.id, n: q.n, c: q.c, x: q.x, z: q.z, h: q.h, w: q.w, v: q.v, st: q.st, r: q.r || 0 })) });
        others(ws, { t: 'join', id, n: p.n, c: p.c });
        { const pi = ponds.findIndex(o => o && o.pid === p.pid); if (pi >= 0) { const o = ponds[pi]; if (o.n !== p.n) o.n = p.n; if (o.log && o.log.length) { send(ws, { t: 'plog', log: o.log }); o.log = []; save(); } } }
      } catch (e) { send(ws, { t: 'loginres', ok: 0, why: 'LOGIN ERROR - TRY AGAIN' }); }
      finally { p.busy = false; }
      return;
    }
    if (!p.pid) return;

    if (d.t === 'save') {
      // the player's progress: money, gear, fish book... kept on the server under their account
      if (!p.key || !accounts[p.key] || !okSave(d.s)) return;
      const old = accounts[p.key].save;
      if (old && old.ts && d.s.ts && d.s.ts < old.ts) return; // never let an older copy overwrite a newer one
      accounts[p.key].save = d.s; saveAcct(p.key);
      return;
    }

    if (d.t === 'pos') {
      p.x = num(d.x); p.z = num(d.z); p.h = num(d.h); p.w = d.w ? 1 : 0;
      const v = Math.trunc(num(d.v)); p.v = v >= -1 && v <= 8 ? v : -1;
      p.s = Math.max(0, Math.min(1, num(d.s))); p.st = Math.trunc(num(d.st)) & 255;
      p.r = Math.max(0, Math.trunc(num(d.r))); p.dk = Array.isArray(d.dk) ? [num(d.dk[0]), num(d.dk[1])] : null; p.hb = Math.trunc(num(d.hb)); if (!(p.hb >= 0 && p.hb < BLOCKS)) p.hb = -1; p.mi = d.mi ? 1 : 0; p.pw = d.pw ? 1 : 0;
      // the item they're holding up to show off: [kind, species, length, variant, multiplier] (fish) or [2] / [3]
      const ho = d.ho; p.ho = Array.isArray(ho) && ho[0] === 1 ? [1, Math.trunc(num(ho[1])), Math.round(num(ho[2])), Math.max(0, Math.min(4, Math.trunc(num(ho[3])))), Math.round(num(ho[4]) * 100) / 100 || 1] : Array.isArray(ho) && (ho[0] === 2 || ho[0] === 3) ? [ho[0]] : 0;

    } else if (d.t === 'buy') {
      const i = Math.trunc(num(d.i));
      const why = !(i >= 0 && i < BLOCKS) ? 'NO SUCH BLOCK' : owners[i] ? 'SOMEONE ALREADY OWNS THAT BLOCK' : land[p.pid] ? 'YOU ALREADY OWN A BLOCK' : '';
      if (why) return send(ws, { t: 'buyres', i, ok: 0, why });
      land[p.pid] = { pref: i, n: p.n };
      owners[i] = { pid: p.pid, n: p.n, c: p.c };
      save();
      send(ws, { t: 'buyres', i, ok: 1 });
      all({ t: 'own', i, o: owners[i] });

    } else if (d.t === 'ram') {
      // attacker says they hit someone; check it's believable, then work out the damage
      const q = byId(Math.trunc(num(d.id)));
      if (!q || q === p || p.w || p.v < 0 || p.r || (p.st & 8)) return;
      const swim = q.w && (q.st & 16);
      if (q.r || (q.st & 8) || (q.w && !swim) || (!q.w && q.v < 0)) return;
      const k = p.id + '>' + q.id;
      if ((cd.get(k) || 0) > Date.now()) return;
      if (dist(p, q) > RAD[p.v] + (swim ? 0.6 : RAD[q.v]) + 9) return;
      cd.set(k, Date.now() + 1400);
      const sf = Math.max(0, Math.min(1, num(d.s)));
      if (swim) return send(q.ws, { t: 'hit', d: 0.6, by: p.n, x: p.x, z: p.z, swim: 1 }); // run over a swimmer
      // bigger boats hit harder, but even a kayak does real damage
      const toThem = Math.max(0.08, Math.min(0.85, 0.2 * Math.pow(MASS[p.v] / MASS[q.v], 0.7) * (0.4 + 0.6 * sf)));
      const toMe = Math.max(0.03, Math.min(0.5, 0.1 * Math.pow(MASS[q.v] / MASS[p.v], 0.7)));
      send(q.ws, { t: 'hit', d: toThem, by: p.n, x: p.x, z: p.z });
      send(p.ws, { t: 'hit', d: toMe, by: q.n, x: q.x, z: q.z, self: 1 });

    } else if (d.t === 'punch') {
      const q = byId(Math.trunc(num(d.id)));
      if (!q || q === p || !p.w || !q.w) return;
      const k = 'punch' + p.id;
      if ((cd.get(k) || 0) > Date.now() || dist(p, q) > 4) return;
      cd.set(k, Date.now() + 500);
      send(q.ws, { t: 'punched', by: p.n, x: p.x, z: p.z });
      const du = p.duel;
      if (du && du === q.duel && inRing(p) && inRing(q)) {
        // boxing match: every punch in the ring takes 12% health
        du.hp[q.id] = Math.max(0, du.hp[q.id] - 0.12);
        const m = { t: 'duelhp', hp: du.hp }; send(p.ws, m); send(q.ws, m);
        if (du.hp[q.id] <= 0) {
          p.duel = q.duel = null;
          send(p.ws, { t: 'duelend', win: 1, stake: du.stake, n: q.n });
          send(q.ws, { t: 'duelend', win: 0, stake: du.stake, n: p.n });
        }
      }

    } else if (d.t === 'fuel') {
      const q = byId(Math.trunc(num(d.id)));
      if (!q || q === p || dist(p, q) > 16) return;
      send(q.ws, { t: 'gotfuel', by: p.n });

    } else if (d.t === 'chat') {
      const now = Date.now();
      if (now - (p.lastChat || 0) < 600) return;
      p.lastChat = now;
      const m = String(d.m || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
      if (!m) return;
      const line = { t: 'chat', id: p.id, n: p.n, c: p.c, m };
      chat.push(line); if (chat.length > 20) chat.shift();
      all(line);

    } else if (d.t === 'catch') {
      // leaderboard is ranked by how much the fish is worth
      const v = num(d.v), L = num(d.L);
      if (!(v > 0 && v < 1e13 && L > 0 && L < 10000)) return;
      if (board.length >= 5 && v <= board[4].v) return;
      board.push({ n: p.n, sp: String(d.sp || 'FISH').toUpperCase().slice(0, 22), L: Math.round(L), v: Math.round(v) });
      board.sort((a, b) => b.v - a.v);
      board = board.slice(0, 5);
      save();
      all({ t: 'board', b: board });

    } else if (d.t === 'bust') {
      // a tuna bust popped up - everyone gets to see it
      const now = Date.now(); if (now - (p.lastBust || 0) < 4000) return; p.lastBust = now;
      others(ws, { t: 'bust', x: num(d.x), z: num(d.z), vx: Math.max(-1, Math.min(1, num(d.vx))), vz: Math.max(-1, Math.min(1, num(d.vz))) });

    } else if (d.t === 'took') {
      // someone hooked a fish, so it disappears for everyone
      others(ws, { t: 'took', k: String(d.k || '').slice(0, 24) });

    } else if (d.t === 'netreq') {
      const q = byId(Math.trunc(num(d.id)));
      if (q && q.r === p.id) send(q.ws, { t: 'netreq', from: p.id, n: p.n, sp: String(d.sp || 'FISH').slice(0, 22), ft: Math.trunc(num(d.ft)) });

    } else if (d.t === 'netres') {
      const q = byId(Math.trunc(num(d.id)));
      if (q) send(q.ws, { t: 'netres', ok: d.ok ? 1 : 0, n: p.n });

    } else if (d.t === 'invite') {
      // invite someone into your house (you must own a block)
      const q = byId(Math.trunc(num(d.id)));
      let b = -1; for (const i in owners) if (owners[i].pid === p.pid) b = +i;
      if (!q || q === p || b < 0) return;
      send(q.ws, { t: 'invite', from: p.id, n: p.n, b });

    } else if (d.t === 'rtc') {
      // voice chat: pass the connection details between two players (the audio itself goes player to player)
      const q = byId(Math.trunc(num(d.id)));
      if (!q || q === p) return;
      const m = { t: 'rtc', from: p.id };
      if (d.sdp && typeof d.sdp === 'object' && JSON.stringify(d.sdp).length < 20000) m.sdp = { type: String(d.sdp.type), sdp: String(d.sdp.sdp) };
      else if (d.ice && typeof d.ice === 'object' && JSON.stringify(d.ice).length < 2000) m.ice = d.ice;
      else return;
      send(q.ws, m);

    } else if (d.t === 'eskyreq' || d.t === 'steal') {
      // a passenger looks in (or nicks a fish from) the driver's esky
      const q = byId(Math.trunc(num(d.id)));
      if (!q || p.r !== q.id) return;
      if (d.t === 'eskyreq') send(q.ws, { t: 'eskyreq', from: p.id, n: p.n });
      else send(q.ws, { t: 'steal', from: p.id, n: p.n, i: Math.trunc(num(d.i)), L: num(d.L), si: Math.trunc(num(d.si)) });

    } else if (d.t === 'eskyres' || d.t === 'stolen') {
      // the driver's game answers the passenger
      const q = byId(Math.trunc(num(d.id)));
      if (!q || q.r !== p.id) return;
      if (d.t === 'eskyres') send(q.ws, { t: 'eskyres', from: p.id, n: p.n, list: (Array.isArray(d.list) ? d.list : []).slice(0, 50).map(f => ({ L: num(f && f.L), si: Math.trunc(num(f && f.si)), m: num(f && f.m) || 1, va: Math.max(0, Math.min(4, Math.trunc(num(f && f.va)))) })) });
      else send(q.ws, { t: 'stolen', ok: d.ok ? 1 : 0, L: num(d.L), si: Math.trunc(num(d.si)), m: num(d.m) || 1, va: Math.max(0, Math.min(4, Math.trunc(num(d.va)))), n: p.n });

    } else if (d.t === 'duel') {
      // boxing challenge with money on the line
      const q = byId(Math.trunc(num(d.id))), stake = Math.max(0, Math.min(1e13, Math.round(num(d.stake))));
      if (!q || q === p || p.duel || q.duel) return send(ws, { t: 'duelno', why: 'THEY ARE BUSY' });
      if (!inRing(p) || !inRing(q)) return send(ws, { t: 'duelno', why: 'YOU BOTH NEED TO BE IN THE RING' });
      p.pend = { to: q.id, stake, at: Date.now() };
      send(q.ws, { t: 'duelreq', from: p.id, n: p.n, stake });

    } else if (d.t === 'duelans') {
      const q = byId(Math.trunc(num(d.id)));
      if (!q || !q.pend || q.pend.to !== p.id || Date.now() - q.pend.at > 30000) return;
      const stake = q.pend.stake; q.pend = null;
      if (!d.ok) return send(q.ws, { t: 'duelno', why: p.n + ' SAID NO' });
      if (q.duel || p.duel) return;
      const du = { stake, hp: { [q.id]: 1, [p.id]: 1 } }; q.duel = p.duel = du;
      send(q.ws, { t: 'duelgo', vs: p.id, n: p.n, stake });
      send(p.ws, { t: 'duelgo', vs: q.id, n: q.n, stake });

    } else if (d.t === 'pbuy') {
      const i = Math.trunc(num(d.i));
      const why = !(i >= 0 && i < PONDX.length) ? 'NO SUCH POND' : ponds[i] ? 'SOMEONE ALREADY OWNS THAT POND' : ponds.some(o => o && o.pid === p.pid) ? 'YOU ALREADY OWN A POND' : '';
      if (why) return send(ws, { t: 'pres', a: 'buy', i, ok: 0, why });
      ponds[i] = { pid: p.pid, n: p.n, c: p.c, f: [], log: [] }; save();
      send(ws, { t: 'pres', a: 'buy', i, ok: 1 }); all({ t: 'ponds', p: pondsPub() });

    } else if (d.t === 'pstock') {
      const i = Math.trunc(num(d.i)), o = ponds[i], f = d.f && typeof d.f === 'object' ? d.f : null;
      const fish = f && { si: Math.max(0, Math.min(40, Math.trunc(num(f.si)))), L: Math.max(1, Math.round(num(f.L))), va: Math.max(0, Math.min(4, Math.trunc(num(f.va)))), m: Math.max(.1, Math.min(10, num(f.m) || 1)), t: Date.now() };
      const why = !fish ? 'BAD FISH' : !o || o.pid !== p.pid ? 'THAT IS NOT YOUR POND' : o.f.length >= POND_MAX ? 'YOUR POND IS FULL (' + POND_MAX + ' FISH)' : '';
      if (why) return send(ws, { t: 'pres', a: 'stock', ok: 0, why, f: fish && { si: fish.si, L: fish.L, va: fish.va, m: fish.m } });
      o.f.push(fish); save(); send(ws, { t: 'pres', a: 'stock', ok: 1 }); all({ t: 'ponds', p: pondsPub() });

    } else if (d.t === 'pfish') {
      const i = Math.trunc(num(d.i)), o = ponds[i], now = Date.now(), mine = o && o.pid === p.pid;
      const cast = p.pcast && p.pcast.i === i && now - p.pcast.at > 1500 && now - p.pcast.at < 60000;
      const why = !o ? 'NOBODY OWNS THIS POND' : !o.f.length ? 'THE POND IS EMPTY' : !p.w || !inPond(i, p.x, p.z) ? 'YOU HAVE TO BE INSIDE THE POND FENCE' : !mine && !cast ? 'CAST INTO THE POND FIRST' : (cd.get('pf' + p.id) || 0) > now ? 'WAIT A MOMENT' : '';
      p.pcast = null;
      if (why) return send(ws, { t: 'pres', a: 'fish', i, ok: 0, why });
      cd.set('pf' + p.id, now + (mine ? 2000 : 5000));
      const k = Math.floor(Math.random() * o.f.length), f = o.f.splice(k, 1)[0];
      const gm = 1 + 2 * Math.min(1, Math.max(0, (now - f.t) / GROW));
      if (!mine) {
        o.log = (o.log || []).concat({ n: p.n, si: f.si, at: now }).slice(-30);
        const q = [...players.values()].find(q => q.pid === o.pid);
        if (q) { send(q.ws, { t: 'ppoached', n: p.n, f: { si: f.si, L: f.L } }); o.log = []; }
      }
      save();
      send(ws, { t: 'pres', a: 'fish', i, ok: 1, f: { si: f.si, L: f.L, va: f.va, m: f.m, gm: Math.round(gm * 100) / 100 } });
      all({ t: 'ponds', p: pondsPub() });

    } else if (d.t === 'pcast') {
      // a thief casts into someone's pond: the owner (if online) gets a warning
      const i = Math.trunc(num(d.i)), o = ponds[i];
      if (!o || !p.w || !inPond(i, p.x, p.z)) return;
      p.pcast = { i, at: Date.now() };
      if (o.pid !== p.pid) { const q = [...players.values()].find(q => q.pid === o.pid); if (q) send(q.ws, { t: 'pintrude', n: p.n }); }

    } else if (d.t === 'pfence') {
      const i = Math.trunc(num(d.i)), o = ponds[i];
      if (!o || o.pid !== p.pid) return send(ws, { t: 'pres', a: 'fence', ok: 0, why: 'THAT IS NOT YOUR POND' });
      const fl = (o.fl || 0) + 1;
      if (fl > 3) return send(ws, { t: 'pres', a: 'fence', ok: 0, why: 'YOUR FENCE IS ALREADY THE BEST' });
      o.fl = fl; save(); send(ws, { t: 'pres', a: 'fence', ok: 1, fl }); all({ t: 'ponds', p: pondsPub() });

    } else if (d.t === 'pgrab') {
      // the owner grabs someone standing inside their pond fence: the trespasser loses half their money to the owner
      const pi = ponds.findIndex(o => o && o.pid === p.pid), q = byId(Math.trunc(num(d.id))), now = Date.now();
      const why = pi < 0 ? 'YOU DO NOT OWN A POND' : !q || q === p ? 'NOBODY THERE' : !q.w || !inPond(pi, q.x, q.z) ? q.n + ' IS NOT IN YOUR POND' : dist(p, q) > 6 ? 'GET CLOSER' : (cd.get('pg' + p.id) || 0) > now || (cd.get('pgv' + q.id) || 0) > now ? 'WAIT A MOMENT' : '';
      if (why) return send(ws, { t: 'pres', a: 'grab', ok: 0, why });
      cd.set('pg' + p.id, now + 8000); cd.set('pgv' + q.id, now + 20000); q.pgBy = p.id;
      send(q.ws, { t: 'pgrabbed', n: p.n }); send(ws, { t: 'pres', a: 'grab', ok: 1, n: q.n });

    } else if (d.t === 'ppay') {
      const o = p.pgBy ? byId(p.pgBy) : null; p.pgBy = 0;
      const amt = Math.max(0, Math.min(1e18, Math.floor(num(d.amt))));
      if (o) send(o.ws, { t: 'ppaid', n: p.n, amt });

    } else if (d.t === 'die') {
      // boat exploded: they only lose that boat (the game handles it), everyone sees the explosion
      others(ws, { t: 'boom', x: p.x, z: p.z });
    }
  });

  ws.on('close', () => {
    players.delete(ws);
    others(ws, { t: 'leave', id });
    if (p.pid && !online(p.pid)) removeLand(p.pid); // land disappears when you log off
    if (p.duel) { for (const q of players.values()) if (q.duel === p.duel) { q.duel = null; send(q.ws, { t: 'duelend', win: -1, n: p.n }); } }
  });
});

const r2 = v => Math.round(v * 100) / 100;
// ---------- the old man: one for the whole server. At night he chases whoever on land is closest to him ----------
let OM = null;
const DAYS = 1500;
const isNightS = () => { if (process.env.OM_NIGHT) return true; const u = ((Date.now() / 1000) % DAYS) / DAYS; return u > 0.003 && u < 0.197; };
const omCan = p => p.pid && p.w && !p.mi && !(p.st & (2 | 8 | 32 | 64)) && (!(p.st & 16) || p.pw) && p.z < 3;
function omTick(dt) {
  if (!isNightS()) { if (OM) { OM = null; all({ t: 'om', o: null, gone: 1 }); } return; }
  const el = [...players.values()].filter(omCan);
  if (!OM) {
    if (!el.length) return;
    const p = el[Math.floor(Math.random() * el.length)];
    OM = { x: Math.max(-145, Math.min(145, p.x + (Math.random() - 0.5) * 70)), z: Math.min(-25, p.z - 40 - Math.random() * 20), st: 0, t: 0, tg: 0, aim: 0 };
    for (const q of el) send(q.ws, { t: 'omspawn' });
  }
  let best = null, bd = 160;
  for (const q of el) { const d = Math.hypot(q.x - OM.x, q.z - OM.z); if (d < bd) { bd = d; best = q; } }
  OM.tg = best ? best.id : 0; OM.t -= dt;
  if (OM.st === 0) {
    if (best && bd > 14) { const k = Math.min(bd, 6.5 * dt); OM.x += (best.x - OM.x) / bd * k; OM.z += (best.z - OM.z) / bd * k; OM.z = Math.min(OM.z, -1.5); }
    if (best && bd < 26 && OM.t <= 0) { OM.st = 1; OM.t = 0.8; OM.aim = best.id; send(best.ws, { t: 'omaim' }); }
  } else if (OM.t <= 0) {
    OM.st = 0; OM.t = 2.3;
    const q = byId(OM.aim), hit = !!(q && omCan(q) && Math.hypot(q.x - OM.x, q.z - OM.z) < 28 && Math.random() < 0.35);
    for (const w of players.values()) if (w.pid && Math.hypot(w.x - OM.x, w.z - OM.z) < 150) send(w.ws, { t: 'omshot', hit: w === q ? (hit ? 1 : 0) : -1 });
    OM.aim = 0;
  }
}
setInterval(() => omTick(0.1), 100);
setInterval(() => {
  const om = OM ? [r2(OM.x), r2(OM.z), OM.st, OM.tg] : null;
  if (players.size < 2) { if (om) for (const w of wss.clients) send(w, { t: 'om', o: om }); return; }
  const snap = [...players.values()].filter(p => p.pid).map(p => [p.id, r2(p.x), r2(p.z), r2(p.h), p.w, p.v, p.st, p.r || 0, p.dk ? r2(p.dk[0]) : 0, p.dk ? r2(p.dk[1]) : 0, p.dk ? 1 : 0, p.hb == null ? -1 : p.hb, p.ho || 0]);
  for (const w of wss.clients) send(w, { t: 'snap', p: snap, om });
}, 100);
setInterval(() => { for (const w of wss.clients) if (w.readyState === 1) w.ping(); }, 30000); // keep free hosts from dropping idle sockets
// the server's clock is the game clock: time of day and tides are worked out from it, so everyone matches
setInterval(() => all({ t: 'clock', now: Date.now() }), 30000);
setInterval(() => { const now = Date.now(); for (const [k, v] of cd) if (v < now) cd.delete(k); }, 60000);

async function flushAll() {
  if (SAVE_MODE === 'upstash') await Promise.all(Object.keys(acctTimers).map(k => (clearTimeout(acctTimers[k]), kvSet('acct:' + k, accounts[k], 2))));
  else try { fs.writeFileSync(FILE, JSON.stringify({ land, board, accounts, ponds })); } catch (e) {}
  if (SAVE_MODE === 'upstash') await kvSet('ponds', ponds, 2);
}
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { flushAll().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 4000); });
load().then(() => srv.listen(PORT, () => console.log('Sea Drive running on port ' + PORT)));
