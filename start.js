// Starts the game server, whatever the browser named it when you downloaded it
// (server.js, "server (1).js", "server (2).js"...). Picks the newest one if there are several.
const fs = require('fs'), path = require('path');
const found = fs.readdirSync(__dirname).filter(n => /^server.*\.js$/i.test(n))
  .map(n => ({ n, t: fs.statSync(path.join(__dirname, n)).mtimeMs, size: fs.statSync(path.join(__dirname, n)).size }))
  .filter(f => f.size > 1000);
if (!found.length) { console.error('Could not find server.js - upload it next to package.json'); process.exit(1); }
// prefer the biggest (newest version is the largest), then the newest file
found.sort((a, b) => b.size - a.size || b.t - a.t);
console.log('Starting ' + found[0].n);
require(path.join(__dirname, found[0].n));
