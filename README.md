# AI Ofis · Realism Edition

Three.js 0.160.0 bilan ishlaydigan 3D ofis: 8 xona, 24 personaj,
24 avtomobilli avtoturargoh. Procedural sahna mahalliy PBR teksturalar, HDR va GLB
modellari bilan boyitilgan. Fotorealistik yoki video bilan 1:1 nusxa deb hisoblanmaydi.

## Ishga tushirish

`index.html`, `ofis.js`, `start.bat` va **assets/** papkasi birga tursin.
Windows kompyuterda Python o'rnatilgan bo'lsa, `start.bat` ni oching.
Yoki shu papkada `python -m http.server 8765` buyrug'ini bajarib,
http://localhost:8765/ manziliga kiring. Faylni ikki marta bosib `file://` orqali
ishga tushirmang: modul yuklash cheklanishi mumkin.

Internet faqat cdn.jsdelivr.net orqali Three.js va uning 0.160.0 addons modullarini
olish uchun kerak. Model, HDR va teksturalar shu repozitoriyning `assets/`
papkasidan olinadi; uchinchi tomon asset API yoki akkaunti kerak emas.
GitHub Pages uchun `assets/` papkasini ham yuklash shart. Manbalar va litsenziyalar:
[assets/CREDITS.md](assets/CREDITS.md).

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

## Realism yangilanishi

- Poly Haven yog'och rang/normal/roughness xaritalari; kiyim va yumshoq mebellarga
  mato normal/roughness xaritalari. Rang xaritasi sRGB, data xaritalari linear.
- Haqiqiy HDR panoramadan PMREM akslari. HDR faqat yoritish/aks uchun;
  tashqaridagi gradient osmon va kun/tun almashishi saqlanadi.
- Yuqori rejimda 16 namunali SSAO (shaffof shisha va yozuvlarni hisoblamaydi),
  to'rtta keng area light, HDR postprocessing va WebGL2 MSAA.
- 24 personaj uchun birgalikda ishlatiladigan, silliq jag', burun, qovoq, quloq va
  lab detallari bor original GLB bosh. Bosh avvalgi animatsiya bo'g'iniga ulanadi;
  soch, aksessuar, kiyim rangi va agent shaxsi saqlanadi. To'liq humanoid skelet
  yoki motion-capture yurish hali qo'shilmagan.
- Gavda UV choklari va segmentlari yaxshilandi, qo'l barmoqlari qo'shildi.
- Dam olish zonasidagi ikki puf o'rniga teksturali GLB kreslo (Past rejimda puf).
- Avtomobillarda lak akslari, silliq shinalar, tormoz diski, support, eshik
  choklari va LED fara detallari. Kuzovlar hali procedural.
- Assetlar fon rejimida yuklanadi: muvaffaqiyatsiz yuklanish ofisni to'xtatmaydi.
  Q bilan Pastga o'tish procedural fallbackni qaytaradi. Low URL bilan boshlansa,
  yuqori detallar umuman so'ralmaydi; O'rta/Yuqoriga o'tganda bir marta yuklanadi.
- WebGL ishga tushmasa, cheksiz loading o'rniga tushunarli xabar ko'rsatiladi.

## Oldingi o'zgarishlar

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

| Rejim | Piksel chegarasi | Soya | Qo'shimcha grafika |
|---|---|---|---|
| Past | 1x gacha, 1.1 mln | 1024; 20 Hz | Procedural material/model; bloom, SSAO, area light o'chiq |
| O'rta | 1.25x gacha, 2.3 mln | 2048; 30 Hz | PBR, HDR, GLB, bloom; SSAO/area light o'chiq |
| Yuqori | 2x gacha, 8.3 mln | 4096; 60 Hz | PBR, HDR, GLB, bloom, SSAO va area light |

1000px dan keng oynada boshlang'ich sifat Yuqori, qolganida O'rta. URL parametri
buni almashtiradi. Core i7 nomi videokarta kuchini bildirmaydi; GPU va VRAM ham muhim.

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
GLTFLoader bilan ikkala GLB va RGBELoader bilan HDR parse qilindi; 24 yuz/2 kreslo,
Q fallback va qayta yoqish tekshirildi. Tekshiruvda renderer va rasmlar chizilishi
almashtirilgan: bu GPU yoki FPS testi emas. WebGL o'chirilgan tekshiruv muhiti
sabab yakuniy brauzer tasviri va unumdorlik foydalanuvchi qurilmasida baholanadi.

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
