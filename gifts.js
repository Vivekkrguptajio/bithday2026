// Gifts that friends send to Manisha: a photo + a message.
// They are stored with store.js (Upstash on Render, files on your laptop) so they survive restarts, and the photo + message
// are only sent to everybody when Manisha (or the Admin) opens the gift.
const MAX_GIFTS = 60;
const MAX_PHOTO = 450000; // characters of base64 (about 330 KB)

const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

module.exports = async function createGifts(io, store) {
  // index = small records; every photo is its own key (keeps each stored value small)
  const index = (await store.get('gifts-index')) || [];
  const list = await Promise.all(index.map(async (g) => ({
    id: g.id, from: g.from, text: g.text || '', opened: !!g.opened, at: g.at || 0,
    photo: g.hasPhoto ? (await store.get(`gift-photo-${g.id}`)) || '' : '',
  })));
  let nextId = list.reduce((m, g) => Math.max(m, g.id), 0) + 1;

  let saveTimer = null;
  const saveIndex = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      store.set('gifts-index', list.map((g) => ({ id: g.id, from: g.from, text: g.text, opened: g.opened, at: g.at, hasPhoto: !!g.photo })));
    }, 400);
  };

  const pub = (g) => ({ id: g.id, from: g.from, opened: g.opened, hasPhoto: !!g.photo });

  return {
    snapshot: () => list.map(pub),

    add(p, data) {
      if (!data) return { ok: false, error: 'Khali gift' };
      const text = clean(data.text, 220);
      const photo = typeof data.photo === 'string' ? data.photo : '';
      if (photo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > MAX_PHOTO)) {
        return { ok: false, error: 'Photo sahi nahi hai ya bahut badi hai' };
      }
      if (!text && !photo) return { ok: false, error: 'Photo ya message, kuch to daalo 🙂' };
      if (list.length >= MAX_GIFTS) return { ok: false, error: 'Gift table full ho gayi hai 😅' };
      const g = { id: nextId++, from: p.name, text, photo, opened: false, at: Date.now() };
      list.push(g);
      if (photo) store.set(`gift-photo-${g.id}`, photo);
      saveIndex();
      io.emit('giftAdded', pub(g));
      return { ok: true };
    },

    // Manisha / Admin only (checked by the caller). Shows the gift on the big display for everybody.
    open(p, id) {
      const g = list.find((x) => x.id === id);
      if (!g) return { ok: false, error: 'Gift nahi mila' };
      g.opened = true;
      saveIndex();
      io.emit('giftOpened', { id: g.id, from: g.from, text: g.text, photo: g.photo, by: p.name });
      return { ok: true };
    },
  };
};
