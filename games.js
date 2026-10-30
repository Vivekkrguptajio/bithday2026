// Party games, all server-authoritative:
//   Heart Hunt          - always on, collect floating hearts, live leaderboard
//   Red Light Green Light - Admin starts it; move on RED and you are out; first across the finish line wins
//   Manisha Quiz        - Admin starts it; friends answer questions about Manisha (she and the Admin watch)
const cfg = require('./party.config');

const START_Z = 9.5;
const FINISH_Z = -9.5;
const HEARTS = 12;
const QUESTION_MS = 15000;

module.exports = function createGames(io, players) {
  /* ------------------------------ Heart Hunt ------------------------------ */
  const hearts = new Map();
  const scores = new Map(); // socket id -> { name, n }

  function randPos() {
    for (let i = 0; i < 40; i++) {
      const x = (Math.random() * 2 - 1) * 12;
      const z = (Math.random() * 2 - 1) * 11.5;
      if (Math.hypot(x, z + 5) < 3.6) continue; // cake table
      if (z < -7.6 && Math.abs(x) < 9) continue; // gift rug + sofas
      return { x, z };
    }
    return { x: 0, z: 3 };
  }
  for (let id = 0; id < HEARTS; id++) hearts.set(id, { id, ...randPos() });

  const topHearts = (n = 5) => [...scores.values()].sort((a, b) => b.n - a.n).slice(0, n).map((s) => ({ name: s.name, n: s.n }));

  function collect(p, id) {
    const h = hearts.get(id);
    if (!h || Math.hypot(p.x - h.x, p.z - h.z) > 2.8) return;
    hearts.delete(id);
    const s = scores.get(p.id) || { name: p.name, n: 0 };
    s.name = p.name; s.n += 1;
    scores.set(p.id, s);
    io.emit('heartTaken', { id, byId: p.id, by: p.name, n: s.n });
    io.emit('scores', topHearts());
    setTimeout(() => {
      const nh = { id, ...randPos() };
      hearts.set(id, nh);
      io.emit('heartSpawn', nh);
    }, 5000);
  }

  /* --------------------------- Red Light Green Light --------------------------- */
  let rl = null;

  const rlState = () => (rl ? { phase: rl.phase, endsAt: rl.endsAt, alive: rl.alive.size, total: rl.total, winner: rl.winner || null } : null);
  const rlBroadcast = () => io.emit('rl', rlState());

  function rlEnd(winner) {
    if (!rl) return;
    clearTimeout(rl.timer);
    rl.phase = 'over'; rl.winner = winner; rl.endsAt = 0;
    rlBroadcast();
    const ended = rl;
    setTimeout(() => {
      if (rl !== ended) return;
      players.forEach((p) => { p.out = false; });
      rl = null;
      io.emit('rl', null);
      io.emit('rlClear');
    }, 9000);
  }
  function rlRed() {
    if (!rl) return;
    if (Date.now() - rl.startedAt > 120000) return rlEnd(null);
    rl.phase = 'red'; rl.redAt = Date.now();
    const d = 2200 + Math.random() * 1800;
    rl.endsAt = Date.now() + d;
    rl.alive.forEach((id) => { const p = players.get(id); if (p) { p.rx = p.x; p.rz = p.z; } });
    rlBroadcast();
    rl.timer = setTimeout(rlGreen, d);
  }
  function rlGreen() {
    if (!rl) return;
    rl.phase = 'green';
    const d = 2500 + Math.random() * 2500;
    rl.endsAt = Date.now() + d;
    rlBroadcast();
    rl.timer = setTimeout(rlRed, d);
  }
  function rlEliminate(p) {
    rl.alive.delete(p.id);
    p.out = true;
    io.emit('rlOut', { id: p.id, name: p.name });
    if (rl.alive.size === 0) rlEnd(null); else rlBroadcast();
  }
  function rlStart() {
    stop();
    const part = [...players.values()].filter((p) => p.role !== 'admin');
    if (!part.length) return 'Koi khilari nahi hai (Admin khelta nahi).';
    rl = { phase: 'countdown', endsAt: Date.now() + 4000, alive: new Set(part.map((p) => p.id)), total: part.length, startedAt: Date.now(), timer: null, winner: null };
    part.forEach((p, i) => {
      const x = part.length === 1 ? 0 : -12 + (24 * i) / (part.length - 1);
      p.x = x; p.z = START_Z + 0.7; p.out = false;
      io.to(p.id).emit('teleport', { x, z: START_Z + 0.7 });
    });
    rlBroadcast();
    rl.timer = setTimeout(rlGreen, 4000);
    return null;
  }

  /* ---------------------------------- Quiz ---------------------------------- */
  let quiz = null;
  let lastQuizMsg = null;
  const quizEmit = (m) => { lastQuizMsg = m; io.emit('quiz', m); };

  function quizTop(n = 5) {
    return [...quiz.scores.entries()]
      .map(([id, s]) => ({ name: (players.get(id) || {}).name || quiz.names.get(id) || '?', n: s }))
      .sort((a, b) => b.n - a.n).slice(0, n);
  }
  function quizEnd() {
    const top = quizTop();
    quizEmit({ phase: 'end', top, winner: top[0] ? top[0].name : null });
    const q = quiz;
    q.timer = setTimeout(() => { if (quiz === q) { quiz = null; quizEmit(null); } }, 14000);
  }
  function quizReveal() {
    const item = cfg.QUIZ[quiz.idx];
    const counts = [0, 0, 0, 0];
    quiz.answers.forEach((a, id) => {
      counts[a.choice]++;
      if (a.choice === item.answer) {
        const bonus = Math.min(100, Math.round(Math.max(0, quiz.endsAt - a.at) / 150));
        quiz.scores.set(id, (quiz.scores.get(id) || 0) + 100 + bonus);
      }
    });
    quizEmit({ phase: 'reveal', idx: quiz.idx, total: cfg.QUIZ.length, q: item.q, options: item.options, correct: item.answer, counts, top: quizTop() });
    quiz.timer = setTimeout(() => {
      quiz.idx += 1;
      if (quiz.idx >= cfg.QUIZ.length) quizEnd(); else quizAsk();
    }, 6000);
  }
  function quizAsk() {
    const item = cfg.QUIZ[quiz.idx];
    quiz.answers = new Map();
    quiz.endsAt = Date.now() + QUESTION_MS;
    quizEmit({ phase: 'question', idx: quiz.idx, total: cfg.QUIZ.length, q: item.q, options: item.options, endsAt: quiz.endsAt });
    quiz.timer = setTimeout(quizReveal, QUESTION_MS);
  }
  function quizStart() {
    stop();
    if (!Array.isArray(cfg.QUIZ) || !cfg.QUIZ.length) return 'Quiz ke sawaal party.config.js mein nahi hain.';
    if (![...players.values()].some((p) => p.role === 'guest')) return 'Quiz ke liye kam se kam ek friend chahiye.';
    quiz = { idx: 0, scores: new Map(), names: new Map(), answers: new Map(), endsAt: 0, timer: null };
    quizAsk();
    return null;
  }
  function answer(p, choice) {
    if (!quiz || lastQuizMsg == null || lastQuizMsg.phase !== 'question') return false;
    if (p.role !== 'guest' || !Number.isInteger(choice) || choice < 0 || choice > 3 || quiz.answers.has(p.id)) return false;
    quiz.answers.set(p.id, { choice, at: Date.now() });
    quiz.names.set(p.id, p.name);
    return true;
  }

  /* --------------------------------- shared --------------------------------- */
  function stop() {
    if (rl) { clearTimeout(rl.timer); rl = null; players.forEach((p) => { p.out = false; }); io.emit('rl', null); io.emit('rlClear'); }
    if (quiz) { clearTimeout(quiz.timer); quiz = null; quizEmit(null); }
  }

  return {
    snapshot: () => ({ hearts: [...hearts.values()], scores: topHearts(), rl: rlState(), quiz: quiz ? lastQuizMsg : null }),
    collect,
    answer,
    onMove(p) {
      if (!rl || !rl.alive.has(p.id)) return;
      if (rl.phase === 'red') {
        if (Date.now() - rl.redAt < 450) { p.rx = p.x; p.rz = p.z; } // short grace so you can stop
        else if (Math.hypot(p.x - p.rx, p.z - p.rz) > 0.45 || p.y > 0.25) return rlEliminate(p);
      }
      if ((rl.phase === 'green' || rl.phase === 'red') && p.z < FINISH_Z) rlEnd(p.name);
    },
    onLeave(id) {
      scores.delete(id);
      if (rl && rl.alive.delete(id)) { if (rl.alive.size === 0) rlEnd(null); else rlBroadcast(); }
    },
    // Admin commands. Returns an error message or null.
    admin(kind) {
      if (kind === 'redlight') return rlStart();
      if (kind === 'quiz') return quizStart();
      if (kind === 'stop') { stop(); return null; }
      if (kind === 'resethearts') { scores.clear(); io.emit('scores', []); return null; }
      return null;
    },
  };
};
