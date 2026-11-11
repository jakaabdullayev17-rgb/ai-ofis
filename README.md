# AI Ofis

Brauzerda ishlaydigan 3D ofis: 24 ta AI agent 8 ta xonada kontent yaratadi
(Instagram va YouTube uchun video yozib olishga mo'ljallangan).

## Ishga tushirish

`start.bat` ni ikki marta bosing: brauzerda http://localhost:8765/ ochiladi.
Internet kerak, chunki Three.js kutubxonasi CDN'dan yuklanadi.

Ofis nomini o'zgartirish uchun: `http://localhost:8765/?nom=Mening Ofisim`

## Boshqaruv

| Tugma | Vazifa |
|---|---|
| 1 | Umumiy ko'rinish (sichqoncha bilan aylantirish, g'ildirak bilan yaqinlashtirish) |
| 2 | Ichida yurish: W A S D bilan yurasiz, sichqonchani tortib qaraysiz, Shift bilan tezroq |
| 3 | Agentni kuzatish (← → bilan keyingi agentga o'tasiz, agentni bossangiz ham bo'ladi) |
| 4 | Kino rejimi: kamera xonama-xona o'zi yuradi va xona nomlarini chiqaradi |
| N | Kun / tun |
| L | Ismlarni yoqish / o'chirish |
| S | Tezlik 1x / 2x / 4x |
| V | 9:16 vertikal kadr (Reels, Shorts, TikTok uchun) |
| H | Interfeysni yashirish (toza yozuv uchun) |
| Enter | Agentning so'roviga ruxsat berish |

## Video yozish bo'yicha maslahat

1. `V` (9:16), keyin `H` (interfeysni yashirish), keyin `4` (kino rejimi).
2. Ekranni OBS yoki Windows'dagi `Win + Alt + R` bilan yozib oling.
3. Har kuni bitta yangilik qo'shing (yangi agent, yangi xona) va
   "AI ofisim qanday o'syapti" seriyasini yuriting.

## Xonalar

Qabulxona · Ish zali · Boshqaruv markazi · Studiya · Dam olish zonasi ·
Majlislar xonasi · Server xonasi · Yo'lak

Agentlar, ularning vazifalari va vositalari `ofis.js` ichidagi `TEAM` ro'yxatida turibdi.
