/* СИГНАЛЫ — события самого телефона (П16, основа 2, раздел 6в): правило «на телефоне» (game.rules, on: 'phone')
   срабатывает на этом телефоне, когда его встряхнули, положили экраном вниз или перевернули вверх, экран был
   заблокирован дольше N с (при разблокировке) или не блокировался дольше N с, сделан снимок, отсканирован QR.
   Действия — как у кода (тому, кто «ввёл» — этому телефону; другим — через центр), в том числе новые:
   «Вспышка» (фонарик мигает N раз) и «Короткий сигнал» (звук и вибрация).
   П17 (Т8-6 Б): в APK датчики и экран ведёт служба Android (SgPhone / SgPhoneCore) — правила срабатывают и когда
   приложение свёрнуто или экран погашен; здесь — только снимок и QR, а служба присылает t:'phone' (что ещё сделать
   в приложении). Новый вид — «не в приложении дольше N с» (away). У правила «когда работает»: всегда / при
   включённом экране / при выключенном. В браузере всё — здесь (экран «выключен» = страница скрыта).
   Проверки: P.phoneEvent(вид) и поддельные devicemotion / visibilitychange (tests/net-e2e.mjs). */
(function () {
  'use strict';
  var P = window.SGP, SG = window.SG, Net = window.SGNet;
  var plugin = Net.plugin;
  var last = {};          // правило → время срабатывания (пауза every)
  var face = 'up', faceAt = 0, faceTimer = 0, faceWant = '';
  var hiddenAt = 0, visibleAt = Date.now(), visTimer = 0, awayTimer = 0;
  // П17: в APK события датчиков и экрана — у службы (и в фоне)
  var NATIVE = { shake: 1, facedown: 1, faceup: 1, flip: 1, locked: 1, unlocked: 1, away: 1 };
  var native = !!(plugin && plugin.phoneConfig);

  function rules(kind) {
    var g = P.game, st = P.state;
    if (!g || !st || !st.account) return [];
    return (g.rules || []).filter(function (r) {
      if (r.on !== 'phone' || r.sensor !== kind) return false;
      if (r.who && r.who.length && r.who.indexOf(st.account) < 0) return false;
      if (r.chapters && r.chapters.length && r.chapters.indexOf(st.chapter || 1) < 0) return false;
      return true;
    });
  }
  /* Событие телефона: kind — вид, dur — сколько длилось (мс) для «дольше N с». Возвращает число сработавших правил. */
  P.phoneEvent = function (kind, dur, force) {
    var n = 0, now = Date.now();
    if (native && NATIVE[kind] && !force) return 0;
    rules(kind).forEach(function (r) {
      if (r.seconds && (dur || 0) < r.seconds * 1000) return;
      // экран: в браузере «выключен» — страница скрыта («не в приложении» проверяется без этого)
      if (kind !== 'away' && r.screen === 'on' && document.hidden) return;
      if (kind !== 'away' && r.screen === 'off' && !document.hidden) return;
      if (r.every && last[r.id] && now - last[r.id] < r.every * 1000) return;
      last[r.id] = now;
      n++;
      P.doActions(r.actions);
    });
    if (kind === 'facedown' || kind === 'faceup') n += P.phoneEvent('flip', dur);
    return n;
  };

  /* ---------- датчики ---------- */
  P.on('shake', function () { P.phoneEvent('shake'); });
  window.addEventListener('devicemotion', function (e) {
    var a = e.accelerationIncludingGravity;
    if (!a || a.z == null) return;
    var want = a.z < -7 ? 'down' : a.z > 7 ? 'up' : '';
    if (!want || want === face) { if (want === face) faceWant = ''; return; }
    if (faceWant === want) return;
    faceWant = want;
    clearTimeout(faceTimer);
    // положение держится 0,8 с — не дрожание в руке
    faceTimer = setTimeout(function () {
      if (faceWant !== want) return;
      var dur = Date.now() - faceAt;
      face = want;
      faceAt = Date.now();
      faceWant = '';
      P.phoneEvent(want === 'down' ? 'facedown' : 'faceup', dur);
      if (want === 'down') checkDown();
    }, 800);
  });
  // «экраном вниз дольше N с» — правило facedown с seconds срабатывает, пока телефон лежит
  function checkDown() {
    rules('facedown').forEach(function (r) {
      if (!r.seconds) return;
      var at = faceAt;
      setTimeout(function () { if (face === 'down' && faceAt === at) P.phoneEvent('facedown', Date.now() - at); }, r.seconds * 1000 + 50);
    });
  }

  /* ---------- экран: заблокирован дольше N / не блокировали дольше N ---------- */
  function planVisible() {
    clearTimeout(visTimer);
    var list = rules('unlocked').filter(function (r) { return r.seconds > 0; });
    if (!list.length) return;
    var at = visibleAt;
    var next = Math.min.apply(null, list.map(function (r) { return r.seconds * 1000; }));
    visTimer = setTimeout(function () {
      if (document.hidden || visibleAt !== at) return;
      P.phoneEvent('unlocked', Date.now() - at);
      visibleAt = Date.now();   // следующий раз — снова через N с
      planVisible();
    }, next + 50);
  }
  /* П17: «не в приложении дольше N с» — в браузере: страница скрыта дольше N с (потом — снова через N с). */
  function planAway() {
    clearTimeout(awayTimer);
    var list = rules('away');
    if (!list.length || !document.hidden) return;
    var at = hiddenAt;
    var next = Math.min.apply(null, list.map(function (r) { return Math.max(1, r.seconds || 0) * 1000; }));
    awayTimer = setTimeout(function () {
      if (!document.hidden || hiddenAt !== at) return;
      P.phoneEvent('away', Date.now() - at);
      planAway();
    }, next + 50);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); clearTimeout(visTimer); planAway(); return; }
    clearTimeout(awayTimer);
    var dur = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    visibleAt = Date.now();
    if (dur) P.phoneEvent('locked', dur);
    planVisible();
  });
  ['login', 'route'].forEach(function (k) { P.on(k, function () { visibleAt = Date.now(); planVisible(); }); });

  /* ---------- П17: служба Android ведёт правила (и в фоне) ---------- */
  var sent = '';
  P.phoneSync = function () {
    if (!native || !P.game || !P.state) return;
    var cfg = JSON.stringify(SG.phoneConfig(P.game, P.state));
    if (cfg === sent) return;
    sent = cfg;
    plugin.phoneConfig({ config: cfg }).catch(function () { sent = ''; });
  };
  ['login', 'route', 'net'].forEach(function (k) { P.on(k, function () { P.phoneSync(); }); });
  P.on('state', function (k) { if (k === 'chapter') setTimeout(P.phoneSync, 600); });
  /* Служба: сработало правило. Сообщения центру она уже отправила, вспышку и сигнал (и шторку, если приложение
     было свёрнуто) сделала — здесь остальное (открыть блоки, сбой, уведомление окном…). */
  Net.on('phone', function (o) {
    var s = P.state, g = P.game;
    if (!s || !g || !s.account) return;
    if (o.at && o.at <= (s.phoneAt || 0)) return;   // уже выполнено (страница перезагрузилась, журнал службы тот же)
    if (o.at) { s.phoneAt = o.at; P.saveSoon(); }
    var r = (g.rules || []).filter(function (x) { return x.id === o.id && x.on === 'phone'; })[0];
    if (!r) return;
    P.doActions(r.actions, true, o.done || []);
  });
  P.on('photo', function () { P.phoneEvent('photo'); });
  P.on('scan', function () { P.phoneEvent('scan'); });

  /* ---------- действия: вспышка и короткий сигнал ---------- */
  P.phoneFx = function (kind, b) {
    b = b || {};
    if (kind === 'beep') {
      P.sound(b.sound === 'err' ? 'err' : b.sound === 'ok' ? 'ok' : 'note');
      if (b.vibrate !== false && navigator.vibrate) navigator.vibrate(150);
      return;
    }
    if (kind === 'torch') {
      var n = Math.max(1, Math.min(20, +b.n || 3));
      if (plugin && plugin.flash) { plugin.flash({ count: n }).catch(function () {}); return; }
      // браузер (и старая служба): вспышка экраном
      var el = document.getElementById('flash') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'flash' }));
      var k = 0;
      (function step() {
        el.className = k % 2 === 0 ? 'on' : '';
        if (++k < n * 2) setTimeout(step, 180); else el.className = '';
      })();
      el.setAttribute('data-n', n);
    }
  };
})();
