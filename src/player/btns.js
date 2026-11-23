/* СИГНАЛЫ — кнопки у кода и точка «новое» (П31; 06, 169–170).
   У кода — несколько вариантов действий на выбор (кнопки); у кнопки — шаги по порядку (SG.btnNow): кому, с главы, «когда»,
   «через N мин после прохождения прошлого шага»; действует последний открывшийся шаг. Шаг — мини-игра (пройден после успеха)
   или ответ / блоки / действия (пройден после нажатия); пройденный — свой текст («уже сделано»), если игра не пускает снова.
   Точка «новое» (цвет персонажа, пульсирует) — у кнопки, пока шаг не пройден, а также когда в его мини-игре открылся
   новый исход развилки или в его блоках есть непросмотренные. Загорелась — уведомление шага (если задано, только этому
   персонажу) и строка в журнале пульта (сообщение `new`). «Через N мин» — центр присылает уведомление сам (отложенно).
   Запись телефона: mine().btns[id кнопки] = {done: {шаг: когда}, off: {шаг: исходов при прохождении}, nt: {шаг: 1}, lg: {ключ: 1}}. */
(function () {
  var P = window.SGP, SG = window.SG, Net = window.SGNet;
  var pending = null;   // {bid, sid, gid} — игра запущена кнопкой
  var tick = 0;

  function G() { return P.game; }
  function me() { return P.state && P.state.account; }
  function now() { return Net.now(); }
  function st() { var f = P.flatState(); return { chapter: f.chapter || 1, vars: f.vars || {} }; }
  function brec(bid) {
    var m = P.mine(); m.btns = m.btns || {};
    var r = m.btns[bid] || (m.btns[bid] = {});
    ['done', 'off', 'nt', 'lg'].forEach(function (k) { if (!r[k] || typeof r[k] !== 'object') r[k] = {}; });
    return r;
  }
  /* код вообще открыт этому персонажу (кому, глава, «когда») — иначе кнопок нет */
  function codeOpen(c) {
    var s = P.flatState();
    if ((s.chapter || 1) < c.chapter) return false;
    if (c.who.length && c.who.indexOf(me()) < 0 && !SG.pickVariant(c, s)) return false;
    return SG.whenOk(G(), c, s.vars || {}, me());
  }
  function forkCount(gid) {
    var x = SG.byId(G().games || [], gid), s = st(), n = 0;
    if (!x) return 0;
    (x.forks || []).forEach(function (f) { f.branches.forEach(function (b) { if (SG.forkCan(G(), b, me(), s)) n++; }); });
    return n;
  }
  function unseen(step) {
    var seen = P.mine().seen || [];
    return step.opens.some(function (id) { var b = SG.byId(G().blocks, id); return b && (!b.who.length || b.who.indexOf(me()) >= 0) && seen.indexOf(id) < 0; });
  }
  /* горит ли точка у действующего шага; key — чтобы «загорелась» сообщалось один раз на каждое новое */
  function litOf(step, r) {
    var done = r.done[step.id];
    if (!done) return { lit: true, key: step.id };
    if (step.game) { var fc = forkCount(step.game); return { lit: fc > (r.off[step.id] || 0), key: step.id + ':f' + fc }; }
    return { lit: unseen(step), key: step.id + ':b' };
  }
  /* видимые этому персонажу кнопки кода: [{b, i, step, lit, key}] */
  function list(c) {
    if (!c || !c.buttons || !c.buttons.length || !me() || !codeOpen(c)) return [];
    var s = st(), out = [];
    c.buttons.forEach(function (b) {
      var r = brec(b.id), x = SG.btnNow(G(), b, me(), s, r, now());
      if (!x.step) return;
      var l = litOf(x.step, r);
      out.push({ b: b, i: x.i, step: x.step, lit: l.lit, key: l.key });
    });
    return out;
  }
  P.btnsFor = list;

  function markDone(b, step) {
    var r = brec(b.id);
    r.done[step.id] = now();
    r.off[step.id] = step.game ? forkCount(step.game) : 0;
    var next = b.steps[b.steps.indexOf(step) + 1];
    // «через N мин»: уведомление присылает центр (дойдёт и при свёрнутом приложении), если других условий у шага нет
    if (next && next.afterMin && next.notify && Net.url && !r.nt[next.id] && !next.when.length &&
        (!next.who.length || next.who.indexOf(me()) >= 0) && next.chapter <= (P.state.chapter || 1)) {
      r.nt[next.id] = 1;
      Net.send({ t: 'timer', id: 'p' + SG.uid('t'), delay: next.afterMin * 60000,
        emit: [{ t: 'msg', to: ['acc:' + me()], kind: 'notify', body: { title: b.label, text: next.notify } }] });
    }
    P.save();
    check();
  }

  /* нажали кнопку (или она одна и без точки — сразу) */
  function press(c, it) {
    var b = it.b, s = it.step, r = brec(b.id), done = !!r.done[s.id];
    if (s.game) {
      var x = SG.byId(G().games || [], s.game);
      if (!x) return;
      var gr = (P.mine().games || {})[x.id];
      var can = SG.gameCan(x, gr, now());
      if (!can.ok && s.doneText) { P.sound('err'); P.dialog({ title: b.label, text: s.doneText }); return; }
      if (!done && s.actions.length) P.doActions(s.actions);
      pending = { bid: b.id, sid: s.id, gid: x.id };
      if (P.startGame && !P.startGame(x.id, s.level)) pending = null;
      return;
    }
    if (done && s.doneText) { P.sound('ok'); P.dialog({ title: b.label, text: s.doneText }); return; }
    var m = P.mine(), blocks = s.opens.map(function (id) { return SG.byId(G().blocks, id); })
      .filter(function (bl) { return bl && (!bl.who.length || bl.who.indexOf(me()) >= 0); });
    blocks.forEach(function (bl) { if (m.unlocked.indexOf(bl.id) < 0) m.unlocked.push(bl.id); });
    var had = $('dlg').classList.contains('on');
    if (!done) P.doActions(s.actions);
    if (!done) markDone(b, s); else P.save();
    P.renderData();
    P.sound('ok');
    if (s.text || blocks.length) P.dialog({ title: b.label, text: s.text, blocks: blocks });
    else if (!had && !$('dlg').classList.contains('on')) P.dialog({ title: b.label, text: '' });
  }
  function $(id) { return document.getElementById(id); }

  /* Окно кода с кнопками (player.js, finish). o — итог кода: {title, text, blocks}. true — показано / запущено. */
  P.btnsShow = function (c, o) {
    var items = list(c);
    if (!items.length) return false;
    var own = !!(o.text || o.blocks.length);
    // Т43-3 Б: одна кнопка без точки и без своего ответа кода — сразу, без окна
    if (items.length === 1 && !items[0].lit && !own) { press(c, items[0]); return true; }
    P.sound('ok');
    P.dialog({ title: o.title, text: o.text, blocks: o.blocks, cls: 'btns-dlg',
      buttons: items.map(function (it) {
        return { label: it.b.label || '…', cls: 'code-btn' + (it.lit ? ' is-new' : ''), fn: function () { press(c, it); } };
      }).concat([{ label: 'ЗАКРЫТЬ' }]) });
    // Т43-11: точка — цвет персонажа
    var hex = P.curHex ? P.curHex() : '';
    if (hex) Array.prototype.forEach.call(document.querySelectorAll('#dlg-btns .code-btn.is-new'), function (el) { el.style.setProperty('--dot', hex); });
    return true;
  };
  /* для проверок: состояние кнопок кода по тексту кода */
  P.btnsStat = function (code) {
    var c = (G().codes || []).filter(function (k) { return !k.app && SG.norm(k.code) === SG.norm(code); })[0];
    return list(c).map(function (it) { return { label: it.b.label, step: it.i, lit: it.lit, done: !!brec(it.b.id).done[it.step.id] }; });
  };

  /* загорелась точка — уведомление (если задано) и журнал пульта; ждём «через N мин» */
  function check() {
    clearTimeout(tick); tick = 0;
    if (!G() || !me() || !P.acc()) return;
    var s = st(), t = now(), wait = 0, dirty = false;
    (G().codes || []).forEach(function (c) {
      if (!c.buttons || !c.buttons.length || !codeOpen(c)) return;
      c.buttons.forEach(function (b) {
        var r = brec(b.id), x = SG.btnNow(G(), b, me(), s, r, t);
        if (x.wait && (!wait || x.wait < wait)) wait = x.wait;
        if (!x.step) return;
        var l = litOf(x.step, r);
        if (!l.lit || r.lg[l.key]) return;
        r.lg[l.key] = 1; dirty = true;
        if (Net.url) Net.msg(['role:master'], 'new', { label: b.label, code: c.code || '', note: c.note || '' });
        if (x.step.notify && !r.nt[x.step.id]) {
          r.nt[x.step.id] = 1;
          P.onMsg({ kind: 'notify', body: { title: b.label, text: x.step.notify }, to: ['acc:' + me()], from: { acc: me() }, local: true });
        }
      });
    });
    if (dirty) P.save();
    if (wait) tick = setTimeout(check, Math.max(1000, Math.min(wait - t + 500, 3600000)));
  }
  P.btnsCheck = check;
  var soon = 0;
  function later() { clearTimeout(soon); soon = setTimeout(check, 300); }
  ['vars', 'chapter', 'login', 'state'].forEach(function (k) { P.on(k, later); });
  P.on('game', function (id, res) {
    if (!pending || pending.gid !== id) { later(); return; }
    var pd = pending; pending = null;
    var c = null, b = null;
    (G().codes || []).forEach(function (k) { (k.buttons || []).forEach(function (x) { if (x.id === pd.bid) { c = k; b = x; } }); });
    var s = b && SG.byId(b.steps, pd.sid);
    if (s && res === 'ok') markDone(b, s); else later();
  });
  setInterval(function () { if (P.state && P.state.account) check(); }, 30000);
  setTimeout(later, 1500);
})();
