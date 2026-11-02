'use client';

// 3D landing page: a house at night with "Welcome to Manisha's Birthday" on the wall.
// Click the door (or press "Andar jao"): the door swings open, the camera walks through the glowing hallway,
// and the party starts. If joining fails (wrong code, ...) the camera walks back out and the door closes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { COLORS, HOST } from './data';
import { Avatar } from './Scene';

const { lerp, clamp } = THREE.MathUtils;
const ease = (t) => t * t * (3 - 2 * t);
const PARTY = ['#ff4f9a', '#ffd166', '#4cc9f0', '#06d6a0', '#ff8e53', '#c77dff', '#f72585'];

// canvas texture that is repainted once the handwriting font is loaded
function useTex(draw, w, h) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const paint = () => { draw(c.getContext('2d'), w, h); tex.needsUpdate = true; };
    paint();
    if (document.fonts) document.fonts.load('700 100px "Dancing Script"').then(paint).catch(() => {});
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// many small identical meshes in one draw call
function Instanced({ items, children }) {
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
      {children}
      <meshBasicMaterial toneMapped={false} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/* ----------------------------- the wall sign ----------------------------- */
function Sign() {
  const tex = useTex((g, w, h) => {
    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#ff4f9a'); gr.addColorStop(0.5, '#ffd166'); gr.addColorStop(1, '#7c4dff');
    // light cream plaque with deeper pink / gold / purple lettering so it stays readable
    g.fillStyle = '#fffaf0';
    g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 60); g.fill();
    g.strokeStyle = gr; g.lineWidth = 14; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#6b2d8a'; g.font = '700 96px "Dancing Script", cursive';
    g.fillText('Welcome to', w / 2, h * 0.27);
    const tg = g.createLinearGradient(260, 0, w - 260, 0);
    tg.addColorStop(0, '#d6246e'); tg.addColorStop(0.5, '#d18a00'); tg.addColorStop(1, '#6a35d6');
    g.fillStyle = tg; g.font = '700 176px "Dancing Script", cursive';
    g.fillText(`${HOST}'s Birthday`, w / 2, h * 0.65);
    g.font = '84px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    g.fillText('🎂', 110, h * 0.5); g.fillText('🎉', w - 110, h * 0.5);
  }, 1500, 450);
  return (
    <group position={[0, 5.62, 0.4]}>
      <mesh position={[0, 0, -0.02]}><planeGeometry args={[9.5, 2.95]} /><meshBasicMaterial color="#ff4f9a" transparent opacity={0.25} /></mesh>
      <mesh><planeGeometry args={[9, 2.7]} /><meshBasicMaterial map={tex} transparent toneMapped={false} /></mesh>
    </group>
  );
}

function WelcomeMat() {
  const tex = useTex((g, w, h) => {
    g.fillStyle = '#7a1f3d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd166'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#ffe9a8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 84px "Poppins", "Segoe UI", sans-serif'; g.fillText('WELCOME', w / 2, h / 2 + 4);
  }, 512, 200);
  return (
    <mesh position={[0, 0.03, 1.5]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3.2, 1.25]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

function ClickHint({ progRef }) {
  const ref = useRef();
  const tex = useTex((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,79,154,.95)'; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 54); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 62px "Poppins", "Segoe UI Emoji", sans-serif'; g.fillText('👆 Click karo!', w / 2, h / 2 + 3);
  }, 460, 130);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 1.9 + Math.sin(clock.elapsedTime * 3) * 0.1;
    ref.current.material.opacity = clamp(1 - progRef.current * 6, 0, 1);
  });
  return (
    <sprite ref={ref} position={[2.75, 1.9, 1]} scale={[1.9, 0.54, 1]} renderOrder={5}>
      <spriteMaterial map={tex} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

/* --------------------------------- door --------------------------------- */
const DOOR_W = 2.6;
const DOOR_H = 4.2;

function Door({ progRef, hover, onHover, onClick }) {
  const pivot = useRef();
  const body = useRef();
  useFrame(() => {
    const open = ease(clamp((progRef.current - 0.04) / 0.26, 0, 1));
    if (pivot.current) pivot.current.rotation.y = open * Math.PI * 0.47; // swings INTO the hallway
    if (body.current) body.current.material.emissiveIntensity = hover ? 0.55 : 0.12;
  });
  const wood = '#a2582f';
  return (
    <group>
      {/* door frame */}
      {[[-DOOR_W / 2 - 0.12, DOOR_H / 2, 0.12, DOOR_H + 0.1], [DOOR_W / 2 + 0.12, DOOR_H / 2, 0.12, DOOR_H + 0.1]].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.3]}><boxGeometry args={[w * 2, h, 0.5]} /><meshStandardMaterial color="#5b2f17" roughness={0.8} /></mesh>
      ))}
      <mesh position={[0, DOOR_H + 0.1, 0.3]}><boxGeometry args={[DOOR_W + 0.6, 0.26, 0.5]} /><meshStandardMaterial color="#5b2f17" roughness={0.8} /></mesh>

      {/* the swinging door (hinge on the left) */}
      <group ref={pivot} position={[-DOOR_W / 2 + 0.05, 0, 0.1]}>
        <mesh ref={body} position={[DOOR_W / 2 - 0.05, DOOR_H / 2 - 0.05, 0]}>
          <boxGeometry args={[DOOR_W - 0.1, DOOR_H - 0.1, 0.14]} />
          <meshStandardMaterial color={wood} roughness={0.7} emissive="#ff8a3d" emissiveIntensity={0.12} />
        </mesh>
        {[[0.65, 1.2], [1.85, 1.2], [0.65, 3.0], [1.85, 3.0]].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0.09]}><boxGeometry args={[0.95, 1.4, 0.04]} /><meshStandardMaterial color="#c47a47" roughness={0.6} /></mesh>
        ))}
        <mesh position={[DOOR_W - 0.35, 2.0, 0.16]}><sphereGeometry args={[0.1, 14, 14]} /><meshStandardMaterial color="#ffd166" metalness={0.9} roughness={0.2} emissive="#a67c00" emissiveIntensity={0.5} /></mesh>
        {/* heart wreath */}
        <group position={[DOOR_W / 2 - 0.05, 3.3, 0.14]}>
          <mesh><torusGeometry args={[0.36, 0.07, 10, 28]} /><meshStandardMaterial color="#2d9d4f" roughness={0.9} /></mesh>
          {Array.from({ length: 7 }, (_, k) => (
            <mesh key={k} position={[Math.cos((k / 7) * 6.283) * 0.36, Math.sin((k / 7) * 6.283) * 0.36, 0.05]}>
              <sphereGeometry args={[0.07, 8, 8]} /><meshStandardMaterial color={PARTY[k % PARTY.length]} emissive={PARTY[k % PARTY.length]} emissiveIntensity={0.4} />
            </mesh>
          ))}
        </group>
      </group>

      {/* invisible, generous click target over the whole doorway */}
      <mesh
        position={[0, DOOR_H / 2, 0.8]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
        onPointerOut={() => onHover(false)}
      >
        <planeGeometry args={[DOOR_W + 0.6, DOOR_H + 0.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ------------------------- inside: the glowing hallway ------------------------- */
function Hallway({ progRef }) {
  const l1 = useRef(), l2 = useRef(), l3 = useRef();
  const bulbs = useMemo(() => {
    const out = [];
    for (let i = 0; i < 10; i++) {
      out.push({ p: [-1.55, 3.9 + (i % 2) * 0.12, -0.9 - i * 0.85], c: PARTY[i % PARTY.length], s: 1 });
      out.push({ p: [1.55, 3.9 + (i % 2) * 0.12, -0.9 - i * 0.85], c: PARTY[(i + 3) % PARTY.length], s: 1 });
    }
    return out;
  }, []);
  const flags = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ p: [-1.5 + (i / 15) * 3, 4.45 - Math.sin((i / 15) * Math.PI) * 0.2, -2.2 - (i % 2) * 3.5], r: [Math.PI, 0, 0], c: PARTY[i % PARTY.length] })), []);
  useFrame(() => {
    const open = ease(clamp((progRef.current - 0.04) / 0.26, 0, 1));
    const k = 0.25 + 0.75 * open;
    if (l1.current) l1.current.intensity = 16 * k;
    if (l2.current) l2.current.intensity = 16 * k;
    if (l3.current) l3.current.intensity = 10 * k;
  });
  return (
    <group>
      <mesh position={[0, 0.02, -4.85]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[3.3, 9.2]} /><meshStandardMaterial color="#ff9ec7" roughness={1} /></mesh>
      {[-1.72, 1.72].map((x) => (
        <mesh key={x} position={[x, 2.3, -4.85]}><boxGeometry args={[0.25, 4.6, 9.2]} /><meshStandardMaterial color="#f6e7c6" roughness={0.9} /></mesh>
      ))}
      <mesh position={[0, 4.72, -4.85]}><boxGeometry args={[3.7, 0.25, 9.2]} /><meshStandardMaterial color="#fff3d6" roughness={1} /></mesh>
      {/* the bright "party is here" light at the end */}
      <mesh position={[0, 2.3, -9.45]}><planeGeometry args={[3.3, 4.6]} /><meshBasicMaterial color="#fff2fa" toneMapped={false} /></mesh>
      <mesh position={[0, 2.3, -9.3]}><planeGeometry args={[1.2, 3.8]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.9} toneMapped={false} /></mesh>
      <Instanced items={bulbs}><sphereGeometry args={[0.09, 8, 8]} /></Instanced>
      <Instanced items={flags}><coneGeometry args={[0.2, 0.38, 3]} /></Instanced>
      <pointLight ref={l1} position={[0, 3.7, -1.8]} color="#ffd9a8" distance={9} />
      <pointLight ref={l2} position={[0, 3.7, -5.4]} color="#ffb3d9" distance={9} />
      <pointLight ref={l3} position={[0, 2.5, -8.6]} color="#ffffff" distance={7} />
    </group>
  );
}

/* ------------------------------ the house front ------------------------------ */
function Windows() {
  const refs = useRef([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((m, i) => { if (m) m.material.color.setHSL((t * 0.08 + i * 0.5) % 1, 0.75, 0.62 + 0.08 * Math.sin(t * 3 + i)); });
  });
  return (
    <group>
      {[-5.5, 5.5].map((x, i) => (
        <group key={x} position={[x, 3.4, 0.4]}>
          <mesh><boxGeometry args={[2.5, 2.7, 0.14]} /><meshStandardMaterial color="#5b2f17" /></mesh>
          <mesh ref={(el) => (refs.current[i] = el)} position={[0, 0, 0.08]}><planeGeometry args={[2.1, 2.3]} /><meshBasicMaterial color="#ffe2a0" toneMapped={false} /></mesh>
          <mesh position={[0, 0, 0.1]}><boxGeometry args={[0.07, 2.3, 0.04]} /><meshStandardMaterial color="#5b2f17" /></mesh>
          <mesh position={[0, 0, 0.1]}><boxGeometry args={[2.1, 0.07, 0.04]} /><meshStandardMaterial color="#5b2f17" /></mesh>
          <mesh position={[0, -1.45, 0.2]}><boxGeometry args={[2.8, 0.14, 0.4]} /><meshStandardMaterial color="#fff8e6" /></mesh>
        </group>
      ))}
    </group>
  );
}

function Balloon({ x, y, color, seed }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime + seed;
    ref.current.position.y = y + Math.sin(t * 0.9) * 0.12;
    ref.current.rotation.z = Math.sin(t * 0.7) * 0.05;
  });
  return (
    <group ref={ref} position={[x, y, 1.05]}>
      <mesh scale={[1, 1.2, 1]}><sphereGeometry args={[0.5, 20, 20]} /><meshStandardMaterial color={color} roughness={0.25} metalness={0.15} /></mesh>
      <mesh position={[0, -0.62, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.07, 0.12, 8]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, -(y / 2) - 0.6, 0]}><cylinderGeometry args={[0.008, 0.008, y - 0.6, 4]} /><meshBasicMaterial color="#ffffff" /></mesh>
    </group>
  );
}

function Lantern({ x }) {
  return (
    <group position={[x, 0, 3]}>
      <mesh position={[0, 0.65, 0]}><cylinderGeometry args={[0.06, 0.08, 1.3, 8]} /><meshStandardMaterial color="#2b2b3a" /></mesh>
      <mesh position={[0, 1.45, 0]}><sphereGeometry args={[0.24, 16, 16]} /><meshBasicMaterial color="#ffd9a0" toneMapped={false} /></mesh>
      <pointLight position={[0, 1.5, 0]} color="#ffcf8a" intensity={4} distance={6} />
    </group>
  );
}

function Gift({ x, z, color, s = 1 }) {
  return (
    <group position={[x, 0.3 * s, z]}>
      <mesh><boxGeometry args={[0.6 * s, 0.6 * s, 0.6 * s]} /><meshStandardMaterial color={color} /></mesh>
      <mesh><boxGeometry args={[0.64 * s, 0.64 * s, 0.1 * s]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh><boxGeometry args={[0.1 * s, 0.64 * s, 0.64 * s]} /><meshStandardMaterial color="#fff" /></mesh>
    </group>
  );
}

function FallingConfetti() {
  const N = 220;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 18; p[i * 3 + 1] = Math.random() * 9; p[i * 3 + 2] = Math.random() * 11 - 0.5;
      col.set(PARTY[i % PARTY.length]); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }, []);
  useFrame(({ clock }, dt) => {
    const p = geo.attributes.position.array, t = clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      p[i * 3 + 1] -= dt * (0.5 + (i % 5) * 0.12);
      p[i * 3] += Math.sin(t + i) * dt * 0.25;
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 9;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial size={0.14} vertexColors sizeAttenuation transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}

function House({ progRef, hover, onHover, onDoor }) {
  const wall = <meshStandardMaterial color="#fdf0cf" roughness={0.95} />; // cream
  const stones = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ z: 2.6 + i * 1.25, x: (i % 2 ? 0.25 : -0.25) })), []);
  const lights = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    p: [-7.8 + (i / 35) * 15.6, 6.78 - Math.sin((i / 35) * Math.PI * 6) * 0.1, 0.85], c: PARTY[i % PARTY.length],
  })), []);
  const flags = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    p: [-7.5 + i * 0.6, 7.2 - Math.sin((i / 25) * Math.PI) * 0.35, 1.0], r: [Math.PI, 0, 0], c: PARTY[(i + 2) % PARTY.length],
  })), []);
  return (
    <group>
      {/* the wall around the doorway */}
      <mesh position={[-(DOOR_W / 2 + 0.3 + 3.35), 3.5, 0]}><boxGeometry args={[6.7, 7, 0.7]} />{wall}</mesh>
      <mesh position={[DOOR_W / 2 + 0.3 + 3.35, 3.5, 0]}><boxGeometry args={[6.7, 7, 0.7]} />{wall}</mesh>
      <mesh position={[0, 5.6, 0]}><boxGeometry args={[DOOR_W + 0.6, 2.8, 0.7]} />{wall}</mesh>
      <mesh position={[0, 7.3, 0.1]}><boxGeometry args={[16.8, 0.6, 1]} /><meshStandardMaterial color="#fbeec9" roughness={0.8} /></mesh>
      <mesh position={[0, 0.17, 0.1]}><boxGeometry args={[16.4, 0.35, 0.9]} /><meshStandardMaterial color="#e6d2a6" roughness={0.9} /></mesh>

      <Sign />
      <Windows />
      <Door progRef={progRef} hover={hover} onHover={onHover} onClick={onDoor} />
      <Hallway progRef={progRef} />
      <ClickHint progRef={progRef} />

      <Instanced items={lights}><sphereGeometry args={[0.1, 8, 8]} /></Instanced>
      <Instanced items={flags}><coneGeometry args={[0.26, 0.5, 3]} /></Instanced>

      {/* balloon bunches on both sides of the door */}
      {[[-2.55, 3.4, PARTY[0]], [-3.2, 4.1, PARTY[1]], [-2.2, 2.8, PARTY[2]], [-3.6, 3.2, PARTY[3]],
        [2.55, 3.5, PARTY[4]], [3.2, 4.2, PARTY[5]], [2.2, 2.9, PARTY[6]], [3.7, 3.3, PARTY[0]]].map(([x, y, c], i) => (
        <Balloon key={i} x={x} y={y} color={c} seed={i * 1.3} />
      ))}
      <Lantern x={-2.4} /><Lantern x={2.4} />
      <Gift x={-3.4} z={1.7} color="#ff4f9a" /><Gift x={-4.1} z={2.2} color="#7c4dff" s={0.8} /><Gift x={3.5} z={1.8} color="#ffd166" />
      <WelcomeMat />
      {stones.map((s, i) => (
        <mesh key={i} position={[s.x, 0.03, s.z]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.55, 20]} /><meshStandardMaterial color="#8d86a6" roughness={1} /></mesh>
      ))}
    </group>
  );
}

/* ------------------------- your avatar, walking in ------------------------- */
// The avatar stands in front of the door from the very start (your colour and name, live while you type),
// waits until the door is open, then walks through it. If joining fails it walks back out, facing you.
const walkZ = (p) => lerp(6.8, -7.2, ease(clamp((p - 0.2) / 0.8, 0, 1)));

function Walker({ name, color, progRef, onHover, onClick }) {
  const ref = useRef();
  const anim = useRef('idle');
  const lastZ = useRef(walkZ(0));
  const lastP = useRef(0);
  const facing = useRef(Math.PI); // PI = back to the camera, looking at the door
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const p = progRef.current;
    const z = walkZ(p);
    const moving = Math.abs(z - lastZ.current) > 0.0015;
    const goingOut = p < lastP.current;
    anim.current = moving ? 'walk' : 'idle';
    const target = moving && goingOut ? 0 : Math.PI; // walking back out: turn round to face the camera
    facing.current += (target - facing.current) * Math.min(1, dt * 9);
    lastZ.current = z; lastP.current = p;
    if (ref.current) { ref.current.position.set(0, 0, z); ref.current.rotation.y = facing.current; }
  });
  return (
    // clicking the avatar itself also walks it through the door
    <group
      ref={ref}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
      onPointerOut={() => onHover(false)}
    >
      <Avatar color={color} name={name.trim() || 'Guest'} role="guest" isMe getAnim={() => anim.current} />
    </group>
  );
}

/* ------------------------------ camera + lights ------------------------------ */
function Rig({ phase, progRef }) {
  const mouse = useRef({ x: 0, y: 0 });
  const warm = useRef();
  useEffect(() => {
    const m = (e) => { mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2; mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2; };
    window.addEventListener('pointermove', m);
    return () => window.removeEventListener('pointermove', m);
  }, []);
  useFrame(({ camera, clock }, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const target = phase === 'entering' ? 1 : 0;
    const p = progRef.current;
    const speed = target > p ? 0.4 : 0.7; // ~2.5s to walk in, ~1.4s to walk back out
    progRef.current = target > p ? Math.min(target, p + dt * speed) : Math.max(target, p - dt * speed);
    const pr = progRef.current;
    const t = clock.elapsedTime;
    const f = ease(clamp(pr / 0.3, 0, 1)); // 0 = looking at the house, 1 = following the avatar from behind
    const sway = 1 - f;
    const az = walkZ(pr); // where the avatar is
    const ix = mouse.current.x * 1.2 * sway;
    const iy = 2.5 - mouse.current.y * 0.3 * sway + Math.sin(t * 0.6) * 0.06 * sway;
    // follow view: 5 m behind the avatar, a little above, with a tiny walking bob
    const fy = 2.35 + Math.abs(Math.sin(t * 5)) * 0.03 * Math.sin(clamp((pr - 0.2) / 0.8, 0, 1) * Math.PI);
    camera.position.set(lerp(ix, 0, f), lerp(iy, fy, f), lerp(11.5, az + 5.2, f));
    camera.lookAt(lerp(mouse.current.x * 0.5 * sway, 0, f), lerp(2.9, 1.7, f), lerp(0, az - 3.5, f));
    if (warm.current) warm.current.intensity = 5 + 14 * ease(clamp((progRef.current - 0.04) / 0.26, 0, 1));
  });
  return <pointLight ref={warm} position={[0, 2.6, 3]} color="#ffcf8a" distance={16} intensity={5} />;
}

function World({ phase, progRef, hover, onHover, onDoor, avatarName, avatarColor }) {
  return (
    <>
      {/* a dark night sky outside, and warm bright light on the house so the cream wall really looks cream */}
      <color attach="background" args={['#0b0620']} />
      <fog attach="fog" args={['#0b0620', 30, 90]} />
      <ambientLight intensity={1.05} color="#fff3df" />
      <hemisphereLight args={['#fff6e8', '#c9b79a', 0.7]} />
      <directionalLight position={[-6, 10, 16]} intensity={1.1} color="#fff7ea" />
      <Stars radius={90} depth={40} count={2800} factor={5} saturation={0} fade speed={1} />
      <mesh position={[-17, 15, -14]}><sphereGeometry args={[2.4, 24, 24]} /><meshBasicMaterial color="#fff6d8" fog={false} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 4]}><planeGeometry args={[90, 90]} /><meshStandardMaterial color="#26344f" roughness={1} /></mesh>
      <House progRef={progRef} hover={hover} onHover={onHover} onDoor={onDoor} />
      <Walker name={avatarName} color={avatarColor} progRef={progRef} onHover={onHover} onClick={onDoor} />
      <FallingConfetti />
      <Rig phase={phase} progRef={progRef} />
    </>
  );
}

/* ----------------------------------- page ----------------------------------- */
export default function Landing({ name, setName, color, setColor, code, setCode, error, leftMsg, busy, onEnter, joined, onArrived }) {
  const [phase, setPhase] = useState('idle'); // idle | entering | closing
  const [hover, setHover] = useState(false);
  const [flash, setFlash] = useState(false);
  const [showCode, setShowCode] = useState(!!code);
  const progRef = useRef(0);
  const sawBusy = useRef(false);
  const timers = useRef([]);
  const flashTimer = useRef(0);

  const [needName, setNeedName] = useState(false);
  const nameRef = useRef(null);

  const enter = useCallback(() => {
    if (phase !== 'idle' || busy) return;
    // a friend must type a name first (Vivek / Manisha get their names from the special code)
    if (!name.trim() && !code.trim()) {
      setNeedName(true);
      if (nameRef.current) nameRef.current.focus();
      return;
    }
    setNeedName(false);
    sawBusy.current = false;
    setPhase('entering');
    setFlash(false);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(true), 2400); // the bright light at the end of the hallway
    onEnter(); // starts the real join (camera/mic permission, server, ...)
  }, [phase, busy, onEnter, name, code]);

  // joining ended but we are still here = it failed (wrong code, name not allowed...): walk back out, close the door
  useEffect(() => {
    if (busy) { sawBusy.current = true; return; }
    if (sawBusy.current && phase === 'entering' && !joined) {
      sawBusy.current = false;
      clearTimeout(flashTimer.current); // a pending flash must not fire after a failure
      setFlash(false);
      setPhase('closing');
      timers.current.push(setTimeout(() => setPhase('idle'), 1600));
    }
  }, [busy, phase, joined]);

  // joined: let the camera finish walking through the door, THEN show the party (never wait more than 7 s)
  const arrived = useRef(onArrived);
  arrived.current = onArrived;
  useEffect(() => {
    if (!joined) return undefined;
    const t0 = Date.now();
    const id = setInterval(() => {
      if (progRef.current >= 0.98 || Date.now() - t0 > 7000) { clearInterval(id); arrived.current(); }
    }, 80);
    return () => clearInterval(id);
  }, [joined]);

  useEffect(() => {
    document.body.style.cursor = hover && phase === 'idle' ? 'pointer' : '';
    return () => { document.body.style.cursor = ''; };
  }, [hover, phase]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); clearTimeout(flashTimer.current); }, []);

  return (
    <div className="land">
      <Canvas camera={{ fov: 50, position: [0, 2.5, 11.5], near: 0.1, far: 140 }} dpr={[1, 1.5]}>
        <World phase={phase} progRef={progRef} hover={hover} onHover={setHover} onDoor={enter} avatarName={name} avatarColor={color} />
      </Canvas>

      <div className={'land-top' + (phase === 'idle' ? '' : ' gone')}>🎉 Darwaze par click karo aur andar aao 🎉</div>

      <form
        className={'land-card' + (phase === 'idle' ? '' : ' gone')}
        onSubmit={(e) => { e.preventDefault(); enter(); }}
      >
        <input
          ref={nameRef} className={'field' + (needName && !name.trim() ? ' bad' : '')} value={name} maxLength={16} autoFocus placeholder="Tumhara naam"
          onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNeedName(false); }}
        />
        <div className="swatches">
          {COLORS.map((c) => (
            <button type="button" key={c} className={'sw' + (c === color ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
        {showCode ? (
          <input
            className="field small" type="password" value={code} placeholder="Special code (sirf Vivek / Manisha ke liye)"
            autoComplete="off" onChange={(e) => setCode(e.target.value)}
          />
        ) : (
          <button type="button" className="linkbtn" onClick={() => setShowCode(true)}>🔑 Vivek / Manisha ho? Special code daalo</button>
        )}
        {leftMsg && <div className="okmsg">{leftMsg}</div>}
        {needName && !name.trim() && !code.trim() && <div className="err">Pehle apna naam likho, phir andar aao ✍️</div>}
        {error && <div className="err">{error}</div>}
        <button className="btn" disabled={busy}>Andar jao 🚪</button>
        <p className="hint">📷 Andar jaate hi browser camera aur mic ki permission maangega, Allow karna</p>
      </form>

      <div className={'land-status' + (phase === 'entering' ? ' on' : '')}>
        <b>🚪 Darwaza khul raha hai…</b>
        <span>Agar camera / mic ki permission aaye to <u>Allow</u> dabana 📷</span>
      </div>
      <div className={'land-flash' + (flash ? ' on' : '')} />
    </div>
  );
}
