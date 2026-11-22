/* СИГНАЛЫ — П25 (06, 142, 147): мини-игры (М7). Первая — «два выбора голосом» (kind 'voice2').
   Запуск — действием «Мини-игра» (код, правило, пульт; P.startGame). На экране — вопрос (по желанию) и два варианта:
   игрок говорит верный (в APK слушает служба Android: на время игры микрофон включается при экране, фразы — два варианта
   этапа, id 'mg:<этап>:0' / 'mg:<этап>:1'; в браузере — проба голоса). Только голос; кнопки — если в игре задано «через N с».
   Ошибка — действия ошибки и новая пара; провал — K ошибок или вышло время (этапа или всей игры); успех — все этапы.
   Выйти из игры до конца — провал. Запись телефона: mine().games[id] = {n, last, won} (повтор: без ограничений / раз / пауза). */
(function () {
  'use strict';
  var P = window.SGP, Net = window.SGNet, SG = window.SG;
  var $ = function (id) { return document.getElementById(id); };
  var run = null;   // {x, used, stage, err, startAt, stageAt, opts: [{text, ok}], done}

  var lay = document.createElement('section');
  lay.id = 'mg';
  lay.className = 'overlay';
  lay.innerHTML = '<header class="view-bar"><button class="back" id="mg-back">‹ ВЫЙТИ</button><span id="mg-stage"></span></header>' +
    '<div class="mg-body"><p class="mg-title" id="mg-title"></p><div class="mg-time"><div class="mg-bar" id="mg-bar"></div></div>' +
    '<p class="mg-timetxt" id="mg-timetxt"></p><p class="mg-q" id="mg-q"></p><div class="mg-opts"><button class="mg-opt" data-k="0"></button>' +
    '<button class="mg-opt" data-k="1"></button></div><p class="mg-hint" id="mg-hint"></p><p class="mg-err" id="mg-err"></p>' +
    '<div class="mg-end" id="mg-end" hidden><div class="big" id="mg-end-t"></div><p id="mg-end-x"></p><button class="btn" id="mg-ok">OK</button></div></div>';
  $('dlg').parentNode.insertBefore(lay, $('dlg'));   // в #app, под окнами (#dlg — выше игры)
  $('mg-back').addEventListener('click', function () { P.closeTop(); });
  $('mg-ok').addEventListener('click', function () { P.closeTop(); });
  lay.querySelectorAll('.mg-opt').forEach(function (b) {
    b.addEventListener('click', function () { if (run && !run.done && b.classList.contains('can')) choose(+b.dataset.k, 'tap'); });
  });

  function now() { return Net.now(); }
  function rec(id) { var m = P.mine(); m.games = m.games || {}; return m.games[id] || (m.games[id] = { n: 0, last: 0, won: false }); }
  function mm(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  /* Запуск (действие «Мини-игра», пульт, проверки). */
  P.startGame = function (id) {
    var G = P.game;
    var x = G && SG.byId(G.games || [], id);
    if (!x || !P.acc()) return false;
    if (run && !run.done) return false;   // уже идёт
    var can = SG.gameCan(x, rec(x.id), now());
    if (!can.ok) {
      P.sound('err');
      P.dialog({ title: x.title || x.name, text: can.why === 'once' ? 'Эта игра уже пройдена.' : 'Снова — через ' + mm(can.left) + '.' });
      return false;
    }
    var pairs = x.pairs.filter(function (p) { return p.ok && p.no && SG.voiceNorm(p.ok) && SG.voiceNorm(p.no); });
    if (!pairs.length) return false;
    var r = rec(x.id);
    r.n++; r.last = now(); P.save();
    run = { x: x, pairs: pairs, used: [], seq: 0, stage: 0, err: 0, startAt: now(), stageAt: 0, opts: null, done: false };
    $('mg-end').hidden = true;
    lay.classList.remove('won', 'lost');
    P.pushLayer('mg', function () {
      if (run && !run.done) finish('fail', 'ВЫ ВЫШЛИ ИЗ ИГРЫ', true);
      var after = run && run.after;
      run = null;
      clearTimeout(endT);
      P.voiceSync();
      // итог — после закрытия окна игры (иначе уведомление окажется под ним)
      if (after && after.length) setTimeout(function () { P.doActions(after); }, 60);
    });
    next();
    return true;
  };

  function pick() {
    var pr = run.pairs, free = pr.map(function (p, i) { return i; }).filter(function (i) { return run.used.indexOf(i) < 0; });
    if (!free.length) { run.used = []; free = pr.map(function (p, i) { return i; }); }
    var i = run.x.random ? free[Math.floor(Math.random() * free.length)] : free[0];
    run.used.push(i);
    return pr[i];
  }
  function next() {
    var p = pick();
    var a = { text: p.ok, ok: true }, b = { text: p.no, ok: false };
    run.opts = Math.random() < 0.5 ? [a, b] : [b, a];   // варианты меняются местами
    run.q = p.q;
    run.stageAt = now();
    run.seq++;
    paint();
    P.voiceSync();   // фразы этапа — в грамматику
  }

  function paint() {
    if (!run) return;
    var x = run.x;
    $('mg-stage').textContent = 'ЭТАП ' + Math.min(run.stage + 1, x.stages) + ' / ' + x.stages;
    $('mg-title').textContent = x.title || x.name;
    $('mg-q').textContent = run.q || '';
    $('mg-q').hidden = !run.q;
    lay.querySelectorAll('.mg-opt').forEach(function (b, i) { b.textContent = run.opts ? run.opts[i].text : ''; });
    $('mg-err').textContent = 'Ошибок: ' + run.err + ' из ' + x.maxErr;
    tick();
  }
  function tick() {
    if (!run || run.done) return;
    var x = run.x, t = now();
    var sl = x.stageSec ? x.stageSec * 1000 - (t - run.stageAt) : Infinity;
    var tl = x.totalSec ? x.totalSec * 1000 - (t - run.startAt) : Infinity;
    var left = Math.min(sl, tl), full = sl <= tl ? x.stageSec * 1000 : x.totalSec * 1000;
    $('mg-bar').style.width = left === Infinity ? '100%' : Math.max(0, 100 * left / full) + '%';
    $('mg-timetxt').textContent = left === Infinity ? '' : (sl <= tl ? 'на этап: ' : 'до конца игры: ') + mm(left);
    lay.classList.toggle('hurry', left < 5000);
    var btns = x.buttonsAfter && t - run.stageAt >= x.buttonsAfter * 1000;
    lay.querySelectorAll('.mg-opt').forEach(function (b) { b.classList.toggle('can', !!btns); });
    $('mg-hint').textContent = btns ? 'СКАЖИТЕ ИЛИ НАЖМИТЕ ВЕРНЫЙ ВАРИАНТ' : 'СКАЖИТЕ ВЕРНЫЙ ВАРИАНТ';
    if (left <= 0) finish('fail', 'ВРЕМЯ ВЫШЛО');
  }
  setInterval(tick, 250);

  function choose(k, how) {
    if (!run || run.done || !run.opts) return;
    var o = run.opts[k];
    if (!o) return;
    var x = run.x;
    if (o.ok) {
      P.sound('ok');
      run.stage++;
      if (run.stage >= x.stages) { finish('ok'); return; }
      flash('ВЕРНО');
      next();
    } else {
      run.err++;
      P.sound('err');
      if (navigator.vibrate) navigator.vibrate(200);
      if (x.errActions.length) P.doActions(x.errActions.filter(function (a) { return a.type !== 'notify' && a.type !== 'open'; }));   // окна ошибки — не поверх игры
      if (run.err >= x.maxErr) { finish('fail', 'СЛИШКОМ МНОГО ОШИБОК'); return; }
      flash('ОШИБКА');
      next();   // этап повторяется с новой парой
    }
  }
  function flash(t) {
    var e = $('mg-hint');
    e.textContent = t;
    lay.classList.add(t === 'ОШИБКА' ? 'flash-err' : 'flash-ok');
    setTimeout(function () { lay.classList.remove('flash-err', 'flash-ok'); }, 600);
  }
  var endT = 0;
  function finish(res, why, quiet) {
    if (!run || run.done) return;
    var x = run.x;
    run.done = true;
    run.opts = null;
    var r = rec(x.id);
    if (res === 'ok') r.won = true;
    P.save();
    P.voiceSync();
    run.after = res === 'ok' ? x.okActions : x.failActions;
    $('mg-err').textContent = 'Ошибок: ' + run.err + ' из ' + x.maxErr;
    P.hook('game', x.id, res);
    if (quiet) return;
    endT = setTimeout(function () { if (P.stack.length && P.stack[P.stack.length - 1].id === 'mg') P.closeTop(); }, 8000);   // итог сам закроется
    P.sound(res === 'ok' ? 'ok' : 'err');
    lay.classList.add(res === 'ok' ? 'won' : 'lost');
    $('mg-end-t').textContent = res === 'ok' ? 'УСПЕХ' : 'ПРОВАЛ';
    $('mg-end-x').textContent = (res === 'ok' ? x.okText : x.failText) || (res === 'ok' ? '' : why || '');
    $('mg-end').hidden = false;
  }

  /* Голос: фразы этапа (voice.js добавляет их в грамматику и включает микрофон на время игры). */
  P.mgActive = function () { return !!(run && !run.done && run.opts); };
  P.mgPhrases = function () {
    if (!P.mgActive()) return [];
    return run.opts.map(function (o, i) { return { id: 'mg:' + run.seq + ':' + i, text: SG.voiceNorm(o.text), max: 0, every: 0, net: [], mine: true }; }).filter(function (p) { return p.text; });
  };
  P.mgVoice = function (id) {
    if (!P.mgActive()) return false;
    var x = String(id).split(':');
    if (+x[1] !== run.seq) return true;   // фраза прошлого этапа (служба услышала поздно)
    choose(+x[2], 'voice');
    return true;
  };
  P.on('login', function () { if (run && !run.done) { run.done = true; } });

  /* Пульт мастера → «ИГРА» → «МИНИ-ИГРЫ»: запустить выбранным (или всем). */
  var form = { id: '', who: {} };
  P.gamesCard = function (card, h, btn, need, sel) {
    var G = P.game;
    if (!G || !G.games || !G.games.length) return null;
    if (!SG.byId(G.games, form.id)) form.id = G.games[0].id;
    var s = sel(G.games.map(function (x) { return [x.id, x.name]; }), form.id);
    s.addEventListener('change', function () { form.id = s.value; });
    var who = G.accounts.map(function (a) {
      var c = h('input', { type: 'checkbox' });
      c.checked = !!form.who[a.id];
      c.addEventListener('change', function () { form.who[a.id] = c.checked; });
      return h('label', { class: 'field chk' }, c, a.name || a.id);
    });
    return card('МИНИ-ИГРЫ', h('label', { class: 'field' }, 'Игра', s), h('div', { class: 'mg-who' }, who),
      btn('Запустить отмеченным (никто — всем)', function () {
        if (!need()) return;
        var ids = G.accounts.filter(function (a) { return form.who[a.id]; }).map(function (a) { return a.id; });
        P.doActions([{ type: 'game', game: form.id, to: ids }]);
        P.dialog({ title: 'ОТПРАВЛЕНО', text: 'Мини-игра «' + SG.byId(G.games, form.id).name + '» — ' + (ids.length ? ids.length + ' тел.' : 'всем') + '.' });
      }),
      h('p', { class: 'hint', text: 'Игра откроется на телефоне сразу (без связи — когда подключится). Итог — действия игры (успех / ошибка / провал).' }));
  };
})();
