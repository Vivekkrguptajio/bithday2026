// Shared room layout (positions of things everyone must agree on).
// The hall is 32 x 29 (the old one was about 19 x 19).
export const HX = 16; // inner wall at x = +-16
export const HZ = 14.5; // inner wall at z = +-14.5 (video wall at the back, message/game screen at the front)
export const BX = 15; // walkable half-width
export const BZ = 13.6; // walkable half-depth
export const WALL_H = 7;

export const CAKE = { x: 0, z: -5 };
// The gate to "Masti Duniya" (the fun-fair + beach world) stands against the front wall, on the left.
export const HALL_PORTAL = { x: -12, z: 13.2 }; // where you stand to use it
export const CAKE_SCALE = 0.62; // the whole cake (table + 3 hearts + candles) is drawn at this scale
export const TABLE_R = 1.6 * CAKE_SCALE; // table radius after scaling (also used for collision)

// Gifts sit in rings around the cake (cake table radius is about 1).
// The three Admin-prepared gifts: right, left and in front of the cake.
export const GIFTS = [
  { x: CAKE.x + 2.3, z: CAKE.z, color: '#ff4f9a' },
  { x: CAKE.x - 2.3, z: CAKE.z, color: '#7c4dff' },
  { x: CAKE.x, z: CAKE.z + 2.3, color: '#ffd166' },
];

// Gifts that friends send to Manisha are placed on a wider ring around the cake (18 spots, then they wrap).
export const GIFT_SLOTS = 18;
export function giftSlot(id) {
  const a = ((id % GIFT_SLOTS) / GIFT_SLOTS) * Math.PI * 2 + Math.PI / GIFT_SLOTS;
  return { x: CAKE.x + Math.cos(a) * 3.4, z: CAKE.z + Math.sin(a) * 3.4 };
}

// Food stalls along the side walls. side -1 = left wall (faces +x), +1 = right wall (faces -x).
// `meme` = [top line, bottom line] of the meme board in the middle of each stall (the picture is the stall's emoji).
export const STALLS = [
  { x: -15.1, z: -9, side: -1, id: 'golgappa', name: 'Golgappa', emoji: '🧆', color: '#ff8e53', yum: 'Pani puri ekdum tikhi! 🔥', meme: ['SAB KUCH CHHOD DO', 'GOLGAPPE WALE BHAIYA AAYE HAIN'] },
  { x: -15.1, z: -3, side: -1, id: 'momos', name: 'Momos', emoji: '🥟', color: '#e63946', yum: 'Garma garam momos 😋', meme: ['DIET KAL SE SHURU', 'AAJ TO MOMOS'] },
  { x: -15.1, z: 3, side: -1, id: 'chai', name: 'Chai', emoji: '☕', color: '#8d5524', yum: 'Adrak wali chai ☕', meme: ['SIRF EK CHAI', '(PEHLA KAP)'] },
  { x: -15.1, z: 9, side: -1, id: 'pizza', name: 'Pizza', emoji: '🍕', color: '#d62828', yum: 'Cheese burst pizza 🍕', meme: ['8 SLICE KA PIZZA', 'MERE LIYE 1 SLICE'] },
  { x: 15.1, z: -9, side: 1, id: 'icecream', name: 'Ice Cream', emoji: '🍦', color: '#4cc9f0', yum: 'Thandi thandi ice cream 🍦', meme: ['SARDI HO YA GARMI', 'ICE CREAM CHALEGI'] },
  { x: 15.1, z: -3, side: 1, id: 'candy', name: 'Cotton Candy', emoji: '🍭', color: '#f72585', yum: 'Meetha meetha buddhi ke baal 🍭', meme: ['BACHPAN WALI FEELING', 'BUDDHI KE BAAL'] },
  { x: 15.1, z: 3, side: 1, id: 'jalebi', name: 'Jalebi', emoji: '🌀', color: '#ffb703', yum: 'Garam jalebi, rabdi ke saath 🤤', meme: ['JALEBI SEEDHI NAHI HOTI', 'PAR MEETHI HOTI HAI'] },
  { x: 15.1, z: 9, side: 1, id: 'drink', name: 'Cold Drink', emoji: '🥤', color: '#2a9d8f', yum: 'Thanda thanda cold drink 🥤', meme: ['ZINDAGI MEIN TENSION?', 'COLD DRINK PEE LE'] },
];
export const STALL_W = 3; // along the wall
export const STALL_D = 1.3; // depth into the room

// Solid furniture (axis-aligned boxes) the avatars can't walk through.
export const BLOCKS = [
  { x: -6.5, z: -11.2, w: 3.2, d: 1.3 }, // sofa left
  { x: 6.5, z: -11.2, w: 3.2, d: 1.3 }, // sofa right
  { x: 0, z: -11.6, w: 1.8, d: 1 }, // coffee table
];
export const SOFAS = [{ x: -6.5, z: -11.2 }, { x: 6.5, z: -11.2 }];

export const DANCE = { x: 0, z: 7.5, size: 9 };
// Standing on the dance floor starts the dancing and the party song (which only people on the floor can hear).
export const onDanceFloor = (x, z) => Math.abs(x - DANCE.x) < DANCE.size / 2 && Math.abs(z - DANCE.z) < DANCE.size / 2;

// Red Light Green Light
export const START_Z = 9.5; // leaves ~5m behind the start line so the camera has room
export const FINISH_Z = -9.5;

// Balloons float high along the side walls, so they never block the camera or the video wall.
const BALLOON_COLORS = ['#ff4f9a', '#ffd166', '#4cc9f0', '#7c4dff', '#06d6a0', '#ff8e53', '#f72585'];
export const BALLOONS = Array.from({ length: 14 }, (_, i) => {
  const side = i % 2 ? 1 : -1;
  const k = Math.floor(i / 2);
  return {
    id: i,
    x: side * (10.8 + ((k * 5) % 3) * 0.9),
    z: -11 + k * 3.4,
    y: 3.9 + ((i * 5) % 4) * 0.5,
    color: BALLOON_COLORS[i % BALLOON_COLORS.length],
  };
});

export const REACTIONS = ['❤️', '😂', '👏', '🔥'];
