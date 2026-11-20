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
    P.scanOverlay((a.title || a.name).toUpperCase(), hint, function (code) {
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
  P.on('modules', render);
  P.on('tab', function (t) { if (t === 'apps') render(); });
})();
