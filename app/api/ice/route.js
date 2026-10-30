export const dynamic = 'force-dynamic';

// ICE servers for the video/voice calls. The TURN credentials are fetched here, on the server, so the API key itself
// never reaches the browser. Without any TURN setting only Google STUN is returned (fine on one Wi-Fi, often NOT enough
// between different homes / mobile data).
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
let cache = null; // { at, ttl, servers }

export async function GET() {
  if (cache && Date.now() - cache.at < cache.ttl) return Response.json({ iceServers: cache.servers });

  let servers = STUN;
  let ttl = 60 * 1000; // retry quickly when TURN could not be loaded
  const key = process.env.METERED_API_KEY;
  const app = (process.env.METERED_APP || '').replace(/\.metered\.live.*$/, '').replace(/^https?:\/\//, '');

  try {
    if (key && app) {
      const base = process.env.METERED_URL || `https://${app}.metered.live`;
      const res = await fetch(`${base}/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`);
      if (res.ok) {
        const turn = await res.json();
        if (Array.isArray(turn) && turn.length) { servers = [...STUN, ...turn]; ttl = 30 * 60 * 1000; }
      } else console.error(`Metered TURN request failed: HTTP ${res.status} (METERED_APP / METERED_API_KEY check karo)`);
    }
    // Manual TURN server from .env: used when Metered is not configured, or did not work.
    if (servers === STUN && process.env.TURN_URL) {
      servers = [...STUN, {
        urls: process.env.TURN_URL.split(',').map((u) => u.trim()).filter(Boolean),
        username: process.env.TURN_USERNAME || undefined,
        credential: process.env.TURN_CREDENTIAL || undefined,
      }];
      ttl = 30 * 60 * 1000;
    }
  } catch (e) {
    console.error('TURN lookup failed:', e.message);
  }

  cache = { at: Date.now(), ttl, servers };
  return Response.json({ iceServers: servers });
}
