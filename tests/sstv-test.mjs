// СИГНАЛЫ — проверка SSTV: картинка → звук → (шум, уход часов, куски по 4096) → потоковый декодер → картинка.
// node tests/sstv-test.mjs [режим …]
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
require(resolve(root, 'src/common/sstv.js'));
const S = globalThis.SGSSTV;

let passed = 0, failed = 0;
const ok = (c, what) => { if (c) { passed++; console.log('  ✓', what); } else { failed++; console.log('  ✗', what); } };

// тестовая картинка: цветные полосы сверху, градиент, белый квадрат в чёрной рамке
function picture(W, H) {
  const px = new Uint8ClampedArray(W * H * 4);
  const bars = [[255, 255, 255], [255, 255, 0], [0, 255, 255], [0, 255, 0], [255, 0, 255], [255, 0, 0], [0, 0, 255], [0, 0, 0]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c;
    if (y < H / 3) c = bars[Math.floor(x * 8 / W)];
    else if (y < H * 2 / 3) { const v = Math.round(x * 255 / (W - 1)); c = [v, v, v]; }
    else {
      const inBox = x > W * 0.3 && x < W * 0.7 && y > H * 0.72 && y < H * 0.95;
      c = inBox ? [255, 255, 255] : [20, 60, 20];
    }
    const i = (y * W + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return px;
}

function resample(x, k) {   // часы передатчика спешат: k > 1 — звук длиннее
  const n = Math.floor(x.length * k), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / k, j = Math.floor(t), f = t - j;
    out[i] = (x[j] || 0) * (1 - f) + (x[j + 1] || 0) * f;
  }
  return out;
}
let seed = 1;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

function run(name, rate, { drift = 1, noise = 0, gain = 1, lead = 1.5 } = {}) {
  const m = S.mode(name);
  const W = 320, H = 240;
  const src = picture(W, H);
  let x = S.encode(m, src, W, H, rate, lead);
  if (drift !== 1) x = resample(x, drift);
  for (let i = 0; i < x.length; i++) x[i] = x[i] * gain + noise * gauss();
  let started = null, done = null, lines = 0;
  const d = new S.Decoder(rate, { onStart: (e) => { started = e; if (process.env.DBG) console.log('    start', e.mode, (d.end() / d.fr).toFixed(2)); }, onLine: () => { lines++; }, onDone: (img) => { done = img; if (process.env.DBG) console.log('    done', img.rows, (d.end() / d.fr).toFixed(2)); } });
  const t0 = Date.now();
  for (let i = 0; i < x.length; i += 4096) d.push(x.subarray(i, i + 4096));
  const ms = Date.now() - t0;
  if (!done) return { started, done, ms };
  // сравнение с исходной картинкой (масштаб под режим), без краёв
  let err = 0, n = 0;
  for (let y = 4; y < done.rows - 4; y++) for (let xx = 8; xx < done.width - 8; xx++) {
    const sy = Math.min(H - 1, Math.floor(y * H / done.height)), sx = Math.min(W - 1, Math.floor(xx * W / done.width));
    // пропускаем границы зон картинки: там смешение соседних точек законно
    const fy = sy / H;
    if (Math.abs(fy - 1 / 3) < 0.03 || Math.abs(fy - 2 / 3) < 0.03 || Math.abs(fy - 0.72) < 0.03 || Math.abs(fy - 0.95) < 0.03) continue;
    const fx = sx / W;
    if (sy < H / 3 && Math.abs(fx * 8 - Math.round(fx * 8)) < 0.12) continue;
    if (sy > H * 0.7 && (Math.abs(fx - 0.3) < 0.03 || Math.abs(fx - 0.7) < 0.03)) continue;
    for (let c = 0; c < 3; c++) { err += Math.abs(done.rgba[(y * done.width + xx) * 4 + c] - src[(sy * W + sx) * 4 + c]); n++; }
  }
  return { started, done, err: err / n, lines, ms, secs: x.length / rate };
}

function save(img, file) {
  // PPM — смотреть глазами
  const head = `P6 ${img.width} ${img.rows} 255\n`;
  const body = Buffer.alloc(img.width * img.rows * 3);
  for (let i = 0, j = 0; i < img.width * img.rows; i++) { body[j++] = img.rgba[i * 4]; body[j++] = img.rgba[i * 4 + 1]; body[j++] = img.rgba[i * 4 + 2]; }
  writeFileSync(file, Buffer.concat([Buffer.from(head), body]));
}

mkdirSync('/tmp/sg-sstv', { recursive: true });
const modes = process.argv.slice(2).length ? process.argv.slice(2) : ['Robot 36', 'Robot 72', 'Martin 1', 'Scottie 1', 'PD 90', 'PD 120'];
for (const name of modes) {
  console.log(name);
  const clean = run(name, 44100);
  ok(clean.started && clean.started.mode === name, 'заголовок узнан: ' + (clean.started && clean.started.mode));
  ok(clean.done && clean.done.rows === S.mode(name).height, 'все строки набраны: ' + (clean.done && clean.done.rows));
  ok(clean.err < 12, 'чистый звук 44,1 кГц: средняя ошибка ' + (clean.err || 0).toFixed(1) + ' из 255; ' + clean.ms + ' мс на ' + (clean.secs || 0).toFixed(0) + ' с звука');
  if (clean.done) save(clean.done, `/tmp/sg-sstv/${name.replace(/ /g, '')}-clean.ppm`);
  const hard = run(name, 48000, { drift: 1.004, noise: 0.25, gain: 0.5 });
  ok(hard.done && hard.done.rows === S.mode(name).height && hard.err < 45 && hard.done.quality > 0.9,
    '48 кГц, часы +0,4 %, шум: строк ' + (hard.done && hard.done.rows) + ', ошибка ' + (hard.err || 0).toFixed(1) + ', синхроимпульсов ' + Math.round(((hard.done && hard.done.quality) || 0) * 100) + ' %');
  if (hard.done) save(hard.done, `/tmp/sg-sstv/${name.replace(/ /g, '')}-noisy.ppm`);
}

// пропуски звука (телефон теряет кусочки записи): 10 мс и 25 мс посреди картинки
{
  const m = S.mode('Robot 36');
  const x = S.encode(m, picture(320, 240), 320, 240, 48000, 1);
  const cut = (a, at, ms) => { const n = Math.round(ms * 48); const o = new Float32Array(a.length - n); o.set(a.subarray(0, at)); o.set(a.subarray(at + n), at); return o; };
  const y = cut(cut(x, 48000 * 15, 10), 48000 * 28, 25);
  let img = null;
  const d = new S.Decoder(48000, { onDone: (i) => { img = i; } });
  for (let i = 0; i < y.length; i += 4096) d.push(y.subarray(i, i + 4096));
  // белый квадрат внизу: его левый край на месте (≈ x 96) и после пропусков
  let edge = -1;
  if (img) for (let xx = 60; xx < 140; xx++) { if (img.rgba[(200 * 320 + xx) * 4] > 128) { edge = xx; break; } }
  ok(img && img.rows === 240 && Math.abs(edge - 97) <= 3, 'пропуски звука 10 и 25 мс: картинка не съехала (край квадрата ' + edge + ')');
}
// «почесал пальцем микрофон»: 2,5 с сильной помехи с перегрузкой посреди картинки — приём не обрывается,
// после помехи строки на месте
function scratchRun(name, at, secs, cutHead, mute) {
  const m = S.mode(name);
  const R = 48000;
  let x = S.encode(m, picture(320, 240), 320, 240, R, 1);
  if (cutHead) x = x.subarray(Math.round(R * cutHead));
  x = Float32Array.from(x);
  for (let i = 0; i < x.length; i++) x[i] = x[i] * 0.5 + 0.05 * gauss();
  if (secs) {
    const a = Math.round(R * at), b = a + Math.round(R * secs);
    // палец на динамике: сигнал почти пропал, вместо него шорох и удары с перегрузкой
    for (let i = a; i < b && i < x.length; i++) {
      const thump = Math.sin(i / R * 2 * Math.PI * 35) * 1.2 * (rnd() < 0.002 ? 3 : 1);
      x[i] = mute ? 0.01 * gauss() : Math.max(-1, Math.min(1, x[i] * 0.04 + 0.6 * gauss() + thump));
    }
  }
  let img = null, st = null;
  const d = new S.Decoder(R, { onStart: (e) => { st = e; }, onDone: (i) => { img = i; } });
  for (let i = 0; i < x.length; i += 4096) d.push(x.subarray(i, i + 4096));
  const tail = new Float32Array(R * 7);
  for (let i = 0; i < tail.length; i++) tail[i] = 0.01 * gauss();
  d.push(tail);
  return { img, st };
}
function rowsErr(img, y0, y1) {
  const src = picture(320, 240);
  let err = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let xx = 20; xx < 300; xx++) {
    const fy = y / 240;
    if (Math.abs(fy - 2 / 3) < 0.03 || Math.abs(fy - 0.72) < 0.03 || Math.abs(fy - 0.95) < 0.03) continue;
    const fx = xx / 320;
    if (y > 240 * 0.7 && (Math.abs(fx - 0.3) < 0.03 || Math.abs(fx - 0.7) < 0.03)) continue;
    for (let c = 0; c < 3; c++) { err += Math.abs(img.rgba[(y * 320 + xx) * 4 + c] - src[(y * 320 + xx) * 4 + c]); n++; }
  }
  return err / n;
}
{
  // Robot 36: строка 150 мс; заголовок ~0,91 с + 1 с тишины; помеха с 12 по 14,5 с — строки ~67…83
  const r = scratchRun('Robot 36', 12, 4);
  ok(r.img && r.img.rows === 240, 'помеха 4 с посреди передачи (сигнал заглушён): приём не оборвался, строк ' + (r.img && r.img.rows));
  const e = r.img ? rowsErr(r.img, 100, 236) : 999;
  ok(e < 25, 'после помехи строки на месте: ошибка ' + e.toFixed(1));
  if (r.img) save(r.img, '/tmp/sg-sstv/Robot36-scratch.ppm');
  const rm = scratchRun('Robot 36', 12, 4, 0, true);
  const em = rm.img ? rowsErr(rm.img, 100, 236) : 999;
  ok(rm.img && rm.img.rows === 240 && em < 25, 'динамик закрыт на 4 с (тишина): приём продолжился, строк ' + (rm.img && rm.img.rows) + ', ошибка после ' + em.toFixed(1));
  if (rm.img) save(rm.img, '/tmp/sg-sstv/Robot36-mute.ppm');
  const r2 = scratchRun('Martin 1', 30, 5);
  const e2 = r2.img ? rowsErr(r2.img, 150, 236) : 999;
  ok(r2.img && r2.img.rows === 256 && e2 < 30, 'Martin 1, помеха 5 с: строк ' + (r2.img && r2.img.rows) + ', ошибка после помехи ' + e2.toFixed(1));
}
{
  // приём с середины: заголовка нет (звук начат на 8-й секунде — это ~40-я строка)
  const r = scratchRun('Robot 36', 0, 0, 8);
  ok(r.st && r.st.mode === 'Robot 36' && r.st.headless, 'без заголовка: режим узнан по синхроимпульсам (' + (r.st && r.st.mode) + ')');
  ok(r.img && r.img.rows >= 150, 'без заголовка: набрано строк ' + (r.img && r.img.rows));
  if (r.img) save(r.img, '/tmp/sg-sstv/Robot36-headless.ppm');
  const r3 = scratchRun('Scottie 1', 0, 0, 20);
  ok(r3.st && r3.st.mode === 'Scottie 1' && r3.img && r3.img.rows >= 120, 'Scottie 1 без заголовка: ' + (r3.st && r3.st.mode) + ', строк ' + (r3.img && r3.img.rows));
}
// шум без сигнала: ложных заголовков нет
{
  const d = new S.Decoder(48000, { onStart: () => { fake++; } });
  let fake = 0;
  const x = new Float32Array(48000 * 20);
  for (let i = 0; i < x.length; i++) x[i] = 0.3 * gauss();
  for (let i = 0; i < x.length; i += 4096) d.push(x.subarray(i, i + 4096));
  ok(fake === 0, '20 с шума: ложных заголовков нет');
  ok(d.len < 48000 / 4 * 5, 'буфер не растёт без сигнала (' + d.len + ' отсчётов)');
}
// две картинки подряд
{
  const m = S.mode('Robot 36');
  const a = S.encode(m, picture(320, 240), 320, 240, 44100, 0.5);
  const both = new Float32Array(a.length * 2); both.set(a); both.set(a, a.length);
  let n = 0;
  const d = new S.Decoder(44100, { onDone: () => { n++; } });
  for (let i = 0; i < both.length; i += 4096) d.push(both.subarray(i, i + 4096));
  ok(n === 2, 'две передачи подряд — две картинки (' + n + ')');
}
// WAV
{
  const w = S.wav(new Float32Array([0, 0.5, -0.5]), 22050);
  const v = new DataView(w);
  ok(w.byteLength === 50 && v.getUint32(24, true) === 22050 && v.getInt16(46, true) === 16383, 'WAV 16 бит моно');
}
console.log(failed ? `${passed}/${passed + failed} проверок SSTV пройдено` : `SSTV: ВСЁ ХОРОШО (${passed})`);
process.exit(failed ? 1 : 0);
