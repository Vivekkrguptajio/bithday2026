// Custom server: Next.js + Socket.io on the same port.
// Roles (enforced HERE, not in the browser):
//   admin  - Vivek: everything + moderation tools + starts the games
//   girl   - Manisha: candles, cake cutting, wish rain, opening gifts, twirl
//   guest  - friends: walk, chat, emotes, eat, balloons, games, send gifts and wishes
const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');
const cfg = require('./party.config');
const store = require('./store');
const createGames = require('./games');
const createGifts = require('./gifts');

// "12 baje" must mean 12 baje in INDIA. Cloud servers (Render etc.) run in UTC, which would start the celebration at 5:30 AM IST.
// Override with TZ=... in .env if the party is somewhere else.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const dev = process.argv.includes('--dev');
const port = parseInt(process.env.PORT || '3000', 10);
// No fixed party limit by default. Set MAX_PLAYERS=<n> in the environment to cap it.
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS || '0', 10) || Infinity;
const BX = 15;
const BZ = 13.6;
const BALLOON_COUNT = 14;
const STALL_COUNT = 8;
const ANIMS = ['idle', 'walk', 'wave', 'dance', 'jump', 'eat', 'twirl', 'ride', 'sit'];
// "Masti Duniya" (fun fair + beach) is a second world, reached through a gate at each end.
const FUN_B = 44; // walkable half-size of the fun world
const HALL_GATE = { x: -12, z: 13.2 }; // stand here to use the hall's gate
const HALL_BACK = { x: -12, z: 11.2 }; // where you appear when you come back
const FUN_GATE = { x: 0, z: 18.4 };
const FUN_SPAWN = { x: 0, z: 15 };
const REACTIONS = ['❤️', '😂', '👏', '🔥'];

// The codes live in .env (loaded by party.config.js). Refuse to start without them, so nobody can walk in as Admin.
if (!cfg.ADMIN_CODE || !cfg.GIRL_CODE) {
  console.error('\n❌ .env file mein ADMIN_CODE aur GIRL_CODE nahi mile.');
  console.error('   party3d/.env banao (example: .env.example dekho) aur dono secret codes likho, phir server dobara chalao.\n');
  process.exit(1);
}

const app = next({ dev });
const handle = app.getRequestHandler();

const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
const num = (v, lim) => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
const reserved = (n) => /manisha|admin/i.test(n);

app.prepare().then(async () => {
  const server = createServer((req, res) => handle(req, res));
  // 1 MB: enough for a compressed photo in a gift.
  const io = new Server(server, { maxHttpBufferSize: 1e6 });

  const players = new Map();
  const popped = new Set();
  let candlesLit = true;
  let mutedAll = false;
  let relightTimer = null;
  const dirty = new Set();
  // The mela's games: best score per game and player (kept in memory), and the prizes that can be "bought" with tickets.
  const MELA_MAX = { balloon: 90, mole: 40, striker: 100, memory: 56 };
  const MELA_ITEMS = { balloon: '🎈 Gubbara', choco: '🍫 Chocolate', letter: '💌 Love Letter', rose: '🌹 Gulab', teddy: '🧸 Teddy Bear', bouquet: '💐 Bouquet', ring: '💍 Ring' };
  const melaBest = {};
  const melaBoards = () => {
    const out = {};
    for (const g of Object.keys(MELA_MAX)) out[g] = Object.values(melaBest[g] || {}).sort((a, b) => b.score - a.score).slice(0, 5);
    return out;
  };
  const games = createGames(io, players);
  const gifts = await createGifts(io, store);

  /* ---------------- guest list: everybody who ever joined (shown on the wall) ---------------- */
  let guestbook = (await store.get('guests')) || [];
  let guestSave = null;
  const guestPub = () => guestbook.map((g) => ({ name: g.name, role: g.role }));
  function addGuest(p) {
    const key = p.name.toLowerCase();
    const found = guestbook.find((g) => g.key === key);
    if (found) { if (p.role !== 'guest') found.role = p.role; }
    else if (guestbook.length < 300) guestbook.push({ key, name: p.name, role: p.role });
    else return;
    clearTimeout(guestSave);
    guestSave = setTimeout(() => store.set('guests', guestbook), 400);
    io.emit('guests', guestPub());
  }

  /* ---------------- midnight celebration (automatic, 5 minutes) ---------------- */
  const CELEB_MS = (cfg.CELEBRATION_MINUTES || 5) * 60000;
  function scheduleWindow(now) {
    if (cfg.CELEBRATION_AT) {
      const t = new Date(cfg.CELEBRATION_AT).getTime();
      if (!Number.isNaN(t)) return t;
    }
    const b = cfg.BIRTHDAY || { month: 11, day: 3, hour: 0, minute: 0 };
    const y = new Date(now).getFullYear();
    let t = new Date(y, b.month - 1, b.day, b.hour || 0, b.minute || 0, 0).getTime();
    if (t + CELEB_MS <= now) t = new Date(y + 1, b.month - 1, b.day, b.hour || 0, b.minute || 0, 0).getTime();
    return t;
  }
  let sched = scheduleWindow(Date.now()); // start of the automatic celebration
  let manualEnd = 0; // Admin started one by hand
  let skipWindow = 0; // the scheduled window the Admin stopped early
  const inSched = (now) => sched !== skipWindow && now >= sched && now < sched + CELEB_MS;
  const celebActive = (now = Date.now()) => now < manualEnd || inSched(now);
  const celebState = () => {
    const now = Date.now();
    const act = celebActive(now);
    return {
      active: act,
      endsAt: act ? Math.max(now < manualEnd ? manualEnd : 0, inSched(now) ? sched + CELEB_MS : 0) : 0,
      nextAt: now < sched ? sched : 0,
      serverNow: now,
    };
  };
  let wasActive = celebActive();
  setInterval(() => {
    const act = celebActive();
    if (act !== wasActive) { wasActive = act; io.emit('celebration', celebState()); }
    if (!cfg.CELEBRATION_AT && Date.now() >= sched + CELEB_MS) sched = scheduleWindow(Date.now());
  }, 1000);

  const pub = (p) => ({ id: p.id, name: p.name, color: p.color, role: p.role, world: p.world, muted: p.muted, out: !!p.out, x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim });
  const deny = (socket, msg) => socket.emit('denied', msg);

  // Hot-air balloon: whoever is in the basket steers it. The server moves it so everybody sees the same balloon.
  const BAL_HOME = { x: 14, z: -36 }, BAL_GROUND = 0.35, BAL_TOP = 19, BAL_R = 30;
  const balloon = { x: BAL_HOME.x, y: BAL_GROUND, z: BAL_HOME.z, vx: 0, vy: 0, vz: 0, riders: new Map() };
  const balloonOnGround = () => balloon.y < BAL_GROUND + 0.9 && Math.hypot(balloon.x - BAL_HOME.x, balloon.z - BAL_HOME.z) < 3.5;
  const balloonDrop = (id) => { if (balloon.riders.delete(id)) io.emit('balloon', { x: balloon.x, y: balloon.y, z: balloon.z, n: balloon.riders.size }); };
  let balloonSent = '';
  setInterval(() => {
    const dt = 0.05, nowMs = Date.now();
    let ix = 0, iz = 0, iy = 0, n = 0;
    for (const [id, r] of balloon.riders) {
      const p = players.get(id);
      if (!p || p.world !== 'fun') { balloon.riders.delete(id); continue; }
      if (nowMs - r.ts < 700) { ix += r.x; iz += r.z; iy += r.y; n++; } // stale input = hands off the controls
    }
    const riders = balloon.riders.size;
    if (riders && n) {
      const c = (v) => Math.max(-1, Math.min(1, v));
      // momentum: it speeds up and slows down smoothly instead of jerking
      const a = Math.min(1, dt * 4.5);
      balloon.vx += (c(ix) * 9 - balloon.vx) * a; balloon.vz += (c(iz) * 9 - balloon.vz) * a; balloon.vy += (c(iy) * 5.5 - balloon.vy) * a;
      balloon.x += balloon.vx * dt; balloon.z += balloon.vz * dt; balloon.y += balloon.vy * dt;
    } else if (riders) {
      const a = Math.min(1, dt * 3); // hands off the controls: it drifts to a stop and hovers
      balloon.vx -= balloon.vx * a; balloon.vz -= balloon.vz * a; balloon.vy -= balloon.vy * a;
      balloon.x += balloon.vx * dt; balloon.z += balloon.vz * dt; balloon.y += balloon.vy * dt;
    } else {
      balloon.vx = balloon.vy = balloon.vz = 0;
      // empty balloon: float back home and land by itself
      const dx = BAL_HOME.x - balloon.x, dz = BAL_HOME.z - balloon.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const m = Math.min(d, 4 * dt); balloon.x += (dx / d) * m; balloon.z += (dz / d) * m; }
      else { balloon.x = BAL_HOME.x; balloon.z = BAL_HOME.z; }
      balloon.y = Math.max(BAL_GROUND, balloon.y - 2.2 * dt);
    }
    const ox = balloon.x - BAL_HOME.x, oz = balloon.z - BAL_HOME.z, od = Math.hypot(ox, oz);
    if (od > BAL_R) { balloon.x = BAL_HOME.x + (ox / od) * BAL_R; balloon.z = BAL_HOME.z + (oz / od) * BAL_R; }
    balloon.y = Math.max(BAL_GROUND, Math.min(BAL_TOP, balloon.y));
    const snap = JSON.stringify([balloon.x.toFixed(2), balloon.y.toFixed(2), balloon.z.toFixed(2), riders]);
    if (snap !== balloonSent) { balloonSent = snap; io.emit('balloon', { x: balloon.x, y: balloon.y, z: balloon.z, n: riders }); }
  }, 50);

  io.on('connection', (socket) => {
    socket.emit('balloon', { x: balloon.x, y: balloon.y, z: balloon.z, n: balloon.riders.size });
    const last = {};
    const cooldown = (key, ms) => {
      const now = Date.now();
      if (last[key] && now - last[key] < ms) return false;
      last[key] = now;
      return true;
    };
    // Like cooldown(), but returns the seconds still to wait (0 = go ahead) so the player can be told.
    const cooldownLeft = (key, ms) => {
      const now = Date.now();
      const rem = last[key] ? ms - (now - last[key]) : 0;
      if (rem > 0) return Math.ceil(rem / 1000);
      last[key] = now;
      return 0;
    };
    let codeTries = 0;
    const me = () => players.get(socket.id);
    const can = (...roles) => { const p = me(); return !!p && roles.includes(p.role); };

    socket.on('join', (data, ack) => {
      if (typeof ack !== 'function') return;
      if (players.has(socket.id)) return ack({ ok: false, error: 'Already joined' });
      if (players.size >= MAX_PLAYERS) return ack({ ok: false, error: `Room full (${MAX_PLAYERS}). Thodi der baad try karo.` });

      const code = String((data && data.code) || '').trim();
      let role = 'guest';
      if (code) {
        if (++codeTries > 5) { ack({ ok: false, error: 'Bahut galat koshishen.' }); return socket.disconnect(true); }
        if (code === cfg.ADMIN_CODE) role = 'admin';
        else if (code === cfg.GIRL_CODE) role = 'girl';
        else return ack({ ok: false, error: 'Galat special code.' });
      }

      let name = clean(data && data.name, 16);
      if (role === 'girl') {
        if ([...players.values()].some((p) => p.role === 'girl')) {
          return ack({ ok: false, error: 'Birthday girl pehle se room mein hai. Kuch second baad try karo.' });
        }
        name = cfg.GIRL_NAME;
      } else if (role === 'admin') {
        name = name || cfg.ADMIN_NAME;
      } else {
        if (!name) return ack({ ok: false, error: 'Pehle apna naam likho ✍️' });
        if (reserved(name)) return ack({ ok: false, error: 'Ye naam reserved hai. Koi aur naam chuno.' });
      }

      const angle = Math.random() * Math.PI * 2;
      const p = {
        id: socket.id, name, role, world: 'hall', out: false,
        color: role === 'girl' ? '#ff5fa2' : /^#[0-9a-f]{6}$/i.test(data && data.color) ? data.color : '#ff4f9a',
        muted: role === 'guest' && mutedAll,
        x: role === 'girl' ? 0 : Math.cos(angle) * 5, y: 0, z: role === 'girl' ? -1.8 : 3 + Math.sin(angle) * 3,
        ry: Math.PI, anim: 'idle',
      };
      players.set(socket.id, p);
      addGuest(p);
      ack({
        ok: true, id: p.id, me: pub(p), players: [...players.values()].map(pub),
        candlesLit, popped: [...popped], userGifts: gifts.snapshot(), guests: guestPub(), celebration: celebState(),
        ...games.snapshot(),
        melaboard: melaBoards(),
      });
      socket.broadcast.emit('joined', pub(p));
      io.emit('count', players.size);
    });

    socket.on('move', (s) => {
      const p = me();
      if (!p || !s) return;
      if ((s.w || 'hall') !== p.world) return; // a move sent from the other world (we just switched): ignore
      const fun = p.world === 'fun';
      p.x = num(s.x, fun ? FUN_B : BX); p.z = num(s.z, fun ? FUN_B : BZ); p.y = Math.max(0, num(s.y, fun ? 40 : 3));
      p.ry = num(s.ry, 10);
      let anim = ANIMS.includes(s.anim) ? s.anim : 'idle';
      if (anim === 'twirl' && p.role !== 'girl') anim = 'idle'; // twirl is Manisha's move
      p.anim = anim;
      dirty.add(p.id);
      if (!fun) games.onMove(p);
    });

    // the rides run on the clock: every player asks for the server's time so all of them agree on where a ride is
    socket.on('timesync', (ack) => { if (typeof ack === 'function') ack(Date.now()); });

    // balloon: hop in (only while it sits on the ground, at most 2 in the basket), steer with the controls, hop out
    socket.on('balloonjoin', (ack) => {
      const p = me();
      const reply = (r) => { if (typeof ack === 'function') ack(r); };
      if (!p || p.world !== 'fun') return reply({ ok: false });
      if (balloon.riders.has(p.id)) return reply({ ok: true, x: balloon.x, y: balloon.y, z: balloon.z, seat: balloon.riders.get(p.id).seat });
      if (!balloonOnGround()) return reply({ ok: false, why: 'air' });
      if (balloon.riders.size >= 2) return reply({ ok: false, why: 'full' });
      if (Math.hypot(p.x - BAL_HOME.x, p.z - (BAL_HOME.z + 4.2)) > 7) return reply({ ok: false, why: 'far' });
      const taken = [...balloon.riders.values()].map((r) => r.seat);
      const seat = taken.includes(0) ? 1 : 0;
      balloon.riders.set(p.id, { x: 0, z: 0, y: 0, ts: 0, seat });
      reply({ ok: true, x: balloon.x, y: balloon.y, z: balloon.z, seat });
    });
    socket.on('balloonin', (d) => {
      const r = balloon.riders.get(socket.id);
      if (!r || !d) return;
      const c = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
      r.x = c(d.x); r.z = c(d.z); r.y = c(d.y); r.ts = Date.now();
    });
    socket.on('balloonleave', () => balloonDrop(socket.id));

    // mela: a finished game, and a prize bought with tickets
    socket.on('melascore', (d) => {
      const p = me();
      if (!p || p.world !== 'fun' || !d || !Object.hasOwn(MELA_MAX, d.game)) return;
      const score = Math.floor(Number(d.score));
      if (!(score >= 0 && score <= MELA_MAX[d.game]) || !cooldown('mela:' + d.game, 8000)) return;
      const g = (melaBest[d.game] = melaBest[d.game] || {});
      const key = p.name.toLowerCase();
      const best = !g[key] || score > g[key].score;
      if (best) g[key] = { name: p.name, score };
      io.emit('melaresult', { name: p.name, game: d.game, score, best });
      io.emit('melaboard', melaBoards());
    });
    socket.on('melagift', (d) => {
      const p = me();
      if (!p || p.world !== 'fun' || !d || !Object.hasOwn(MELA_ITEMS, d.item) || !cooldown('melagift', 1500)) return;
      io.emit('melagift', { id: p.id, name: p.name, item: d.item, label: MELA_ITEMS[d.item] });
    });

    // through the gate: hall <-> Masti Duniya
    socket.on('goto', (to) => {
      const p = me();
      if (!p || !cooldown('goto', 1500)) return;
      if (to === 'fun' && p.world === 'hall') {
        if (Math.hypot(p.x - HALL_GATE.x, p.z - HALL_GATE.z) > 4.2) return deny(socket, 'Gate ke paas jao, phir E dabao 🌈');
        p.world = 'fun'; p.x = FUN_SPAWN.x; p.z = FUN_SPAWN.z;
      } else if (to === 'hall' && p.world === 'fun') {
        if (Math.hypot(p.x - FUN_GATE.x, p.z - FUN_GATE.z) > 4.2) return deny(socket, 'Gate ke paas jao, phir E dabao 🏠');
        p.world = 'hall'; p.x = HALL_BACK.x; p.z = HALL_BACK.z;
      } else return;
      p.y = 0; p.ry = Math.PI; p.anim = 'idle';
      io.emit('world', { id: p.id, name: p.name, world: p.world, x: p.x, y: 0, z: p.z, ry: p.ry });
    });

    socket.on('chat', (text) => {
      const p = me();
      if (!p || !cooldown('chat', 400)) return;
      const t = clean(text, 120);
      if (t) io.emit('chat', { id: p.id, name: p.name, role: p.role, text: t });
    });

    socket.on('react', (emoji) => {
      const p = me();
      if (!p || !REACTIONS.includes(emoji) || !cooldown('react', 500)) return;
      io.emit('react', { id: p.id, emoji });
    });

    // --- Friends: send a birthday wish to Manisha (shown to everyone) ---
    socket.on('wish', (text) => {
      const p = me();
      if (!p || !cooldown('wish', 8000)) return deny(socket, 'Thoda ruko, doosri wish 8 second baad bhej sakte ho 💌');
      const t = clean(text, 100);
      if (t) io.emit('wish', { id: p.id, name: p.name, text: t });
    });

    socket.on('eat', (i) => {
      if (!me() || !Number.isInteger(i) || i < 0 || i >= STALL_COUNT || !cooldown('eat', 700)) return;
      io.emit('eat', { id: socket.id, i });
    });

    socket.on('pop', (id) => {
      if (!me() || !Number.isInteger(id) || id < 0 || id >= BALLOON_COUNT || popped.has(id) || !cooldown('pop', 250)) return;
      popped.add(id);
      const m = cfg.BALLOON_MESSAGES[id % cfg.BALLOON_MESSAGES.length] || {};
      io.emit('pop', { id, by: me().name, title: m.title || 'Happy Birthday! 🎂', text: m.text || '' });
      setTimeout(() => { popped.delete(id); io.emit('respawn', id); }, 8000);
    });

    socket.on('confetti', (pos) => {
      const p = me();
      if (!p || !pos) return;
      if (p.role === 'guest') {
        const w = cooldownLeft('confetti', 4000);
        if (w) return deny(socket, `Confetti dobara ${w} second baad chalega ⏳`);
      }
      io.emit('confetti', { x: num(pos.x, 16), y: num(pos.y, 8), z: num(pos.z, 14) });
    });

    // --- Games ---
    socket.on('collect', (id) => {
      const p = me();
      if (p && p.world === 'hall' && Number.isInteger(id)) games.collect(p, id);
    });
    socket.on('answer', (choice) => {
      const p = me();
      if (p && games.answer(p, choice)) socket.emit('answered', choice);
    });

    // --- Gifts for Manisha: anyone can send, only Manisha / Admin can open ---
    socket.on('sendgift', (data, cb) => {
      const p = me();
      if (typeof cb !== 'function') return;
      if (!p) return cb({ ok: false, error: 'Pehle party join karo' });
      if (p.role === 'girl') return cb({ ok: false, error: 'Manisha ko apne liye gift bhejne ki zaroorat nahi 😄' });
      // The cooldown only starts after a gift was actually accepted, so a bad photo can be retried at once.
      if (last.sendgift && Date.now() - last.sendgift < 10000) return cb({ ok: false, error: 'Thoda ruko, 10 second baad doosra gift bhejo' });
      const result = gifts.add(p, data);
      if (result.ok) last.sendgift = Date.now();
      cb(result);
    });
    socket.on('opengift', (id, cb) => {
      if (typeof cb !== 'function') return;
      if (!can('girl', 'admin')) return cb({ ok: false, error: 'Ye gift sirf Manisha kholegi 🎁' });
      cb(gifts.open(me(), id));
    });

    // --- Manisha (and Admin) only ---
    socket.on('candles', () => {
      const p = me();
      if (!p) return;
      if (!can('girl', 'admin')) return deny(socket, 'Candles sirf Manisha bujha sakti hai 🎂');
      if (!candlesLit) return deny(socket, 'Candles pehle se bujhi hui hain, thodi der mein dobara jalengi 🕯️');
      candlesLit = false;
      io.emit('candles', { lit: false, by: p.name });
      clearTimeout(relightTimer);
      relightTimer = setTimeout(() => { candlesLit = true; io.emit('candles', { lit: true }); }, 15000);
    });

    socket.on('cutcake', () => {
      const p = me();
      if (!p) return;
      if (!can('girl', 'admin')) return deny(socket, 'Cake sirf Manisha kaat sakti hai 🍰');
      const w = cooldownLeft('cutcake', 10000);
      if (w) return deny(socket, `Cake dobara kaatne ke liye ${w} second ruko ⏳`);
      io.emit('cutcake', { by: p.name });
      if (games.startHunt()) io.emit('huntStart');
    });

    socket.on('wishrain', () => {
      const p = me();
      if (!p) return;
      if (!can('girl', 'admin')) return deny(socket, 'Wish sirf Manisha maang sakti hai ✨');
      const w = cooldownLeft('wishrain', 8000);
      if (w) return deny(socket, `Dobara wish maangne ke liye ${w} second ruko ⏳`);
      io.emit('wishrain', { by: p.name, x: p.x, z: p.z });
    });

    socket.on('gift', (i, cb) => {
      if (typeof cb !== 'function') return;
      if (!can('girl', 'admin')) return cb({ ok: false, error: 'Ye gift sirf Manisha kholegi 🎁' });
      const g = Number.isInteger(i) && cfg.GIFTS[i];
      cb(g ? { ok: true, title: g.title, text: g.text } : { ok: false, error: 'Gift nahi mila' });
    });

    // --- Admin only ---
    socket.on('admin', (cmd) => {
      const p = me();
      if (!p || !cmd || typeof cmd.type !== 'string') return;
      if (p.role !== 'admin') return deny(socket, 'Ye sirf Admin ke liye hai 🔒');
      const target = typeof cmd.target === 'string' ? players.get(cmd.target) : null;

      switch (cmd.type) {
        case 'fireworks': io.emit('fireworks', { by: p.name }); break;
        case 'relight':
          candlesLit = true; clearTimeout(relightTimer); io.emit('candles', { lit: true }); break;
        case 'balloons': popped.clear(); io.emit('respawnAll'); break;
        case 'song': io.emit('song', { on: !!cmd.on }); break;
        case 'celebrate':
          // rehearse (or stop) the 5 minute midnight celebration by hand
          if (cmd.on) { manualEnd = Date.now() + CELEB_MS; skipWindow = 0; } else { manualEnd = 0; skipWindow = sched; }
          wasActive = celebActive();
          io.emit('celebration', celebState());
          break;
        case 'game': {
          const err = games.admin(String(cmd.game));
          if (err) deny(socket, err);
          break;
        }
        case 'announce': {
          const t = clean(cmd.text, 120);
          if (t) io.emit('announce', { text: t, by: p.name });
          break;
        }
        case 'mute':
          if (target && target.role !== 'admin') {
            target.muted = !!cmd.on;
            io.to(target.id).emit('muted', { on: target.muted });
            io.emit('mutedState', { id: target.id, muted: target.muted });
          }
          break;
        case 'muteall':
          mutedAll = !!cmd.on;
          players.forEach((q) => {
            if (q.role !== 'guest') return;
            q.muted = mutedAll;
            io.to(q.id).emit('muted', { on: mutedAll });
            io.emit('mutedState', { id: q.id, muted: mutedAll });
          });
          break;
        case 'kick':
          if (target && target.role !== 'admin') {
            io.to(target.id).emit('kicked');
            const s = io.sockets.sockets.get(target.id);
            if (s) setTimeout(() => s.disconnect(true), 200);
          }
          break;
        default: break;
      }
    });

    // WebRTC signaling relay (offers / answers / ICE) for the video wall.
    socket.on('signal', (msg) => {
      if (!msg || typeof msg.to !== 'string' || !players.has(socket.id) || !players.has(msg.to)) return;
      io.to(msg.to).emit('signal', { from: socket.id, data: msg.data });
    });

    socket.on('disconnect', () => {
      balloon.riders.delete(socket.id);
      if (!players.delete(socket.id)) return;
      dirty.delete(socket.id);
      games.onLeave(socket.id);
      io.emit('left', socket.id);
      io.emit('count', players.size);
    });
  });

  // Broadcast positions at 20Hz, only for players that moved.
  setInterval(() => {
    if (!dirty.size) return;
    const batch = [...dirty].map((id) => players.get(id)).filter(Boolean).map(pub);
    dirty.clear();
    io.volatile.emit('tick', batch);
  }, 50);

  server.listen(port, '0.0.0.0', () => {
    console.log(`> Party room ready on http://localhost:${port} (${dev ? 'dev' : 'production'})`);
    console.log(`> Storage: ${store.mode === 'upstash' ? 'Upstash Redis (survives restarts)' : 'local files in ./data'} | Timezone: ${process.env.TZ}`);
    console.log('> Admin code and birthday-girl code are in .env');
    const t = new Date(sched);
    console.log(`> Midnight celebration: ${t.toString()}`);
  });

  // Render's free plan puts a service to sleep after ~15 minutes without visitors, and a sleeping server cannot start
  // the midnight celebration. Render sets RENDER_EXTERNAL_URL by itself, so the server pings its own public address.
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (selfUrl && process.env.KEEP_ALIVE !== '0') {
    setInterval(() => { fetch(`${selfUrl}/api/health`).catch(() => {}); }, 9 * 60 * 1000);
    console.log(`> Keep-alive ping every 9 min -> ${selfUrl}/api/health`);
  }
});
