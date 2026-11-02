'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { BANNER, HOST, SCREEN_MESSAGE } from './data';
import {
  BALLOONS, BLOCKS, BX, BZ, CAKE, DANCE, FINISH_Z, GIFTS, HALL_PORTAL, HX, HZ, REACTIONS, SOFAS, START_Z, STALLS, STALL_D, STALL_W,
  CAKE_SCALE, TABLE_R, WALL_H, giftSlot, onDanceFloor,
} from './layout';
import { bus } from './bus';
import { FUN, FUN_BLOCKS, FUN_RECTS, FunWorld, MELA_BOOTHS, Portal, RIDES, RIDE_SECS, boothStand, coasterCurve, balloonState, TOWER_H, hotairCanBoard, pickSeat, ridePose, syncedNow } from './Fun';
import { Bubble, FloatEmoji, Label } from './labels';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const HAIRS = ['#2b1b1b', '#4a2c1a', '#6b4423', '#c49a6c', '#1a1a2e', '#7a2e2e', '#e8c872'];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function useTextTexture(draw, w, h) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const paint = () => { draw(c.getContext('2d'), w, h); tex.needsUpdate = true; };
    paint();
    if (document.fonts) document.fonts.load('700 100px "Dancing Script"').then(paint).catch(() => {});
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Many small identical meshes in one draw call (fairy lights, bunting flags).
function Instanced({ items, geometry }) {
  const ref = useRef();
  useEffect(() => {
    const o = new THREE.Object3D(), c = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(...it.p); o.rotation.set(...(it.r || [0, 0, 0])); o.scale.setScalar(it.s || 1); o.updateMatrix();
      ref.current.setMatrixAt(i, o.matrix); ref.current.setColorAt(i, c.set(it.c));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false}>
      {geometry}
      <meshBasicMaterial toneMapped={false} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */
// the player's name printed on the back of the shirt, so it reads from behind (your own view of yourself)
function BackName({ name, z, gold }) {
  const t = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = gold ? '#ffd166' : 'rgba(20,8,40,.82)';
    g.beginPath(); g.roundRect(4, 4, 504, 152, 76); g.fill();
    let px = 84; const txt = String(name || '').slice(0, 18);
    do { g.font = '700 ' + px + 'px Poppins, "Segoe UI", sans-serif'; px -= 4; } while (g.measureText(txt).width > 440 && px > 24);
    g.fillStyle = gold ? '#2b1b3d' : '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, 256, 84);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }, [name, gold]);
  return (
    <mesh position={[0, 0.98, z]} rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[0.5, 0.156]} />
      <meshBasicMaterial map={t} transparent toneMapped={false} />
    </mesh>
  );
}

export function Avatar({ color: baseColor, name, bubble, react, out, getAnim, isMe, role }) {
  const color = role === 'girl' ? '#ff5fa2' : baseColor; // Manisha's dress colour is fixed
  const body = useRef(), lLeg = useRef(), rLeg = useRef(), lArm = useRef(), rArm = useRef(), spark = useRef(), cart = useRef();

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const a = getAnim();
    if (cart.current) cart.current.visible = a === 'ride';
    let bob = Math.sin(t * 2) * 0.015, ls = 0, rs = 0, lax = 0, rax = 0, laz = 0.15, raz = -0.15, spin = 0, tilt = 0;
    if (a === 'walk') {
      const s = Math.sin(t * 11);
      ls = s * 0.9; rs = -s * 0.9; lax = -s * 0.7; rax = s * 0.7; bob = Math.abs(s) * 0.07;
    } else if (a === 'wave') {
      raz = -(2.5 + Math.sin(t * 14) * 0.3);
    } else if (a === 'dance') {
      const s = Math.sin(t * 8);
      bob = Math.abs(s) * 0.18; laz = 1.6 + s * 0.8; raz = -(1.6 - s * 0.8);
      spin = Math.sin(t * 4) * 0.6; tilt = s * 0.12;
    } else if (a === 'jump') {
      laz = 2.6; raz = -2.6;
    } else if (a === 'eat') {
      raz = -(2.3 + Math.sin(t * 10) * 0.15); rax = -0.6;
      bob = Math.abs(Math.sin(t * 10)) * 0.05;
    } else if (a === 'twirl') {
      spin = t * 7; laz = 1.3; raz = -1.3; bob = Math.abs(Math.sin(t * 3)) * 0.1;
    } else if (a === 'ride') {
      ls = -1.3; rs = -1.3; laz = 2.7; raz = -2.7; bob = Math.sin(t * 9) * 0.03; // sitting in the coaster, arms up
    } else if (a === 'sit') {
      ls = -1.3; rs = -1.3; laz = 0.7; raz = -0.7; bob = 0; // sitting on a ride, holding on
    }
    if (spark.current) spark.current.rotation.y = t * 1.6;
    if (!body.current) return;
    body.current.position.y = bob;
    body.current.rotation.y = spin;
    body.current.rotation.z = tilt;
    lLeg.current.rotation.x = ls; rLeg.current.rotation.x = rs;
    lArm.current.rotation.x = lax; rArm.current.rotation.x = rax;
    lArm.current.rotation.z = laz; rArm.current.rotation.z = raz;
  });

  const skin = '#f2c29b';
  const girl = role === 'girl';
  const admin = role === 'admin';
  const hair = '#2a1520';
  const guestHair = HAIRS[hash(name) % HAIRS.length];
  const gold = { color: '#ffd166', emissive: '#a67c00', emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.3 };
  const tag = `${girl ? '👑 ' : admin ? '⭐ ' : ''}${out ? '❌ ' : ''}${name}${isMe ? ' (tum)' : ''}`;
  const tagStyle = out ? 'out' : girl ? 'girl' : admin ? 'admin' : isMe ? 'me' : 'default';

  return (
    <group>
      <group ref={body}>
        {/* legs */}
        <group ref={lLeg} position={[0.16, 0.42, 0]}>
          <mesh position={[0, -0.2, 0]}><capsuleGeometry args={[0.1, 0.22, 4, 8]} /><meshStandardMaterial color="#3a2a5a" /></mesh>
        </group>
        <group ref={rLeg} position={[-0.16, 0.42, 0]}>
          <mesh position={[0, -0.2, 0]}><capsuleGeometry args={[0.1, 0.22, 4, 8]} /><meshStandardMaterial color="#3a2a5a" /></mesh>
        </group>
        {/* torso */}
        <mesh position={[0, 0.88, 0]} castShadow>
          <capsuleGeometry args={[0.31, 0.32, 6, 14]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        <BackName name={name} z={girl ? -0.43 : -0.325} gold={girl || admin} />
        {/* arms */}
        <group ref={lArm} position={[0.4, 1.13, 0]}>
          <mesh position={[0, -0.22, 0]}><capsuleGeometry args={[0.085, 0.26, 4, 8]} /><meshStandardMaterial color={color} /></mesh>
          <mesh position={[0, -0.47, 0]}><sphereGeometry args={[0.095, 10, 10]} /><meshStandardMaterial color={skin} /></mesh>
        </group>
        <group ref={rArm} position={[-0.4, 1.13, 0]}>
          <mesh position={[0, -0.22, 0]}><capsuleGeometry args={[0.085, 0.26, 4, 8]} /><meshStandardMaterial color={color} /></mesh>
          <mesh position={[0, -0.47, 0]}><sphereGeometry args={[0.095, 10, 10]} /><meshStandardMaterial color={skin} /></mesh>
        </group>
        {/* head */}
        <mesh position={[0, 1.58, 0]} castShadow><sphereGeometry args={[0.3, 20, 20]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
        <mesh position={[0.1, 1.62, 0.27]}><sphereGeometry args={[0.04, 8, 8]} /><meshBasicMaterial color="#2b1b3d" /></mesh>
        <mesh position={[-0.1, 1.62, 0.27]}><sphereGeometry args={[0.04, 8, 8]} /><meshBasicMaterial color="#2b1b3d" /></mesh>
        <mesh position={[0.17, 1.53, 0.24]}><sphereGeometry args={[0.04, 8, 8]} /><meshBasicMaterial color="#ff9bb8" /></mesh>
        <mesh position={[-0.17, 1.53, 0.24]}><sphereGeometry args={[0.04, 8, 8]} /><meshBasicMaterial color="#ff9bb8" /></mesh>

        {!girl && (
          <>
            {/* hair cap, colour depends on the name */}
            <mesh position={[0, 1.6, -0.02]} rotation={[-0.2, 0, 0]}>
              <sphereGeometry args={[0.315, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
              <meshStandardMaterial color={guestHair} roughness={0.7} />
            </mesh>
            {/* party hat (gold for the host) */}
            <mesh position={[0, 2.0, 0]} rotation={[0.1, 0, 0.1]}>
              <coneGeometry args={[0.17, 0.4, 14]} />
              <meshStandardMaterial color={admin ? '#ffd700' : '#ffd166'} metalness={admin ? 0.6 : 0} />
            </mesh>
            <mesh position={[0.02, 2.22, 0.03]}><sphereGeometry args={[0.05, 8, 8]} /><meshStandardMaterial color="#ff4f9a" /></mesh>
          </>
        )}
        {admin && (
          <group position={[0, 1.3, 0.3]}>
            <mesh position={[0.1, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.08, 0.14, 8]} /><meshStandardMaterial {...gold} /></mesh>
            <mesh position={[-0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.08, 0.14, 8]} /><meshStandardMaterial {...gold} /></mesh>
            <mesh><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial {...gold} /></mesh>
          </group>
        )}

        {girl && (
          <>
            {/* flared dress: two layers + golden hem and belt */}
            <mesh position={[0, 0.62, 0]} castShadow>
              <cylinderGeometry args={[0.27, 0.66, 0.72, 28, 1, true]} />
              <meshStandardMaterial color="#ff5fa2" side={THREE.DoubleSide} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.7, 0]}>
              <cylinderGeometry args={[0.27, 0.54, 0.55, 28, 1, true]} />
              <meshStandardMaterial color="#ffc2dd" side={THREE.DoubleSide} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.27, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.66, 0.03, 8, 40]} /><meshStandardMaterial {...gold} /></mesh>
            <mesh position={[0, 0.98, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.285, 0.035, 8, 24]} /><meshStandardMaterial {...gold} /></mesh>
            <mesh position={[0, 1.32, 0.27]}><sphereGeometry args={[0.05, 10, 10]} /><meshStandardMaterial color="#fff" emissive="#ffd166" emissiveIntensity={0.6} /></mesh>
            {/* long hair, fringe, bow */}
            <mesh position={[0, 1.54, -0.09]} scale={[1.08, 1.12, 1.05]}><sphereGeometry args={[0.31, 22, 22]} /><meshStandardMaterial color={hair} roughness={0.6} /></mesh>
            <mesh position={[0, 1.8, 0.1]} scale={[1, 0.42, 0.62]}><sphereGeometry args={[0.25, 16, 16]} /><meshStandardMaterial color={hair} roughness={0.6} /></mesh>
            <mesh position={[0, 1.02, -0.22]} scale={[1, 1, 0.8]}><capsuleGeometry args={[0.2, 0.6, 6, 14]} /><meshStandardMaterial color={hair} roughness={0.6} /></mesh>
            <mesh position={[0.17, 1.74, 0.0]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color="#ff4f9a" /></mesh>
            <mesh position={[0.25, 1.74, 0.0]} scale={[1.4, 0.8, 0.6]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color="#ff4f9a" /></mesh>
            {/* lips */}
            <mesh position={[0, 1.5, 0.285]} scale={[1.7, 0.6, 0.5]}><sphereGeometry args={[0.035, 10, 10]} /><meshBasicMaterial color="#e63963" /></mesh>
            {/* tiara */}
            <mesh position={[0, 1.8, 0.1]} rotation={[0.25, 0, 0]}><torusGeometry args={[0.2, 0.022, 8, 24, Math.PI]} /><meshStandardMaterial {...gold} /></mesh>
            <mesh position={[0, 2.03, 0.14]}><octahedronGeometry args={[0.06]} /><meshStandardMaterial color="#ff4f9a" emissive="#ff4f9a" emissiveIntensity={1} /></mesh>
            <mesh position={[0.13, 1.96, 0.12]}><octahedronGeometry args={[0.035]} /><meshStandardMaterial color="#9bf6ff" emissive="#9bf6ff" emissiveIntensity={1} /></mesh>
            <mesh position={[-0.13, 1.96, 0.12]}><octahedronGeometry args={[0.035]} /><meshStandardMaterial color="#9bf6ff" emissive="#9bf6ff" emissiveIntensity={1} /></mesh>
            {/* orbiting sparkles */}
            <group ref={spark} position={[0, 1.1, 0]}>
              {Array.from({ length: 7 }, (_, k) => (
                <mesh key={k} position={[Math.cos((k / 7) * 6.283) * 0.95, (k % 3) * 0.35 - 0.3, Math.sin((k / 7) * 6.283) * 0.95]}>
                  <octahedronGeometry args={[0.045]} />
                  <meshBasicMaterial color={k % 2 ? '#ffd166' : '#ffb3d9'} />
                </mesh>
              ))}
            </group>
          </>
        )}
      </group>

      <group ref={cart} visible={false} position={[0, -0.15, 0]}>
        <mesh><boxGeometry args={[1.1, 0.3, 1.5]} /><meshStandardMaterial color="#e63946" /></mesh>
        <mesh position={[0, 0.3, -0.62]}><boxGeometry args={[1.1, 0.5, 0.12]} /><meshStandardMaterial color="#fff" /></mesh>
      </group>
      {/* your own name is on your back (you look at it from behind); everybody else wears a tag above the head */}
      {(!isMe || out) && <Label text={tag} position={[0, 2.7, 0]} style={tagStyle} height={0.34} />}
      {bubble && <Bubble text={bubble} position={[0, 2.95, 0]} />}
      {react && <FloatEmoji emoji={react} position={[0.8, 2.3, 0]} size={0.7} bob={0.1} onTop />}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Remote players                                                      */
/* ------------------------------------------------------------------ */
function Remote({ p, world, bubble, react, out }) {
  const ref = useRef();
  const anim = useRef('idle');

  useFrame((_, dt) => {
    const s = world.current.others.get(p.id);
    if (!s || !ref.current) return;
    const k = 1 - Math.pow(0.0005, dt);
    ref.current.position.x += (s.x - ref.current.position.x) * k;
    ref.current.position.z += (s.z - ref.current.position.z) * k;
    ref.current.position.y += (s.y - ref.current.position.y) * k;
    let d = s.ry - ref.current.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    ref.current.rotation.y += d * k;
    anim.current = s.anim;
  });

  const s0 = world.current.others.get(p.id);
  return (
    <group ref={ref} position={[s0 ? s0.x : 0, 0, s0 ? s0.z : 0]}>
      <Avatar color={p.color} name={p.name} role={p.role} bubble={bubble} react={react} out={out} getAnim={() => anim.current} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Local player (controls + camera + interaction)                      */
/* ------------------------------------------------------------------ */
function Me({ me, socket, world, bubble, react, out, onPrompt, onFloor, onGift, onEat, onUserGift, onBooth, requestCandles }) {
  const grp = useRef();
  const { camera, gl, scene } = useThree();
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const collecting = useRef(new Map());
  const st = useRef({
    x: me.x, z: me.z, y: 0, vy: 0, ry: me.ry, anim: 'idle',
    yaw: 0, pitch: 0.26, dist: 5, emote: null, emoteUntil: 0, lastSend: 0, prompt: '', onFloor: false,
  });
  const keys = useRef({});

  useEffect(() => {
    const s = st.current;
    const typing = () => !!world.current.paused || ['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName);

    const setEmote = (name, ms) => { s.emote = name; s.emoteUntil = performance.now() + ms; };
    const jump = () => { if (s.y <= 0.001) s.vy = 5.6; };

    world.current.emote = (n) => {
      if (n === 'jump') jump();
      else if (n === 'twirl' && me.role !== 'girl') return;
      else if (n === 'dance') {
        // dancing is optional: it lasts until you move or press Dance again
        if (s.emote === 'dance') s.emote = null; else setEmote('dance', 600000);
      } else setEmote(n, n === 'twirl' ? 4000 : n === 'eat' ? 1800 : 2500);
    };
    world.current.confetti = () => socket.emit('confetti', { x: s.x, y: 2, z: s.z });
    // Turn the camera to the big screen (yaw PI) or back to the video wall (yaw 0).
    world.current.look = (yaw, pitch = 0.2) => { s.yaw = yaw; s.pitch = pitch; };
    // a picture of what the camera sees right now (render first, so the canvas is never read blank)
    world.current.snap = () => { gl.render(scene, camera); return gl.domElement.toDataURL('image/jpeg', 0.92); };
    world.current.teleport = (x, z) => {
      s.x = x; s.z = z; s.ry = Math.PI; s.yaw = 0; s.pitch = 0.26; s.ride = null; s.y = 0; s.vy = 0;
      camera.position.set(x, 5, z + 8);
    };

    function nearest() {
      if (world.current.where === 'fun') {
        if (Math.hypot(s.x - FUN.gateStand.x, s.z - FUN.gateStand.z) < 2.4) return { type: 'portal', to: 'hall' };
        for (const id of Object.keys(RIDES)) {
          const st = RIDES[id].stand;
          if (Math.hypot(s.x - st.x, s.z - st.z) < 3.4) return { type: 'ride', id };
        }
        for (const b of MELA_BOOTHS) {
          const st = boothStand(b);
          if (Math.hypot(s.x - st.x, s.z - st.z) < 2.0) return { type: 'booth', id: b.id };
        }
        return null;
      }
      if (Math.hypot(s.x - HALL_PORTAL.x, s.z - HALL_PORTAL.z) < 2.4) return { type: 'portal', to: 'fun' };
      // gifts first (small radius), then the cake itself: they all stand close together around it
      for (let i = 0; i < GIFTS.length; i++) {
        if (Math.hypot(s.x - GIFTS[i].x, s.z - GIFTS[i].z) < 1.1) return { type: 'gift', i };
      }
      for (const g of world.current.userGifts || []) {
        const sl = giftSlot(g.id);
        if (Math.hypot(s.x - sl.x, s.z - sl.z) < 0.85) return { type: 'ugift', id: g.id };
      }
      if (Math.hypot(s.x - CAKE.x, s.z - CAKE.z) < 3.0) return { type: 'cake' };
      for (let i = 0; i < STALLS.length; i++) {
        const stl = STALLS[i];
        const front = (s.x - stl.x) * -stl.side; // distance in front of the counter
        if (Math.abs(s.z - stl.z) < STALL_W / 2 + 0.3 && front > 0 && front < 3.4) return { type: 'stall', i };
      }
      return null;
    }
    // roller coaster: one lap along the track (E or Space again = get off early)
    const say = (m) => { if (world.current.say) world.current.say(m); };
    function beginRide(id, seat, dur) {
      s.ride = { id, t0: Date.now(), dur, seat };
      if (id === 'hotair') Object.assign(balloonState, { mine: true, vx: 0, vy: 0, vz: 0, inp: { x: 0, z: 0, y: 0 } });
      s.emote = null; s.vy = 0; s.y = 0;
      const cam = { coaster: [6.5, 0.35], ferris: [10, 0.22], hotair: [11, 0.3], tower: [9, 0.2], pirate: [11, 0.25], jhoola: [10, 0.25], carousel: [8, 0.3], swing: [8, 0.3] }[id] || [8, 0.3];
      s.dist = Math.max(s.dist, cam[0]); s.pitch = cam[1];
      if (id === 'tower') s.ride.h = 0;
      say(id === 'tower' ? '🗼 Lift upar ja rahi hai! Mouse drag se chaaro taraf dekho • E = neeche aao' : id === 'hotair' ? '🎈 Balloon tumhare haath mein! W/A/S/D = udao • R = upar • F = neeche • E = utar jao' : `${RIDES[id].emoji} ${RIDES[id].name}: maze karo! Utarne ke liye E ya Space dabao`);
    }
    function startRide(id) {
      if (id === 'hotair') {
        // the balloon is steered by whoever is in it: the server decides if there is room and it is on the ground
        if (!hotairCanBoard()) { say('🎈 Balloon abhi udd raha hai! Jab wo neeche aaye tab baithna'); return; }
        if (s.boarding) return;
        s.boarding = true;
        socket.emit('balloonjoin', (r) => {
          s.boarding = false;
          if (s.ride || !r) return;
          if (!r.ok) { say(r.why === 'full' ? '🎈 Basket full hai: sirf 2 log baith sakte hain' : r.why === 'air' ? '🎈 Balloon abhi udd raha hai!' : '🎈 Balloon ke paas jao'); return; }
          beginRide('hotair', r.seat, 3600);
        });
        return;
      }
      beginRide(id, id === 'coaster' ? 0 : pickSeat(id, s.x, s.z, syncedNow() / 1000), 0);
    }
    function endRide() {
      const info = s.ride && RIDES[s.ride.id];
      if (s.ride && s.ride.id === 'tower' && !s.ride.down) { s.ride.down = true; return; } // the lift brings you down first
      const bal = s.ride && s.ride.id === 'hotair';
      s.ride = null;
      if (bal) {
        socket.emit('balloonleave'); balloonState.mine = false;
        // you step out wherever the balloon is: straight down next to it
        const away = Math.hypot(balloonState.x - FUN.hotair.x, balloonState.z - FUN.hotair.z) > 3.5;
        s.x = away ? clamp(balloonState.x, -FUN.B, FUN.B) : info.exit.x;
        s.z = away ? clamp(balloonState.z + 2.4, -FUN.B, FUN.B) : info.exit.z;
      } else if (info) { s.x = info.exit.x; s.z = info.exit.z; }
      s.y = 0; s.vy = 0;
    }
    function interact() {
      if (s.ride) { endRide(); return; }
      const n = nearest();
      if (!n) return;
      if (n.type === 'portal') socket.emit('goto', n.to);
      else if (n.type === 'ride') startRide(n.id);
      else if (n.type === 'booth') { if (onBooth) onBooth(n.id); }
      else if (n.type === 'cake') requestCandles();
      else if (n.type === 'stall') onEat(n.i);
      else if (n.type === 'ugift') onUserGift(n.id);
      else onGift(n.i);
    }
    world.current.nearest = nearest;
    world.current.interact = interact;
    // click on a ride: board it if you are near its glowing ring
    world.current.tryBoard = (id) => {
      const st = RIDES[id] && RIDES[id].stand;
      if (!st || s.ride || Math.hypot(s.x - st.x, s.z - st.z) > 7) return false;
      startRide(id);
      return true;
    };

    const kd = (e) => {
      if (typing()) return;
      const k = e.key.toLowerCase();
      keys.current[k] = true;
      if (k === ' ') { e.preventDefault(); if (s.ride) endRide(); else jump(); }
      if (k === '1') setEmote('wave', 2500);
      if (k === '2') world.current.emote('dance');
      if (k === '3') world.current.confetti();
      if (k === '4') world.current.emote('twirl');
      if (['5', '6', '7', '8'].includes(k)) socket.emit('react', REACTIONS[Number(k) - 5]);
      if (k === 'e') interact();
    };
    const ku = (e) => { keys.current[e.key.toLowerCase()] = false; };
    const blur = () => { keys.current = {}; };

    let drag = false;
    const el = gl.domElement;
    const pd = () => { drag = true; };
    const pu = () => { drag = false; };
    const pm = (e) => {
      if (!drag) return;
      s.yaw -= e.movementX * 0.006;
      s.pitch = clamp(s.pitch + e.movementY * 0.005, 0.06, 1.25);
    };
    const wheel = (e) => { s.dist = clamp(s.dist + e.deltaY * 0.005, 2.6, 14); };

    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointerup', pu);
    window.addEventListener('pointermove', pm);
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointermove', pm);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl, camera, world, socket, me.role, onGift, onEat, onUserGift, onBooth, requestCandles]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const k = world.current.paused ? {} : keys.current; // a pop-up game is open: stand still
    const inFun = world.current.where === 'fun';
    if (s.ride) {
      const el = (Date.now() - s.ride.t0) / 1000, info = RIDES[s.ride.id];
      if (s.ride.id === 'tower') { // the lift: up to the deck, wait there until you get off, then back down
        if (el > (s.ride.dur || info.dur)) s.ride.down = true;
        const ldt = Math.min(rawDt, 0.5); // the lift keeps its speed even on a slow computer
        s.ride.h = s.ride.down ? Math.max(0, s.ride.h - 8 * ldt) : Math.min(TOWER_H, s.ride.h + 5 * ldt);
        s.y = s.ride.h;
        if (s.ride.down) { const k2 = Math.min(1, dt * 6); s.x += (FUN.tower.x - s.x) * k2; s.z += (FUN.tower.z + 0.2 - s.z) * k2; }
        else if (s.ride.h < TOWER_H) { s.x = FUN.tower.x; s.z = FUN.tower.z + 0.2; } // rising in the lift; at the top you walk freely
        if (s.ride.down && s.ride.h <= 0) { s.ride = null; s.x = info.exit.x; s.z = info.exit.z; s.y = 0; s.vy = 0; }
      } else if (el >= (s.ride.dur || info.dur)) endRide();
      else if (s.ride.id === 'coaster') {
        const pt = coasterCurve.getPointAt(el / RIDE_SECS), tg = coasterCurve.getTangentAt(el / RIDE_SECS);
        s.x = pt.x; s.z = pt.z; s.y = pt.y + 0.3;
        s.ry = Math.atan2(tg.x, tg.z);
        let dyaw = Math.atan2(-tg.x, -tg.z) - s.yaw; // the camera swings round behind the car
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        s.yaw += dyaw * Math.min(1, dt * 2.2);
      } else {
        const pose = ridePose(s.ride.id, s.ride.seat, syncedNow() / 1000);
        s.x = pose.x; s.y = pose.y; s.z = pose.z; s.ry = pose.ry;
      }
    }
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    const f = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0);
    const r = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
    let dx = fx * f + rx * r, dz = fz * f + rz * r;
    const len = Math.hypot(dx, dz);
    const onDeck = !!(s.ride && s.ride.id === 'tower' && !s.ride.down && s.ride.h >= TOWER_H);
    const moving = len > 0 && (!s.ride || onDeck);
    if (s.ride && s.ride.id === 'hotair') { // steer the balloon: the server moves it, we only send what the pilot is pressing
      const ix = len ? dx / Math.max(1, len) : 0, iz = len ? dz / Math.max(1, len) : 0;
      const iy = (k['r'] || k['q'] || k['shift'] || k['pageup'] ? 1 : 0) - (k['f'] || k['z'] || k['c'] || k['pagedown'] ? 1 : 0);
      balloonState.inp = { x: ix, z: iz, y: iy };
      const sig = `${ix.toFixed(2)},${iz.toFixed(2)},${iy}`, tnow = performance.now();
      if (sig !== s.balSig || tnow - (s.balAt || 0) > 150) {
        s.balSig = sig; s.balAt = tnow;
        socket.emit('balloonin', { x: ix, z: iz, y: iy });
      }
    }

    if (moving) {
      dx /= len; dz /= len;
      const speed = k['shift'] ? 7.5 : 4.8;
      s.x += dx * speed * dt; s.z += dz * speed * dt;
      let d = Math.atan2(dx, dz) - s.ry;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.ry += d * Math.min(1, dt * 12);
      s.emote = null;
    }

    // room bounds + solid things
    if (inFun) {
      if (onDeck) { // the deck is a round platform: you can walk about on it but not off it
        const ox = s.x - FUN.tower.x, oz = s.z - FUN.tower.z, d = Math.hypot(ox, oz);
        if (d > 4.1) { s.x = FUN.tower.x + (ox / d) * 4.1; s.z = FUN.tower.z + (oz / d) * 4.1; }
      }
      if (!s.ride) {
        s.x = clamp(s.x, -FUN.B, FUN.B); s.z = clamp(s.z, -FUN.B, FUN.B);
        for (const b of FUN_BLOCKS) { // the rides are solid
          const ox = s.x - b.x, oz = s.z - b.z, d = Math.hypot(ox, oz);
          if (d < b.r) { const m = d || 1; s.x = b.x + (ox / m) * b.r; s.z = b.z + (oz / m) * b.r; }
        }
        for (const b of FUN_RECTS) { // the stall counters are solid too
          const ox = s.x - b.x, oz = s.z - b.z, hx = b.w / 2 + 0.35, hz = b.d / 2 + 0.35;
          if (Math.abs(ox) < hx && Math.abs(oz) < hz) {
            if (hx - Math.abs(ox) < hz - Math.abs(oz)) s.x = b.x + Math.sign(ox || 1) * hx;
            else s.z = b.z + Math.sign(oz || 1) * hz;
          }
        }
      }
    } else {
    s.x = clamp(s.x, -BX, BX); s.z = clamp(s.z, -BZ, BZ);
    const cx = s.x - CAKE.x, cz = s.z - CAKE.z, cd = Math.hypot(cx, cz), minD = TABLE_R + 0.35;
    if (cd < minD) { const m = cd || 1; s.x = CAKE.x + (cx / m) * minD; s.z = CAKE.z + (cz / m) * minD; }
    for (const stl of STALLS) {
      if (Math.abs(s.z - stl.z) < STALL_W / 2 + 0.3 && Math.abs(s.x - stl.x) < STALL_D / 2 + 0.35) {
        s.x = stl.x - stl.side * (STALL_D / 2 + 0.35);
      }
    }
    for (const b of BLOCKS) {
      const ox = s.x - b.x, oz = s.z - b.z, hx = b.w / 2 + 0.35, hz = b.d / 2 + 0.35;
      if (Math.abs(ox) < hx && Math.abs(oz) < hz) {
        if (hx - Math.abs(ox) < hz - Math.abs(oz)) s.x = b.x + Math.sign(ox || 1) * hx;
        else s.z = b.z + Math.sign(oz || 1) * hz;
      }
    }
    }

    // jump physics
    if (!s.ride && (s.y > 0 || s.vy > 0)) {
      s.vy -= 14 * dt; s.y += s.vy * dt;
      if (s.y <= 0) { s.y = 0; s.vy = 0; }
    }

    if (s.emote && performance.now() > s.emoteUntil) s.emote = null;
    // Standing still on the dance floor means dancing (can be switched off with the Auto-dance button).
    // Nobody is ever forced to dance elsewhere, not even during the celebration: Dance (key 2) is optional.
    const floor = !inFun && !s.ride && onDanceFloor(s.x, s.z) && s.y < 0.6;
    if (floor !== s.onFloor) { s.onFloor = floor; onFloor(floor); }
    s.anim = s.ride ? (s.ride.id === 'coaster' ? 'ride' : s.ride.id === 'tower' ? (moving ? 'walk' : 'idle') : 'sit') : s.y > 0.02 ? 'jump' : moving ? 'walk' : s.emote || (floor && world.current.autoDance !== false ? 'dance' : 'idle');

    if (grp.current) {
      grp.current.position.set(s.x, s.y, s.z);
      grp.current.rotation.y = s.ry;
    }

    // camera: follows behind the player and never leaves the room (so walls can't block the view)
    // If a wall is in the way the camera moves closer along its line (it never gets squashed onto the player).
    // When a wall squeezes it, the camera also rises so the player stays nicely framed from above.
    const reach = (v, d, lo, hi) => (d > 1e-4 ? (hi - v) / d : d < -1e-4 ? (lo - v) / d : Infinity);
    const solve = (pitch) => {
      const cp = Math.cos(pitch);
      const dx = Math.sin(s.yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(s.yaw) * cp;
      const d = inFun ? s.dist : Math.max(2.4, Math.min(
        s.dist, reach(s.x, dx, -(HX - 0.8), HX - 0.8), reach(s.z, dz, -(HZ - 0.8), HZ - 0.8), reach(1.3, dy, 0.8, WALL_H - 0.8),
      ));
      return { dx, dy, dz, d };
    };
    let cam = solve(s.pitch);
    if (cam.d < s.dist * 0.75) cam = solve(Math.min(1.15, s.pitch + (1 - cam.d / s.dist) * 0.9));
    const by = s.ride ? s.y : 0; // on the coaster the camera rides along high up
    camTarget.set(s.x + cam.dx * cam.d, by + 1.3 + cam.dy * cam.d, s.z + cam.dz * cam.d);
    camera.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
    camera.lookAt(s.x, by + 1.3 + (s.ride ? 0 : s.y * 0.5), s.z);

    // cake-slice pickups (Cake Hunt)
    const hs = world.current.hearts;
    if (hs && !inFun) {
      const now = performance.now();
      for (const h of hs) {
        if (Math.hypot(s.x - h.x, s.z - h.z) < 1.2) {
          const t = collecting.current.get(h.id);
          if (!t || now - t > 1200) { collecting.current.set(h.id, now); socket.emit('collect', h.id); }
        }
      }
    }

    // network send ~15Hz
    const now = performance.now();
    if (now - s.lastSend > 66) {
      s.lastSend = now;
      socket.emit('move', { x: s.x, y: s.y, z: s.z, ry: s.ry, anim: s.anim, w: inFun ? 'fun' : 'hall' });
    }

    // interaction prompt
    const n = s.ride ? { type: 'riding', left: s.ride.id === 'hotair' ? 'balloon' : s.ride.id === 'tower' ? 'tower' : Math.max(0, Math.ceil((s.ride.dur || RIDES[s.ride.id].dur) - (Date.now() - s.ride.t0) / 1000)) } : world.current.nearest && world.current.nearest();
    const p = n ? (n.type === 'stall' ? 'stall' + n.i : n.type === 'ugift' ? 'ugift' + n.id : n.type === 'portal' ? 'portal' + n.to : n.type === 'riding' ? 'riding:' + n.left : n.type === 'ride' ? 'ride:' + n.id : n.type === 'booth' ? 'booth:' + n.id : n.type) : '';
    if (p !== s.prompt) { s.prompt = p; onPrompt(p); }
  });

  return (
    <group ref={grp}>
      <Avatar color={me.color} name={me.name} role={me.role} bubble={bubble} react={react} out={out} getAnim={() => st.current.anim} isMe />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Room                                                                */
/* ------------------------------------------------------------------ */
function Banner() {
  const tex = useTextTexture((g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#ff4f9a'); gr.addColorStop(0.5, '#ffd166'); gr.addColorStop(1, '#7c4dff');
    g.clearRect(0, 0, w, h);
    // light cream plaque (matches the cream walls) with deeper lettering
    g.fillStyle = '#fffaf0';
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 40); g.fill();
    g.strokeStyle = gr; g.lineWidth = 8; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#6b2d8a'; g.font = '700 70px "Dancing Script", cursive';
    g.fillText(BANNER, w / 2, h * 0.32);
    const tg = g.createLinearGradient(w * 0.2, 0, w * 0.8, 0);
    tg.addColorStop(0, '#d6246e'); tg.addColorStop(0.5, '#d18a00'); tg.addColorStop(1, '#6a35d6');
    g.fillStyle = tg; g.font = '700 128px "Dancing Script", cursive';
    g.fillText(HOST + ' 💖', w / 2, h * 0.68);
  }, 1024, 320);
  return (
    <mesh position={[0, 5.7, -HZ + 0.06]}>
      <planeGeometry args={[7, 2.19]} />
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

function Plant({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]} castShadow><cylinderGeometry args={[0.38, 0.28, 0.7, 14]} /><meshStandardMaterial color="#b5651d" /></mesh>
      {[[0, 1.1, 0, 0.5], [0.3, 0.95, 0.1, 0.38], [-0.28, 1.0, -0.1, 0.4], [0.05, 1.45, 0.05, 0.34]].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}><sphereGeometry args={[r, 12, 12]} /><meshStandardMaterial color={i % 2 ? '#2d9d4f' : '#3bb35f'} roughness={0.9} /></mesh>
      ))}
    </group>
  );
}

function Sofa({ x, z, color }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow><boxGeometry args={[3.0, 0.5, 1.1]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
      <mesh position={[0, 0.85, -0.45]} castShadow><boxGeometry args={[3.0, 0.8, 0.25]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
      {[-1.4, 1.4].map((ax) => (
        <mesh key={ax} position={[ax, 0.55, 0]} castShadow><boxGeometry args={[0.25, 0.7, 1.1]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
      ))}
      {[-0.9, 0, 0.9].map((cxp, i) => (
        <mesh key={i} position={[cxp, 0.62, 0.05]}><boxGeometry args={[0.85, 0.2, 0.85]} /><meshStandardMaterial color={['#ffd166', '#fff0f6', '#ffd166'][i]} roughness={0.9} /></mesh>
      ))}
    </group>
  );
}

function DanceFloor() {
  const tiles = useRef([]);
  const N = 6, S = DANCE.size / N;
  const ball = useRef(), l1 = useRef(), l2 = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    tiles.current.forEach((m, i) => {
      if (!m) return;
      const x = i % N, z = Math.floor(i / N);
      m.material.emissive.setHSL((t * 0.12 + (x + z) * 0.07) % 1, 1, 0.42 + 0.2 * Math.sin(t * 3.5 + (x + z) * (i % 2 ? 1 : -1)));
    });
    if (ball.current) ball.current.rotation.y = t * 0.8;
    if (l1.current) l1.current.position.set(Math.cos(t * 0.9) * 4, 3.5, Math.sin(t * 0.9) * 4);
    if (l2.current) l2.current.position.set(Math.cos(t * 0.9 + 3.14) * 4, 3.5, Math.sin(t * 0.9 + 3.14) * 4);
  });
  return (
    <group position={[DANCE.x, 0, DANCE.z]}>
      {Array.from({ length: N * N }, (_, i) => (
        <mesh key={i} ref={(el) => (tiles.current[i] = el)} position={[((i % N) - (N - 1) / 2) * S, 0.03, (Math.floor(i / N) - (N - 1) / 2) * S]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[S - 0.06, S - 0.06]} />
          <meshStandardMaterial color="#0a0414" roughness={0.25} metalness={0.3} emissive="#ff4f9a" emissiveIntensity={1.5} />
        </mesh>
      ))}
      <mesh position={[0, 6.2, 0]}><cylinderGeometry args={[0.02, 0.02, 1.4, 6]} /><meshBasicMaterial color="#999" /></mesh>
      <mesh ref={ball} position={[0, 5.2, 0]}>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshStandardMaterial color="#d6d9ff" emissive="#7a7ac8" emissiveIntensity={0.7} metalness={0.4} roughness={0.2} flatShading />
      </mesh>
      <pointLight ref={l1} color="#ff4f9a" intensity={9} distance={9} />
      <pointLight ref={l2} color="#4cc9f0" intensity={9} distance={9} />
    </group>
  );
}

function Room() {
  const floor = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    const tones = ['#c89b6d', '#bf9262', '#d3a779', '#c4976a'];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = tones[i % tones.length]; g.fillRect(0, i * 64, 512, 64);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, i * 64, 512, 3);
      for (let j = 0; j < 3; j++) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(((i * 97 + j * 173) % 512), i * 64, 3, 64); }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 4.5);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);

  const lights = useMemo(() => {
    const out = [];
    const cols = ['#ff4f9a', '#ffd166', '#4cc9f0', '#06d6a0', '#ff8e53', '#c77dff'];
    const N = 34;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), sag = Math.sin(t * Math.PI * 4) * 0.12 - 0.3;
      out.push({ p: [-HX + 0.4 + t * (HX * 2 - 0.8), 6.4 + sag, -HZ + 0.25], c: cols[i % 6] });
      out.push({ p: [-HX + 0.25, 6.4 + sag, -HZ + 0.4 + t * (HZ * 2 - 0.8)], c: cols[(i + 2) % 6] });
      out.push({ p: [HX - 0.25, 6.4 + sag, -HZ + 0.4 + t * (HZ * 2 - 0.8)], c: cols[(i + 4) % 6] });
    }
    return out;
  }, []);

  const flags = useMemo(() => {
    const out = [];
    const cols = ['#ff4f9a', '#ffd166', '#4cc9f0', '#06d6a0', '#ff8e53', '#c77dff'];
    [-9, -1, 7].forEach((z, row) => {
      for (let i = 0; i < 22; i++) {
        const x = -13.2 + i * 1.2;
        out.push({ p: [x, 6.2 - Math.sin((i / 25) * Math.PI) * 0.35, z], r: [Math.PI, 0, 0], c: cols[(i + row) % 6] });
      }
    });
    return out;
  }, []);

  // light-pink wallpaper: soft stripes + tiny hearts and dots, tiled by wall size
  const wallTex = useMemo(() => {
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#ffdbe8'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#ffe9f1';
    for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 32, 0, 32, S);
    const heart = (x, y, s, col) => {
      g.fillStyle = col; g.beginPath();
      g.moveTo(x, y + s * 0.35);
      g.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.5, y - s, x, y - s * 0.4);
      g.bezierCurveTo(x + s * 0.5, y - s, x + s, y - s * 0.4, x, y + s * 0.35 + s * 0.65);
      g.fill();
    };
    [[64, 64], [192, 64], [128, 192], [0, 192], [256, 192]].forEach(([x, y]) => heart(x, y - 6, 15, '#ffb3cf'));
    [[128, 64], [0, 64], [256, 64], [64, 192], [192, 192]].forEach(([x, y]) => {
      g.fillStyle = '#fff7fb'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    });
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  const wallFor = (w) => {
    const t = wallTex.clone(); t.needsUpdate = true;
    t.repeat.set(w / 3, WALL_H / 3);
    return t;
  };
  const wallBack = useMemo(() => wallFor(HX * 2 + 1), [wallTex]);
  const wallSide = useMemo(() => wallFor(HZ * 2 + 0.8), [wallTex]);
  const wallBackMat = <meshStandardMaterial map={wallBack} roughness={0.95} />;
  const wallSideMat = <meshStandardMaterial map={wallSide} roughness={0.95} />;
  const rugs = [[6.8, '#ff7eb6'], [5.2, '#fff0f6'], [2.9, '#ffd166']]; // the party area around the cake
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HX * 2 + 1, HZ * 2 + 1]} />
        <meshStandardMaterial map={floor} roughness={0.85} />
      </mesh>
      {/* light cream ceiling (one-sided: you only ever see it from inside) */}
      <mesh position={[0, WALL_H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[HX * 2 + 1, HZ * 2 + 1]} />
        <meshStandardMaterial color="#fff0f6" roughness={1} />
      </mesh>
      {rugs.map(([r, col], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012 + i * 0.012, CAKE.z]} receiveShadow>
          <circleGeometry args={[r, 56]} />
          <meshStandardMaterial color={col} roughness={1} polygonOffset polygonOffsetFactor={-(i + 1)} polygonOffsetUnits={-(i + 1)} />
        </mesh>
      ))}
      {/* walls: back (video wall), left, right. The front wall lives in GameScreen. */}
      <mesh position={[0, WALL_H / 2, -HZ - 0.2]}><boxGeometry args={[HX * 2 + 1, WALL_H, 0.4]} />{wallBackMat}</mesh>
      <mesh position={[-HX - 0.2, WALL_H / 2, 0]}><boxGeometry args={[0.4, WALL_H, HZ * 2 + 0.8]} />{wallSideMat}</mesh>
      <mesh position={[HX + 0.2, WALL_H / 2, 0]}><boxGeometry args={[0.4, WALL_H, HZ * 2 + 0.8]} />{wallSideMat}</mesh>
      <mesh position={[0, 0.2, -HZ + 0.06]}><boxGeometry args={[HX * 2, 0.4, 0.12]} /><meshStandardMaterial color="#f08fb4" /></mesh>
      <mesh position={[-HX + 0.06, 0.2, 0]}><boxGeometry args={[0.12, 0.4, HZ * 2]} /><meshStandardMaterial color="#f08fb4" /></mesh>
      <mesh position={[HX - 0.06, 0.2, 0]}><boxGeometry args={[0.12, 0.4, HZ * 2]} /><meshStandardMaterial color="#f08fb4" /></mesh>

      <Banner />
      <Instanced items={lights} geometry={<sphereGeometry args={[0.1, 8, 8]} />} />
      <Instanced items={flags} geometry={<coneGeometry args={[0.3, 0.55, 3]} />} />
      {[-9, -1, 7].map((z) => (
        <mesh key={z} position={[0, 6.05, z]}><boxGeometry args={[HX * 2, 0.02, 0.02]} /><meshBasicMaterial color="#eee" /></mesh>
      ))}

      {/* lounge under the video wall */}
      {SOFAS.map((s, i) => <Sofa key={i} x={s.x} z={s.z} color={i ? '#7c4dff' : '#ff4f9a'} />)}
      <mesh position={[0, 0.3, -11.6]} castShadow><boxGeometry args={[1.6, 0.6, 0.9]} /><meshStandardMaterial color="#5c3d2e" /></mesh>
      <mesh position={[0, 0.63, -11.6]}><boxGeometry args={[1.7, 0.06, 1.0]} /><meshStandardMaterial color="#e8d5b7" /></mesh>

      {[[-14.6, -13.2], [14.6, -13.2], [-14.6, 13.2], [14.6, 13.2], [-13, 0.4], [13, 0.4]].map(([x, z], i) => <Plant key={i} position={[x, 0, z]} />)}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Cake, balloons, gifts                                               */
/* ------------------------------------------------------------------ */
// A heart-shaped slab. The tip points toward +z (the viewer) and the two lobes toward the video wall.
function heartGeometry(depth) {
  const s = new THREE.Shape();
  s.moveTo(0.25, 0.25);
  s.bezierCurveTo(0.25, 0.25, 0.2, 0, 0, 0);
  s.bezierCurveTo(-0.3, 0, -0.3, 0.35, -0.3, 0.35);
  s.bezierCurveTo(-0.3, 0.55, -0.1, 0.77, 0.25, 0.95);
  s.bezierCurveTo(0.6, 0.77, 0.8, 0.55, 0.8, 0.35);
  s.bezierCurveTo(0.8, 0.35, 0.8, 0, 0.5, 0);
  s.bezierCurveTo(0.35, 0, 0.25, 0.25, 0.25, 0.25);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 28 });
  g.rotateX(Math.PI / 2);
  g.center();
  return g;
}

// Candles sit along the outline of the top heart.
const CANDLES = Array.from({ length: 8 }, (_, i) => {
  const t = (i / 8) * Math.PI * 2 + 0.2;
  const hx = 16 * Math.sin(t) ** 3;
  const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return [hx * 0.0245, -(hy + 2.5) * 0.0245];
});

function Cake({ lit, onClick }) {
  const light = useRef();
  const flames = useRef([]);
  const slab = useMemo(() => heartGeometry(0.25), []);
  const ice = useMemo(() => heartGeometry(0.03), []);
  const tiers = [
    { s: 2.2, y: 1.33, c: '#ff7eb6' },
    { s: 1.7, y: 1.815, c: '#ffe3f0' },
    { s: 1.15, y: 2.175, c: '#ff4f9a' },
  ];
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (light.current) light.current.intensity = lit ? 2.2 + Math.sin(t * 17) * 0.5 : 0;
    flames.current.forEach((f, i) => {
      if (!f) return;
      f.visible = lit;
      f.scale.setScalar(1 + Math.sin(t * 14 + i) * 0.18);
    });
  });
  return (
    <group position={[CAKE.x, 0, CAKE.z]} onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onClick(); } }}>
     {/* the cake itself is modelled at full size and shown at CAKE_SCALE */}
     <group scale={CAKE_SCALE}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow><cylinderGeometry args={[1.6, 1.6, 1, 32]} /><meshStandardMaterial color="#fff5fa" /></mesh>
      <mesh position={[0, 1.02, 0]}><cylinderGeometry args={[1.65, 1.65, 0.06, 32]} /><meshStandardMaterial color="#ff7eb6" /></mesh>
      {tiers.map((t, i) => (
        <group key={i}>
          <mesh geometry={slab} position={[0, t.y, 0]} scale={t.s} castShadow><meshStandardMaterial color={t.c} roughness={0.55} /></mesh>
          {/* white icing on top of each tier */}
          <mesh geometry={ice} position={[0, t.y + 0.125 * t.s + 0.012, 0]} scale={t.s * 1.03}><meshStandardMaterial color="#ffffff" roughness={0.4} /></mesh>
        </group>
      ))}
      {CANDLES.map(([cx, cz], i) => (
        <group key={i} position={[cx, 2.5, cz]}>
          <mesh><cylinderGeometry args={[0.03, 0.03, 0.3, 8]} /><meshStandardMaterial color={['#ffd166', '#4cc9f0', '#ff4f9a'][i % 3]} /></mesh>
          <mesh ref={(el) => (flames.current[i] = el)} position={[0, 0.24, 0]}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshBasicMaterial color="#ffd54a" />
          </mesh>
        </group>
      ))}
     </group>
      <pointLight ref={light} position={[0, 2.3, 0]} color="#ffb74d" distance={8} />
      <Label text={lit ? '💖 cake' : '💨 wish maango!'} position={[0, 2.5, 0]} style="prop" height={0.3} />
    </group>
  );
}

function Balloon({ b, onPop }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime + b.id;
    ref.current.position.y = b.y + Math.sin(t * 0.9) * 0.25;
    ref.current.rotation.z = Math.sin(t * 0.7) * 0.08;
  });
  return (
    <group ref={ref} position={[b.x, b.y, b.z]} onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onPop(b.id); } }}>
      <mesh scale={[1, 1.2, 1]}>
        <sphereGeometry args={[0.5, 20, 20]} />
        <meshStandardMaterial color={b.color} roughness={0.25} metalness={0.15} />
      </mesh>
      <mesh position={[0, -0.66, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.07, 0.12, 8]} /><meshStandardMaterial color={b.color} /></mesh>
      <mesh position={[0, -1.9, 0]}><cylinderGeometry args={[0.007, 0.007, 2.3, 4]} /><meshBasicMaterial color="#ffffff" /></mesh>
    </group>
  );
}

function Gift({ g, i, onOpen }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = 0.45 + Math.abs(Math.sin(clock.elapsedTime * 1.6 + i)) * 0.12;
  });
  return (
    <group position={[g.x, 0, g.z]} onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onOpen(i); } }}>
      <group ref={ref}>
        <mesh castShadow><boxGeometry args={[0.9, 0.9, 0.9]} /><meshStandardMaterial color={g.color} /></mesh>
        <mesh><boxGeometry args={[0.95, 0.95, 0.16]} /><meshStandardMaterial color="#fff" /></mesh>
        <mesh><boxGeometry args={[0.16, 0.95, 0.95]} /><meshStandardMaterial color="#fff" /></mesh>
        <mesh position={[0, 0.55, 0]}><torusGeometry args={[0.2, 0.06, 8, 16]} /><meshStandardMaterial color="#fff" /></mesh>
      </group>
      <Label text={`🎁 gift ${i + 1}`} position={[0, 1.9, 0]} style="prop" height={0.28} />
    </group>
  );
}

// Gifts friends sent to Manisha. They sit on the rug behind the cake; she opens them.
function UserGift({ g, onOpen }) {
  const ref = useRef();
  const sl = giftSlot(g.id);
  const col = ['#ff4f9a', '#7c4dff', '#06d6a0', '#ff8e53', '#4cc9f0', '#f72585'][g.id % 6];
  useFrame(({ clock }) => {
    if (ref.current && !g.opened) ref.current.position.y = 0.32 + Math.abs(Math.sin(clock.elapsedTime * 2 + g.id)) * 0.09;
  });
  return (
    <group position={[sl.x, 0, sl.z]} onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onOpen(g.id); } }}>
      <group ref={ref} position={[0, 0.32, 0]}>
        <mesh castShadow><boxGeometry args={[0.6, 0.6, 0.6]} /><meshStandardMaterial color={col} /></mesh>
        <mesh><boxGeometry args={[0.64, 0.64, 0.1]} /><meshStandardMaterial color="#fff" /></mesh>
        <mesh position={[0, g.opened ? 0.52 : 0.33, g.opened ? -0.3 : 0]} rotation={[g.opened ? -1.1 : 0, 0, 0]}>
          <boxGeometry args={[0.66, 0.08, 0.66]} /><meshStandardMaterial color={col} />
        </mesh>
        {!g.opened && <mesh position={[0, 0.42, 0]}><torusGeometry args={[0.14, 0.04, 8, 14]} /><meshStandardMaterial color="#fff" /></mesh>}
      </group>
      <Label text={`${g.opened ? '📖' : '🎁'} ${g.from}`} position={[0, 1.15, 0]} style="prop" height={0.24} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Food stalls                                                         */
/* ------------------------------------------------------------------ */
function StallProps({ id }) {
  const top = 1.07;
  if (id === 'golgappa') {
    return (
      <group position={[0, top, 0]}>
        <mesh position={[-0.9, 0.22, 0]}><cylinderGeometry args={[0.24, 0.3, 0.44, 16]} /><meshStandardMaterial color="#a0522d" /></mesh>
        <mesh position={[-0.9, 0.45, 0]}><cylinderGeometry args={[0.2, 0.2, 0.02, 16]} /><meshStandardMaterial color="#6abf4b" /></mesh>
        <mesh position={[0.1, 0.03, 0]}><cylinderGeometry args={[0.5, 0.5, 0.05, 20]} /><meshStandardMaterial color="#fff" /></mesh>
        {Array.from({ length: 9 }, (_, k) => (
          <mesh key={k} position={[0.1 + Math.cos(k * 0.7) * (0.12 + (k % 3) * 0.1), 0.14 + (k > 5 ? 0.12 : 0), Math.sin(k * 0.7) * (0.12 + (k % 3) * 0.1)]}>
            <sphereGeometry args={[0.1, 10, 10]} /><meshStandardMaterial color="#e0a030" roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0.95, 0.12, 0]}><cylinderGeometry args={[0.18, 0.14, 0.22, 12]} /><meshStandardMaterial color="#c0392b" /></mesh>
      </group>
    );
  }
  if (id === 'momos') {
    return (
      <group position={[0, top, 0]}>
        {[0, 1, 2].map((k) => (
          <mesh key={k} position={[-0.8, 0.12 + k * 0.2, 0]}><cylinderGeometry args={[0.36, 0.36, 0.18, 18]} /><meshStandardMaterial color={k === 2 ? '#d4a76a' : '#c9ccd1'} metalness={0.4} roughness={0.4} /></mesh>
        ))}
        <mesh position={[0.5, 0.03, 0]}><cylinderGeometry args={[0.45, 0.45, 0.05, 20]} /><meshStandardMaterial color="#fff" /></mesh>
        {Array.from({ length: 6 }, (_, k) => (
          <mesh key={k} position={[0.5 + Math.cos(k * 1.05) * 0.24, 0.12, Math.sin(k * 1.05) * 0.24]} scale={[1, 0.7, 0.8]}>
            <sphereGeometry args={[0.11, 10, 10]} /><meshStandardMaterial color="#fff6e5" />
          </mesh>
        ))}
      </group>
    );
  }
  if (id === 'chai') {
    return (
      <group position={[0, top, 0]}>
        <mesh position={[-0.6, 0.22, 0]}><cylinderGeometry args={[0.22, 0.28, 0.44, 16]} /><meshStandardMaterial color="#c9ccd1" metalness={0.6} roughness={0.3} /></mesh>
        <mesh position={[-0.35, 0.3, 0]} rotation={[0, 0, -0.8]}><cylinderGeometry args={[0.03, 0.05, 0.3, 8]} /><meshStandardMaterial color="#c9ccd1" metalness={0.6} /></mesh>
        <mesh position={[-0.6, 0.55, 0]}><torusGeometry args={[0.14, 0.025, 8, 14, Math.PI]} /><meshStandardMaterial color="#444" /></mesh>
        {[0.2, 0.5, 0.8, 1.1].map((x, k) => (
          <mesh key={k} position={[x, 0.07, 0.1 * (k % 2 ? 1 : -1)]}><cylinderGeometry args={[0.07, 0.055, 0.12, 12]} /><meshStandardMaterial color="#fff" /></mesh>
        ))}
      </group>
    );
  }
  if (id === 'pizza') {
    return (
      <group position={[0, top, 0]}>
        <mesh position={[-0.5, 0.03, 0]}><cylinderGeometry args={[0.6, 0.6, 0.05, 24]} /><meshStandardMaterial color="#8d5524" /></mesh>
        <mesh position={[-0.5, 0.08, 0]}><cylinderGeometry args={[0.52, 0.52, 0.05, 24]} /><meshStandardMaterial color="#f4b942" /></mesh>
        {Array.from({ length: 7 }, (_, k) => (
          <mesh key={k} position={[-0.5 + Math.cos(k * 0.95) * 0.28, 0.12, Math.sin(k * 0.95) * 0.28]}><cylinderGeometry args={[0.07, 0.07, 0.03, 10]} /><meshStandardMaterial color="#b3202a" /></mesh>
        ))}
        {[0, 1, 2].map((k) => (
          <mesh key={k} position={[0.7 + k * 0.05, 0.06 + k * 0.05, 0]} rotation={[0, k * 0.4, 0]}><boxGeometry args={[0.55, 0.05, 0.5]} /><meshStandardMaterial color="#f4b942" /></mesh>
        ))}
      </group>
    );
  }
  if (id === 'drink') {
    const cols = ['#e63946', '#2a9d8f', '#f4a261', '#8338ec', '#06d6a0'];
    return (
      <group position={[0, top, 0]}>
        {cols.map((c, k) => (
          <mesh key={k} position={[-1 + k * 0.5, 0.2, 0.05 * (k % 2 ? 1 : -1)]}><cylinderGeometry args={[0.09, 0.09, 0.4, 12]} /><meshStandardMaterial color={c} roughness={0.2} /></mesh>
        ))}
        <mesh position={[0.9, 0.12, 0.2]}><boxGeometry args={[0.5, 0.24, 0.4]} /><meshStandardMaterial color="#9bf6ff" roughness={0.3} /></mesh>
      </group>
    );
  }
  if (id === 'icecream') {
    const cols = ['#ff9ec7', '#fff3b0', '#8d5524', '#a0e7e5', '#ffd1a6'];
    return (
      <group position={[0, top, 0]}>
        {cols.map((c, k) => (
          <group key={k} position={[-1 + k * 0.5, 0, 0]}>
            <mesh position={[0, 0.2, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.13, 0.4, 12]} /><meshStandardMaterial color="#e0a96d" /></mesh>
            <mesh position={[0, 0.5, 0]}><sphereGeometry args={[0.16, 14, 14]} /><meshStandardMaterial color={c} roughness={0.5} /></mesh>
          </group>
        ))}
      </group>
    );
  }
  if (id === 'candy') {
    const cols = ['#ff9ec7', '#a0c4ff', '#ffadad', '#caffbf'];
    return (
      <group position={[0, top, 0]}>
        {cols.map((c, k) => (
          <group key={k} position={[-0.9 + k * 0.6, 0, 0]}>
            <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.015, 0.015, 0.5, 6]} /><meshStandardMaterial color="#fff" /></mesh>
            <mesh position={[0, 0.65, 0]} scale={[1, 0.9, 1]}><sphereGeometry args={[0.27, 14, 14]} /><meshStandardMaterial color={c} roughness={1} /></mesh>
          </group>
        ))}
      </group>
    );
  }
  // jalebi
  return (
    <group position={[0, top, 0]}>
      <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.6, 0.6, 0.05, 20]} /><meshStandardMaterial color="#fff" /></mesh>
      {Array.from({ length: 8 }, (_, k) => (
        <mesh key={k} position={[Math.cos(k * 0.8) * 0.28, 0.1 + (k > 4 ? 0.08 : 0), Math.sin(k * 0.8) * 0.28]} rotation={[Math.PI / 2, 0, k]}>
          <torusGeometry args={[0.13, 0.045, 8, 16]} /><meshStandardMaterial color="#f08a00" roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Stall({ st, i, onEat }) {
  const sign = useTextTexture((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = st.color; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 30); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 84px "Dancing Script", cursive';
    g.fillText(st.emoji + ' ' + st.name, w / 2, h / 2 + 4);
  }, 512, 160);
  // meme board in the middle of the stall: big emoji picture, white caption with a black outline above and below
  const meme = useTextTexture((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, st.color); bg.addColorStop(1, '#2b1b3d');
    g.fillStyle = bg; g.fillRect(10, 10, w - 20, h - 20);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '170px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.fillText(st.emoji, w / 2, h / 2 + 6);
    const cap = (t, y) => {
      let px = 56;
      g.font = `900 ${px}px Impact, "Arial Black", sans-serif`;
      while (g.measureText(t).width > w - 44 && px > 24) { px -= 3; g.font = `900 ${px}px Impact, "Arial Black", sans-serif`; }
      g.lineJoin = 'round'; g.lineWidth = px / 5; g.strokeStyle = '#000'; g.strokeText(t, w / 2, y);
      g.fillStyle = '#fff'; g.fillText(t, w / 2, y);
    };
    cap(st.meme[0], 52); cap(st.meme[1], h - 52);
  }, 512, 320);
  const stripes = ['#ff4f9a', '#ffffff'];
  return (
    <group
      position={[st.x, 0, st.z]} rotation={[0, st.side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
      onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onEat(i); } }}
    >
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow><boxGeometry args={[STALL_W, 1, STALL_D]} /><meshStandardMaterial color={st.color} /></mesh>
      <mesh position={[0, 1.03, 0]}><boxGeometry args={[STALL_W + 0.1, 0.08, STALL_D + 0.1]} /><meshStandardMaterial color="#fff5e6" /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (STALL_W / 2 - 0.05), 1.75, -0.55]}><cylinderGeometry args={[0.05, 0.05, 3.5, 8]} /><meshStandardMaterial color="#5c3d2e" /></mesh>
      ))}
      <mesh position={[0, 2.0, -0.62]}><boxGeometry args={[STALL_W, 2, 0.06]} /><meshStandardMaterial color="#ffd0e1" /></mesh>
      <group position={[0, 3.0, 0.1]} rotation={[0.3, 0, 0]}>
        {Array.from({ length: 6 }, (_, k) => (
          <mesh key={k} position={[-STALL_W / 2 + (k + 0.5) * (STALL_W / 6), 0, 0]}>
            <boxGeometry args={[STALL_W / 6, 0.06, 1.7]} /><meshStandardMaterial color={stripes[k % 2]} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 3.65, -0.5]}><planeGeometry args={[2.6, 0.81]} /><meshBasicMaterial map={sign} transparent /></mesh>
      <mesh position={[0, 2.0, -0.585]}><planeGeometry args={[2.4, 1.5]} /><meshBasicMaterial map={meme} toneMapped={false} /></mesh>
      <StallProps id={st.id} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Video wall (back wall)                                              */
/* ------------------------------------------------------------------ */
function VideoTile({ stream, mirror, w, h, position }) {
  const video = useMemo(() => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.autoplay = true;
    v.srcObject = stream;
    v.play().catch(() => {});
    return v;
  }, [stream]);
  const tex = useMemo(() => {
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [video]);
  useEffect(() => () => { tex.dispose(); video.srcObject = null; }, [tex, video]);
  return (
    <mesh position={position} scale={[mirror ? -1 : 1, 1, 1]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

function PlaceholderTile({ person, w, h, position }) {
  const tex = useTextTexture((g, cw, ch) => {
    g.fillStyle = '#2a1245'; g.fillRect(0, 0, cw, ch);
    g.fillStyle = person.color; g.beginPath(); g.arc(cw / 2, ch / 2, ch * 0.3, 0, 6.283); g.fill();
    g.fillStyle = '#fff'; g.font = '700 110px "Poppins", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((person.name || '?').charAt(0).toUpperCase(), cw / 2, ch / 2 + 6);
  }, 320, 240);
  return (
    <mesh position={position}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

function VideoWall({ people, streams, localStream, meId }) {
  const n = Math.max(people.length, 1);
  const rows = n <= 5 ? 1 : n <= 12 ? 2 : n <= 24 ? 3 : 4;
  const cols = Math.ceil(n / rows);
  const W = 13.2, H = 3.6, CY = 2.5;
  const cw = W / cols, ch = H / rows;
  const tw = Math.min(cw - 0.08, (ch - 0.08) * (4 / 3)), th = ch - 0.08;

  return (
    <group position={[0, 0, -HZ + 0.1]}>
      <mesh position={[0, CY, -0.03]}><boxGeometry args={[W + 0.4, H + 0.3, 0.06]} /><meshStandardMaterial color="#120824" /></mesh>
      {people.map((p, k) => {
        const r = Math.floor(k / cols), c = k % cols;
        const inRow = r < rows - 1 ? cols : n - (rows - 1) * cols;
        const x = -W / 2 + cw * (c + 0.5) + ((cols - inRow) * cw) / 2;
        const y = CY + H / 2 - ch * (r + 0.5);
        const stream = p.id === meId ? localStream : streams[p.id];
        const hasVideo = stream && stream.getVideoTracks().length > 0;
        return (
          <group key={p.id}>
            {hasVideo
              ? <VideoTile key={stream.id} stream={stream} mirror={p.id === meId} w={tw} h={th} position={[x, y, 0.01]} />
              : <PlaceholderTile person={p} w={tw} h={th} position={[x, y, 0.01]} />}
            <Label text={p.name} position={[x, y - th / 2 + 0.2, 0.05]} style={p.id === meId ? 'me' : 'default'} height={0.26} />
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Game screen (front wall, opposite the video wall)                   */
/* ------------------------------------------------------------------ */
function wrapLines(g, text, maxW) {
  const lines = [];
  let cur = '';
  String(text).split(' ').forEach((w) => {
    const test = cur ? cur + ' ' + w : w;
    if (g.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  });
  if (cur) lines.push(cur);
  return lines;
}

const SLIDE_COUNT = 9; // public/photos/m1.jpg ... m9.jpg
const SLIDE_MS = 5000;

function paintScreen(g, w, h, s, imgs, onImg) {
  g.clearRect(0, 0, w, h);
  const secs = s.endsAt ? Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000)) : 0;
  let bg = 'rgba(25,8,45,.92)';
  if (s.mode === 'redlight') bg = s.phase === 'green' ? 'rgba(8,80,36,.94)' : s.phase === 'red' ? 'rgba(110,10,24,.95)' : bg;
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#ff4f9a'); gr.addColorStop(0.5, '#ffd166'); gr.addColorStop(1, '#7c4dff');
  g.fillStyle = bg;
  g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 54); g.fill();
  g.strokeStyle = gr; g.lineWidth = 10; g.stroke();
  g.textBaseline = 'middle';
  const center = (t, y, font, color) => { g.textAlign = 'center'; g.font = font; g.fillStyle = color; g.fillText(t, w / 2, y); };
  const DS = '"Dancing Script", cursive', PP = '"Poppins", "Segoe UI Emoji", sans-serif';

  if (s.mode === 'gift') {
    const hasPhoto = !!s.photo;
    if (hasPhoto) {
      let img = imgs.get(s.id);
      if (!img) { img = new Image(); img.onload = onImg; img.src = s.photo; imgs.set(s.id, img); }
      g.save();
      g.translate(280, 262); g.rotate(-0.045);
      g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 24;
      g.fillRect(-215, -215, 430, 430);
      g.shadowBlur = 0;
      if (img.complete && img.naturalWidth) {
        const bw = 390, bh = 340, sc = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
        const sw = bw / sc, sh = bh / sc;
        g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, -195, -195, bw, bh);
      } else { g.fillStyle = '#ccc'; g.fillRect(-195, -195, 390, 340); }
      g.fillStyle = '#7a1f5c'; g.font = `700 40px ${DS}`; g.textAlign = 'center';
      g.fillText('💖 ' + s.from, 0, 180);
      g.restore();
    }
    const left = hasPhoto ? 560 : 120, maxW = hasPhoto ? w - 560 - 90 : w - 240;
    g.textAlign = 'left'; g.fillStyle = '#ffd166'; g.font = `500 40px ${PP}`;
    g.fillText(`🎁 ${s.from} ne ${HOST} ke liye bheja`, left, 95);
    g.fillStyle = '#fff'; g.font = `700 70px ${DS}`;
    const lines = wrapLines(g, s.text || 'Happy Birthday! 💖', maxW).slice(0, 4);
    lines.forEach((l, i) => g.fillText(l, left, 190 + i * 78));
    return;
  }

  if (s.mode === 'quiz') {
    if (s.phase === 'end') {
      center('🏆 Quiz khatam!', 120, `700 110px ${DS}`, '#fff');
      center(s.winner ? `Jeetne wala: ${s.winner} 🎉` : 'Kisi ne jawab nahi diya 😅', 225, `600 56px ${PP}`, '#ffd166');
      const line = (s.top || []).map((t, i) => `${['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]} ${t.name} ${t.n}`).join('   ');
      center(line, 345, `500 40px ${PP}`, '#fff');
      return;
    }
    g.textAlign = 'left'; g.font = `600 36px ${PP}`; g.fillStyle = '#ffd166';
    g.fillText(`🧠 Manisha Quiz · Sawaal ${s.idx + 1}/${s.total}`, 60, 62);
    if (s.phase === 'question') { g.textAlign = 'right'; g.fillStyle = secs <= 5 ? '#ff6b7a' : '#7CFF9E'; g.fillText(`⏱ ${secs}s`, w - 60, 62); }
    g.font = `700 54px ${PP}`; g.fillStyle = '#fff'; g.textAlign = 'center';
    const ql = wrapLines(g, s.q, w - 200).slice(0, 2);
    ql.forEach((l, i) => g.fillText(l, w / 2, 135 + i * 64));
    const top = ql.length > 1 ? 255 : 215;
    (s.options || []).forEach((o, i) => {
      const x = 60 + (i % 2) * 716, y = top + Math.floor(i / 2) * 100;
      const reveal = s.phase === 'reveal';
      g.fillStyle = reveal ? (i === s.correct ? 'rgba(40,170,80,.95)' : 'rgba(255,255,255,.08)') : 'rgba(255,255,255,.16)';
      g.beginPath(); g.roundRect(x, y, 700, 84, 22); g.fill();
      g.textAlign = 'left'; g.font = `600 40px ${PP}`; g.fillStyle = '#fff';
      g.fillText(`${'ABCD'[i]})  ${o}${reveal && s.counts ? `  (${s.counts[i]})` : ''}`, x + 30, y + 44);
    });
    if (s.phase === 'reveal' && s.top && s.top.length) {
      center(s.top.slice(0, 3).map((t, i) => `${['🥇', '🥈', '🥉'][i]} ${t.name} ${t.n}`).join('    '), h - 52, `500 34px ${PP}`, '#ffd166');
    }
    return;
  }

  if (s.mode === 'redlight') {
    if (s.phase === 'countdown') {
      center('🚦 Red Light, Green Light', 105, `700 100px ${DS}`, '#fff');
      center(`Tayyar ho jao... ${secs}`, 235, `700 110px ${PP}`, '#ffd166');
      center('Start line se daudo, finish line 🏁 tak pahuncho. RED pe hilna mat!', 370, `500 40px ${PP}`, '#fff');
    } else if (s.phase === 'green') {
      center('🟢 GO! DAUDO!', 190, `700 150px ${PP}`, '#9dffb4');
      center(`Bache hue: ${s.alive}/${s.total}`, 350, `600 56px ${PP}`, '#fff');
    } else if (s.phase === 'red') {
      center('🔴 STOP! HILO MAT!', 190, `700 150px ${PP}`, '#ff8a96');
      center(`Bache hue: ${s.alive}/${s.total}`, 350, `600 56px ${PP}`, '#fff');
    } else {
      center(s.winner ? `🏆 ${s.winner} jeet gaya!` : 'Koi nahi jeeta 😅', 215, `700 110px ${DS}`, '#fff');
      center('Game khatam. Shabaash sabko! 🎉', 360, `500 44px ${PP}`, '#ffd166');
    }
    return;
  }

  if (s.mode === 'pop') {
    g.fillStyle = '#fff'; g.font = `700 116px ${DS}`; g.textAlign = 'center';
    const tl = wrapLines(g, s.title, w - 220);
    const y0 = h * (tl.length > 1 ? 0.2 : 0.3);
    tl.forEach((l, i) => g.fillText(l, w / 2, y0 + i * 118));
    g.fillStyle = '#ffd166'; g.font = `500 60px ${PP}`;
    const bl = wrapLines(g, s.text, w - 260);
    const by = y0 + tl.length * 118 + 30;
    bl.forEach((l, i) => g.fillText(l, w / 2, by + i * 70));
    center(`🎈 ${s.by} ne balloon phoda`, h - 52, `400 36px ${PP}`, 'rgba(255,255,255,.65)');
    return;
  }

  // idle: Manisha's photos (one every few seconds) on the left, the usual hints on the right
  const slide = Math.floor(Date.now() / SLIDE_MS) % SLIDE_COUNT;
  const slideImg = (n) => {
    let img = imgs.get('slide' + n);
    if (!img) { img = new Image(); img.onload = onImg; img.src = `/photos/m${n + 1}.jpg`; imgs.set('slide' + n, img); }
    return img;
  };
  slideImg((slide + 1) % SLIDE_COUNT); // warm the next one
  const pic = slideImg(slide);
  g.save();
  g.translate(262, 256); g.rotate(-0.035);
  g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 24;
  g.fillRect(-212, -232, 424, 464);
  g.shadowBlur = 0;
  const pw = 384, ph = 386;
  if (pic.complete && pic.naturalWidth) {
    const k = Math.max(pw / pic.naturalWidth, ph / pic.naturalHeight);
    const sw = pw / k, sh = ph / k;
    // crop biased towards the top so faces stay in the frame
    g.drawImage(pic, (pic.naturalWidth - sw) / 2, (pic.naturalHeight - sh) * 0.25, sw, sh, -192, -212, pw, ph);
  } else { g.fillStyle = '#f3d6e2'; g.fillRect(-192, -212, pw, ph); }
  g.fillStyle = '#7a1f5c'; g.font = `700 46px ${DS}`; g.textAlign = 'center';
  g.fillText('💖 ' + HOST, 0, 200);
  g.restore();

  const left = 540, maxW = w - left - 60;
  g.textAlign = 'left';
  g.font = `500 32px ${PP}`; g.fillStyle = '#ffd166';
  g.fillText('🎈 Balloon phodo! Har balloon mein ek surprise message hai', left, 64);
  g.fillStyle = '#fff';
  // long message: shrink the font until every line fits above the Cake Hunt row
  let fs = 66, msgLines = [];
  for (; fs >= 28; fs -= 4) {
    g.font = `700 ${fs}px ${DS}`;
    msgLines = wrapLines(g, SCREEN_MESSAGE, maxW);
    if (msgLines.length * fs * 1.2 <= 290) break;
  }
  g.font = `700 ${fs}px ${DS}`;
  msgLines.slice(0, 7).forEach((l, i) => g.fillText(l, left, 90 + fs + i * fs * 1.2));
  const sc = s.scores || [];
  g.font = `600 30px ${PP}`; g.fillStyle = '#ffe9a8';
  const hh = sc.length ? '🍰 Cake Hunt: ' + sc.slice(0, 3).map((t, i) => `${['🥇', '🥈', '🥉'][i]} ${t.name} ${t.n}`).join('   ')
    : '🍰 Cake Hunt: cake katne ke baad slices aayenge, ikatthe karo';
  g.fillText(wrapLines(g, hh, maxW)[0], left, 448);
  g.font = `400 26px ${PP}`; g.fillStyle = 'rgba(255,255,255,.7)';
  g.fillText('🎁 Manisha ke liye gift bhejna ho to "Gift bhejo" dabao', left, 484);
}

function GameScreen({ screen }) {
  const [now, setNow] = useState(0);
  const [imgTick, setImgTick] = useState(0);
  const imgs = useRef(new Map());
  const { canvas, tex } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1536; c.height = 512;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { canvas: c, tex: t };
  }, []);

  // timed games repaint often (countdowns); the idle screen only needs to flip photos
  const ticking = !!(screen && (screen.endsAt || screen.mode === 'idle'));
  const tickMs = screen && screen.endsAt ? 400 : 1000;
  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [ticking, tickMs]);

  useEffect(() => {
    const paint = () => {
      paintScreen(canvas.getContext('2d'), canvas.width, canvas.height, screen, imgs.current, () => setImgTick((n) => n + 1));
      tex.needsUpdate = true;
    };
    paint();
    if (document.fonts) document.fonts.load('700 100px "Dancing Script"').then(paint).catch(() => {});
  }, [screen, now, imgTick, canvas, tex]);

  useEffect(() => () => tex.dispose(), [tex]);

  return (
    <group>
      {/* One-sided wall: invisible from outside, so the camera is never blocked near it. */}
      <mesh position={[0, WALL_H / 2, HZ]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[HX * 2, WALL_H]} />
        <meshStandardMaterial color="#ffdbe8" roughness={0.95} />
      </mesh>
      <mesh position={[0, 3.7, HZ - 0.06]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[16, 5.33]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Games: hearts, start/finish lines                                   */
/* ------------------------------------------------------------------ */
function GameLines() {
  const checker = useTextTexture((g, w, h) => {
    const s = 32;
    for (let y = 0; y < h / s; y++) for (let x = 0; x < w / s; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * s, y * s, s, s); }
  }, 1024, 64);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, START_Z]}><planeGeometry args={[BX * 2, 0.35]} /><meshBasicMaterial color="#ffffff" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, FINISH_Z]}><planeGeometry args={[BX * 2, 0.7]} /><meshBasicMaterial map={checker} /></mesh>
      <Label text="START" position={[0, 0.9, START_Z]} style="prop" height={0.5} alwaysOnTop />
      <Label text="FINISH 🏁" position={[0, 0.9, FINISH_Z]} style="admin" height={0.5} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Confetti (shared pool of round particles)                           */
/* ------------------------------------------------------------------ */
function Confetti() {
  const N = 6000;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3).fill(-100), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  const dot = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 28, 0, 6.283); g.fill();
    return new THREE.CanvasTexture(c);
  }, []);
  const vel = useRef(new Float32Array(N * 3));
  const life = useRef(new Float32Array(N));
  const next = useRef(0);
  const col = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    // hue (0..1) limits the colours, e.g. 0.92 for pinks; omit for a rainbow.
    // push = [vx, vz] makes it a directional cannon blast instead of a round burst.
    bus.confetti = (x, y, z, n = 140, hue = null, push = null) => {
      if (typeof window !== 'undefined') window.__confettiFired = (window.__confettiFired || 0) + n; // handy for debugging/tests
      const pos = geo.attributes.position.array, c = geo.attributes.color.array;
      for (let i = 0; i < n; i++) {
        const idx = next.current++ % N, j = idx * 3;
        pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
        if (push) {
          const k = 0.7 + Math.random() * 0.6;
          vel.current[j] = push[0] * k + (Math.random() - 0.5) * 2.5; vel.current[j + 1] = 4 + Math.random() * 6; vel.current[j + 2] = push[1] * k + (Math.random() - 0.5) * 2.5;
        } else {
          const a = Math.random() * 6.283, sp = 1 + Math.random() * 4.5;
          vel.current[j] = Math.cos(a) * sp; vel.current[j + 1] = 3 + Math.random() * 5; vel.current[j + 2] = Math.sin(a) * sp;
        }
        life.current[idx] = 1.6 + Math.random() * 1.4;
        col.setHSL(hue == null ? Math.random() : (hue + (Math.random() - 0.5) * 0.12 + 1) % 1, 0.95, 0.6);
        c[j] = col.r; c[j + 1] = col.g; c[j + 2] = col.b;
      }
      geo.attributes.color.needsUpdate = true;
    };
    return () => { bus.confetti = null; };
  }, [geo, col]);

  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const pos = geo.attributes.position.array, v = vel.current, l = life.current;
    for (let i = 0; i < N; i++) {
      if (l[i] <= 0) continue;
      const j = i * 3;
      pos[j] += v[j] * dt; pos[j + 1] += v[j + 1] * dt; pos[j + 2] += v[j + 2] * dt;
      v[j + 1] -= 7 * dt; v[j] *= 0.985; v[j + 2] *= 0.985;
      l[i] -= dt;
      if (l[i] <= 0 || pos[j + 1] < 0.02) { l[i] = 0; pos[j + 1] = -100; }
    }
    geo.attributes.position.needsUpdate = true;
  });

  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial size={0.18} map={dot} alphaTest={0.4} vertexColors sizeAttenuation transparent depthWrite={false} />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Wall boards: guest list (right wall) + midnight clock (left wall)    */
/* ------------------------------------------------------------------ */
function useBoard(w, h) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { canvas: c, tex: t };
  }, [w, h]);
}

function frame(g, w, h) {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#ff4f9a'); gr.addColorStop(0.5, '#ffd166'); gr.addColorStop(1, '#7c4dff');
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(25,8,45,.9)';
  g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 40); g.fill();
  g.strokeStyle = gr; g.lineWidth = 8; g.stroke();
}

// Everybody who has joined the party, newest highlighted. People who are in the room right now get a green dot.
function GuestBoard({ guests, here, fresh }) {
  const W = 2048, H = 300;
  const { canvas, tex } = useBoard(W, H);
  useEffect(() => {
    const paint = () => {
      const g = canvas.getContext('2d');
      frame(g, W, H);
      g.textBaseline = 'middle';
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '700 58px "Dancing Script", cursive';
      g.fillText(`🎉 Mehmaan List: ${guests.length} log aa chuke hain 🎉`, W / 2, 52);
      const n = guests.length;
      // biggest font at which every name still fits on the board
      const fits = (f) => Math.max(1, Math.floor((H - 100 - 26) / (f * 1.3))) * Math.max(1, Math.floor((W - 120) / (f * 8.5))) >= n;
      const font = [46, 40, 34, 30, 26, 22].find(fits) || 20;
      const rowH = font * 1.3;
      const rows = Math.max(1, Math.floor((H - 100 - 26) / rowH));
      const colW = font * 8.5;
      const maxCols = Math.max(1, Math.floor((W - 120) / colW));
      const shown = guests.slice(0, rows * maxCols);
      const cols = Math.ceil(shown.length / rows) || 1;
      const x0 = (W - cols * colW) / 2;
      g.textAlign = 'left'; g.font = `600 ${font}px "Poppins", "Segoe UI Emoji", sans-serif`;
      shown.forEach((p, i) => {
        const x = x0 + Math.floor(i / rows) * colW, y = 108 + (i % rows) * rowH;
        const key = p.name.toLowerCase();
        const isHere = here.has(key);
        const isNew = fresh && fresh.name.toLowerCase() === key;
        const badge = p.role === 'girl' ? '👑 ' : p.role === 'admin' ? '⭐ ' : '';
        let label = `${isNew ? '✨ ' : ''}${badge}${p.name}`;
        while (g.measureText(label).width > colW - 46 && label.length > 3) label = label.slice(0, -2);
        g.fillStyle = isHere ? '#7CFF9E' : 'rgba(255,255,255,.3)';
        g.beginPath(); g.arc(x + 10, y, 7, 0, 6.283); g.fill();
        g.fillStyle = isNew ? '#ffd166' : isHere ? '#ffffff' : 'rgba(255,255,255,.45)';
        g.fillText(label, x + 30, y);
      });
      if (guests.length > shown.length) {
        g.textAlign = 'right'; g.fillStyle = '#ffd166'; g.font = `600 30px "Poppins", sans-serif`;
        g.fillText(`+${guests.length - shown.length} aur`, W - 50, H - 36);
      }
      tex.needsUpdate = true;
    };
    paint();
    if (document.fonts) document.fonts.load('700 58px "Dancing Script"').then(paint).catch(() => {});
  }, [guests, here, fresh, canvas, tex]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[HX - 0.07, 5.7, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[19.2, 2.8]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  );
}

const pad2 = (n) => String(n).padStart(2, '0');

// Countdown to midnight, then "CELEBRATION!" while the 5 minutes run.
function ClockBoard({ clock }) {
  const W = 1024, H = 320;
  const { canvas, tex } = useBoard(W, H);
  const [now, setNow] = useState(0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  useEffect(() => {
    const paint = () => {
      const g = canvas.getContext('2d');
      frame(g, W, H);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const t = Date.now() + clock.offset;
      g.fillStyle = '#ffd166'; g.font = '600 40px "Poppins", "Segoe UI Emoji", sans-serif';
      g.fillText('🎂 Midnight Celebration', W / 2, 52);
      if (clock.active) {
        const left = Math.max(0, Math.ceil((clock.endsAt - t) / 1000));
        g.fillStyle = '#fff'; g.font = '700 104px "Dancing Script", cursive';
        g.fillText('🎉 HAPPY BIRTHDAY! 🎉', W / 2, 160);
        g.fillStyle = '#7CFF9E'; g.font = '600 46px "Poppins", sans-serif';
        g.fillText(`Celebration chal raha hai · ${pad2(Math.floor(left / 60))}:${pad2(left % 60)} baaki`, W / 2, 255);
      } else if (clock.nextAt) {
        const left = Math.max(0, Math.ceil((clock.nextAt - t) / 1000));
        const d = Math.floor(left / 86400), hh = Math.floor((left % 86400) / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
        g.fillStyle = '#fff'; g.font = '700 118px "Poppins", sans-serif';
        g.fillText(`${d ? d + 'd ' : ''}${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`, W / 2, 160);
        const when = new Date(clock.nextAt);
        g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '500 38px "Poppins", sans-serif';
        g.fillText(`Shuru: ${when.getDate()}/${when.getMonth() + 1} raat ${pad2(when.getHours())}:${pad2(when.getMinutes())} baje`, W / 2, 255);
      } else {
        g.fillStyle = '#fff'; g.font = '700 88px "Dancing Script", cursive';
        g.fillText('Celebration ho chuka 🥳', W / 2, 170);
      }
      tex.needsUpdate = true;
    };
    paint();
  }, [now, clock, canvas, tex]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[-HX + 0.07, 5.7, 0]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[8, 2.5]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Midnight celebration: cannons from both side walls + fireworks       */
/* ------------------------------------------------------------------ */
const CANNON_Z = [-12, -8, -4, 0, 4, 8, 12];

function Cannons() {
  return (
    <group>
      {[-1, 1].map((side) => CANNON_Z.map((z) => (
        <group key={`${side}${z}`} position={[side * (HX - 0.8), 4.3, z]} rotation={[0, 0, side * (Math.PI / 2 - 0.55)]}>
          <mesh><cylinderGeometry args={[0.16, 0.2, 0.7, 12]} /><meshStandardMaterial color="#ffd166" metalness={0.5} roughness={0.35} /></mesh>
          <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.17, 0.04, 8, 16]} /><meshStandardMaterial color="#ff4f9a" /></mesh>
        </group>
      )))}
    </group>
  );
}

function Celebration({ active }) {
  const acc = useRef(0), fw = useRef(0);
  const l1 = useRef(), l2 = useRef();
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.1), t = clock.elapsedTime;
    if (l1.current) {
      l1.current.intensity = active ? 20 + 12 * Math.sin(t * 9) : 0;
      l1.current.color.setHSL((t * 0.25) % 1, 1, 0.55);
      l1.current.position.set(Math.cos(t * 1.3) * 11, 5, Math.sin(t * 1.3) * 9);
    }
    if (l2.current) {
      l2.current.intensity = active ? 20 + 12 * Math.cos(t * 7) : 0;
      l2.current.color.setHSL((t * 0.25 + 0.5) % 1, 1, 0.55);
      l2.current.position.set(Math.cos(t * 1.3 + 3.14) * 11, 5, Math.sin(t * 1.3 + 3.14) * 9);
    }
    if (!active || !bus.confetti) return;
    // Full power for the whole 5 minutes: it never depends on anybody dancing or standing anywhere.
    acc.current += dt; fw.current += dt;
    if (acc.current > 0.18) {
      acc.current = 0;
      // cannons on the left and right walls shoot inwards (2 cannons per wall every tick)
      for (let k = 0; k < 2; k++) {
        bus.confetti(-HX + 1.2, 4.6, CANNON_Z[Math.floor(Math.random() * 7)], 44, Math.random(), [8.5, 0]);
        bus.confetti(HX - 1.2, 4.6, CANNON_Z[Math.floor(Math.random() * 7)], 44, Math.random(), [-8.5, 0]);
      }
    }
    if (fw.current > 0.7) {
      fw.current = 0;
      // fireworks high above the middle, two at a time
      for (let k = 0; k < 2; k++) {
        bus.confetti((Math.random() * 2 - 1) * 11, 5 + Math.random() * 1.3, (Math.random() * 2 - 1) * 10, 190, Math.random());
      }
    }
  });
  return (
    <group>
      <Cannons />
      <pointLight ref={l1} intensity={0} distance={26} />
      <pointLight ref={l2} intensity={0} distance={26} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Main scene                                                          */
/* ------------------------------------------------------------------ */
export default function Scene({
  me, others, bubbles, reacts, outIds, world, socket, candlesLit, popped, screen, hearts, userGifts, rlActive,
  guests, hereNames, fresh, clock, celebrating,
  streams, localStream, onPrompt, onFloor, onGift, onEat, onUserGift, onPop, requestCandles, where, onPortal, onBooth, onRide,
}) {
  const people = useMemo(() => [me, ...others], [me, others]);
  const [low, setLow] = useState(false);
  return (
    <Canvas shadows={!low} camera={{ fov: 55, position: [0, 7, 12], near: 0.3, far: 150 }} dpr={low ? 1 : [1, 1.5]}>
      {/* a slow computer or phone? after a few seconds of low FPS the scene quietly switches to a lighter look */}
      <PerformanceMonitor bounds={() => [26, 200]} flipflops={2} ms={800} onDecline={() => setLow(true)} />
      {where === 'fun' ? <FunWorld onPortal={onPortal} onBooth={onBooth} onRide={onRide} low={low} /> : (
      <>
      {/* soft twilight outside, warm light inside: the cream walls must read as cream, not purple */}
      <color attach="background" args={['#2c1f5e']} />
      <fog attach="fog" args={['#2c1f5e', 45, 120]} />
      <ambientLight intensity={1.0} color="#fff3df" />
      <hemisphereLight args={['#fff6e8', '#d6c3a0', 0.7]} />
      <directionalLight
        position={[10, 18, 10]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.05}
        shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-camera-far={60}
      />
      <pointLight position={[0, 6, -2]} intensity={1.0} color="#ffe2c4" distance={32} />


      <Room />
      <DanceFloor />
      <Cake lit={candlesLit} onClick={requestCandles} />
      {GIFTS.map((g, i) => <Gift key={i} g={g} i={i} onOpen={onGift} />)}
      {userGifts.map((g) => <UserGift key={g.id} g={g} onOpen={onUserGift} />)}
      {STALLS.map((st, i) => <Stall key={st.id} st={st} i={i} onEat={onEat} />)}
      <GameScreen screen={screen} />
      <GuestBoard guests={guests} here={hereNames} fresh={fresh} />
      <ClockBoard clock={clock} />
      <Celebration active={celebrating} />
      <VideoWall people={people} streams={streams} localStream={localStream} meId={me.id} />
      {rlActive && <GameLines />}
      {BALLOONS.filter((b) => !popped.includes(b.id)).map((b) => <Balloon key={b.id} b={b} onPop={onPop} />)}
      {hearts.map((h) => <FloatEmoji key={h.id} emoji="🍰" position={[h.x, 1.2, h.z]} size={0.95} bob={0.18} spin />)}
      <Portal position={[HALL_PORTAL.x, 0, 14.25]} rotation={[0, Math.PI, 0]} label="🌈 Masti Duniya" c1="#ff8e53" c2="#2a9d8f" onClick={() => onPortal && onPortal('fun')} />
      </>
      )}

      {others.filter((p) => (p.world || 'hall') === where).map((p) => <Remote key={p.id} p={p} world={world} bubble={bubbles[p.id]} react={reacts[p.id]} out={!!outIds[p.id]} />)}
      <Me
        me={me} socket={socket} world={world} bubble={bubbles[me.id]} react={reacts[me.id]} out={!!outIds[me.id]}
        onPrompt={onPrompt} onFloor={onFloor} onGift={onGift} onEat={onEat} onUserGift={onUserGift} onBooth={onBooth} requestCandles={requestCandles}
      />
      <Confetti />
    </Canvas>
  );
}
