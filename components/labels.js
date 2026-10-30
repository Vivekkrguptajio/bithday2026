'use client';

// Canvas-texture sprites for name tags, chat bubbles and reactions.
// They replace the old DOM labels: constant size, no per-frame DOM work.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const cache = new Map();

const STYLES = {
  default: { bg: 'rgba(20,8,40,.8)', fg: '#ffffff' },
  me: { bg: 'rgba(255,79,154,.95)', fg: '#ffffff' },
  admin: { bg: '#ffd166', fg: '#2b1b3d' },
  girl: { grad: ['#ffd166', '#ff5fa2'], fg: '#2b1b3d' },
  out: { bg: 'rgba(130,20,45,.92)', fg: '#ffffff' },
  prop: { bg: 'rgba(20,8,40,.62)', fg: '#ffffff' },
  emoji: { bg: null, fg: '#ffffff' },
};
const FONT = '"Poppins", "Segoe UI", "Segoe UI Emoji", sans-serif';

function finish(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { tex, aspect: canvas.width / canvas.height };
}

function makeLabel(text, style) {
  const st = STYLES[style] || STYLES.default;
  const px = style === 'emoji' ? 110 : 44;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `600 ${px}px ${FONT}`;
  const padX = style === 'emoji' ? 10 : 26;
  const w = Math.ceil(g.measureText(text).width) + padX * 2;
  const h = Math.ceil(px * 1.6);
  c.width = w; c.height = h;
  g.font = `600 ${px}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (st.bg || st.grad) {
    if (st.grad) {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, st.grad[0]); gr.addColorStop(1, st.grad[1]);
      g.fillStyle = gr;
    } else g.fillStyle = st.bg;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, h / 2); g.fill();
  }
  g.fillStyle = st.fg;
  g.fillText(text, w / 2, h / 2 + 2);
  return finish(c);
}

function makeBubble(text) {
  const px = 38, maxW = 440, pad = 26;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `500 ${px}px ${FONT}`;
  const lines = [];
  let cur = '';
  String(text).split(' ').forEach((word) => {
    const t = cur ? cur + ' ' + word : word;
    if (probe.measureText(t).width > maxW && cur) { lines.push(cur); cur = word; } else cur = t;
  });
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 4);
  const w = Math.min(maxW, Math.max(...shown.map((l) => probe.measureText(l).width))) + pad * 2;
  const bodyH = shown.length * px * 1.3 + pad * 1.4;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(bodyH + 24);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect(2, 2, c.width - 4, bodyH, 26); g.fill();
  g.beginPath(); g.moveTo(c.width / 2 - 14, bodyH - 2); g.lineTo(c.width / 2 + 14, bodyH - 2); g.lineTo(c.width / 2, bodyH + 20); g.fill();
  g.font = `500 ${px}px ${FONT}`;
  g.fillStyle = '#2b1b3d'; g.textAlign = 'center'; g.textBaseline = 'middle';
  shown.forEach((l, i) => g.fillText(l, c.width / 2, pad * 0.7 + px * 0.65 + i * px * 1.3));
  return finish(c);
}

function get(key, make) {
  let v = cache.get(key);
  if (!v) { v = make(); cache.set(key, v); if (cache.size > 400) cache.delete(cache.keys().next().value); }
  return v;
}

// Keeps tags readable: on screen they stay about the same size from 4.5m to 21m away,
// and never blow up when somebody stands right next to the camera.
function useDistScale(ref, w, h) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!ref.current) return;
    ref.current.getWorldPosition(v);
    const k = Math.min(2.3, Math.max(0.5, v.distanceTo(camera.position) / 9));
    ref.current.scale.set(w * k, h * k, 1);
  });
}

export function Label({ text, position, style = 'default', height = 0.34, alwaysOnTop = false }) {
  const t = useMemo(() => get(`L|${style}|${text}`, () => makeLabel(text, style)), [text, style]);
  const ref = useRef();
  useDistScale(ref, height * t.aspect, height);
  return (
    <sprite ref={ref} position={position} scale={[height * t.aspect, height, 1]} renderOrder={20}>
      {/* name tags always show on top; labels of things (gifts, cake) hide behind objects */}
      <spriteMaterial map={t.tex} transparent depthTest={style === 'prop' && !alwaysOnTop} toneMapped={false} />
    </sprite>
  );
}

export function Bubble({ text, position, height = 0.62 }) {
  const t = useMemo(() => get(`B|${text}`, () => makeBubble(text)), [text]);
  const ref = useRef();
  useDistScale(ref, height * t.aspect, height);
  return (
    <sprite ref={ref} position={position} center={new THREE.Vector2(0.5, 0)} scale={[height * t.aspect, height, 1]} renderOrder={21}>
      <spriteMaterial map={t.tex} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

// Emoji that floats up and sways (reactions above a head, heart pickups).
export function FloatEmoji({ emoji, position, size = 0.8, bob = 0.12, spin = false, onTop = false }) {
  const ref = useRef();
  const t = useMemo(() => get(`L|emoji|${emoji}`, () => makeLabel(emoji, 'emoji')), [emoji]);
  const base = useMemo(() => position[1], [position]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const k = clock.elapsedTime;
    ref.current.position.y = base + Math.sin(k * 2.4 + position[0]) * bob;
    if (spin) ref.current.material.rotation = Math.sin(k * 1.5) * 0.25;
  });
  return (
    <sprite ref={ref} position={position} scale={[size * t.aspect, size, 1]} renderOrder={19}>
      <spriteMaterial map={t.tex} transparent depthTest={!onTop} toneMapped={false} />
    </sprite>
  );
}
