# Sea Drive multiplayer (free setup)

What's in here
- public/index.html : the game (same as the one in Claude, plus the online bits)
- server.js         : tiny Node server. Serves the game, shows other players, owns the land blocks
- package.json      : two dependencies: ws (multiplayer) and three (the real 3D graphics). Render installs them for you.

The Claude page can't connect to your server, so people play from YOUR server's web address instead.

## Latest changes
- ONE old man for the whole server. At night he chases whoever on land is closest to him; if they get away and
  someone else is closer, he goes after them. He can't get you in your house, up the tower, in the mine or in the sea.
- Ponds:
  - The owner gets a flashing warning when someone is in their pond, and a banner when a thief casts into it.
  - Thieves have to CAST like normal fishing: tap when the bar is in the green, wait for the bite, STRIKE, then REEL fast.
    It takes time, so the owner can run over and grab them.
  - Fence upgrades (in your pond menu): Picket Fence $500K, Stone Wall $2.5M, Iron Gates $10M. Each one makes the
    boundary bigger - anyone inside it can be grabbed.
  - Ponds are real water: walk in and you swim. Walk into your own pond and the menu opens to put fish in.
- The sea is now a valley: huge mountains down both sides (you can't drive or walk through them). The cones at the
  far end of your zone are the same as before. The island you could drive through is gone.
- Display slots only show fish that are in your esky right now.
- No bots - the only people are real players (and Bevans and the old man).
- Refreshing the page puts you back where you were (on the beach, on your boat out at sea, etc).

## Graphics: back to the original retro pixel look
- Exactly the old retro style again: real 320x180 pixels scaled up sharp, the pixel font, dithered sky,
  sea, sand and grass, pixel sun, mountains, palms, people, fish and the chunky retro buttons and menus.
- Everything new still works in it: forests across the map, people everywhere, V-shaped boat wakes,
  boats cruising out at sea, the 4 new boats, pond fish, dolphins, golden coconut, bottles and the gold mine.
- The old man can't shoot you inside your house, up the lookout tower, or down the mine.
- Pictures are drawn at double detail (640x360) but still in the chunky retro pixel style.
- Menus (rusty bolt, bag, shops) scroll all the way to the bottom, and you can tap outside a menu to close it.
- The GRAPHICS button in your bag can still switch on the 3D styles if anyone wants them.

## What's new in this version (real people, glassy water, secrets, 4 new boats)
- Real 3D people: smooth bodies with faces (eyes, brows, nose, ears), hair, clothes, shoes, hats and sunglasses.
  They walk, run, swim, sit, fish, drive and lie on towels. You and your friends each get your own look.
- People all over the map: beach walkers, sunbathers under umbrellas, swimmers, fishermen on the jetty,
  people around the campfire, hikers in the woods, shoppers on the market path, and boats cruising out at sea.
- Glassy water like Wake Legends: the sea is a mirror that reflects the sky, islands, boats and trees,
  with bigger wakes behind fast boats.
- Much finer trees: leafy jungle trees, palms with real fronds, pines and bushes painted with detailed leaves.
- Pond fish are the exact fish you caught (the same pictures as your fish book), swimming under the water.
- New boats after the yacht: SUPERYACHT ($150M, 8 friends), CRUISE SHIP ($350M, 20 friends),
  JET BOAT ($600M, 3 friends) and the OLD FISHING BOAT ($1B) - the fastest boat of all, but only 2 friends fit.
- Secrets (Easter eggs) - no spoilers... but messages in bottles wash up on the beach and give hints.

## Earlier: real 3D, boat wakes, forests, ponds
- Real 3D graphics (three.js): a proper sky with moving clouds, sun and stars, a lit 3D beach and land,
  hills and headlands, shadows, and a real ocean with waves, sun glints and foam on the shoreline.
- Boat wakes: every boat (yours, your friends', Bevans') cuts a V-shaped wake with white foam behind it,
  bigger and wider the faster and bigger the boat is.
- Forest everywhere: palms, jungle trees, pines on the hills and bushes across the whole map, not just a line of bushes.
- If someone's computer or phone is too slow the game lowers the 3D quality by itself. You can also switch
  between REAL 3D and CLASSIC graphics in your bag (the button above CLOSE).
- PONDS: 10 pond plots behind the houses. Buy one for $1,000,000 (one each). Walk in through the gap in the fence:
  - STOCK YOUR POND: put fish from your esky in (up to 20). Each fish grows to 3x its value over 3 days.
  - FISH YOUR POND: take a fish back out (it keeps its grown value).
  - Anyone else can sneak in and SNEAK-FISH your pond, even while you're offline (you're told who did it when you log in).
  - If you're there and a thief is inside your fence, a GRAB button appears. Grab them and you take HALF THEIR MONEY.
  - The big sign at the front of every pond shows the owner and their top 5 fish (live values).
  - Ponds and their fish are saved in Upstash, like the land.
- Updating on Render: upload the new index.html, server.js AND package.json (package.json changed - it now needs three).

## 1. Try it on your own computer (2 minutes)
1. Install Node.js (nodejs.org, the LTS version).
2. Open a terminal in this folder and run:
       npm install
       npm start
3. Open http://localhost:3000 in two browser tabs. You'll see each other.
   Friends on the same wifi can use http://YOUR-COMPUTER-IP:3000

## 2. Put it online for free (Render.com)
1. Make a free GitHub account, create a new repository, and upload everything in this folder
   (github.com > New repository > "uploading an existing file"). Don't upload node_modules.
2. Make a free account at render.com and click New > Web Service > connect that repository.
3. Use these settings:
       Runtime: Node
       Build command: npm install
       Start command: npm start
       Instance type: Free
4. Click Deploy. In a minute or two you get an address like https://sea-drive.onrender.com
   Send that link to your friends. That's it.

Free tier notes
- It goes to sleep after about 15 minutes with nobody on it. The next visitor waits ~1 minute for it to wake.
- Render's free disk is wiped when it sleeps or redeploys, so land blocks would be forgotten.
  Fix (also free): keep the land in Upstash Redis.
  1. Make a free database at upstash.com (Redis).
  2. Copy its REST URL and REST token.
  3. In Render > your service > Environment, add:
         UPSTASH_REDIS_REST_URL   = (the REST URL)
         UPSTASH_REDIS_REST_TOKEN = (the REST token)
  4. Redeploy. Land ownership now survives sleeping.

## How it works (so you know what to expect)
ACCOUNTS
- Everyone logs in with a username and password. A new name makes a new account. Logging in again with the
  same name and password (on any device) brings back all progress: money, zones, vessel, rods, line, sounder,
  bait, esky, fish book, level, trophies and daily-reward streak.
- Passwords are never stored, only a scrambled hash (scrypt). 5 wrong tries = 30 s wait; 10 on one account
  locks it for a minute. Logging in somewhere else kicks the older session.
- With Upstash set up, each account is saved as its own key ("acct:NAME"), so nothing is lost when Render sleeps.
  WITHOUT Upstash, Render's free disk is wiped when it sleeps - so set up Upstash or accounts will reset.
- Progress is still worked out in each player's browser and sent to the server, so a very tech-savvy player
  could edit their own save. Fine for friends.

ZONES AND FISH (each zone's fish is worth about 6x the last)
   1  THE SHALLOWS        0 - 500 m      FLATHEAD
   2  SNAPPER REEF      500 - 1000 m     SNAPPER              unlock $25,000
   3  KINGFISH PINNACLE 1000 - 2000 m    KINGFISH             unlock $150,000
   4  QUEENFISH FLATS   2000 - 3000 m    QUEENFISH            unlock $900,000
   5  COBIA CANYON      3000 - 4000 m    COBIA                unlock $5.4 million
   6  MACKEREL ALLEY    4000 - 5000 m    SPANISH MACKEREL     unlock $32 million
   7  SHARK TRENCH      5000 - 6000 m    TIGER SHARK          unlock $190 million
   8  THE LOST REEF     6000 - 7000 m    EXTINCT CORAL TROUT  unlock $1.2 billion
   9  PREHISTORIC DEEP  7000 - 8000 m    DINOSAUR FISH        unlock $7 billion
  10  THE ABYSS         8000 - 9000 m    GIANT SQUID          unlock $42 billion
  11  KRAKEN'S MAW      9000 - 10000 m   THE KRAKEN           unlock $250 billion
  Tuna busts still pop up anywhere.

FISHING IS HARDER
- Fish swim around their spot. Casting at an empty patch of water almost never works - land the lure right
  on a fish. Without a sounder, watch for surface swirls in the top view.
- There is one rod per zone (11 rods, up to the KRAKEN SLAYER). A fish from a zone above your rod is almost
  impossible to land. The right rod still makes you fight hard: the Kraken needs about 8 taps a second for
  close to a minute, even with the best rod and line. The FISH bar on the right shows how tired it is.
- Line strength matters too (8 lines, up to 130 kg Kraken Cable): weak line snaps on big fish.
- The sounder only updates every 1.2-1.8 s, so marks are where the fish WAS - lead your cast. Each sounder
  only sees fish up to a certain zone; Giant Squid and the Kraken never show clearly, at best a flickering "?".

EXTRAS
- Levels and XP (bar along the bottom), with cash rewards on level-up.
- 25 trophies, a fish book with every species (silhouettes until you catch one), rarity on every catch
  (COMMON to MYTHIC), zone title cards, darker and stranger water the further out you go, rain and
  thunderstorms (same weather for everyone), boss fights for the Giant Squid and Kraken.
- Prices went up a lot: vessels, bait, jerry cans, fuel and land are 10x more (land was $2.5 million - houses are now $250K),
  but fish are worth far more too.

NEW IN THIS VERSION
- Same fish for everyone: fish positions run off the server clock, tuna busts are shared, and a fish someone
  hooks disappears for everyone.
- Cast, then you're straight into reeling in and waiting for the bite (like the original). Reaction times are
  600 ms for small fish, down to 300 ms for monsters; the Kraken is 290 ms.
- Tuna roam the deep as well as busts, but only bite METAL lures, and metal lures catch nothing else.
- The Kraken cruises at about 12 kn and shows on the MK4 sounder for about 3 seconds every so often.
- Drag button during a fight: LOCKED reels faster but piles on line tension and can tow a paddleboard or kayak.
- Netting: when the fish reaches you, tap while it's in the green. A mate on your boat gets a bigger net window.
- Better rod: guides, cork grip, reel, bending blank and your hands cranking it.
- Trolling: TROLL button on any boat. The lure drags 28 m behind while someone drives; hook up and reel.
- Passengers: walk up to a tinny, boat or yacht and tap BOARD. Seats: tinny 1, boat 3, yacht 6.
  EXPLORE BOAT lets you walk the deck (the driver only when stopped; passengers any time).
- Health bar. Sleep in the bed in your house to heal (time keeps running).
- Strong current days push you around - buy an ANCHOR ($25,000) and drop it.
- (Big wave days have been removed.) Sharks attack swimmers past 20 m: tap within 400 ms or you wake up in your house.
- Rock wall 70 m out to sea, left of the start. Walk out on it and fish; it's always surrounded by fish.
- Boxing arena behind the leaderboard. Stand in the ring, tap CHALLENGE and pick the bet. Each punch takes 12%;
  the loser pays the bet and wakes up in their bed (or on the beach).
- Any vessel can ram any other, and you can run over swimmers.
- The rusty bolt button (top right) switches between every rod and vessel you own.
- Leaderboard ranks fish by value. Chat bubbles fade after 10 seconds.

LATEST CHANGES
- No more teleporting to the market. A big FISH MARKET sign stands on the beach; follow the footpath behind
  the houses to the market building and walk through the door to sell fish and use the gear shop.
- Jetty shop: a small jetty with a repair hut on the beach, right of the start. Pull your boat up to it (or walk
  to the hut) for repairs (60% of the boat's price for a full repair), boat insurance (30% of the price, one
  claim) and fuel. Boats no longer repair themselves for free.
- If someone destroys your boat you go back to the start and lose ONLY that boat (insurance saves it).
  Money, land, gear, fish and everything else stay. Buy the boat again in the gear shop.
- Esky upgrades in the gear shop: 3 fish to start, then 5 ($10,000), 10 ($75,000), 25 ($500,000), 50 ($5 million).
  Players from before keep their 5-fish esky.
- Daily rewards removed. Tap outside the rusty bolt menu (or press Escape) to close it.
- Sharper picture: on most computer screens each game pixel is now exactly 3 (or 6) screen pixels.

ESKY ON THE BOAT
- Tinny, boat and yacht have an esky on the deck. Tap EXPLORE BOAT, walk up to it and tap OPEN ESKY.
- Passengers can open the driver's esky and STEAL fish, then jump off and sell them at the market.
  The driver gets a "THIEF!" alert. Keep an eye on who you pick up!
- Picking people up: stop close to someone on the beach, jetty, rock wall or in the water - they tap BOARD.

VOICE CHAT
- Proximity voice: people sound louder the closer they are and fade out by 60 m. Everyone on the same boat
  hears each other clearly. A green speaker icon shows over people who are talking.
- Mic button (top right): tap to switch between HOLD V (push to talk - hold V or hold the button),
  OPEN MIC and OFF. Your browser asks for microphone permission the first time.
- Audio goes straight between players (WebRTC); the server only introduces them, so it costs nothing extra.
  Works best with up to about 8 people talking. On some school/work wifi the connection can be blocked.
- If a friend on strict wifi or phone data still can't hear/be heard, add a free TURN relay (for example from
  metered.ca or Cloudflare Calls). In Render > Environment add:
      TURN_URL       = turn:your-relay-address:3478   (several can be comma separated)
      TURN_USERNAME  = (from the relay provider)
      TURN_PASSWORD  = (from the relay provider)
  then redeploy. Voice only uses the relay when a direct connection fails.

FISH SHOWING THEMSELVES
- Each zone's fish jump out of the water around you, sharks cruise past with their fins out, and giant
  squid and Kraken tentacles rise out of the water. The zone title card says what that zone's fish are worth.
- Boats show red and green navigation lights and a white mast light at night.

PLAYER LIST
- Hold TAB (or tap PLAYERS under the game) to see everyone online: their name, colour, what they're doing
  and how far away they are.

FILE NAMES DON'T MATTER ANY MORE
- start.js finds the server even if your browser saved it as "server (1).js", and the server finds the game
  whether it's public/index.html, index.html or "index (1).html". Keep package.json called package.json.

SAVING - IMPORTANT
- Accounts are only safe if Upstash is set up. In Render > your service > Environment you need:
      UPSTASH_REDIS_REST_URL    = the REST URL from Upstash, starting with https://
      UPSTASH_REDIS_REST_TOKEN  = the REST token (NOT the read-only token)
- Check Render's log after a deploy. It says either
      "Saving accounts to Upstash - progress is safe."   (good)
  or a line starting with "!!!" explaining what's wrong.
- Without it, Render wipes every account when it goes to sleep, which also frees up the name for anyone.
  The game now also keeps a backup of your progress on each device, and warns players in-game if the
  server has no save database.

DAY AND NIGHT
- 20 minutes of day, then 5 minutes of night.
- At night an OLD MAN WITH A SHOTGUN hunts anyone on land. Two shots kill you. He aims first (red screen),
  so run! You're only safe inside your house. Walk up to your house with a friend and tap INVITE to let
  them in.
- Sharks feed at night too: they come closer to shore, attack more often and you get 330 ms to punch.
- Dying (shot or starving) costs HALF your money - never everything.

FOOD
- The FOOD bar slowly empties (about 25 minutes from full). When it hits zero you start losing health,
  you can't heal, and sleeping won't work.
- Cook at the CAMPFIRE near the start, in your house's KITCHEN, or on the BBQ up the lookout tower.
  Tap COOK, pick a fish from your esky, it sizzles for 6 seconds, then tap EAT.
  Cooked fish are kept (up to 5) - tap EAT COOKED FISH any time. Pricier fish fill you up more.

3D
- Houses, the market, the jetty hut and posts, and every boat are now real 3D shapes with sunlight,
  shadows and night shading. House and market windows glow at night. New kayak design.

BIG UPDATE - MODERN LOOK + NEW FEATURES (NEW)
- Modern graphics: the game now draws at your screen's real resolution (no more chunky pixels),
  with smooth gradient skies, soft 3D clouds, glowing sun and sunsets, smooth turquoise-to-deep-blue
  water with sky reflections and sun glints, smooth sand and foam, new palms, bushes, rocks, campfire,
  people, detailed fish, and a modern font, HUD and menus with animations. Your own boat is now a 3D
  model (the camera sits further back and higher on bigger boats). If a device is slow, the game
  automatically lowers the resolution a little to stay smooth.
- Smoother movement: walking speeds up and slows down smoothly, turning is smooth.
  Hold SHIFT (or tap RUN on touch screens) to run.
- ENERGY replaces food. It drains while you play, faster when running. Below 15% you walk slower,
  at 0% you can't run. Sleep (house bed or yacht cabin), rest on the tower couches, or eat cooked fish.
- Yacht (and boat) deck: a GALLEY to cook fish (every fish becomes its own meal) and a cabin BED.
  Sleeping fades to black, the clock fast-forwards 8 hours and you wake at 100% energy and health.
  (The world clock is shared by everyone online, so sleeping skips the night for you only visually -
  it can't move the clock for other players.)
- BEVANS: a rare travelling merchant. Every 60 seconds you're on your boat there's a 2% chance he
  pulls up nearby. He stays 5 minutes (countdown shown) and sells 5 Caffeine Pouches for $1,000,000
  (one purchase per visit). A pouch gives +35% energy, 75% less energy drain and +30% speed for 3 min.
- YOUR BAG (bag button or B): use items, and fill 3 DISPLAY SLOTS. Press 1, 2 or 3 (or tap a slot on
  the right) to hold that item up. Fish show name, weight, rarity, variant, value and multiplier above
  you - and other players see it too.
- FISH VARIANTS when you catch a fish: SILVER 25% (x1.1), GOLD 10% (x1.25), SHINY 5% (x1.5),
  RAINBOW 1.5% (x2). Every fish's base price is 20% lower, then the variant multiplier applies.
  Variants are saved with the fish, show in your esky / market / bag, and survive being stolen.
- TROLLING: when a fish bites the trolling line you get exactly 2 seconds to click/tap/space,
  with a big countdown ring. Miss it and it gets away.
- OLD MAN: only hits 35% of his shots on land, and never hits you in the water.
- GEAR SHOP: SELF-USE JERRY CAN $100,000 - adds 30% fuel to your own tank (use it from your bag,
  or the button that appears when your fuel is low). Can't be used on a full tank.
- IMPORTANT: this update changes BOTH public/index.html AND server.js - upload both.

BEACH LOOK
- The whole game was repainted to look like a tropical beach: deep blue sky, big puffy clouds, green
  jungle hills, turquoise shallows fading to deep blue, reefs, foamy surf, soft sand with palm shadows,
  new palms, bushes and rocks. Nicer player, campfire and house inside.
- HOUSES COST $250K.
- The megalodon is gone.

LOOKOUT TOWER (NEW)
- Big wooden tower with a thatched roof right near the start (left of the campfire).
- Walk to the ladder and tap CLIMB THE TOWER. Walk around up there, SIT DOWN on the couches,
  cook on the BBQ and tap LOOK OUT TO SEA for the view (left / right to turn).
- Friends who climb up show up next to you, and people on the ground can see you up there.
- At night the tower is safe from the old man.

STILL THE SAME
- One beachfront block per player (shows while you're online), ramming, endurance, fuel and jerry cans,
  punching (F), chat (T), day/night, tides, baits, size limits, sound (speaker button).
- Death still loses everything except your fish book, level and trophies.
