// SERVER-SIDE ONLY. Friends never download this file.
//
// 🔐 Admin (Vivek) aur Manisha ke secret codes ab `.env` file mein hain (is file mein nahi):
//      ADMIN_CODE=...   -> Vivek (Admin)
//      GIRL_CODE=...    -> Manisha (Birthday Girl)
//    Join screen par "Special code" mein wahi code daalne se role milta hai. Code badalna ho to .env badlo
//    aur server restart karo. `.env` kisi ko mat bhejna.
//
// .env ko yahin load karte hain, taaki server aur tests dono ko same codes milein.
require('@next/env').loadEnvConfig(__dirname, false);

module.exports = {
  ADMIN_CODE: process.env.ADMIN_CODE || '',
  GIRL_CODE: process.env.GIRL_CODE || '',
  ADMIN_NAME: 'Vivek',
  GIRL_NAME: 'Manisha',

  // 🎉 Raat 12 baje ka celebration: server apne aap shuru karta hai (server wale laptop ki local timezone/ghadi se).
  // Is waqt hall ke dono taraf se confetti cannons + fireworks chalte hain, sab ko birthday song sunai deta hai,
  // aur jo bhi khada ho wo nachne lagta hai. Server us waqt chalu hona chahiye!
  BIRTHDAY: { month: 11, day: 3, hour: 0, minute: 0 }, // 3 November, 12:00 AM
  CELEBRATION_MINUTES: Number(process.env.CELEBRATION_MINUTES) || 5,
  // Test karne ke liye koi bhi exact time de sakte ho, jaise '2025-11-03T00:00:00' (ya CELEBRATION_AT environment variable).
  CELEBRATION_AT: process.env.CELEBRATION_AT || null,

  // 🧠 Manisha Quiz: friends ye sawaal solve karte hain. Manisha aur Admin sirf dekhte hain.
  // answer = sahi option ka number (0 = pehla, 1 = doosra, 2 = teesra, 3 = chautha).
  // YE SAWAAL PLACEHOLDER HAIN: Manisha ke baare mein asli sawaal-jawab Vivek ko khud likhne hain!
  QUIZ: [
    { q: 'Manisha ka favourite colour kaun sa hai?', options: ['Pink', 'Blue', 'Black', 'Green'], answer: 0 },
    { q: 'Manisha ko khane mein sabse zyada kya pasand hai?', options: ['Pizza', 'Golgappa', 'Momos', 'Biryani'], answer: 1 },
    { q: 'Manisha ka birthday kab aata hai?', options: ['1 November', '3 November', '13 November', '30 October'], answer: 1 },
    { q: 'Manisha ko kaun sa mausam pasand hai?', options: ['Garmi', 'Sardi', 'Barish', 'Basant'], answer: 2 },
    { q: 'Manisha ki sabse badi aadat kya hai?', options: ['Der se uthna', 'Selfie lena', 'Gussa karna', 'Shopping'], answer: 1 },
    { q: 'Vivek ne Manisha ko pehli baar kya bola tha?', options: ['Hi', 'Hello', 'Kaise ho?', 'Kuch aur 😄'], answer: 3 },
  ],

  // Balloon phodne par saamne wali deewar pe ye messages dikhte hain (14 balloons = 14 messages).
  // title = bada message, text = uske neeche chhoti line. Sab dekh sakte hain, to khulle dil se likho.
  BALLOON_MESSAGES: [
    { title: 'Happy Birthday Manisha! 🎂', text: 'Aaj ka din sirf tumhara hai.' },
    { title: 'Tum sabse special ho 💖', text: 'Is duniya mein bas ek hi Manisha hai.' },
    { title: 'Teri smile, meri jaan ✨', text: 'Hamesha aise hi muskurati rehna.' },
    { title: 'Tumhari har wish poori ho 🌟', text: 'Dil se dua hai, aaj aur hamesha.' },
    { title: 'Cutest birthday girl 🥰', text: 'Aaj to nazar utarni padegi!' },
    { title: 'Tum jahan, wahan khushiyan 🌸', text: 'Bas yunhi khushiyan failati raho.' },
    { title: 'Ek aur saal, ek aur dhamaka 🎉', text: 'Naya saal tumhare liye ekdum mast ho.' },
    { title: 'Tumse hi meri duniya hai 🌍', text: 'Tum ho to sab kuch accha lagta hai.' },
    { title: 'Cake kab kat raha hai? 🍰', text: 'Sab bhookhe baithe hain, jaldi karo!' },
    { title: 'Tum meri sabse pyaari dost 💞', text: 'Aur sabse pyaari kahani bhi.' },
    { title: 'Aaj to party banti hai 🥳', text: 'Naacho, gaao, aur masti karo!' },
    { title: 'Sapne bade rakhna 🚀', text: 'Hum sab tumhare saath hain.' },
    { title: 'Tum hamesha khush raho 🌈', text: 'Tumhari khushi mein hi hamari khushi.' },
    { title: 'I love you, Manisha ❤️', text: 'Happy Birthday meri jaan!' },
  ],

  // Gifts ke andar ke messages. Sirf Manisha aur Admin kholkar padh sakte hain.
  GIFTS: [
    {
      title: '💌 Pehla Gift: Ek Khat',
      text: 'Meri pyaari Manisha, tum meri life ki sabse khoobsurat cheez ho. Tumhari smile se mera din ban jata hai. Happy Birthday meri jaan! ❤️',
    },
    {
      title: '🌟 Doosra Gift: Ek Wish',
      text: 'Meri dua hai ki tumhari har wish poori ho, tum hamesha khush raho, aur main hamesha tumhare saath rahu.',
    },
    {
      title: '💍 Teesra Gift: Ek Vaada',
      text: 'Har birthday par main tumhare saath hounga, har din tumhe hasaunga. Ye mera vaada hai. 🥰',
    },
  ],
};
