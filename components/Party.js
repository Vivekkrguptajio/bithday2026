'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Scene from './Scene';
import Landing from './Landing';
import { BALLOONS, CAKE, REACTIONS, STALLS, giftSlot } from './layout';
import { COLORS, HOST } from './data';
import { bus } from './bus';
import {
  playBirthday, playCrunch, playGo, playPop, playStop, playTada, setDanceZone, startMusic, stopMusic, unlockAudio,
} from './audio';
import { createRTC, fetchIce, getMedia } from './rtc';

const PINK = 0.92; // confetti hue for hearts / birthday-girl effects
const badge = (role) => (role === 'girl' ? '👑 ' : role === 'admin' ? '⭐ ' : '');

// Plays a remote person's voice (their video is drawn on the 3D wall).
function RemoteAudio({ stream }) {
  const ref = useRef();
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

// Shrinks a photo to a small JPEG so it is quick to send (and easy for everyone to download).
async function compressPhoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const sc = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.82;
  let url = c.toDataURL('image/jpeg', q);
  while (url.length > 400000 && q > 0.4) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
  return url;
}

export default function Party() {
  const [stage, setStage] = useState('join'); // join | room
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [me, setMe] = useState(null);
  const [others, setOthers] = useState([]);
  const [count, setCount] = useState(1);
  const [chat, setChat] = useState([]);
  const [bubbles, setBubbles] = useState({});
  const [reacts, setReacts] = useState({});
  const [candlesLit, setCandlesLit] = useState(true);
  const [popped, setPopped] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [gift, setGift] = useState(null);
  const [chatText, setChatText] = useState('');
  const [toast, setToast] = useState('');
  const [announce, setAnnounce] = useState(null);
  const [adminOpen, setAdminOpen] = useState(true);
  const [announceText, setAnnounceText] = useState('');
  const [wallMsg, setWallMsg] = useState(null);

  // guest list wall, midnight celebration, dance floor
  const [guests, setGuests] = useState([]);
  const [fresh, setFresh] = useState(null); // the newest arrival is highlighted for a while
  const [clock, setClock] = useState({ nextAt: 0, active: false, endsAt: 0, offset: 0 });
  const [celebrating, setCelebrating] = useState(false);
  const [tick, setTick] = useState(0);
  const [onFloorUI, setOnFloorUI] = useState(false);
  const [autoDance, setAutoDance] = useState(true); // dance floor makes you dance by itself (optional)
  const [joined, setJoined] = useState(false); // the server accepted us; the landing page is still finishing its walk-in animation
  const [exitAsk, setExitAsk] = useState(false); // "leave the party?" question
  const [leftMsg, setLeftMsg] = useState(''); // shown on the join screen after leaving

  // games + gifts
  const [hearts, setHearts] = useState([]);
  const [scores, setScores] = useState([]);
  const [rl, setRl] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [myChoice, setMyChoice] = useState(null);
  const [outIds, setOutIds] = useState({});
  const [userGifts, setUserGifts] = useState([]);
  const [giftView, setGiftView] = useState(null);
  const [giftForm, setGiftForm] = useState(false);
  const [gfText, setGfText] = useState('');
  const [gfPhoto, setGfPhoto] = useState('');
  const [gfErr, setGfErr] = useState('');
  const [gfBusy, setGfBusy] = useState(false);

  const [localStream, setLocalStream] = useState(null);
  const [streams, setStreams] = useState({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [micLocked, setMicLocked] = useState(false); // muted by admin
  const [musicOn, setMusicOn] = useState(true);

  const socketRef = useRef(null);
  const rtcRef = useRef(null);
  const localRef = useRef(null);
  const musicRef = useRef(true);
  const mounted = useRef(true);
  const kickedRef = useRef(false);
  const leavingRef = useRef(false); // true while we leave on purpose (Exit button), so it is not reported as an error
  const choiceRef = useRef(null);
  const rlPhase = useRef('');
  const world = useRef({ others: new Map(), me: null, hearts: [], userGifts: [] });
  const inputRef = useRef(null);
  const bubbleTimers = useRef({});
  const reactTimers = useRef({});
  const toastTimer = useRef(0);
  const announceTimer = useRef(0);
  const wallTimer = useRef(0);
  const giftTimer = useRef(0);
  const freshTimer = useRef(0);

  const role = me ? me.role : 'guest';
  const isGirl = role === 'girl';
  const isAdmin = role === 'admin';
  const privileged = isGirl || isAdmin;

  useEffect(() => { world.current.hearts = hearts; }, [hearts]);
  useEffect(() => { world.current.userGifts = userGifts; }, [userGifts]);
  useEffect(() => { world.current.autoDance = autoDance; }, [autoDance]);

  // names of everybody in the room right now (lower case) for the green dots on the guest list
  const hereNames = useMemo(() => new Set([me, ...others].filter(Boolean).map((p) => p.name.toLowerCase())), [me, others]);

  const markFresh = useCallback((name) => {
    setFresh({ name, at: Date.now() });
    clearTimeout(freshTimer.current);
    freshTimer.current = setTimeout(() => setFresh(null), 20000);
  }, []);

  // Manisha's welcome confetti, once the party scene is really on screen
  useEffect(() => {
    if (stage !== 'room' || !me || me.role !== 'girl') return undefined;
    const t = setTimeout(() => { bus.confetti && bus.confetti(0, 2, -1.8, 320, PINK); playTada(); }, 900);
    return () => clearTimeout(t);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // walking onto / off the dance floor: the party song fades in (only for that person) and they start dancing
  const onFloor = useCallback((b) => { setOnFloorUI(b); setDanceZone(b); }, []);

  useEffect(() => {
    if (stage !== 'room') return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [stage]);

  // last minute / last 10 seconds before the celebration starts
  useEffect(() => {
    if (stage !== 'room' || !clock.nextAt || clock.active) return;
    const rem = Math.round((clock.nextAt - (Date.now() + clock.offset)) / 1000);
    if (rem === 60) addChat({ sys: true, text: '⏳ Sirf 1 minute baaki! Celebration ki tayyari karo 🎉' });
    if (rem > 0 && rem <= 10) { flash(`⏳ ${rem}…`); playGo(); }
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const addChat = useCallback((m) => setChat((c) => [...c.slice(-30), m]), []);
  const flash = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const showBubble = useCallback((id, text) => {
    setBubbles((b) => ({ ...b, [id]: text }));
    clearTimeout(bubbleTimers.current[id]);
    bubbleTimers.current[id] = setTimeout(() => setBubbles((b) => { const n = { ...b }; delete n[id]; return n; }), 5000);
  }, []);

  const lockMic = useCallback((on) => {
    setMicLocked(on);
    const t = localRef.current && localRef.current.getAudioTracks()[0];
    if (on && t) { t.enabled = false; setMicOn(false); }
  }, []);

  // Midnight celebration state from the server. `live` = it just changed while we were here.
  // (Must stay below addChat / flash: it uses them.)
  const applyCeleb = useCallback((c, live) => {
    if (!c) return;
    setClock({ nextAt: c.nextAt || 0, active: !!c.active, endsAt: c.endsAt || 0, offset: (c.serverNow || Date.now()) - Date.now() });
    setCelebrating(!!c.active);
    world.current.celebrating = !!c.active;
    if (!live) return;
    if (c.active) {
      addChat({ sys: true, text: `🎉🎉 12 baj gaye! HAPPY BIRTHDAY ${HOST.toUpperCase()}! Celebration shuru! 🎂🎆` });
      flash('🎉 HAPPY BIRTHDAY! Celebration shuru!');
      playTada();
      if (musicRef.current) startMusic();
      [-1, 1].forEach((s) => bus.confetti && bus.confetti(s * 14, 4.6, 0, 200, null, [-s * 8, 0]));
    } else addChat({ sys: true, text: 'Celebration khatam, par party chalti rahegi! 🥳' });
  }, [addChat, flash]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopMusic();
      setDanceZone(false);
      if (rtcRef.current) rtcRef.current.closeAll();
      if (localRef.current) localRef.current.getTracks().forEach((t) => t.stop());
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  async function join(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (busy) return;
    unlockAudio();
    setBusy(true); setError(''); setNote(''); setLeftMsg(''); setJoined(false); kickedRef.current = false; leavingRef.current = false;

    // Camera + mic first (browser asks for permission here).
    const media = await getMedia();
    localRef.current = media.stream;
    setLocalStream(media.stream);
    setCamOn(!!(media.stream && media.stream.getVideoTracks().length));
    setMicOn(!!(media.stream && media.stream.getAudioTracks().length));
    if (media.note) setNote(media.note);

    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const fail = (msg) => {
      setError(msg); setBusy(false);
      leavingRef.current = true; // our own disconnect must not replace this message with "connection toot gaya"
      socket.disconnect();
      if (localRef.current) { localRef.current.getTracks().forEach((t) => t.stop()); localRef.current = null; setLocalStream(null); }
    };

    socket.on('connect_error', () => fail('Server se connect nahi ho paya.'));

    socket.on('connect', async () => {
      // TURN servers first (so video connects across different networks), then join
      const iceServers = await fetchIce();
      socket.emit('join', { name: name.trim() || 'Guest', color, code: code.trim() }, (res) => {
        if (!res.ok) return fail(res.error);

        world.current.me = res.me;
        res.players.forEach((p) => world.current.others.set(p.id, p));
        setMe(res.me);
        const existing = res.players.filter((p) => p.id !== res.id);
        setOthers(existing);
        const out = {};
        res.players.forEach((p) => { if (p.out) out[p.id] = true; });
        setOutIds(out);
        setCount(res.players.length);
        setCandlesLit(res.candlesLit);
        setPopped(res.popped);
        setHearts(res.hearts || []);
        setScores(res.scores || []);
        setRl(res.rl || null);
        setQuiz(res.quiz || null);
        setUserGifts(res.userGifts || []);
        setGuests(res.guests || []);
        markFresh(res.me.name);
        applyCeleb(res.celebration, false);
        setAdminOpen(res.me.role === 'admin');
        if (res.me.muted) lockMic(true);

        const waiting = (res.userGifts || []).filter((g) => !g.opened).length;
        addChat({
          sys: true,
          text: res.me.role === 'girl' ? `👑 Happy Birthday Manisha! Ye party tumhari hai 🎉${waiting ? ` Tumhare liye ${waiting} gift rakhe hain 🎁` : ''}`
            : res.me.role === 'admin' ? `⭐ Swagat hai Admin ${res.me.name}! Aapke paas sab powers hain (🛠 panel dekho).`
              : `Party mein aapka swagat hai, ${res.me.name}! 🎉 Games khelo, khao, nacho!`,
        });

        // Video/voice: the newcomer calls everyone already in the room.
        rtcRef.current = createRTC({
          socket,
          iceServers,
          localStream: media.stream,
          onStream: (id, stream) => setStreams((s) => ({ ...s, [id]: stream })),
          onRemove: (id) => setStreams((s) => { const n = { ...s }; delete n[id]; return n; }),
        });
        existing.forEach((p) => rtcRef.current.call(p.id).catch(() => {}));

        // Joined. The 3D landing page now finishes its walk through the door and then calls onArrived() -> stage 'room'.
        setJoined(true);
        setBusy(false);
        startMusic();
      });
    });

    socket.on('signal', (msg) => { if (rtcRef.current) rtcRef.current.handle(msg).catch(() => {}); });

    socket.on('guests', setGuests);
    socket.on('celebration', (c) => applyCeleb(c, true));

    socket.on('joined', (p) => {
      markFresh(p.name);
      world.current.others.set(p.id, p);
      setOthers((o) => (o.some((x) => x.id === p.id) ? o : [...o, p]));
      if (p.role === 'girl') {
        addChat({ sys: true, text: '👑 Manisha party mein aa gayi! Sab swagat karo 🎉💖' });
        bus.confetti && bus.confetti(p.x, 2, p.z, 320, PINK);
        if (musicRef.current) startMusic();
        flash('👑 Birthday Girl aa gayi!');
      } else addChat({ sys: true, text: `${badge(p.role)}${p.name} party mein aaye 🥳` });
      playTada();
    });
    socket.on('left', (id) => {
      const gone = world.current.others.get(id);
      world.current.others.delete(id);
      setOthers((o) => o.filter((x) => x.id !== id));
      if (rtcRef.current) rtcRef.current.close(id);
      if (gone) addChat({ sys: true, text: `${gone.name} chale gaye 👋` });
    });
    socket.on('count', setCount);
    socket.on('tick', (batch) => batch.forEach((p) => {
      const cur = world.current.others.get(p.id);
      world.current.others.set(p.id, { ...(cur || {}), ...p });
    }));
    socket.on('chat', (m) => { addChat(m); showBubble(m.id, m.text); });
    socket.on('denied', (msg) => { flash(msg); });

    // 🎉 Confetti button / key 3: the server sends it to everybody (including the person who pressed it)
    socket.on('confetti', ({ x, y, z }) => {
      bus.confetti && bus.confetti(x, y + 0.3, z, 160);
      playTada();
    });

    socket.on('react', ({ id, emoji }) => {
      setReacts((r) => ({ ...r, [id]: emoji }));
      clearTimeout(reactTimers.current[id]);
      reactTimers.current[id] = setTimeout(() => setReacts((r) => { const n = { ...r }; delete n[id]; return n; }), 2500);
    });

    socket.on('wish', ({ id, name: from, text }) => {
      addChat({ wish: true, name: from, text });
      showBubble(id, '💌 ' + text);
      const girl = [...world.current.others.values()].find((p) => p.role === 'girl') || (world.current.me.role === 'girl' ? world.current.me : null);
      bus.confetti && bus.confetti(girl ? girl.x : CAKE.x, 2.4, girl ? girl.z : CAKE.z, 70, PINK);
      playTada();
    });
    socket.on('eat', ({ id, i }) => {
      const st = STALLS[i];
      if (!st) return;
      const who = id === world.current.me.id ? world.current.me : world.current.others.get(id);
      addChat({ sys: true, text: `${who ? who.name : 'Koi'} ne ${st.name} khaya ${st.emoji}` });
      showBubble(id, `${st.emoji} ${st.yum}`);
      playCrunch();
    });
    socket.on('candles', ({ lit, by }) => {
      setCandlesLit(lit);
      if (!lit) {
        addChat({ sys: true, text: `${by} ne candles bujha di! Wish maango 🎂✨` });
        bus.confetti && bus.confetti(CAKE.x, 2.3, CAKE.z, 260);
        if (musicRef.current) startMusic(); else playBirthday(); // restart the song for everyone
      } else addChat({ sys: true, text: 'Candles dobara jal gayi 🕯️' });
    });
    socket.on('cutcake', ({ by }) => {
      addChat({ sys: true, text: `🍰 ${by} ne cake kaat diya! Sab cake khao!` });
      bus.confetti && bus.confetti(CAKE.x, 2.2, CAKE.z, 300);
      [world.current.me.id, ...world.current.others.keys()].forEach((id) => showBubble(id, '🍰 Yummy cake!'));
      world.current.emote && world.current.emote('eat');
      playCrunch(); playTada();
    });
    socket.on('wishrain', ({ by, x, z }) => {
      addChat({ sys: true, text: `✨ ${by} ne wish maangi, dil se dua do! 💖` });
      for (let k = 0; k < 6; k++) {
        setTimeout(() => mounted.current && bus.confetti && bus.confetti(x + (Math.random() - 0.5) * 8, 4 + Math.random(), z + (Math.random() - 0.5) * 8, 90, PINK), k * 250);
      }
      playTada();
    });
    socket.on('fireworks', ({ by }) => {
      addChat({ sys: true, text: `🎆 ${by} ne fireworks chala diye!` });
      for (let k = 0; k < 12; k++) {
        setTimeout(() => {
          if (!mounted.current || !bus.confetti) return;
          bus.confetti((Math.random() - 0.5) * 24, 4 + Math.random() * 2, (Math.random() - 0.5) * 22, 160);
          playPop();
        }, k * 330);
      }
    });
    socket.on('respawnAll', () => setPopped([]));
    socket.on('song', ({ on }) => {
      musicRef.current = on; setMusicOn(on);
      if (on) startMusic(); else stopMusic();
    });
    socket.on('announce', ({ text, by }) => {
      setAnnounce({ text, by });
      addChat({ sys: true, text: `📢 ${by}: ${text}` });
      clearTimeout(announceTimer.current);
      announceTimer.current = setTimeout(() => setAnnounce(null), 7000);
      playTada();
    });
    socket.on('muted', ({ on }) => {
      lockMic(on);
      flash(on ? '🔇 Admin ne aapka mic mute kar diya' : '🔊 Ab aap mic on kar sakte ho');
    });
    socket.on('mutedState', ({ id, muted }) => {
      setOthers((o) => o.map((p) => (p.id === id ? { ...p, muted } : p)));
    });
    socket.on('kicked', () => { kickedRef.current = true; });

    /* --- balloons --- */
    socket.on('pop', ({ id, by, title, text }) => {
      setPopped((p) => (p.includes(id) ? p : [...p, id]));
      const b = BALLOONS[id];
      if (b) bus.confetti && bus.confetti(b.x, b.y, b.z, 60);
      playPop();
      // The message appears on the big screen (opposite the video wall) for ~9 seconds.
      setWallMsg({ by, title, text });
      clearTimeout(wallTimer.current);
      wallTimer.current = setTimeout(() => setWallMsg(null), 9000);
    });
    socket.on('respawn', (id) => setPopped((p) => p.filter((x) => x !== id)));

    /* --- Heart Hunt --- */
    socket.on('heartTaken', ({ id, byId, n }) => {
      setHearts((h) => h.filter((x) => x.id !== id));
      if (byId === world.current.me.id) { flash(`💖 +1! Tumhare ${n} hearts`); playPop(); }
    });
    socket.on('heartSpawn', (h) => setHearts((hs) => (hs.some((x) => x.id === h.id) ? hs : [...hs, h])));
    socket.on('scores', setScores);

    /* --- Red Light Green Light --- */
    socket.on('rl', (s) => {
      setRl(s);
      const phase = s ? s.phase : '';
      if (phase !== rlPhase.current) {
        if (phase === 'green') playGo();
        else if (phase === 'red') playStop();
        else if (phase === 'over') { playTada(); if (s.winner) bus.confetti && bus.confetti(0, 2, -9, 300); }
        rlPhase.current = phase;
      }
    });
    socket.on('rlOut', ({ id, name: who }) => {
      setOutIds((o) => ({ ...o, [id]: true }));
      addChat({ sys: true, text: `❌ ${who} out ho gaya!` });
      if (id === world.current.me.id) flash('Tum out ho gaye 😅 Agli baar!');
    });
    socket.on('rlClear', () => setOutIds({}));
    socket.on('teleport', ({ x, z }) => { setPrompt(''); world.current.teleport && world.current.teleport(x, z); });

    /* --- Quiz --- */
    socket.on('quiz', (m) => {
      setQuiz(m);
      if (!m) return;
      if (m.phase === 'question') { choiceRef.current = null; setMyChoice(null); playGo(); }
      if (m.phase === 'reveal' && choiceRef.current != null) {
        if (choiceRef.current === m.correct) { flash('✅ Sahi jawab!'); playTada(); } else flash('❌ Galat jawab');
      }
      if (m.phase === 'end') { playTada(); bus.confetti && bus.confetti(0, 2, 8, 280); }
    });
    socket.on('answered', (i) => { choiceRef.current = i; setMyChoice(i); });

    /* --- gifts for Manisha --- */
    socket.on('giftAdded', (g) => {
      setUserGifts((l) => (l.some((x) => x.id === g.id) ? l : [...l, g]));
      addChat({ sys: true, text: `🎁 ${g.from} ne ${HOST} ke liye gift rakha hai!` });
      const sl = giftSlot(g.id);
      bus.confetti && bus.confetti(sl.x, 1.2, sl.z, 90, PINK);
      playTada();
    });
    socket.on('giftOpened', ({ id, from, text, photo, by }) => {
      setUserGifts((l) => l.map((g) => (g.id === id ? { ...g, opened: true } : g)));
      setGiftView({ id, from, text, photo });
      addChat({ sys: true, text: `🎁 ${by} ne ${from} ka gift khola: saamne wali screen dekho!` });
      clearTimeout(giftTimer.current);
      giftTimer.current = setTimeout(() => setGiftView(null), 20000);
      bus.confetti && bus.confetti(0, 3, 9, 240, PINK);
      playTada();
      world.current.look && world.current.look(Math.PI, 0.18); // everybody turns to watch the big screen
    });

    socket.on('disconnect', () => {
      if (leavingRef.current) { leavingRef.current = false; return; } // we pressed Exit: leaveParty() already cleaned up
      setError(kickedRef.current ? 'Admin ne aapko party se hata diya.' : 'Server se connection toot gaya. Page refresh karo.');
      stopMusic();
      setDanceZone(false);
      world.current.celebrating = false;
      if (rtcRef.current) rtcRef.current.closeAll();
      if (localRef.current) { localRef.current.getTracks().forEach((t) => t.stop()); localRef.current = null; setLocalStream(null); }
      setStage('join'); setBusy(false); setJoined(false);
    });
  }

  const emitSock = useCallback((ev, ...args) => socketRef.current && socketRef.current.emit(ev, ...args), []);
  const requestCandles = useCallback(() => emitSock('candles'), [emitSock]);
  const onPop = useCallback((id) => emitSock('pop', id), [emitSock]);
  const onGift = useCallback((i) => {
    if (!socketRef.current) return;
    socketRef.current.emit('gift', i, (res) => {
      if (res.ok) { setGift(res); playTada(); } else flash(res.error);
    });
  }, [flash]);
  const onUserGift = useCallback((id) => {
    if (!socketRef.current) return;
    socketRef.current.emit('opengift', id, (res) => { if (!res.ok) flash(res.error); });
  }, [flash]);
  const onEat = useCallback((i) => {
    if (world.current.emote) world.current.emote('eat');
    emitSock('eat', i);
  }, [emitSock]);
  const admin = (type, extra = {}) => emitSock('admin', { type, ...extra });
  const startGame = (game) => admin('game', { game });

  function toggleMic() {
    if (micLocked) return flash('Admin ne mic mute kiya hai 🔇');
    const t = localRef.current && localRef.current.getAudioTracks()[0];
    if (!t) return flash(noMediaHelp('Mic'));
    t.enabled = !t.enabled; setMicOn(t.enabled);
  }
  function toggleCam() {
    const t = localRef.current && localRef.current.getVideoTracks()[0];
    if (!t) return flash(noMediaHelp('Camera'));
    t.enabled = !t.enabled; setCamOn(t.enabled);
  }
  // Mic/camera buttons used to look dead when the browser had no access. Now they explain why.
  function noMediaHelp(what) {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return `${what} sirf https ya localhost wale link par chalta hai. Dosto ko cloudflared/ngrok ka https link bhejo 🔒`;
    }
    return `${what} ki permission nahi mili. Address bar ke 🔒 icon se Allow karo aur page refresh karo 🔄`;
  }

  // "Use (E)" now always answers, even when nothing is nearby.
  function useNearby() {
    const n = world.current.nearest && world.current.nearest();
    if (!n) return flash('Paas mein koi cheez nahi. Cake, gift, stall ya hearts ke paas jao ✋');
    world.current.interact();
  }
  function toggleMusic() {
    const next = !musicRef.current;
    musicRef.current = next; setMusicOn(next);
    if (next) startMusic(); else stopMusic();
  }

  /* --- send a gift to Manisha --- */
  async function pickPhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setGfErr('');
    try { setGfPhoto(await compressPhoto(file)); }
    catch { setGfErr('Is photo ka format nahi chala. JPG ya PNG try karo.'); }
  }
  function submitGift(e) {
    e.preventDefault();
    if (gfBusy) return;
    if (!gfText.trim() && !gfPhoto) { setGfErr('Photo ya message, kuch to daalo 🙂'); return; }
    setGfBusy(true); setGfErr('');
    emitSock('sendgift', { text: gfText, photo: gfPhoto }, (res) => {
      setGfBusy(false);
      if (!res.ok) { setGfErr(res.error); return; }
      setGiftForm(false); setGfText(''); setGfPhoto('');
      flash('🎁 Gift Manisha ke liye rakh diya gaya!');
    });
  }

  // Enter focuses chat, Esc closes gift / chat.
  useEffect(() => {
    if (stage !== 'room') return;
    const h = (e) => {
      const typing = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
      if (e.key === 'Enter' && !typing) { e.preventDefault(); inputRef.current && inputRef.current.focus(); }
      if (e.key === 'Escape') { setGift(null); setGiftForm(false); setExitAsk(false); document.activeElement && document.activeElement.blur && document.activeElement.blur(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [stage]);

  function sendChat(e) {
    e.preventDefault();
    const t = chatText.trim();
    if (t) {
      if (t.toLowerCase().startsWith('/wish ')) emitSock('wish', t.slice(6));
      else emitSock('chat', t);
    }
    setChatText('');
    inputRef.current && inputRef.current.blur();
  }
  function startWish() {
    setChatText('/wish ');
    inputRef.current && inputRef.current.focus();
  }

  // 🚪 Exit: leave the party properly (server, camera, mic, music) and go back to the join screen.
  function leaveParty() {
    leavingRef.current = true;
    stopMusic();
    setDanceZone(false);
    if (rtcRef.current) { rtcRef.current.closeAll(); rtcRef.current = null; }
    if (localRef.current) { localRef.current.getTracks().forEach((t) => t.stop()); localRef.current = null; }
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    world.current.others.clear();
    world.current.celebrating = false;
    world.current.hearts = []; world.current.userGifts = [];
    [bubbleTimers.current, reactTimers.current].forEach((t) => Object.values(t).forEach(clearTimeout));
    [toastTimer, announceTimer, wallTimer, giftTimer, freshTimer].forEach((t) => clearTimeout(t.current));
    setExitAsk(false); setGift(null); setGiftForm(false); setPrompt(''); setToast(''); setAnnounce(null); setWallMsg(null); setGiftView(null);
    setMe(null); setOthers([]); setChat([]); setBubbles({}); setReacts({}); setOutIds({}); setStreams({}); setLocalStream(null);
    setRl(null); setQuiz(null); setMyChoice(null); setHearts([]); setScores([]); setUserGifts([]); setGuests([]); setFresh(null);
    setCelebrating(false); setOnFloorUI(false); setMicLocked(false); setCount(1);
    setBusy(false); setError(''); setJoined(false);
    setLeftMsg('Aap party se bahar aa gaye 👋 Wapas aana ho to naam daalo aur dobara join karo.');
    setStage('join');
  }

  const emote = (n) => world.current.emote && world.current.emote(n);

  // What the big screen (opposite the video wall) shows: quiz > red light > opened gift > balloon message > idle.
  const screen = useMemo(() => {
    if (quiz) return { mode: 'quiz', ...quiz };
    if (rl) return { mode: 'redlight', ...rl };
    if (giftView) return { mode: 'gift', ...giftView };
    if (wallMsg) return { mode: 'pop', ...wallMsg };
    return { mode: 'idle', scores };
  }, [giftView, quiz, rl, wallMsg, scores]);

  // 3D landing page: click the door (or the button) to walk in. The real join starts when the door is clicked.
  if (stage === 'join') {
    return (
      <Landing
        name={name} setName={setName} color={color} setColor={setColor} code={code} setCode={setCode}
        error={error} leftMsg={leftMsg} busy={busy} onEnter={() => join()}
        joined={joined} onArrived={() => setStage('room')}
      />
    );
  }

  const meOut = !!outIds[me.id];
  const quizPlaying = quiz && quiz.phase === 'question';
  const parsePrompt = () => {
    if (prompt === 'cake') {
      return !privileged ? 'Candles sirf Manisha bujha sakti hai 🎂'
        : candlesLit ? 'E dabao: candles bujhao 🕯️' : 'Candles bujh chuki hain, thodi der mein dobara jalengi';
    }
    if (prompt === 'gift') return privileged ? 'E dabao: gift kholo 🎁' : 'Ye gift sirf Manisha kholegi 🎁';
    if (prompt.startsWith('ugift')) {
      const g = userGifts.find((x) => x.id === parseInt(prompt.slice(5), 10));
      const from = g ? g.from : '';
      return privileged ? `E dabao: ${from} ka gift kholo 🎁` : `${from} ka gift (sirf Manisha kholegi) 🎁`;
    }
    const st = STALLS[parseInt(prompt.slice(5), 10)];
    return st ? `E dabao: ${st.name} khao ${st.emoji}` : '';
  };

  return (
    <>
      {/* soft white-to-clear fade right after walking through the door */}
      <div className="enterfade" />
      <Scene
        me={me} others={others} bubbles={bubbles} reacts={reacts} outIds={outIds} world={world} socket={socketRef.current}
        candlesLit={candlesLit} popped={popped} screen={screen} hearts={hearts} userGifts={userGifts} rlActive={!!rl}
        guests={guests} hereNames={hereNames} fresh={fresh} clock={clock} celebrating={celebrating}
        streams={streams} localStream={localStream}
        onPrompt={setPrompt} onFloor={onFloor} onGift={onGift} onEat={onEat} onUserGift={onUserGift} onPop={onPop} requestCandles={requestCandles}
      />

      {Object.entries(streams).map(([id, s]) => <RemoteAudio key={id} stream={s} />)}

      {announce && (
        <div className="announce"><small>📢 {announce.by}</small>{announce.text}</div>
      )}
      {toast && <div className="toast">{toast}</div>}

      {celebrating && (() => {
        const left = Math.max(0, Math.ceil((clock.endsAt - (Date.now() + clock.offset)) / 1000));
        return (
          <div className="celebanner">
            🎉 HAPPY BIRTHDAY {HOST.toUpperCase()}! 🎉
            <small>Celebration: {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')} baaki · nachna ho to Dance (2) dabao!</small>
          </div>
        );
      })()}
      {onFloorUI && <div className="floorchip">🎶 Dance floor! Ye party song sirf yahan khade logon ko sunai deta hai</div>}

      {rl && (
        <div className={'rlbanner ' + rl.phase}>
          {rl.phase === 'countdown' && '🚦 Tayyar ho jao!'}
          {rl.phase === 'green' && '🟢 GO! Daudo!'}
          {rl.phase === 'red' && '🔴 STOP! Hilo mat!'}
          {rl.phase === 'over' && (rl.winner ? `🏆 ${rl.winner} jeet gaya!` : 'Koi nahi jeeta 😅')}
          <small>{rl.phase !== 'over' && `Bache hue ${rl.alive}/${rl.total}`}{meOut && ' · ❌ Tum out ho'}</small>
        </div>
      )}

      {quizPlaying && (
        <div className="quiz">
          {role === 'guest' ? (
            <>
              <div className="qhead">🧠 Sawaal {quiz.idx + 1}/{quiz.total}: {quiz.q}</div>
              <div className="qopts">
                {quiz.options.map((o, i) => (
                  <button key={i} className={myChoice === i ? 'sel' : ''} disabled={myChoice != null} onClick={() => emitSock('answer', i)}>
                    {'ABCD'[i]}) {o}
                  </button>
                ))}
              </div>
              {myChoice != null && <div className="qnote">Jawab lock ho gaya ✅ Baaki logon ka wait karo…</div>}
            </>
          ) : (
            <div className="qhead">👀 Quiz chal raha hai. Friends khel rahe hain, tum sirf dekh sakte ho!</div>
          )}
        </div>
      )}

      <div className="panel top-left">
        <b>👥 {count} log party mein</b>
        <ul>
          <li style={{ color: me.color }}>● {badge(role)}{meOut ? '❌ ' : ''}{me.name} (tum)</li>
          {others.map((p) => <li key={p.id} style={{ color: p.color }}>● {badge(p.role)}{outIds[p.id] ? '❌ ' : ''}{p.name}{p.muted ? ' 🔇' : ''}</li>)}
        </ul>
        {scores.length > 0 && (
          <div className="scoreboard">
            <b>💖 Heart Hunt</b>
            {scores.slice(0, 3).map((s, i) => <div key={i}>{['🥇', '🥈', '🥉'][i]} {s.name}: {s.n}</div>)}
          </div>
        )}
        {note && <div className="note">{note}</div>}
      </div>

      <div className="panel top-right help">
        <b>{isGirl ? '👑 Birthday Girl' : isAdmin ? '⭐ Admin' : 'Friend'} controls</b>
        <div>WASD / ↑←↓→ — chalo · Shift — daudo</div>
        <div>Space — kudo · Mouse drag — camera</div>
        <div>1 wave · 2 dance (on/off) · 3 confetti{isGirl ? ' · 4 twirl' : ''}</div>
        <div>5 ❤️ · 6 😂 · 7 👏 · 8 🔥 reactions</div>
        <div>E — paas ki cheez use karo</div>
        <div>💖 Hearts ko chhuo, points milenge</div>
        {role === 'guest' && <div className="locked">🔒 Candles, cake aur gifts sirf Manisha ke liye</div>}
      </div>

      {isAdmin && (
        <div className="panel admin-panel">
          <button className="mini" onClick={() => setAdminOpen((v) => !v)}>🛠 Admin {adminOpen ? '▾' : '▸'}</button>
          {adminOpen && (
            <>
              <div className="row">
                <button onClick={() => startGame('redlight')}>🚦 Red Light</button>
                <button onClick={() => startGame('quiz')}>🧠 Quiz</button>
                <button onClick={() => startGame('stop')}>⏹ Game stop</button>
                <button onClick={() => startGame('resethearts')}>♻️ Hearts reset</button>
              </div>
              <div className="row">
                <button onClick={() => admin('celebrate', { on: true })}>🎉 Celebration abhi</button>
                <button onClick={() => admin('celebrate', { on: false })}>⏹ Celebration stop</button>
              </div>
              <div className="row">
                <button onClick={() => admin('fireworks')}>🎆 Fireworks</button>
                <button onClick={() => admin('relight')}>🕯️ Relight</button>
                <button onClick={() => admin('balloons')}>🎈 Balloons</button>
              </div>
              <div className="row">
                <button onClick={() => admin('song', { on: true })}>🎵 Song sab ke liye</button>
                <button onClick={() => admin('song', { on: false })}>⏹ Stop</button>
              </div>
              <div className="row">
                <button onClick={() => admin('muteall', { on: true })}>🔇 Sab mute</button>
                <button onClick={() => admin('muteall', { on: false })}>🔊 Sab unmute</button>
              </div>
              <form className="row" onSubmit={(e) => { e.preventDefault(); if (announceText.trim()) admin('announce', { text: announceText }); setAnnounceText(''); }}>
                <input className="field tiny" value={announceText} maxLength={120} placeholder="📢 Sabko announcement…" onChange={(e) => setAnnounceText(e.target.value)} />
              </form>
              <div className="people">
                {others.length === 0 && <div className="dim">Abhi koi aur nahi hai</div>}
                {others.map((p) => (
                  <div key={p.id} className="person">
                    <span style={{ color: p.color }}>{badge(p.role)}{p.name}{p.muted ? ' 🔇' : ''}</span>
                    <span>
                      <button title="mute / unmute" onClick={() => admin('mute', { target: p.id, on: !p.muted })}>{p.muted ? '🔊' : '🔇'}</button>
                      <button title="kick" onClick={() => { if (window.confirm(`${p.name} ko party se hatana hai?`)) admin('kick', { target: p.id }); }}>🚫</button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {prompt && parsePrompt() && <div className="prompt">{parsePrompt()}</div>}

      <div className="chat">
        <div className="log">
          {chat.slice(-7).map((m, i) => (
            <div key={i} className={m.sys ? 'sys' : m.wish ? 'wishline' : ''}>
              {m.sys ? m.text : m.wish ? <>💌 <b>{m.name}</b> ({HOST} ke liye): {m.text}</> : <><b>{badge(m.role)}{m.name}:</b> {m.text}</>}
            </div>
          ))}
        </div>
        <form onSubmit={sendChat}>
          <input
            ref={inputRef} className="field" value={chatText} maxLength={126}
            placeholder="Enter dabao aur message likho…" onChange={(e) => setChatText(e.target.value)}
          />
        </form>
      </div>

      {/* mouse-down is cancelled so a clicked button never keeps keyboard focus (otherwise Space/Enter would press it again) */}
      <div className="emotes" onMouseDown={(e) => e.preventDefault()}>
        <button onClick={toggleMic} className={micOn ? '' : 'off'}>
          {micLocked ? '🔒 Mic (mute)' : micOn ? '🎤 Mic' : '🔇 Mic off'}
        </button>
        <button onClick={toggleCam} className={camOn ? '' : 'off'}>{camOn ? '📷 Camera' : '🚫 Cam off'}</button>
        <button onClick={toggleMusic} className={musicOn ? '' : 'off'}>{musicOn ? '🎵 Song' : '🔈 Song off'}</button>
        <button onClick={() => world.current.look && world.current.look(Math.PI, 0.18)}>📺 Screen</button>
        <button onClick={() => world.current.look && world.current.look(0, 0.2)}>🎥 Video wall</button>
        <button onClick={() => emote('wave')}>👋 Wave</button>
        <button onClick={() => emote('dance')}>💃 Dance</button>
        <button onClick={() => { setAutoDance((v) => !v); flash(autoDance ? 'Auto-dance band: ab floor par khud nahi nachoge' : 'Auto-dance chalu: floor par khade hote hi nachoge 💃'); }} className={autoDance ? '' : 'off'}>
          {autoDance ? '🕺 Auto-dance ON' : '🚫 Auto-dance OFF'}
        </button>
        <button onClick={() => emote('jump')}>⬆️ Jump</button>
        {REACTIONS.map((r) => <button key={r} className="react" onClick={() => emitSock('react', r)}>{r}</button>)}
        <button onClick={() => world.current.confetti && world.current.confetti()}>🎉 Confetti</button>
        {!isGirl && <button className="gift" onClick={() => { setGfErr(''); setGiftForm(true); }}>🎁 Gift bhejo</button>}
        {!isGirl && <button className="love" onClick={startWish}>💌 Wish</button>}
        {privileged && (
          <>
            <button className="gold" onClick={requestCandles}>🕯️ Candles</button>
            <button className="gold" onClick={() => emitSock('cutcake')}>🍰 Cake kaato</button>
            <button className="gold" onClick={() => emitSock('wishrain')}>✨ Wish maango</button>
          </>
        )}
        {isGirl && <button className="gold" onClick={() => emote('twirl')}>🌸 Twirl</button>}
        <button onClick={useNearby}>✋ Use (E)</button>
        <button className="exit" onClick={() => setExitAsk(true)}>🚪 Exit</button>
      </div>

      {exitAsk && (
        <div className="modal" onClick={() => setExitAsk(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="title small">🚪 Party se bahar jana hai?</div>
            <p>Camera, mic aur music band ho jayenge. Dobara aana ho to naam daalke phir join kar sakte ho.</p>
            <div className="gfbtns">
              <button className="btn ghost" onClick={() => setExitAsk(false)}>Ruko, rukta hu</button>
              <button className="btn exitbtn" onClick={leaveParty}>Haan, bahar</button>
            </div>
          </div>
        </div>
      )}

      {giftForm && (
        <div className="modal" onClick={() => setGiftForm(false)}>
          <form className="modal-card giftform" onClick={(e) => e.stopPropagation()} onSubmit={submitGift}>
            <div className="title small">🎁 {HOST} ke liye gift</div>
            <p>Ek photo aur pyaara sa message daalo. {HOST} jab gift kholegi, ye saamne wali badi screen par sabko dikhega.</p>
            <label className="photo-pick">
              {gfPhoto ? <img src={gfPhoto} alt="preview" /> : <span>📷 Photo chuno (optional)</span>}
              <input type="file" accept="image/*" onChange={pickPhoto} hidden />
            </label>
            {gfPhoto && <button type="button" className="linkbtn" onClick={() => setGfPhoto('')}>Photo hatao</button>}
            <textarea
              className="field" rows={3} maxLength={220} value={gfText} placeholder={`${HOST} ke liye apna message likho… 💖`}
              onChange={(e) => setGfText(e.target.value)}
            />
            {gfErr && <div className="err">{gfErr}</div>}
            <div className="gfbtns">
              <button type="button" className="btn ghost" onClick={() => setGiftForm(false)}>Cancel</button>
              <button className="btn" disabled={gfBusy}>{gfBusy ? 'Bhej rahe hain…' : 'Gift rakh do 🎁'}</button>
            </div>
          </form>
        </div>
      )}

      {gift && (
        <div className="modal" onClick={() => setGift(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="title small">{gift.title}</div>
            <p>{gift.text}</p>
            <button className="btn" onClick={() => setGift(null)}>Band karo 💖</button>
          </div>
        </div>
      )}
    </>
  );
}
