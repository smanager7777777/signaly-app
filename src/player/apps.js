/* СИГНАЛЫ — вкладка «ПРИБОРЫ» (И): градусник, пульсоксиметр, детектор лжи и т. п.
   Прибор — только камера, без ручного ввода: результат зависит от отсканированного кода и прибора. */
(function () {
  'use strict';
  var P = window.SGP, SG = window.SG, $ = P.$;

  // П17 (Т8-5 А): скрытые приборы в списке не видны — их открывает код (сразу на экране)
  function list() { return SG.appsFor(P.game, P.state.account, P.state.chapter, P.mine().apps).filter(function (a) { return !a.hidden; }); }
  function left(a) { return a.uses ? Math.max(0, a.uses - (P.mine().appUses[a.id] || 0)) : null; }
  function render() {
    var box = $('tab-apps');
    if (!P.acc()) return;
    box.innerHTML = '<p class="tab-title">ПРИБОРЫ</p>';
    list().forEach(function (a) {
      var el = document.createElement('button');
      el.className = 'item app';
      var l = left(a);
      el.innerHTML = '<span class="ic">⊕</span><span class="t"></span>' + (l != null && a.showUses ? '<span class="cnt">' + l + ' / ' + a.uses + '</span>' : '');
      el.querySelector('.t').textContent = a.name;
      if (a.color) el.style.color = a.color;
      el.addEventListener('click', function () { openApp(a); });
      box.appendChild(el);
    });
  }
  function openApp(a) {
    P.sound('key');
    var l = left(a);
    var hint = (a.hint || 'Наведите камеру на QR-код') + (l != null && a.showUses ? ' · осталось: ' + l : '');
    if (l === 0) { P.sound('err'); P.dialog({ title: a.name, warn: true, cls: 'instr', text: a.emptyText || P.game.texts.used }); return; }
    P.scanOverlay((a.title || a.name).toUpperCase(), hint, curGot = function got(code, done) {
      if (a.steady && !done) { if (!measuring) steady(a, code, got); return; }
      var m = P.mine();
      var u = left(a);
      if (u === 0) { P.sound('err'); P.dialog({ title: a.name, warn: true, cls: 'instr', text: a.emptyText || P.game.texts.used }); return; }
      var r = SG.resolveCode(P.game, P.flatState(), code, a.id);
      if (a.uses && r.kind !== 'wrong') {
        m.appUses[a.id] = (m.appUses[a.id] || 0) + 1;
        P.save();
        var nl = left(a);
        $('scanlay-hint').textContent = (a.hint || 'Наведите камеру на QR-код') + (a.showUses ? ' · осталось: ' + nl : '');
      }
      P.enter(code, 'scan', a.id);
      render();
    }, 'instr');
    if (a.color) $('scanlay').style.setProperty('--instr', a.color);
  }
  P.openApp = openApp;
  /* П25 (06, 149): «держи ровно» — после QR измерение идёт a.steady с, пока телефон неподвижен; дрогнул — сначала. */
  var measuring = null, curGot = null;
  P.appScanned = function (code) { if (curGot) curGot(code); };   // проверки: прибор «увидел» QR
  var LIMIT = { 1: 1.2, 2: 0.6, 3: 0.3 };
  function steady(a, code, done) {
    var hint = $('scanlay-hint'), bar = document.getElementById('steady-bar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'steady-bar'; bar.innerHTML = '<div></div>'; hint.parentNode.insertBefore(bar, hint.nextSibling); }
    bar.hidden = false;
    var lim = LIMIT[a.steadyLevel] || 0.6, got = 0, last = Date.now(), shook = 0;
    measuring = { a: a, code: code };
    P.sound('key');
    var m = measuring;
    (function step() {
      if (measuring !== m) return;
      if (!document.getElementById('scanlay').classList.contains('on')) { measuring = null; bar.hidden = true; return; }
      var t = Date.now(), dt = t - last;
      last = t;
      if ((P.jitter ? P.jitter() : 0) > lim) { if (got > 0) { shook++; P.sound('err'); if (navigator.vibrate) navigator.vibrate(80); } got = 0; hint.textContent = 'ДЕРЖИТЕ РОВНО'; hint.classList.add('warn'); }
      else { got += dt; hint.textContent = 'ИЗМЕРЕНИЕ… ' + Math.min(100, Math.round(100 * got / (a.steady * 1000))) + ' %'; hint.classList.remove('warn'); }
      bar.firstChild.style.width = Math.min(100, 100 * got / (a.steady * 1000)) + '%';
      if (got >= a.steady * 1000) {
        measuring = null;
        bar.hidden = true;
        hint.classList.remove('warn');
        hint.textContent = a.hint || 'Наведите камеру на QR-код';
        done(m.code, true);
        return;
      }
      setTimeout(step, 100);
    })();
  }
  P.measuring = function () { return measuring ? { app: measuring.a.id } : null; };
  P.on('modules', render);
  P.on('tab', function (t) { if (t === 'apps') render(); });
})();
