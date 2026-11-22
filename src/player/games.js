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
    '<button class="mg-opt" data-k="1"></button></div><div class="mg-play" id="mg-play"></div><p class="mg-hint" id="mg-hint"></p><p class="mg-err" id="mg-err"></p>' +
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
  P.startGame = function (id, level) {
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
    if (x.kind === 'voice2' && !pairs.length) return false;
    var r = rec(x.id);
    r.n++; r.last = now(); P.save();
    // П25 (06, 151): провал — «с нуля» или с этапа (по настройке игры)
    var from = x.failFrom === 'stage' && !r.won && r.stage ? Math.min(r.stage, x.stages - 1) : 0;
    run = { x: x, kind: x.kind, level: Math.max(1, +level || 1), pairs: pairs, used: [], seq: 0, stage: from, err: 0, startAt: now(), stageAt: 0, opts: null, done: false };
    lay.className = 'overlay kind-' + x.kind;
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
    if (run.kind !== 'voice2') { run.stageAt = now(); run.seq++; paint(); KINDS[run.kind].stage(run, $('mg-play')); return; }
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
    if (run.kind !== 'voice2') $('mg-q').hidden = true;
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
    if (run.kind !== 'voice2') { if (KINDS[run.kind].tick) KINDS[run.kind].tick(run); if (left <= 0) finish('fail', 'ВРЕМЯ ВЫШЛО'); return; }
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
    if (o.ok) stageOk(); else stageErr();
  }
  /* Этап пройден / ошибка — общее для всех видов игр. */
  function stageOk() {
    var x = run.x;
    {
      P.sound('ok');
      run.stage++;
      if (run.stage >= x.stages) { finish('ok'); return; }
      flash('ВЕРНО');
      next();
    }
  }
  function stageErr(same) {
    var x = run.x;
    {
      run.err++;
      P.sound('err');
      if (navigator.vibrate) navigator.vibrate(200);
      if (x.errActions.length) P.doActions(x.errActions.filter(function (a) { return a.type !== 'notify' && a.type !== 'open'; }));   // окна ошибки — не поверх игры
      if (run.err >= x.maxErr) { finish('fail', 'СЛИШКОМ МНОГО ОШИБОК'); return; }
      flash('ОШИБКА');
      if (same) { paint(); return; }   // ползунок: этап продолжается
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
    if (res === 'ok') { r.won = true; r.stage = 0; } else r.stage = run.stage;
    if (run.kind !== 'voice2' && KINDS[run.kind].stop) KINDS[run.kind].stop(run);
    P.save();
    P.voiceSync();
    run.after = res === 'ok' ? x.okActions : x.failActions;
    $('mg-err').textContent = 'Ошибок: ' + run.err + ' из ' + x.maxErr;
    P.hook('game', x.id, res);
    if (quiet) return;
    endT = setTimeout(function () { if (P.stack.length && P.stack[P.stack.length - 1].id === 'mg') P.closeTop(); }, 8000);   // итог сам закроется
    P.sound(res === 'ok' ? 'win' : 'lose');
    lay.classList.add(res === 'ok' ? 'won' : 'lost');
    $('mg-end-t').textContent = res === 'ok' ? 'УСПЕХ' : 'ПРОВАЛ';
    $('mg-end-x').textContent = (res === 'ok' ? x.okText : x.failText) || (res === 'ok' ? '' : why || '');
    $('mg-end').hidden = false;
  }

  /* ---------- П25 (06, 151): другие виды игр ---------- */
  function rnd(n) { return Math.floor(Math.random() * n); }
  /* Ползунок: падает сам, игрок ведёт пальцем вверх (или тянет); в коридоре — копится время этапа; до нуля — ошибка.
     o: {speed — единиц шкалы в секунду, band — ширина коридора, silent — % «тихих падений» в секунду, onZero(), onBand(вкл),
     holdMin / holdMax — П28 (06, 162): игрок поднял ползунок и отпустил — он стоит случайные holdMin–holdMax с, потом снова падает
     (0 — без паузы; коснулся снова — пауза кончается)} */
  P.mgSlider = function (box, o) {
    box.innerHTML = '<div class="sl"><div class="sl-track" id="sl-track"><div class="sl-band" id="sl-band"></div><div class="sl-knob" id="sl-knob"></div></div>' +
      '<p class="sl-info" id="sl-info"></p></div>';
    var tr = box.querySelector('#sl-track'), band = box.querySelector('#sl-band'), knob = box.querySelector('#sl-knob');
    var v = 60, lo = 30 + Math.random() * 40, hw = (o.band || 20) / 2, last = Date.now(), dead = false, push = 0, inB = false, drop = 0, hold = 0, moved = false;
    function holdNow() {
      var a = +o.holdMin || 0, b = Math.max(a, +o.holdMax || 0);
      hold = b > 0 ? Date.now() + (a + Math.random() * (b - a)) * 1000 : 0;
      drop = 0;
    }
    function place() { band.style.bottom = (lo - hw) + '%'; band.style.height = (2 * hw) + '%'; knob.style.bottom = v + '%'; }
    function up(dy) { v = Math.min(100, v + dy); moved = true; }
    var sy = null;
    tr.addEventListener('pointerdown', function (e) { sy = e.clientY; hold = 0; moved = false; tr.setPointerCapture && tr.setPointerCapture(e.pointerId); });
    tr.addEventListener('pointermove', function (e) { if (sy == null) return; var r = tr.getBoundingClientRect(); var d = (sy - e.clientY) / r.height * 100; if (d > 0) up(d); sy = e.clientY; });
    function rel() { if (sy != null && moved) holdNow(); sy = null; }
    tr.addEventListener('pointerup', rel);
    tr.addEventListener('pointercancel', rel);
    // set(x, true) — как будто игрок поставил ползунок сам (пауза); held() — сколько мс ещё стоит
    var api = { level: function () { return v; }, inBand: function () { return Math.abs(v - lo) <= hw; }, up: up, set: function (x, asPlayer) { v = x; if (asPlayer) holdNow(); else hold = 0; },
      band: function () { return lo; }, held: function () { return hold ? Math.max(0, hold - Date.now()) : 0; }, stop: function () { dead = true; } };
    (function step() {
      if (dead || !box.isConnected) return;
      var t = Date.now(), dt = Math.min(0.2, (t - last) / 1000);
      last = t;
      if (hold && t >= hold) hold = 0;
      if (hold) { /* П28: установлен — стоит */ }
      else {
        if (drop > 0) { v -= dt * (o.speed || 25) * 4; drop -= dt; }
        else if (o.silent && Math.random() < o.silent / 100 * dt) drop = 0.6;   // «тихое падение» — без подсказки
        v -= dt * (o.speed || 25);
      }
      if (Math.random() < dt * 0.3) lo = Math.max(hw + 5, Math.min(95 - hw, lo + (Math.random() - 0.5) * 10));   // коридор понемногу ходит
      var b = api.inBand();
      if (b !== inB) { inB = b; if (o.onBand) o.onBand(b); }
      if (v <= 0) { v = 55; if (o.onZero) o.onZero(); }
      place();
      knob.classList.toggle('in', b);
      knob.classList.toggle('hold', !!hold);
      requestAnimationFrame(step);
    })();
    box.slider = api;
    return api;
  };
  var KINDS = {
    voice2: {},
    slider: {
      stage: function (r, box) {
        var x = r.x, k = 1 + 0.25 * (r.level - 1);
        r.held = 0;
        r.sl = P.mgSlider(box, { speed: x.speed * k, band: x.band / k, silent: x.silent, onZero: function () { stageErr(true); } });
        $('mg-hint').textContent = 'ДЕРЖИТЕ ПОЛЗУНОК В КОРИДОРЕ';
      },
      tick: function (r) {
        if (!r.sl) return;
        if (r.sl.inBand()) r.held += 0.25;
        var need = r.x.holdSec;
        $('mg-hint').textContent = 'В КОРИДОРЕ: ' + Math.min(need, r.held).toFixed(1) + ' из ' + need + ' с';
        if (r.held >= need) { r.sl.stop(); r.sl = null; stageOk(); }
      },
      stop: function (r) { if (r.sl) r.sl.stop(); r.sl = null; }
    },
    code: {
      stage: function (r, box) {
        var x = r.x, n = x.digits + (r.stage * x.grow) + (r.level - 1), code = '';
        for (var i = 0; i < n; i++) code += rnd(10);
        r.code = code;
        box.innerHTML = '<div class="cg"><div class="cg-code" id="cg-code">' + code + '</div><div class="cg-in" id="cg-in"></div><div class="cg-pad" id="cg-pad"></div></div>';
        var pad = box.querySelector('#cg-pad'), inp = box.querySelector('#cg-in'), typed = '';
        '123456789⌫0✓'.split('').forEach(function (d) {
          var b = document.createElement('button');
          b.className = 'btn dim';
          b.textContent = d;
          b.addEventListener('click', function () {
            if (!run || run !== r || r.done) return;
            P.sound('key');
            if (d === '⌫') typed = typed.slice(0, -1);
            else if (d === '✓') { if (typed === r.code) stageOk(); else { typed = ''; stageErr(true); } }
            else if (typed.length < 12) typed += d;
            inp.textContent = typed.replace(/./g, '●') || ' ';
          });
          pad.appendChild(b);
        });
        inp.textContent = ' ';
        r.codeHide = Date.now() + x.showSec * 1000;
        $('mg-hint').textContent = 'ЗАПОМНИТЕ КОД';
      },
      tick: function (r) {
        var c = $('cg-code');
        if (c && r.codeHide && Date.now() >= r.codeHide) { c.textContent = '• '.repeat(r.code.length).trim(); r.codeHide = 0; $('mg-hint').textContent = 'ВВЕДИТЕ КОД'; }
      }
    },
    wires: {
      stage: function (r, box) {
        var x = r.x, n = Math.min(WIRES.length, x.wires + (r.level - 1)), cols = WIRES.slice(0, n);
        for (var i = cols.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
        var order = cols.slice();
        for (var q = order.length - 1; q > 0; q--) { var w = rnd(q + 1); var u = order[q]; order[q] = order[w]; order[w] = u; }
        r.order = order.slice(0, Math.min(x.cuts, n));
        r.cut = [];
        // схема — напарнику (кооператив): на его телефоне, у этого — только провода
        var to = x.partners.filter(function (a) { return a !== P.state.account; });
        r.sid = SG.uid('w');
        if (to.length && Net.up) Net.send({ t: 'live', to: to.map(function (a) { return 'acc:' + a; }), body: { k: 'mg-scheme', sid: r.sid, title: x.title || x.name, order: r.order.map(function (c) { return c[1]; }), stage: r.stage + 1, of: x.stages } });
        box.innerHTML = '<div class="wr">' + cols.map(function (c) { return '<button class="wr-w" data-c="' + c[0] + '" style="--wc:' + c[2] + '"><span>' + c[1] + '</span></button>'; }).join('') + '</div>' +
          (to.length ? '' : '<p class="wr-solo">Режьте: ' + r.order.map(function (c) { return c[1]; }).join(', ') + '</p>');
        box.querySelectorAll('.wr-w').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!run || run !== r || r.done || b.classList.contains('cut')) return;
            var want = r.order[r.cut.length];
            b.classList.add('cut');
            if (want && want[0] === b.dataset.c) { r.cut.push(want); P.sound('ok'); if (r.cut.length >= r.order.length) stageOk(); }
            else { stageErr(true); }
          });
        });
        $('mg-hint').textContent = to.length ? 'СХЕМА — У НАПАРНИКА' : 'РЕЖЬТЕ ПО СХЕМЕ';
      },
      stop: function (r) { if (r.sid && r.x.partners.length && Net.up) Net.send({ t: 'live', to: r.x.partners.map(function (a) { return 'acc:' + a; }), body: { k: 'mg-scheme', sid: r.sid, end: true } }); }
    }
  };
  var WIRES = [['r', 'красный', '#ff4d4d'], ['b', 'синий', '#4d8bff'], ['y', 'жёлтый', '#ffd84d'], ['g', 'зелёный', '#33ff66'], ['w', 'белый', '#f0f0f0'], ['o', 'оранжевый', '#ff9a3d'], ['v', 'фиолетовый', '#b36bff'], ['k', 'чёрный', '#555']];
  /* Напарник видит схему (кооперативные «провода»). */
  var scheme = document.createElement('div');
  scheme.id = 'mg-scheme';
  scheme.className = 'modal nobits';
  scheme.innerHTML = '<div class="dlg-box"><div class="dlg-title" id="mgs-title">СХЕМА</div><div class="dlg-text" id="mgs-text"></div><div class="dlg-btns"><button class="btn dim" id="mgs-close">Закрыть</button></div></div>';
  $('dlg').parentNode.appendChild(scheme);
  $('mgs-close').addEventListener('click', function () { scheme.classList.remove('on'); });
  Net.on('live', function (o) {
    var b = o.body || {};
    if (b.k !== 'mg-scheme') return;
    if (b.end) { if (scheme.dataset.sid === b.sid) scheme.classList.remove('on'); return; }
    scheme.dataset.sid = b.sid;
    $('mgs-title').textContent = 'СХЕМА: ' + (b.title || '') + ' · ' + b.stage + '/' + b.of;
    $('mgs-text').textContent = 'Напарник (' + ((o.from && o.from.name) || '?') + ') должен перерезать по порядку: ' + b.order.join(' → ');
    scheme.classList.add('on');
    P.sound('note');
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
  });

  /* Голос: фразы этапа (voice.js добавляет их в грамматику и включает микрофон на время игры). */
  P.mgRunning = function () { return !!(run && !run.done); };   // любая игра на экране
  P.mgActive = function () { return !!(run && !run.done && run.opts && run.kind === 'voice2'); };
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
