'use client';
// "Masti Duniya": a second 3D world (a mela: fun-fair rides, a bazaar of stalls and games, and a beach at sunset),
// reached through a gate in the party hall. Everything here is drawn locally; only the player positions come
// from the server (each player has a `world`). All rides run on the shared wall clock, so two people on the same
// ride are always in the same place.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { PARTNER, HOST } from './data';
import * as THREE from 'three';

export const FUN = {
  B: 44, // walkable half-size
  spawn: { x: 0, z: 15 }, // where you appear
  gate: { x: 0, z: 19.5 }, // gate back to the party hall
  gateStand: { x: 0, z: 18.4 }, // stand here to use it
  coaster: { x: -27, z: -17 },
  ferris: { x: 24, z: -17 },
  carousel: { x: 25, z: 5 },
  jhoola: { x: -27, z: 10 },
  swings: { x: 34, z: 14 },
  lighthouse: { x: -31, z: 40 },
  hotair: { x: 14, z: -36 },
  pirate: { x: -12, z: -35 },
  bumper: { x: 29, z: -35 },
  fountain: { x: 0, z: -33 },
  tower: { x: 38, z: -6 },
  arch: { x: 0, z: -41 },
};
// Every ride is worked out from ONE clock, so two people on two computers always see it in the same place.
// The server's time is sampled a few times (the quickest answer is the most exact) and kept as an offset.
let clockOffset = 0, bestRtt = Infinity;
export function clockSample(t0, serverMs, t1) {
  const rtt = t1 - t0;
  if (rtt <= bestRtt + 30) { bestRtt = Math.min(bestRtt, rtt); clockOffset = serverMs + rtt / 2 - t1; }
}
export const syncedNow = () => Date.now() + clockOffset;
const now = () => syncedNow() / 1000;
if (typeof window !== 'undefined') window.__funNow = syncedNow; // for the automated tests

/* ---------------------------- roller coaster path ---------------------------- */
const C0 = FUN.coaster, K = 0.8; // the whole track is drawn a bit smaller so it clears the bazaar
const PTS = [[0, 0.7, 12], [9, 1.6, 11], [16, 6, 6], [19, 12.5, -2], [13, 5, -9], [5, 9.5, -13], [-5, 14, -10], [-13, 7, -4], [-17, 3, 3], [-12, 1.4, 9], [-5, 0.9, 12.5]];
export const coasterCurve = new THREE.CatmullRomCurve3(PTS.map(([x, y, z]) => new THREE.Vector3(C0.x + x * K, y, C0.z + z * K)), true, 'catmullrom', 0.5);
export const RIDE_SECS = 34; // one lap
export const COASTER_STATION = { x: C0.x + PTS[0][0] * K, z: C0.z + PTS[0][2] * K };
export const COASTER_EXIT = { x: COASTER_STATION.x, z: COASTER_STATION.z + 2.6 };

/* --------------------------------- the rides --------------------------------- */
const FER_R = 7.6, FER_H = 9.0, FER_W = 0.16, FER_N = 12; // giant wheel
const CAR_W = 0.6, CAR_N = 8; // carousel
const JH_W = 0.9, JH_N = 8; // jhoola (chair swing)
const jhoolaTilt = (t) => 0.18 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.45));

export const RIDES = {
  coaster: { name: 'Roller Coaster', emoji: '🎢', dur: RIDE_SECS, stand: { x: COASTER_STATION.x, z: COASTER_STATION.z + 1.3 }, exit: COASTER_EXIT },
  ferris: { name: 'Giant Wheel', emoji: '🎡', dur: (Math.PI * 2) / FER_W, stand: { x: FUN.ferris.x, z: FUN.ferris.z + 3.8 }, exit: { x: FUN.ferris.x, z: FUN.ferris.z + 4.6 } },
  carousel: { name: 'Carousel', emoji: '🎠', dur: 36, stand: { x: FUN.carousel.x, z: FUN.carousel.z + 5.6 }, exit: { x: FUN.carousel.x, z: FUN.carousel.z + 6.4 } },
  jhoola: { name: 'Jhoola', emoji: '🪑', dur: 40, stand: { x: FUN.jhoola.x, z: FUN.jhoola.z + 3.8 }, exit: { x: FUN.jhoola.x, z: FUN.jhoola.z + 4.6 } },
  swing: { name: 'Swing', emoji: '🛝', dur: 50, stand: { x: FUN.swings.x, z: FUN.swings.z + 3.0 }, exit: { x: FUN.swings.x, z: FUN.swings.z + 3.8 } },
  hotair: { name: 'Hot Air Balloon', emoji: '🎈', dur: 50, stand: { x: FUN.hotair.x, z: FUN.hotair.z + 4.2 }, exit: { x: FUN.hotair.x, z: FUN.hotair.z + 5.0 } },
  tower: { name: 'View Tower', emoji: '🗼', dur: 600, stand: { x: FUN.tower.x, z: FUN.tower.z + 3.8 }, exit: { x: FUN.tower.x, z: FUN.tower.z + 4.6 } },
  pirate: { name: 'Pirate Ship', emoji: '🏴‍☠️', dur: 50, stand: { x: FUN.pirate.x, z: FUN.pirate.z + 8.4 }, exit: { x: FUN.pirate.x, z: FUN.pirate.z + 9.2 } },
};

// The hot-air balloon is steered by whoever sits in it. The server moves it; everybody receives the same position
// (tx/ty/tz) and the drawn balloon (x/y/z) glides towards it.
export const balloonState = { x: FUN.hotair.x, y: 0.35, z: FUN.hotair.z, tx: FUN.hotair.x, ty: 0.35, tz: FUN.hotair.z, n: 0, mine: false, vx: 0, vy: 0, vz: 0, inp: { x: 0, z: 0, y: 0 } };
export const balloonSet = (d) => { balloonState.tx = d.x; balloonState.ty = d.y; balloonState.tz = d.z; balloonState.n = d.n || 0; };
export const balloonGlide = (dt) => {
  const b = balloonState;
  if (b.mine) {
    // I am steering: move the balloon on my own screen at once (same physics as the server), and only nudge it
    // towards the server's position so the two never drift apart. No waiting for the network = no stutter.
    const i = b.inp || { x: 0, z: 0, y: 0 }, a = Math.min(1, dt * 4.5);
    b.vx += (i.x * 9 - b.vx) * a; b.vz += (i.z * 9 - b.vz) * a; b.vy += (i.y * 5.5 - b.vy) * a;
    b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
    const ex = b.tx - b.x, ey = b.ty - b.y, ez = b.tz - b.z, far = Math.hypot(ex, ey, ez) > 4;
    const g = far ? Math.min(1, dt * 6) : Math.min(1, dt * 0.7);
    b.x += ex * g; b.y += ey * g; b.z += ez * g;
    const ox = b.x - FUN.hotair.x, oz = b.z - FUN.hotair.z, od = Math.hypot(ox, oz);
    if (od > 30) { b.x = FUN.hotair.x + (ox / od) * 30; b.z = FUN.hotair.z + (oz / od) * 30; }
    b.y = Math.max(0.35, Math.min(19, b.y));
  } else {
    const k = 1 - Math.exp(-dt * 14);
    b.x += (b.tx - b.x) * k; b.y += (b.ty - b.y) * k; b.z += (b.tz - b.z) * k;
  }
  // the basket is only solid while it sits on the ground at home (otherwise an invisible wall stays behind)
  const blk = FUN_BLOCKS.find((c) => c.x === FUN.hotair.x && c.z === FUN.hotair.z);
  if (blk) blk.r = b.y < 1.5 && Math.hypot(b.x - FUN.hotair.x, b.z - FUN.hotair.z) < 2 ? 1.6 : 0;
};
export const hotairCanBoard = () => balloonState.ty < 1.2 && Math.hypot(balloonState.tx - FUN.hotair.x, balloonState.tz - FUN.hotair.z) < 3.5;
const PIR_PIVOT = 9, PIR_ARM = 6;
const pirateAngle = (t) => Math.sin(t * 0.9) * 0.85;

// where seat number `seat` of a ride is at wall-clock time t (seconds): world position + the way it is facing
export function ridePose(id, seat, t) {
  if (id === 'ferris') {
    const a = (seat / FER_N) * Math.PI * 2 + t * FER_W;
    return { x: FUN.ferris.x + Math.cos(a) * FER_R, y: FER_H + Math.sin(a) * FER_R - 1.05, z: FUN.ferris.z, ry: 0 };
  }
  if (id === 'carousel') {
    const a = (seat / CAR_N) * Math.PI * 2, th = t * CAR_W;
    const x = Math.cos(a) * 2.7, z = Math.sin(a) * 2.7;
    const xr = x * Math.cos(th) + z * Math.sin(th), zr = -x * Math.sin(th) + z * Math.cos(th);
    return { x: FUN.carousel.x + xr, y: 1.2 + Math.sin(t * 2.2 + seat * 1.1) * 0.35 + 0.3, z: FUN.carousel.z + zr, ry: Math.atan2(zr, -xr) };
  }
  if (id === 'jhoola') {
    const psi = (seat / JH_N) * Math.PI * 2 + t * JH_W, tilt = jhoolaTilt(t), r = 3.3 + 4.5 * Math.sin(tilt);
    return { x: FUN.jhoola.x + r * Math.cos(psi), y: 9 - 4.5 * Math.cos(tilt) + 0.08, z: FUN.jhoola.z - r * Math.sin(psi), ry: Math.atan2(-Math.sin(psi), -Math.cos(psi)) };
  }
  if (id === 'hotair') {
    const b = balloonState;
    return { x: b.x + (seat ? 0.45 : -0.45), y: b.y + 0.15, z: b.z, ry: 0 };
  }
  if (id === 'pirate') {
    const a = pirateAngle(t);
    return { x: FUN.pirate.x + (seat - 2) * 1.1, y: PIR_PIVOT - PIR_ARM * Math.cos(a) + 0.35, z: FUN.pirate.z - PIR_ARM * Math.sin(a), ry: 0 };
  }
  const al = Math.sin(t * 1.6 + seat * 1.3) * 0.7; // swing
  return { x: FUN.swings.x + (seat ? 0.8 : -0.8), y: 3.0 - 2.6 * Math.cos(al) + 0.05, z: FUN.swings.z - 2.6 * Math.sin(al), ry: 0 };
}

// which seat you get when you board at (px, pz)
export const TOWER_H = 27; // height of the viewing deck
export function pickSeat(id, px, pz, t) {
  if (id === 'tower') return 0;
  if (id === 'swing') return px > FUN.swings.x ? 1 : 0;
  if (id === 'hotair') return px > FUN.hotair.x ? 1 : 0;
  if (id === 'pirate') return Math.max(0, Math.min(4, Math.round((px - FUN.pirate.x) / 1.1) + 2));
  const n = id === 'ferris' ? FER_N : id === 'carousel' ? CAR_N : JH_N;
  let best = 0, bestV = Infinity;
  for (let i = 0; i < n; i++) {
    const p = ridePose(id, i, t);
    const v = id === 'ferris' ? p.y : Math.hypot(p.x - px, p.z - pz);
    if (v < bestV) { bestV = v; best = i; }
  }
  return best;
}

/* -------------------------- the bazaar (stalls + games) -------------------------- */
const SX = 6.5; // stalls stand on both sides of the road
// kind: food (eat), game (opens a mini game), shop (prize shop), photo (selfie booth), fortune (kismat + love meter), balloon (a free balloon)
const BOOTH_LIST = [
  { id: 'balloon', kind: 'game', side: -1, z: -1, name: 'Gubbare Phodo', emoji: '🎯', color: '#e63946' },
  { id: 'mole', kind: 'game', side: -1, z: -7, name: 'Chuha Maaro', emoji: '🔨', color: '#2a9d8f' },
  { id: 'striker', kind: 'game', side: -1, z: -13, name: 'Taqat Tester', emoji: '🔔', color: '#e9c46a' },
  { id: 'memory', kind: 'game', side: -1, z: -19, name: 'Jodi Milao', emoji: '🃏', color: '#7c4dff' },
  { id: 'shop', kind: 'shop', side: 1, z: -1, name: 'Inaam Ki Dukaan', emoji: '🎁', color: '#f72585' },
  { id: 'photo', kind: 'photo', side: 1, z: -7, name: 'Photo Booth', emoji: '📸', color: '#ff4f9a' },
  { id: 'fortune', kind: 'fortune', side: 1, z: -13, name: 'Kismat Tent', emoji: '🔮', color: '#6a4c93' },
  { id: 'gubbara', kind: 'balloon', side: 1, z: -19, name: 'Gubbare Wala', emoji: '🎈', color: '#ef476f', yum: 'Ye lo gubbara! 🎈' },
];
export const MELA_BOOTHS = BOOTH_LIST.map((b) => ({ ...b, x: b.side * SX }));
export const boothStand = (b) => ({ x: b.x - b.side * 2.3, z: b.z }); // stand here, in front of the counter

export const FUN_BLOCKS = [ // solid circles (x, z, radius) so nobody walks through the rides
  { x: FUN.ferris.x, z: FUN.ferris.z, r: 3.2 },
  { x: FUN.carousel.x, z: FUN.carousel.z, r: 4.1 },
  { x: FUN.jhoola.x, z: FUN.jhoola.z, r: 1.2 },
  { x: FUN.lighthouse.x, z: FUN.lighthouse.z, r: 2.0 },
  { x: FUN.hotair.x, z: FUN.hotair.z, r: 1.6 },
  { x: FUN.pirate.x - 4.4, z: FUN.pirate.z, r: 0.9 },
  { x: FUN.pirate.x + 4.4, z: FUN.pirate.z, r: 0.9 },
  { x: FUN.fountain.x, z: FUN.fountain.z, r: 3.9 },
  { x: FUN.tower.x, z: FUN.tower.z, r: 2.4 },
];
export const FUN_RECTS = [
  ...MELA_BOOTHS.map((b) => ({ x: b.x, z: b.z, w: 1.4, d: 3.1 })), // the stall counters
  { x: FUN.bumper.x, z: FUN.bumper.z, w: 13, d: 10 }, // the bumper-car arena
];

/* ------------------------------- small helpers ------------------------------- */
function useCanvasTex(draw, w, h) {
  const { canvas, tex } = useMemo(() => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return { canvas: c, tex: t };
  }, [w, h]);
  useEffect(() => {
    const paint = () => { const g = canvas.getContext('2d'); draw(g, w, h); tex.needsUpdate = true; };
    paint();
    if (document.fonts) document.fonts.load('700 80px "Dancing Script"').then(paint).catch(() => {});
  }, [canvas, tex, w, h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function Sign({ text, color = '#ff4f9a', position, width = 3.6, height = 0.9 }) {
  const tex = useCanvasTex((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 36); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 92px "Dancing Script", cursive';
    g.fillText(text, w / 2, h / 2 + 4);
  }, 768, 192);
  return <mesh position={position}><planeGeometry args={[width, height]} /><meshBasicMaterial map={tex} transparent toneMapped={false} /></mesh>;
}

const rideClick = (onRide, id) => (e) => { if (e.delta < 6) { e.stopPropagation(); onRide && onRide(id); } };

// A glowing doorway. `label` is written above it. Click it (or press E next to it) to go through.
export function Portal({ position, rotation = [0, 0, 0], label, c1 = '#ff4f9a', c2 = '#7c4dff', onClick }) {
  const swirl = useRef();
  const tex = useCanvasTex((g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, c1); grad.addColorStop(1, c2);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    for (let arm = 0; arm < 4; arm++) {
      g.beginPath();
      for (let a = 0; a < 14; a += 0.1) {
        const r = 8 + a * 8.6, ang = a + arm * (Math.PI / 2);
        const x = w / 2 + Math.cos(ang) * r, y = h / 2 + Math.sin(ang) * r;
        if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 9; g.stroke();
    }
  }, 256, 256);
  useFrame(({ clock }) => { if (swirl.current) swirl.current.rotation.z = clock.elapsedTime * 0.9; });
  const post = '#fff5e6';
  return (
    <group
      position={position} rotation={rotation}
      onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onClick && onClick(); } }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}
    >
      {[-1.55, 1.55].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 2.1, 0]}><boxGeometry args={[0.4, 4.2, 0.45]} /><meshStandardMaterial color={post} /></mesh>
          {[0.6, 1.5, 2.4, 3.3].map((y, i) => (
            <mesh key={y} position={[0, y, 0.24]}><boxGeometry args={[0.42, 0.22, 0.05]} /><meshStandardMaterial color={i % 2 ? c1 : c2} /></mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 4.3, 0]}><boxGeometry args={[3.9, 0.42, 0.5]} /><meshStandardMaterial color={c1} /></mesh>
      <mesh position={[0, 4.65, 0]}><boxGeometry args={[3.5, 0.28, 0.45]} /><meshStandardMaterial color={c2} /></mesh>
      <group position={[0, 2.1, 0]} scale={[1, 1.28, 1]}>
        <mesh ref={swirl} position={[0, 0, 0.02]}><circleGeometry args={[1.45, 48]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      </group>
      <Sign text={label} color={c1} position={[0, 5.5, 0]} />
    </group>
  );
}

/* ---------------------------------- rides ---------------------------------- */
function Coaster({ onRide }) {
  const trackGeo = useMemo(() => new THREE.TubeGeometry(coasterCurve, 260, 0.17, 6, true), []);
  const sleepers = useRef();
  const supports = useRef();
  const cars = useRef([]);
  const nSleep = 150, nSup = 46;

  useEffect(() => {
    const d = new THREE.Object3D();
    for (let i = 0; i < nSleep; i++) {
      const u = i / nSleep;
      const p = coasterCurve.getPointAt(u), t = coasterCurve.getTangentAt(u);
      d.position.copy(p); d.position.y -= 0.2;
      d.lookAt(p.x + t.x, p.y - 0.2 + t.y, p.z + t.z);
      d.scale.set(1, 1, 1); d.updateMatrix();
      sleepers.current.setMatrixAt(i, d.matrix);
    }
    sleepers.current.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < nSup; i++) {
      const p = coasterCurve.getPointAt(i / nSup);
      const h = Math.max(0.2, p.y - 0.3);
      d.position.set(p.x, h / 2, p.z); d.rotation.set(0, 0, 0); d.scale.set(1, h, 1); d.updateMatrix();
      supports.current.setMatrixAt(i, d.matrix);
    }
    supports.current.instanceMatrix.needsUpdate = true;
  }, []);

  // two trains of three cars, driven by the clock so every player sees them in the same place
  const pos = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const t = now() / RIDE_SECS;
    cars.current.forEach((g, i) => {
      if (!g) return;
      const train = Math.floor(i / 3), k = i % 3;
      const u = (((t + train * 0.5 - k * 0.011) % 1) + 1) % 1;
      coasterCurve.getPointAt(u, pos);
      coasterCurve.getPointAt((u + 0.004) % 1, ahead);
      g.position.set(pos.x, pos.y + 0.28, pos.z);
      g.lookAt(ahead.x, ahead.y + 0.28, ahead.z);
    });
  });
  const colors = ['#ff4f9a', '#ffd166', '#4cc9f0'];
  const trackBulbs = useMemo(() => Array.from({ length: 90 }, (_, i) => { const p = coasterCurve.getPointAt(i / 90); return { x: p.x, y: p.y + 0.3, z: p.z, c: BULB_PAL[i % 6] }; }), []);
  return (
    <group>
      <mesh geometry={trackGeo}><meshStandardMaterial color="#e63946" roughness={0.5} /></mesh>
      <BulbRing points={trackBulbs} size={0.11} />
      <instancedMesh ref={sleepers} args={[null, null, nSleep]}>
        <boxGeometry args={[1.5, 0.08, 0.2]} /><meshStandardMaterial color="#7a4a24" />
      </instancedMesh>
      <instancedMesh ref={supports} args={[null, null, nSup]}>
        <cylinderGeometry args={[0.1, 0.13, 1, 6]} /><meshStandardMaterial color="#f1f1f1" />
      </instancedMesh>
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} ref={(el) => { cars.current[i] = el; }}>
          <mesh position={[0, 0.1, 0]}><boxGeometry args={[1.1, 0.35, 1.5]} /><meshStandardMaterial color={colors[Math.floor(i / 3) + (i % 3 === 0 ? 0 : 1)]} /></mesh>
          <mesh position={[0, 0.4, -0.5]}><boxGeometry args={[1.1, 0.5, 0.12]} /><meshStandardMaterial color="#fff" /></mesh>
        </group>
      ))}
      {/* the station: platform + sign */}
      <group position={[COASTER_STATION.x, 0, COASTER_STATION.z]} onClick={rideClick(onRide, 'coaster')}>
        <mesh position={[0, 0.07, 1.3]}><boxGeometry args={[4.2, 0.14, 3]} /><meshStandardMaterial color="#d9b382" /></mesh>
        {[-2, 2].map((x) => <mesh key={x} position={[x, 1.6, 2.5]}><cylinderGeometry args={[0.1, 0.1, 3.2, 8]} /><meshStandardMaterial color="#fff" /></mesh>)}
        <mesh position={[0, 3.3, 2.5]}><boxGeometry args={[4.6, 0.2, 1.2]} /><meshStandardMaterial color="#e63946" /></mesh>
        <Sign text="🎢 Roller Coaster" color="#e63946" position={[0, 4.15, 2.5]} width={4.4} height={1.1} />
        <Sign text="E dabao: ride!" color="#2a9d8f" position={[0, 2.5, 2.52]} width={2.6} height={0.62} />
      </group>
    </group>
  );
}

function FerrisWheel({ onRide }) {
  const wheel = useRef();
  const pods = useRef([]);
  const N = FER_N, R = FER_R, H = FER_H;
  useFrame(() => {
    const a = now() * FER_W;
    if (wheel.current) wheel.current.rotation.z = a;
    pods.current.forEach((p) => { if (p) p.rotation.z = -a; });
  });
  const cols = ['#ff4f9a', '#ffd166', '#4cc9f0', '#06d6a0', '#7c4dff', '#ff8e53'];
  return (
    <group position={[FUN.ferris.x, 0, FUN.ferris.z]} onClick={rideClick(onRide, 'ferris')}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.9, H / 2, 0]} rotation={[0, 0, -s * 0.2]}><boxGeometry args={[0.35, H + 0.8, 0.35]} /><meshStandardMaterial color="#f1f1f1" /></mesh>
      ))}
      <group position={[0, H, 0]}>
        <group ref={wheel}>
          {[-0.7, 0.7].map((z) => <mesh key={z} position={[0, 0, z]}><torusGeometry args={[R, 0.15, 8, 64]} /><meshStandardMaterial color="#ff4f9a" /></mesh>)}
          <BulbRing points={FER_BULBS} size={0.15} />
          {Array.from({ length: N }, (_, i) => {
            const a = (i / N) * Math.PI * 2;
            return (
              <group key={i}>
                <mesh position={[Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0]} rotation={[0, 0, a]}><boxGeometry args={[R, 0.1, 1.5]} /><meshStandardMaterial color="#fff" /></mesh>
                <group position={[Math.cos(a) * R, Math.sin(a) * R, 0]} ref={(el) => { pods.current[i] = el; }}>
                  {/* an open bench-pod: you stand on the floor, back panel behind, low sides, roof */}
                  <mesh position={[0, -1.1, 0]}><boxGeometry args={[1.5, 0.1, 1.3]} /><meshStandardMaterial color={cols[i % cols.length]} /></mesh>
                  <mesh position={[0, -0.65, -0.62]}><boxGeometry args={[1.5, 0.9, 0.08]} /><meshStandardMaterial color={cols[i % cols.length]} /></mesh>
                  {[-0.72, 0.72].map((x) => <mesh key={x} position={[x, -0.8, 0]}><boxGeometry args={[0.08, 0.5, 1.3]} /><meshStandardMaterial color={cols[i % cols.length]} /></mesh>)}
                </group>
              </group>
            );
          })}
        </group>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.45, 0.45, 2, 12]} /><meshStandardMaterial color="#ffd166" /></mesh>
      </group>
      <Sign text="🎡 Giant Wheel" color="#7c4dff" position={[0, 1.6, 2.6]} width={3.4} height={0.85} />
    </group>
  );
}

function Carousel({ onRide }) {
  const spin = useRef();
  const horses = useRef([]);
  useFrame(() => {
    const t = now();
    if (spin.current) spin.current.rotation.y = t * CAR_W;
    horses.current.forEach((h, i) => { if (h) h.position.y = 1.2 + Math.sin(t * 2.2 + i * 1.1) * 0.35; });
  });
  const cols = ['#ff4f9a', '#ffd166', '#4cc9f0', '#06d6a0', '#ff8e53', '#c77dff', '#f72585', '#b5e48c'];
  return (
    <group position={[FUN.carousel.x, 0, FUN.carousel.z]} onClick={rideClick(onRide, 'carousel')}>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[3.6, 3.8, 0.4, 32]} /><meshStandardMaterial color="#f7d6a0" /></mesh>
      <group ref={spin}>
        <mesh position={[0, 2.2, 0]}><cylinderGeometry args={[0.28, 0.28, 4, 10]} /><meshStandardMaterial color="#ffd166" /></mesh>
        <mesh position={[0, 4.4, 0]}><coneGeometry args={[4.2, 1.6, 32]} /><meshStandardMaterial color="#ff4f9a" /></mesh>
        <mesh position={[0, 3.7, 0]}><cylinderGeometry args={[3.8, 3.8, 0.3, 32]} /><meshStandardMaterial color="#fff" /></mesh>
        <BulbRing points={CAR_BULBS} />
        {Array.from({ length: CAR_N }, (_, i) => {
          const a = (i / CAR_N) * Math.PI * 2, x = Math.cos(a) * 2.7, z = Math.sin(a) * 2.7;
          return (
            <group key={i} position={[x, 0, z]} rotation={[0, -a + Math.PI / 2, 0]}>
              <mesh position={[0, 1.95, 0]}><cylinderGeometry args={[0.05, 0.05, 3.5, 6]} /><meshStandardMaterial color="#ffd166" /></mesh>
              <group ref={(el) => { horses.current[i] = el; }} position={[0, 1.2, 0]}>
                <mesh rotation={[0, 0, Math.PI / 2]}><capsuleGeometry args={[0.22, 0.75, 4, 10]} /><meshStandardMaterial color={cols[i]} /></mesh>
                <mesh position={[0.62, 0.3, 0]}><sphereGeometry args={[0.24, 10, 10]} /><meshStandardMaterial color={cols[i]} /></mesh>
                {[-0.4, 0.4].map((lx) => <mesh key={lx} position={[lx, -0.4, 0]}><boxGeometry args={[0.14, 0.5, 0.3]} /><meshStandardMaterial color={cols[i]} /></mesh>)}
              </group>
            </group>
          );
        })}
      </group>
      <Sign text="🎠 Carousel" color="#ff4f9a" position={[0, 1.4, 4.3]} width={3} height={0.75} />
    </group>
  );
}

// "Jhoola": the chair-swing ride. The chairs fly outward as it spins.
function Jhoola({ onRide }) {
  const top = useRef();
  const arms = useRef([]);
  useFrame(() => {
    const t = now();
    if (top.current) top.current.rotation.y = t * JH_W;
    const tilt = jhoolaTilt(t);
    arms.current.forEach((a) => { if (a) a.rotation.z = tilt; });
  });
  const cols = ['#ff4f9a', '#ffd166', '#4cc9f0', '#06d6a0', '#ff8e53', '#c77dff', '#f72585', '#b5e48c'];
  return (
    <group position={[FUN.jhoola.x, 0, FUN.jhoola.z]} onClick={rideClick(onRide, 'jhoola')}>
      <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[1.6, 1.9, 0.5, 20]} /><meshStandardMaterial color="#e9d5ff" /></mesh>
      <mesh position={[0, 4.7, 0]}><cylinderGeometry args={[0.32, 0.4, 9, 12]} /><meshStandardMaterial color="#7c4dff" /></mesh>
      <group ref={top} position={[0, 9, 0]}>
        <mesh><cylinderGeometry args={[3.6, 3.6, 0.3, 28]} /><meshStandardMaterial color="#ff4f9a" /></mesh>
        <mesh position={[0, 0.7, 0]}><coneGeometry args={[3.4, 1.3, 28]} /><meshStandardMaterial color="#ffd166" /></mesh>
        <BulbRing points={JH_BULBS} />
        {Array.from({ length: JH_N }, (_, i) => (
          <group key={i} rotation={[0, (i / JH_N) * Math.PI * 2, 0]}>
            <group position={[3.3, 0, 0]} ref={(el) => { arms.current[i] = el; }}>
              <mesh position={[0, -2.2, 0]}><cylinderGeometry args={[0.025, 0.025, 4.4, 5]} /><meshStandardMaterial color="#444" /></mesh>
              <mesh position={[0, -4.5, 0]}><boxGeometry args={[0.85, 0.12, 0.8]} /><meshStandardMaterial color={cols[i]} /></mesh>
              <mesh position={[0, -4.2, 0.4]}><boxGeometry args={[0.85, 0.55, 0.1]} /><meshStandardMaterial color={cols[i]} /></mesh>
            </group>
          </group>
        ))}
      </group>
      <Sign text="🪑 Jhoola" color="#7c4dff" position={[0, 1.5, 2.4]} width={2.6} height={0.7} />
    </group>
  );
}

// a classic two-seat swing set
function SwingSet({ onRide }) {
  const seats = useRef([]);
  useFrame(() => {
    const t = now();
    seats.current.forEach((s, i) => { if (s) s.rotation.x = Math.sin(t * 1.6 + i * 1.3) * 0.7; });
  });
  return (
    <group position={[FUN.swings.x, 0, FUN.swings.z]} onClick={rideClick(onRide, 'swing')}>
      {[-1.9, 1.9].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.5, 0.8]} rotation={[0.3, 0, 0]}><cylinderGeometry args={[0.07, 0.07, 3.2, 6]} /><meshStandardMaterial color="#e63946" /></mesh>
          <mesh position={[x, 1.5, -0.8]} rotation={[-0.3, 0, 0]}><cylinderGeometry args={[0.07, 0.07, 3.2, 6]} /><meshStandardMaterial color="#e63946" /></mesh>
        </group>
      ))}
      <mesh position={[0, 3.0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.08, 0.08, 4.2, 8]} /><meshStandardMaterial color="#e63946" /></mesh>
      {[-0.8, 0.8].map((x, i) => (
        <group key={x} position={[x, 3.0, 0]} ref={(el) => { seats.current[i] = el; }}>
          <mesh position={[-0.28, -1.3, 0]}><cylinderGeometry args={[0.02, 0.02, 2.6, 4]} /><meshStandardMaterial color="#444" /></mesh>
          <mesh position={[0.28, -1.3, 0]}><cylinderGeometry args={[0.02, 0.02, 2.6, 4]} /><meshStandardMaterial color="#444" /></mesh>
          <mesh position={[0, -2.6, 0]}><boxGeometry args={[0.7, 0.07, 0.35]} /><meshStandardMaterial color={i ? '#4cc9f0' : '#ffd166'} /></mesh>
        </group>
      ))}
      <Sign text="🛝 Swing" color="#e63946" position={[0, 1.2, 2.2]} width={2.2} height={0.6} />
    </group>
  );
}

/* ------------------------------ the bazaar ------------------------------ */
function MelaStall({ b, onBooth }) {
  const sign = useCanvasTex((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = b.color; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 30); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let px = 70; g.font = `700 ${px}px "Dancing Script", cursive`;
    while (g.measureText(b.name).width > w - 40 && px > 30) { px -= 4; g.font = `700 ${px}px "Dancing Script", cursive`; }
    g.fillText(b.name, w / 2, h / 2 + 4);
  }, 512, 150);
  const art = useCanvasTex((g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#fffaf0'); bg.addColorStop(1, b.color);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '190px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.fillText(b.emoji, w / 2, h / 2 + 8);
  }, 320, 320);
  const hint = b.kind === 'food' || b.kind === 'balloon' ? 'E: khao' : b.kind === 'game' ? 'E: khelo' : 'E: dekho';
  const stripes = [b.color, '#ffffff'];
  return (
    <group
      position={[b.x, 0, b.z]} rotation={[0, b.side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
      onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onBooth && onBooth(b.id); } }}
    >
      <mesh position={[0, 0.5, 0]}><boxGeometry args={[3, 1, 1.3]} /><meshStandardMaterial color={b.color} /></mesh>
      <mesh position={[0, 1.03, 0]}><boxGeometry args={[3.1, 0.08, 1.4]} /><meshStandardMaterial color="#fff5e6" /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 1.45, 1.75, -0.55]}><cylinderGeometry args={[0.05, 0.05, 3.5, 8]} /><meshStandardMaterial color="#5c3d2e" /></mesh>)}
      <mesh position={[0, 2.0, -0.62]}><boxGeometry args={[3, 2, 0.06]} /><meshStandardMaterial color="#ffe6cf" /></mesh>
      <mesh position={[0, 2.0, -0.585]}><planeGeometry args={[1.7, 1.7]} /><meshBasicMaterial map={art} toneMapped={false} /></mesh>
      <group position={[0, 3.0, 0.1]} rotation={[0.3, 0, 0]}>
        {Array.from({ length: 6 }, (_, k) => (
          <mesh key={k} position={[-1.5 + (k + 0.5) * 0.5, 0, 0]}><boxGeometry args={[0.5, 0.06, 1.7]} /><meshStandardMaterial color={stripes[k % 2]} /></mesh>
        ))}
      </group>
      <mesh position={[0, 3.65, -0.5]}><planeGeometry args={[2.6, 0.76]} /><meshBasicMaterial map={sign} transparent toneMapped={false} /></mesh>
      <Sign text={hint} color="#2b1b3d" position={[0, 1.25, 0.72]} width={1.2} height={0.32} />
    </group>
  );
}

// strings of coloured bulbs over the road (they glow at sunset)
function FairyLights() {
  const bulbs = useRef();
  const rows = [14, 8, 2, -4, -10, -16, -22, -28], per = 21, n = rows.length * per;
  useEffect(() => {
    const d = new THREE.Object3D(), col = new THREE.Color();
    const pal = ['#ff4f9a', '#ffd166', '#4cc9f0', '#7bf1a8', '#c77dff', '#ff8e53'];
    let i = 0;
    rows.forEach((z, r) => {
      for (let k = 0; k < per; k++) {
        const t = k / (per - 1), x = -8 + t * 16;
        d.position.set(x, 5.4 - Math.sin(t * Math.PI) * 0.9, z); d.updateMatrix();
        bulbs.current.setMatrixAt(i, d.matrix);
        bulbs.current.setColorAt(i, col.set(pal[(k + r) % pal.length]));
        i++;
      }
    });
    bulbs.current.instanceMatrix.needsUpdate = true;
    if (bulbs.current.instanceColor) bulbs.current.instanceColor.needsUpdate = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      <instancedMesh ref={bulbs} args={[null, null, n]}>
        <sphereGeometry args={[0.13, 8, 6]} /><meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      {rows.flatMap((z) => [-8, 8].map((x) => (
        <mesh key={`${x}${z}`} position={[x, 2.75, z]}><cylinderGeometry args={[0.07, 0.09, 5.5, 6]} /><meshStandardMaterial color="#5c3d2e" /></mesh>
      )))}
    </group>
  );
}

/* ------------------------------ beach and sea ------------------------------ */
function Sea() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(330, 130, 80, 36);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      pos.setY(i, 0.1 + Math.sin(x * 0.16 + t * 1.3) * 0.13 + Math.sin(z * 0.22 + t * 1.7) * 0.11);
    }
    pos.needsUpdate = true;
  });
  return (
    <mesh geometry={geo} position={[0, 0, 100]}>
      <meshStandardMaterial color="#0e4a7a" emissive="#04284d" emissiveIntensity={0.45} transparent opacity={0.9} roughness={0.2} />
    </mesh>
  );
}

function Palm({ x, z, s = 1, lean = 0.12 }) {
  return (
    <group position={[x, 0, z]} scale={s} rotation={[0, x * 3.1, lean]}>
      <mesh position={[0, 2, 0]}><cylinderGeometry args={[0.16, 0.28, 4, 8]} /><meshStandardMaterial color="#9a6b3c" /></mesh>
      <group position={[0, 4, 0]}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[Math.cos(i * 1.047) * 0.9, -0.1, Math.sin(i * 1.047) * 0.9]} rotation={[Math.sin(i * 1.047) * 0.6, 0, -Math.cos(i * 1.047) * 0.6]} scale={[1, 0.12, 0.45]}>
            <sphereGeometry args={[1.4, 8, 6]} /><meshStandardMaterial color="#2da44e" />
          </mesh>
        ))}
        <mesh position={[0.18, -0.2, 0.1]}><sphereGeometry args={[0.2, 8, 8]} /><meshStandardMaterial color="#6b4423" /></mesh>
      </group>
    </group>
  );
}

function Umbrella({ x, z, color }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.1, 0]}><cylinderGeometry args={[0.04, 0.04, 2.2, 6]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0, 2.25, 0]}><coneGeometry args={[1.5, 0.7, 14]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0.2, 0.15, 1.5]} rotation={[0, 0.3, 0]}><boxGeometry args={[1.1, 0.25, 0.55]} /><meshStandardMaterial color="#fff5e6" /></mesh>
    </group>
  );
}

function Boat({ x, z, color = '#ff8e53' }) {
  const g = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (g.current) { g.current.position.y = 0.2 + Math.sin(t * 1.4 + x) * 0.14; g.current.rotation.z = Math.sin(t * 1.1 + x) * 0.07; }
  });
  return (
    <group ref={g} position={[x, 0.2, z]}>
      <mesh><boxGeometry args={[3.6, 0.7, 1.4]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[1.9, 0.1, 0]} rotation={[0, 0, -Math.PI / 4]}><boxGeometry args={[0.75, 0.75, 1.38]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 2, 0]}><cylinderGeometry args={[0.06, 0.06, 3, 6]} /><meshStandardMaterial color="#6b4423" /></mesh>
      <mesh position={[0.1, 2.2, 0]} scale={[1, 1, 0.04]}><boxGeometry args={[1.8, 2.2, 1]} /><meshStandardMaterial color="#fff" /></mesh>
    </group>
  );
}

function Clouds() {
  const g = useRef();
  useFrame(({ clock }) => { if (g.current) g.current.position.x = Math.sin(clock.elapsedTime * 0.02) * 20; });
  const spots = [[-40, 38, -50], [10, 44, -70], [55, 36, -30], [-70, 42, 10], [30, 40, 60], [-20, 46, 70]];
  return (
    <group ref={g}>
      {spots.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          {[[0, 0, 0, 7], [6, -1, 1, 5], [-6, -1, 0, 5.5], [2, 2, -1, 5]].map(([a, b, c, r], k) => (
            <mesh key={k} position={[a, b, c]}><sphereGeometry args={[r, 12, 10]} /><meshBasicMaterial color="#2b3566" fog={false} /></mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Lighthouse() {
  const beam = useRef();
  useFrame(({ clock }) => { if (beam.current) beam.current.rotation.y = clock.elapsedTime * 1.2; });
  return (
    <group position={[FUN.lighthouse.x, 0, FUN.lighthouse.z]}>
      <mesh position={[0, 4, 0]}><cylinderGeometry args={[1.0, 1.7, 8, 16]} /><meshStandardMaterial color="#fff" /></mesh>
      {[1.5, 4.5].map((y) => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[1.5 - y * 0.07, 1.6 - y * 0.07, 1.2, 16]} /><meshStandardMaterial color="#e63946" /></mesh>)}
      <mesh position={[0, 8.4, 0]}><cylinderGeometry args={[1.3, 1.3, 0.3, 16]} /><meshStandardMaterial color="#444" /></mesh>
      <mesh position={[0, 9.2, 0]}><sphereGeometry args={[0.8, 14, 14]} /><meshBasicMaterial color="#fff3a0" fog={false} /></mesh>
      <group ref={beam} position={[0, 9.2, 0]}>
        <mesh position={[4, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.9, 8, 10, 1, true]} /><meshBasicMaterial color="#fff3a0" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      </group>
      <mesh position={[0, 10.1, 0]}><coneGeometry args={[1.0, 1.1, 14]} /><meshStandardMaterial color="#e63946" /></mesh>
    </group>
  );
}

/* ------------------------------- the boundary ------------------------------- */
// A white picket fence on three sides and a rope of buoys on the sea side, just outside the walkable area.
function Boundary() {
  const posts = useRef();
  const buoys = useRef();
  const E = FUN.B + 0.5; // the fence stands half a metre beyond where you can walk
  const step = 2.2;
  const nSide = Math.floor((E * 2) / step) + 1;
  const nPost = nSide * 3, nBuoy = nSide;

  useEffect(() => {
    const d = new THREE.Object3D();
    let i = 0;
    for (let k = 0; k < nSide; k++) {
      const t = -E + k * step;
      [[t, -E], [-E, t], [E, t]].forEach(([x, z]) => {
        d.position.set(x, 0.75, z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix();
        posts.current.setMatrixAt(i++, d.matrix);
      });
    }
    posts.current.instanceMatrix.needsUpdate = true;
    const col = new THREE.Color();
    for (let k = 0; k < nBuoy; k++) {
      d.position.set(-E + k * step, 0.3, E); d.updateMatrix();
      buoys.current.setMatrixAt(k, d.matrix);
      buoys.current.setColorAt(k, col.set(k % 2 ? '#ffffff' : '#e63946'));
    }
    buoys.current.instanceMatrix.needsUpdate = true;
    if (buoys.current.instanceColor) buoys.current.instanceColor.needsUpdate = true;
  }, [E, nSide, nBuoy]);

  const len = E * 2 + 0.3;
  const rail = (x, z, rotY, y) => (
    <mesh key={`${x}${z}${y}`} position={[x, y, z]} rotation={[0, rotY, 0]}><boxGeometry args={[len, 0.12, 0.09]} /><meshStandardMaterial color="#ffffff" /></mesh>
  );
  return (
    <group>
      <instancedMesh ref={posts} args={[null, null, nPost]}>
        <boxGeometry args={[0.26, 1.5, 0.26]} /><meshStandardMaterial color="#fffaf0" />
      </instancedMesh>
      {[0.55, 1.1].flatMap((y) => [rail(0, -E, 0, y), rail(-E, 0, Math.PI / 2, y), rail(E, 0, Math.PI / 2, y)])}
      <instancedMesh ref={buoys} args={[null, null, nBuoy]}>
        <sphereGeometry args={[0.42, 10, 8]} /><meshStandardMaterial color="#ffffff" />
      </instancedMesh>
      <mesh position={[0, 0.34, E]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.04, 0.04, len, 5]} /><meshStandardMaterial color="#f5f5f5" /></mesh>
    </group>
  );
}

/* ------------------------- night lights + fireworks show ------------------------- */
const BULB_PAL = ['#ff4f9a', '#ffd166', '#4cc9f0', '#7bf1a8', '#c77dff', '#ff8e53'];
const FER_BULBS = Array.from({ length: 36 }, (_, i) => [-0.78, 0.78].map((z) => ({ x: Math.cos((i / 36) * Math.PI * 2) * (FER_R + 0.05), y: Math.sin((i / 36) * Math.PI * 2) * (FER_R + 0.05), z, c: BULB_PAL[i % 6] }))).flat();
const CAR_BULBS = Array.from({ length: 18 }, (_, i) => ({ x: Math.cos((i / 18) * Math.PI * 2) * 3.7, y: 3.5, z: Math.sin((i / 18) * Math.PI * 2) * 3.7, c: BULB_PAL[i % 6] }));
const JH_BULBS = Array.from({ length: 16 }, (_, i) => ({ x: Math.cos((i / 16) * Math.PI * 2) * 3.55, y: -0.22, z: Math.sin((i / 16) * Math.PI * 2) * 3.55, c: BULB_PAL[i % 6] }));

// a ring/line of glowing bulbs, one instanced mesh
function BulbRing({ points, size = 0.13 }) {
  const ref = useRef();
  useEffect(() => {
    const d = new THREE.Object3D(), col = new THREE.Color();
    points.forEach((p, i) => {
      d.position.set(p.x, p.y, p.z); d.updateMatrix();
      ref.current.setMatrixAt(i, d.matrix);
      ref.current.setColorAt(i, col.set(p.c));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [points]);
  return (
    <instancedMesh ref={ref} args={[null, null, points.length]} frustumCulled={false}>
      <sphereGeometry args={[size, 8, 6]} /><meshBasicMaterial color="#ffffff" toneMapped={false} />
    </instancedMesh>
  );
}

// The fireworks show over the sea. Nothing is stored: every burst is worked out from the wall clock, so it never
// stops, and everybody in Masti Duniya sees exactly the same show. Every 20th round is a big finale.
const FW = { SLOT: 1.6, DUR: 3.6, RISE: 0.9, N: 96, TRAIL: 6, CAP: 12 };
const FW_DIRS = (() => {
  const a = [];
  for (let i = 0; i < FW.N; i++) { const y = 1 - ((i + 0.5) * 2) / FW.N, r = Math.sqrt(1 - y * y), th = i * 2.399963; a.push([Math.cos(th) * r, y, Math.sin(th) * r]); }
  return a;
})();
const FW_PAL = ['#ff4f9a', '#ffd166', '#4cc9f0', '#7bf1a8', '#c77dff', '#ff8e53', '#ffffff', '#ff5252'].map((c) => new THREE.Color(c));
const fwHash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function fwBurst(k, j) {
  const h = (m) => fwHash(k * 13.7 + j * 5.3 + m);
  return {
    x: (h(1) - 0.5) * 130, z: 66 + h(2) * 40, top: 16 + h(3) * 12, R: 8 + h(4) * 6, // low and wide: the camera looks level, so it must fit in view
    c1: FW_PAL[Math.floor(h(5) * FW_PAL.length)], c2: FW_PAL[Math.floor(h(6) * FW_PAL.length)],
    droop: 1 + h(7) * 3.2, yaw: h(8) * 6.283, ring: h(9) < 0.25,
  };
}
function FireworksShow() {
  const cap = FW.CAP * (FW.N + FW.TRAIL);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    return g;
  }, [cap]);
  // round, soft sparks (a plain point is a square)
  const spark = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.65)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  useFrame(() => {
    const t = now();
    const pos = geo.attributes.position.array, col = geo.attributes.color.array;
    let n = 0;
    const put = (x, y, z, r, g, b) => {
      if (n >= cap) return;
      pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; col[n * 3] = r; col[n * 3 + 1] = g; col[n * 3 + 2] = b; n++;
    };
    const k0 = Math.floor((t - FW.DUR) / FW.SLOT), k1 = Math.floor(t / FW.SLOT);
    for (let k = k0; k <= k1; k++) {
      const bursts = ((k % 20) + 20) % 20 >= 17 ? 3 : 2; // the finale throws three at a time
      for (let j = 0; j < bursts; j++) {
        const el = t - (k * FW.SLOT + j * 0.8);
        if (el < 0 || el > FW.DUR) continue;
        const b = fwBurst(k, j);
        if (el < FW.RISE) { // the rocket climbing, with a short tail
          const u = el / FW.RISE;
          for (let q = 0; q < FW.TRAIL; q++) {
            const uu = Math.max(0, u - q * 0.035), f = 1 - q / FW.TRAIL;
            put(b.x, 0.5 + (b.top - 0.5) * (1 - (1 - uu) * (1 - uu)), b.z, f, 0.85 * f, 0.5 * f);
          }
        } else { // the burst: sparks fly out, droop and fade
          const tau = el - FW.RISE, rr = b.R * (1 - Math.exp(-2.6 * tau));
          const fade = Math.max(0, 1 - tau / (FW.DUR - FW.RISE)), f = fade * fade * 1.4;
          const cy = Math.cos(b.yaw), sy = Math.sin(b.yaw), drop = b.droop * tau * tau;
          for (let i = 0; i < FW.N; i++) {
            const d = FW_DIRS[i], dy = b.ring ? d[1] * 0.25 : d[1];
            const c = i % 2 ? b.c1 : b.c2, tw = f * (0.75 + 0.25 * Math.sin(tau * 25 + i));
            put(b.x + (d[0] * cy - d[2] * sy) * rr, b.top + dy * rr - drop, b.z + (d[0] * sy + d[2] * cy) * rr, c.r * tw, c.g * tw, c.b * tw);
          }
        }
      }
    }
    for (; n < cap; n++) { pos[n * 3] = 0; pos[n * 3 + 1] = -500; pos[n * 3 + 2] = 0; col[n * 3] = 0; col[n * 3 + 1] = 0; col[n * 3 + 2] = 0; }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial size={2.8} map={spark} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} sizeAttenuation />
    </points>
  );
}

/* ------------------------------ fill the park ------------------------------ */
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// where trees may NOT stand: the road, the rides, the beach
function blocked(x, z) {
  if (Math.abs(x) < 11 && z > -45 && z < 24) return true; // the bazaar road with its stalls
  if (x > -44 && x < -8 && z > -32 && z < -1) return true; // the roller coaster
  if (Math.hypot(x - FUN.ferris.x, z - FUN.ferris.z) < 11) return true;
  if (Math.hypot(x - FUN.carousel.x, z - FUN.carousel.z) < 8) return true;
  if (Math.hypot(x - FUN.jhoola.x, z - FUN.jhoola.z) < 9) return true;
  if (x > 27 && x < 41 && z > 8 && z < 21) return true; // swings
  if (Math.hypot(x - FUN.hotair.x, z - FUN.hotair.z) < 7) return true;
  if (Math.hypot(x - FUN.tower.x, z - FUN.tower.z) < 7) return true;
  if (x > -20 && x < -3 && z > -45 && z < -26) return true; // pirate ship
  if (x > 21 && x < 38 && z > -44 && z < -28) return true; // bumper cars
  if (z > 22) return true; // the beach
  return false;
}

// trees, hedges, lamp posts, flower beds and hills: the things that make the park look lived-in
function Scenery() {
  const treeLights = useRef(), trunks = useRef(), crowns = useRef(), hedge = useRef(), lamps = useRef(), lampHeads = useRef(), flowers = useRef();
  const data = useMemo(() => {
    const r = mulberry(7), trees = [];
    for (let tries = 0; tries < 900 && trees.length < 30; tries++) {
      const x = (r() * 2 - 1) * (FUN.B - 2), z = -FUN.B + 2 + r() * 66;
      if (!blocked(x, z) && !trees.some((q) => Math.hypot(q.x - x, q.z - z) < 4.5)) trees.push({ x, z, s: 0.8 + r() * 0.8, g: r() });
    }
    const hedges = [];
    for (const side of [-1, 1]) for (let z = -42; z <= 17; z += 1.5) hedges.push({ x: side * 9.4, z });
    const lampPts = [];
    for (const side of [-1, 1]) for (let z = -38; z <= 16; z += 9) lampPts.push({ x: side * 4.4, z });
    const fl = [], pal = ['#ff4f9a', '#ffd166', '#c77dff', '#ff8e53', '#ffffff', '#4cc9f0'];
    const beds = [[-9.4, 14], [9.4, 14], [-9.4, -28], [9.4, -28], [FUN.fountain.x - 6, FUN.fountain.z], [FUN.fountain.x + 6, FUN.fountain.z], [0, 16.5]];
    beds.forEach(([bx, bz], bi) => { for (let k = 0; k < 28; k++) fl.push({ x: bx + (r() - 0.5) * 3.2, z: bz + (r() - 0.5) * 2.2, c: pal[(k + bi) % pal.length] }); });
    const bulbs = [], bpal = ['#ff4f9a', '#ffd166', '#7bf1ff', '#c77dff', '#ffffff', '#7bf1a8'];
    trees.forEach((t, ti) => {
      for (let k = 0; k < 16; k++) { // a spiral of fairy lights wound round the crown
        const v = -0.55 + 1.5 * (k / 15), rr = Math.sqrt(Math.max(0, 1 - v * v)), a = k * 2.4 + ti;
        bulbs.push({ x: t.x + Math.cos(a) * rr * 2.05 * t.s, y: 3.1 * t.s + v * 1.9 * t.s, z: t.z + Math.sin(a) * rr * 2.05 * t.s, c: bpal[(k + ti) % bpal.length] });
      }
    });
    return { trees, hedges, lampPts, fl, bulbs };
  }, []);

  useEffect(() => {
    const d = new THREE.Object3D(), col = new THREE.Color();
    data.trees.forEach((t, i) => {
      d.rotation.set(0, 0, 0); d.scale.set(t.s, t.s, t.s); d.position.set(t.x, 1.1 * t.s, t.z); d.updateMatrix(); trunks.current.setMatrixAt(i, d.matrix);
      d.position.set(t.x, 3.1 * t.s, t.z); d.scale.set(t.s * 1.2, t.s * 1.1, t.s * 1.2); d.updateMatrix(); crowns.current.setMatrixAt(i, d.matrix);
      crowns.current.setColorAt(i, col.set(t.g < 0.5 ? '#2f9e4f' : '#3fb860'));
    });
    data.hedges.forEach((h, i) => { d.scale.set(1.15, 0.85, 1.15); d.position.set(h.x, 0.5, h.z); d.updateMatrix(); hedge.current.setMatrixAt(i, d.matrix); });
    data.lampPts.forEach((l, i) => {
      d.scale.set(1, 1, 1); d.position.set(l.x, 2.2, l.z); d.updateMatrix(); lamps.current.setMatrixAt(i, d.matrix);
      d.position.set(l.x, 4.5, l.z); d.updateMatrix(); lampHeads.current.setMatrixAt(i, d.matrix);
    });
    data.fl.forEach((f, i) => { d.scale.set(1, 1, 1); d.position.set(f.x, 0.22, f.z); d.updateMatrix(); flowers.current.setMatrixAt(i, d.matrix); flowers.current.setColorAt(i, col.set(f.c)); });
    data.bulbs.forEach((b, i) => { d.scale.set(1, 1, 1); d.position.set(b.x, b.y, b.z); d.updateMatrix(); treeLights.current.setMatrixAt(i, d.matrix); treeLights.current.setColorAt(i, col.set(b.c)); });
    [trunks, crowns, hedge, lamps, lampHeads, flowers, treeLights].forEach((m) => { m.current.instanceMatrix.needsUpdate = true; if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true; });
  }, [data]);

  return (
    <group>
      <instancedMesh ref={trunks} args={[null, null, data.trees.length]} frustumCulled={false}><cylinderGeometry args={[0.28, 0.4, 2.2, 7]} /><meshStandardMaterial color="#7a4e2a" /></instancedMesh>
      <instancedMesh ref={crowns} args={[null, null, data.trees.length]} frustumCulled={false}><sphereGeometry args={[1.7, 10, 8]} /><meshStandardMaterial color="#38b05a" roughness={1} /></instancedMesh>
      <instancedMesh ref={hedge} args={[null, null, data.hedges.length]} frustumCulled={false}><sphereGeometry args={[0.8, 8, 6]} /><meshStandardMaterial color="#2c8f48" roughness={1} /></instancedMesh>
      <instancedMesh ref={lamps} args={[null, null, data.lampPts.length]} frustumCulled={false}><cylinderGeometry args={[0.07, 0.09, 4.4, 6]} /><meshStandardMaterial color="#2b2b3a" /></instancedMesh>
      <instancedMesh ref={lampHeads} args={[null, null, data.lampPts.length]} frustumCulled={false}><sphereGeometry args={[0.32, 10, 8]} /><meshBasicMaterial color="#ffe9b0" toneMapped={false} /></instancedMesh>
      <instancedMesh ref={flowers} args={[null, null, data.fl.length]} frustumCulled={false}><sphereGeometry args={[0.2, 6, 5]} /><meshStandardMaterial color="#ffffff" /></instancedMesh>
      <instancedMesh ref={treeLights} args={[null, null, data.bulbs.length]} frustumCulled={false}><sphereGeometry args={[0.13, 6, 5]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></instancedMesh>
      {[[-8.6, 7], [8.6, 7], [-8.6, -4], [8.6, -4], [-8.6, -14], [8.6, -14], [-8.6, -22], [8.6, -22]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <mesh position={[0, 0.45, 0]}><boxGeometry args={[1.8, 0.1, 0.5]} /><meshStandardMaterial color="#8d5524" /></mesh>
          <mesh position={[0, 0.8, -0.22]}><boxGeometry args={[1.8, 0.45, 0.08]} /><meshStandardMaterial color="#8d5524" /></mesh>
          {[-0.75, 0.75].map((lx) => <mesh key={lx} position={[lx, 0.22, 0]}><boxGeometry args={[0.08, 0.44, 0.45]} /><meshStandardMaterial color="#444" /></mesh>)}
        </group>
      ))}
    </group>
  );
}

// the plaza fountain at the end of the road: three bowls and jets of water that arc out and fall back
function Fountain() {
  const drops = useRef();
  const N = 48;
  useFrame(() => {
    const t = now(), d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const jet = i % 8, ph = ((t * 0.9 + i * 0.137) % 1), ang = (jet / 8) * Math.PI * 2 + (t * 0.2);
      const r = 0.2 + ph * 2.0, y = 1.9 + Math.sin(ph * Math.PI) * 2.0 - ph * ph * 1.2;
      d.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r); d.updateMatrix(); drops.current.setMatrixAt(i, d.matrix);
    }
    drops.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={[FUN.fountain.x, 0, FUN.fountain.z]}>
      <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[3.5, 3.7, 0.6, 32]} /><meshStandardMaterial color="#cfc6bb" /></mesh>
      <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[3.2, 3.2, 0.06, 32]} /><meshStandardMaterial color="#4cc9f0" emissive="#0a5a8c" emissiveIntensity={0.6} /></mesh>
      <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.35, 0.5, 1.2, 12]} /><meshStandardMaterial color="#e3dcd1" /></mesh>
      <mesh position={[0, 1.85, 0]}><cylinderGeometry args={[1.5, 0.7, 0.4, 24]} /><meshStandardMaterial color="#e3dcd1" /></mesh>
      <mesh position={[0, 2.3, 0]}><sphereGeometry args={[0.35, 12, 10]} /><meshStandardMaterial color="#ff4f9a" emissive="#ff4f9a" emissiveIntensity={0.8} /></mesh>
      <instancedMesh ref={drops} args={[null, null, N]} frustumCulled={false}><sphereGeometry args={[0.1, 6, 5]} /><meshBasicMaterial color="#bfeaff" toneMapped={false} /></instancedMesh>
      <pointLight position={[0, 2.5, 0]} intensity={1.2} color="#ff8fc7" distance={14} />
    </group>
  );
}

// a big heart of bulbs with both your names: the photo spot
function CoupleArch() {
  const pts = useMemo(() => Array.from({ length: 70 }, (_, i) => {
    const t = (i / 70) * Math.PI * 2, s = 0.34;
    return { x: 16 * Math.sin(t) ** 3 * s, y: 7.4 + (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s, z: 0, c: i % 2 ? '#ff4f9a' : '#ffd1e6' };
  }), []);
  const label = `${PARTNER} ❤ ${HOST}`;
  return (
    <group position={[FUN.arch.x, 0, FUN.arch.z]}>
      <BulbRing points={pts} size={0.17} />
      <Sign text={label} color="#c2185b" position={[0, 7.2, 0.05]} width={5.4} height={1.3} />
      {[-4.4, 4.4].map((x) => <mesh key={x} position={[x, 1.8, 0]}><cylinderGeometry args={[0.18, 0.22, 3.6, 8]} /><meshStandardMaterial color="#fff5f8" /></mesh>)}
      <Sign text="📸 Photo spot" color="#7c4dff" position={[0, 2.6, 0.2]} width={3.2} height={0.8} />
      <pointLight position={[0, 5, 3]} intensity={1.6} color="#ffb3d9" distance={20} />
    </group>
  );
}

// bumper cars drive around their arena on their own
function BumperCars() {
  const cars = useRef([]);
  const cols = ['#ff4f9a', '#4cc9f0', '#ffd166', '#7bf1a8', '#c77dff', '#ff8e53'];
  useFrame(() => {
    const t = now();
    cars.current.forEach((g, i) => {
      if (!g) return;
      const a = t * (0.42 + i * 0.03) + i * 1.9, b = t * (0.57 + i * 0.02) + i * 0.8;
      const x = Math.sin(a) * 4.9, z = Math.sin(b) * 3.3;
      const dx = Math.cos(a) * 4.9 * (0.42 + i * 0.03), dz = Math.cos(b) * 3.3 * (0.57 + i * 0.02);
      g.position.set(x, 0.38, z); g.rotation.y = Math.atan2(dx, dz);
    });
  });
  return (
    <group position={[FUN.bumper.x, 0, FUN.bumper.z]}>
      <mesh position={[0, 0.05, 0]}><boxGeometry args={[13, 0.1, 10]} /><meshStandardMaterial color="#2b2b3a" /></mesh>
      {[[0, 5.1, 13.2, 0.4], [0, -5.1, 13.2, 0.4], [6.6, 0, 0.4, 10.2], [-6.6, 0, 0.4, 10.2]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.3, z]}><boxGeometry args={[w, 0.5, d]} /><meshStandardMaterial color={i % 2 ? '#ff4f9a' : '#ffd166'} /></mesh>
      ))}
      {cols.map((c, i) => (
        <group key={i} ref={(el) => { cars.current[i] = el; }}>
          <mesh><boxGeometry args={[1.1, 0.4, 1.7]} /><meshStandardMaterial color={c} /></mesh>
          <mesh position={[0, 0.4, -0.1]}><sphereGeometry args={[0.45, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[0, 0.8, -0.35]}><cylinderGeometry args={[0.03, 0.03, 0.9, 5]} /><meshStandardMaterial color="#444" /></mesh>
        </group>
      ))}
      <Sign text="🚗 Bumper Cars" color="#ff4f9a" position={[0, 3.2, 5.3]} width={3.6} height={0.9} />
      {[[-6.6, 5.1], [6.6, 5.1], [-6.6, -5.1], [6.6, -5.1]].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.4, z]}><cylinderGeometry args={[0.08, 0.08, 2.8, 6]} /><meshStandardMaterial color="#fff" /></mesh>
      ))}
    </group>
  );
}

// a hot-air balloon: it waits on the ground, then floats up and comes back. Hop into the basket while it waits.
function HotAirBalloon({ onRide }) {
  const g = useRef();
  useFrame((_, dt) => {
    balloonGlide(Math.min(dt, 0.1));
    const b = balloonState;
    if (g.current) g.current.position.set(b.x, b.y, b.z);
  });
  const wedges = 10;
  return (
    <group onClick={rideClick(onRide, 'hotair')}>
      <group ref={g} position={[FUN.hotair.x, 0.35, FUN.hotair.z]}>
        <mesh position={[0, 0.4, 0]}><boxGeometry args={[1.9, 0.12, 1.5]} /><meshStandardMaterial color="#a8743a" /></mesh>
        {[[0, -0.72, 1.9, 0.08], [0, 0.72, 1.9, 0.08]].map(([x, z, w, d], i) => <mesh key={i} position={[x, 0.95, z]}><boxGeometry args={[w, 1.0, d]} /><meshStandardMaterial color="#c08a4a" /></mesh>)}
        {[-0.95, 0.95].map((x) => <mesh key={x} position={[x, 0.95, 0]}><boxGeometry args={[0.08, 1.0, 1.5]} /><meshStandardMaterial color="#c08a4a" /></mesh>)}
        {[[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.7], [0.9, 0.7]].map(([x, z], i) => <mesh key={i} position={[x * 0.9, 4.2, z * 0.9]}><cylinderGeometry args={[0.03, 0.03, 6.5, 4]} /><meshStandardMaterial color="#6b4423" /></mesh>)}
        <mesh position={[0, 1.6, 0]}><cylinderGeometry args={[0.1, 0.1, 0.1, 6]} /><meshStandardMaterial color="#444" /></mesh>
        <group position={[0, 9.6, 0]}>
          {Array.from({ length: wedges }, (_, i) => (
            <mesh key={i}><sphereGeometry args={[4.1, 14, 12, (i / wedges) * Math.PI * 2, (Math.PI * 2) / wedges + 0.01]} /><meshStandardMaterial color={['#ff4f9a', '#ffd166', '#4cc9f0', '#7bf1a8', '#c77dff'][i % 5]} side={THREE.DoubleSide} /></mesh>
          ))}
        </group>
      </group>
      <Sign text="🎈 Hot Air Balloon" color="#ef476f" position={[FUN.hotair.x, 1.5, FUN.hotair.z + 2.6]} width={3.8} height={0.9} />
    </group>
  );
}

// the viewing tower: ride the lift up to the open deck and look over the whole mela
function Tower({ onRide }) {
  const beacon = useRef();
  useFrame(({ clock }) => { if (beacon.current) beacon.current.material.color.setHSL(0, 1, 0.45 + 0.2 * Math.sin(clock.elapsedTime * 4)); });
  const H = TOWER_H, lights = Array.from({ length: 24 }, (_, i) => i);
  return (
    <group position={[FUN.tower.x, 0, FUN.tower.z]} onClick={rideClick(onRide, 'tower')}>
      <mesh position={[0, H / 2 - 0.5, 0]}><cylinderGeometry args={[0.7, 1.15, H - 1, 12]} /><meshStandardMaterial color="#d8d4ea" /></mesh>
      {[0, 1, 2, 3].map((i) => { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; return (
        <mesh key={i} position={[Math.cos(a) * 1.9, 6.5, Math.sin(a) * 1.9]} rotation={[Math.sin(a) * 0.24, 0, -Math.cos(a) * 0.24]}><cylinderGeometry args={[0.12, 0.2, 13.4, 6]} /><meshStandardMaterial color="#b8b3d6" /></mesh>
      ); })}
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[3.0, 3.2, 0.4, 20]} /><meshStandardMaterial color="#8d89a8" /></mesh>
      <mesh position={[0, H - 1.2, 0]}><cylinderGeometry args={[4.7, 1.3, 2.0, 20]} /><meshStandardMaterial color="#ff4f9a" /></mesh>
      <mesh position={[0, H - 0.1, 0]}><cylinderGeometry args={[4.8, 4.8, 0.3, 24]} /><meshStandardMaterial color="#f3e9ff" /></mesh>
      <mesh position={[0, H + 1.0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[4.6, 0.07, 6, 32]} /><meshStandardMaterial color="#ffffff" /></mesh>
      <mesh position={[0, H + 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[4.6, 0.05, 6, 32]} /><meshStandardMaterial color="#ffffff" /></mesh>
      {lights.map((i) => { const a = (i / 24) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 4.85, H - 0.1, Math.sin(a) * 4.85]}><sphereGeometry args={[0.16, 6, 5]} /><meshBasicMaterial color={['#ffd166', '#ff4f9a', '#7bf1ff'][i % 3]} toneMapped={false} /></mesh>; })}
      <mesh position={[0, H + 2.4, 0]}><cylinderGeometry args={[0.06, 0.1, 2.8, 6]} /><meshStandardMaterial color="#888" /></mesh>
      <mesh ref={beacon} position={[0, H + 3.9, 0]}><sphereGeometry args={[0.3, 10, 8]} /><meshBasicMaterial color="#ff2040" toneMapped={false} /></mesh>
      <Sign text="🗼 View Tower" color="#7c4dff" position={[0, 1.5, 3.0]} width={3.4} height={0.9} />
    </group>
  );
}

// the pirate ship swings back and forth like a pendulum
function PirateShip({ onRide }) {
  const ship = useRef();
  useFrame(() => { if (ship.current) ship.current.rotation.x = -pirateAngle(now()); });
  return (
    <group position={[FUN.pirate.x, 0, FUN.pirate.z]} onClick={rideClick(onRide, 'pirate')}>
      {[-4.4, 4.4].map((x) => (
        <group key={x}>
          <mesh position={[x, 4.7, 1.2]} rotation={[-0.25, 0, 0]}><cylinderGeometry args={[0.18, 0.22, 9.6, 8]} /><meshStandardMaterial color="#e63946" /></mesh>
          <mesh position={[x, 4.7, -1.2]} rotation={[0.25, 0, 0]}><cylinderGeometry args={[0.18, 0.22, 9.6, 8]} /><meshStandardMaterial color="#e63946" /></mesh>
        </group>
      ))}
      <mesh position={[0, PIR_PIVOT, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.2, 0.2, 9.4, 10]} /><meshStandardMaterial color="#ffd166" /></mesh>
      <group ref={ship} position={[0, PIR_PIVOT, 0]}>
        {[-3.4, 3.4].map((x) => <mesh key={x} position={[x, -PIR_ARM / 2, 0]}><cylinderGeometry args={[0.06, 0.06, PIR_ARM, 6]} /><meshStandardMaterial color="#555" /></mesh>)}
        <group position={[0, -PIR_ARM, 0]}>
          <mesh position={[0, 0.05, 0]}><boxGeometry args={[7.4, 0.3, 2.4]} /><meshStandardMaterial color="#8d5524" /></mesh>
          <mesh position={[0, 0.55, 1.2]}><boxGeometry args={[7.4, 0.8, 0.12]} /><meshStandardMaterial color="#6b3e1a" /></mesh>
          <mesh position={[0, 0.55, -1.2]}><boxGeometry args={[7.4, 0.8, 0.12]} /><meshStandardMaterial color="#6b3e1a" /></mesh>
          {[-3.75, 3.75].map((x) => <mesh key={x} position={[x, 0.7, 0]} rotation={[0, 0, x < 0 ? 0.4 : -0.4]}><boxGeometry args={[0.15, 1.3, 2.4]} /><meshStandardMaterial color="#6b3e1a" /></mesh>)}
          <mesh position={[0, 2.3, 0]}><cylinderGeometry args={[0.07, 0.07, 3.6, 6]} /><meshStandardMaterial color="#444" /></mesh>
          <mesh position={[0.05, 3.1, 0]} scale={[1, 1, 0.04]}><boxGeometry args={[2.4, 1.4, 1]} /><meshStandardMaterial color="#111" /></mesh>
          <mesh position={[0.05, 3.1, 0.05]}><planeGeometry args={[1.0, 1.0]} /><meshBasicMaterial color="#fff" transparent opacity={0.0} /></mesh>
        </group>
      </group>
      <Sign text="🏴‍☠️ Pirate Ship" color="#2b2b3a" position={[0, 1.4, 4.2]} width={3.4} height={0.85} />
    </group>
  );
}

// fireflies drifting over the grass and along the road: soft glowing dots (one draw call)
function Fireflies({ count = 110 }) {
  const ref = useRef();
  const { geo, seeds, tex } = useMemo(() => {
    const r = mulberry(21), seeds = [];
    for (let i = 0; i < count; i++) seeds.push({ x: (r() - 0.5) * 70, z: -42 + r() * 66, y: 0.6 + r() * 2.6, p: r() * 6.28, sp: 0.3 + r() * 0.6 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    return { geo: g, seeds, tex: new THREE.CanvasTexture(c) };
  }, [count]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, a = geo.attributes.position.array;
    seeds.forEach((f, i) => {
      a[i * 3] = f.x + Math.sin(t * f.sp + f.p) * 1.6;
      a[i * 3 + 1] = f.y + Math.sin(t * f.sp * 1.7 + f.p) * 0.5;
      a[i * 3 + 2] = f.z + Math.cos(t * f.sp * 0.8 + f.p) * 1.6;
    });
    geo.attributes.position.needsUpdate = true;
    if (ref.current) ref.current.material.opacity = 0.85 + Math.sin(t * 3) * 0.15;
  });
  return <points ref={ref} geometry={geo} frustumCulled={false}><pointsMaterial map={tex} color="#e4ff8c" size={0.85} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></points>;
}

// a glowing ring on the ground where you stand to use a ride or a stall, with a floating hint above the rides
const tagPos = new THREE.Vector3();
function StandMarker({ x, z, color = '#ffd166', label }) {
  const ring = useRef(), tag = useRef();
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    if (ring.current) { const s = 1 + Math.sin(t * 3) * 0.08; ring.current.scale.set(s, s, 1); }
    if (tag.current) { tag.current.position.y = 3.3 + Math.sin(t * 2.2) * 0.12; tag.current.quaternion.copy(camera.quaternion); const d = camera.position.distanceTo(tag.current.getWorldPosition(tagPos)); tag.current.scale.setScalar(Math.max(0.18, Math.min(1, d / 12))); }
  });
  return (
    <group position={[x, 0, z]}>
      <mesh ref={ring} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.85, 1.05, 32]} /><meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} /></mesh>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.85, 32]} /><meshBasicMaterial color={color} transparent opacity={0.18} toneMapped={false} depthWrite={false} /></mesh>
      {label && <group ref={tag}><Sign text={label} color="#2b1b3d" position={[0, 0, 0]} width={1.1} height={0.36} /></group>}
    </group>
  );
}

// beach: loungers, sandcastles, a volleyball net and a beach ball bobbing about
function BeachStuff() {
  const ball = useRef();
  useFrame(({ clock }) => { if (ball.current) ball.current.position.y = 0.55 + Math.abs(Math.sin(clock.elapsedTime * 2.4)) * 0.9; });
  return (
    <group>
      {[[-24, 28], [-14, 27], [-3, 28.5], [8, 27], [17, 28.5], [26, 27.5], [36, 28]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, (i % 2 ? 0.25 : -0.25), 0]}>
          <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.8, 0.1, 1.9]} /><meshStandardMaterial color={['#ff4f9a', '#4cc9f0', '#ffd166'][i % 3]} /></mesh>
          <mesh position={[0, 0.65, -0.8]} rotation={[0.9, 0, 0]}><boxGeometry args={[0.8, 0.1, 0.9]} /><meshStandardMaterial color={['#ff4f9a', '#4cc9f0', '#ffd166'][i % 3]} /></mesh>
        </group>
      ))}
      {[[-30, 34], [20, 35.5]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[1.0, 1.2, 0.7, 12]} /><meshStandardMaterial color="#e8cd94" /></mesh>
          <mesh position={[0, 1.0, 0]}><cylinderGeometry args={[0.55, 0.7, 0.7, 12]} /><meshStandardMaterial color="#e8cd94" /></mesh>
          <mesh position={[0, 1.65, 0]}><coneGeometry args={[0.45, 0.7, 12]} /><meshStandardMaterial color="#e8cd94" /></mesh>
          <mesh position={[0, 2.3, 0]}><boxGeometry args={[0.04, 0.5, 0.04]} /><meshStandardMaterial color="#fff" /></mesh>
        </group>
      ))}
      <group position={[-6, 0, 35]}>
        {[-3, 3].map((x) => <mesh key={x} position={[x, 1.2, 0]}><cylinderGeometry args={[0.07, 0.07, 2.4, 6]} /><meshStandardMaterial color="#fff" /></mesh>)}
        <mesh position={[0, 1.9, 0]}><boxGeometry args={[6, 0.8, 0.03]} /><meshStandardMaterial color="#fff" transparent opacity={0.65} /></mesh>
      </group>
      <mesh ref={ball} position={[-4, 0.55, 33]}><sphereGeometry args={[0.45, 14, 10]} /><meshStandardMaterial color="#ff4f9a" /></mesh>
      {[[-34, 26], [-18, 24.5], [2, 25], [14, 24.5], [30, 25.5], [40, 26]].map(([x, z], i) => <Umbrella key={i} x={x} z={z} color={['#ff4f9a', '#ffd166', '#4cc9f0', '#06d6a0', '#c77dff', '#ff8e53'][i]} />)}
    </group>
  );
}

/* ------------------------------ the whole world ------------------------------ */
export function FunWorld({ onPortal, onBooth, onRide, low }) {
  const trees = [[-34, 28], [-20, 29], [-6, 28.5], [12, 29], [27, 28], [38, 29.5], [-40, 20], [40, 22], [-38, -36], [36, -38], [-8, -38], [8, -40]];
  return (
    <>
      {/* night: dark blue sky, stars and a moon; the bulbs and lamps glow, and fireworks go off over the sea */}
      <color attach="background" args={['#070b26']} />
      <fog attach="fog" args={['#101a47', 80, 180]} />
      <ambientLight intensity={0.62} color="#aab6ff" />
      <hemisphereLight args={['#4a5aa8', '#1d3b2c', 0.55]} />
      <directionalLight position={[-30, 50, 60]} intensity={0.55} color="#9fb2ff" />
      {(low ? [0] : [10, 0, -10, -20]).map((z) => <pointLight key={z} position={[0, 5, z]} intensity={1.3} color="#ffd9a0" distance={18} />)}
      <pointLight position={[FUN.ferris.x, 6, FUN.ferris.z + 6]} intensity={1.6} color="#ffb4d9" distance={26} />
      {!low && <pointLight position={[FUN.carousel.x, 5, FUN.carousel.z]} intensity={1.4} color="#ffd9a0" distance={14} />}
      {!low && <pointLight position={[FUN.jhoola.x, 6, FUN.jhoola.z + 4]} intensity={1.4} color="#d9c2ff" distance={18} />}
      <pointLight position={[FUN.gate.x, 4, FUN.gate.z - 3]} intensity={1.2} color="#ffd9ec" distance={14} />
      <Stars radius={125} depth={30} count={low ? 900 : 2600} factor={5} saturation={0} fade speed={0.6} />
      <mesh position={[40, 56, 112]}><sphereGeometry args={[5, 24, 24]} /><meshBasicMaterial color="#f6f3d2" fog={false} /></mesh>
      <mesh position={[40, 56, 112]}><sphereGeometry args={[8, 24, 24]} /><meshBasicMaterial color="#aab6ff" transparent opacity={0.12} fog={false} depthWrite={false} /></mesh>
      <Clouds />
      <Fireflies count={low ? 40 : 110} />
      <FireworksShow />

      {/* ground: grass, the bazaar road, sand, seabed and sea */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -14]}><planeGeometry args={[200, 100]} /><meshStandardMaterial color="#7bd36b" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -12]}><planeGeometry args={[8, 62]} /><meshStandardMaterial color="#e3be8f" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 31]}><planeGeometry args={[200, 14]} /><meshStandardMaterial color="#f4dba5" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 38.6]}><planeGeometry args={[200, 2.2]} /><meshStandardMaterial color="#e8cd94" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 100]}><planeGeometry args={[330, 130]} /><meshStandardMaterial color="#cdb98a" roughness={1} /></mesh>
      <Sea />
      {/* pier */}
      <mesh position={[8, 0.14, 40]}><boxGeometry args={[2.6, 0.12, 14]} /><meshStandardMaterial color="#9a6b3c" /></mesh>
      {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[6.9 + (i % 2) * 2.2, 0.0, 34.5 + i * 1.8]}><cylinderGeometry args={[0.1, 0.1, 1, 6]} /><meshStandardMaterial color="#6b4423" /></mesh>)}
      <Boat x={22} z={52} />
      <Boat x={-16} z={58} color="#06d6a0" />
      <Boat x={-4} z={72} color="#ff4f9a" />
      <Lighthouse />

      {/* the gate back to the hall */}
      <Portal position={[FUN.gate.x, 0, FUN.gate.z]} rotation={[0, Math.PI, 0]} label="🏠 Party Hall" c1="#ff4f9a" c2="#7c4dff" onClick={() => onPortal && onPortal('hall')} />

      <Boundary />
      <FairyLights />
      {MELA_BOOTHS.map((b) => <MelaStall key={b.id} b={b} onBooth={onBooth} />)}
      <Coaster onRide={onRide} />
      <FerrisWheel onRide={onRide} />
      <Carousel onRide={onRide} />
      <Jhoola onRide={onRide} />
      <SwingSet onRide={onRide} />
      <HotAirBalloon onRide={onRide} />
      <PirateShip onRide={onRide} />
      <Tower onRide={onRide} />
      <BumperCars />
      <Fountain />
      <CoupleArch />
      <Scenery />
      <BeachStuff />
      {Object.keys(RIDES).map((id) => <StandMarker key={id} x={RIDES[id].stand.x} z={RIDES[id].stand.z} color="#7bf1a8" label={`${RIDES[id].emoji} E`} />)}
      {MELA_BOOTHS.map((b) => { const st = boothStand(b); return <StandMarker key={b.id} x={st.x} z={st.z} color={b.color} />; })}

      {trees.map(([x, z], i) => <Palm key={i} x={x} z={z} s={0.9 + (i % 3) * 0.18} lean={(i % 2 ? 1 : -1) * 0.1} />)}
    </>
  );
}
