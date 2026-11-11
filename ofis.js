import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Q: past / o'rta / yuqori. Simulyatsiya tezligi sifatga bog'liq emas.
const QUALITY = [
  { name: 'Past', dpr: 1, pixels: 1100000, shadow: 1024, bloom: false, lights: false, shadowHz: 20 },
  { name: "O'rta", dpr: 1.25, pixels: 2300000, shadow: 2048, bloom: true, lights: true, shadowHz: 30 },
  { name: 'Yuqori', dpr: 2, pixels: 5000000, shadow: 4096, bloom: true, lights: true, shadowHz: 60 },
];
const qualityParam = new URLSearchParams(location.search).get('quality');
let qualityIndex = ({ low: 0, medium: 1, high: 2 })[qualityParam] ?? 1;
let renderScale = 1, shadowElapsed = 1, fpsTime = 0, fpsFrames = 0;

// Ofis nomini URL orqali o'zgartirish mumkin: index.html?nom=Mening%20Ofisim
const OFFICE_NAME = (new URLSearchParams(location.search).get('nom') || 'AI OFIS').toUpperCase();

// ---------------------------------------------------------------- yordamchilar
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

const matCache = new Map();
function mat(color, o = {}) {
  const k = color + '|' + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o }));
  return matCache.get(k);
}
const geoCache = new Map();
function boxGeo(w, h, d) {
  const k = w + ',' + h + ',' + d;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
function box(parent, w, h, d, m, x, y, z, ry = 0, shadow = true) {
  const mesh = new THREE.Mesh(boxGeo(w, h, d), m && m.isMaterial ? m : mat(m));
  mesh.position.set(x, y, z); mesh.rotation.y = ry;
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function cyl(parent, rt, rb, h, m, x, y, z, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m && m.isMaterial ? m : mat(m));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function sphere(parent, r, m, x, y, z, detail = 1) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), m && m.isMaterial ? m : mat(m, { flatShading: true }));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); if (draw) draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData = { canvas: c, ctx }; return t;
}
// Deterministik teksturalar: tashqi rasm yoki model yuklanmaydi.
const surfaces = new Map();
function surface(kind, color, repeat = 1) {
  const key = `${kind}:${color}:${repeat}`;
  if (surfaces.has(key)) return surfaces.get(key);
  let seed = 137;
  const noise = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const tex = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#b8b8b8'; ctx.fillRect(0, 0, 256, 256);
    if (kind === 'wood') {
      for (let y = 0; y < 256; y++) {
        const v = 145 + Math.round(noise() * 45);
        ctx.strokeStyle = `rgb(${v},${v},${v})`; ctx.beginPath();
        for (let x = 0; x <= 256; x += 8) {
          const yy = y + Math.sin(x * 0.035 + y * 0.12) * 1.6;
          if (!x) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#777'; ctx.fillRect(0, 0, 256, 2);
      ctx.fillRect(0, 128, 256, 2); ctx.fillRect(0, 0, 2, 128); ctx.fillRect(126, 128, 2, 128);
    } else {
      for (let i = 0; i < 18000; i++) {
        const v = Math.round(155 + noise() * 65);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(noise() * 256, noise() * 256, kind === 'fabric' ? 2 : 1, 1);
      }
      if (kind === 'fabric') {
        ctx.fillStyle = 'rgba(50,50,50,.15)';
        for (let x = 0; x < 256; x += 4) ctx.fillRect(x, 0, 1, 256);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat);
  const bump = tex.clone(); bump.colorSpace = THREE.NoColorSpace; bump.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ color, map: tex, bumpMap: bump,
    bumpScale: kind === 'wood' ? 0.012 : 0.007,
    roughness: kind === 'wood' ? 0.48 : kind === 'fabric' ? 0.94 : 0.87,
    metalness: 0, envMapIntensity: 0.45 });
  material.userData.procedural = true; surfaces.set(key, material); return material;
}
function oval(parent, rx, ry, rz, material, x, y, z) {
  if (!geoCache.has('oval')) geoCache.set('oval', new THREE.SphereGeometry(1, 16, 12));
  const mesh = new THREE.Mesh(geoCache.get('oval'), material.isMaterial ? material : mat(material, { roughness: 0.58, metalness: 0 }));
  mesh.scale.set(rx, ry, rz); mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
// Yarim shaffof kontakt soya — SSAO emas, arzon AO imitatsiyasi.
let contactMaterial;
function contactShadow(parent, x, z, w, d, y = 0.067) {
  if (!contactMaterial) {
    const tex = canvasTex(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
      g.addColorStop(0, 'rgba(12,18,28,.30)'); g.addColorStop(.5, 'rgba(12,18,28,.16)'); g.addColorStop(1, 'rgba(12,18,28,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    contactMaterial = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    geoCache.set('contact', new THREE.PlaneGeometry(1, 1));
  }
  const mesh = new THREE.Mesh(geoCache.get('contact'), contactMaterial);
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); mesh.scale.set(w, d, 1);
  parent.add(mesh); return mesh;
}
function mug(parent, x, y, z, color = 0xf0eee8) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  cyl(g, .048, .042, .105, mat(color, { roughness: .25 }), 0, 0, 0, 12);
  cyl(g, .039, .039, .004, 0x382217, 0, .053, 0, 12);
  if (!geoCache.has('mugHandle')) geoCache.set('mugHandle', new THREE.TorusGeometry(.032, .009, 6, 12));
  const handle = new THREE.Mesh(geoCache.get('mugHandle'), mat(color, { roughness: .25 }));
  handle.position.x = .052; g.add(handle); return g;
}

function fitFont(ctx, text, maxW, size, weight = 'bold', fam = 'system-ui, sans-serif') {
  do { ctx.font = `${weight} ${size}px ${fam}`; size -= 2; } while (ctx.measureText(text).width > maxW && size > 8);
}
function screenMat(tex, intensity = 1.25) {
  return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.4 });
}
function sign(parent, text, w, h, x, y, z, ry, { bg = '#111827', fg = '#ffffff', accent = null, sub = null, glow = 0.35 } = {}) {
  const W = 1024, H = Math.round(1024 * h / w);
  const tex = canvasTex(W, H, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    if (accent) { c.fillStyle = accent; c.fillRect(0, H - Math.max(8, H * 0.06), W, Math.max(8, H * 0.06)); }
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    fitFont(c, text, W * 0.88, Math.round(H * (sub ? 0.5 : 0.62)), '900');
    c.fillText(text, W / 2, sub ? H * 0.4 : H / 2);
    if (sub) { c.globalAlpha = 0.8; fitFont(c, sub, W * 0.8, Math.round(H * 0.16), '600'); c.fillText(sub, W / 2, H * 0.74); c.globalAlpha = 1; }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat(tex, glow));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}

// Agentlar uchun umumiy geometriya keshi: animatsiya bo'g'inlari o'zgarmaydi.
function softBox(parent, w, h, d, m, x, y, z, ry = 0, shadow = true) {
  const key = `soft:${w},${h},${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.19));
  const mesh = new THREE.Mesh(geoCache.get(key), m && m.isMaterial ? m : mat(m, { roughness: 0.62, metalness: 0 }));
  mesh.position.set(x, y, z); mesh.rotation.y = ry;
  mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

// ---------------------------------------------------------------- sahna
const canvas = document.getElementById('c');
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(renderScale);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const DAY_SKY = new THREE.Color(0x9fc9ee), NIGHT_SKY = new THREE.Color(0x070b18);
scene.background = DAY_SKY.clone();
scene.fog = new THREE.Fog(DAY_SKY.clone(), 60, 160);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
camera.position.set(0, 32, 34);
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 0);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.48;
orbit.minDistance = 3; orbit.maxDistance = 90;

const hemi = new THREE.HemisphereLight(0xe3ecff, 0x40362a, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.position.set(22, 28, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(QUALITY[qualityIndex].shadow, QUALITY[qualityIndex].shadow);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 24, bottom: -24, near: 5, far: 100 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun);
// Faqat quyosh soya chizadi; to'ldiruvchi chiroq qo'shimcha shadow pass talab qilmaydi.
const rim = new THREE.DirectionalLight(0xa9d9ff, 0.65);
rim.position.set(-18, 16, -20); scene.add(rim);
let composer = null, bloom = null;
function ensureComposer() {
  if (composer) return;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.45, 1.15);
  composer.addPass(bloom);
  // Tone mapping va sRGB konversiyasi oxirida, faqat bir marta.
  composer.addPass(new OutputPass());
}


// IBL akslari: RoomEnvironment PMREM, bir marta hisoblanadi.
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnvironment = new RoomEnvironment();
const environmentTarget = pmrem.fromScene(roomEnvironment, 0.04);
scene.environment = environmentTarget.texture;
roomEnvironment.dispose(); pmrem.dispose();
// Osmon gumbazi kamera bilan birga siljiydi, fog ufqni yumshatadi.
const skyUniforms = { top: { value: new THREE.Color(0x6ba5dd) }, bottom: { value: new THREE.Color(0xdde8ed) } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: skyUniforms,
  vertexShader: 'varying vec3 vDir; void main(){vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vDir; void main(){float h=smoothstep(-0.12,0.8,normalize(vDir).y); gl_FragColor=vec4(mix(bottom,top,h),1.0); \n #include <tonemapping_fragment> \n #include <colorspace_fragment> }'
}));
sky.frustumCulled = false; scene.add(sky);
const skyDayTop = new THREE.Color(0x6ba5dd), skyDayBottom = new THREE.Color(0xdde8ed);
const skyNightTop = new THREE.Color(0x020511), skyNightBottom = new THREE.Color(0x101b30);
const streetLights = [];

// ---------------------------------------------------------------- navigatsiya to'ri (A* uchun)
const CELL = 0.5, GX0 = -20, GZ0 = -14, GW = 80, GH = 56;
const blocked = new Uint8Array(GW * GH);
const ci = (x) => Math.floor((x - GX0) / CELL), cj = (z) => Math.floor((z - GZ0) / CELL);
function blockRect(x1, z1, x2, z2, pad = 0.22) {
  const a = Math.min(x1, x2) - pad, b = Math.max(x1, x2) + pad, c = Math.min(z1, z2) - pad, d = Math.max(z1, z2) + pad;
  for (let i = Math.max(0, ci(a)); i <= Math.min(GW - 1, ci(b)); i++)
    for (let j = Math.max(0, cj(c)); j <= Math.min(GH - 1, cj(d)); j++) {
      const cx = GX0 + (i + 0.5) * CELL, cz = GZ0 + (j + 0.5) * CELL;
      if (cx >= a && cx <= b && cz >= c && cz <= d) blocked[j * GW + i] = 1;
    }
}
const _box3 = new THREE.Box3();
function blockObj(obj, pad) { obj.updateMatrixWorld(true); _box3.setFromObject(obj); blockRect(_box3.min.x, _box3.min.z, _box3.max.x, _box3.max.z, pad); }
function isBlocked(x, z) {
  const i = ci(x), j = cj(z);
  if (i < 0 || j < 0 || i >= GW || j >= GH) return true;
  return blocked[j * GW + i] === 1;
}
function nearestFree(i, j) {
  for (let r = 0; r < 8; r++)
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < GW && b < GH && !blocked[b * GW + a]) return [a, b];
    }
  return null;
}
function los(a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.2);
  for (let k = 1; k < n; k++) { const t = k / n; if (isBlocked(lerp(a.x, b.x, t), lerp(a.z, b.z, t))) return false; }
  return true;
}
function findPath(sx, sz, tx, tz) {
  const s = nearestFree(ci(sx), cj(sz)), t = nearestFree(ci(tx), cj(tz));
  if (!s || !t) return null;
  const start = s[1] * GW + s[0], goal = t[1] * GW + t[0];
  const g = new Float32Array(GW * GH).fill(Infinity), came = new Int32Array(GW * GH).fill(-1), closed = new Uint8Array(GW * GH);
  const hf = (n) => { const dx = Math.abs(n % GW - t[0]), dz = Math.abs(((n / GW) | 0) - t[1]); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
  const heap = [];
  const push = (f, n) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  g[start] = 0; push(hf(start), start);
  while (heap.length) {
    const cur = pop()[1];
    if (cur === goal) break;
    if (closed[cur]) continue; closed[cur] = 1;
    const cx = cur % GW, cz = (cur / GW) | 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
      const n = nz * GW + nx;
      if (blocked[n] || closed[n]) continue;
      if (dx && dz && (blocked[cz * GW + nx] || blocked[nz * GW + cx])) continue;
      const ng = g[cur] + (dx && dz ? 1.4142 : 1);
      if (ng < g[n]) { g[n] = ng; came[n] = cur; push(ng + hf(n), n); }
    }
  }
  if (goal !== start && came[goal] === -1) return null;
  const cells = []; for (let n = goal; n !== -1; n = came[n]) { cells.push({ x: GX0 + (n % GW + 0.5) * CELL, z: GZ0 + (((n / GW) | 0) + 0.5) * CELL }); if (n === start) break; }
  cells.reverse();
  // yo'lni silliqlash (ko'rinish chizig'i bo'yicha)
  const out = [cells[0]]; let i = 0;
  while (i < cells.length - 1) { let j = cells.length - 1; while (j > i + 1 && !los(cells[i], cells[j])) j--; out.push(cells[j]); i = j; }
  out.push({ x: tx, z: tz });
  return out;
}

// ---------------------------------------------------------------- xonalar
const ROOMS = {
  studio:   { name: 'STUDIYA',           sub: 'Video va ovoz yozish',     x1: -20, z1: 6,   x2: -7, z2: 14, floor: 0x3a3f47 },
  lobby:    { name: 'QABULXONA',         sub: 'Xush kelibsiz',            x1: -7,  z1: 6,   x2: 7,  z2: 14, floor: 0xd8d3cb },
  lounge:   { name: 'DAM OLISH ZONASI',  sub: 'Kofe, tennis, suhbat',     x1: 7,   z1: 6,   x2: 20, z2: 14, floor: 0xa47750 },
  corridor: { name: "YO'LAK",            sub: '',                         x1: -20, z1: 2,   x2: 20, z2: 6,  floor: 0x8e9196 },
  hq:       { name: 'BOSHQARUV MARKAZI', sub: 'Bosh agent shu yerda',     x1: -20, z1: -14, x2: -8, z2: 2,  floor: 0x29303d },
  work:     { name: 'ISH ZALI',          sub: 'Agentlar kontent yaratmoqda', x1: -8, z1: -14, x2: 10, z2: 2, floor: 0xc6a57b },
  meeting:  { name: 'MAJLISLAR XONASI',  sub: 'Reja va strategiya',       x1: 10,  z1: -14, x2: 20, z2: -5, floor: 0x93765b },
  server:   { name: 'SERVER XONASI',     sub: 'Hammasi shu yerda ishlaydi', x1: 10, z1: -5, x2: 20, z2: 2,  floor: 0xb8c1cb },
};
function roomAt(x, z) {
  for (const k in ROOMS) { const r = ROOMS[k]; if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r; }
  return null;
}

const office = new THREE.Group(); scene.add(office);

// tashqi muhit
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0x5f7d47, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
  box(scene, 400, 0.02, 7, 0x2f3236, 0, -0.005, 25, 0, false);            // yo'l
  for (let x = -60; x < 60; x += 6) box(scene, 2.4, 0.03, 0.18, 0xe5e7eb, x, 0.005, 25, 0, false);
  box(scene, 3.2, 0.03, 7.5, 0xbfbab1, 0, 0, 17.8, 0, false);              // kirish yo'lakchasi
  box(scene, 44, 0.04, 2, 0xbfbab1, 0, 0, 15, 0, false);
  // daraxtlar
  const trees = [[-26, -10], [-27, 2], [-25, 12], [26, -8], [27, 4], [25, 13], [-12, 19], [12, 19], [-20, 19], [20, 19], [-8, -19], [6, -20], [18, -18], [-22, -18]];
  for (const [x, z] of trees) {
    const s = rnd(0.8, 1.3);
    cyl(scene, 0.15 * s, 0.22 * s, 1.6 * s, 0x6b4a2f, x, 0.8 * s, z, 8);
    sphere(scene, 1.3 * s, 0x3f6f35, x, 2.4 * s, z);
    sphere(scene, 0.9 * s, 0x4b8040, x + 0.4, 3.2 * s, z - 0.2);
  }
  // ko'cha chiroqlari
  window.streetLamps = [];
  for (const x of [-14, -4, 4, 14]) {
    cyl(scene, 0.05, 0.07, 4, 0x374151, x, 2, 21.2, 8);
    const bulb = box(scene, 0.5, 0.12, 0.3, mat(0xfff3c4, { emissive: 0xffd27a, emissiveIntensity: 0 }), x, 4, 21.0);
    streetLamps.push(bulb);
    const light = new THREE.PointLight(0xffcf87, 0, 11, 2);
    light.position.set(x, 3.8, 21); scene.add(light); streetLights.push(light);
  }
}

// pollar
for (const k in ROOMS) {
  const r = ROOMS[k];
  box(office, r.x2 - r.x1, 0.06, r.z2 - r.z1, surface(['work', 'lounge', 'meeting'].includes(k) ? 'wood' : 'concrete', r.floor, 4), (r.x1 + r.x2) / 2, 0.03, (r.z1 + r.z2) / 2, 0, false);
}
box(office, 40.6, 0.3, 28.6, 0x9a958c, 0, -0.14, 0, 0, false); // poydevor

// ship (faqat ichida yurganda ko'rinadi)
const ceiling = new THREE.Group(); office.add(ceiling);
{
  const c = new THREE.Mesh(new THREE.PlaneGeometry(40, 28), mat(0xf1efea, { side: THREE.DoubleSide }));
  c.rotation.x = Math.PI / 2; c.position.y = 3.0; ceiling.add(c);
  const panel = mat(0xffffff, { emissive: 0xfff6e0, emissiveIntensity: 1.2 });
  for (let x = -17; x <= 17; x += 4.25) for (let z = -11; z <= 12; z += 4.5) box(ceiling, 1.4, 0.03, 0.6, panel, x, 2.98, z, 0, false);
  ceiling.traverse((o) => { o.castShadow = false; });
  ceiling.visible = false;
}

// ---------------------------------------------------------------- devorlar
const WALL_H = 3.0;
const wallMat = surface('concrete', 0xefebe5, 2);
const outerMat = surface('concrete', 0xd9d2c6, 2);
const glassMat = new THREE.MeshStandardMaterial({ color: 0xa9d4ef, transparent: true, opacity: 0.18, roughness: 0.08, metalness: 0.0, envMapIntensity: 0.85, depthWrite: false });
const frameMat = mat(0x2b2f36, { metalness: 0.8, roughness: 0.28 });
function wall(x1, z1, x2, z2, gaps = [], type = 'solid') {
  const horiz = z1 === z2, a0 = horiz ? Math.min(x1, x2) : Math.min(z1, z2), a1 = horiz ? Math.max(x1, x2) : Math.max(z1, z2);
  const segs = []; let s = a0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > s) segs.push([s, g0]); s = Math.max(s, g1); }
  if (s < a1) segs.push([s, a1]);
  const T = 0.2;
  const put = (a, b, y0, y1, m, shadow = true) => {
    const len = b - a, mid = (a + b) / 2, h = y1 - y0;
    if (horiz) box(office, len, h, T, m, mid, y0 + h / 2, z1, 0, shadow);
    else box(office, T, h, len, m, x1, y0 + h / 2, mid, 0, shadow);
  };
  for (const [a, b] of segs) {
    if (type === 'solid') put(a, b, 0, WALL_H, wallMat);
    else if (type === 'window') { put(a, b, 0, 0.9, outerMat); put(a, b, 2.5, WALL_H, outerMat); put(a, b, 0.9, 2.5, glassMat, false); put(a, b, 0.88, 0.94, frameMat); }
    else if (type === 'glass') { put(a, b, 0, 0.08, frameMat); put(a, b, 2.92, WALL_H, frameMat); put(a, b, 0.08, 2.92, glassMat, false); put(a, b, 1.05, 1.1, frameMat); }
    if (horiz) blockRect(a, z1, b, z1); else blockRect(x1, a, x1, b);
  }
  // eshik ustidagi to'sin
  for (const [g0, g1] of gaps) { if (horiz) box(office, g1 - g0, 0.6, T, type === 'glass' ? frameMat : (type === 'window' ? outerMat : wallMat), (g0 + g1) / 2, 2.7, z1); else box(office, T, 0.6, g1 - g0, wallMat, x1, 2.7, (g0 + g1) / 2); }
  // deraza ramalari
  if (type !== 'solid') for (const [a, b] of segs) for (let p = a + 2; p < b - 0.5; p += 2) {
    if (horiz) box(office, 0.06, type === 'glass' ? WALL_H : 1.6, 0.24, frameMat, p, type === 'glass' ? WALL_H / 2 : 1.7, z1);
    else box(office, 0.24, 1.6, 0.06, frameMat, x1, 1.7, p);
  }
}
wall(-20, -14, 20, -14, [], 'window');
wall(-20, 14, 20, 14, [[-1.6, 1.6]], 'window');
wall(-20, -14, -20, 14, [], 'window');
wall(20, -14, 20, 14, [], 'window');
wall(-20, 6, 20, 6, [[-14.5, -12.5], [-6, -4.2], [4.2, 6], [12.5, 14.5]]);
wall(-20, 2, -8, 2, [[-15, -13]]);
wall(-8, 2, 10, 2, [[-1.5, 1.5]], 'glass');
wall(10, 2, 20, 2, [[14, 16]]);
wall(-7, 6, -7, 14);
wall(7, 6, 7, 14);
wall(-8, -14, -8, 2, [[-6, -4]]);
wall(10, -14, 10, -5, [[-9, -7.5]], 'glass');
wall(10, -5, 10, 2);
wall(10, -5, 20, -5);
// yurish rejimida faqat devorlar to'sadi (jihozlar orasidan yurish erkinroq)
const wallGrid = new Uint8Array(blocked);
// kirish eshigi (shisha, ochiq)
box(office, 1.5, 2.6, 0.06, glassMat, -2.3, 1.3, 14.6, -0.6, false);
box(office, 1.5, 2.6, 0.06, glassMat, 2.3, 1.3, 14.6, 0.6, false);
sign(office, OFFICE_NAME, 5, 0.9, 0, 3.55, 14.15, 0, { bg: '#0f172a', fg: '#ffffff', accent: '#38bdf8' });

// ---------------------------------------------------------------- ekran teksturalari
const SCREENS = {};
const CODE_LINES = ['const post = await ai.write(brief);', 'if (views > 10000) boost();', 'export function render() {', '  return <Reels video={v} />;', '}', 'await upload(video, "shorts");', 'for (const t of trends) score(t);', 'git commit -m "yangi muqova"', 'npm run build ✔', 'schedule("09:00", publish);', 'const hook = pick(hooks);', 'subtitles.sync(audio);'];
const CODE_COLORS = ['#7dd3fc', '#c4b5fd', '#86efac', '#fcd34d', '#f9a8d4', '#e5e7eb'];
function drawCodeScreen(c, w, h, lines) {
  c.fillStyle = '#0d1117'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#161b22'; c.fillRect(0, 0, w, 16); c.fillStyle = '#f87171'; c.fillRect(6, 5, 6, 6); c.fillStyle = '#fbbf24'; c.fillRect(16, 5, 6, 6); c.fillStyle = '#4ade80'; c.fillRect(26, 5, 6, 6);
  c.font = '11px Consolas, monospace';
  lines.forEach((l, i) => { c.fillStyle = '#4b5563'; c.fillText(String(i + 1).padStart(2), 4, 30 + i * 13); c.fillStyle = l.c; c.fillText(l.t, 24, 30 + i * 13); });
}
SCREENS.codeLines = Array.from({ length: 10 }, () => ({ t: pick(CODE_LINES), c: pick(CODE_COLORS) }));
SCREENS.code = canvasTex(256, 160, (c, w, h) => drawCodeScreen(c, w, h, SCREENS.codeLines));
SCREENS.design = canvasTex(256, 160, (c, w, h) => {
  c.fillStyle = '#1f2330'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b3040'; c.fillRect(0, 0, 40, h); c.fillRect(w - 50, 0, 50, h);
  c.fillStyle = '#ffffff'; c.fillRect(60, 18, 140, 124);
  const g = c.createLinearGradient(60, 18, 200, 142); g.addColorStop(0, '#f97316'); g.addColorStop(1, '#ec4899'); c.fillStyle = g; c.fillRect(68, 26, 124, 70);
  c.fillStyle = '#111'; c.font = 'bold 15px sans-serif'; c.fillText('YANGI VIDEO', 76, 118); c.fillStyle = '#38bdf8'; c.fillRect(76, 126, 60, 8);
  ['#f97316', '#ec4899', '#38bdf8', '#22c55e', '#facc15'].forEach((col, i) => { c.fillStyle = col; c.fillRect(w - 40, 14 + i * 22, 30, 16); });
});
SCREENS.chart = canvasTex(256, 160, (c, w, h) => {
  c.fillStyle = '#0f172a'; c.fillRect(0, 0, w, h); c.fillStyle = '#94a3b8'; c.font = 'bold 11px sans-serif'; c.fillText("KO'RISHLAR · 7 KUN", 10, 16);
  const v = [20, 32, 28, 45, 52, 70, 96]; v.forEach((n, i) => { c.fillStyle = i === 6 ? '#22c55e' : '#38bdf8'; c.fillRect(14 + i * 33, h - 14 - n * 1.2, 22, n * 1.2); });
});
SCREENS.video = canvasTex(256, 160, (c, w, h) => {
  c.fillStyle = '#111318'; c.fillRect(0, 0, w, h);
  const g = c.createLinearGradient(0, 0, 160, 90); g.addColorStop(0, '#334155'); g.addColorStop(1, '#0ea5e9'); c.fillStyle = g; c.fillRect(48, 8, 160, 90);
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(120, 38); c.lineTo(140, 53); c.lineTo(120, 68); c.fill();
  const cols = ['#a855f7', '#f97316', '#22c55e', '#eab308']; for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) { c.fillStyle = cols[r]; c.fillRect(8 + k * 48 + r * 6, 106 + r * 12, 40 - r * 4, 9); }
  c.fillStyle = '#ef4444'; c.fillRect(130, 102, 2, 56);
});
SCREENS.doc = canvasTex(256, 160, (c, w, h) => {
  c.fillStyle = '#e5e7eb'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(40, 8, 176, 152);
  c.fillStyle = '#111827'; c.font = 'bold 13px sans-serif'; c.fillText('Reels ssenariysi #12', 50, 28);
  for (let i = 0; i < 9; i++) { c.fillStyle = i === 2 ? '#f97316' : '#9ca3af'; c.fillRect(50, 40 + i * 12, rnd(80, 150), 5); }
});
SCREENS.social = canvasTex(256, 160, (c, w, h) => {
  c.fillStyle = '#fafafa'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 12px sans-serif'; c.fillText('@' + OFFICE_NAME.toLowerCase().replace(/\s+/g, '_'), 64, 18);
  const cols = ['#f97316', '#ec4899', '#38bdf8', '#22c55e', '#a855f7', '#eab308', '#ef4444', '#14b8a6', '#6366f1'];
  for (let i = 0; i < 9; i++) { c.fillStyle = cols[i]; c.fillRect(64 + (i % 3) * 44, 28 + Math.floor(i / 3) * 44, 41, 41); }
});
SCREENS.off = canvasTex(64, 40, (c, w, h) => { c.fillStyle = '#0b0d12'; c.fillRect(0, 0, w, h); });

// ---------------------------------------------------------------- jihozlar
const spots = { coffee: [], lounge: [], meeting: [], server: [], visitHQ: [], studioCam: [], whiteboard: [] };
const mkSpot = (x, z, face, pose = 'stand', seatY = 0.48) => ({ x, z, face, pose, seatY, taken: null });

function officeChair(parent, x, z, ry, color = 0x1f2937) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
  softBox(g, 0.5, 0.08, 0.5, surface('fabric', color), 0, 0.46, 0);
  softBox(g, 0.48, 0.55, 0.07, surface('fabric', color), 0, 0.8, -0.24);
  cyl(g, 0.03, 0.03, 0.36, 0x6b7280, 0, 0.26, 0, 8);
  softBox(g, 0.5, 0.04, 0.08, 0x374151, 0, 0.06, 0); softBox(g, 0.08, 0.04, 0.5, 0x374151, 0, 0.06, 0);
  return g;
}
// Stol: guruh boshlang'ichi = stul o'rni; odam +z tomonga (monitorga) qaraydi
function desk(x, z, ry, screen = SCREENS.code, { wide = false, color = 0xe9e4dc, chair = 0x1f2937, monitors = 1 } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; office.add(g);
  const W = wide ? 2.2 : 1.5;
  const top = softBox(g, W, 0.05, 0.75, surface('wood', color), 0, 0.74, 0.65);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.05, 0.72, 0.05, mat(0x9ca3af, { metalness: .8, roughness: .3 }), sx * (W / 2 - 0.06), 0.36, 0.65 + sz * 0.31);
  box(g, W - 0.1, 0.4, 0.03, color, 0, 0.5, 1.0);
  const offs = monitors === 2 ? [-0.36, 0.36] : [0];
  for (const ox of offs) {
    box(g, 0.64, 0.4, 0.03, 0x111318, ox, 1.08, 0.93);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36), screenMat(screen));
    scr.position.set(ox, 1.08, 0.914); scr.rotation.y = Math.PI; g.add(scr);
    box(g, 0.05, 0.26, 0.05, 0x2d3139, ox, 0.88, 0.95); box(g, 0.22, 0.02, 0.16, 0x2d3139, ox, 0.77, 0.95);
  }
  box(g, 0.44, 0.02, 0.14, 0x2a2d33, 0, 0.775, 0.48); box(g, 0.06, 0.02, 0.1, 0x2a2d33, 0.32, 0.775, 0.5);
  mug(g, -W / 2 + 0.18, 0.827, 0.6, 0xf0eee8);
  const notebook = softBox(g, 0.22, 0.024, 0.29, 0x334155, W / 2 - 0.19, 0.785, 0.62, 0.12);
  box(notebook, .19, .005, .26, 0xfaf6eb, 0, .014, 0, 0, false);
  box(g, .014, .014, .19, 0x1e293b, W / 2 - .16, .813, .62, .16, false);
  contactShadow(g, 0, .55, W + .5, 1.3);
  if (Math.random() < 0.3) { cyl(g, 0.06, 0.05, 0.1, 0xb45309, W / 2 - 0.18, 0.82, 0.8, 8); sphere(g, 0.1, 0x3f8f45, W / 2 - 0.18, 0.95, 0.8, 0); }
  officeChair(g, 0, 0, 0, chair);
  blockObj(top);
  return mkSpot(x, z, ry, 'sit');
}
function plant(x, z, s = 1, parent = office) {
  cyl(parent, 0.22 * s, 0.17 * s, 0.45 * s, 0xd6cfc4, x, 0.225 * s, z, 12);
  cyl(parent, .018 * s, .024 * s, .65 * s, 0x41683b, x, .73 * s, z, 6);
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4, radius = .16 * s;
    const leaf = oval(parent, .10 * s, .30 * s, .025 * s, i % 2 ? 0x4d9446 : 0x3f7f3a,
      x + Math.sin(angle) * radius, (.7 + i * .055) * s, z + Math.cos(angle) * radius);
    leaf.rotation.set(Math.cos(angle) * .6, angle, Math.sin(angle) * .6);
  }
  blockRect(x - 0.25 * s, z - 0.25 * s, x + 0.25 * s, z + 0.25 * s, 0.1);
}
function sofa(x, z, ry, len = 2.2, color = 0x475569) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; office.add(g);
  const base = softBox(g, len, 0.42, 0.85, surface('fabric', color), 0, 0.21, 0);
  softBox(g, len, 0.5, 0.2, surface('fabric', color), 0, 0.6, -0.33);
  softBox(g, 0.18, 0.62, 0.85, surface('fabric', color), -len / 2 + 0.09, 0.31, 0); softBox(g, 0.18, 0.62, 0.85, surface('fabric', color), len / 2 - 0.09, 0.31, 0);
  for (let i = 0; i < Math.round(len / 0.75); i++) softBox(g, 0.6, 0.08, 0.6, mat(color, { roughness: 1 }), -len / 2 + 0.45 + i * 0.72, 0.46, 0.05);
  contactShadow(g, 0, 0, len + .5, 1.2);
  blockObj(base, 0.05);
  return g;
}
function shelf(x, z, ry, w = 2) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; office.add(g);
  const frame = box(g, w, 2.0, 0.35, surface('wood', 0x9c7853), 0, 1.0, 0);
  for (let y = 0.3; y < 2; y += 0.45) for (let bx = -w / 2 + 0.15; bx < w / 2 - 0.1; bx += rnd(0.08, 0.14)) box(g, 0.07, rnd(0.25, 0.36), 0.25, pick([0xb91c1c, 0x1d4ed8, 0x15803d, 0xca8a04, 0x6b21a8, 0xf3f4f6]), bx, y + 0.16, 0.02);
  blockObj(frame, 0.1);
}

// --- QABULXONA
const receptionSpot = mkSpot(0, 9.8, 0, 'sit');
{
  const counter = box(office, 3.0, 1.05, 0.25, 0xf5f5f4, 0, 0.525, 10.75);
  box(office, 3.3, 0.05, 0.55, 0x1f2937, 0, 1.08, 10.7);
  box(office, 0.25, 1.05, 1.3, 0xf5f5f4, -1.55, 0.525, 10.1); box(office, 0.25, 1.05, 1.3, 0xf5f5f4, 1.55, 0.525, 10.1);
  box(office, 2.8, 0.05, 0.5, 0xd6cfc4, 0, 0.74, 10.35);
  box(office, 0.6, 0.38, 0.03, 0x111318, 0.4, 1.0, 10.55);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.34), screenMat(SCREENS.social)); scr.position.set(0.4, 1.0, 10.53); scr.rotation.y = Math.PI; office.add(scr);
  box(office, 0.4, 0.02, 0.13, 0x2a2d33, 0.3, 0.775, 10.2);
  sign(office, OFFICE_NAME, 2.6, 0.5, 0, 0.62, 10.885, 0, { bg: '#0f172a', accent: '#38bdf8' });
  sign(office, 'QABUL', 0.7, 0.2, -1.0, 1.22, 10.72, 0, { bg: '#f97316', fg: '#111827', glow: 0.5 });
  officeChair(office, 0, 9.8, 0, 0x0f172a);
  blockRect(-1.7, 10.0, 1.7, 10.9); blockRect(-1.7, 9.4, -1.4, 10.9); blockRect(1.4, 9.4, 1.7, 10.9);
  sign(office, OFFICE_NAME, 5.4, 1.2, 0, 1.9, 6.12, 0, { bg: '#0f172a', accent: '#f97316', sub: 'Har kuni yangi kontent · 24/7 AI jamoa' });
  sofa(-5.6, 11, Math.PI / 2, 2.4, 0x334155); sofa(5.6, 11, -Math.PI / 2, 2.4, 0x334155);
  box(office, 0.6, 0.4, 1.0, 0x7c5a3c, -4.5, 0.2, 11); box(office, 0.6, 0.4, 1.0, 0x7c5a3c, 4.5, 0.2, 11);
  blockRect(-4.8, 10.5, -4.2, 11.5); blockRect(4.2, 10.5, 4.8, 11.5);
  box(office, 4, 0.01, 2.6, 0x1e3a5f, 0, 0.065, 12.4, 0, false);
  for (const [x, z] of [[-6.4, 13.4], [6.4, 13.4], [-6.4, 6.6], [6.4, 6.6]]) plant(x, z, 1.1);
}

// --- STUDIYA
const studioHost = mkSpot(-17.7, 10, Math.PI / 2, 'sit', 0.62);
let onAirMat;
{
  box(office, 0.05, 2.8, 6, mat(0x22c55e, { roughness: 1 }), -19.85, 1.45, 10, 0, false);
  box(office, 2.2, 0.02, 6, mat(0x22c55e, { roughness: 1 }), -18.8, 0.07, 10, 0, false);
  // stul
  cyl(office, 0.22, 0.22, 0.06, 0x111827, -17.7, 0.62, 10); cyl(office, 0.03, 0.03, 0.6, 0x9ca3af, -17.7, 0.31, 10, 8);
  // kameralar
  const camera3d = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; office.add(g);
    for (let k = 0; k < 3; k++) { const leg = cyl(g, 0.015, 0.015, 1.4, 0x111827, Math.sin(k * 2.09) * 0.25, 0.68, Math.cos(k * 2.09) * 0.25, 6); leg.rotation.set(Math.cos(k * 2.09) * 0.18, 0, -Math.sin(k * 2.09) * 0.18); }
    box(g, 0.22, 0.18, 0.34, 0x111318, 0, 1.45, 0); const lens = cyl(g, 0.06, 0.07, 0.14, 0x1f2937, 0, 1.45, 0.22, 12); lens.rotation.x = Math.PI / 2;
    const rec = box(g, 0.03, 0.03, 0.01, mat(0xff0000, { emissive: 0xff0000, emissiveIntensity: 2 }), 0.07, 1.56, -0.17, 0, false);
    blockRect(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0.05); return rec;
  };
  camera3d(-14, 9.1, -Math.PI / 2 - 0.15); camera3d(-14, 11.0, -Math.PI / 2 + 0.15);
  // yorug'lik qutilari
  for (const [x, z, ry] of [[-16, 7.4, -2.3], [-16, 12.6, -0.85]]) {
    cyl(office, 0.02, 0.02, 1.9, 0x111827, x, 0.95, z, 6);
    box(office, 0.7, 0.7, 0.12, mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 }), x, 2.0, z, ry);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 32), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1.5 }));
  ring.position.set(-15.2, 1.55, 10); ring.rotation.y = Math.PI / 2; office.add(ring); cyl(office, 0.015, 0.015, 1.3, 0x111827, -15.2, 0.65, 10, 6);
  spots.studioCam.push(mkSpot(-13.3, 10.05, -Math.PI / 2));
  onAirMat = mat(0x3f0d0d, { emissive: 0xff1a1a, emissiveIntensity: 0.1 });
  const onAir = sign(office, 'ON AIR', 1.2, 0.34, -10, 2.45, 6.12, 0, { bg: '#7f1d1d', fg: '#ffffff', glow: 0.2 });
  window.onAirSign = onAir;
  // akustik panellar
  for (let i = 0; i < 5; i++) box(office, 0.6, 0.6, 0.05, i % 2 ? 0x1e293b : 0x334155, -18.6 + i * 0.75, 1.9, 13.86);
  shelf(-8, 7.2, -Math.PI / 2, 1.6);
  plant(-19.4, 6.6, 1);
}
const studioDesk = desk(-10.0, 12.35, 0, SCREENS.video, { monitors: 2, chair: 0x111827 });

// --- DAM OLISH ZONASI
{
  const counter = box(office, 0.7, 0.92, 5.2, 0xf3f4f6, 19.45, 0.46, 9.6);
  box(office, 0.75, 0.05, 5.3, 0x1f2937, 19.45, 0.94, 9.6);
  box(office, 0.4, 0.5, 0.4, 0x111827, 19.5, 1.22, 8.0); box(office, 0.1, 0.06, 0.1, 0x9ca3af, 19.35, 1.08, 8.0); // kofe mashinasi
  cyl(office, 0.05, 0.04, 0.1, 0xffffff, 19.3, 1.02, 8.3, 10); cyl(office, 0.05, 0.04, 0.1, 0xffffff, 19.3, 1.02, 9.9, 10);
  box(office, 0.5, 0.25, 0.4, 0xd1d5db, 19.5, 1.09, 10.6); // mikroto'lqinli pech
  const fridge = box(office, 0.8, 2.0, 0.8, 0xd1d5db, 19.4, 1.0, 13.3); blockObj(fridge, 0.05);
  blockObj(counter, 0.1);
  for (const z of [8.0, 9.6, 11.2]) spots.coffee.push(mkSpot(18.45, z, Math.PI / 2));
  // stol tennisi
  const tt = box(office, 2.74, 0.05, 1.52, 0x1d4ed8, 12.5, 0.76, 10.4);
  box(office, 2.74, 0.01, 0.03, 0xffffff, 12.5, 0.79, 10.4, 0, false); box(office, 0.03, 0.15, 1.6, 0xf3f4f6, 12.5, 0.86, 10.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(office, 0.06, 0.74, 0.06, 0x111827, 12.5 + sx * 1.2, 0.37, 10.4 + sz * 0.6);
  blockObj(tt, 0.15);
  spots.lounge.push(mkSpot(10.4, 10.4, Math.PI / 2), mkSpot(14.6, 10.4, -Math.PI / 2));
  // divan
  sofa(7.65, 10.4, Math.PI / 2, 2.6, 0xb45309);
  spots.lounge.push(mkSpot(8.05, 9.75, Math.PI / 2, 'sit', 0.5), mkSpot(8.05, 11.05, Math.PI / 2, 'sit', 0.5));
  // puflar
  for (const [x, z] of [[15.6, 13.1], [17.0, 12.6]]) {
    const b = sphere(office, 0.42, pick([0xef4444, 0x8b5cf6, 0x14b8a6]), x, 0.25, z, 2); b.scale.y = 0.7;
    spots.lounge.push(mkSpot(x, z, Math.PI, 'sit', 0.32));
  }
  // televizor
  box(office, 1.8, 0.5, 0.45, 0x3f3f46, 11.5, 0.25, 13.55);
  box(office, 1.7, 0.98, 0.06, 0x0b0b0e, 11.5, 1.2, 13.65);
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), screenMat(SCREENS.chart)); tv.position.set(11.5, 1.2, 13.615); tv.rotation.y = Math.PI; office.add(tv);
  blockRect(10.6, 13.3, 12.4, 13.8);
  for (const [x, z] of [[7.6, 6.6], [7.6, 13.4], [19.4, 6.6]]) plant(x, z, 1.1);
  sign(office, 'KOFE', 1.2, 0.35, 19.88, 1.9, 9.6, -Math.PI / 2, { bg: '#78350f', fg: '#fef3c7', glow: 0.4 });
}

// --- BOSHQARUV MARKAZI
let hqTex, holo;
const hqDesks = [];
{
  hqTex = canvasTex(1536, 512);
  box(office, 9.4, 2.0, 0.08, 0x0a0a0a, -14, 1.9, -13.82);
  const wallScr = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1.84), screenMat(hqTex, 1.0)); wallScr.position.set(-14, 1.9, -13.77); office.add(wallScr);
  hqDesks.push(desk(-17.6, -8.0, Math.PI, SCREENS.chart, { monitors: 2, color: 0x374151, chair: 0x0f172a }));
  hqDesks.push(desk(-14.0, -8.6, Math.PI, SCREENS.code, { monitors: 2, color: 0x374151, chair: 0x0f172a }));
  hqDesks.push(desk(-10.4, -8.0, Math.PI, SCREENS.chart, { monitors: 2, color: 0x374151, chair: 0x0f172a }));
  hqDesks.push(desk(-14.0, -3.2, Math.PI, SCREENS.social, { wide: true, monitors: 2, color: 0x7c5a3c, chair: 0x7f1d1d }));
  // golografik stol
  cyl(office, 0.6, 0.5, 0.8, 0x1f2937, -14, 0.4, -5.9, 24);
  cyl(office, 0.55, 0.55, 0.03, mat(0x0ea5e9, { emissive: 0x0ea5e9, emissiveIntensity: 1.5 }), -14, 0.81, -5.9, 24);
  holo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true }));
  holo.position.set(-14, 1.35, -5.9); office.add(holo);
  blockRect(-14.6, -6.5, -13.4, -5.3, 0.1);
  spots.visitHQ.push(mkSpot(-12.3, -1.0, Math.PI), mkSpot(-15.7, -1.0, Math.PI), mkSpot(-12.8, -5.9, -Math.PI / 2), mkSpot(-15.2, -5.9, Math.PI / 2));
  shelf(-19.75, -2.5, Math.PI / 2, 2.4);
  for (const [x, z] of [[-19.4, -13.4], [-8.6, -13.4], [-19.4, 1.4], [-8.6, 1.4]]) plant(x, z, 0.9);
}

// --- ISH ZALI
const workDesks = [];
{
  const screens = [SCREENS.code, SCREENS.design, SCREENS.doc, SCREENS.video, SCREENS.chart, SCREENS.social];
  for (const cz of [-10.5, -4.5]) for (const cx of [-4, 1, 6]) {
    for (const px of [cx - 0.78, cx + 0.78]) {
      workDesks.push(desk(px, cz + 1.05, Math.PI, pick(screens)));
      workDesks.push(desk(px, cz - 1.05, 0, pick(screens)));
    }
    box(office, 3.1, 0.35, 0.04, 0x64748b, cx, 1.12, cz); // ajratgich
  }
  // doska (kanban)
  const kanban = canvasTex(1024, 480, (c, w, h) => {
    c.fillStyle = '#f8fafc'; c.fillRect(0, 0, w, h);
    const cols = [['REJADA', '#64748b'], ['JARAYONDA', '#f97316'], ['TAYYOR', '#22c55e']];
    cols.forEach(([t, col], i) => {
      c.fillStyle = col; c.font = 'bold 34px sans-serif'; c.fillText(t, 30 + i * 340, 50);
      for (let k = 0; k < 4 - (i === 2 ? 0 : i); k++) { c.fillStyle = pick(['#fde68a', '#bfdbfe', '#fbcfe8', '#bbf7d0']); c.fillRect(30 + i * 340 + (k % 2) * 150, 80 + Math.floor(k / 2) * 150, 135, 125); c.fillStyle = '#334155'; c.font = '22px sans-serif'; c.fillText(pick(['Reels #14', 'Thumbnail', 'Podkast', 'Shorts x3', 'Hamkor', 'Trend', 'Story', 'Blog']), 42 + i * 340 + (k % 2) * 150, 120 + Math.floor(k / 2) * 150); }
    });
  });
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.5), new THREE.MeshStandardMaterial({ map: kanban, roughness: 0.6 }));
  wb.position.set(9.87, 1.55, -1.6); wb.rotation.y = -Math.PI / 2; office.add(wb);
  box(office, 0.04, 1.6, 3.3, 0x9ca3af, 9.88, 1.55, -1.6);
  spots.whiteboard.push(mkSpot(8.7, -2.2, Math.PI / 2), mkSpot(8.7, -0.9, Math.PI / 2));
  shelf(-7.78, -12.0, Math.PI / 2, 2.2);
  shelf(-7.78, -9.0, Math.PI / 2, 2.2);
  for (const [x, z] of [[9.4, -13.4], [-7.4, 1.4], [9.4, 1.4], [-7.4, -2.4], [3.5, -13.4], [-1.5, -13.4]]) plant(x, z, 1.0);
  sign(office, "BUGUNGI MAQSAD: 3 TA VIDEO", 4.2, 0.45, 1, 2.55, -13.87, 0, { bg: '#0f172a', fg: '#fde68a', glow: 0.5 });
}

// --- MAJLISLAR XONASI
{
  const table = box(office, 5.0, 0.07, 1.8, 0x5b4636, 15, 0.75, -9.5);
  box(office, 0.3, 0.72, 1.2, 0x3f3128, 13.2, 0.36, -9.5); box(office, 0.3, 0.72, 1.2, 0x3f3128, 16.8, 0.36, -9.5);
  blockObj(table, 0.12);
  for (const x of [13.1, 14.4, 15.7, 17.0]) {
    officeChair(office, x, -10.85, 0, 0x334155); spots.meeting.push(mkSpot(x, -10.85, 0, 'sit'));
    officeChair(office, x, -8.15, Math.PI, 0x334155); spots.meeting.push(mkSpot(x, -8.15, Math.PI, 'sit'));
  }
  officeChair(office, 18.2, -9.5, -Math.PI / 2, 0x7f1d1d); spots.meeting.push(mkSpot(18.2, -9.5, -Math.PI / 2, 'sit'));
  box(office, 0.06, 1.3, 2.3, 0x0b0b0e, 19.86, 1.6, -9.5);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), screenMat(SCREENS.chart)); s.position.set(19.82, 1.6, -9.5); s.rotation.y = -Math.PI / 2; office.add(s);
  for (const [x, z] of [[10.6, -13.4], [19.4, -13.4], [19.4, -5.6]]) plant(x, z, 1);
}

// --- SERVER XONASI
let leds;
{
  const racks = [];
  for (let i = 0; i < 9; i++) racks.push([11.0 + i * 0.85, -4.25, 1]);
  for (const x of [11.0, 11.85, 12.7, 17.3, 18.15, 19.0]) racks.push([x, -1.45, -1]);
  const N = racks.length * 18;
  leds = new THREE.InstancedMesh(boxGeo(0.05, 0.025, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  let k = 0; const m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (const [x, z, dir] of racks) {
    const r = box(office, 0.75, 2.1, 1.0, 0x16181d, x, 1.05, z);
    box(office, 0.68, 1.9, 0.01, 0x24272e, x, 1.05, z + dir * 0.505, 0, false);
    blockObj(r, 0.1);
    for (let j = 0; j < 18; j++) {
      m4.makeTranslation(x - 0.25 + (j % 3) * 0.12, 0.3 + Math.floor(j / 3) * 0.3, z + dir * 0.515);
      leds.setMatrixAt(k, m4); leds.setColorAt(k, col.set(pick([0x22c55e, 0x22c55e, 0x38bdf8, 0xf59e0b]))); k++;
    }
  }
  office.add(leds);
  spots.server.push(mkSpot(12.0, -2.85, Math.PI), mkSpot(15.0, -2.85, Math.PI), mkSpot(18.1, -2.85, 0));
  box(office, 0.6, 0.02, 7, mat(0x0ea5e9, { emissive: 0x0ea5e9, emissiveIntensity: 1 }), 15, 2.95, -2.85, Math.PI / 2, false);
}

// --- YO'LAK
{
  const posters = [['HAR KUNI 1 VIDEO', '#f97316'], ["G'OYA → SSENARIY → VIDEO", '#38bdf8'], ['AI + SEN = NATIJA', '#22c55e'], ['IZCHILLIK — KALIT', '#a855f7']];
  [[-9.5, posters[0]], [-17.5, posters[1]], [9.5, posters[2]], [17.5, posters[3]]].forEach(([x, [t, c]]) => sign(office, t, 2.2, 0.8, x, 1.7, 5.88, Math.PI, { bg: '#111827', fg: '#ffffff', accent: c, glow: 0.4 }));
  for (const x of [-19.4, 19.4, -2.8, 2.8]) plant(x, 2.6, 0.9);
  cyl(office, 0.18, 0.18, 1.0, 0xe5e7eb, -6.2, 0.5, 5.6, 12); cyl(office, 0.16, 0.16, 0.4, mat(0x93c5fd, { transparent: true, opacity: 0.7 }), -6.2, 1.2, 5.6, 12);
  blockRect(-6.4, 5.4, -6.0, 5.8, 0.1);
}

// ---------------------------------------------------------------- xonalar chiroqlari
const roomLights = [];
for (const k of ['studio', 'lobby', 'lounge', 'hq', 'meeting', 'server', 'corridor']) {
  const r = ROOMS[k];
  const l = new THREE.PointLight(k === 'hq' ? 0xbfe3ff : 0xfff1dc, 6, 22, 1.6);
  l.position.set((r.x1 + r.x2) / 2, 2.8, (r.z1 + r.z2) / 2); scene.add(l); roomLights.push(l);
}
for (const x of [-4, 1, 6]) { const l = new THREE.PointLight(0xfff1dc, 6, 18, 1.6); l.position.set(x, 2.8, -6); scene.add(l); roomLights.push(l); }

// ---------------------------------------------------------------- jamoa
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd7a07a];
const HAIRS = [0x1b1b1b, 0x2b1d14, 0x3b2a1e, 0x5a3a22, 0x111111, 0x8a5a2b];
const TEAM = [
  { name: 'Aziza', role: 'Resepshn', color: 0xf97316, hair: 'long', home: 'reception', fixed: true,
    tasks: ["Mehmonlarni kutib olish", "Qo'ng'iroqlarga javob", "Pochtani saralash", "Uchrashuvlarni yozish"],
    tools: ['Read|kunlik_jadval.md', 'Write|mehmonlar_{n}.csv', 'Bash|send-reminder --all'] },
  { name: 'Bobur', role: 'Bosh agent', color: 0x7f1d1d, hair: 'short', acc: 'beard', home: 'hq3',
    tasks: ["Kunlik reja tuzish", "Vazifalarni taqsimlash", "Hisobotlarni tekshirish", "Yangi g'oyalarni tanlash"],
    tools: ['Task|Dilnoza → muqova #{n}', 'Task|Shahzoda → ssenariy', 'Read|haftalik_hisobot.md', 'TodoWrite|bugungi 6 ta vazifa'] },
  { name: 'Rustam', role: 'DevOps', color: 0x0f766e, hair: 'short', acc: 'headset', home: 'hq0', extra: 'server',
    tasks: ["Serverlarni kuzatish", "Zaxira nusxa olish", "Saytni deploy qilish"],
    tools: ['Bash|docker ps', 'Bash|deploy --prod', 'Read|logs/nginx.log', 'Bash|backup --s3'] },
  { name: 'Zarina', role: 'Tahlilchi', color: 0x6d28d9, hair: 'bun', acc: 'glasses', home: 'hq2',
    tasks: ["Ko'rishlar statistikasi", "Haftalik hisobot", "A/B test natijasi", "Auditoriya tahlili"],
    tools: ['Read|analytics_{n}.csv', 'Bash|python stats.py', 'Write|hisobot_{n}.md', 'WebFetch|youtube studio'] },
  { name: 'Temur', role: 'Boshlovchi', color: 0x111827, hair: 'short', home: 'studio',
    tasks: ["Video yozish", "Intro takrorlash", "Ovoz yozish", "Jonli efirga tayyorgarlik"],
    tools: ['Read|ssenariy_{n}.md', 'Bash|record --cam A', 'Write|take_{n}.mp4'] },
  { name: 'Otabek', role: 'Montajchi', color: 0x1d4ed8, hair: 'cap', home: 'studioDesk', extra: 'studioCam',
    tasks: ["Shorts montaji", "Subtitr qo'shish", "Rang korreksiyasi", "Musiqa qo'yish"],
    tools: ['Bash|ffmpeg -i take_{n}.mp4', 'Edit|timeline_{n}.prproj', 'Write|shorts_{n}.mp4'] },
  { name: 'Farrux', role: 'Farrosh', color: 0xeab308, hair: 'short', acc: 'vest', home: null, cleaner: true, tasks: ['Pol tozalash'], tools: [] },
  { name: 'Dilnoza', role: 'Dizayner', color: 0xec4899, hair: 'long', screen: 'design', tasks: ["Reels muqovasi", "YouTube thumbnail", "Brend ranglari", "Story shabloni"], tools: ['Read|brief_{n}.md', 'Edit|muqova_v{n}.fig', 'Write|thumbnail_{n}.png', 'WebSearch|"rang palitrasi 2026"'] },
  { name: 'Javohir', role: 'Frontend', color: 0x2563eb, hair: 'short', acc: 'glasses', screen: 'code', tasks: ["Landing sahifa", "Mobil versiya", "Tugma animatsiyasi"], tools: ['Edit|src/App.tsx', 'Bash|npm run build', 'Read|styles.css', 'Grep|"Button"'] },
  { name: 'Sardor', role: 'Backend', color: 0x059669, hair: 'short', acc: 'beard', screen: 'code', tasks: ["API ulash", "Ma'lumotlar bazasi", "Avtopost skripti"], tools: ['Edit|api/post.ts', 'Bash|npm test', 'Read|schema.sql', 'Bash|curl /api/health'] },
  { name: 'Madina', role: 'Kopirayter', color: 0xf43f5e, hair: 'bun', screen: 'doc', tasks: ["Post matni", "Caption va heshteglar", "Blog maqola"], tools: ['Write|caption_{n}.txt', 'Edit|post_{n}.md', 'WebSearch|"trend heshteglar"'] },
  { name: 'Nilufar', role: 'SMM', color: 0xd946ef, hair: 'long', screen: 'social', tasks: ["Post jadvali", "Izohlarga javob", "Story joylash"], tools: ['Bash|schedule --ig 18:00', 'Read|izohlar_{n}.json', 'WebFetch|instagram insights'] },
  { name: 'Jasur', role: 'Tadqiqotchi', color: 0x0891b2, hair: 'short', screen: 'chart', tasks: ["Raqobatchilar tahlili", "Trend mavzular", "Auditoriya so'rovi"], tools: ['WebSearch|"viral reels uz"', 'WebFetch|youtube trending', 'Write|tadqiqot_{n}.md'] },
  { name: 'Kamola', role: 'Tester', color: 0x65a30d, hair: 'bun', acc: 'glasses', screen: 'code', tasks: ["Sayt testi", "Video sifati tekshiruvi", "Xatolar ro'yxati"], tools: ['Bash|npm run e2e', 'Read|bug_{n}.md', 'Write|test_report.md'] },
  { name: 'Shahzoda', role: 'Ssenariynavis', color: 0xa855f7, hair: 'long', screen: 'doc', tasks: ["Reels ssenariysi", "Hook g'oyalari", "Video rejasi"], tools: ['Write|ssenariy_{n}.md', 'Edit|hooks.md', 'Read|tadqiqot_{n}.md'] },
  { name: "Ulug'bek", role: 'Trend skauti', color: 0xf59e0b, hair: 'cap', screen: 'social', tasks: ["TikTok trendlari", "Musiqa tanlash", "Viral formatlar"], tools: ['WebSearch|"trend audio"', 'WebFetch|tiktok discover', 'Write|trendlar_{n}.md'] },
  { name: 'Lola', role: 'Animator', color: 0x14b8a6, hair: 'bun', screen: 'video', tasks: ["Logo animatsiyasi", "Intro animatsiya", "Stikerlar"], tools: ['Edit|intro_{n}.aep', 'Bash|render --4k', 'Write|logo_anim.mp4'] },
  { name: 'Sevara', role: 'Tarjimon', color: 0x8b5cf6, hair: 'long', acc: 'glasses', screen: 'doc', tasks: ["Rus tiliga subtitr", "Ingliz tiliga tarjima", "Matnni tekshirish"], tools: ['Read|subtitr_uz_{n}.srt', 'Write|subtitr_ru_{n}.srt', 'Write|subtitr_en_{n}.srt'] },
  { name: 'Doniyor', role: 'Reklama', color: 0xdc2626, hair: 'short', screen: 'chart', tasks: ["Reklama kampaniyasi", "Byudjet hisobi", "Auditoriya sozlash"], tools: ['WebFetch|ads manager', 'Bash|ads --report', 'Write|kampaniya_{n}.md'] },
  { name: 'Gulnora', role: 'Mijozlar xizmati', color: 0x0ea5e9, hair: 'bun', acc: 'headset', screen: 'social', tasks: ["Direktga javob", "Buyurtmalarni yozish", "Fikrlarni yig'ish"], tools: ['Read|direct_{n}.json', 'Write|javob_{n}.txt', 'Bash|crm sync'] },
  { name: 'Akmal', role: 'Ovoz muhandisi', color: 0x334155, hair: 'short', acc: 'headset', screen: 'video', extra: 'studioCam', tasks: ["Ovozni tozalash", "Fon musiqasi", "Podkast miksi"], tools: ['Bash|denoise voice_{n}.wav', 'Edit|mix_{n}.als', 'Write|podkast_{n}.mp3'] },
  { name: 'Malika', role: 'Thumbnail ustasi', color: 0xfb7185, hair: 'long', screen: 'design', tasks: ["Thumbnail A/B", "Yuz ifodasi tanlash", "Sarlavha matni"], tools: ['Edit|thumb_{n}.psd', 'Write|thumb_{n}_B.png', 'Read|ctr_stats.csv'] },
  { name: 'Sanjar', role: 'Avtomatlashtirish', color: 0x4f46e5, hair: 'cap', screen: 'code', tasks: ["Avtopost oqimi", "Zapier ulanishi", "Bot yozish"], tools: ['Edit|bot/index.js', 'Bash|node bot', 'Write|workflow_{n}.json'] },
  { name: 'Feruza', role: 'Hamkorliklar', color: 0xc026d3, hair: 'bun', screen: 'doc', tasks: ["Brendlarga xat", "Shartnoma loyihasi", "Narxlar ro'yxati"], tools: ['Write|xat_{n}.md', 'Read|brendlar.csv', 'WebSearch|"uz brendlar marketing"'] },
];
const APPROVALS = ['git push origin main', "Instagram'ga post joylash", "YouTube'ga video yuklash", 'Reklama byudjeti: $20', 'npm install sharp', 'Hamkorlarga 12 ta xat yuborish', 'rm -rf build/', 'Saytni deploy qilish'];

// ---------------------------------------------------------------- jurnal va statistika
const stats = { tools: 0, done: 0, approved: 0 };
const ui = { dirty: true };
const logs = [];
let simMin = 9 * 60, speed = 1;
const clockStr = () => { const m = Math.floor(simMin) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const logEl = document.getElementById('logLines');
function log(text, cls = 'tool') {
  logs.push({ t: clockStr(), text, cls }); if (logs.length > 80) logs.shift();
  logEl.innerHTML = logs.slice(-9).map((l) => `<div><span class="t">${l.t}</span> <span class="${l.cls}">${l.text.replace(/</g, '&lt;')}</span></div>`).join('');
}

// ---------------------------------------------------------------- agent
const agents = [];
class Agent {
  constructor(def, home) {
    this.def = def; this.home = home; if (home) home.taken = this;
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    this.root.scale.setScalar(rnd(0.94, 1.04));
    this.skin = pick(SKINS); this.hairColor = pick(HAIRS);
    this.build(); scene.add(this.root);
    this.spot = null; this.path = null; this.pi = 0; this.pose = 'stand'; this.act = 'idle';
    this.yaw = 0; this.yawT = 0; this.phase = Math.random() * 6; this.speed = rnd(1.15, 1.5);
    this.state = 'idle'; this.timer = 0; this.toolTimer = rnd(2, 6); this.task = ''; this.status = '';
    this.makeLabel();
    if (home) this.placeAt(home); else this.placeAt(mkSpot(rnd(-4, 4), 4, 0));
    this.state = 'working'; this.timer = rnd(3, 25); this.task = pick(def.tasks); this.setStatus(this.workStatus());
    if (def.cleaner) { this.state = 'idle'; this.timer = 0; }
  }
  build() {
    const d = this.def, B = this.body, skin = this.skin, shirt = d.color, pants = d.cleaner ? 0x1e3a8a : pick([0x1f2937, 0x334155, 0x1e3a5f, 0x3f3f46, 0x44403c]);
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0.11 * s, 0.85, 0); B.add(hip);
      softBox(hip, 0.17, 0.44, 0.19, pants, 0, -0.21, 0);
      const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); hip.add(knee);
      softBox(knee, 0.16, 0.36, 0.18, pants, 0, -0.18, 0);
      softBox(knee, 0.18, 0.08, 0.28, 0x1c1917, 0, -0.39, 0.04);
      this.legs.push({ hip, knee });
    }
    softBox(B, 0.44, 0.62, 0.26, surface('fabric', shirt), 0, 1.16, 0);
    softBox(B, 0.52, 0.1, 0.3, pants, 0, 0.86, 0);
    if (d.acc === 'vest') softBox(B, 0.52, 0.5, 0.3, 0xfacc15, 0, 1.12, 0);
    softBox(B, 0.2, 0.06, 0.02, 0xffffff, 0, 1.4, 0.141, 0, false); // yoqa
    this.arms = []; this.elbows = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.27 * s, 1.42, 0); B.add(sh);
      oval(sh, .075, .17, .078, surface('fabric', shirt), 0, -.14, 0);
      const elbow = new THREE.Group(); elbow.position.y = -.29; sh.add(elbow);
      oval(elbow, .055, .13, .06, skin, 0, -.12, 0);
      oval(elbow, .055, .066, .035, skin, 0, -.28, .008);
      this.elbows.push(elbow);
      this.arms.push(sh);
    }
    if (d.cleaner) { // shvabra
      const mop = new THREE.Group(); mop.position.set(0, -0.6, 0.05); this.arms[1].add(mop);
      cyl(mop, 0.02, 0.02, 1.4, 0x9ca3af, 0, -0.1, 0.25, 6).rotation.x = 0.35;
      softBox(mop, 0.4, 0.06, 0.12, 0x60a5fa, 0, -0.78, 0.5);
    }
    const head = new THREE.Group(); head.position.set(0, 1.47, 0); head.scale.set(.85, .86, .9); B.add(head); this.head = head;
    softBox(head, 0.13, 0.1, 0.13, skin, 0, 0.04, 0);
    oval(head, .166, .21, .158, skin, 0, .27, 0);
    for (const s of [-1, 1]) softBox(head, 0.05, 0.055, 0.02, 0x111111, 0.08 * s, 0.29, 0.162, 0, false);
    oval(head, .047, .011, .014, 0x9d5b55, 0, .177, .143);
    // Ko'z oqi, qorachiq, qosh va kichik burun — yaqin kamera uchun.
    for (const side of [-1, 1]) {
      oval(head, .037, .029, .014, mat(0xf8fafc, { roughness: .3 }), side * .08, .29, .165);
      oval(head, .015, .021, .009, mat(0x172033, { roughness: .22 }), side * .08, .289, .178);
      softBox(head, 0.07, 0.014, 0.018, this.hairColor, side * 0.08, 0.343, 0.17, 0, false);
      softBox(head, 0.048, 0.09, 0.07, skin, side * 0.179, 0.26, 0);
      softBox(B, 0.018, 0.19, 0.018, 0x172033, side * 0.058, 1.31, 0.15, side * 0.2, false);
    }
    oval(head, .026, .038, .036, skin, 0, .245, .15);
    softBox(B, 0.105, 0.115, 0.018, 0xf1f5f9, 0, 1.19, 0.158, 0, false);
    softBox(B, 0.066, 0.022, 0.008, shirt, 0, 1.21, 0.17, 0, false);
    const hc = this.hairColor;
    if (d.hair === 'short' || d.hair === 'bun' || d.hair === 'long') { softBox(head, 0.36, 0.1, 0.34, hc, 0, 0.47, 0); softBox(head, 0.36, 0.26, 0.07, hc, 0, 0.35, -0.15); }
    if (d.hair === 'long') { softBox(head, 0.38, 0.55, 0.08, hc, 0, 0.2, -0.16); softBox(head, 0.05, 0.38, 0.28, hc, -0.18, 0.3, -0.02); softBox(head, 0.05, 0.38, 0.28, hc, 0.18, 0.3, -0.02); }
    if (d.hair === 'bun') sphere(head, 0.1, hc, 0, 0.52, -0.14, 1);
    if (d.hair === 'cap') { softBox(head, 0.37, 0.12, 0.35, d.color, 0, 0.48, 0); softBox(head, 0.3, 0.03, 0.18, d.color, 0, 0.43, 0.24); }
    if (d.acc === 'glasses') {
      for (const side of [-1, 1]) {
        for (const y of [0.251, 0.329]) softBox(head, 0.115, 0.012, 0.018, 0x111827, side * 0.08, y, 0.197, 0, false);
        for (const x of [side * 0.08 - 0.053, side * 0.08 + 0.053]) softBox(head, 0.012, 0.08, 0.018, 0x111827, x, 0.29, 0.197, 0, false);
      }
      softBox(head, 0.05, 0.012, 0.018, 0x111827, 0, 0.3, 0.197, 0, false);
    }
    if (d.acc === 'beard') softBox(head, 0.32, 0.12, 0.05, hc, 0, 0.15, 0.15);
    if (d.acc === 'headset') { softBox(head, 0.4, 0.04, 0.06, 0x111111, 0, 0.5, 0); softBox(head, 0.05, 0.12, 0.1, 0x111111, -0.19, 0.3, 0); softBox(head, 0.05, 0.12, 0.1, 0x111111, 0.19, 0.3, 0); softBox(head, 0.02, 0.02, 0.14, 0x111111, 0.15, 0.2, 0.1); }
    // Bir xil materialli yuz/gavda detallari bitta draw callga yig'iladi.
    const rigidGroups = [];
    B.traverse(o => { if (o.isGroup) rigidGroups.push(o); });
    for (const group of rigidGroups) {
      const batches = new Map();
      for (const mesh of group.children) {
        if (!mesh.isMesh) continue;
        const key = `${mesh.material.uuid}:${mesh.castShadow}`;
        if (!batches.has(key)) batches.set(key, []);
        batches.get(key).push(mesh);
      }
      for (const meshes of batches.values()) {
        if (meshes.length < 2) continue;
        const parts = meshes.map(mesh => {
          mesh.updateMatrix();
          const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          return geometry.applyMatrix4(mesh.matrix);
        });
        const geometry = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
        if (!geometry) continue;
        const merged = new THREE.Mesh(geometry, meshes[0].material);
        merged.castShadow = meshes[0].castShadow; merged.receiveShadow = true;
        group.add(merged); meshes.forEach(m => m.removeFromParent());
      }
    }
    this.cup = mug(this.elbows[1], 0, -.28, .06, 0xf4f0e8); this.cup.visible = false;
    this.contact = contactShadow(this.root, 0, 0, .8, .65);
    this.root.traverse((o) => { if (o.isMesh && o !== this.contact) o.userData.agent = this; });
  }
  makeLabel() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 176;
    this.lctx = c.getContext('2d'); this.ltex = new THREE.CanvasTexture(c); this.ltex.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ltex, depthWrite: false, transparent: true }));
    this.label.scale.set(1.9, 0.65, 1); this.label.position.y = 2.42; this.label.renderOrder = 10; this.root.add(this.label);
  }
  drawLabel() {
    const c = this.lctx, d = this.def; c.clearRect(0, 0, 512, 176);
    const warn = this.state === 'waiting';
    c.font = '600 28px system-ui, sans-serif';
    const txt = this.status, tw = Math.min(490, c.measureText(txt).width + 36);
    c.fillStyle = warn ? '#f97316' : 'rgba(255,255,255,0.95)'; c.beginPath(); c.roundRect(256 - tw / 2, 4, tw, 56, 18); c.fill();
    c.beginPath(); c.moveTo(244, 60); c.lineTo(268, 60); c.lineTo(256, 74); c.fill();
    c.fillStyle = warn ? '#111' : '#111827'; c.textAlign = 'center'; c.textBaseline = 'middle';
    fitFont(c, txt, 470, 28, '600'); c.fillText(txt, 256, 33);
    const name = `${d.name} · ${d.role}`; c.font = 'bold 30px system-ui, sans-serif';
    const nw = Math.min(500, c.measureText(name).width + 40);
    c.fillStyle = '#' + new THREE.Color(d.color).getHexString(); c.beginPath(); c.roundRect(256 - nw / 2, 96, nw, 54, 27); c.fill();
    c.fillStyle = '#fff'; fitFont(c, name, 470, 30); c.fillText(name, 256, 124);
    this.ltex.needsUpdate = true;
  }
  setStatus(s) { if (s === this.status) return; this.status = s; this.drawLabel(); ui.dirty = true; }
  workStatus() {
    const icon = { Resepshn: '📞', 'Bosh agent': '🧠', Boshlovchi: '🎬', Montajchi: '🎞️', DevOps: '🖥️', Dizayner: '🎨', Animator: '✨' }[this.def.role] || '💻';
    return `${icon} ${this.task}`;
  }
  placeAt(s) {
    if (this.spot && this.spot !== this.home) this.spot.taken = null;
    this.spot = s; if (s !== this.home) s.taken = this;
    this.root.position.set(s.x, 0, s.z); this.yaw = this.yawT = s.face; this.pose = s.pose; this.seatY = s.seatY;
  }
  goTo(s, onArrive, place = null) {
    if (this.spot && this.spot !== this.home && this.spot !== s) this.spot.taken = null;
    this.spot = s; if (s !== this.home) s.taken = this;
    const p = this.root.position;
    this.path = findPath(p.x, p.z, s.x, s.z) || [{ x: s.x, z: s.z }];
    this.pi = 0; this.pose = 'walk'; this.act = 'idle'; this.state = 'walking'; this.onArrive = onArrive;
    const r = place || roomAt(s.x, s.z);
    this.setStatus('🚶 ' + (r ? r.name[0] + r.name.slice(1).toLowerCase() + 'ga' : "yo'lda"));
  }
  arrive() {
    const s = this.spot; this.path = null;
    this.root.position.set(s.x, 0, s.z); this.yawT = s.face; this.pose = s.pose; this.seatY = s.seatY;
    const f = this.onArrive; this.onArrive = null; this.state = 'idle'; if (f) f(); else this.decide();
  }
  startWork() {
    if (this.spot !== this.home || this.state === 'walking') return this.goTo(this.home, () => this.startWork());
    this.task = pick(this.def.tasks); this.state = 'working'; this.timer = rnd(20, 45); this.act = 'type';
    if (this.def.home === 'studio') this.act = 'talk';
    this.setStatus(this.workStatus());
  }
  rest(list, status, dur, act = 'idle') {
    const free = list.filter((s) => !s.taken); if (!free.length) return this.startWork();
    this.goTo(pick(free), () => { this.state = 'break'; this.timer = dur; this.act = act; this.setStatus(status); });
  }
  visit() {
    const others = agents.filter((a) => a !== this && a.home && a.state === 'working' && a.spot === a.home && !a.def.fixed);
    if (!others.length) return this.startWork();
    const o = pick(others), h = o.home, side = Math.random() < 0.5 ? 1 : -1;
    const ox = Math.cos(h.face) * 0.75 * side, oz = -Math.sin(h.face) * 0.75 * side;
    const s = mkSpot(h.x + ox, h.z + oz, Math.atan2(-ox, -oz));
    this.goTo(s, () => { this.state = 'break'; this.timer = rnd(7, 12); this.act = 'talk'; this.setStatus(`💬 ${o.def.name} bilan muhokama`); o.chatWith = this; });
  }
  decide() {
    const d = this.def;
    if (d.cleaner) {
      for (let k = 0; k < 20; k++) {
        const r = ROOMS[pick(['corridor', 'corridor', 'lobby', 'work', 'lounge', 'hq'])];
        const x = rnd(r.x1 + 1, r.x2 - 1), z = rnd(r.z1 + 1, r.z2 - 1);
        if (!isBlocked(x, z)) return this.goTo(mkSpot(x, z, rnd(0, 6.28)), () => { this.state = 'break'; this.timer = rnd(4, 9); this.act = 'clean'; this.setStatus('🧹 Pol tozalayapti'); });
      }
      return;
    }
    if (d.fixed) return this.startWork();
    if (this.spot !== this.home && Math.random() < 0.75) return this.startWork();
    const r = Math.random();
    if (r < 0.6) return this.startWork();
    if (r < 0.72) return this.rest(spots.coffee, '☕ Kofe ichyapti', rnd(10, 18), 'drink');
    if (r < 0.8) return this.rest(spots.lounge, pick(['🏓 Dam olyapti', '😌 5 daqiqa tanaffus', '🎮 Miyani yangilayapti']), rnd(12, 20), 'idle');
    if (r < 0.9) return this.visit();
    if (d.extra) return this.rest(spots[d.extra], d.extra === 'server' ? '🖥️ Serverni tekshiryapti' : '🎥 Kamerani sozlayapti', rnd(12, 20), 'talk');
    if (r < 0.95) return this.rest(spots.whiteboard, '📌 Doskada reja chizyapti', rnd(10, 16), 'talk');
    return this.rest(spots.visitHQ, '🧠 Bosh agentga hisobot', rnd(8, 12), 'talk');
  }
  update(dt, t) {
    // xatti-harakat
    if (this.state === 'walking' && this.path) {
      let step = this.speed * dt;
      while (step > 0 && this.path) {
        const p = this.path[this.pi], pos = this.root.position, dx = p.x - pos.x, dz = p.z - pos.z, dist = Math.hypot(dx, dz);
        if (dist > 0.001) this.yawT = Math.atan2(dx, dz);
        if (dist <= step) { pos.x = p.x; pos.z = p.z; step -= dist; this.pi++; if (this.pi >= this.path.length) { this.arrive(); break; } }
        else { pos.x += dx / dist * step; pos.z += dz / dist * step; step = 0; }
      }
    } else if (this.state === 'working') {
      this.timer -= dt; this.toolTimer -= dt;
      if (this.toolTimer <= 0 && this.def.tools.length) {
        this.toolTimer = rnd(3, 8);
        const [tool, arg = ''] = pick(this.def.tools).split('|');
        stats.tools++; ui.dirty = true;
        log(`${this.def.name} · ${tool.padEnd(9)} ${arg.replace('{n}', Math.floor(rnd(2, 40)))}`, 'tool');
      }
      if (this.timer <= 0) {
        stats.done++; log(`✅ ${this.def.name}: "${this.task}" tayyor`, 'ok');
        this.decide();
      }
    } else if (this.state === 'break') {
      this.timer -= dt; if (this.timer <= 0) this.decide();
    } else if (this.state === 'meeting') {
      if (!meeting.active) this.decide();
    } else if (this.state === 'idle') this.decide();

    // animatsiya
    this.yaw = angLerp(this.yaw, this.yawT, Math.min(1, dt * 10));
    this.root.rotation.y = this.yaw;
    const L = this.legs, A = this.arms;
    let h0 = 0, h1 = 0, k0 = 0, k1 = 0, a0 = 0, a1 = 0, by = 0, hy = 0, hx = 0;
    const tt = t + this.phase;
    if (this.pose === 'walk') {
      this.phase += dt * this.speed * 5.2; const s = Math.sin(this.phase);
      h0 = s * 0.55; h1 = -s * 0.55; k0 = Math.max(0, -s) * 0.8; k1 = Math.max(0, s) * 0.8; a0 = -s * 0.5; a1 = s * 0.5;
      by = Math.abs(Math.cos(this.phase)) * 0.035;
    } else if (this.pose === 'sit') {
      h0 = h1 = -1.5; k0 = k1 = 1.5; by = this.seatY + 0.08 - 0.85;
    } else { a0 = Math.sin(tt * 1.3) * 0.03; a1 = -a0; }
    switch (this.state === 'waiting' ? 'wait' : this.act) {
      case 'type': if (this.pose === 'sit') { a0 = -1.15 + Math.sin(tt * 14) * 0.07; a1 = -1.15 + Math.sin(tt * 14 + 1.7) * 0.07; hx = 0.08 + Math.sin(tt * 0.7) * 0.04; } break;
      case 'talk': a0 = -0.3 + Math.sin(tt * 2.4) * 0.35; a1 = -0.15 + Math.sin(tt * 1.9 + 1) * 0.2; hy = Math.sin(tt * 0.9) * 0.2; break;
      case 'drink': a1 = -1.9 + Math.sin(tt * 0.8) * 0.25; a0 = -0.1; hx = -0.08; break;
      case 'clean': a0 = a1 = -0.6 + Math.sin(tt * 3) * 0.3; this.root.rotation.y = this.yaw + Math.sin(tt * 1.5) * 0.4; break;
      case 'wait': hy = Math.sin(tt * 1.2) * 0.6; a0 = this.pose === 'sit' ? -0.6 : 0; a1 = this.pose === 'sit' ? -0.6 : -2.6 + Math.sin(tt * 6) * 0.25; break;
    }
    if (this.chatWith && this.state === 'working') { if (this.chatWith.state === 'break' && this.chatWith.act === 'talk') { hy = 0.5 * Math.sign(Math.sin(this.yaw)); a0 = -0.6; } else this.chatWith = null; }
    const blend = 1 - Math.exp(-dt * 12);
    L[0].hip.rotation.x = lerp(L[0].hip.rotation.x, h0, blend);
    L[1].hip.rotation.x = lerp(L[1].hip.rotation.x, h1, blend);
    L[0].knee.rotation.x = lerp(L[0].knee.rotation.x, k0, blend);
    L[1].knee.rotation.x = lerp(L[1].knee.rotation.x, k1, blend);
    const drinking = this.act === 'drink' && this.state !== 'waiting' && this.pose !== 'walk';
    const typing = this.act === 'type' && this.pose === 'sit' && this.state !== 'waiting';
    if (typing) { a0 *= .65; a1 *= .65; }
    if (drinking) a1 = -.8 + Math.sin(tt * .8) * .12;
    A[0].rotation.x = lerp(A[0].rotation.x, a0, blend);
    A[1].rotation.x = lerp(A[1].rotation.x, a1, blend);
    this.elbows[0].rotation.x = lerp(this.elbows[0].rotation.x, typing ? -.65 : -.08, blend);
    this.elbows[1].rotation.x = lerp(this.elbows[1].rotation.x, drinking ? -1.65 : typing ? -.65 : -.08, blend);
    this.cup.visible = drinking;
    this.body.position.y = lerp(this.body.position.y, by + (this.pose === 'walk' ? 0 : Math.sin(tt * 1.7) * .005), blend);
    this.head.rotation.y = lerp(this.head.rotation.y, hy + (this.pose === 'walk' ? 0 : Math.sin(tt * .45) * .045), blend);
    this.head.rotation.x = lerp(this.head.rotation.x, hx, blend);
  }
}

const homes = { reception: receptionSpot, studio: studioHost, studioDesk, hq0: hqDesks[0], hq1: hqDesks[1], hq2: hqDesks[2], hq3: hqDesks[3] };
const freeWork = workDesks.slice().sort(() => Math.random() - 0.5);
for (const def of TEAM) {
  const home = def.cleaner ? null : (def.home ? homes[def.home] : freeWork.pop());
  if (!def.home && def.screen) { /* ekran turi stol bilan tasodifiy */ }
  agents.push(new Agent(def, home));
}

// ---------------------------------------------------------------- yig'ilish va ruxsatlar
const meeting = { active: false, end: 0, next: 70 };
const approvals = [];
let simTime = 0, approvalNext = 25;
function startMeeting() {
  const cands = agents.filter((a) => !a.def.fixed && !a.def.cleaner && a.state !== 'waiting' && a.state !== 'walking').sort(() => Math.random() - 0.5).slice(0, 6);
  if (cands.length < 3) return;
  meeting.active = true; meeting.end = simTime + 50;
  const topic = pick(['Haftalik kontent reja', "Yangi seriya g'oyasi", 'Reklama natijalari', "Oylik o'sish strategiyasi"]);
  log(`📅 Yig'ilish: "${topic}" (${cands.map((a) => a.def.name).join(', ')})`, 'ev');
  const chairs = spots.meeting.slice();
  cands.forEach((a, i) => { const s = chairs[i]; if (!s || s.taken) return; a.goTo(s, () => { a.state = 'meeting'; a.act = 'talk'; a.setStatus('📊 ' + topic); }); });
}
function requestApproval() {
  const cands = agents.filter((a) => a.state === 'working' && !a.def.fixed && a.def.tools.length);
  if (!cands.length) return;
  const a = pick(cands), action = pick(APPROVALS);
  a.state = 'waiting'; a.approval = action; a.waitSince = simTime;
  a.setStatus('⏳ Ruxsat kerak: ' + action); a.drawLabel();
  approvals.push(a); log(`⚠️ ${a.def.name} ruxsat so'rayapti: ${action}`, 'warn'); ui.showApproval();
}
function approve(a = approvals[0], auto = false) {
  if (!a) return;
  approvals.splice(approvals.indexOf(a), 1);
  stats.approved++; a.state = 'working'; a.timer = Math.max(a.timer, 6);
  log(`✅ Ruxsat berildi${auto ? ' (avto)' : ''}: ${a.def.name} → ${a.approval}`, 'ok');
  a.setStatus(a.workStatus()); a.drawLabel(); ui.showApproval();
}

// ---------------------------------------------------------------- HQ ekrani
function drawHQ() {
  const c = hqTex.userData.ctx, W = 1536, H = 512;
  c.fillStyle = '#05080f'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#0ea5e9'; c.fillRect(0, 0, W, 6);
  c.fillStyle = '#e5e7eb'; c.font = 'bold 34px system-ui'; c.textBaseline = 'top'; c.fillText(`${OFFICE_NAME} · BOSHQARUV MARKAZI`, 28, 22);
  c.fillStyle = '#38bdf8'; c.font = 'bold 34px Consolas, monospace'; c.textAlign = 'right'; c.fillText(clockStr(), W - 28, 22); c.textAlign = 'left';
  c.font = '22px Consolas, monospace';
  logs.slice(-13).forEach((l, i) => { c.fillStyle = '#475569'; c.fillText(l.t, 28, 80 + i * 32); c.fillStyle = { tool: '#7dd3fc', ok: '#4ade80', warn: '#fb923c', ev: '#c084fc' }[l.cls] || '#fff'; c.fillText(l.text.slice(0, 58), 110, 80 + i * 32); });
  const bx = 960;
  [['TOOL CALLS', stats.tools, '#38bdf8'], ['BAJARILDI', stats.done, '#4ade80'], ['RUXSATLAR', stats.approved, '#fb923c']].forEach(([k, v, col], i) => {
    c.fillStyle = '#0f172a'; c.fillRect(bx + i * 188, 80, 176, 110); c.fillStyle = '#64748b'; c.font = 'bold 18px system-ui'; c.fillText(k, bx + 14 + i * 188, 94);
    c.fillStyle = col; c.font = 'bold 52px Consolas, monospace'; c.fillText(String(v), bx + 14 + i * 188, 122);
  });
  c.fillStyle = '#64748b'; c.font = 'bold 18px system-ui'; c.fillText('JAMOA HOLATI', bx, 214);
  agents.forEach((a, i) => {
    const x = bx + (i % 4) * 140, y = 244 + Math.floor(i / 4) * 42;
    const col = { working: '#22c55e', walking: '#38bdf8', break: '#eab308', meeting: '#c084fc', waiting: '#f97316' }[a.state] || '#64748b';
    c.fillStyle = col; c.beginPath(); c.arc(x + 9, y + 11, 8, 0, 7); c.fill();
    c.fillStyle = '#cbd5e1'; c.font = '19px system-ui'; c.fillText(a.def.name, x + 24, y);
  });
  hqTex.needsUpdate = true;
}

// ---------------------------------------------------------------- interfeys
Object.assign(ui, {
  dirty: true, labels: true, clean: false, vertical: false,
  agList: document.getElementById('agList'),
  build() {
    document.getElementById('brand').innerHTML = OFFICE_NAME.replace(/^(\S+)/, '<b>$1</b>');
    document.getElementById('sAgents').textContent = agents.length;
    this.agList.innerHTML = agents.map((a, i) => `<div class="ag" data-i="${i}"><i style="background:#${new THREE.Color(a.def.color).getHexString()}"></i><div><b>${a.def.name} · ${a.def.role}</b><small></small></div></div>`).join('');
    this.agList.querySelectorAll('.ag').forEach((el) => el.onclick = () => followAgent(agents[+el.dataset.i]));
  },
  refresh() {
    if (!this.dirty) return; this.dirty = false;
    document.getElementById('sTools').textContent = stats.tools;
    document.getElementById('sDone').textContent = stats.done;
    document.getElementById('sAppr').textContent = stats.approved;
    this.agList.querySelectorAll('.ag').forEach((el) => { const a = agents[+el.dataset.i]; el.querySelector('small').textContent = a.status; el.classList.toggle('sel', a === followed); });
  },
  showApproval() {
    const el = document.getElementById('approve'), a = approvals[0];
    el.classList.toggle('show', !!a);
    if (a) el.querySelector('.msg').innerHTML = `⏳ <b>${a.def.name}</b> (${a.def.role}) ruxsat so'rayapti:<br><code>${a.approval}</code>${approvals.length > 1 ? ` <small>+${approvals.length - 1}</small>` : ''}`;
    this.dirty = true;
  },
});
document.querySelector('#approve .go').onclick = () => approve();
document.querySelector('#approve .see').onclick = () => approvals[0] && followAgent(approvals[0]);

// ---------------------------------------------------------------- kamera rejimlari
let mode = 'orbit', followed = null;
const walk = { yaw: 0, pitch: 0, keys: {} };
const tour = { i: -1, t: 0, shot: null, from: new THREE.Vector3(), to: new THREE.Vector3(), look: new THREE.Vector3() };
const SHOTS = [
  { cap: OFFICE_NAME, sub: 'AI jamoa 24/7 ishlaydigan ofis', from: [0, 3.2, 27], to: [0, 2.0, 18], look: [0, 1.6, 10] },
  { room: 'lobby', from: [4.5, 2.2, 13.2], to: [-3.5, 2.0, 12.8], look: [0, 1.2, 8.5], ceil: true },
  { room: 'work', from: [-7, 4.6, 1.2], to: [8.5, 4.6, 1.2], look: [1, 0.8, -7.5] },
  { follow: true },
  { room: 'hq', from: [-9.4, 2.4, 1], to: [-11.5, 2.0, -2.5], look: [-14, 1.7, -13], ceil: true },
  { room: 'studio', from: [-8, 1.9, 13.2], to: [-10.5, 1.7, 8.2], look: [-17.7, 1.3, 10], ceil: true },
  { follow: true },
  { room: 'lounge', from: [8.2, 2.3, 13.3], to: [8.6, 2.3, 7.0], look: [15, 1.0, 10.5], ceil: true },
  { room: 'meeting', from: [11, 2.6, -5.8], to: [11, 2.6, -13], look: [16, 0.9, -9.5], ceil: true },
  { room: 'server', from: [15.6, 1.8, 1.4], to: [12.2, 1.8, 1.2], look: [16, 1.1, -3.5], ceil: true },
  { follow: true },
  { cap: 'BUTUN OFIS', sub: `${TEAM.length} ta agent · 8 ta xona`, from: [-34, 30, 30], to: [34, 30, 30], look: [0, 0, 0] },
];
const SHOT_LEN = 7;
const capEl = document.getElementById('caption');
function caption(big, sub) {
  capEl.classList.remove('show');
  setTimeout(() => { capEl.querySelector('.big').textContent = big; capEl.querySelector('.sub').textContent = sub || ''; if (big) capEl.classList.add('show'); }, 250);
  clearTimeout(caption.h); caption.h = setTimeout(() => capEl.classList.remove('show'), SHOT_LEN * 1000 - 1200);
}
function nextShot() {
  tour.i = (tour.i + 1) % SHOTS.length; tour.t = 0; const s = SHOTS[tour.i]; tour.shot = s;
  if (s.follow) {
    const busy = agents.filter((a) => a.state === 'working' || a.state === 'waiting' || a.state === 'meeting');
    tour.agent = pick(busy.length ? busy : agents); tour.ang = rnd(0, 6.28);
    caption(tour.agent.def.name.toUpperCase(), `${tour.agent.def.role} · ${tour.agent.status}`);
    ceiling.visible = true;
  } else {
    tour.from.set(...s.from); tour.to.set(...s.to); tour.look.set(...s.look);
    const r = s.room ? ROOMS[s.room] : null;
    caption(r ? r.name : s.cap, r ? r.sub : s.sub);
    ceiling.visible = !!s.ceil;
  }
}
function setMode(m) {
  mode = m; document.body.classList.toggle('walk', m === 'walk');
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  orbit.enabled = m === 'orbit';
  ceiling.visible = m === 'walk' || m === 'follow';
  if (m !== 'tour') { capEl.classList.remove('show'); }
  if (m === 'orbit') { orbit.target.set(0, 0, -1); camera.position.set(0, 30, 32); followed = null; }
  if (m === 'walk') { camera.position.set(0, 1.65, 13.2); walk.yaw = 0; walk.pitch = -0.05; followed = null; }
  if (m === 'follow' && !followed) followed = pick(agents.filter((a) => a.state === 'working')) || agents[1];
  if (m === 'tour') { tour.i = -1; followed = null; nextShot(); }
  ui.dirty = true;
}
function followAgent(a) { followed = a; setMode('follow'); }
document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => setMode(b.dataset.mode));

let night = false, nightT = 0;
function toggleNight() { simMin = night ? Math.ceil(simMin / 1440) * 1440 + 9 * 60 : Math.floor(simMin / 1440) * 1440 + 20 * 60; }
document.getElementById('bNight').onclick = toggleNight;
function toggleLabels() { ui.labels = !ui.labels; agents.forEach((a) => a.label.visible = ui.labels); document.getElementById('bLabels').classList.toggle('on', ui.labels); }
document.getElementById('bLabels').onclick = toggleLabels;
function cycleSpeed() { speed = speed >= 4 ? 1 : speed * 2; document.getElementById('bSpeed').textContent = `Tezlik ${speed}x`; }
document.getElementById('bSpeed').onclick = cycleSpeed;
function toggleVertical() { ui.vertical = !ui.vertical; document.body.classList.toggle('vertical', ui.vertical); document.getElementById('bVert').classList.toggle('on', ui.vertical); resize(); }
document.getElementById('bVert').onclick = toggleVertical;
function toggleClean() { ui.clean = !ui.clean; document.body.classList.toggle('clean', ui.clean); }
document.getElementById('bClean').onclick = toggleClean;

addEventListener('keydown', (e) => {
  walk.keys[e.code] = true;
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'q' && !e.repeat) cycleQuality();
  if (k === '1') setMode('orbit'); if (k === '2') setMode('walk'); if (k === '3') setMode('follow'); if (k === '4') setMode('tour');
  if (k === 'n') toggleNight(); if (k === 'l') toggleLabels(); if (k === 'h') toggleClean(); if (k === 'v') toggleVertical();
  if (k === 's' && mode !== 'walk') cycleSpeed();
  if (e.key === 'Enter') approve();
  if (e.key === 'Escape' && ui.clean) toggleClean();
  if (mode === 'follow' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const i = agents.indexOf(followed); followed = agents[(i + (e.key === 'ArrowRight' ? 1 : agents.length - 1)) % agents.length]; ui.dirty = true; }
});
addEventListener('keyup', (e) => { walk.keys[e.code] = false; });

// sichqoncha: yurish rejimida qarash, bosish orqali agentni tanlash
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY }; canvas.focus(); });
addEventListener('pointermove', (e) => {
  if (!down) return;
  if (mode === 'walk') { walk.yaw -= (e.clientX - down.lx) * 0.004; walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch - (e.clientY - down.ly) * 0.004)); }
  down.lx = e.clientX; down.ly = e.clientY;
});
addEventListener('pointerup', (e) => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && e.target === canvas) {
    const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(agents.map((a) => a.root), true).find((h) => h.object.userData.agent);
    if (hit) followAgent(hit.object.userData.agent);
  }
  down = null;
});

function setQuality(index) {
  qualityIndex = index;
  const q = QUALITY[index];
  if (q.bloom) ensureComposer();
  sun.shadow.mapSize.set(q.shadow, q.shadow);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  renderer.shadowMap.needsUpdate = true; shadowElapsed = 1;
  roomLights.forEach(l => l.visible = q.lights);
  streetLights.forEach(l => l.visible = q.lights);
  document.getElementById('bQuality').innerHTML = `Sifat: ${q.name}<kbd>Q</kbd>`;
  document.getElementById('bQuality').setAttribute('aria-label', `Grafik sifat: ${q.name}. Almashtirish`);
  resize();
}
function cycleQuality() { setQuality((qualityIndex + 1) % QUALITY.length); }
document.getElementById('bQuality').onclick = cycleQuality;
// Faqat statik jihozlar birlashtiriladi; ekran, shisha, ship, agent va animatsiyalar alohida.
function batchFurniture() {
  office.updateMatrixWorld(true);
  const batches = new Map();
  office.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh === holo || (mesh.material.map && !mesh.material.userData.procedural) || mesh.material.transparent || mesh.material.wireframe) return;
    for (let p = mesh.parent; p; p = p.parent) if (p === ceiling) return;
    const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  });
  for (const meshes of batches.values()) {
    if (meshes.length < 3) continue;
    const geometries = meshes.map(m => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld); return g;
    });
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, meshes[0].material);
    merged.castShadow = meshes[0].castShadow; merged.receiveShadow = meshes[0].receiveShadow;
    geometry.computeBoundingSphere(); scene.add(merged);
    meshes.forEach(m => m.removeFromParent());
  }
}

function resize() {
  let w = innerWidth, h = innerHeight;
  if (ui.vertical) w = Math.min(w, Math.round(h * 9 / 16));
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  const q = QUALITY[qualityIndex];
  renderScale = Math.min(devicePixelRatio || 1, q.dpr, Math.sqrt(q.pixels / Math.max(1, w * h)));
  renderer.setPixelRatio(renderScale);
  renderer.setSize(w, h);
  if (composer) { composer.setPixelRatio(renderScale); composer.setSize(w, h); }
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- asosiy sikl
const clock = new THREE.Clock();
let t = 0, accScreens = 0, accHQ = 0, accLed = 0;
const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3();
function frame() {
  const rawDelta = clock.getDelta();
  const rdt = Math.min(rawDelta, 0.1), dt = rdt * speed;
  t += dt; simTime += dt; simMin += dt;

  // hodisalar
  if (simTime > approvalNext) { approvalNext = simTime + rnd(40, 70); requestApproval(); }
  for (const a of approvals) if (simTime - a.waitSince > 40) { approve(a, true); break; }
  if (!meeting.active && simTime > meeting.next) startMeeting();
  if (meeting.active && simTime > meeting.end) { meeting.active = false; meeting.next = simTime + rnd(140, 200); log("📅 Yig'ilish tugadi", 'ev'); }
  for (const a of agents) a.update(dt, t);

  // kun / tun
  const hour = (simMin % 1440) / 60;
  night = hour >= 19 || hour < 7;
  nightT = lerp(nightT, night ? 1 : 0, Math.min(1, rdt * 1.5));
  scene.background.copy(DAY_SKY).lerp(NIGHT_SKY, nightT); scene.fog.color.copy(scene.background);
  skyUniforms.top.value.copy(skyDayTop).lerp(skyNightTop, nightT);
  skyUniforms.bottom.value.copy(skyDayBottom).lerp(skyNightBottom, nightT);
  sun.intensity = lerp(2.4, .12, nightT);
  hemi.intensity = lerp(.7, qualityIndex === 0 ? .48 : .16, nightT);
  for (const m of matCache.values()) m.envMapIntensity = lerp(.45, .1, nightT);
  for (const m of surfaces.values()) m.envMapIntensity = lerp(.45, .1, nightT);
  for (const l of streetLights) l.intensity = nightT * 24;
  rim.intensity = lerp(0.65, 0.22, nightT);
  if (bloom) bloom.strength = lerp(0.22, 0.34, nightT);
  for (const l of roomLights) l.intensity = lerp(5, 20, nightT);
  for (const b of streetLamps) b.material.emissiveIntensity = nightT * 2;
  renderer.toneMappingExposure = lerp(1.0, 1.15, nightT);

  // ekranlar
  accScreens += rdt; accHQ += rdt; accLed += rdt;
  if (accScreens > 0.45) { accScreens = 0; SCREENS.codeLines.shift(); SCREENS.codeLines.push({ t: (Math.random() < 0.3 ? '  ' : '') + pick(CODE_LINES), c: pick(CODE_COLORS) }); drawCodeScreen(SCREENS.code.userData.ctx, 256, 160, SCREENS.codeLines); SCREENS.code.needsUpdate = true; }
  if (accHQ > 0.5) { accHQ = 0; drawHQ(); }
  if (accLed > 0.15) { accLed = 0; const col = new THREE.Color(); for (let k = 0; k < 20; k++) leds.setColorAt(Math.floor(Math.random() * leds.count), col.set(pick([0x22c55e, 0x22c55e, 0x16a34a, 0x38bdf8, 0xf59e0b, 0x052e16]))); leds.instanceColor.needsUpdate = true; }
  holo.rotation.y += rdt * 0.8; holo.rotation.x += rdt * 0.3;
  const recording = agents.some((a) => a.def.home === 'studio' && a.state === 'working' && a.spot === a.home);
  onAirSign.material.emissiveIntensity = recording ? 0.9 + Math.sin(t * 4) * 0.2 : 0.15;

  // kamera
  if (mode === 'orbit') orbit.update();
  else if (mode === 'walk') {
    const k = walk.keys, sp = (k.ShiftLeft || k.ShiftRight ? 5 : 2.4) * rdt;
    let mx = 0, mz = 0;
    if (k.KeyW || k.ArrowUp) mz += 1; if (k.KeyS || k.ArrowDown) mz -= 1; if (k.KeyA || k.ArrowLeft) mx -= 1; if (k.KeyD || k.ArrowRight) mx += 1;
    const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw), rx = Math.cos(walk.yaw), rz = -Math.sin(walk.yaw);
    const nx = camera.position.x + (fx * mz + rx * mx) * sp, nz = camera.position.z + (fz * mz + rz * mx) * sp;
    const free = (x, z) => !isBlockedWall(x, z);
    if (free(nx, camera.position.z)) camera.position.x = nx;
    if (free(camera.position.x, nz)) camera.position.z = nz;
    camera.rotation.order = 'YXZ'; camera.rotation.set(walk.pitch, walk.yaw, 0);
  } else if (mode === 'follow' && followed) {
    // o'tirganda stul suyanchig'i to'smasligi uchun kamera yonroqqa va balandroqqa o'tadi
    const p = followed.root.position, y = followed.yaw, sit = followed.pose === 'sit';
    const back = sit ? 1.9 : 2.6, side = sit ? 1.7 : 0.9;
    tmpV.set(p.x - Math.sin(y) * back + Math.cos(y) * side, sit ? 2.4 : 2.2, p.z - Math.cos(y) * back - Math.sin(y) * side);
    camera.position.lerp(tmpV, Math.min(1, rdt * 3));
    tmpL.set(p.x + Math.sin(y) * 0.6, followed.pose === 'sit' ? 1.05 : 1.4, p.z + Math.cos(y) * 0.6);
    camera.lookAt(tmpL);
  } else if (mode === 'tour') {
    tour.t += rdt; const s = tour.shot;
    if (s.follow) {
      const p = tour.agent.root.position; tour.ang += rdt * 0.25;
      const sitting = tour.agent.pose === 'sit';
      camera.position.set(p.x + Math.sin(tour.ang) * 2.3, sitting ? 1.7 : 2.0, p.z + Math.cos(tour.ang) * 2.3);
      camera.lookAt(p.x, sitting ? 1.15 : 1.5, p.z);
    } else {
      camera.position.lerpVectors(tour.from, tour.to, ease(Math.min(1, tour.t / SHOT_LEN)));
      camera.lookAt(tour.look);
    }
    if (tour.t > SHOT_LEN) nextShot();
  }

  // nomlar: yuqoridan qaraganda kattaroq bo'lsin
  const far = mode === 'orbit' ? Math.min(3, Math.max(1, camera.position.distanceTo(orbit.target) / 14)) : 1;
  for (const a of agents) a.label.scale.set(1.9 * far, 0.65 * far, 1);

  document.getElementById('clock').textContent = (night ? '🌙 ' : '☀️ ') + clockStr();
  ui.refresh();
  sky.position.copy(camera.position);
  shadowElapsed += rdt;
  if (shadowElapsed >= 1 / QUALITY[qualityIndex].shadowHz) { renderer.shadowMap.needsUpdate = true; shadowElapsed = 0; }
  if (composer && QUALITY[qualityIndex].bloom) composer.render();
  else renderer.render(scene, camera);
  if (!document.hidden && rawDelta > 0 && rawDelta < .5) {
    fpsTime += rawDelta; fpsFrames++;
    if (fpsTime >= 1) {
      document.getElementById('sFps').textContent = Math.round(fpsFrames / fpsTime);
      fpsTime = 0; fpsFrames = 0;
    }
  }
  requestAnimationFrame(frame);
}
function isBlockedWall(x, z) { const i = ci(x), j = cj(z); if (i < 0 || j < 0 || i >= GW || j >= GH) return !(Math.abs(x) < 1.4 && z > 13 && z < 30); return wallGrid[j * GW + i] === 1; }

batchFurniture();
ui.build();
setQuality(qualityIndex);
log(`🏢 ${OFFICE_NAME} ochildi. ${agents.length} ta agent ishga tushdi`, 'ev');
drawHQ();
resize();
setMode('orbit');
document.getElementById('loading').remove();
frame();
