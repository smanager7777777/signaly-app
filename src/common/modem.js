/* СИГНАЛЫ — акустический код (М1) и метка перед картинкой SSTV (Д2).
   Звук: вступление 3700 Гц + 800 Гц (по 150 мс; в SSTV таких частот нет), затем символы-полубайты:
   16 тонов 1500…3375 Гц (шаг 125), тон 60 мс + тишина 20 мс. Данные: длина, байты, CRC-8.
   Свой код (MIT). */
(function (root) {
  'use strict';
  var F0 = 1500, STEP = 125, TONE = 0.060, GAP = 0.020, SYM = TONE + GAP;
  var PRE1 = 3700, PRE2 = 800, PRE = 0.150;

  function crc8(bytes) {
    var c = 0;
    for (var i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (var k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255;
    }
    return c;
  }
  function utf8(s) { return Array.prototype.slice.call(new TextEncoder().encode(String(s))); }

  /* Текст (код) → звук Float32Array. */
  function encode(text, rate, volume) {
    rate = rate || 44100;
    var vol = volume == null ? 0.8 : volume;
    var data = utf8(text).slice(0, 48);
    var bytes = [data.length].concat(data, [crc8(data)]);
    var nib = [];
    bytes.forEach(function (b) { nib.push(b >> 4, b & 15); });
    var n = Math.ceil((PRE * 2 + nib.length * SYM + 0.1) * rate);
    var out = new Float32Array(n);
    var pos = 0, ph = 0;
    function tone(f, sec) {
      var len = Math.round(sec * rate), ramp = Math.round(0.005 * rate);
      for (var i = 0; i < len; i++) {
        ph += 2 * Math.PI * f / rate;
        var e = Math.min(1, i / ramp, (len - i) / ramp);
        out[pos++] = Math.sin(ph) * vol * e;
      }
    }
    function gap(sec) { pos += Math.round(sec * rate); }
    tone(PRE1, PRE); tone(PRE2, PRE);
    nib.forEach(function (v) { tone(F0 + STEP * v, TONE); gap(GAP); });
    return out.subarray(0, Math.min(n, pos + Math.round(0.05 * rate)));
  }

  function goertzel(buf, start, len, f, rate) {
    var w = 2 * Math.PI * f / rate, c = 2 * Math.cos(w), s1 = 0, s2 = 0;
    for (var i = 0; i < len; i++) { var s0 = buf[start + i] + c * s1 - s2; s2 = s1; s1 = s0; }
    return s1 * s1 + s2 * s2 - c * s1 * s2;
  }

  /* Потоковый приём: push(кусок звука) → onCode(текст). */
  function Decoder(rate, onCode) {
    this.rate = rate;
    this.onCode = onCode;
    this.hop = Math.round(rate * 0.010);
    this.buf = new Float32Array(Math.round(rate * 6));   // кольцо: последние 6 с
    this.total = 0;      // всего принято отсчётов
    this.done = 0;       // разобрано до (отсчёт)
    this.st = 0;         // 0 — ждём 3700, 1 — ждём 800, 2 — данные
    this.run = 0;
    this.t0 = 0;
    this.nib = [];
  }
  Decoder.prototype.at = function (i) { return this.buf[i % this.buf.length]; };
  Decoder.prototype.slice = function (start, len) {
    var o = new Float32Array(len);
    for (var i = 0; i < len; i++) o[i] = this.at(start + i);
    return o;
  };
  Decoder.prototype.push = function (chunk) {
    var L = this.buf.length;
    for (var i = 0; i < chunk.length; i++) this.buf[(this.total + i) % L] = chunk[i];
    this.total += chunk.length;
    if (this.done < this.total - L) this.done = this.total - L;
    var hop = this.hop, rate = this.rate;
    while (this.st < 2 && this.done + hop <= this.total) {
      var fr = this.slice(this.done, hop);
      var en = 0;
      for (var k = 0; k < hop; k++) en += fr[k] * fr[k];
      en = en * hop / 2 + 1e-9;
      var p1 = goertzel(fr, 0, hop, PRE1, rate) / en, p2 = goertzel(fr, 0, hop, PRE2, rate) / en;
      var loud = en / hop > 1e-6;
      if (this.st === 0) {
        this.run = loud && p1 > 0.45 ? this.run + 1 : 0;
        if (this.run >= 8) { this.st = 1; this.run = 0; this.miss = 0; }
      } else if (this.st === 1) {
        if (loud && p2 > 0.45) { this.run++; this.miss = 0; }
        else if (this.run >= 8) {
          // вступление кончилось: символы идут ровно от этой точки
          this.st = 2; this.t0 = this.done; this.nib = [];
        } else if (++this.miss > 20) { this.st = 0; this.run = 0; }
      }
      this.done += hop;
    }
    if (this.st === 2) this.symbols();
  };
  Decoder.prototype.symbols = function () {
    var rate = this.rate;
    while (true) {
      var i = this.nib.length;
      var start = this.t0 + Math.round((i * SYM + 0.010) * rate);
      var len = Math.round(0.040 * rate);
      if (start + len > this.total) return;
      var w = this.slice(start, len);
      var best = 0, bp = -1;
      for (var v = 0; v < 16; v++) {
        var pw = goertzel(w, 0, len, F0 + STEP * v, rate);
        if (pw > bp) { bp = pw; best = v; }
      }
      this.nib.push(best);
      var n = this.nib.length;
      if (n === 2) {
        var ln = this.nib[0] * 16 + this.nib[1];
        if (ln < 1 || ln > 48) { this.reset(); return; }
        this.need = 2 + ln * 2 + 2;
      }
      if (n >= 2 && n === this.need) {
        var bytes = [];
        for (var k = 0; k < n; k += 2) bytes.push(this.nib[k] * 16 + this.nib[k + 1]);
        var data = bytes.slice(1, -1);
        var ok = crc8(data) === bytes[bytes.length - 1];
        var t = this.t0 + Math.round(n * SYM * rate);
        this.reset();
        this.done = t;
        if (ok && this.onCode) {
          var text;
          try { text = new TextDecoder().decode(new Uint8Array(data)); } catch (e) { text = ''; }
          if (text) this.onCode(text);
        }
        return;
      }
    }
  };
  Decoder.prototype.reset = function () { this.st = 0; this.run = 0; this.nib = []; this.need = 0; };

  function duration(text) { return PRE * 2 + (utf8(text).slice(0, 48).length + 2) * 2 * SYM + 0.05; }

  root.SGModem = { encode: encode, Decoder: Decoder, duration: duration, crc8: crc8 };
})(typeof window !== 'undefined' ? window : globalThis);
