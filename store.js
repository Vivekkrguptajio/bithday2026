// Tiny key-value storage for things that must survive a restart (guest list, gifts with photos).
//   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set  ->  stored in Upstash Redis (use this on Render:
//     Render's free disk is wiped on every deploy/restart)
//   - otherwise                                              ->  JSON files in DATA_DIR (default ./data), fine for your laptop
// Values are always JSON. Failures are logged and never crash the party (everything also stays in memory).
const fs = require('fs');
const path = require('path');

const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const REST_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const remote = !!(REST_URL && REST_TOKEN);

const file = (key) => path.join(DIR, `${key.replace(/[^a-z0-9_-]/gi, '_')}.json`);

async function rest(cmd, key, body) {
  const res = await fetch(`${REST_URL}/${cmd}/${encodeURIComponent(key)}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
    body,
  });
  if (!res.ok) throw new Error(`Upstash ${cmd} -> HTTP ${res.status}`);
  return res.json();
}

module.exports = {
  mode: remote ? 'upstash' : 'file',

  async get(key) {
    try {
      if (remote) {
        const j = await rest('get', key);
        return j.result ? JSON.parse(j.result) : null;
      }
      return JSON.parse(await fs.promises.readFile(file(key), 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') console.error(`store.get(${key}) failed:`, e.message);
      return null;
    }
  },

  async set(key, value) {
    try {
      const text = JSON.stringify(value);
      if (remote) await rest('set', key, text);
      else {
        await fs.promises.mkdir(DIR, { recursive: true });
        await fs.promises.writeFile(file(key), text);
      }
    } catch (e) {
      console.error(`store.set(${key}) failed:`, e.message);
    }
  },

  async del(key) {
    try {
      if (remote) await rest('del', key);
      else await fs.promises.unlink(file(key));
    } catch (e) {
      if (e.code !== 'ENOENT') console.error(`store.del(${key}) failed:`, e.message);
    }
  },
};
