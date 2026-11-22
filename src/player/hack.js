/* СИГНАЛЫ — П25 (06, 141, 148): взлом — ловля волны и чтение экрана жертвы.
   Шкала (P.waveTuner): каналы раскладываются случайно при каждом взломе — настоящие (телефоны, подпись — «частота»
   SG.freqOf), помехи и волны-ловушки (дольше trapSec — сбой у взломщика); поймать — держать в канале holdSec
   (0 — «ПОДКЛЮЧИТЬ» на канале). Та же шкала — режим «ловля волны» у «ПЕРЕХВАТА».
   Программа «ВЗЛОМ»: сеанс — состояние центра «hack:<жертва>:<взломщик>» = {sid, at, until, spy}. Жертва шлёт снимок
   своего экрана (текст и разметка, без картинок и полей) живым потоком {k:'hk', sid, html, css, w, h}; у взломщика
   экран размыт, читается полоса высотой strip строк — её двигают пальцем, положение уходит жертве {k:'hk-strip', y}:
   у неё эта полоса отличается (шум, глитчи, оттенок, монохром; сила растёт). Через from–to с у жертвы — 0/1 и «не те
   буквы». Защита — встряхнуть shakes раз (промежуток gap) или код / фраза defendCode. Итог — result. */
(function () {
  'use strict';
  var P = window.SGP, Net = window.SGNet, SG = window.SG;
  var $ = function (id) { return document.getElementById(id); };
  function esc(t) { return SG.esc(String(t == null ? '' : t)); }
  function mm(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + s % 60).slice(-2); }
  function me() { return P.state && P.state.account; }
  function G() { return P.game; }
  function accName(id) { var a = G() && SG.byId(G().accounts, id); return a ? a.name || a.id : '?'; }

  /* ---------- шкала: ловля волны ---------- */
  /* box — куда нарисовать; o: {targets: [id], onCatch(id), onTrap()} → {stop()} */
  P.waveTuner = function (box, o) {
    var w = G().wave, t = o.targets.slice();
    for (var i = t.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = t[i]; t[i] = t[j]; t[j] = x; }
    var real = t.slice(0, Math.min(w.real, t.length));
    var n = Math.max(real.length + w.trap, w.channels), chans = [], pos = [];
    function free() {
      for (var k = 0; k < 200; k++) { var p = 6 + Math.random() * 88; if (pos.every(function (q) { return Math.abs(q - p) > w.tol * 3; })) { pos.push(p); return p; } }
      var p2 = 6 + Math.random() * 88; pos.push(p2); return p2;
    }
    real.forEach(function (id) { chans.push({ at: free(), kind: 'real', id: id, label: SG.freqOf(SG.byId(G().accounts, id)) }); });
    for (var k = 0; k < w.trap; k++) chans.push({ at: free(), kind: 'trap', label: 'К-' + (100 + Math.floor(Math.random() * 900)) });
    while (chans.length < n) chans.push({ at: free(), kind: 'noise' });
    var cur = 50, hold = 0, onTrap = 0, last = Date.now(), done = false;
    box.innerHTML = '<div class="wv"><div class="wv-scale" id="wv-scale"><div class="wv-ticks"></div><div class="wv-needle" id="wv-needle"></div></div>' +
      '<input type="range" id="wv-knob" min="0" max="1000" value="500">' +
      '<div class="wv-meter"><div class="wv-sig" id="wv-sig"></div></div><p class="wv-info" id="wv-info">ШУМ</p>' +
      '<div class="wv-hold"><div id="wv-hold"></div></div>' + (w.holdSec ? '' : '<button class="btn" id="wv-go" disabled>ПОДКЛЮЧИТЬ</button>') + '</div>';
    var knob = box.querySelector('#wv-knob');
    knob.addEventListener('input', function () { cur = knob.value / 10; });
    var scale = box.querySelector('#wv-scale');
    function drag(e) {
      var r = scale.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      cur = Math.max(0, Math.min(100, 100 * x / r.width));
      knob.value = Math.round(cur * 10);
    }
    scale.addEventListener('pointerdown', function (e) { drag(e); scale.setPointerCapture && scale.setPointerCapture(e.pointerId); });
    scale.addEventListener('pointermove', function (e) { if (e.buttons) drag(e); });
    function near() {
      var best = null, d = 1e9;
      chans.forEach(function (c) { var x = Math.abs(c.at - cur); if (x < d) { d = x; best = c; } });
      return { c: best, d: d, sig: Math.max(0, 1 - d / (w.tol * 2)) };
    }
    var go = box.querySelector('#wv-go');
    if (go) go.addEventListener('click', function () { var q = near(); if (q.d <= w.tol && q.c.kind === 'real') caught(q.c); });
    function caught(c) { if (done) return; done = true; P.sound('ok'); o.onCatch(c.id, c.label); }
    function step() {
      if (done || !box.isConnected) return;
      var now = Date.now(), dt = (now - last) / 1000;
      last = now;
      var q = near(), on = q.d <= w.tol;
      box.querySelector('#wv-needle').style.left = cur + '%';
      box.querySelector('#wv-sig').style.width = Math.round((q.c.kind === 'noise' ? q.sig * 0.45 : q.sig) * 100) + '%';
      var info = 'ШУМ';
      if (q.sig > 0.4) info = q.c.kind === 'noise' ? 'ПОМЕХИ' : 'СИГНАЛ ' + q.c.label;
      box.querySelector('#wv-info').textContent = info;
      if (on && q.c.kind === 'real') hold += dt; else hold = 0;
      if (on && q.c.kind === 'trap') onTrap += dt; else onTrap = Math.max(0, onTrap - dt);
      box.querySelector('#wv-hold').style.width = w.holdSec ? Math.min(100, 100 * hold / w.holdSec) + '%' : '0';
      if (go) go.disabled = !(on && q.c.kind !== 'noise');
      if (w.holdSec && hold >= w.holdSec) { caught(q.c); return; }
      if (onTrap >= w.trapSec) { done = true; if (o.onTrap) o.onTrap(); return; }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    // для проверок: где каналы
    box.wave = { chans: chans, set: function (v) { cur = v; knob.value = Math.round(v * 10); }, go: function () { if (go) go.click(); } };
    return { stop: function () { done = true; } };
  };

  /* ---------- программа «ВЗЛОМ» ---------- */
  var sess = null, note = '', tuner = null, coolKey = 'hackCool', wasCool = false;
  function coolLeft() { var m = P.acc() ? P.mine() : null; return m && m[coolKey] ? m[coolKey] - Net.now() : 0; }
  function coolFor(min, why) { if (!min) return; var m = P.mine(); m[coolKey] = Net.now() + min * 60000; m.hackCoolWhy = why; P.save(); }
  function targets() { return SG.spyTargets(G(), me(), G().hack.list).map(function (a) { return a.id; }); }

  function start(target, label) {
    var g = G();
    if (!g || !target || target === me()) return;
    if (P.modState('hack') !== 'on' || coolLeft() > 0) { paint(); return; }
    if (!Net.up) { P.sound('err'); P.dialog({ title: 'НЕТ СВЯЗИ', warn: true, text: 'Взлом работает только через центр сети.' }); return; }
    stop('');
    var now = Net.now(), sid = SG.uid('h');
    var until = g.hack.maxMin ? now + g.hack.maxMin * 60000 : 0;
    sess = { sid: sid, key: 'hack:' + target + ':' + me(), target: target, label: label || SG.freqOf(SG.byId(g.accounts, target)), at: now, until: until, frame: null, y: 0.3, lastFrame: 0 };
    note = '';
    Net.set(sess.key, { sid: sid, at: now, until: until, spy: me() });
    if (g.hack.okActions.length) P.doActions(g.hack.okActions);
    paint();
  }
  function stop(why, how) {
    if (!sess) return;
    var s = sess;
    sess = null;
    if (why !== 'cut' && Net.state && Net.state[s.key] && Net.state[s.key].sid === s.sid) Net.set(s.key, null);
    var g = G();
    if (why === 'heat') { note = 'ПЕРЕГРЕВ'; coolFor(g.hack.coolMin, 'heat'); P.sound('err'); }
    else if (why === 'cut') {
      note = 'ВЗЛОМ ОБНАРУЖЕН';
      if (how === 'block' || how === 'blockbeep') coolFor(g.hack.blockMin, 'cut');
      if (how === 'beep') loud();
      P.sound('err');
    }
    paint();
  }
  /* Писк, выдающий шпиона (громко, 3 с). */
  function loud() {
    P.hackBeeps = (P.hackBeeps || 0) + 1;
    if (P.phoneFx) P.phoneFx('beep', { sound: 'err', vibrate: true });
    var n = 0, t = setInterval(function () { P.sound('err'); if (navigator.vibrate) navigator.vibrate(300); if (++n >= 6) clearInterval(t); }, 500);
  }

  function paint() {
    var box = $('tab-hack');
    if (!box || !G()) return;
    var g = G(), html = '<p class="tab-title">' + esc(g.hack.name) + '</p>';
    if (tuner) { tuner.stop(); tuner = null; }
    var cl = coolLeft();
    if (sess) {
      var left = sess.until ? sess.until - Net.now() : 0;
      html += '<div class="spy-head"><b>КАНАЛ ' + esc(sess.label) + '</b>' + (sess.until ? '<span class="spy-left">' + mm(left) + '</span>' : '') + '</div>' +
        '<p class="spy-stat" id="hk-stat">' + stat() + '</p><div class="hk-view' + (g.hack.spyMono ? ' mono' : '') + '" id="hk-view"></div>' +
        '<p class="hint">Ведите пальцем по экрану — полоса читается.</p><button class="btn dim" id="hk-stop">ОТКЛЮЧИТЬСЯ</button>';
      box.innerHTML = html;
      $('hk-stop').addEventListener('click', function () { P.sound('key'); stop(''); });
      drawFrame(true);
      var v = $('hk-view');
      var move = function (e) {
        var r = v.getBoundingClientRect(), y = ((e.touches ? e.touches[0].clientY : e.clientY) - r.top) / r.height;
        sess.y = Math.max(0, Math.min(1, y));
        place();
        var t = Date.now();
        if (t - (sess.sentAt || 0) > 150) { sess.sentAt = t; Net.send({ t: 'live', to: ['acc:' + sess.target], body: { k: 'hk-strip', sid: sess.sid, y: sess.y } }); }
      };
      v.addEventListener('pointerdown', move);
      v.addEventListener('pointermove', function (e) { if (e.buttons) move(e); });
      v.addEventListener('touchmove', function (e) { move(e); e.preventDefault(); }, { passive: false });
      return;
    }
    if (cl > 0) {
      var cut = P.mine().hackCoolWhy === 'cut';
      box.innerHTML = html + '<div class="spy-heat"><div class="big">' + (cut ? 'ВЗЛОМ ОБНАРУЖЕН' : 'ПЕРЕГРЕВ') + '</div><p>' +
        (cut ? 'Цель защитилась. Программа заблокирована.' : 'Программа перегрелась и недоступна.') + '</p><p class="spy-left">' + mm(cl) + '</p></div>';
      return;
    }
    if (note) html += '<p class="warn spy-note">' + esc(note) + '</p>';
    var mode = g.hack.mode;
    if (mode === 'wave') {
      html += '<p class="hint">Найдите сигнал на шкале и удержите его' + (g.wave.holdSec ? ' ' + g.wave.holdSec + ' с' : '') + '.</p><div id="hk-wave"></div>';
      box.innerHTML = html;
      tuner = P.waveTuner($('hk-wave'), { targets: targets(), onCatch: function (id, label) { start(id, label); },
        onTrap: function () { trapHit(); } });
      return;
    }
    if (mode === 'code') {
      html += '<label class="field">КОД ЦЕЛИ<input id="hk-code" type="text" autocomplete="off"></label><div class="cam-btns"><button class="btn" id="hk-go">ВЗЛОМАТЬ</button></div>';
    } else if (mode === 'random') html += '<button class="btn" id="hk-rand">СЛУЧАЙНАЯ ЦЕЛЬ</button>';
    else html += '<div class="spy-list">' + targets().map(function (id) { return '<button class="btn dim hk-who" data-acc="' + esc(id) + '">' + esc(accName(id)) + '</button>'; }).join('') + '</div>';
    box.innerHTML = html;
    if ($('hk-rand')) $('hk-rand').addEventListener('click', function () { var t = targets(); if (t.length) start(t[Math.floor(Math.random() * t.length)], ''); });
    box.querySelectorAll('.hk-who').forEach(function (b) { b.addEventListener('click', function () { start(b.dataset.acc, ''); }); });
    if ($('hk-go')) {
      var go = function () {
        var v = SG.norm($('hk-code').value);
        var a = g.accounts.filter(function (x) { return x.id !== me() && v && (SG.norm(x.spyCode) === v || SG.norm(SG.freqOf(x)) === v); })[0];
        if (a) start(a.id, ''); else { P.sound('err'); note = 'НЕТ ТАКОЙ ЦЕЛИ'; paint(); }
      };
      $('hk-go').addEventListener('click', go);
      if (P.attachKbd) P.attachKbd($('hk-code'), $('hk-go').parentNode, { start: 'ru', enter: go });
    }
  }
  function trapHit() {
    var g = G();
    P.sound('err');
    note = 'ЛОЖНАЯ ВОЛНА — СБОЙ';
    if (g.wave.trapGlitch && P.startGlitch) P.startGlitch(g.wave.trapGlitch);
    else if (P.glitch) P.glitch();
    if (navigator.vibrate) navigator.vibrate([100, 50, 300]);
    paint();
  }
  P.hackTrap = trapHit;
  function stat() {
    if (!sess) return '';
    if (!sess.frame) return Net.now() - sess.at > 6000 ? '○ НЕТ КАРТИНКИ — цель вне сети' : '… ПОДКЛЮЧЕНИЕ';
    return Net.now() - sess.lastFrame > 5000 ? '○ ЭКРАН ЦЕЛИ ПОГАШЕН (последний снимок)' : '● ЭКРАН ЦЕЛИ';
  }
  /* Снимок жертвы: две рамки — размытая и чёткая полоса (clip-path). */
  function doc(f) {
    return '<!doctype html><html style="' + esc(f.root || '') + '"><head><meta charset="utf-8"><style>' + (f.css || '') +
      '\n.hk-img{display:inline-block;background:#223}html,body{overflow:hidden}</style></head><body class="' + esc(f.body || '') + '">' + f.html + '</body></html>';
  }
  function drawFrame(fresh) {
    var v = $('hk-view');
    if (!v || !sess) return;
    var f = sess.frame;
    if (!f) { v.innerHTML = '<div class="hk-wait">…</div>'; return; }
    var W = v.clientWidth || 360, k = W / f.w;
    v.style.height = Math.round(f.h * k) + 'px';
    if (fresh || !v.querySelector('iframe') || sess.css !== f.css) {
      sess.css = f.css;
      v.innerHTML = '<iframe class="hk-blur" scrolling="no"></iframe><iframe class="hk-clear" scrolling="no"></iframe><div class="hk-line"></div>';
      v.querySelectorAll('iframe').forEach(function (fr) {
        fr.style.width = f.w + 'px'; fr.style.height = f.h + 'px'; fr.style.transform = 'scale(' + k + ')';
        fr.srcdoc = doc(f);
      });
    } else {
      v.querySelectorAll('iframe').forEach(function (fr) {
        try { var d = fr.contentDocument; d.body.innerHTML = f.html; d.body.className = f.body || ''; d.documentElement.setAttribute('style', f.root || ''); } catch (e) { fr.srcdoc = doc(f); }
      });
    }
    place();
  }
  function place() {
    var v = $('hk-view');
    if (!v || !sess || !sess.frame) return;
    var f = sess.frame, hpx = G().hack.strip * 22, top = Math.max(0, Math.min(f.h - hpx, sess.y * f.h - hpx / 2));
    var c = v.querySelector('.hk-clear');
    if (c) c.style.clipPath = 'inset(' + top + 'px 0 ' + (f.h - top - hpx) + 'px 0)';
    var l = v.querySelector('.hk-line'), k = (v.clientWidth || 360) / f.w;
    if (l) { l.style.top = Math.round(top * k) + 'px'; l.style.height = Math.round(hpx * k) + 'px'; }
  }

  P.on('tab', function (t) { if (t === 'hack') paint(); else { if (sess) stop(''); if (tuner) { tuner.stop(); tuner = null; } } });
  P.on('login', function () { stop(''); note = ''; });
  Net.on('live', function (o) {
    var b = o.body || {};
    if (b.k === 'hk' && sess && b.sid === sess.sid) {
      var fresh = !sess.frame || sess.frame.w !== b.w || sess.frame.h !== b.h;
      sess.frame = { html: b.html, css: b.css || (sess.frame && sess.frame.css) || '', root: b.root, body: b.cls, w: b.w, h: b.h };
      sess.lastFrame = Net.now();
      if (P.tab === 'hack') { drawFrame(fresh); var s = $('hk-stat'); if (s) s.textContent = stat(); }
    } else if (b.k === 'hk-cut' && sess && b.sid === sess.sid) stop('cut', b.how);
    else if (b.k === 'hk-strip') victimStrip(b);
    else if (b.k === 'hk-ask') { if (!document.hidden && (P.inHands ? P.inHands() : true) && me() && o.from && o.from.acc !== me()) Net.send({ t: 'live', to: ['acc:' + o.from.acc], body: { k: 'hk-yes', id: b.id } }); }
    else if (b.k === 'hk-yes') { if (asking && asking.id === b.id && o.from && o.from.acc) asking.yes.push(o.from.acc); }
    else if (b.k === 'hk-beep') loud();
  });
  Net.on('state', function (key, value) {
    if (sess && key === sess.key && (!value || value.sid !== sess.sid)) stop('cut', sess.cutHow || 'off');
    if (String(key).indexOf('hack:') === 0) victim();
  });
  Net.on('welcome', function () {
    var st = Net.state || {};
    Object.keys(st).forEach(function (k) { var x = k.split(':'); if (x[0] === 'hack' && x[2] === me() && (!sess || k !== sess.key)) Net.set(k, null); });
    victim();
  });
  setInterval(function () {
    if (sess && sess.until && Net.now() >= sess.until) stop('heat');
    if (P.tab === 'hack') {
      if (sess) { var e = document.querySelector('#tab-hack .spy-left'); if (e) e.textContent = mm(sess.until - Net.now()); var s = $('hk-stat'); if (s) s.textContent = stat(); }
      else if (coolLeft() > 0 || wasCool) paint();
    }
    wasCool = coolLeft() > 0;
    victimTick();
  }, 1000);

  /* ---------- жертва ---------- */
  function mine() {
    var st = Net.state || {}, out = [], now = Net.now(), id = me();
    if (!id) return out;
    Object.keys(st).forEach(function (k) {
      var x = k.split(':'), v = st[k];
      if (x[0] !== 'hack' || x[1] !== id || !v || !v.sid || (v.until && now > v.until + 5000)) return;
      out.push({ key: k, spy: x[2], sid: v.sid, at: v.at || now, until: v.until || 0 });
    });
    return out;
  }
  P.hackSessions = mine;
  var vict = { start: 0, y: 0.3, sent: '', sentAt: 0, delay: 0, css: {} };
  function victim() {
    var list = mine();
    if (!list.length) { vict.start = 0; ownStrip(0); if (P.bitsSet) P.bitsSet('hack', 0, 0); return; }
    if (!vict.start) { var h = G().hack; vict.start = Math.min.apply(null, list.map(function (s) { return s.at; })); vict.delay = (h.from + Math.random() * (h.to - h.from)) * 1000; vict.sent = ''; }
    sendFrame();
  }
  function victimTick() {
    if (!G() || !me() || !vict.start) return;
    var list = mine();
    if (!list.length) { victim(); return; }
    sendFrame();
    var h = G().hack, t = Net.now() - vict.start - vict.delay;
    var on = t > 0, min = Math.max(0, t) / 60000;
    if (P.bitsSet) P.bitsSet('hack', on && h.bits ? Math.min(h.bitsMax, 2 + min * h.bitsGrow) / 100 : 0, 0);
    vict.typo = on && h.typo ? Math.min(0.5, 0.05 + min * 0.2) : 0;
    ownStrip(on ? Math.min(100, h.power + min * h.powerGrow) / 100 : Math.min(0.15, h.power / 100));
  }
  var typo0 = P.typoLevel;
  P.typoLevel = function () { return Math.max(typo0 ? typo0() : 0, vict.typo || 0); };
  /* Снимок своего экрана: только видимое, без картинок, видео и значений полей (их текст — отдельным span). */
  function snap() {
    function cl(n) {
      if (n.nodeType === 3) return document.createTextNode(n.nodeValue);
      if (n.nodeType !== 1) return null;
      var t = n.tagName;
      if (/^(SCRIPT|STYLE|VIDEO|CANVAS|IFRAME|AUDIO|NOSCRIPT|TEMPLATE)$/.test(t) || n.id === 'hk-own') return null;
      if (t !== 'BR' && !n.getClientRects().length) return null;
      var c;
      if (t === 'IMG') { var r = n.getBoundingClientRect(); c = document.createElement('span'); c.className = 'hk-img'; c.style.width = r.width + 'px'; c.style.height = r.height + 'px'; return c; }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t)) { c = document.createElement('span'); c.className = n.className; c.textContent = n.value || n.placeholder || ''; return c; }
      c = document.createElement(t === 'BUTTON' ? 'span' : t);
      ['id', 'class', 'style'].forEach(function (a) { if (n.getAttribute(a) != null) c.setAttribute(a, n.getAttribute(a)); });
      if (t === 'BUTTON') c.className = (c.className + ' btn-like').trim();
      for (var k = n.firstChild; k; k = k.nextSibling) { var x = cl(k); if (x) c.appendChild(x); }
      return c;
    }
    var app = $('app'), c = cl(app);
    return c ? c.outerHTML : '';
  }
  var cssText = null;
  function css() {
    if (cssText == null) cssText = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
    return cssText;
  }
  function sendFrame() {
    if (!Net.up || document.hidden) return;
    var t = Date.now();
    if (t - vict.sentAt < 1200) return;
    var html = snap();
    if (html === vict.sent && t - vict.sentAt < 4000) return;
    vict.sentAt = t;
    vict.sent = html;
    mine().forEach(function (s) {
      var withCss = !vict.css[s.sid];
      vict.css[s.sid] = 1;
      Net.send({ t: 'live', to: ['acc:' + s.spy], body: { k: 'hk', sid: s.sid, html: html, css: withCss ? css() : '', root: document.documentElement.getAttribute('style') || '',
        cls: document.body.className, w: window.innerWidth, h: window.innerHeight } });
    });
  }
  /* Своя полоса жертвы: там, где читает взломщик. */
  var own = document.createElement('div');
  own.id = 'hk-own';
  own.className = 'nobits';
  document.body.appendChild(own);
  function victimStrip(b) {
    if (!mine().some(function (s) { return s.sid === b.sid; })) return;
    vict.y = b.y;
    victimTick();
  }
  function ownStrip(power) {
    var h = G() && G().hack;
    if (!power || !h || !vict.start) { own.className = 'nobits'; own.style.display = 'none'; return; }
    var hpx = h.strip * 22, H = window.innerHeight, top = Math.max(0, Math.min(H - hpx, vict.y * H - hpx / 2));
    own.style.display = 'block';
    own.style.top = top + 'px';
    own.style.height = hpx + 'px';
    own.className = 'nobits hk-' + h.look;
    own.style.setProperty('--hkp', power.toFixed(2));
  }
  P.hackOwn = function () { return own.style.display === 'block' ? { top: parseFloat(own.style.top), cls: own.className, p: +own.style.getPropertyValue('--hkp') } : null; };

  /* Защита: встряхнуть N раз или код / фраза. */
  var shakes = [];
  P.on('shake', function () {
    var h = G() && G().hack;
    if (!h || !h.shakes || !mine().length) return;
    var t = Date.now();
    if (shakes.length && t - shakes[shakes.length - 1] > h.gap * 1000) shakes = [];
    shakes.push(t);
    if (shakes.length >= h.shakes) { shakes = []; defend(); }
  });
  P.hackDefend = function (fromCode) { if (!mine().length) { if (fromCode) P.dialog({ title: 'ЗАЩИТА', text: 'Взлома нет.' }); return; } defend(); };
  var asking = null;
  function defend() {
    var h = G().hack, list = mine();
    list.forEach(function (s) {
      Net.send({ t: 'live', to: ['acc:' + s.spy], body: { k: 'hk-cut', sid: s.sid, how: h.result } });
      Net.set(s.key, null);
      if (Net.state) delete Net.state[s.key];
    });
    victim();
    P.sound('ok');
    if (navigator.vibrate) navigator.vibrate(120);
    P.dialog({ title: 'ВЗЛОМ ОТРАЖЁН', cls: 'nobits', text: 'Постороннее подключение разорвано.' });
    // писк у нескольких случайных телефонов, открытых и в руках (сами отвечают, кто в руках)
    if (h.result === 'blockbeep' && h.beepN) {
      asking = { id: SG.uid('q'), yes: [] };
      var q = asking;
      Net.send({ t: 'live', to: ['all'], body: { k: 'hk-ask', id: q.id } });
      setTimeout(function () {
        var y = q.yes.slice();
        for (var i = y.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = y[i]; y[i] = y[j]; y[j] = x; }
        y.slice(0, h.beepN).forEach(function (acc) { Net.send({ t: 'live', to: ['acc:' + acc], body: { k: 'hk-beep' } }); });
        if (asking === q) asking = null;
      }, 1500);
    }
  }
})();
