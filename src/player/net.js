/* СИГНАЛЫ — связь телефона с центром сети (протокол — docs/06_NETWORK.md).
   В APK соединение держит служба Android (плагин SgNet): работает с погашенным экраном,
   копит неотправленное. В браузере (предпросмотр, проверки) — обычный WebSocket. */
(function () {
  'use strict';
  var plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SgNet;

  var N = window.SGNet = {
    native: !!plugin,
    url: null,
    up: false,
    epoch: null,
    seq: 0,            // последний обработанный номер сообщения
    offset: 0,         // время центра − время телефона
    state: {},
    peers: [],
    rulesVer: null,
    hello: null,
    on: function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    now: function () { return Date.now() + N.offset; },
    start: start,
    stop: stop,
    send: send,
    setHello: setHello,
    claim: claim,
    msg: function (to, kind, body) {
      var id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      send({ t: 'msg', id: id, to: to, kind: kind, body: body });
      return id;
    },
    set: function (key, value) { send({ t: 'set', key: key, value: value }); },
    plugin: plugin || null
  };
  var handlers = {};
  function emit(type, a, b) { (handlers[type] || []).forEach(function (fn) { try { fn(a, b); } catch (e) { console.error(e); } }); }

  /* ---------- приём ---------- */
  var nativeIdx = 0;
  function onText(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { return; }
    if (o.t === 'welcome') {
      if (o.epoch !== N.epoch) { N.epoch = o.epoch; N.seq = 0; }
      // центр перезапущен и не успел записать последние сообщения: его счёт отстал от нашего
      if (o.seq < N.seq) N.seq = o.seq;
      N.offset = o.now - Date.now();
      N.state = o.state || {};
      N.rulesVer = o.rulesVer;
      if (o.peers) N.peers = o.peers;
      N.up = true;
      emit('status', true);
      emit('welcome', o);
    } else if (o.t === 'reset') {
      N.epoch = o.epoch; N.seq = 0; N.state = {};
      emit('reset', o);
    } else if (o.t === 'msg') {
      if (o.seq <= N.seq) return;          // уже обработано (повтор после переподключения)
      N.seq = o.seq;
      emit('msg', o);
      emit('seq', N.seq);
    } else if (o.t === 'state') {
      if (o.value == null) delete N.state[o.key]; else N.state[o.key] = o.value;
      emit('state', o.key, o.value);
    } else if (o.t === 'claimed') {
      var p = pending[o.id];
      if (p) { delete pending[o.id]; clearTimeout(p.t); p.ok(o); }
    } else if (o.t === 'peers') {
      N.peers = o.peers || [];
      emit('peers', N.peers);
    } else if (o.t === 'ack') emit('ack', o);
    else if (o.t === 'pong') N.offset = o.now - Date.now();
  }
  function status(up) {
    if (!up && N.up) { N.up = false; emit('status', false); }
  }

  /* ---------- WebSocket (браузер) ---------- */
  var ws = null, outbox = [], wait = 1000, timer = 0, stopped = true;
  function helloText() {
    var h = Object.assign({ t: 'hello' }, N.hello || {});
    h.since = N.seq;
    if (N.epoch) h.epoch = N.epoch;
    return JSON.stringify(h);
  }
  function wsOpen() {
    clearTimeout(timer);
    if (stopped || !N.url) return;
    try { ws = new WebSocket(N.url); } catch (e) { retry(); return; }
    ws.onopen = function () {
      wait = 1000;
      ws.send(helloText());
      while (outbox.length && ws && ws.readyState === 1) ws.send(outbox.shift());
    };
    ws.onmessage = function (e) { onText(e.data); };
    ws.onclose = function () { ws = null; status(false); retry(); };
    ws.onerror = function () { /* дальше будет onclose */ };
  }
  function retry() {
    if (stopped) return;
    timer = setTimeout(wsOpen, wait);
    wait = Math.min(wait * 2, 8000);
  }

  /* ---------- общее ---------- */
  function start(url, hello, from) {
    N.url = url;
    N.hello = hello;
    if (from) { N.epoch = from.epoch || null; N.seq = from.seq || 0; }
    stopped = false;
    if (plugin) {
      var h = JSON.parse(helloText());
      plugin.connect({ url: url, hello: JSON.stringify(h) }).catch(function (e) { emit('error', e.message || String(e)); });
      drain();
      return;
    }
    if (ws) { try { ws.close(); } catch (e) { /* уже */ } }
    else wsOpen();
  }
  function stop() {
    stopped = true;
    N.url = null;
    clearTimeout(timer);
    if (plugin) plugin.disconnect();
    else if (ws) { var w = ws; ws = null; w.onclose = null; w.close(); }
    outbox = [];
    status(false);
  }
  function setHello(hello) {
    N.hello = hello;
    if (stopped) return;
    if (plugin) plugin.setHello({ hello: helloText() });
    else if (ws && ws.readyState === 1) ws.send(helloText());
  }
  function send(o) {
    var t = JSON.stringify(o);
    if (plugin) { plugin.send({ text: t }); return; }
    if (ws && ws.readyState === 1 && !outbox.length) ws.send(t);
    else { outbox.push(t); if (outbox.length > 2000) outbox.shift(); }
  }

  var pending = {}, claimN = 0;
  /* Спросить центр «можно ли взять». Нет связи — {ok:false, reason:'offline'} (решение автора: ждать связи). */
  function claim(o) {
    return new Promise(function (ok) {
      if (!N.up) { ok({ ok: false, reason: 'offline' }); return; }
      var id = 'c' + Date.now().toString(36) + (++claimN);
      var msg = Object.assign({ t: 'claim', id: id }, o);
      pending[id] = { ok: ok, t: setTimeout(function () { delete pending[id]; ok({ ok: false, reason: 'offline' }); }, 5000) };
      send(msg);
    });
  }

  if (plugin) {
    plugin.addListener('text', function (e) {
      if (e.idx < nativeIdx) return;
      nativeIdx = e.idx + 1;
      onText(e.text);
    });
    plugin.addListener('status', function (e) { if (!e.up) status(false); });
    // пока страница спала, служба копила сообщения — забираем
    var drain = function () {
      plugin.drain({ from: nativeIdx }).then(function (r) {
        (r.items || []).forEach(function (t) { onText(t); });
        nativeIdx = Math.max(nativeIdx, r.next || 0);
      }).catch(function () { /* служба ещё не готова */ });
    };
    document.addEventListener('visibilitychange', function () { if (!document.hidden) drain(); });
  } else {
    var drain = function () {};
  }
  setInterval(function () {
    if (!N.up) return;
    if (plugin) plugin.status().then(function (s) { if (!s.up) status(false); }).catch(function () {});
    send({ t: 'ping' });
  }, 20000);
})();
