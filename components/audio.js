// Party audio.
//   fx    -> sound effects (synth), straight to the speakers
//   bg    -> the "Happy Birthday" music everyone hears, played in a loop
//   dance -> the party song that only people standing on the dance floor hear
// REAL SONGS: drop mp3 files into  public/audio/  (the folder is served as /audio/...):
//   a name with "birthday"  (e.g. Happy_Birthday_Song.mp3)  -> loops as the party music for everybody
//   a name with "party" / "dance" / "disco"                 -> plays on the dance floor
// Without a file, the built-in synthesized version of each is used.
let ctx = null;
let bgBus = null;
let danceBus = null;
let active = []; // scheduled oscillators of the birthday loop
let danceActive = []; // scheduled nodes of the party song
let loopTimer = null;
let looping = false;
let danceTimer = null;
let danceOn = false;
let danceNext = 0;
let noise = null;
let songs = { birthday: null, party: null }; // real mp3 files found in public/audio (null = use the synth)
let probe = Promise.resolve(); // resolves once we know which files exist
let probing = false;
let birthdayEl = null; // <audio> of the real birthday song
let fileEl = null; // <audio> of the real dance-floor song
let musicToken = 0; // lets a newer startMusic() cancel an older one that was still waiting

function ac() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    bgBus = ctx.createGain(); bgBus.connect(ctx.destination);
    danceBus = ctx.createGain(); danceBus.gain.value = 0; danceBus.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const target = (a, bus) => (bus === 'bg' ? bgBus : bus === 'dance' ? danceBus : a.destination);

function note(freq, start, dur, type = 'triangle', vol = 0.18, track = false, bus = 'fx') {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = a.currentTime + Math.max(0, start);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(target(a, bus));
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  if (track) (bus === 'dance' ? danceActive : active).push(o);
}

export function unlockAudio() {
  ac();
  if (!probing && typeof fetch !== 'undefined') {
    probing = true;
    probe = fetch('/api/has-song')
      .then((r) => r.json())
      .then((j) => { songs = { birthday: j.birthday || null, party: j.party || null }; })
      .catch(() => {});
  }
}

// The real birthday song goes through the "bg" bus too, so it fades out on the dance floor like the synth version.
function birthdayAudio(a) {
  if (!birthdayEl) {
    birthdayEl = new Audio(songs.birthday);
    birthdayEl.preload = 'auto';
    try { a.createMediaElementSource(birthdayEl).connect(bgBus); } catch {}
  }
  return birthdayEl;
}

/* ----------------------------- Happy Birthday ----------------------------- */
// "Happy birthday to you ... happy birthday dear Manisha" with a simple bass line.
// Returns the song length in seconds.
function sing(vol) {
  const D = 293.66, E = 329.63, F = 349.23, G = 392, A = 440, Bb = 466.16, C2 = 523.25;
  const phrases = [
    { bass: 130.81, notes: [[G, 0.25], [G, 0.25], [A, 0.5], [G, 0.5], [C2, 0.5], [Bb, 1]] },
    { bass: 98, notes: [[G, 0.25], [G, 0.25], [A, 0.5], [G, 0.5], [D * 2, 0.5], [C2, 1]] },
    { bass: 130.81, notes: [[G, 0.25], [G, 0.25], [G * 2, 0.5], [E * 2, 0.5], [C2, 0.5], [Bb, 0.5], [A, 0.75]] },
    { bass: 87.31, notes: [[F * 2, 0.25], [F * 2, 0.25], [E * 2, 0.5], [C2, 0.5], [D * 2, 0.5], [C2, 1.2]] },
  ];
  let t = 0;
  phrases.forEach((ph) => {
    const len = ph.notes.reduce((s, [, d]) => s + d * 0.9, 0);
    note(ph.bass, t, len, 'sine', vol * 0.9, true, 'bg');
    note(ph.bass * 1.5, t, len, 'sine', vol * 0.35, true, 'bg');
    ph.notes.forEach(([f, d]) => { note(f, t, d * 0.9, 'triangle', vol, true, 'bg'); t += d * 0.9; });
  });
  return t;
}

export function stopMusic() {
  musicToken += 1;
  looping = false;
  clearTimeout(loopTimer);
  active.forEach((o) => { try { o.stop(); } catch {} });
  active = [];
  if (birthdayEl) birthdayEl.pause();
}

// Plays the birthday music in a loop until stopMusic(): the real mp3 from public/audio if there is one
// (seamless loop), otherwise the synthesized tune over and over.
export function startMusic() {
  stopMusic();
  const a = ac();
  if (!a) return;
  looping = true;
  const mine = musicToken;
  probe.then(() => {
    if (mine !== musicToken || !looping) return; // stopped or restarted meanwhile
    if (songs.birthday) {
      const el = birthdayAudio(a);
      el.loop = true;
      el.volume = 0.8;
      el.currentTime = 0;
      el.play().catch(() => {});
      return;
    }
    const run = () => {
      if (!looping) return;
      active = [];
      const len = sing(0.1);
      loopTimer = setTimeout(run, (len + 4) * 1000);
    };
    run();
  });
}

// Louder one-shot (no loop), used when the candles are blown out while the music is switched off.
export function playBirthday() {
  const a = ac();
  if (a && songs.birthday) {
    const el = birthdayAudio(a);
    el.loop = false;
    el.volume = 1;
    el.currentTime = 0;
    el.play().catch(() => {});
    return;
  }
  sing(0.2);
}

/* ------------------- Dance-floor party song (only on the floor) ------------------- */
const BEAT = 60 / 124; // 124 BPM
const BAR = BEAT * 4;
const LOOP = BAR * 4;
const CHORDS = [
  { root: 110, tones: [220, 261.63, 329.63, 440] }, // Am
  { root: 87.31, tones: [174.61, 220, 261.63, 349.23] }, // F
  { root: 130.81, tones: [261.63, 329.63, 392, 523.25] }, // C
  { root: 98, tones: [196, 246.94, 293.66, 392] }, // G
];
const HOOK = [440, 523.25, 587.33, 523.25, 659.25, 587.33, 523.25, 440]; // one note per 8th, A minor pentatonic

function noiseBuf(a) {
  if (!noise) {
    noise = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function kick(a, t) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.connect(g).connect(danceBus);
  o.start(t); o.stop(t + 0.3);
  danceActive.push(o);
}

function hiss(a, t, dur, filterType, freq, vol) {
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf(a);
  f.type = filterType; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(danceBus);
  s.start(t); s.stop(t + dur + 0.02);
  danceActive.push(s);
}

function tone(a, f, t, dur, type, vol, lowpass) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (lowpass) {
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lowpass;
    o.connect(lp).connect(g);
  } else o.connect(g);
  g.connect(danceBus);
  o.start(t); o.stop(t + dur + 0.05);
  danceActive.push(o);
}

// 4 bars: four-on-the-floor kick, claps, hats, bouncing bass, arpeggio and a catchy hook.
function danceBlock(a, t0) {
  for (let bar = 0; bar < 4; bar++) {
    const ch = CHORDS[bar];
    const b0 = t0 + bar * BAR;
    for (let beat = 0; beat < 4; beat++) {
      const tb = b0 + beat * BEAT;
      kick(a, tb);
      if (beat % 2 === 1) hiss(a, tb, 0.14, 'bandpass', 1600, 0.16); // clap
      hiss(a, tb + BEAT / 2, 0.06, 'highpass', 7000, 0.07); // off-beat hat
      for (let h = 0; h < 2; h++) tone(a, ch.root * (h ? 2 : 1), tb + (h * BEAT) / 2, BEAT / 2 * 0.9, 'square', 0.07, 420);
      for (let s = 0; s < 4; s++) tone(a, ch.tones[(beat + s) % 4] * (s % 2 ? 2 : 1), tb + (s * BEAT) / 4, (BEAT / 4) * 0.9, 'triangle', 0.035);
    }
    HOOK.forEach((f, i) => {
      if (bar % 2 === 0 || i < 4) tone(a, f, b0 + (i * BEAT) / 2, (BEAT / 2) * 0.8, 'square', 0.028, 2400);
    });
  }
}

function startDance() {
  const a = ac();
  if (!a || danceOn) return;
  danceOn = true;
  const t = a.currentTime;
  danceBus.gain.cancelScheduledValues(t);
  danceBus.gain.setTargetAtTime(1, t, 0.12);
  if (songs.party) {
    if (!fileEl) { fileEl = new Audio(songs.party); fileEl.loop = true; fileEl.volume = 0.85; }
    fileEl.play().catch(() => {});
    return;
  }
  danceNext = t + 0.1;
  danceBlock(a, danceNext);
  danceNext += LOOP;
  danceTimer = setInterval(() => {
    while (danceNext - a.currentTime < LOOP) { danceBlock(a, danceNext); danceNext += LOOP; }
  }, 1500);
}

function stopDance() {
  if (!danceOn) return;
  danceOn = false;
  clearInterval(danceTimer);
  const a = ac();
  if (a) { danceBus.gain.cancelScheduledValues(a.currentTime); danceBus.gain.setTargetAtTime(0, a.currentTime, 0.1); }
  setTimeout(() => {
    if (danceOn) return; // somebody stepped back onto the floor
    danceActive.forEach((o) => { try { o.stop(); } catch {} });
    danceActive = [];
    if (fileEl) fileEl.pause();
  }, 700);
}

// true while the player stands on the dance floor: the party song fades in and the birthday loop fades out.
export function setDanceZone(on) {
  const a = ac();
  if (!a) return;
  bgBus.gain.cancelScheduledValues(a.currentTime);
  bgBus.gain.setTargetAtTime(on ? 0 : 1, a.currentTime, 0.15);
  if (on) startDance(); else stopDance();
}

/* ------------------------------ sound effects ------------------------------ */
export function playPop() {
  note(520, 0, 0.08, 'square', 0.12);
  note(180, 0.02, 0.12, 'sawtooth', 0.1);
}

export function playTada() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.09, 0.3, 'triangle', 0.15));
}

export function playGo() {
  note(660, 0, 0.12, 'square', 0.1);
  note(990, 0.1, 0.18, 'square', 0.1);
}

export function playStop() {
  note(220, 0, 0.25, 'sawtooth', 0.12);
  note(165, 0.12, 0.3, 'sawtooth', 0.12);
}

export function playCrunch() {
  note(240, 0, 0.05, 'square', 0.1);
  note(200, 0.07, 0.05, 'square', 0.1);
  note(660, 0.16, 0.12, 'triangle', 0.1);
}
