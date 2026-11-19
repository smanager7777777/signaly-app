/* СИГНАЛЫ — голос (П-58): функция «Голос», кнопка 🎙 в шапке, фразы кодов и цифры.
   В APK микрофон слушает служба Android (Vosk, офлайн, режим грамматики; детектор голоса — SgVad), она же шлёт
   сообщения центру, даже с погашенным экраном, и передаёт сюда «услышана фраза» (Net: t:'voice').
   В браузере (предпросмотр, проверки) распознавания нет: 🎙 открывает «пробу» — фразу набирают текстом. */
(function () {
  'use strict';
  var P = window.SGP, Net = window.SGNet, SG = window.SG;
  var plugin = Net.plugin && Net.plugin.voiceConfig ? Net.plugin : null;
  var $ = function (id) { return document.getElementById(id); };
  var mode = 'off', on = false, downAt = 0, wasOn = false, sent = '', st = { listening: false };
  var last = {};   // пауза фраз в браузере

  var btn = document.createElement('button');
  btn.id = 'bar-voice';
  btn.className = 'bar-btn';
  btn.textContent = '🎙';
  btn.title = 'голос';
  btn.hidden = true;
  $('bar').querySelector('.bar-r').insertBefore(btn, $('bar-chap'));

  /* off | button | screen | always | broken | denied */
  function modeNow() {
    var a = P.acc();
    if (!a || !P.game) return 'off';
    var s = P.modState('voice');
    if (s !== 'on') return s === 'hidden' ? 'off' : s;
    return a.voiceMode && a.voiceMode !== 'off' ? a.voiceMode : 'button';
  }
  function cfg() { return SG.voiceConfig(P.game, P.flatState()); }
  function realMode() { return mode === 'broken' || mode === 'denied' ? 'off' : mode; }

  function paint() {
    // П9, ответ 13Б: в фоновых режимах 🎙 не видно (игроки не знают, что микрофон слушает); Android всё равно показывает свою точку микрофона
    var a = P.acc();
    btn.hidden = mode === 'off' || mode === 'screen' || mode === 'always' || !!(a && (a.voiceMode === 'screen' || a.voiceMode === 'always'));
    btn.classList.toggle('broken', mode === 'broken' || mode === 'denied');
    var listening = plugin ? !!st.listening : (mode === 'screen' || mode === 'always' || (mode === 'button' && on));
    btn.classList.toggle('on', listening && realMode() !== 'off');
    btn.classList.toggle('bg', mode === 'screen' || mode === 'always');
  }

  P.voiceSync = function () {
    var was = mode;
    mode = modeNow();
    if (mode !== 'button') on = false;
    if (plugin) {
      var c = realMode() === 'off' ? { phrases: [], digits: false } : cfg();
      var key = JSON.stringify([realMode(), c, P.game ? P.game.voice.sens : 1]);
      if (key !== sent) {
        sent = key;
        plugin.voiceConfig({ mode: realMode(), config: JSON.stringify(c), sens: P.game ? P.game.voice.sens : 1 }).then(function (r) { if (r) { st = r; paint(); } })
          .catch(function () { /* старая служба */ });
      }
      if (was === 'button' && mode !== 'button') plugin.voiceButton({ on: false }).catch(function () {});
    }
    paint();
  };
  ['route', 'modules', 'login', 'net'].forEach(function (k) { P.on(k, function () { P.voiceSync(); }); });
  P.on('state', function (k) { if (k === 'chapter') setTimeout(P.voiceSync, 600); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && on && mode === 'button') { on = false; if (plugin) plugin.voiceButton({ on: false }).catch(function () {}); paint(); }
  });

  function listen(v) {
    on = v;
    if (plugin) plugin.voiceButton({ on: v, digits: true }).then(function (r) { if (r) { st = r; paint(); } }).catch(function () {});
    else if (v) probe(false);
    paint();
  }

  /* По кнопке: держать — слушает, пока нажата; коротко нажать — слушает, пока не нажмёшь снова. */
  btn.addEventListener('pointerdown', function (e) {
    if (mode !== 'button' || !plugin) return;
    e.preventDefault();
    downAt = Date.now();
    wasOn = on;
    if (!on) listen(true);
  });
  btn.addEventListener('pointerup', function () {
    if (mode !== 'button' || !plugin) return;
    var long = Date.now() - downAt > 450;
    if (long || wasOn) listen(false);
  });
  btn.addEventListener('click', function () {
    var T = P.game.texts;
    if (mode === 'broken' || mode === 'denied') {
      P.sound('err');
      P.dialog({ title: mode === 'broken' ? T.broken : T.denied, warn: true, text: mode === 'broken' ? 'Голосовой модуль неисправен. Нужен ремонт.' : 'Функция недоступна для этого профиля.' });
      return;
    }
    if (plugin) {
      if (mode !== 'button') P.dialog({ title: 'ГОЛОС', text: st.listening ? 'Микрофон слушает в фоне.' : (st.errText || 'Микрофон сейчас не слушает.') });
      return;
    }
    // браузер: проба
    if (mode === 'button') { listen(!on); return; }
    probe(true);
  });

  /* Проба в браузере: фраза набирается текстом. */
  function probe(bg) {
    var form = document.createElement('div');
    form.innerHTML = '<p class="dim">Распознавание есть только в приложении на телефоне. Здесь фразу можно набрать.</p>' +
      '<label class="field">Что сказано<input id="voice-say" type="text" autocomplete="off"></label>';
    P.dialog({ title: 'ГОЛОС (ПРОБА)', html: form, buttons: [
      { label: 'Сказать', fn: function () { var v = form.querySelector('input').value; on = false; paint(); P.voiceHeard(v, bg); } },
      { label: 'Отмена', cls: 'dim', fn: function () { on = false; paint(); } }] });
  }

  /* Услышано (браузер и проверки). Разбор — как у службы Android (SgVoiceCore). */
  P.voiceHeard = function (text, bg) {
    if (!P.game || realMode() === 'off') return null;
    var r = heard(text, bg);
    report(text, r, bg);
    return r;
  };

  /* П16: проба голоса с пульта (состояние центра «probe»): всё услышанное — мастеру. В APK это делает служба. */
  var lastHeard = null;
  function probeOn() { var p = Net.state && Net.state.probe; return !!(p && p.on); }
  function report(text, m, bg) {
    var what = !m ? 'не фраза' : m.digits ? 'цифры ' + m.digits : m.cool ? 'пауза: ' + m.cool : 'сработала: ' + m.phrase.text;
    lastHeard = { last: SG.voiceNorm(text), what: what, at: Net.now() };
    if (plugin || !probeOn() || !Net.up) return;
    Net.send({ t: 'stat', heard: { text: SG.voiceNorm(text), conf: 1, what: what, free: !!Net.state.probe.free, bg: !!bg, at: Net.now() } });
  }
  /* П16: пульт «ТЕЛЕФОНЫ» — в браузере заряд и голос шлёт страница (в APK — служба, раз в минуту и в фоне). */
  P.sendStat = function () {
    if (plugin || !Net.up || !P.acc()) return;
    function go(bat) {
      var v = { mode: realMode(), on: mode === 'screen' || mode === 'always' || (mode === 'button' && on), err: '', free: !!(Net.state.probe && Net.state.probe.free) };
      if (lastHeard) Object.assign(v, lastHeard);
      Net.send({ t: 'stat', bat: bat, voice: v, apk: '' });
    }
    if (navigator.getBattery) navigator.getBattery().then(function (b) { go({ l: Math.round(b.level * 100), c: !!b.charging }); }).catch(function () { go(null); });
    else go(null);
  };
  if (!plugin) {
    setInterval(P.sendStat, 60000);
    Net.on('welcome', function () { setTimeout(P.sendStat, 800); });
  }

  function heard(text, bg) {
    var m = SG.voiceMatch(cfg(), text);
    if (!m) return null;
    if (m.digits) { digits(m.digits, bg); return m; }
    var p = m.phrase, t = Net.now();
    if (p.every && last[p.id] && t - last[p.id] < p.every) return { cool: p.id };
    if (p.max || p.every) {
      Net.claim({ key: 'voice:' + p.id, voice: true, max: p.max, every: p.every }).then(function (r) {
        // без связи — срабатывает (кто первый — решает только центр)
        if (r.ok || r.reason === 'offline') { last[p.id] = Net.now(); P.voiceCode(p.id, false); }
        else last[p.id] = Net.now();
      });
      return m;
    }
    last[p.id] = t;
    P.voiceCode(p.id, false);
    return m;
  };

  /* Цифры голосом: по кнопке — как набранный код; в фоне — только существующий код (неверные молча). */
  function digits(d, bg) {
    if (!bg) { P.enter(d, 'voice'); return; }
    var r = SG.resolveCode(P.game, P.flatState(), d, '');
    if (r.kind === 'code' || r.kind === 'chapter') P.enter(d, 'voice');
  }

  Net.on('voice', function (o) {
    if (o.t === 'voice-status') { st = o; paint(); return; }
    var s = P.state;
    if (!P.game || !s || !P.acc()) return;
    if (o.at && o.at <= (s.voiceAt || 0)) return;     // уже обработано (страница перезагрузилась, журнал службы тот же)
    if (o.at) { s.voiceAt = o.at; P.saveSoon(); }
    if (o.code) P.voiceCode(o.code, o.netDone);
    else if (o.digits) digits(o.digits, o.bg);
  });

  /* Режим мастера → «Голос: проверка и замер». */
  P.voiceDiag = function () {
    var form = document.createElement('div');
    var c = P.acc() ? cfg() : { phrases: [] };
    function draw(s) {
      s = s || {};
      var rows = (s.meter || []).map(function (x) {
        return '<tr><td>' + new Date(x.t).toLocaleTimeString().slice(0, 5) + '</td><td>' + x.level + ' %</td><td>' + SG.esc(x.mode) + '</td><td>' + (x.screen ? 'вкл' : 'выкл') +
          '</td><td>' + Math.round((x.listen || 0) / 60000) + '</td><td>' + Math.round((x.speech || 0) / 60000) + '</td></tr>';
      }).join('');
      form.innerHTML = '<p>Режим: <b>' + SG.esc(SG.VOICE_MODES.reduce(function (a, m) { return m[0] === realMode() ? m[1] : a; }, realMode())) + '</b>' +
        (plugin ? '<br>Модель: ' + SG.esc(s.model || '—') + '<br>Микрофон: ' + (s.listening ? 'слушает' : 'не слушает') + (s.errText ? ' — ' + SG.esc(s.errText) : '') +
          '<br>Услышано: «' + SG.esc(s.lastText || '') + '» ' + (s.lastConf ? Math.round(s.lastConf * 100) + ' %' : '') + '<br>Итог: ' + SG.esc(s.lastWhat || '—') +
          '<br>Фраз: ' + (s.heard || 0) + ', сработало: ' + (s.fired || 0) + ', отклонено: ' + (s.rejected || 0) +
          '<br>Распознавалось: ' + (s.frames ? Math.round(100 * (s.fed || 0) / s.frames) : 0) + ' % звука' +
          (s.unknown && s.unknown.length ? '<br><b style="color:#fc6">Модель не знает: ' + SG.esc(s.unknown.join(' ')) + '</b><br><span class="dim">Эти слова фраз телефон не услышит. Замените их в редакторе (вкладка «Голос» → «Проверка слов» — перепишите туда эту строку, редактор подскажет).</span>' :
            s.unknown ? '<br>Все слова фраз модель знает.' : '') : '<br>Браузер: распознавания нет, кнопка 🎙 — проба текстом.') + '</p>' +
        '<p class="dim">Фразы персонажа сейчас: ' + (c.phrases.map(function (p) { return '«' + SG.esc(p.text) + '»'; }).join(', ') || 'нет') + '</p>' +
        (s.rate ? '<p>Расход: ' + SG.esc(s.rate) + '</p>' : '') +
        (rows ? '<table class="meter"><tr><th>время</th><th>заряд</th><th>режим</th><th>экран</th><th>слушал, мин</th><th>речь, мин</th></tr>' + rows + '</table>' : '');
    }
    draw(st);
    function refresh() { if (plugin && plugin.voiceStatus) plugin.voiceStatus().then(function (s) { st = s; draw(s); paint(); }).catch(function () {}); }
    refresh();
    P.dialog({ title: 'ГОЛОС: ПРОВЕРКА И ЗАМЕР', html: form, buttons: [
      { label: 'Обновить', fn: function () { setTimeout(P.voiceDiag, 30); } },
      plugin ? { label: st.metering ? 'Остановить замер' : 'Начать замер (раз в 5 мин)', fn: function () {
        plugin.voiceMeter({ on: !st.metering }).then(function (s) { st = s; setTimeout(P.voiceDiag, 30); }).catch(function () {});
      } } : null,
      { label: 'Закрыть', cls: 'dim' }].filter(Boolean) });
  };
})();
