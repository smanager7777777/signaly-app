/* СИГНАЛЫ — П25 (06, 140, 146): шпионаж текстом, программа «ПЕРЕХВАТ».
   Шпион выбирает жертву (по «коду прослушки», из списка, случайно, подменный) → состояние центра
   «spy:<кого слышно>:<шпион>» = {sid, at, until, shown}. Телефон жертвы видит его и, пока сеанс не кончился, слушает
   свободным распознаванием (в APK — служба Android, даже с выключенным голосом и в фоне; в браузере — проба голоса)
   и шлёт услышанное шпиону живым потоком центра {t:'live', body:{k:'spy', sid, text, part}} — в журнал не пишется.
   У шпиона: фразы целиком, недоговорённое серым, фразы пакета подсвечены; при выходе всё стирается; через N минут —
   «ПЕРЕГРЕВ» на M минут (и действия). У жертвы: буквы интерфейса понемногу становятся 0 и 1; «Проверка линии»
   (код или строка в настройках 0000) показывает подключение, прервать — кодом или встряхнуть N раз. */
(function () {
  'use strict';
  var P = window.SGP, Net = window.SGNet, SG = window.SG;
  var plugin = Net.plugin && Net.plugin.voiceConfig ? Net.plugin : null;
  var $ = function (id) { return document.getElementById(id); };
  var sess = null;        // сеанс шпиона: {sid, key, target, src, shown, at, until, lines, part, ack, mic}
  var note = '';          // строка состояния после сеанса («перегрев», «линия прервана»)
  var tick = null, spyTuner = null, wasCool = false, spySl = null;
  /* П25 (06, 151): ползунок упал до нуля. */
  function sliderZero() {
    var G = g(), s = sess;
    if (!s) return;
    var how = G.spy.sliderZero;
    if (how === 'glitch') { P.sound('err'); if (P.glitch) P.glitch(); var gl = (G.glitches[0] || {}).id; if (gl && P.startGlitch) P.startGlitch(gl); return; }
    if (how === 'expose') Net.send({ t: 'live', to: ['acc:' + s.src], body: { k: 'spy-exposed', sid: s.sid } });
    if (Net.state && Net.state[s.key] && Net.state[s.key].sid === s.sid) Net.set(s.key, null);
    stop('cut');
  }
  /* Вне коридора — услышанное в помехах. */
  function noisy(t) { return spySl && !spySl.inBand() ? SG.voiceNorm(t).replace(/[а-яёa-z]/gi, function (c) { return Math.random() < 0.6 ? '▒' : c; }) : null; }

  function g() { return P.game; }
  function me() { return P.state && P.state.account; }
  function spyOn() { var a = P.acc(); return !!(a && g() && a.modules.indexOf('spy') >= 0); }
  function accName(id) { var a = g() && SG.byId(g().accounts, id); return a ? a.name || a.id : '?'; }
  function mm(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + s % 60).slice(-2); }
  function dur(min) { return min >= 1 ? Math.round(min * 10) / 10 + ' мин' : Math.round(min * 60) + ' с'; }
  function esc(t) { return SG.esc(String(t == null ? '' : t)); }
  function coolLeft() { var m = P.acc() ? P.mine() : null; return m && m.spyCool ? m.spyCool - Net.now() : 0; }
  function coolFor(min, why) {
    if (!min) return;
    var m = P.mine();
    m.spyCool = Net.now() + min * 60000;
    m.spyCoolWhy = why;
    P.save();
  }

  /* ---------- шпион ---------- */
  function start(target, how, label) {
    var G = g();
    if (!G || !spyOn() || !target || target === me()) return;
    if (P.modState('spy') !== 'on') { P.setTab('spy'); return; }
    if (coolLeft() > 0) { openTab(); return; }
    if (!Net.up) { P.sound('err'); P.dialog({ title: 'НЕТ СВЯЗИ', warn: true, text: 'Перехват работает только через центр сети.' }); return; }
    stop('');
    var src = SG.spySource(G, target, me());
    var now = Net.now(), sid = SG.uid('s');
    var until = G.spy.maxMin ? now + G.spy.maxMin * 60000 : 0;
    var snd = G.spy.sound !== 'text' ? G.spy.sound : '';   // П26 (06, 153): звук через центр
    sess = { sid: sid, key: 'spy:' + src + ':' + me(), target: target, src: src, shown: how === 'random' ? '' : how === 'wave' ? label || '' : accName(target), at: now, until: until, lines: [], part: '', ack: false, mic: true, snd: snd };
    note = '';
    var sv = { sid: sid, at: now, until: until, shown: target, spy: me() };
    if (snd) { sv.snd = snd; au.start(); }
    if (G.spy.video) { sv.vid = true; sess.vid = true; sess.cam = ''; sess.camAt = 0; }   // П26 (06, 156): камера жертвы
    Net.set(sess.key, sv);
    P.sound('ok');
    openTab();
    paint();
  }
  /* why: '' — сам вышел; 'heat' — перегрев; 'cut' — жертва (или мастер) прервала */
  function stop(why) {
    if (!sess) return;
    var s = sess;
    sess = null;   // П25: при выходе запись стирается (не копить память)
    au.stop();
    if (why !== 'cut' && Net.state && Net.state[s.key] && Net.state[s.key].sid === s.sid) Net.set(s.key, null);
    var G = g();
    if (why === 'heat') {
      note = 'ПЕРЕГРЕВ';
      coolFor(G.spy.coolMin, 'heat');
      P.sound('err');
      if (G.spy.heatActions.length) P.doActions(G.spy.heatActions);
    } else if (why === 'cut') {
      note = 'СОЕДИНЕНИЕ ПРЕРВАНО';
      coolFor(G.spy.cutCoolMin, 'cut');
      P.sound('err');
      if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
    }
    paint();
  }
  function openTab() {
    var a = P.acc();
    if (a && a.secret && a.secret.indexOf('spy') >= 0 && P.tab !== 'spy') { P.openSecret('spy'); setTimeout(paint, 400); return; }
    if (P.tab !== 'spy') P.setTab('spy');
    paint();
  }

  /* Фразы пакета (голос у кодов) — подсвечиваются в услышанном. */
  function phrases() {
    var G = g();
    return G ? G.codes.map(function (c) { return SG.voiceNorm(c.voice); }).filter(Boolean).sort(function (a, b) { return b.length - a.length; }) : [];
  }
  function marked(text) {
    var t = SG.voiceNorm(text), out = esc(t);
    phrases().forEach(function (p) {
      var re = new RegExp('(^|\\s)(' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=\\s|$)', 'g');
      out = out.replace(re, '$1<mark class="spy-hit">$2</mark>');
    });
    return out;
  }

  function logHtml() {
    return sess.lines.length || sess.part ? sess.lines.map(function (l) {
      return '<div class="spy-line"><span class="spy-t">' + new Date(l.at).toTimeString().slice(0, 8) + '</span> ' + (l.nz ? esc(l.text) : marked(l.text)) + '</div>';
    }).join('') + (sess.part ? '<div class="spy-line spy-part">' + esc(/▒/.test(sess.part) ? sess.part : SG.voiceNorm(sess.part)) + '…</div>' : '') :
      '<p class="hint">Тишина. Речь источника появится здесь.</p>';
  }
  /* Только лента и состояние (ползунок и поле не пересоздаются). */
  function paintLog() {
    var l = $('spy-log'), st = document.querySelector('#tab-spy .spy-stat');
    if (sess && !l && sess.snd === 'sound' && st) { st.textContent = sess.ack ? (sess.mic ? '● СИГНАЛ ЕСТЬ' : '○ МИКРОФОН ИСТОЧНИКА НЕДОСТУПЕН') : '… ПОДКЛЮЧЕНИЕ'; return; }   // П26: только звук — ленты нет
    if (!sess || !l) { paint(); return; }
    l.innerHTML = logHtml();
    l.scrollTop = l.scrollHeight;
    if (st) st.textContent = sess.ack ? (sess.mic ? '● СИГНАЛ ЕСТЬ' : '○ МИКРОФОН ИСТОЧНИКА НЕДОСТУПЕН') : '… ПОДКЛЮЧЕНИЕ';
  }
  function paint() {
    var box = $('tab-spy');
    if (!box || !g()) return;
    var G = g(), name = G.spy.name || 'ПЕРЕХВАТ';
    var html = '<p class="tab-title">' + esc(name) + '</p>';
    var cl = coolLeft();
    if (sess) {
      var left = sess.until ? sess.until - Net.now() : 0;
      html += '<div class="spy-head"><b>КАНАЛ: ' + esc(sess.shown || 'НЕИЗВЕСТНЫЙ ИСТОЧНИК') + '</b>' +
        (sess.until ? '<span class="spy-left' + (left < 30000 ? ' warn' : '') + '">' + mm(left) + '</span>' : '') + '</div>' +
        '<p class="spy-stat">' + (sess.ack ? (sess.mic ? '● СИГНАЛ ЕСТЬ' : '○ МИКРОФОН ИСТОЧНИКА НЕДОСТУПЕН') :
          Net.now() - sess.at > 6000 ? '○ СИГНАЛА НЕТ — источник вне сети' : '… ПОДКЛЮЧЕНИЕ') + '</p>' +
        (sess.snd ? '<div class="spy-snd" id="spy-snd"><span>🔊 ЗВУК · задержка ' + G.spy.soundDelay + ' с</span><div class="spy-vu"><div id="spy-vu"></div></div></div>' : '') +
        (sess.vid ? '<div class="spy-cam" id="spy-cam"><img id="spy-img" alt=""><p class="spy-cam-st" id="spy-cam-st">' + camText() + '</p></div>' : '') +
        (sess.snd === 'sound' ? '<p class="hint">Звук источника — в динамике или наушниках.</p>' : '<div class="spy-log" id="spy-log">' + logHtml() + '</div>') +
        (G.spy.slider ? '<div id="spy-slider" class="spy-slider"></div>' : '') +
        '<button class="btn dim" id="spy-stop">ОТКЛЮЧИТЬСЯ</button>';
    } else if (cl > 0) {
      var cut = P.mine().spyCoolWhy === 'cut';
      html += '<div class="spy-heat"><div class="big">' + (cut ? 'СОЕДИНЕНИЕ ПРЕРВАНО' : 'ПЕРЕГРЕВ') + '</div><p>' +
        (cut ? 'Источник обнаружил подключение. Программа заблокирована.' : 'Программа перегрелась и недоступна.') + '</p><p class="spy-left">' + mm(cl) + '</p></div>';
    } else {
      if (note) html += '<p class="warn spy-note">' + esc(note) + '</p>';
      var mode = G.spy.mode;
      if (mode === 'code') {
        html += '<label class="field">КОД ПРОСЛУШКИ<input id="spy-code" type="text" autocomplete="off" autocapitalize="characters"></label>' +
          '<div class="cam-btns"><button class="btn dim" id="spy-scan">СКАН QR</button><button class="btn" id="spy-go">ПОДКЛЮЧИТЬ</button></div>' +
          '<p class="hint">Код можно ввести и во вкладке «КОД», отсканировать или сказать.</p>';
      } else if (mode === 'wave') {
        html += '<p class="hint">Найдите сигнал на шкале и удержите его.</p><div id="spy-wave"></div>';
      } else if (mode === 'random') {
        html += '<button class="btn" id="spy-rand">ПОЙМАТЬ СЛУЧАЙНЫЙ СИГНАЛ</button>';
      } else {
        html += '<div class="spy-list">' + SG.spyTargets(G, me()).map(function (a) {
          return '<button class="btn dim spy-who" data-acc="' + esc(a.id) + '">' + esc(a.name || a.id) + '</button>';
        }).join('') + '</div>';
      }
      if (G.spy.maxMin) html += '<p class="hint">Сеанс — не дольше ' + dur(G.spy.maxMin) + (G.spy.coolMin ? ', потом перегрев на ' + dur(G.spy.coolMin) : '') + '.</p>';
    }
    box.innerHTML = html;
    if (spySl) { spySl.stop(); spySl = null; }
    if ($('spy-slider') && P.mgSlider) spySl = P.mgSlider($('spy-slider'), { speed: G.spy.sliderSpeed, band: G.spy.sliderBand, silent: G.spy.sliderSilent, onZero: sliderZero });
    if (spyTuner) { spyTuner.stop(); spyTuner = null; }
    if ($('spy-wave') && P.waveTuner) spyTuner = P.waveTuner($('spy-wave'), { targets: SG.spyTargets(G, me()).map(function (a) { return a.id; }),
      onCatch: function (id, label) { start(id, 'wave', label); }, onTrap: function () { if (P.hackTrap) P.hackTrap(); note = 'ЛОЖНАЯ ВОЛНА — СБОЙ'; paint(); } });
    var log = $('spy-log');
    if (log) log.scrollTop = log.scrollHeight;
    if ($('spy-stop')) $('spy-stop').addEventListener('click', function () { P.sound('key'); stop(''); });
    if ($('spy-rand')) $('spy-rand').addEventListener('click', function () {
      var t = SG.spyTargets(G, me());
      if (t.length) start(t[Math.floor(Math.random() * t.length)].id, 'random');
    });
    box.querySelectorAll('.spy-who').forEach(function (b) { b.addEventListener('click', function () { start(b.dataset.acc, 'list'); }); });
    var inp = $('spy-code');
    if (inp) {
      var go = function () {
        var r = SG.resolveCode(G, P.flatState(), inp.value, '');
        if (r.kind === 'spy') { start(r.target.id, 'code'); return; }
        P.sound('err');
        note = 'НЕТ ТАКОГО КАНАЛА';
        paint();
      };
      $('spy-go').addEventListener('click', go);
      if (P.attachKbd) P.attachKbd(inp, $('spy-go').parentNode, { start: 'ru', enter: go });
      $('spy-scan').addEventListener('click', function () {
        P.scanOverlay('КОД ПРОСЛУШКИ', 'Наведите камеру на QR-код', function (code) { P.closeTop(); setTimeout(function () { inp.value = code; go(); }, 60); });
      });
    }
  }

  /* Код прослушки, проверка линии, прервать — из вкладки «КОД», сканера, голоса (player.js → P.spyCode). */
  P.spyCode = function (r) {
    if (r.kind === 'spycheck') { check(); return; }
    if (r.kind === 'spybreak') { cutAll(true); return; }
    if (r.kind === 'spy') start(r.target.id, 'code');
  };

  Net.on('live', function (o) {
    var b = o.body || {};
    if (b.k === 'spy-exposed' && mySessions().some(function (s) { return s.sid === b.sid; })) {   // жертва: шпион сорвался
      P.sound('err');
      P.dialog({ title: 'ПОПЫТКА ПРОСЛУШКИ', warn: true, cls: 'nobits', text: 'Обнаружено постороннее подключение к микрофону. Соединение разорвано.' });
      return;
    }
    if (b.k === 'spa' && sess && sess.snd && b.sid === sess.sid) { sess.ack = true; au.push(b.d); return; }
    if (b.k === 'spv' && sess && sess.vid && b.sid === sess.sid) { camFrame(b); return; }
    if (b.k !== 'spy' || !sess || b.sid !== sess.sid) return;
    if (b.ready) { sess.ack = true; sess.mic = b.mic !== false; }
    else if (b.part) sess.part = noisy(b.text || '') || b.text || '';
    else if (b.text) { sess.ack = true; sess.part = ''; var nz = noisy(b.text); sess.lines.push({ text: nz || b.text, nz: !!nz, at: o.at || Net.now() }); if (sess.lines.length > 200) sess.lines.shift(); }
    if (P.tab === 'spy') paintLog();
  });
  Net.on('state', function (key, value) {
    if (sess && key === sess.key && (!value || value.sid !== sess.sid)) stop('cut');   // жертва или мастер прервали
    if (String(key).indexOf('spy:') === 0) victim();
  });
  Net.on('welcome', function () {
    // П25: после перезапуска своих старых сеансов нет — убрать их из центра
    var st = Net.state || {};
    Object.keys(st).forEach(function (k) {
      var x = k.split(':');
      if (x[0] === 'spy' && x[2] === me() && (!sess || k !== sess.key)) Net.set(k, null);
    });
    if (sess && !(st[sess.key] && st[sess.key].sid === sess.sid)) stop('cut');
    victim();
  });
  P.on('tab', function (t) {
    if (t === 'spy') paint();
    else if (sess) stop('');   // ушёл из программы — сеанс закрыт, запись стёрта
  });
  P.on('hidden', function () { /* в фоне сеанс идёт до конца времени */ });
  P.on('login', function () { stop(''); note = ''; });
  setInterval(function () {
    if (sess && sess.until && Net.now() >= sess.until) stop('heat');
    var cl = coolLeft();
    if (P.tab === 'spy') {
      if (sess) {
        var e = document.querySelector('#tab-spy .spy-left'); if (e) e.textContent = mm(sess.until - Net.now());
        if (!sess.ack && Net.now() - sess.at > 6000 && !/СИГНАЛА НЕТ/.test(($('tab-spy') || {}).textContent || '')) paint();
      } else if (cl > 0 || wasCool) paint();   // отсчёт блока; блок кончился — снова выбор
    }
    wasCool = cl > 0;
    capSync();
    vidSync();
    camWatch();
    victimTick();
  }, 1000);

  /* ---------- жертва ---------- */
  /* Сеансы, где слушают этот телефон: [{key, spy, sid, at, until}] */
  function mySessions() {
    var st = Net.state || {}, out = [], now = Net.now(), id = me();
    if (!id) return out;
    Object.keys(st).forEach(function (k) {
      var x = k.split(':'), v = st[k];
      if (x[0] !== 'spy' || x[1] !== id || !v || !v.sid) return;
      if (v.until && now > v.until + 5000) return;
      out.push({ key: k, spy: x[2], sid: v.sid, at: v.at || now, until: v.until || 0, snd: v.snd || '', vid: !!v.vid });
    });
    return out;
  }
  var acked = {};
  function victim() {
    var list = mySessions();
    capSync();
    vidSync();
    // в APK слушает и отвечает служба; в браузере — страница (проба голоса набирает текст)
    if (!plugin) list.forEach(function (s) {
      if (acked[s.sid]) return;
      acked[s.sid] = 1;
      Net.send({ t: 'live', to: ['acc:' + s.spy], body: { k: 'spy', sid: s.sid, ready: true, mic: true } });
    });
    victimTick();
  }
  /* Браузер (проверки, предпросмотр): услышанное — шпионам (voice.js → P.spyRelay). */
  P.spyRelay = function (text, part) {
    if (plugin || !Net.up || !text) return;
    mySessions().forEach(function (s) { if (s.snd !== 'sound') Net.send({ t: 'live', to: ['acc:' + s.spy], body: { k: 'spy', sid: s.sid, text: SG.voiceNorm(text), part: !!part } }); });
  };

  /* ---------- П26 (06, 150, 153): шпионаж звуком ----------
     Жертва: в APK звук шлёт служба (SgVoiceCore.spyAudio); в браузере — микрофон страницы (getUserMedia), 8 кГц μ-закон
     кусками по 0,5 с живым потоком {k:'spa', sid, seq, d}. Шпион: куски ждут soundDelay с и играют подряд; вне коридора
     ползунка — в помехах. P.spyAudioFeed(отсчёты 8 кГц) — проверки. */
  var cap = { on: false, buf: new Float32Array(4000), n: 0, seq: 0, ctx: null, stream: null, node: null };
  function capPush(f) {
    for (var i = 0; i < f.length; i++) {
      cap.buf[cap.n++] = f[i];
      if (cap.n === cap.buf.length) {
        var d = SG.b64enc(SG.ulawEnc(cap.buf));
        cap.n = 0; cap.seq++;
        if (Net.up) mySessions().forEach(function (s) { if (s.snd) Net.send({ t: 'live', to: ['acc:' + s.spy], body: { k: 'spa', sid: s.sid, seq: cap.seq, rate: 8000, d: d } }); });
        P.spaSent = (P.spaSent || 0) + 1;
      }
    }
  }
  P.spyAudioFeed = capPush;
  function capSync() {
    var need = !plugin && mySessions().some(function (s) { return s.snd; });
    if (need === cap.on) return;
    if (need && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || window.SG_NO_MIC)) return;   // нет микрофона страницы (или проверки) — попробуем позже
    cap.on = need;
    if (!need) {
      if (cap.node) cap.node.disconnect();
      if (cap.stream) cap.stream.getTracks().forEach(function (t) { t.stop(); });
      if (cap.ctx) cap.ctx.close().catch(function () {});
      cap.ctx = cap.stream = cap.node = null; cap.n = 0;
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } }).then(function (st) {
      if (!cap.on) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      var C = window.AudioContext || window.webkitAudioContext;
      cap.stream = st; cap.ctx = new C();
      var src = cap.ctx.createMediaStreamSource(st), node = cap.ctx.createScriptProcessor(4096, 1, 1), r = cap.ctx.sampleRate / 8000, acc = 0, k = 0, out = [];
      node.onaudioprocess = function (e) {
        var x = e.inputBuffer.getChannelData(0);
        out.length = 0;
        for (var i = 0; i < x.length; i++) { acc += x[i]; if (++k >= r) { out.push(acc / k); acc = 0; k = 0; } }   // среднее — фильтр перед прореживанием
        capPush(out);
      };
      src.connect(node); node.connect(cap.ctx.destination);
      cap.node = node;
    }).catch(function () { /* нет микрофона — шпион услышит тишину */ });
  }
  var au = {
    ctx: null, q: [], next: 0, got: 0, played: 0, level: 0, on: false,
    start: function () {
      this.on = true; this.q = []; this.next = 0;
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      if (!this.ctx) this.ctx = new C();
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
    },
    stop: function () { this.on = false; this.q = []; this.level = 0; },
    push: function (d) { if (!this.on) return; this.got++; this.q.push({ at: Date.now(), d: d }); },
    pump: function () {
      if (!this.on || !sess) return;
      var delay = g().spy.soundDelay * 1000, now = Date.now(), lvl = this.level * 0.7;
      while (this.q.length && now - this.q[0].at >= delay) {
        var f = SG.ulawDec(SG.b64dec(this.q.shift().d)), bad = spySl && !spySl.inBand(), rms = 0;
        for (var i = 0; i < f.length; i++) {
          rms += f[i] * f[i];
          f[i] = bad ? f[i] * 0.3 + (Math.random() * 2 - 1) * 0.45 : f[i] + (Math.random() * 2 - 1) * 0.015;   // вне коридора — помехи; всегда — лёгкий эфир
        }
        lvl = Math.max(lvl, Math.min(1, Math.sqrt(rms / f.length) * 4));
        this.played++;
        if (!this.ctx) continue;
        try {
          var b = this.ctx.createBuffer(1, f.length, 8000);
          b.getChannelData(0).set(f);
          var s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination);
          var t = Math.max(this.next, this.ctx.currentTime + 0.05);
          s.start(t); this.next = t + b.duration;
        } catch (e) { /* нет звука на этом устройстве */ }
      }
      this.level = lvl;
      var vu = $('spy-vu'); if (vu) vu.style.width = Math.round(lvl * 100) + '%';
    }
  };
  setInterval(function () { au.pump(); }, 100);
  /* ---------- П26 (06, 156): видео-шпионаж ----------
     Жертва: приложение на экране — видео со страницы (getUserMedia, ~3 кадра/с, JPEG 320×240); не пошло — в APK
     снимки делает служба (plugin.camShots), в браузере — «none». Свёрнуто или экран погашен — в APK служба (SgCam,
     фото раз в 1 с), в браузере — «none». Кадры — живым потоком {k:'spv', sid, src: video / photo / none, d}.
     Шпион: картинка и строка — «● ВИДЕО», «◐ ФОТО РАЗ В 1 С», «○ КАМЕРА ЦЕЛИ НЕДОСТУПНА». */
  var vc = { on: false, stream: null, video: null, cv: null, timer: 0, asked: false, noneAt: 0, failAt: 0, starting: false };
  function vidSessions() { return mySessions().filter(function (s) { return s.vid; }); }
  function vidSend(src, d) {
    if (!Net.up) return;
    vidSessions().forEach(function (s) { var b = { k: 'spv', sid: s.sid, src: src }; if (d) b.d = d; Net.send({ t: 'live', to: ['acc:' + s.spy], body: b }); });
    P.spvSent = (P.spvSent || 0) + 1;
  }
  function vidStop() {
    clearInterval(vc.timer); vc.timer = 0;
    if (vc.stream) vc.stream.getTracks().forEach(function (t) { t.stop(); });
    vc.stream = null; vc.on = false;
    if (vc.video) { vc.video.srcObject = null; }
  }
  function camShots(on) { if (vc.asked === on || !plugin || !plugin.camShots) return; vc.asked = on; plugin.camShots({ on: on }).catch(function () {}); }
  function vidSync() {
    var list = vidSessions(), vis = !document.hidden;
    if (!list.length) { if (vc.on) vidStop(); camShots(false); return; }
    if (!vis) {   // свёрнуто: в APK снимает служба; в браузере камеры нет
      if (vc.on) vidStop();
      camShots(false);
      if (!plugin && Date.now() - vc.noneAt >= 3000) { vc.noneAt = Date.now(); vidSend('none'); }
      return;
    }
    if (vc.on || vc.starting) return;
    if (Date.now() - vc.failAt < 10000) { if (!plugin && Date.now() - vc.noneAt >= 3000) { vc.noneAt = Date.now(); vidSend('none'); } return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || window.SG_NO_CAM) { vidFail(); return; }
    vc.starting = true;
    var G = g();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: G.spy.videoCam === 'back' ? 'environment' : 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false }).then(function (st) {
      vc.starting = false;
      if (!vidSessions().length || document.hidden) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      camShots(false);
      vc.stream = st; vc.on = true;
      if (!vc.video) { vc.video = document.createElement('video'); vc.video.muted = true; vc.video.setAttribute('playsinline', ''); vc.cv = document.createElement('canvas'); vc.cv.width = 320; vc.cv.height = 240; }
      vc.video.srcObject = st;
      var pr = vc.video.play(); if (pr && pr.catch) pr.catch(function () {});
      vc.timer = setInterval(function () {
        if (!vc.video.videoWidth) return;
        var c = vc.cv.getContext('2d'), w = vc.video.videoWidth, h = vc.video.videoHeight, k = Math.min(320 / w, 240 / h);
        c.fillStyle = '#000'; c.fillRect(0, 0, 320, 240);
        c.drawImage(vc.video, (320 - w * k) / 2, (240 - h * k) / 2, w * k, h * k);
        vidSend('video', vc.cv.toDataURL('image/jpeg', 0.5).split(',')[1]);
      }, 333);
    }).catch(function () { vc.starting = false; vidFail(); });
  }
  function vidFail() {   // видео не пошло: в APK — снимки службой, в браузере — «камера недоступна»
    vc.failAt = Date.now();
    if (plugin && plugin.camShots) camShots(true);
    else { vc.noneAt = Date.now(); vidSend('none'); }
  }
  document.addEventListener('visibilitychange', function () { vidSync(); });
  /* шпион */
  function camText() {
    var s = sess;
    if (!s || !s.vid) return '';
    return s.cam === 'video' ? '● ВИДЕО' : s.cam === 'photo' ? '◐ ФОТО РАЗ В 1 С' : s.cam === 'none' ? '○ КАМЕРА ЦЕЛИ НЕДОСТУПНА' : s.cam === 'lost' ? '○ НЕТ КАДРОВ' : '… КАМЕРА';
  }
  function camFrame(b) {
    var s = sess;
    s.cam = b.src === 'video' || b.src === 'photo' ? b.src : 'none';
    if (b.d) { s.camAt = Date.now(); s.frames = (s.frames || 0) + 1; var im = $('spy-img'); if (im) im.src = 'data:image/jpeg;base64,' + b.d; }
    camPaint();
  }
  function camPaint() {
    var st = $('spy-cam-st'), box = $('spy-cam');
    if (st) st.textContent = camText();
    if (box) { box.classList.toggle('none', sess.cam === 'none' || sess.cam === 'lost'); box.classList.toggle('nz', !!(spySl && !spySl.inBand())); }
  }
  function camWatch() {   // кадры перестали приходить
    if (!sess || !sess.vid) return;
    if ((sess.cam === 'video' || sess.cam === 'photo') && Date.now() - sess.camAt > 4000) sess.cam = 'lost';
    camPaint();
  }
  P.spyCamStat = function () { return sess && sess.vid ? { cam: sess.cam, frames: sess.frames || 0, text: camText() } : null; };
  P.spySndStat = function () { return { got: au.got, played: au.played, level: au.level, queued: au.q.length, sent: P.spaSent || 0 }; };
  P.spySessions = mySessions;

  /* Буквы → 0 и 1 (06, 141, 146): общий исполнитель для шпионажа, взлома и сбоя «0/1».
     P.bitsSet(источник, доля везде, доля только в чатах) — берётся наибольшая; раз в секунду (и сразу) — по тексту экрана. */
  var orig = new Map(), shown = new Map(), srcs = {};
  function hash(a, b) { var h = 2166136261; var s = a + ':' + b; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
  var nodeId = new WeakMap(), nextId = 1;
  function levels() {
    var all = 0, chat = 0;
    Object.keys(srcs).forEach(function (k) { all = Math.max(all, srcs[k][0] || 0); chat = Math.max(chat, srcs[k][1] || 0); });
    return [all, Math.max(all, chat)];
  }
  function bits() {
    var lv = levels(), root = document.body;
    if (!root || (!lv[1] && !shown.size)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      var pe = n.parentElement;
      if (!pe || /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(pe.tagName) || pe.closest('.nobits, #console, .kbd')) continue;
      var cur = n.nodeValue;
      if (!cur || (!shown.has(n) && !/[A-Za-zА-Яа-яЁё]/.test(cur))) continue;
      if (shown.get(n) !== cur) orig.set(n, cur);   // приложение перерисовало — новый текст
      var src = orig.get(n);
      if (!nodeId.has(n)) nodeId.set(n, nextId++);
      var id = nodeId.get(n);
      var l = pe.closest('#tab-chat, #chatview') ? lv[1] : lv[0];
      var out = l <= 0 ? src : src.replace(/[A-Za-zА-Яа-яЁё]/g, function (ch, i) {
        return hash(id, i) < l ? (hash(i, id) < 0.5 ? '0' : '1') : ch;
      });
      if (out !== cur) n.nodeValue = out;
      if (l <= 0) { orig.delete(n); shown.delete(n); } else shown.set(n, out);
    }
  }
  P.bitsSet = function (src, all, chat) {
    var was = JSON.stringify(srcs[src] || [0, 0]);
    if (!all && !chat) delete srcs[src]; else srcs[src] = [all || 0, chat || 0];
    if (JSON.stringify(srcs[src] || [0, 0]) !== was) bits();
  };
  setInterval(bits, 1000);
  function bitsSpy(lv) { P.bitsSet('spy', lv, 0); }
  /* П26 (06, 155): вид глитча у жертвы — список эффектов (game.spy.fx), у каждого сила и рост; общий потолок — glitchMax. */
  var wasOn = false, fxNow = {}, spyTypo = 0, typoWrapped = false, vibeAt = 0, fxGl = {}, glTry = 0;
  var ripple = document.createElement('div');
  ripple.id = 'spy-ripple';
  document.body.appendChild(ripple);
  function fxOff() {
    wasOn = false; fxNow = {}; spyTypo = 0;
    bitsSpy(0);
    ripple.className = ''; document.getElementById('app').classList.remove('spy-rip');
    Object.keys(fxGl).forEach(function (id) { if (P.fixGlitch) P.fixGlitch(id); });   // сбои, начатые прослушкой, кончаются вместе с ней
    fxGl = {};
  }
  P.spyFxNow = function () { return fxNow; };
  function victimTick() {
    var G = g();
    if (!typoWrapped && P.typoLevel) { typoWrapped = true; var t0 = P.typoLevel; P.typoLevel = function () { return Math.max(t0() || 0, spyTypo); }; }
    if (!G || !me()) return;
    var list = mySessions(), fx = G.spy.fx || [];
    if (!fx.length || !list.length) { if (wasOn) fxOff(); return; }
    var since = Math.min.apply(null, list.map(function (s) { return s.at; }));
    var sec = (Net.now() - since) / 1000 - G.spy.glitchFrom;
    if (sec < 0) { if (wasOn) fxOff(); return; }
    wasOn = true;
    var cap = G.spy.glitchMax / 100, now = Date.now(), lv = {}, doGl = now - glTry >= 10000;
    if (doGl) glTry = now;
    fx.forEach(function (f) {
      var l = Math.min(1, (f.power + sec / 60 * f.grow) / 100);
      if (f.kind === 'glitch') {
        if (!f.glitch || !SG.byId(P.game.glitches, f.glitch)) return;
        lv['glitch:' + f.glitch] = l;
        var on = P.activeGlitches && P.activeGlitches().some(function (a) { return a.g.id === f.glitch; });
        if (!on && doGl && Math.random() < l) { fxGl[f.glitch] = 1; P.startGlitch(f.glitch); }
        return;
      }
      lv[f.kind] = Math.max(lv[f.kind] || 0, f.kind === 'bits' || f.kind === 'typo' ? Math.min(cap, l) : l);
    });
    fxNow = lv;
    bitsSpy(lv.bits || 0);
    spyTypo = lv.typo ? Math.min(0.5, lv.typo) : 0;
    // рябь: сила — размах и насыщенность полос
    var app = document.getElementById('app');
    app.classList.toggle('spy-rip', !!lv.ripple);
    ripple.className = lv.ripple ? 'on' : '';
    if (lv.ripple) { app.style.setProperty('--rp', lv.ripple.toFixed(2)); ripple.style.setProperty('--rp', lv.ripple.toFixed(2)); }
    // вибрация: чем сильнее, тем чаще и дольше (раз в 20 с → раз в 2 с)
    if (lv.vibe && now - vibeAt >= (20 - 18 * lv.vibe) * 1000) {
      vibeAt = now;
      if (navigator.vibrate) navigator.vibrate(Math.round(60 + 340 * lv.vibe));
      P.spyVibes = (P.spyVibes || 0) + 1;
    }
  }

  /* «Проверка линии» (06, 146 — Т36-6 Б): показывает, что идёт прослушка; прервать — кодом или встряхнуть N раз. */
  var shakes = [], checking = false;
  function check() {
    var G = g();
    if (!G) return;
    var list = mySessions(), sp = G.spy;
    checking = list.length > 0;
    shakes = [];
    if (!list.length) { P.sound('ok'); P.dialog({ title: 'ПРОВЕРКА ЛИНИИ', cls: 'nobits', text: 'Линия чиста. Подключений к микрофону не обнаружено.', buttons: [{ label: 'OK', fn: function () { checking = false; } }] }); return; }
    P.sound('err');
    var form = document.createElement('div');
    form.className = 'nobits';
    form.innerHTML = '<p class="warn"><b>ОБНАРУЖЕНО ПОДКЛЮЧЕНИЕ К МИКРОФОНУ</b>' + (list.length > 1 ? ' (' + list.length + ')' : '') + '.</p>' +
      '<p>Идёт передача звука с этого телефона.</p>' +
      (sp.breakShakes ? '<p>Прервать: встряхните телефон ' + sp.breakShakes + ' раза подряд (промежуток — не больше ' + sp.breakGap + ' с). <span id="spy-shk"></span></p>' : '') +
      (sp.breakCode ? '<label class="field">Код прерывания<input id="spy-brk" type="text" autocomplete="off"></label>' : '');
    var btns = [];
    if (sp.breakCode) btns.push({ label: 'Прервать', keep: true, fn: function () {
      var v = form.querySelector('#spy-brk').value;
      if (SG.norm(v) === SG.norm(sp.breakCode)) cutAll(false);
      else { P.sound('err'); form.querySelector('#spy-brk').value = ''; }
    } });
    btns.push({ label: 'Закрыть', cls: 'dim', fn: function () { checking = false; } });
    P.dialog({ title: 'ПРОВЕРКА ЛИНИИ', warn: true, cls: 'nobits', html: form, buttons: btns });
    var inp = form.querySelector('#spy-brk');
    if (inp && P.attachKbd) P.attachKbd(inp, inp, { start: 'ru' });
  }
  P.spyCheck = check;
  P.on('shake', function () {
    var G = g();
    if (!checking || !G || !G.spy.breakShakes) return;
    var t = Date.now();
    if (shakes.length && t - shakes[shakes.length - 1] > G.spy.breakGap * 1000) shakes = [];
    shakes.push(t);
    var e = $('spy-shk');
    if (e) e.textContent = '● '.repeat(shakes.length);
    if (navigator.vibrate) navigator.vibrate(80);
    if (shakes.length >= G.spy.breakShakes) cutAll(false);
  });
  function cutAll(fromCode) {
    var list = mySessions();
    checking = false;
    shakes = [];
    if (!list.length) { if (fromCode) P.dialog({ title: 'ПРОВЕРКА ЛИНИИ', text: 'Линия чиста. Прерывать нечего.' }); return; }
    list.forEach(function (s) { Net.set(s.key, null); });
    if (Net.state) list.forEach(function (s) { delete Net.state[s.key]; });
    fxOff();   // П26: все эффекты глитча (0/1, клавиатура, вибрация, рябь, сбои от прослушки)
    P.sound('ok');
    if (P.stack && P.stack.length) P.closeTop();
    setTimeout(function () { P.dialog({ title: 'ПРОСЛУШКА ПРЕРВАНА', cls: 'nobits', text: 'Подключение к микрофону разорвано.' }); }, 60);
  }
  P.settingsMore = function () {
    var G = g();
    if (!G || !G.spy.checkSettings || !SG.spyInGame(G)) return [];
    return [{ label: 'Проверка линии', fn: check }];
  };

  /* ---------- пульт мастера: кто кого слушает ---------- */
  P.spyCard = function (card, h, btn, need) {
    var G = g();
    if (!G || (!SG.spyInGame(G) && !SG.hackInGame(G))) return null;
    var st = Net.state || {}, now = Net.now();
    var rows = Object.keys(st).filter(function (k) { return (k.indexOf('spy:') === 0 || k.indexOf('hack:') === 0) && st[k]; }).map(function (k) {
      var x = k.split(':'), v = st[k];
      var fake = v.shown && v.shown !== x[1] ? ' (думает, что слушает ' + accName(v.shown) + ')' : '';
      return h('div', { class: 'row2 spy-row' }, h('span', { text: (x[0] === 'hack' ? 'ВЗЛОМ: ' : '') + accName(x[2]) + ' → ' + accName(x[1]) + fake + ' · ' + mm(now - (v.at || now)) + (v.until ? ' из ' + mm(v.until - v.at) : '') }),
        btn('Прервать', function () { if (need()) Net.set(k, null); }, 'dim'));
    });
    return card('ПРОСЛУШКА И ВЗЛОМ', rows.length ? rows : h('p', { class: 'hint', text: 'Сейчас никто никого не слушает.' }));
  };
})();
