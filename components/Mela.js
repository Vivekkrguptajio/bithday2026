'use client';
// The mela's games, prize shop and fortune tent: small pop-up games drawn with plain HTML.
// Each game ends with a score; the score becomes tickets, and tickets buy prizes in the shop.
import { useEffect, useRef, useState } from 'react';

export const MELA_GAMES = {
  balloon: { name: 'Gubbare Phodo', emoji: '🎯', time: 25, help: '25 second mein jitne ho sake gubbare phodo! Sunehri gubbara = 3 point.', tickets: (s) => s },
  mole: { name: 'Chuha Maaro', emoji: '🔨', time: 25, help: 'Jo chuha bill se nikle, jaldi se click karo! 25 second.', tickets: (s) => s },
  striker: { name: 'Taqat Tester', emoji: '🔔', time: 0, help: '3 koshishein. Jab meter hare zone (upar) mein ho, "Maaro" dabao ya Space!', tickets: (s) => Math.round(s / 5) },
  memory: { name: 'Jodi Milao', emoji: '🃏', time: 0, help: 'Ek jaise cards ki jodi milao. Jitni kam chaalein, utne zyada point.', tickets: (s) => Math.round(s / 2) },
};

// the same list lives on the server (it checks the item and keeps the price honest only by trust: this is a two-person game)
export const MELA_ITEMS = [
  { id: 'balloon', emoji: '🎈', name: 'Gubbara', cost: 5 },
  { id: 'choco', emoji: '🍫', name: 'Chocolate', cost: 10 },
  { id: 'letter', emoji: '💌', name: 'Love Letter', cost: 12 },
  { id: 'rose', emoji: '🌹', name: 'Gulab', cost: 15 },
  { id: 'teddy', emoji: '🧸', name: 'Teddy Bear', cost: 30 },
  { id: 'bouquet', emoji: '💐', name: 'Bouquet', cost: 40 },
  { id: 'ring', emoji: '💍', name: 'Ring', cost: 60 },
];

const FORTUNES = [
  'Aaj koi tumhe yaad kar raha hai, aur wo bahut pyaar se kar raha hai 💖',
  'Tumhari muskaan hi tumhari sabse badi taqat hai 😊',
  'Jaldi hi ek pyaari surprise tumhara intezaar kar rahi hai 🎁',
  'Saath mein jhoola jhoolna, ye hi sabse badi khushi hai 🎡',
  'Tumhare saath har din mela hai 🎪',
  'Is saal ka har lamha yaadgaar banega ✨',
  'Ek meetha sa pal aane wala hai, chai ya jalebi, ya dono 🍯',
  'Tumhari kismat mein bahut saara pyaar likha hai 💞',
  'Aaj ka din tumhara hai, dil khol ke jiyo 🌈',
  'Koi tumhare liye gulab lekar aa raha hai 🌹',
  'Jahan tum ho, wahan khushi hai 🥰',
  'Aane wala saal tumhare sapne sach karega 🌟',
];

const BALLOON_COLORS = ['#ff4f9a', '#4cc9f0', '#7bf1a8', '#c77dff', '#ff8e53', '#ef476f'];
const rnd = (n) => Math.floor(Math.random() * n);

/* ------------------------------ the games ------------------------------ */
function BalloonGame({ onDone }) {
  const [balloons, setBalloons] = useState([]);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(MELA_GAMES.balloon.time);
  const next = useRef(1), scoreRef = useRef(0), finished = useRef(false);
  useEffect(() => {
    const move = setInterval(() => setBalloons((bs) => bs.map((b) => ({ ...b, y: b.y - b.v })).filter((b) => b.y > -18)), 50);
    const spawn = setInterval(() => setBalloons((bs) => [...bs, {
      id: next.current++, x: 4 + Math.random() * 82, y: 104, v: 0.9 + Math.random() * 1.2,
      gold: Math.random() < 0.12, c: BALLOON_COLORS[rnd(BALLOON_COLORS.length)],
    }]), 420);
    const clock = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => { clearInterval(move); clearInterval(spawn); clearInterval(clock); };
  }, []);
  useEffect(() => {
    if (left <= 0 && !finished.current) { finished.current = true; onDone(scoreRef.current); }
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const pop = (b) => {
    if (finished.current) return;
    setBalloons((bs) => bs.filter((x) => x.id !== b.id));
    scoreRef.current += b.gold ? 3 : 1; setScore(scoreRef.current);
  };
  return (
    <>
      <div className="mg-bar"><span>⏱ {Math.max(0, left)}s</span><span>🎯 {score}</span></div>
      <div className="mg-field" data-testid="balloon-field">
        {balloons.map((b) => (
          <button key={b.id} className="mg-balloon" aria-label="balloon" style={{ left: b.x + '%', top: b.y + '%', background: b.gold ? 'linear-gradient(#ffe066,#f4a100)' : b.c }} onClick={() => pop(b)}>{b.gold ? '★' : ''}</button>
        ))}
      </div>
    </>
  );
}

function MoleGame({ onDone }) {
  const [mole, setMole] = useState(-1);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(MELA_GAMES.mole.time);
  const scoreRef = useRef(0), finished = useRef(false);
  useEffect(() => {
    const pop = setInterval(() => setMole((m) => { let n; do { n = rnd(9); } while (n === m); return n; }), 750);
    const clock = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => { clearInterval(pop); clearInterval(clock); };
  }, []);
  useEffect(() => {
    if (left <= 0 && !finished.current) { finished.current = true; onDone(scoreRef.current); }
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const whack = (i) => {
    if (finished.current || i !== mole) return;
    setMole(-1); scoreRef.current += 1; setScore(scoreRef.current);
  };
  return (
    <>
      <div className="mg-bar"><span>⏱ {Math.max(0, left)}s</span><span>🔨 {score}</span></div>
      <div className="mg-holes">
        {Array.from({ length: 9 }, (_, i) => (
          <button key={i} className={'mg-hole' + (i === mole ? ' up' : '')} data-mole={i === mole ? '1' : '0'} onClick={() => whack(i)}>{i === mole ? '🐭' : '🕳️'}</button>
        ))}
      </div>
    </>
  );
}

function StrikerGame({ onDone }) {
  const [tryNo, setTryNo] = useState(0);
  const [val, setVal] = useState(0);
  const [results, setResults] = useState([]);
  const valRef = useRef(0), tryRef = useRef(0), resRef = useRef([]), t0 = useRef(performance.now());
  useEffect(() => {
    let raf;
    const loop = () => {
      const t = (performance.now() - t0.current) / 1000;
      const sp = 3.2 + tryRef.current * 1.4; // each try is faster
      const v = Math.round(50 + 50 * Math.sin(t * sp - Math.PI / 2));
      valRef.current = v; setVal(v);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const hit = () => {
    if (tryRef.current >= 3) return;
    resRef.current = [...resRef.current, valRef.current];
    setResults(resRef.current);
    tryRef.current += 1; setTryNo(tryRef.current);
    t0.current = performance.now();
    if (tryRef.current >= 3) setTimeout(() => onDone(Math.max(...resRef.current)), 900);
  };
  useEffect(() => {
    const kd = (e) => { if (e.key === ' ') { e.preventDefault(); hit(); } };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const best = results.length ? Math.max(...results) : 0;
  return (
    <>
      <div className="mg-bar"><span>Koshish {Math.min(tryNo + 1, 3)}/3</span><span>💪 {best}</span></div>
      <div className="mg-striker">
        <div className="mg-tower"><div className="mg-zone" /><div className="mg-fill" style={{ height: val + '%' }} />{best >= 90 && <div className="mg-bell">🔔</div>}</div>
        <div className="mg-side">
          <div className="mg-big" data-testid="striker-val">{val}</div>
          {results.map((r, i) => <div key={i} className="mg-try">#{i + 1}: {r}{r >= 90 ? ' 🔔 DING!' : ''}</div>)}
          <button className="btn" onClick={hit} disabled={tryNo >= 3}>🔨 Maaro!</button>
        </div>
      </div>
    </>
  );
}

const PAIRS = ['💖', '🌹', '🧸', '🍫', '🎈', '💍'];
function MemoryGame({ onDone }) {
  const [cards, setCards] = useState(() => [...PAIRS, ...PAIRS].map((e, i) => ({ id: i, e, up: false, ok: false })).sort(() => Math.random() - 0.5));
  const [moves, setMoves] = useState(0);
  const first = useRef(-1), lock = useRef(false), timer = useRef(0), finished = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flip = (i) => {
    if (lock.current || cards[i].up || cards[i].ok) return;
    const next = cards.map((c, k) => (k === i ? { ...c, up: true } : c));
    setCards(next);
    if (first.current < 0) { first.current = i; return; }
    const a = first.current; first.current = -1;
    const m = moves + 1; setMoves(m);
    if (next[a].e === next[i].e) {
      const done = next.map((c, k) => (k === a || k === i ? { ...c, ok: true } : c));
      setCards(done);
      if (done.every((c) => c.ok) && !finished.current) { finished.current = true; setTimeout(() => onDone(Math.max(5, 56 - m * 3)), 500); }
    } else {
      lock.current = true;
      timer.current = setTimeout(() => { setCards((cs) => cs.map((c, k) => (k === a || k === i ? { ...c, up: false } : c))); lock.current = false; }, 700);
    }
  };
  return (
    <>
      <div className="mg-bar"><span>Chaalein: {moves}</span><span>🃏 {cards.filter((c) => c.ok).length / 2}/6</span></div>
      <div className="mg-cards">
        {cards.map((c, i) => (
          <button key={c.id} className={'mg-card' + (c.up || c.ok ? ' up' : '') + (c.ok ? ' ok' : '')} data-emoji={c.e} onClick={() => flip(i)}>{c.up || c.ok ? c.e : '❓'}</button>
        ))}
      </div>
    </>
  );
}

/* ------------------------- fortune tent + love meter ------------------------- */
function Fortune({ meName }) {
  const [tab, setTab] = useState('kismat');
  const [card, setCard] = useState('');
  const [a, setA] = useState(meName || '');
  const [b, setB] = useState('Manisha');
  const [pct, setPct] = useState(null);
  const measure = () => {
    const x = a.trim().toLowerCase(), y = b.trim().toLowerCase();
    if (!x || !y) return;
    if ((x.includes('vivek') && y.includes('manisha')) || (x.includes('manisha') && y.includes('vivek'))) { setPct(100); return; }
    let h = 7; for (const ch of [x, y].sort().join('&')) h = (h * 31 + ch.charCodeAt(0)) % 997;
    setPct(61 + (h % 39));
  };
  return (
    <>
      <div className="mg-tabs">
        <button className={tab === 'kismat' ? 'on' : ''} onClick={() => setTab('kismat')}>🔮 Kismat Card</button>
        <button className={tab === 'love' ? 'on' : ''} onClick={() => setTab('love')}>💘 Love Meter</button>
      </div>
      {tab === 'kismat' ? (
        <div className="mg-fortune">
          <div className="mg-fcard" data-testid="fortune-card">{card || '🔮 Card kheencho aur apni kismat dekho!'}</div>
          <button className="btn" onClick={() => setCard(FORTUNES[rnd(FORTUNES.length)])}>🃏 Card kheencho</button>
        </div>
      ) : (
        <div className="mg-fortune">
          <div className="mg-love"><input className="field" value={a} maxLength={14} onChange={(e) => setA(e.target.value)} placeholder="Tumhara naam" /><span>💞</span><input className="field" value={b} maxLength={14} onChange={(e) => setB(e.target.value)} placeholder="Unka naam" /></div>
          {pct !== null && (
            <div className="mg-meter"><div className="mg-meter-fill" style={{ width: pct + '%' }} /><b data-testid="love-pct">{pct}%</b></div>
          )}
          <button className="btn" onClick={measure}>💘 Pyaar naapo</button>
        </div>
      )}
    </>
  );
}

function Shop({ tickets, onBuy }) {
  return (
    <>
      <p className="mg-help">Games khelo, ticket jeeto, phir yahan se inaam khareedo. Sab ko dikhega ki tumne kya liya! 💝</p>
      <div className="mg-shop">
        {MELA_ITEMS.map((it) => (
          <button key={it.id} className="mg-item" disabled={tickets < it.cost} onClick={() => onBuy(it)} data-item={it.id}>
            <span className="mg-item-emoji">{it.emoji}</span><b>{it.name}</b><small>🎟️ {it.cost}</small>
          </button>
        ))}
      </div>
    </>
  );
}

/* ------------------------------- the pop-up ------------------------------- */
export default function MelaModal({ booth, tickets, board, meName, onClose, onFinish, onBuy }) {
  const [stage, setStage] = useState('intro'); // intro | play | result
  const [round, setRound] = useState(0);
  const [result, setResult] = useState(null);
  const g = MELA_GAMES[booth.id];

  useEffect(() => {
    const kd = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [onClose]);

  const done = (score) => { const earned = onFinish(booth.id, score); setResult({ score, earned }); setStage('result'); };
  const Game = { balloon: BalloonGame, mole: MoleGame, striker: StrikerGame, memory: MemoryGame }[booth.id];
  const top = (board && board[booth.id]) || [];

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card mela-card" onClick={(e) => e.stopPropagation()}>
        <div className="mela-head"><span>{booth.emoji} {booth.name}</span><span className="mela-tix" data-testid="tickets">🎟️ {tickets}</span></div>

        {booth.kind === 'game' && g && stage === 'intro' && (
          <div className="mg-intro">
            <p className="mg-help">{g.help}</p>
            <button className="btn" onClick={() => setStage('play')}>▶ Shuru karo</button>
          </div>
        )}
        {booth.kind === 'game' && Game && stage === 'play' && <Game key={round} onDone={done} />}
        {booth.kind === 'game' && stage === 'result' && result && (
          <div className="mg-result">
            <div className="mg-score" data-testid="mg-score">{result.score}</div>
            <p>{result.earned > 0 ? `🎟️ +${result.earned} ticket jeete!` : 'Is baar ticket nahi mile, phir koshish karo!'}</p>
            {top.length > 0 && (
              <div className="mg-board"><b>🏆 Mela Leaderboard</b>{top.slice(0, 3).map((t, i) => <div key={t.name}>{['🥇', '🥈', '🥉'][i]} {t.name}: {t.score}</div>)}</div>
            )}
            <div className="gfbtns">
              <button className="btn" onClick={() => { setResult(null); setRound((r) => r + 1); setStage('play'); }}>🔁 Dobara</button>
            </div>
          </div>
        )}

        {booth.kind === 'shop' && <Shop tickets={tickets} onBuy={onBuy} />}
        {booth.kind === 'fortune' && <Fortune meName={meName} />}

        <button className="btn ghost mela-close" onClick={onClose}>Band karo</button>
      </div>
    </div>
  );
}
