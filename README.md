# AI Ofis · Cinematic Edition

Three.js 0.160.0 bilan ishlaydigan procedural 3D ofis: 8 xona, 24 personaj,
24 avtomobilli avtoturargoh. Video namunadagi low-poly uslubga yaqinlashtirilgan;
asl video modellari yoki ularning aynan nusxasi emas.

## Ishga tushirish

`index.html`, `ofis.js` va `start.bat` bir papkada tursin.
Windows kompyuterda Python o'rnatilgan bo'lsa, `start.bat` ni oching.
Yoki shu papkada `python -m http.server 8765` buyrug'ini bajarib,
http://localhost:8765/ manziliga kiring. Faylni ikki marta bosib `file://` orqali
ishga tushirmang: modul yuklash cheklanishi mumkin.

Internet faqat cdn.jsdelivr.net orqali Three.js va uning 0.160.0 addons modullarini
olish uchun kerak. Tashqi model, tekstura, boshqa CDN va server API yo'q.
GitHub Pages uchun `index.html` va `ofis.js` ni birga yangilang.

## Boshqaruv

| Tugma | Vazifa |
|---|---|
| 1 | Ofisni umumiy ko'rish, sichqoncha bilan aylantirish / yaqinlashtirish |
| 2 | Piyoda yurish: WASD, sichqonchani tortib qarash, Shift — tezroq |
| 3 | Agentni kuzatish; chap/o'ng strelka — keyingi agent |
| 4 | Kino: ofis, personajlar va avtoturargoh bo'ylab kamera sayohati |
| P | Avtoturargohni ko'rish |
| Q | Past → O'rta → Yuqori grafik sifat |
| N | Kun / tun |
| L | Ismlar va holat yozuvlari |
| S | 1x / 2x / 4x simulyatsiya; yurish rejimida S orqaga yuradi |
| V | 9:16 vertikal video formati |
| H | Interfeysni yashirish / qaytarish |
| Enter | Navbatdagi so'rovni tasdiqlash |

Ofis nomi: `?nom=Mening%20Ofisim`. Sifat: `?quality=low`, `?quality=medium`,
`?quality=high`. Birga: `?nom=Mening%20Ofisim&quality=high`.
Boshlang'ich vaqt 17:20 — iliq yorug'lik uchun. N bilan tun/kunga o'tiladi.

## Qilingan o'zgarishlar

- Personajlar: shakllantirilgan gavda, yelka va qo'llar, tirsaklar, yuz, soch,
  soqol, ko'zoynak, garnitura; turli kiyimlar, yoqa, galstuk, ID karta, soat.
- Animatsiya: silliq bo'g'in harakatlari, nafas, bosh burilishi, yozish va
  ichishda tirsak harakati, qo'lda krujka. Agentlar soyasi saqlangan.
- Interyer: yumshoq stullar, g'ildirak va tirsakqo'ygichlar, yog'och stol,
  klaviatura tugmalari, daftar, krujka, ajratgichlar, jalyuzi, yog'och bezak,
  osma chiroqlar, majlis stolidagi noutbuklar va kofe mashinasi detallari.
- Material va yorug'lik: procedural wood/concrete/fabric xaritalari,
  PMREM/RoomEnvironment, PCF soyalar, kontakt soya (AO imitatsiyasi),
  bloom, issiq xona va tashqi chiroqlar, gradient osmon.
- Tashqari: 24 nomlangan joy, keng markaziy kirish, piyoda o'tish chiziqlari,
  bordyur, daraxtlar, o'rindiqlar, kirish soyaboni va yoritilgan avtoturargoh.
- Har bir TEAM a'zosiga bittadan avtomobil: Mercedes E, G, C Coupe va BMW 5,
  X5, 4 Coupe uslubidagi procedural talqinlar. Haqiqiy avtomobillarning
  o'lchovli/CAD modellari emas. Avtomobillar joyida turadi, haydash tizimi yo'q.
- Mashinalar korpusi, oynalari, faralari, panjaralari, disk/shinalari,
  ko'zgulari, eshik tutqichlari va ranglari farqlanadi.
- Statik detallar material va hudud bo'yicha birlashtiriladi; geometriyalar
  qayta ishlatiladi. Personajlarda faqat bitta bo'g'inga tegishli qismlar birlashadi.

## Sifat va tezlik

| Rejim | Piksel chegarasi | Soya | Bloom / nuqtaviy chiroqlar |
|---|---|---|---|
| Past | 1x gacha, 1.1 mln | 1024; 20 Hz | O'chiq; ambient yorug'lik saqlanadi |
| O'rta | 1.25x gacha, 2.3 mln | 2048; 30 Hz | Yoqilgan |
| Yuqori | 2x gacha, 5 mln | 4096; 60 Hz | Yoqilgan |

Past rejimda parking nom lavhalari yashiriladi. Agentlar, avtomobillar va
simulyatsiya qoladi. Soya yangilanishi butun animatsiya FPSi emas.
60 FPS kafolatlanmaydi: qurilma, ekran o'lchami va video yozish dasturi ta'sir qiladi.

Video uchun: L bilan yozuvlarni o'chiring, H bilan UI ni yashiring, 4 yoki P ni bosing.
Vertikal yozish uchun V ham qo'shiladi. Sust ishlasa Q bilan Pastni tanlang.

## Saqlangan mantiq va tekshiruv

TEAM ismlari, rollari, vazifalari va vositalari; ROOMS; A*; agent qarorlari;
yig'ilishlar va Enter tasdig'i saqlangan. Tashqarida piyoda yurish kengaytirilgan:
avtomobil va soyabon ustunlari ichidan o'tish bloklanadi.

Haqiqiy Three.js geometriyasi bilan test: 24 agent, 24 turli egali mashina,
8 xona, Q/P/1–4/N/L/S/V/H, Enter, yig'ilish, A*, avtoturargoh kirishi va
avtomobil to'qnashuvi; 1800 simulyatsiya kadri. Bu testda GPU renderi va
Canvas chizish o'rniga test funksiyalari ishlatilgan.
Modellar joylashuvi alohida offline 3D renderda ham ko'rib chiqilgan;
u brauzer ranglari, teksturalari yoki FPSini tasdiqlamaydi.
Haqiqiy brauzer/GPU testi bu muhitda bajarilmadi.

Hozirgi jurnal va ishlar — simulyatsiya. Haqiqiy AI API, post joylash yoki
Claude ishini jonli kuzatish ulanmagan. Grafik yangilanish buni o'zgartirmaydi.

## Keyin o'zgartirish uchun

- `TEAM`: xodimlar, ismlar, kasblar, vazifalar.
- `Agent.build()`: personajlar geometriyasi va kiyimlari.
- `PARKING_MODELS`, `CAR_PALETTE`, `buildCar()`: mashina turlari va ranglari.
- `buildParking()`: 24 joyli parking chizmasi.
- `QUALITY`: sifat profillari.
- `SHOTS`: kino kamera marshruti.

Fayl tuzilmasi saqlangan: asosiy dastur `index.html` + `ofis.js`.
