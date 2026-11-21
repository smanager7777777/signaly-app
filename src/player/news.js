/* СИГНАЛЫ — П20, основа 4: содержимое событий, очередь показа, бегущая строка, архив событий.
   Событие = уведомление с полями из SG.normEvent: картинка (img), mp3, «играть сразу», «в строку» (ticker),
   открывается ли (open), проходов (repeat), когда уходит (leaveMin / leaveOpen / leaveChapter), архив (save, folder). */
(function () {
  'use strict';
  var P = window.SGP, SG = window.SG, Net = window.SGNet;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- очередь показа (Т18-2 А): новое ждёт закрытия открытого окна; авария и сбой — поверх (свои слои) ---------- */
  var queue = [];
  function busy() { return $('dlg').classList.contains('on'); }
  function later(fn) { if (busy()) queue.push(fn); else fn(); }
  P.later = later;
  P.on('closed', function () {
    setTimeout(function () { if (!busy() && queue.length) queue.shift()(); }, 60);
  });

  /* ---------- звук события (Т21-5 А): при приходе — короткий сигнал, mp3 — по нажатию; «играть сразу» — mp3 при приходе ---------- */
  var playing = null;
  function urlOf(name) { return name && P.mediaUrl ? P.mediaUrl(name) : ''; }
  function play(name) {
    var u = urlOf(name);
    if (!u) return;
    try { if (playing) playing.pause(); playing = new Audio(u); if (window.SG_STAND && window.SG_STAND.mute) playing.muted = true; playing.play().catch(function () {}); } catch (e) { /* без звука */ }
  }

  /* Содержимое события как блок: текст, картинка, звук (для окна и архива). */
  function items(b) {
    var out = [];
    if (b.text) out.push({ type: 'text', text: b.text });
    if (b.img) out.push({ type: 'image', file: b.img });
    if (b.mp3) out.push({ type: 'audio', file: b.mp3, title: 'ЗВУК' });
    return out;
  }
  function showFull(b, o) {
    var jam = P.jamLevel ? P.jamLevel() : 0, seed = o && o.seq ? o.seq : Date.now();
    var html = P.renderItems(items(Object.assign({}, b, { text: SG.jam(P.fillVars(b.text || ''), jam, seed) })));
    P.dialog({ title: SG.jam(P.fillVars(b.title) || 'СООБЩЕНИЕ', jam, seed + 't'), cls: 'notice', html: html });
    archive(b);
  }

  /* ---------- событие пришло ---------- */
  P.event = function (b, o) {
    b = b || {};
    var rich = b.img || b.mp3 || b.ticker;
    if (!rich) { later(function () { P.notice(b.title, b.text, o); }); return; }
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    if (b.playNow && b.mp3) play(b.mp3); else P.sound('note');
    if (b.ticker) { tickAdd(b, o); return; }
    later(function () { showFull(b, o); });
  };

  /* ---------- архив событий (Т21-8 А): открытые — в «Данных», папка «События» или своя; «не сохранять» — нет ---------- */
  function archive(b) {
    if (!P.acc() || b.save === false) return;
    var m = P.mine();
    m.events = m.events || [];
    var id = 'ev-' + (b.ev || '') + '-' + (b.title || '').slice(0, 20) + '-' + (b.text || '').length;
    if (m.events.some(function (x) { return x.id === id; })) return;
    m.events.push({ id: id, at: Date.now(), title: P.fillVars(b.title || 'СОБЫТИЕ'), text: P.fillVars(b.text || ''), img: b.img || '', mp3: b.mp3 || '', folder: b.folder || '' });
    if (m.events.length > 200) m.events.shift();
    P.save();
    P.renderData();
  }
  P.evBlocks = function () {
    if (!P.acc()) return [];
    return (P.mine().events || []).map(function (e) {
      return { id: e.id, title: e.title, section: e.folder || 'События', items: items(e), who: [], chapter: 1, event: true };
    });
  };

  /* ---------- бегущая строка (Т18-3 А, Т21-2 А): лента последних K событий по кругу ---------- */
  var list = [], cur = -1, runEl = null, anim = 0, adsT = 0, adsN = 0;
  function cfg() { return (P.game && P.game.ticker) || { speed: 60, k: 5, chapter: 1, who: [] }; }
  function visible() {
    var c = cfg(), st = P.state;
    if (!st || !st.account) return false;
    if ((st.chapter || 1) < (c.chapter || 1)) return false;
    return !(c.who || []).length || c.who.indexOf(st.account) >= 0;
  }
  function tickAdd(b, o) {
    var it = { b: b, at: Date.now(), left: b.repeat > 0 ? b.repeat : -1, ch: P.state && P.state.chapter || 1, seq: o && o.seq };
    // одно и то же событие не дублируется — новое занимает его место
    list = list.filter(function (x) { return !(b.ev && x.b.ev === b.ev); });
    list.push(it);
    while (list.length > cfg().k) list.shift();   // без настроек «когда уходит» — вытесняется новыми
    if (b.leaveMin > 0) setTimeout(function () { drop(it); }, b.leaveMin * 60000);
    if (cur < 0 || !runEl) next(list.length - 1);
  }
  function drop(it) {
    var i = list.indexOf(it);
    if (i < 0) return;
    list.splice(i, 1);
    if (i < cur) cur--;
    if (i === cur) next(cur);
  }
  P.untick = function (ev) {
    list = list.filter(function (x) { return ev && x.b.ev !== ev; });
    cur = -1;
    next(0);
  };
  P.tickerList = function () { return list.map(function (x) { return { title: x.b.title, text: x.b.text, ev: x.b.ev || '', left: x.left }; }); };
  function next(i) {
    var box = $('ticker');
    cancelAnimationFrame(anim);
    if (!list.length || !visible()) { box.hidden = true; cur = -1; runEl = null; return; }
    cur = ((i % list.length) + list.length) % list.length;
    var it = list[cur], c = cfg();
    box.hidden = false;
    box.style.color = c.color || '';
    box.style.borderColor = c.color || '';
    runEl = box.querySelector('.tk-run');
    runEl.textContent = P.fillVars([it.b.title, it.b.text].filter(Boolean).join(' · ').replace(/\s*\n+\s*/g, ' · '));
    runEl.dataset.ev = it.b.ev || '';
    var w = box.clientWidth || 360, tw = runEl.scrollWidth || 200, x = w, t0 = 0;
    function step(t) {
      if (!t0) t0 = t;
      x = w - (t - t0) / 1000 * c.speed;
      runEl.style.transform = 'translateX(' + Math.round(x) + 'px)';
      if (x < -tw) {
        if (it.left > 0) it.left--;
        if (it.left === 0) { drop(it); return; }
        next(cur + 1);
        return;
      }
      anim = requestAnimationFrame(step);
    }
    anim = requestAnimationFrame(step);
  }
  $('ticker').addEventListener('click', function () {
    var it = list[cur];
    if (!it || it.b.open === false) return;
    if (it.b.mp3 && !it.b.playNow) play(it.b.mp3);
    showFull(it.b, { seq: it.seq });
    if (it.b.leaveOpen) drop(it);
  });
  P.on('chapter', function () {
    list = list.filter(function (x) { return !x.b.leaveChapter; });
    next(cur < 0 ? 0 : cur);
  });
  P.on('route', function () { if (cur < 0 || !list.length) next(0); else if (!visible()) next(0); });

  /* ---------- реклама по расписанию (Т21-4 А): каждые N мин — следующее событие из списка (по порядку или случайно) ---------- */
  function adsTick() {
    clearTimeout(adsT);
    var c = cfg();
    if (!c.adsEvery || !(c.ads || []).length || !P.game) return;
    adsT = setTimeout(function () {
      if (visible()) {
        var ids = c.ads, id = c.adsOrder === 'random' ? ids[Math.floor(Math.random() * ids.length)] : ids[adsN++ % ids.length];
        var n = SG.byId(P.game.notices, id);
        if (n) {
          var b = { title: n.title, text: n.text, ev: n.id };
          SG.EVENT_KEYS.forEach(function (k) { b[k] = n[k]; });
          b.ticker = true;
          b.playNow = false;
          tickAdd(b, null);
        }
      }
      adsTick();
    }, c.adsEvery * 60000);
  }
  P.on('login', adsTick);
  P.on('pack', adsTick);
  setTimeout(adsTick, 1000);
})();
