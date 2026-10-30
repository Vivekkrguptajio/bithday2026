# 🚀 Render pe deploy karna (Manisha ki Birthday Party)

Frontend aur backend **alag-alag deploy nahi karne**. Ye ek hi Node server hai (Next.js + Socket.io, ek port), isliye Render par
**sirf ek "Web Service"** banegi. Isse CORS ya do links ka jhanjhat nahi.

## 1) API keys (.env me daalo, phir Render me)
`.env` file mein har key ke upar likha hai ki wo kis kaam ki hai. Kul 2 keys chahiye:

| Key | Kis liye | Kahan se |
|---|---|---|
| `METERED_APP` + `METERED_API_KEY` | **Video + awaaz** alag-alag ghar/mobile data ke dosto ke beech chale (TURN) | metered.ca (free) |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | **Gifts (photo+message) aur Mehmaan list** restart ke baad bhi bachi rahe | console.upstash.com (free, Redis) |

Baaki: `ADMIN_CODE`, `GIRL_CODE` (tumhare secret codes) aur `TZ=Asia/Kolkata` (**zaroori**, warna "12 baje" galat time pe chalega).

Bina keys ke bhi party chalti hai, par: video sirf ek hi Wi-Fi par chalega, aur gifts/list restart par ud jayenge.

## 2) Code GitHub pe
- `party3d` folder ko GitHub repo mein daalo (private rakho). `.env`, `data/`, `node_modules` apne aap ignore hote hain.

## 3) Render pe service
1. render.com → **New → Web Service** → apna GitHub repo chuno. (Ya **New → Blueprint** se `render.yaml` use karo.)
2. Agar repo ke andar `party3d` sub-folder hai to **Root Directory = `party3d`**.
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm start`
5. **Health Check Path:** `/api/health`
6. **Environment** mein ye saari values daalo (`.env` se copy karke): `NODE_ENV=production`, `TZ=Asia/Kolkata`, `ADMIN_CODE`, `GIRL_CODE`,
   `METERED_APP`, `METERED_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
7. Deploy. Link milega jaise `https://manisha-birthday-party.onrender.com`: ye **https** hai, to camera/mic dosto ke browser mein chalega.

## 4) 12 baje ka celebration: dhyan rakho
- Render ka free plan service ko ~15 minute baad **sula deta hai**, aur soya hua server celebration shuru nahi kar sakta.
  Isliye server khud ko har 9 minute ping karta hai (Render ka `RENDER_EXTERNAL_URL` apne aap set hota hai), to wo jaga rehta hai.
- Pakka rakhna ho to Render ka **Starter** plan le lo (sota hi nahi).
- Party se 1-2 din pehle ek baar **test** karo: `.env`/Render mein `CELEBRATION_AT=` aane wale 3-4 minute ka time (jaise `2026-11-02T23:55:00`) daalo,
  dekho celebration shuru hota hai, phir us line ko hata do.
- Server start hote hi log mein dikhta hai: `Midnight celebration: <date time>`, wahi time check kar lena (IST hona chahiye).

## 5) Party wale din
- Dosto ko sirf **link** bhejo. Special code sirf tum (Admin) aur Manisha use karoge.
- Vivek: naam daalo + `ADMIN_CODE`. Manisha: `GIRL_CODE` (naam apne aap "Manisha" ban jata hai).
