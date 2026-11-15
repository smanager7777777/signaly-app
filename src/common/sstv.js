/* СИГНАЛЫ — SSTV: кодировщик (картинка → звук), потоковый декодер (звук с микрофона → картинка), WAV.
   Режимы и времена — по спецификации SSTV (JL Barber, «Proposal for SSTV Mode Specifications»);
   те же режимы понимают Robot36 и радио с декодером движка Twine СИГНАЛЫ.
   Частота 1200 Гц — синхроимпульс, 1500 Гц — чёрный, 2300 Гц — белый.
   Работает в браузере, в приложении и в Node (root.SGSSTV). */
(function (root) {
  'use strict';

  /* ---------- режимы ---------- */
  // часть строки: {ms, f} — тон; {ms, ch} — развёртка канала; sync — синхроимпульс; sep — разделитель Robot 36
  function T(ms, f) { return { ms: ms, f: f }; }
  function S(ms) { return { ms: ms, f: 1200, sync: true }; }
  function C(ms, ch) { return { ms: ms, ch: ch }; }

  function martin(name, vis, s) {
    return { name: name, vis: vis, width: 320, height: 256, per: 1, color: 'rgb', prefix: [],
      line: function () { return [S(4.862), T(0.572, 1500), C(s, 'G'), T(0.572, 1500), C(s, 'B'), T(0.572, 1500), C(s, 'R'), T(0.572, 1500)]; } };
  }
  function scottie(name, vis, s) {
    return { name: name, vis: vis, width: 320, height: 256, per: 1, color: 'rgb', prefix: [S(9)],
      line: function () { return [T(1.5, 1500), C(s, 'G'), T(1.5, 1500), C(s, 'B'), S(9), T(1.5, 1500), C(s, 'R')]; } };
  }
  function pd(name, vis, w, hgt, s) {
    return { name: name, vis: vis, width: w, height: hgt, per: 2, color: 'pd', prefix: [],
      line: function () { return [S(20), T(2.08, 1500), C(s, 'Y0'), C(s, 'V'), C(s, 'U'), C(s, 'Y1')]; } };
  }
  var MODES = [
    { name: 'Robot 36', vis: 8, width: 320, height: 240, per: 1, color: 'robot36', prefix: [],
      line: function (k) { return [S(9), T(3, 1500), C(88, 'Y'), { ms: 4.5, f: k % 2 ? 2300 : 1500, sep: true }, T(1.5, 1900), C(44, 'C')]; } },
    { name: 'Robot 72', vis: 12, width: 320, height: 240, per: 1, color: 'yuv', prefix: [],
      line: function () { return [S(9), T(3, 1500), C(138, 'Y'), T(4.5, 1500), T(1.5, 1900), C(69, 'V'), T(4.5, 2300), T(1.5, 1900), C(69, 'U')]; } },
    martin('Martin 1', 44, 146.432),
    martin('Martin 2', 40, 73.216),
    scottie('Scottie 1', 60, 138.24),
    scottie('Scottie 2', 56, 88.064),
    scottie('Scottie DX', 76, 345.6),
    pd('PD 50', 93, 320, 256, 91.52),
    pd('PD 90', 99, 320, 256, 170.24),
    pd('PD 120', 95, 640, 496, 121.6),
    pd('PD 160', 98, 512, 400, 195.584),
    pd('PD 180', 96, 640, 496, 183.04),
    pd('PD 240', 97, 640, 496, 244.48),
    pd('PD 290', 94, 800, 616, 228.8)
  ];
  function mode(name) {
    var n = String(name || '').trim().toLowerCase();
    for (var i = 0; i < MODES.length; i++) if (MODES[i].name.toLowerCase() === n) return MODES[i];
    return null;
  }
  function sum(segs) { var t = 0; for (var i = 0; i < segs.length; i++) t += segs[i].ms; return t; }
  function lineMs(m) { return sum(m.line(0)); }
  function prefixMs(m) { return sum(m.prefix); }
  function syncAt(m) {   // где в строке синхроимпульс, мс от начала строки
    var segs = m.line(0), t = 0;
    for (var i = 0; i < segs.length; i++) { if (segs[i].sync) return { at: t, ms: segs[i].ms }; t += segs[i].ms; }
    return { at: 0, ms: 0 };
  }
  /* Длительность передачи, секунды (заголовок + строки). */
  function duration(m) { return 0.91 + (prefixMs(m) + lineMs(m) * Math.ceil(m.height / m.per)) / 1000; }

  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
  function toYuv(r, g, b) {
    return [0.299 * r + 0.587 * g + 0.114 * b, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b];
  }

  /* ---------- кодировщик ---------- */
  /* rgba — картинка width×height (растягивается под режим). lead — секунд тишины до и после.
     Возвращает Float32Array (−0,7…0,7). */
  function encode(m, rgba, width, height, rate, lead) {
    lead = lead || 0;
    var W = m.width, H = m.height;
    var cache = {};
    function yuvAt(x, y) {
      var key = y * W + x;
      var v = cache[key];
      if (v) return v;
      var sx = Math.min(width - 1, Math.floor(x * width / W)), sy = Math.min(height - 1, Math.floor(y * height / H));
      var i = (sy * width + sx) * 4;
      v = { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] };
      v.yuv = toYuv(v.r, v.g, v.b);
      cache[key] = v;
      return v;
    }
    function value(ch, k, x) {
      var row = m.per === 2 ? k * 2 : k, last = H - 1;
      switch (ch) {
        case 'R': return yuvAt(x, row).r;
        case 'G': return yuvAt(x, row).g;
        case 'B': return yuvAt(x, row).b;
        case 'Y': case 'Y0': return yuvAt(x, row).yuv[0];
        case 'Y1': return yuvAt(x, Math.min(last, row + 1)).yuv[0];
        case 'U': case 'V': {
          var j = ch === 'U' ? 1 : 2;
          return m.per === 2 ? (yuvAt(x, row).yuv[j] + yuvAt(x, Math.min(last, row + 1)).yuv[j]) / 2 : yuvAt(x, row).yuv[j];
        }
        case 'C': {   // Robot 36: чётная строка — R-Y пары строк, нечётная — B-Y
          var top = k - k % 2, c = k % 2 ? 1 : 2;
          return (yuvAt(x, top).yuv[c] + yuvAt(x, Math.min(last, top + 1)).yuv[c]) / 2;
        }
      }
      return 0;
    }
    var parts = [], t = lead;
    function push(seg, k) { parts.push({ t0: t, t1: t + seg.ms / 1000, f: seg.f, ch: seg.ch, k: k }); t += seg.ms / 1000; }
    // заголовок VIS: 1900 300 мс, 1200 10 мс, 1900 300 мс, старт 1200 30 мс, 7 бит младшим вперёд (1 — 1100, 0 — 1300),
    // чётность (чётное число единиц), стоп 1200 30 мс
    [T(300, 1900), T(10, 1200), T(300, 1900), T(30, 1200)].forEach(function (s) { push(s, 0); });
    var ones = 0;
    for (var b = 0; b < 7; b++) { var bit = (m.vis >> b) & 1; ones += bit; push(T(30, bit ? 1100 : 1300), 0); }
    push(T(30, ones % 2 ? 1100 : 1300), 0);
    push(T(30, 1200), 0);
    m.prefix.forEach(function (s) { push(s, 0); });
    var lines = Math.ceil(H / m.per);
    for (var k = 0; k < lines; k++) m.line(k).forEach(function (s) { push(s, k); });
    var total = Math.ceil((t + lead) * rate);
    var out = new Float32Array(total);
    var phase = 0, p = 0, TWO = 2 * Math.PI;
    for (var n = 0; n < total; n++) {
      var time = n / rate;
      while (p < parts.length && time >= parts[p].t1) p++;
      if (p >= parts.length || time < parts[p].t0) continue;
      var part = parts[p], f;
      if (part.ch) {
        var x = Math.min(W - 1, Math.floor((time - part.t0) / (part.t1 - part.t0) * W));
        f = 1500 + clamp(value(part.ch, part.k, x)) * 800 / 255;
      } else f = part.f;
      phase += TWO * f / rate;
      if (phase > TWO) phase -= TWO;
      out[n] = 0.7 * Math.sin(phase);
    }
    return out;
  }

  /* WAV 16 бит моно. */
  function wav(samples, rate) {
    var n = samples.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
    return buf;
  }

  /* ---------- потоковый декодер ----------
     var d = new Decoder(rate, {onStart, onLine, onDone}); d.push(Float32Array) — сколько угодно раз.
     onStart({mode}) — услышан заголовок; onLine(img) — набраны новые строки; onDone(img) — картинка готова.
     img: {mode, width, height, rows (готово строк картинки), rgba (Uint8ClampedArray), quality (0…1)}.
     Звук сначала переносится к 1900 Гц и фильтруется, затем частота считается ~12 000 раз в секунду. */
  function Decoder(rate, cb) {
    this.rate = rate;
    this.cb = cb || {};
    this.D = Math.max(1, Math.round(rate / 12000));
    this.fr = rate / this.D;            // частота отсчётов частоты
    this.ms = this.fr / 1000;
    // фильтр нижних частот (окно Ханна), ~1,3 мс
    var taps = Math.max(5, Math.round(rate * 0.0013) | 1);
    var fc = 1300 / rate, h = new Float32Array(taps), s = 0, half = (taps - 1) / 2;
    for (var i = 0; i < taps; i++) {
      var q = i - half;
      h[i] = (q === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * q) / (Math.PI * q)) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (taps - 1)));
      s += h[i];
    }
    for (i = 0; i < taps; i++) h[i] /= s;
    this.h = h;
    this.re = new Float32Array(taps);   // кольцо смешанных отсчётов
    this.im = new Float32Array(taps);
    this.ri = 0;
    this.cnt = 0;
    this.c = 1; this.sn = 0;
    this.step = 2 * Math.PI * 1900 / rate;
    this.pr = 0; this.pi = 0;
    this.F = new Float32Array(1 << 16); // частота
    this.P = new Float64Array((1 << 16) + 1); // накопленные суммы частоты
    this.len = 0;                        // отсчётов в буфере
    this.base = 0;                       // абсолютный номер первого отсчёта буфера
    this.scanFrom = 0;                   // откуда искать заголовок (абсолютный)
    this.img = null;
    this.level = 0;
  }
  var DP = Decoder.prototype;

  DP.push = function (x) {
    var n = x.length, h = this.h, taps = h.length, re = this.re, im = this.im, D = this.D;
    var cs = Math.cos(this.step), ss = Math.sin(this.step);
    var e = 0;
    for (var i = 0; i < n; i++) {
      var v = x[i];
      e += v * v;
      re[this.ri] = v * this.c;
      im[this.ri] = -v * this.sn;
      this.ri = (this.ri + 1) % taps;
      var nc = this.c * cs - this.sn * ss;
      this.sn = this.sn * cs + this.c * ss;
      this.c = nc;
      if (++this.cnt % D) continue;
      if ((this.cnt & 4095) < D) { var r = Math.hypot(this.c, this.sn); this.c /= r; this.sn /= r; }
      var a = 0, b = 0, j = this.ri;
      for (var t = 0; t < taps; t++) { a += re[j] * h[t]; b += im[j] * h[t]; j = j + 1 === taps ? 0 : j + 1; }
      var dr = a * this.pr + b * this.pi, di = b * this.pr - a * this.pi;
      this.pr = a; this.pi = b;
      this.add(1900 + Math.atan2(di, dr) * this.fr / (2 * Math.PI));
    }
    this.level = n ? Math.sqrt(e / n) : 0;
    this.process();
  };

  DP.add = function (f) {
    if (this.len + 1 >= this.F.length) {
      var F = new Float32Array(this.F.length * 2); F.set(this.F); this.F = F;
      var P = new Float64Array(this.F.length + 1); P.set(this.P); this.P = P;
    }
    this.F[this.len] = f;
    this.P[this.len + 1] = this.P[this.len] + f;
    this.len++;
  };
  /* выбросить всё до абсолютного отсчёта abs */
  DP.trim = function (abs) {
    var k = Math.floor(abs - this.base);
    if (k <= 0) return;
    k = Math.min(k, this.len);
    this.F.copyWithin(0, k, this.len);
    this.len -= k;
    this.base += k;
    this.P[0] = 0;
    for (var i = 0; i < this.len; i++) this.P[i + 1] = this.P[i] + this.F[i];
  };
  DP.end = function () { return this.base + this.len; };
  /* средняя частота на отрезке [a, b) (абсолютные номера) */
  DP.mean = function (a, b) {
    var x = Math.max(0, Math.floor(a - this.base)), y = Math.min(this.len, Math.ceil(b - this.base));
    if (y <= x) { y = Math.min(this.len, x + 1); if (y <= x) return 0; }
    return (this.P[y] - this.P[x]) / (y - x);
  };
  DP.sm = function (i) { var w = 0.75 * this.ms; return this.mean(i - w, i + w + 1); };

  DP.process = function () {
    for (var guard = 0; guard < 4; guard++) {
      if (!this.img) {
        if (!this.findVis() && !this.findTrain()) {
          // держим ~1,5 с на случай заголовка на стыке
          var keep = this.end() - 1500 * this.ms;
          if (keep - this.base > 3000 * this.ms) this.trim(keep);
          return;
        }
      }
      if (!this.track()) return;
    }
  };

  /* заголовок VIS: перепад 1900 → 1200 Гц (стартовый бит), 8 бит по 30 мс, стоп */
  DP.findVis = function () {
    var ms = this.ms, end = this.end() - 310 * ms;
    var i = Math.max(this.scanFrom, this.base + Math.round(160 * ms));
    for (; i < end; i++) {
      if (!(this.sm(i) < 1550 && this.sm(i - 1) >= 1550)) continue;
      var lead = this.mean(i - 150 * ms, i - 12 * ms);
      if (Math.abs(lead - 1900) > 100) continue;
      var st = this.mean(i + 6 * ms, i + 24 * ms);
      if (st < 1080 || st > 1320) continue;
      var code = 0, ok = true, ones = 0;
      for (var b = 0; b < 8 && ok; b++) {
        var m = this.mean(i + (36 + 30 * b) * ms, i + (54 + 30 * b) * ms);
        if (m > 1030 && m < 1170) { ones++; if (b < 7) code |= 1 << b; }
        else if (!(m > 1230 && m < 1370)) ok = false;
      }
      var stop = this.mean(i + 276 * ms, i + 294 * ms);
      if (!ok || stop < 1080 || stop > 1320) continue;
      var md = null;
      for (var q = 0; q < MODES.length; q++) if (MODES[q].vis === code) md = MODES[q];
      if (!md) continue;
      if (ones % 2) { /* чётность не сошлась — всё равно принимаем, если режим известен */ }
      this.start(md, i + 300 * ms);
      return true;
    }
    this.scanFrom = Math.max(this.scanFrom, end);
    return false;
  };

  DP.start = function (md, at, headless) {
    var ms = this.ms, sa = syncAt(md);
    var L = lineMs(md) * ms;
    var a0 = at + prefixMs(md) * ms + sa.at * ms;   // начало синхроимпульса строки 0
    this.img = {
      mode: md, L: L, a: a0, b: L, a0: a0, sa: sa, lines: Math.ceil(md.height / md.per),
      k: 0, found: [], byK: {}, misses: 0, last: -1, decoded: 0, chan: [], chroma: [], dead: 0, cand: null, headless: !!headless,
      out: { mode: md.name, width: md.width, height: md.height, rows: 0, quality: 0,
        rgba: new Uint8ClampedArray(md.width * md.height * 4) }
    };
    for (var i = 3; i < this.img.out.rgba.length; i += 4) this.img.out.rgba[i] = 255;
    this.trim(at - 50 * ms);
    this.edges = [];
    if (this.cb.onStart) this.cb.onStart({ mode: md.name, width: md.width, height: md.height, headless: !!headless });
  };

  /* Приём с середины передачи (заголовок не услышан): цепочка синхроимпульсов с шагом строки режима.
     Импульс — участок ниже 1350 Гц длиной как синхроимпульс режима. Нужно 4 импульса подряд. */
  DP.findTrain = function () {
    var ms = this.ms, end = this.end() - 30 * ms;
    var i = Math.max(this.trainFrom || 0, this.base + 2 * ms);
    var E = this.edges || (this.edges = []);
    var fresh = false;
    for (; i < end; i++) {
      if (!(this.sm(i) < 1350 && this.sm(i - 1) >= 1350)) continue;
      var w = 0;
      while (i + w < end && w < 30 * ms && this.sm(i + w) < 1400) w++;
      var wm = w / ms;
      if (wm >= 3 && wm <= 25 && this.mean(i + w + ms, i + w + 3 * ms) > 1420) { E.push([i, wm]); fresh = true; }
      i += Math.max(0, w - 1);
    }
    this.trainFrom = Math.max(this.trainFrom || 0, end);
    while (E.length && E[0][0] < this.end() - 6000 * ms) E.shift();
    if (!fresh || E.length < 4) return false;
    var last = E[E.length - 1], best = null;
    for (var q = 0; q < MODES.length; q++) {
      var md = MODES[q], sw = syncAt(md).ms, L = lineMs(md) * ms;
      if (Math.abs(last[1] - sw) > Math.max(2.5, sw * 0.35)) continue;
      var first = last, hits = 0;
      for (var k = 1; k <= 3; k++) {
        var want = last[0] - k * L, tol = (1.5 + 0.6 * k) * ms, got = null;
        for (var j = E.length - 2; j >= 0; j--) if (Math.abs(E[j][0] - want) <= tol && Math.abs(E[j][1] - sw) <= Math.max(2.5, sw * 0.35)) { got = E[j]; break; }
        if (!got) break;
        hits++; first = got;
      }
      if (hits === 3 && (!best || L < best.L)) best = { md: md, L: L, first: first };
    }
    if (!best) return false;
    var sa = syncAt(best.md);
    this.scanFrom = this.end();
    this.start(best.md, best.first[0] - (sa.at + prefixMs(best.md)) * ms, true);
    return true;
  };

  /* «живой» ли сигнал на [a, b): у тонов SSTV частота меняется плавно (средний скачок между отсчётами
     десятки Гц, в сильном шуме — до ~250), у шума и тишины — ~600 Гц. Цифровая тишина — ровно 1900. */
  DP.alive = function (a, b) {
    var x = Math.max(1, Math.floor(a - this.base)), y = Math.min(this.len, Math.ceil(b - this.base)), n = 0, sm = 0, flat = 0;
    for (var i = x; i < y; i++) { var f = this.F[i]; sm += Math.abs(f - this.F[i - 1]); if (f === 1900) flat++; n++; }
    return n > 0 && sm / n < 420 && flat < n * 0.5;
  };

  /* поправка к прямой для строки k: медиана отклонений найденных импульсов рядом (±4 строки).
     Так картинка не съезжает после пропуска звука (телефон иногда теряет кусочек записи). */
  DP.offset = function (k, img) {
    var I = img || this.img, r = [];
    for (var j = k - 4; j <= k + 4; j++) if (I.byK[j] != null) r.push(I.byK[j] - (I.a + I.b * j));
    if (!r.length) {
      var f = I.found;
      for (var q = Math.max(0, f.length - 5); q < f.length; q++) r.push(f[q][1] - (I.a + I.b * f[q][0]));
    }
    if (!r.length) return 0;
    r.sort(function (x, y) { return x - y; });
    return r[r.length >> 1];
  };
  /* где ждать синхроимпульс строки k */
  DP.predict = function (k) {
    var I = this.img, f = I.found;
    if (f.length && !I.fitted) { var l = f[f.length - 1]; return l[1] + I.b * (k - l[0]); }
    return I.a + I.b * k + this.offset(k);
  };
  /* синхроимпульс около p (±w): окно длиной в импульс с самой низкой средней частотой;
     в шуме это надёжнее, чем порог по отдельным отсчётам */
  DP.findSync = function (p, w, len) {
    var from = Math.round(p - w), to = Math.round(p + w), best = -1, bv = 1e9;
    for (var i = from; i <= to; i++) {
      var m = this.mean(i, i + len);
      if (m < bv - 0.01 || (Math.abs(m - bv) <= 0.01 && Math.abs(i - p) < Math.abs(best - p))) { bv = m; best = i; }
    }
    // импульс 1200 Гц, вокруг — от 1500 Гц: середина 1350, в шуме допускаем чуть выше
    return bv < 1390 ? best : -1;
  };
  /* прямая «номер строки → отсчёт импульса» по найденным импульсам, без выбросов */
  DP.fit = function () {
    var I = this.img, pts = I.found;
    function line(use) {
      var sk = 0, st = 0, skk = 0, skt = 0, n = use.length;
      use.forEach(function (q) { sk += q[0]; st += q[1]; skk += q[0] * q[0]; skt += q[0] * q[1]; });
      var d = n * skk - sk * sk;
      if (n < 2 || !d) return null;
      var b = (n * skt - sk * st) / d;
      return { a: (st - b * sk) / n, b: b };
    }
    var f = line(pts);
    if (!f) return;
    for (var pass = 0; pass < 3; pass++) {
      var res = pts.map(function (q) { return Math.abs(f.a + f.b * q[0] - q[1]); });
      var sorted = res.slice().sort(function (x, y) { return x - y; });
      // допуск: не меньше 1,5 мс и втрое больше типичного разброса (в шуме импульсы «дрожат»)
      var tol = Math.max(1.5 * this.ms, 3 * sorted[Math.floor(sorted.length / 2)]);
      var use = pts.filter(function (q, i) { return res[i] <= tol; });
      if (use.length < 6) break;
      f = line(use) || f;
    }
    if (Math.abs(f.b / I.L - 1) > 0.02) return;   // часы передатчика не уходят больше чем на 2 %
    I.a = f.a; I.b = f.b; I.fitted = true;
  };

  /* найти синхроимпульсы и набрать готовые строки; true — картинка закончена */
  DP.track = function () {
    var I = this.img, ms = this.ms, md = I.mode;
    var syncLen = Math.max(2, Math.round(I.sa.ms * ms));
    var changed = false;
    var deadMax = Math.max(8, Math.round(5000 * ms / I.L));   // ~5 с без сигнала — передача кончилась
    var missMax = I.fitted ? Math.max(40, Math.round(20000 * ms / I.L)) : 12;
    while (I.k < I.lines) {
      // после пропусков импульсов окно поиска шире: звук мог «перескочить» (потерянный кусочек записи)
      var w = Math.min(Math.min(I.L * 0.06, 12 * ms) + (I.fitted ? 0 : 3 * ms) + Math.min(I.misses, 6) * 8 * ms, I.L * 0.45);
      var p = this.predict(I.k);
      if (p + Math.max(w + syncLen + 2 * ms, I.L) >= this.end()) break;
      I.dead = this.alive(p - I.sa.at * ms, p - I.sa.at * ms + I.L) ? 0 : I.dead + 1;
      var s = I.dead ? -1 : this.findSync(p, w, syncLen);
      if (s >= 0 && I.fitted) {
        // после подгонки сдвиг строки принимаем, только если он совпал с ожидаемым или подтвердился
        // следующим импульсом: шорох и удары по микрофону дают случайные «импульсы», пропуск звука — ровный сдвиг
        var dev = s - (I.a + I.b * I.k), exp = this.offset(I.k), tol = 2 * ms;
        if (Math.abs(dev - exp) > tol) {
          var c = I.cand;
          if (c && c.k === I.k - 1 && Math.abs(c.dev - dev) <= tol) { I.found.push([c.k, c.s]); I.byK[c.k] = c.s; I.cand = null; }
          else { I.cand = { k: I.k, s: s, dev: dev }; s = -1; }
        }
      }
      if (s >= 0) {
        I.found.push([I.k, s]); I.byK[I.k] = s; I.last = I.k; I.misses = 0;
        if (I.found.length >= 6) this.fit();
      } else if (++I.misses > missMax || I.dead > deadMax) break;
      I.k++;
    }
    var lost = I.misses > missMax || I.dead > deadMax;
    // строки, чьи звуки уже есть целиком
    var scale = I.b / I.L;
    var self = this;
    var lineEnd = function (k) { return I.a + I.b * (k + 1) + (I.fitted ? self.offset(k, I) : 0) - I.sa.at * ms * scale; };
    var limit = lost || I.dead ? Math.min(I.k, I.last + 1) : I.k;
    var before = I.decoded;
    while (I.decoded < limit && lineEnd(I.decoded) <= this.end()) { I.decoded++; changed = true; }
    if (changed) {
      // перерисовываем всё набранное: прямая строк уточняется с каждым импульсом
      if (I.decoded - before >= 1 && (I.decoded % 8 === 0 || I.decoded === limit)) this.render(I.decoded);
      else this.render(I.decoded, before);
    }
    var done = lost || (I.k >= I.lines && I.decoded >= limit);
    if (!done) return false;
    if (I.found.length < 6) I.decoded = 0;
    this.render(I.decoded);
    var out = I.out;
    out.quality = I.decoded ? Math.min(1, I.found.length / I.decoded) : 0;
    this.img = null;
    this.scanFrom = I.decoded ? Math.round(lineEnd(I.decoded - 1)) : Math.round(I.a0);
    this.trim(this.scanFrom - 400 * ms);
    if (I.decoded && this.cb.onDone) this.cb.onDone(out);
    return true;
  };

  /* набрать строки передачи [from, rows) по текущей прямой */
  DP.render = function (rows, from) {
    var I = this.img, md = I.mode, ms = this.ms, W = md.width, H = md.height, rgba = I.out.rgba;
    var scale = I.b / I.L, self = this;
    from = from || 0;
    if (md.color === 'robot36') from -= from % 2;
    var lv = function (v) { return clamp(Math.round((v - 1500) * 255 / 800)); };
    for (var k = from; k < rows; k++) {
      var segs = md.line(k), ch = {}, t = I.a + I.b * k + (I.fitted ? self.offset(k) : 0) - I.sa.at * ms * scale;
      for (var q = 0; q < segs.length; q++) {
        var sg = segs[q], len = sg.ms * ms * scale;
        if (sg.ch) {
          var vals = new Uint8ClampedArray(W);
          for (var x = 0; x < W; x++) vals[x] = lv(self.mean(t + x * len / W, t + (x + 1) * len / W));
          var edge = Math.min(Math.floor(W / 8), Math.ceil(0.65 * W / (sg.ms * scale)));
          for (x = 0; x < edge; x++) { vals[x] = vals[edge]; vals[W - 1 - x] = vals[W - 1 - edge]; }
          ch[sg.ch] = vals;
        }
        if (sg.sep) I.chroma[k] = self.mean(t + len * 0.2, t + len * 0.8) > 1900;   // true — B-Y
        t += len;
      }
      I.chan[k] = ch;
    }
    function put(y, x, r, g, b) {
      if (y >= H) return;
      var i = (y * W + x) * 4;
      rgba[i] = clamp(r); rgba[i + 1] = clamp(g); rgba[i + 2] = clamp(b);
    }
    function yuv(y, x, Y, U, V) { put(y, x, Y + 1.402 * (V - 128), Y - 0.344136 * (U - 128) - 0.714136 * (V - 128), Y + 1.772 * (U - 128)); }
    for (k = from; k < rows; k++) {
      var c = I.chan[k];
      for (x = 0; x < W; x++) {
        if (md.color === 'rgb') put(k, x, c.R[x], c.G[x], c.B[x]);
        else if (md.color === 'yuv') yuv(k, x, c.Y[x], c.U[x], c.V[x]);
        else if (md.color === 'pd') { yuv(2 * k, x, c.Y0[x], c.U[x], c.V[x]); yuv(2 * k + 1, x, c.Y1[x], c.U[x], c.V[x]); }
        else {
          var top = k - k % 2, U = 128, V = 128;
          for (var j = top; j <= top + 1 && j < rows; j++) {
            if (!I.chan[j]) continue;
            if (I.chroma[j]) U = I.chan[j].C[x]; else V = I.chan[j].C[x];
          }
          yuv(k, x, c.Y[x], U, V);
        }
      }
    }
    I.out.rows = Math.min(H, rows * md.per);
    I.out.quality = rows ? Math.min(1, I.found.length / Math.max(1, I.k)) : 0;
    if (this.cb.onLine) this.cb.onLine(I.out);
  };
  /* бросить текущую картинку (например, «Стоп») */
  DP.reset = function () { this.img = null; this.scanFrom = this.end(); this.trim(this.end() - 400 * this.ms); };

  root.SGSSTV = { MODES: MODES, mode: mode, duration: duration, lineMs: lineMs, encode: encode, wav: wav, Decoder: Decoder };
})(typeof window !== 'undefined' ? window : globalThis);
