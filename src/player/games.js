/* СИГНАЛЫ — П25 (06, 142, 147): мини-игры (М7). Первая — «два выбора голосом» (kind 'voice2').
   Запуск — действием «Мини-игра» (код, правило, пульт; P.startGame). На экране — вопрос (по желанию) и два варианта:
   игрок говорит верный (в APK слушает служба Android: на время игры микрофон включается при экране, фразы — два варианта
   этапа, id 'mg:<этап>:0' / 'mg:<этап>:1'; в браузере — проба голоса). Только голос; кнопки — если в игре задано «через N с».
   Ошибка — действия ошибки и новая пара; провал — K ошибок или вышло время (этапа или всей игры); успех — все этапы.
   Выйти из игры до конца — провал. Запись телефона: mine().games[id] = {n, last, won} (повтор: без ограничений / раз / пауза).
   П29 (06, 164, 167): камера на QR — вид 'qr' (загрузка, пока камера видит QR), 'qr2' (у каждого участника свой QR: ведущий видит
   «НУЖНЫЙ ВАРИАНТ» на цветном фоне и серые варианты, отвечающий — варианты в цветах; ведущий называет цвет, отвечающий — вариант
   этого цвета, ведущий выбирает; роли по кругу парами) и галочка qrHold у других видов. Ведущий (кто запустил) считает игру и шлёт
   участникам живым потоком {k:'mg-co'}; участники — что видит их камера {k:'mg-cq'}, выбор {k:'mg-cp'}, выход {k:'mg-cl'}. */
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
    '<p class="mg-timetxt" id="mg-timetxt"></p><div class="mg-cam" id="mg-cam"><video id="mg-video" playsinline muted></video><p class="mg-qrst" id="mg-qrst"></p></div><p class="mg-q" id="mg-q"></p><div class="mg-opts"><button class="mg-opt" data-k="0"></button>' +
    '<button class="mg-opt" data-k="1"></button></div><div class="mg-play" id="mg-play"></div><div class="mg-fork" id="mg-fork" hidden><p class="mg-fork-t" id="mg-fork-t"></p><p class="mg-fork-x" id="mg-fork-x"></p><div class="mg-fork-b" id="mg-fork-b"></div><div class="mg-fork-time" id="mg-fork-time"><div id="mg-fork-bar"></div></div></div><p class="mg-hint" id="mg-hint"></p><p class="mg-err" id="mg-err"></p>' +
    '<div class="mg-end" id="mg-end" hidden><div class="big" id="mg-end-t"></div><p id="mg-end-x"></p><button class="btn" id="mg-ok">OK</button></div><div class="mg-static" id="mg-static"></div></div>';
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
    var parts = null;
    if (x.kind === 'qr2') {   // П29: вдвоём и больше — участники: кто запустил + отмеченные в игре
      parts = [me()].concat(x.partners.filter(function (a) { return a !== me() && SG.byId(G.accounts, a); }));
      if (parts.length < 2 || !Net.up) {
        P.sound('err');
        P.dialog({ title: x.title || x.name, text: parts.length < 2 ? 'Нужен напарник: в игре не отмечен ни один участник.' : 'Нет связи — вдвоём не сыграть.' });
        return false;
      }
    }
    var r = rec(x.id);
    r.n++; r.last = now(); P.save();
    // П25 (06, 151): провал — «с нуля» или с этапа (по настройке игры)
    var from = x.failFrom === 'stage' && !r.won && r.stage ? Math.min(r.stage, x.stages - 1) : 0;
    run = { x: x, kind: x.kind, level: Math.max(1, +level || 1), pairs: pairs, used: [], seq: 0, stage: from, err: 0, startAt: now(), stageAt: 0, opts: null, done: false,
      fdone: {}, br: {}, fseq: 0, wb: 0, wk: '' };   // П30: развилки (пройденные в этой игре, выбранные исходы), наблюдение
    run.qs = SG.gameQr(x) ? qrNew() : null;   // П29: камера на QR
    if (parts) run.co = { sid: SG.uid('co'), host: me(), parts: parts, rep: {}, combo: null, seq: 0, beat: 0, flash: '', fb: {} };
    run.sid = run.co ? run.co.sid : SG.uid('mgs');
    lay.className = 'overlay kind-' + x.kind + (run.qs ? ' qr' : '') + (run.qs && x.kind !== 'qr' && x.kind !== 'qr2' ? ' qrhold' : '');
    $('mg-play').innerHTML = ''; $('mg-play').dataset.seq = '';
    $('mg-end').hidden = true;
    lay.classList.remove('won', 'lost', 'forking', 'fork-alarm');
    $('mg-fork').hidden = true;
    P.pushLayer('mg', function () {
      if (run && !run.done) finish('fail', 'ВЫ ВЫШЛИ ИЗ ИГРЫ', true);
      var after = run && run.after;
      run = null;
      clearTimeout(endT);
      P.voiceSync();
      // итог — после закрытия окна игры (иначе уведомление окажется под ним)
      if (after && after.length) setTimeout(function () { P.doActions(after); }, 60);
    });
    if (run.qs) { qrStart(); paint(); } else next();   // П29: сначала — навести камеру на QR
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
    if (!run.guest) watchBeat(t);                  // П30: наблюдатели — ход игры
    if (run.fork) { forkTick(t); return; }         // П30: развилка — игра и её время стоят
    if (run.guest) { if (guestTick(t)) return; }   // П29: участник чужой игры — время и экран ведёт ведущий
    else if (run.qs && qrTick(t)) return;            // П29: ждём QR / провал без QR
    if (run.qs && run.qs.lost) {   // П29: помехи — время этапа стоит (или идёт, если так задано у игры)
      if (run.guest) return;
      if (x.qrTime !== 'run') t = run.qs.lostAt;
    }
    var sl = x.stageSec ? x.stageSec * 1000 - (t - run.stageAt) : Infinity;
    var tl = x.totalSec ? x.totalSec * 1000 - (t - run.startAt) : Infinity;
    var left = Math.min(sl, tl), full = sl <= tl ? x.stageSec * 1000 : x.totalSec * 1000;
    $('mg-bar').style.width = left === Infinity ? '100%' : Math.max(0, 100 * left / full) + '%';
    $('mg-timetxt').textContent = left === Infinity ? '' : (sl <= tl ? 'на этап: ' : 'до конца игры: ') + mm(left);
    lay.classList.toggle('hurry', left < 5000);
    if (run.guest) return;
    if (run.kind !== 'voice2') { if (KINDS[run.kind].tick) KINDS[run.kind].tick(run); if (left <= 0) finish('fail', 'ВРЕМЯ ВЫШЛО'); return; }
    var btns = x.buttonsAfter && t - run.stageAt >= x.buttonsAfter * 1000;
    lay.querySelectorAll('.mg-opt').forEach(function (b) { b.classList.toggle('can', !!btns); });
    $('mg-hint').textContent = btns ? 'СКАЖИТЕ ИЛИ НАЖМИТЕ ВЕРНЫЙ ВАРИАНТ' : 'СКАЖИТЕ ВЕРНЫЙ ВАРИАНТ';
    if (left <= 0) finish('fail', 'ВРЕМЯ ВЫШЛО');
  }
  setInterval(tick, 250);

  function choose(k, how) {
    if (!run || run.done || !run.opts || qrBlocked()) return;
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
      if (forkStep()) return;   // П30: после этого этапа — развилка
      stageGo();
    }
  }
  function stageGo() {
    if (run.stage >= run.x.stages) { finish('ok'); return; }
    flash('ВЕРНО');
    next();
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
    if (run && run.co) run.co.flash = t;   // П29: участникам — тоже
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
    if (run.qs) qrStop();
    if (run.fork) forkHide();
    var oc = outcome(x, res, run.br);   // П30: исходы развилок — свой текст и действия (пусто — общие)
    if (run.co) coSend({ end: { res: res, br: run.br, text: quiet ? 'ВЕДУЩИЙ ВЫШЕЛ ИЗ ИГРЫ' : oc.other || (res === 'ok' ? '' : why || '') } });
    if (x.watch) watchSend({ ph: 'end', res: res, text: quiet ? '' : oc.other || (res === 'ok' ? '' : why || '') });
    if (x.forks.length && Net.url) Net.msg(['role:master', 'role:terminal'], 'game', { game: x.id, name: x.name, res: res, acc: me(), branches: oc.names });
    P.save();
    P.voiceSync();
    run.after = oc.acts;
    $('mg-err').textContent = 'Ошибок: ' + run.err + ' из ' + x.maxErr;
    P.hook('game', x.id, res);
    if (quiet) return;
    endT = setTimeout(function () { if (P.stack.length && P.stack[P.stack.length - 1].id === 'mg') P.closeTop(); }, 8000);   // итог сам закроется
    P.sound(res === 'ok' ? 'win' : 'lose');
    lay.classList.add(res === 'ok' ? 'won' : 'lost');
    $('mg-end-t').textContent = res === 'ok' ? 'УСПЕХ' : 'ПРОВАЛ';
    $('mg-end-x').textContent = oc.text || (res === 'ok' ? '' : why || '');
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
    var v = 60, lo = 30 + Math.random() * 40, hw = (o.band || 20) / 2, last = Date.now(), dead = false, push = 0, inB = false, drop = 0, hold = 0, moved = false, paused = false;
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
      band: function () { return lo; }, held: function () { return hold ? Math.max(0, hold - Date.now()) : 0; }, stop: function () { dead = true; },
      pause: function (b) { paused = !!b; } };   // П29: QR потерян — ползунок стоит
    (function step() {
      if (dead || !box.isConnected) return;
      var t = Date.now(), dt = Math.min(0.2, (t - last) / 1000);
      last = t;
      if (paused) { requestAnimationFrame(step); return; }
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
        if (r.qs && r.qs.lost) r.sl.pause(true);
        $('mg-hint').textContent = 'ДЕРЖИТЕ ПОЛЗУНОК В КОРИДОРЕ';
      },
      tick: function (r) {
        if (!r.sl) return;
        if (r.sl.inBand() && !qrBlocked()) r.held += 0.25;
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
            if (!run || run !== r || r.done || qrBlocked()) return;
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
        if (r.qs && r.qs.lost && r.x.qrTime !== 'run') return;   // П29: помехи — показ кода тоже стоит
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
            if (!run || run !== r || r.done || qrBlocked() || b.classList.contains('cut')) return;
            var want = r.order[r.cut.length];
            b.classList.add('cut');
            if (want && want[0] === b.dataset.c) { r.cut.push(want); P.sound('ok'); if (r.cut.length >= r.order.length) stageOk(); }
            else { stageErr(true); }
          });
        });
        $('mg-hint').textContent = to.length ? 'СХЕМА — У НАПАРНИКА' : 'РЕЖЬТЕ ПО СХЕМЕ';
      },
      stop: function (r) { if (r.sid && r.x.partners.length && Net.up) Net.send({ t: 'live', to: r.x.partners.map(function (a) { return 'acc:' + a; }), body: { k: 'mg-scheme', sid: r.sid, end: true } }); }
    },
    /* П29 (06, 164, 167): загрузка идёт, пока камера видит QR (уровень — дольше) */
    qr: {
      stage: function (r, box) {
        r.need = r.x.holdSec * (1 + 0.5 * (r.level - 1)); r.prog = 0; r.pt = now();
        box.innerHTML = '<div class="mg-load"><div class="mg-load-bar" id="mg-load-bar"></div></div><p class="mg-load-t" id="mg-load-t">ЗАГРУЗКА 0 %</p>';
        $('mg-hint').textContent = 'ДЕРЖИТЕ КАМЕРУ НА QR';
      },
      tick: function (r) {
        var t = now(), dt = Math.max(0, Math.min(1000, t - r.pt));
        r.pt = t;
        if (!r.qs.lost) r.prog += dt / 1000;
        var k = Math.min(1, r.prog / r.need), b = $('mg-load-bar'), tt = $('mg-load-t');
        if (b) b.style.width = (100 * k) + '%';
        if (tt) tt.textContent = 'ЗАГРУЗКА ' + Math.floor(100 * k) + ' %';
        if (r.prog >= r.need) stageOk();
      }
    },
    /* П29: вдвоём и больше — цвет (ведущий) → вариант (отвечающий) → выбор (ведущий); роли по кругу парами */
    qr2: {
      stage: function (r, box) {
        var co = r.co, n = co.parts.length, k = Math.min(CO_L.length, r.x.coopOpts + (r.level - 1));
        var cols = CO_COL.slice();
        for (var i = cols.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
        cols = cols.slice(0, k);
        var right = rnd(k);
        co.combo = { seq: ++co.seq, asker: co.parts[r.stage % n], answerer: co.parts[(r.stage + 1) % n], need: cols[right][1],
          opts: cols.map(function (c, q) { return { l: CO_L[q], c: c[1] }; }) };
        co.right = CO_L[right];
        coDraw(box, co.combo);
        coSend();
      }
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

  /* ---------- П29 (06, 164, 167): камера на QR ---------- */
  var CO_L = ['А', 'Б', 'В', 'Г'];
  var CO_COL = [['красный', '#ff4d4d'], ['синий', '#4d8bff'], ['жёлтый', '#ffd84d'], ['зелёный', '#33ff66']];
  var qrCan = document.createElement('canvas'), qrT = 0;
  function me() { return P.state && P.state.account; }
  function esc(t) { return SG.esc(String(t == null ? '' : t)); }
  function accName(a) { var x = P.game && SG.byId(P.game.accounts || [], a); return (x && x.name) || a || '?'; }
  function qrNew() { return { seen: 0, aim: true, aimAt: now(), lost: false, lostAt: 0, lostTotal: 0, next: 0, who: '' }; }
  /* игра стоит: камеру ещё не навели или QR потерян (у участника — по слову ведущего) */
  function qrBlocked() { return !!(run && !run.done && run.qs && (run.qs.aim || run.qs.lost)); }
  /* что видит камера: текст QR или '' (проверки подают «увиденное» через window.SG_QR_SEE) */
  function qrSee() {
    if (window.SG_QR_SEE !== undefined) return window.SG_QR_SEE || '';
    var v = $('mg-video');
    if (!v || !v.videoWidth || !window.jsQR) return '';
    var k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
    qrCan.width = Math.round(v.videoWidth * k);
    qrCan.height = Math.round(v.videoHeight * k);
    var ctx = qrCan.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, qrCan.width, qrCan.height);
    var img = ctx.getImageData(0, 0, qrCan.width, qrCan.height);
    var res = window.jsQR(img.data, qrCan.width, qrCan.height, { inversionAttempts: 'attemptBoth' });
    return res && res.data ? res.data : '';
  }
  function qrCamOn() { if (P.startCam && !window.SG_NO_CAM) P.startCam($('mg-video'), null, null, 'mgqr', 'environment'); }
  function qrStart() {
    $('mg-bar').style.width = '100%';
    $('mg-timetxt').textContent = '';
    qrCamOn();
    clearInterval(qrT);
    qrT = setInterval(function () {
      if (!run || run.done || !run.qs) return;
      if (run.fork || SG.qrFits(run.x, me(), qrSee())) run.qs.seen = now();   // П30: пока развилка — QR не нужен
      if (run.guest) coReport();
    }, 250);
  }
  function qrStop() {
    clearInterval(qrT);
    qrT = 0;
    if (P.stopCam) P.stopCam('mgqr');
    lay.classList.remove('qr-off');
  }
  // вернулись в приложение — камера снова (пока приложения не было на экране, QR не было)
  document.addEventListener('visibilitychange', function () { if (!document.hidden && run && !run.done && run.qs) qrCamOn(); });
  /* сколько мс участник не видел свой QR (у ведущего — по отчётам участников) */
  function qrAgo(acc, t) {
    if (!run.co || acc === me()) return run.qs.seen ? t - run.qs.seen : Infinity;
    var r = run.co.rep[acc];
    return r && r.ago >= 0 ? r.ago + (t - r.at) : Infinity;
  }
  function qrWorst(t) {
    var w = { ago: -1, who: '' };
    (run.co ? run.co.parts : [me()]).forEach(function (a) { var g = qrAgo(a, t); if (g > w.ago) w = { ago: g, who: a }; });
    return w;
  }
  function qrLeft(t, w) {
    var x = run.x, q = run.qs, a = x.qrLost * 1000 - w.ago;
    if (x.qrLostMax && q.lost) a = Math.min(a, x.qrLostMax * 1000 - q.lostTotal - (t - q.lostAt));
    return Math.max(0, a);
  }
  /* ведущий / один: ждём QR, проверка раз в qrEvery с, срыв — помехи, провал. true — дальше в этом такте не идти. */
  function qrTick(t) {
    var q = run.qs, x = run.x, W = x.qrEvery * 1000, w = qrWorst(t);
    if (q.aim) {
      if (w.ago <= W) { qrGo(t); return true; }
      if (t - q.aimAt > x.joinSec * 1000) { finish('fail', run.co ? 'НЕ ВСЕ НАВЕЛИ КАМЕРЫ' : 'QR НЕ НАЙДЕН'); return true; }
      qrPaint(qrView(t, w));
      if (run.co) coBeat(t);
      return true;
    }
    if (t >= q.next) { q.next = t + W; qrSet(w.ago > W + 300, t, w.who); }
    if (w.ago > x.qrLost * 1000) { finish('fail', 'QR ПОТЕРЯН'); return true; }
    if (q.lost && x.qrLostMax && q.lostTotal + (t - q.lostAt) > x.qrLostMax * 1000) { finish('fail', 'СЛИШКОМ ДОЛГО БЕЗ QR'); return true; }
    qrPaint(qrView(t, w));
    if (run.co) coBeat(t);
    return false;
  }
  function qrView(t, w) {
    var q = run.qs, parts = run.co ? run.co.parts : null, W = run.x.qrEvery * 1000;
    return { aim: q.aim, lost: q.lost, who: q.who, left: q.lost ? qrLeft(t, w) : null, parts: parts,
      ready: parts ? parts.filter(function (a) { return qrAgo(a, t) <= W; }) : [] };
  }
  function qrSet(bad, t, who) {
    var q = run.qs;
    q.who = who;
    if (bad === q.lost) return;
    q.lost = bad;
    if (bad) { q.lostAt = t; P.sound('glitch'); if (navigator.vibrate) navigator.vibrate([60, 40, 60]); }
    else {
      var d = t - q.lostAt;
      q.lostTotal += d;
      if (run.x.qrTime !== 'run') { run.stageAt += d; run.startAt += d; if (run.codeHide) run.codeHide += d; }   // время стояло — сдвинуть
    }
    lay.classList.toggle('qr-off', bad);
    if (run.sl && run.sl.pause) run.sl.pause(bad);
    if (run.co) coSend();
  }
  function qrGo(t) {
    var q = run.qs;
    q.aim = false;
    q.next = t + run.x.qrEvery * 1000;
    run.startAt = t;
    P.sound('ok');
    next();
  }
  function qrPaint(v) {
    var s = $('mg-qrst'), many = v.parts && v.parts.length > 1;
    if (v.aim) {
      s.textContent = many ? 'ЖДЁМ: ' + v.parts.filter(function (a) { return v.ready.indexOf(a) < 0; }).map(accName).join(', ') : 'НАВЕДИТЕ КАМЕРУ НА QR';
      $('mg-hint').textContent = many ? 'НАВЕДИТЕ КАМЕРУ НА СВОЙ QR' : 'НАВЕДИТЕ КАМЕРУ НА QR';
    } else if (v.lost) s.textContent = 'ПОМЕХИ — QR ПОТЕРЯН' + (many && v.who ? ': ' + accName(v.who) : '') + (v.left != null ? ' · ' + Math.ceil(v.left / 1000) + ' С' : '');
    else s.textContent = 'QR НА МЕСТЕ';
    s.classList.toggle('warn', !!v.lost);
  }

  /* ---------- П29: вдвоём и больше (ведущий — кто запустил) ---------- */
  function coBody(extra) {
    var r = run, co = r.co, t = now(), w = qrWorst(t), v = qrView(t, w);
    return Object.assign({ k: 'mg-co', sid: co.sid, gid: r.x.id, host: co.host, level: r.level, phase: r.qs.aim ? 'join' : 'play', stage: r.stage, err: r.err,
      startAt: r.startAt, stageAt: r.stageAt, lost: !!r.qs.lost, who: r.qs.who || '', left: v.left, ready: v.ready, parts: co.parts, combo: r.fork ? null : co.combo, flash: co.flash || '',
      fork: r.fork ? { id: r.fork.f.id, seq: r.fork.seq, by: r.fork.by, sec: r.fork.f.sec } : null }, extra || {});
  }
  function coSend(extra) {
    var co = run.co, to = co.parts.filter(function (a) { return a !== me(); });
    if (Net.up && to.length) Net.send({ t: 'live', to: to.map(function (a) { return 'acc:' + a; }), body: coBody(extra) });
    co.beat = now();
    co.flash = '';
  }
  function coBeat(t) { if (t - run.co.beat > 1500) coSend(); }   // раз в 1,5 с — состояние участникам (и «ведущий на связи»)
  function coPick(from, seq, l) {
    if (!run || run.done || !run.co || run.guest || qrBlocked()) return;
    var c = run.co.combo;
    if (!c || c.seq !== seq || from !== c.asker) return;
    if (l === run.co.right) stageOk(); else stageErr();
  }
  function coTap(l) {
    if (!run || run.done || qrBlocked()) return;
    var c = run.guest ? run.cs && run.cs.combo : run.co && run.co.combo;
    if (!c || c.asker !== me()) return;
    P.sound('key');
    if (run.guest) { if (Net.up) Net.send({ t: 'live', to: ['acc:' + run.host], body: { k: 'mg-cp', sid: run.sid, seq: c.seq, l: l } }); }
    else coPick(me(), c.seq, l);
  }
  /* экран роли: ведущий — нужный цвет и серые варианты (кнопки), отвечающий — варианты в цветах, остальные — кто кого спрашивает */
  function coDraw(box, c) {
    if (!c) { if (box.dataset.seq) { box.dataset.seq = ''; box.innerHTML = ''; } return; }
    if (box.dataset.seq === String(c.seq)) return;   // тот же расклад — не перерисовывать
    box.dataset.seq = String(c.seq);
    var m = me();
    if (m === c.asker) {
      box.innerHTML = '<div class="co-need" style="background:' + c.need + '">НУЖНЫЙ ВАРИАНТ</div><div class="co-opts">' +
        c.opts.map(function (o) { return '<button class="co-o" data-l="' + o.l + '">' + o.l + '</button>'; }).join('') + '</div><p class="co-who">Отвечает: ' + esc(accName(c.answerer)) + '</p>';
      box.querySelectorAll('.co-o').forEach(function (b) { b.addEventListener('click', function () { coTap(b.dataset.l); }); });
      $('mg-hint').textContent = 'СКАЖИТЕ ЦВЕТ — НАЖМИТЕ ВАРИАНТ, КОТОРЫЙ НАЗОВУТ';
    } else if (m === c.answerer) {
      box.innerHTML = '<div class="co-opts">' + c.opts.map(function (o) { return '<div class="co-o co-col" style="background:' + o.c + '">' + o.l + '</div>'; }).join('') + '</div>' +
        '<p class="co-who">Спрашивает: ' + esc(accName(c.asker)) + '</p>';
      $('mg-hint').textContent = 'НАЗОВИТЕ ВАРИАНТ НУЖНОГО ЦВЕТА';
    } else {
      box.innerHTML = '<p class="co-wait">' + esc(accName(c.asker)) + ' спрашивает: ' + esc(accName(c.answerer)) + '</p>';
      $('mg-hint').textContent = 'ДЕРЖИТЕ КАМЕРУ НА QR';
    }
  }
  /* ведущий ждёт сбора и получил приглашение той же игры от другого — уступает тот, чей id больше (пульт запустил обоим) */
  function coYield() {
    var r = run, rc = rec(r.x.id);
    rc.n = Math.max(0, rc.n - 1);
    P.save();
    coSend({ end: { res: 'cancel' } });
    r.done = true;
    r.after = null;
    qrStop();
    if (P.stack.length && P.stack[P.stack.length - 1].id === 'mg') P.closeTop(); else run = null;
  }
  /* участник: открыть игру ведущего */
  function coJoin(b, from) {
    var x = P.game && SG.byId(P.game.games || [], b.gid);
    if (!x || !P.acc()) return;
    run = { x: x, kind: 'qr2', guest: true, sid: b.sid, host: from || b.host, level: b.level || 1, stage: b.stage || 0, err: 0, startAt: now(), stageAt: now(), done: false,
      opts: null, qs: qrNew(), cs: b, heard: now(), rep: 0, br: {}, fdone: {} };
    lay.className = 'overlay kind-qr2 qr guest';
    $('mg-fork').hidden = true;
    $('mg-end').hidden = true;
    $('mg-play').innerHTML = ''; $('mg-play').dataset.seq = '';
    P.pushLayer('mg', function () {
      if (run && run.guest && !run.done && Net.up) Net.send({ t: 'live', to: ['acc:' + run.host], body: { k: 'mg-cl', sid: run.sid } });
      if (run && run.guest) qrStop();
      var after = run && run.after;
      run = null;
      clearTimeout(endT);
      if (after && after.length) setTimeout(function () { P.doActions(after); }, 60);
    });
    qrStart();
    P.sound('note');
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    coGuest(b);
  }
  function coGuest(b) {
    var r = run;
    r.heard = now();
    if (b.end) {
      if (b.end.res === 'cancel') { r.done = true; qrStop(); if (P.stack.length && P.stack[P.stack.length - 1].id === 'mg') P.closeTop(); return; }
      guestEnd(b.end.res, b.end.text, b.end.br);
      return;
    }
    r.cs = b;
    if (b.fork && (!r.fork || r.fork.seq !== b.fork.seq)) { guestFork(b.fork); }
    else if (!b.fork && r.fork) forkHide();
    if (r.fork) return;
    r.stage = b.stage; r.err = b.err; r.startAt = b.startAt; r.stageAt = b.stageAt;
    r.qs.aim = b.phase === 'join';
    var was = r.qs.lost;
    r.qs.lost = !!b.lost;
    lay.classList.toggle('qr-off', r.qs.lost);
    if (r.qs.lost && !was) { P.sound('glitch'); if (navigator.vibrate) navigator.vibrate([60, 40, 60]); }
    if (b.flash) { flash(b.flash); P.sound(b.flash === 'ОШИБКА' ? 'err' : 'ok'); }
    paint();
    coDraw($('mg-play'), b.combo);
    qrPaint(b.phase === 'join' ? { aim: true, parts: b.parts, ready: b.ready || [] } : { lost: r.qs.lost, who: b.who, left: b.left, parts: b.parts });
  }
  function guestTick(t) {
    var r = run;
    if (t - r.heard > Math.max(8000, r.x.qrEvery * 3000)) { guestEnd('fail', 'НЕТ СВЯЗИ С ВЕДУЩИМ'); return true; }
    return !!r.qs.aim;
  }
  function guestEnd(res, text, br) {
    var r = run;
    if (!r || r.done) return;
    r.done = true;
    qrStop();
    if (r.fork) forkHide();
    // П30 (Т42-7 В): у участника — действия с галочкой «у всех участников»; свой исход («каждый сам себе») — целиком
    var oc = guestOutcome(r.x, res, br || {}, r.br || {});
    r.after = oc.acts;
    if (oc.text) text = oc.text;
    P.sound(res === 'ok' ? 'win' : 'lose');
    lay.classList.add(res === 'ok' ? 'won' : 'lost');
    $('mg-end-t').textContent = res === 'ok' ? 'УСПЕХ' : 'ПРОВАЛ';
    $('mg-end-x').textContent = text || '';
    $('mg-end').hidden = false;
    endT = setTimeout(function () { if (P.stack.length && P.stack[P.stack.length - 1].id === 'mg') P.closeTop(); }, 8000);
  }
  /* участник шлёт ведущему, давно ли видел свой QR (раз в 0,5 с) */
  function coReport() {
    var r = run, t = now();
    if (t - r.rep < 500 || !Net.up) return;
    r.rep = t;
    Net.send({ t: 'live', to: ['acc:' + r.host], body: { k: 'mg-cq', sid: r.sid, ago: r.qs.seen ? t - r.qs.seen : -1 } });
  }
  Net.on('live', function (o) {
    var b = o.body || {}, from = o.from && o.from.acc;
    if (b.k === 'mg-cq' || b.k === 'mg-cp' || b.k === 'mg-cl' || b.k === 'mg-cf') {
      if (!run || run.guest || !run.co || b.sid !== run.co.sid || run.co.parts.indexOf(from) < 0) return;
      if (b.k === 'mg-cq') run.co.rep[from] = { ago: +b.ago, at: now() };
      else if (b.k === 'mg-cp') coPick(from, b.seq, b.l);
      else if (b.k === 'mg-cf') forkGot(from, b.seq, b.br);
      else if (!run.done) finish('fail', 'НАПАРНИК ВЫШЕЛ ИЗ ИГРЫ');
      return;
    }
    if (b.k !== 'mg-co') return;
    if (run && run.guest && run.sid === b.sid) { if (!run.done) coGuest(b); return; }
    if (b.end || b.phase !== 'join' || !Array.isArray(b.parts) || b.parts.indexOf(me()) < 0 || !P.acc()) return;
    if (run && !run.done && run.co && !run.guest && run.x.id === b.gid && run.qs.aim && from && from < me()) coYield();
    if (run) return;   // уже в игре (или на экране итога)
    coJoin(b, from);
  });
  /* ---------- П30 (06, 165, 168; П-106): развилки — этап выбора исхода ----------
     Развилка — после этапа f.after (>= этапов — после успеха). Выбирающий видит тревожное окно с последствиями исходов
     (hint), другие (участники, наблюдатели) — обычный ход игры (watchText или «ВЕДУЩИЙ ВЫБИРАЕТ…»). Исход выбирается
     один раз навсегда (rec.forks); доступен один — без окна; пока окно открыто, игра, её время и QR стоят. Вдвоём:
     by 'lead' — выбирает ведущий, 'each' — каждый сам себе (тайно), ведущий ждёт всех (mg-cf). */
  function forkList(f) { return f.branches.filter(function (b) { return SG.forkCan(P.game, b, me(), P.state || {}); }); }
  function forkOld(f) { var r = rec(run.x.id); return r.forks && r.forks[f.id] ? SG.byId(f.branches, r.forks[f.id]) : null; }
  /* после пройденного этапа (run.stage — сколько пройдено). true — открыто окно развилки (игра ждёт). */
  function forkStep() {
    var x = run.x;
    var fs = x.forks.filter(function (f) { return !run.fdone[f.id] && Math.min(f.after, x.stages) === run.stage; });
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i], by = run.co && f.by === 'each' ? 'each' : 'lead', old = forkOld(f), list = forkList(f);
      run.fdone[f.id] = true;
      var auto = old || (list.length === 1 ? list[0] : null);
      if (by === 'lead') {
        if (auto) { forkSet(f, auto, old ? 'again' : 'one'); continue; }
        if (!list.length) continue;
        forkOpen(f, list, 'lead');
        return true;
      }
      forkOpen(f, auto || !list.length ? null : list, 'each', auto, old ? 'again' : 'one');
      return true;
    }
    return false;
  }
  function forkOpen(f, list, by, auto, mode) {
    var kd = KINDS[run.kind];
    if (run.kind !== 'voice2' && kd.stop) kd.stop(run);
    run.opts = null;
    if (run.qs && run.qs.lost) qrSet(false, now(), '');   // помехи сняты: пока выбор, QR не нужен
    run.fork = { f: f, list: list, by: by, seq: ++run.fseq, at: now(), got: {}, mine: null };
    if (auto) forkMine(auto, mode);
    else if (!list) { run.fork.mine = '-'; run.fork.got[me()] = ''; }   // мне выбирать нечего
    forkDraw();
    if (run.co) coSend();
    watchSend();
    P.voiceSync();
    if (run.fork && run.fork.list && !run.fork.mine) { P.sound('note'); if (navigator.vibrate) navigator.vibrate([120, 60, 120]); }
  }
  /* участник: ведущий открыл развилку */
  function guestFork(bf) {
    var r = run, f = SG.byId(r.x.forks, bf.id);
    if (!f) return;
    r.opts = null;
    lay.classList.remove('qr-off');
    r.fork = { f: f, list: null, by: bf.by, seq: bf.seq, at: now(), got: {}, mine: null };
    if (bf.by === 'each') {
      r.fdone[f.id] = true;
      var old = forkOld(f), list = forkList(f), auto = old || (list.length === 1 ? list[0] : null);
      if (auto) forkMine(auto, old ? 'again' : 'one');
      else if (!list.length) { r.fork.mine = '-'; if (Net.up) Net.send({ t: 'live', to: ['acc:' + r.host], body: { k: 'mg-cf', sid: r.sid, seq: bf.seq, br: '' } }); }
      else r.fork.list = list;
    }
    forkDraw();
    P.voiceSync();
    if (r.fork.list && !r.fork.mine) { P.sound('note'); if (navigator.vibrate) navigator.vibrate([120, 60, 120]); }
  }
  function forkDraw() {
    var k = run.fork, f = k.f, chooser = !!(k.list && k.list.length && !k.mine);
    $('mg-play').innerHTML = ''; $('mg-play').dataset.seq = '';
    lay.classList.add('forking');
    lay.classList.toggle('fork-alarm', chooser);
    $('mg-fork').hidden = false;
    $('mg-fork-t').textContent = chooser ? f.title || 'ВЫБОР' : '';
    $('mg-fork-x').textContent = chooser ? f.text : k.picked ? 'ЖДЁМ ОСТАЛЬНЫХ…' : f.watchText || (run.guest && k.by === 'lead' ? 'ВЕДУЩИЙ ВЫБИРАЕТ…' : 'ИДЁТ ОБРАБОТКА…');
    var bx = $('mg-fork-b');
    bx.innerHTML = '';
    if (chooser) k.list.forEach(function (b, i) {
      var e = document.createElement('button');
      e.className = 'mg-fork-o';
      e.dataset.i = String(i);
      e.innerHTML = '<b>' + esc(b.name) + '</b>' + (b.hint ? '<small>' + esc(b.hint) + '</small>' : '');
      e.addEventListener('click', function () { forkPick(i, 'tap'); });
      bx.appendChild(e);
    });
    $('mg-fork-time').hidden = !(chooser && f.sec);
    $('mg-hint').textContent = chooser ? (run.kind === 'voice2' ? 'СКАЖИТЕ ИЛИ НАЖМИТЕ' : 'ВЫБЕРИТЕ') : '';
  }
  function forkTick(t) {
    var k = run.fork, f = k.f, chooser = !!(k.list && k.list.length && !k.mine);
    if (run.guest && t - run.heard > Math.max(8000, run.x.qrEvery * 3000)) { guestEnd('fail', 'НЕТ СВЯЗИ С ВЕДУЩИМ'); return; }
    if (run.co && !run.guest) coBeat(t);
    if (!f.sec) return;
    var left = f.sec * 1000 - (t - k.at);
    $('mg-fork-bar').style.width = Math.max(0, 100 * left / (f.sec * 1000)) + '%';
    if (chooser && left <= 0) { forkPick(0, 'time'); return; }   // Т42-9 Б: не выбрал — первый исход
    if (!run.guest && k.by === 'each' && left <= -5000) forkDone();   // кто не ответил — первый исход у себя
  }
  function forkPick(i, how) {
    var k = run && run.fork;
    if (!k || run.done || !k.list || k.mine) return;
    var b = k.list[i];
    if (!b) return;
    P.sound('key');
    k.picked = true;
    forkMine(b, '');
    if (!run.fork) return;
    if (k.by === 'lead' && !run.guest) { forkResume(); return; }
    forkDraw();
    P.voiceSync();
  }
  /* свой выбор: запомнить; участник — сообщить ведущему; ведущий «каждый сам» — отметить себя */
  function forkMine(b, mode) {
    var k = run.fork;
    k.mine = b.id;
    forkSet(k.f, b, mode);
    if (run.guest) { if (Net.up) Net.send({ t: 'live', to: ['acc:' + run.host], body: { k: 'mg-cf', sid: run.sid, seq: k.seq, br: b.id } }); return; }
    if (k.by === 'each') forkGot(me(), k.seq, b.id);
  }
  function forkGot(from, seq, bid) {
    var k = run && run.fork;
    if (!k || run.guest || k.by !== 'each' || k.seq !== seq) return;
    k.got[from] = bid || '';
    if (run.co.parts.every(function (a) { return k.got.hasOwnProperty(a); })) forkDone();
  }
  function forkDone() {
    var k = run.fork;
    if (!k) return;
    run.co.fb[k.f.id] = Object.assign({}, k.got);
    forkResume();
  }
  /* исход: mode '' — выбран в окне: запись (один раз навсегда — Т42-8 Б), пульту и терминалу, переменная;
     'again' — выбран раньше; 'one' — доступен один (выбора не было: не запоминается — откроется другой, будет и выбор) */
  function forkSet(f, b, mode) {
    run.br[f.id] = b.id;
    if (mode) return;
    var r = rec(run.x.id);
    r.forks = r.forks || {};
    r.forks[f.id] = b.id;
    P.save();
    if (Net.url) Net.msg(['role:master', 'role:terminal'], 'game', { game: run.x.id, name: run.x.name, fork: f.id, branch: b.id, branchName: b.name, value: b.value || b.name, acc: me() });
    if (f.var) P.doActions([{ type: 'term', name: f.var, value: b.value || b.name }]);
  }
  function forkResume() {
    var k = run.fork, d = now() - k.at;
    run.startAt += d; run.stageAt += d;
    if (run.qs) { var t = now(); run.qs.seen = t; run.qs.next = t + run.x.qrEvery * 1000; if (run.co) run.co.parts.forEach(function (a) { run.co.rep[a] = { ago: 0, at: t }; }); }
    forkHide();
    if (run.co) coSend();
    watchSend();
    P.voiceSync();
    if (forkStep()) return;
    stageGo();
  }
  function forkHide() {
    if (run) run.fork = null;
    lay.classList.remove('forking', 'fork-alarm');
    $('mg-fork').hidden = true;
    $('mg-fork-b').innerHTML = '';
  }
  /* итог с исходами: свои действия исходов (пусто — общие игры), текст — последнего исхода со своим текстом;
     other — что видят другие (участники, наблюдатели) при успехе */
  function outcome(x, res, br) {
    var ok = res === 'ok', bs = [], acts = [], text = '', other = '';
    x.forks.forEach(function (f) { var b = br && br[f.id] && SG.byId(f.branches, br[f.id]); if (b) bs.push(b); });
    bs.forEach(function (b) {
      acts = acts.concat(ok ? b.okActions : b.failActions);
      var t = ok ? b.okText : b.failText;
      if (t) text = t;
      if (b.otherText) other = b.otherText;
    });
    var own = acts.length > 0;
    if (!own) acts = ok ? x.okActions : x.failActions;
    if (!text) text = ok ? x.okText : x.failText;
    return { acts: acts, own: own, text: text, other: ok && other ? other : text, names: bs.map(function (b) { return b.name; }) };
  }

  function guestOutcome(x, res, lead, own) {
    var ok = res === 'ok', acts = [], text = '', any = false;
    function co(a) { return !!a.co; }
    x.forks.forEach(function (f) {
      var mine = own[f.id], b = SG.byId(f.branches, mine || lead[f.id]);
      if (!b) return;
      var a = ok ? b.okActions : b.failActions;
      if (a.length) any = true;
      acts = acts.concat(mine ? a : a.filter(co));
      var t = ok ? b.okText : b.failText;
      if (mine && t) text = t;
    });
    if (!any) acts = (ok ? x.okActions : x.failActions).filter(co);
    return { acts: acts, text: text };
  }

  /* ---------- П30 (Т42-2): наблюдение — другие видят ход игры по тому же коду / QR ----------
     Игрок (или ведущий) шлёт всем {k:'mg-w'} раз в 1,5 с и при каждом изменении; телефон, которому код игры не открыт,
     во время чужой игры вместо отказа видит её ход: этап, помехи, итог. Развилка для него — обычный этап. */
  function watchPh() { return run.fork ? 'fork' : run.qs && run.qs.aim ? 'aim' : run.qs && run.qs.lost ? 'lost' : 'play'; }
  function watchSend(extra) {
    if (!run || run.guest || !run.x.watch || !Net.up) return;
    var x = run.x, b = Object.assign({ k: 'mg-w', sid: run.sid, gid: x.id, title: x.title || x.name, stage: Math.min(run.stage + 1, x.stages), of: x.stages, err: run.err,
      ph: watchPh(), wait: run.fork ? run.fork.f.watchText : '' }, extra || {});
    Net.send({ t: 'live', to: ['all'], body: b });
    run.wb = now();
    run.wk = b.ph + b.stage + ':' + b.err;
  }
  function watchBeat(t) {
    if (!run.x.watch) return;
    var k = watchPh() + Math.min(run.stage + 1, run.x.stages) + ':' + run.err;
    if (k !== run.wk || t - run.wb > 1500) watchSend();
  }
  var watched = {};   // id игры → {b, acc, at}
  var wv = document.createElement('div');
  wv.id = 'mg-watch';
  wv.className = 'modal nobits';
  wv.innerHTML = '<div class="dlg-box"><div class="dlg-title" id="mgw-title"></div><div class="dlg-text" id="mgw-text"></div><div class="dlg-btns"><button class="btn dim" id="mgw-close">Закрыть</button></div></div>';
  $('dlg').parentNode.appendChild(wv);
  $('mgw-close').addEventListener('click', function () { wv.classList.remove('on'); wv.dataset.gid = ''; });
  function watchDraw() {
    var w = watched[wv.dataset.gid];
    if (!w) return;
    var b = w.b, st = 'ЭТАП ' + b.stage + ' / ' + b.of + ' · ';
    $('mgw-title').textContent = accName(w.acc) + ': ' + (b.title || '');
    $('mgw-text').textContent = b.ph === 'end' ? (b.res === 'ok' ? 'УСПЕХ' : 'ПРОВАЛ') + (b.text ? '\n' + b.text : '') :
      b.ph === 'aim' ? 'НАВОДИТ КАМЕРУ НА QR' : b.ph === 'lost' ? st + 'ПОМЕХИ' : st + (b.ph === 'fork' && b.wait ? b.wait : 'ИДЁТ РАБОТА') + (b.err ? '\nОШИБОК: ' + b.err : '');
    wv.classList.toggle('end', b.ph === 'end');
  }
  Net.on('live', function (o) {
    var b = o.body || {}, from = o.from && o.from.acc;
    if (b.k !== 'mg-w' || !from || from === me()) return;
    watched[b.gid] = { b: b, acc: from, at: now() };
    if (wv.dataset.gid === b.gid && wv.classList.contains('on')) watchDraw();
  });
  /* код не открыт этому персонажу (player.js): идёт чужая игра этого кода с наблюдением — показать её ход. true — показано. */
  P.mgWatch = function (code) {
    if (!code || (run && !run.done)) return false;
    var t = now(), w = null;
    // П31: и мини-игры шагов кнопок кода
    var gs = (code.buttons || []).reduce(function (l, b) { return l.concat(b.steps.filter(function (s) { return s.game; }).map(function (s) { return { type: 'game', game: s.game }; })); }, []);
    (code.actions || []).concat(gs).forEach(function (a) {
      var s = a.type === 'game' && watched[a.game];
      if (!w && s && s.b.ph !== 'end' && t - s.at < 5000) w = s;
    });
    if (!w) return false;
    wv.dataset.gid = w.b.gid;
    watchDraw();
    wv.classList.add('on');
    P.sound('note');
    return true;
  };
  P.mgWatchStat = function () { var w = watched[wv.dataset.gid]; return wv.classList.contains('on') && w ? { gid: w.b.gid, acc: w.acc, ph: w.b.ph, text: $('mgw-text').textContent } : null; };
  /* пульт: последние выборы исходов */
  var forkLog = [];
  P.on('msg', function (o) { if (o && o.kind === 'game' && o.body) { forkLog.push(o); if (forkLog.length > 30) forkLog.shift(); } });

  /* для проверок: состояние игры */
  P.mgStat = function () {
    if (!run) return null;
    var q = run.qs || {}, c = (run.guest ? run.cs && run.cs.combo : run.co && run.co.combo) || {};
    return { id: run.x.id, kind: run.kind, guest: !!run.guest, stage: run.stage, err: run.err, done: !!run.done, aim: !!q.aim, lost: !!q.lost, lostTotal: q.lostTotal || 0,
      prog: run.prog || 0, seq: c.seq || 0, asker: c.asker || '', answerer: c.answerer || '', parts: run.co ? run.co.parts : run.cs ? run.cs.parts : null,
      fork: run.fork ? { id: run.fork.f.id, by: run.fork.by, list: run.fork.list ? run.fork.list.map(function (b) { return b.name; }) : null, mine: run.fork.mine } : null,
      br: Object.assign({}, run.br || {}), fb: run.co ? run.co.fb : null };
  };

  /* Голос: фразы этапа (voice.js добавляет их в грамматику и включает микрофон на время игры). */
  P.mgRunning = function () { return !!(run && !run.done); };   // любая игра на экране
  P.mgActive = function () { return !!(run && !run.done && run.kind === 'voice2' && (run.opts || (run.fork && run.fork.list && !run.fork.mine))); };
  P.mgPhrases = function () {
    if (!P.mgActive()) return [];
    if (run.fork) return run.fork.list.map(function (b, i) { return { id: 'mg:f' + run.fork.seq + ':' + i, text: SG.voiceNorm(b.voice || b.name), max: 0, every: 0, net: [], mine: true }; }).filter(function (p) { return p.text; });   // П30 (Т42-12 А)
    return run.opts.map(function (o, i) { return { id: 'mg:' + run.seq + ':' + i, text: SG.voiceNorm(o.text), max: 0, every: 0, net: [], mine: true }; }).filter(function (p) { return p.text; });
  };
  P.mgVoice = function (id) {
    if (!P.mgActive()) return false;
    var x = String(id).split(':');
    if (/^f/.test(x[1] || '')) { if (run.fork && +x[1].slice(1) === run.fork.seq) forkPick(+x[2], 'voice'); return true; }   // П30: исход голосом
    if (+x[1] !== run.seq) return true;   // фраза прошлого этапа (служба услышала поздно)
    if (qrBlocked()) return true;          // П29: QR потерян — ответы не принимаются
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
      h('p', { class: 'hint', text: 'Игра откроется на телефоне сразу (без связи — когда подключится). Итог — действия игры (успех / ошибка / провал).' }),
      forkLog.length ? h('div', { class: 'mg-forklog' }, [h('b', { text: 'Исходы развилок' })].concat(forkLog.slice(-8).reverse().map(function (o) {
        var b = o.body, d = new Date((o.at || Date.now()) - Net.offset);
        return h('div', { class: 'sm', text: ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' · ' + accName(b.acc) + ' · ' + (b.name || '') + ': ' +
          (b.fork ? '«' + b.branchName + '»' : (b.res === 'ok' ? 'УСПЕХ' : 'ПРОВАЛ') + (b.branches && b.branches.length ? ' («' + b.branches.join('», «') + '»)' : '')) });
      }))) : null);
  };
})();
