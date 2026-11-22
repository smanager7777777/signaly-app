/* СИГНАЛЫ — звуки, настройки игрока, уведомления, аварийный режим, сбои и состояния,
   обратный отсчёт, голосования, подключение к сети, передача блока по QR. */
(function () {
  'use strict';
  var P = window.SGP, SG = window.SG, Net = window.SGNet, $ = P.$;
  var plugin = Net.plugin;

  /* ---------- звуки интерфейса (Л4) ---------- */
  var actx = null;
  function ac() {
    if (window.SG_STAND && window.SG_STAND.mute) return null;   // П24: стенд — звук только у выбранного «телефона»
    if (!actx) { var A = window.AudioContext || window.webkitAudioContext; if (!A) return null; actx = new A(); }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function beep(f1, f2, dur, type, vol, at) {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (at || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f1, t);
    if (f2) o.frequency.linearRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  P.sounds = function () { var g = P.game; return !!(g && g.sounds && !(P.state && P.state.mute)); };
  var FALLBACK = { msg: 'note', scan: 'none', win: 'ok', lose: 'err' }, own = null;   // scan без своего — тихо (дальше и так звук ответа)
  P.sound = function (kind) {
    if (!P.sounds()) return;
    // П25 (06, 152): свой звук из пакета (по главе и персонажу)
    var f = kind !== 'key' && P.game && P.state ? SG.soundFor(P.game, kind, P.state.account, P.state.chapter) : '';
    var u = f && P.mediaUrl ? P.mediaUrl(f) : '';
    if (u) {
      try { if (own) own.pause(); own = new Audio(u); if (window.SG_STAND && window.SG_STAND.mute) own.muted = true; own.play().catch(function () {}); P.lastSound = f; } catch (e) { /* без звука */ }
      return;
    }
    P.lastSound = kind;
    if (FALLBACK[kind]) kind = FALLBACK[kind];
    try {
      if (kind === 'key') beep(1400, 0, 0.025, 'square', 0.025);
      else if (kind === 'ok') { beep(880, 0, 0.07, 'square', 0.04); beep(1320, 0, 0.09, 'square', 0.04, 0.08); }
      else if (kind === 'err') beep(180, 140, 0.22, 'sawtooth', 0.05);
      else if (kind === 'note') { beep(1000, 0, 0.06, 'square', 0.05); beep(1000, 0, 0.06, 'square', 0.05, 0.12); beep(1500, 0, 0.1, 'square', 0.05, 0.24); }
      else if (kind === 'glitch') beep(90, 2400, 0.25, 'sawtooth', 0.03);
    } catch (e) { /* без звука */ }
  };

  /* ---------- скрытые настройки игрока: код 0000 ---------- */
  P.settings = function () {
    var st = P.state;
    function btn() { return { label: 'Звуки интерфейса: ' + (st.mute ? 'ВЫКЛ' : 'ВКЛ'), keep: true, fn: function () { st.mute = !st.mute; P.save(); P.settings(); } }; }
    var kb = P.game.keyboard === 'sys' ? null : { label: 'Клавиатура: ' + (st.kbd === 'sys' ? 'ТЕЛЕФОНА' : 'ПРИЛОЖЕНИЯ'), keep: true, fn: function () {
      st.kbd = st.kbd === 'sys' ? 'own' : 'sys'; P.save(); P.settings(); } };   // П-54: системная — только отсюда
    P.dialog({ title: 'НАСТРОЙКИ', text: (P.game.sounds ? '' : 'Звуки интерфейса отключены в пакете игры.') + (kb ? '\n\nКлавиатура меняется для новых окон и полей.' : ''), buttons: [btn(), kb].concat(P.settingsMore ? P.settingsMore() : [], [{ label: 'Закрыть', cls: 'dim' }]) });   // П25: «Проверка линии»
  };

  /* ---------- уведомления (Е) ---------- */
  P.notice = function (title, text, o) {
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    P.sound('note');
    var jam = P.jamLevel();
    var seed = o && o.seq ? o.seq : Date.now();
    P.dialog({ title: SG.jam(P.fillVars(title) || 'СООБЩЕНИЕ', jam, seed + 't'), cls: 'notice', text: SG.jam(P.fillVars(text || ''), jam, seed) });
  };

  /* ---------- помехи: глава, авария, сбой ---------- */
  P.jamLevel = function () {
    var g = P.game, st = P.state;
    if (!g || !st) return 0;
    var ch = g.chapters[(st.chapter || 1) - 1];
    var lv = ch ? ch.jam || 0 : 0;
    if (alarm && alarm.on && alarm.jam) lv = Math.max(lv, 2);
    if (active().some(function (a) { return a.g.fx.indexOf('jam') >= 0; })) lv = Math.max(lv, 2);
    return lv;
  };

  /* ---------- аварийный режим (Ж) ---------- */
  var alarm = null, siren = null, alarmAll = null, alarmMine = null;
  function alarmApply(v) {
    var was = alarm && alarm.on;
    alarm = v && v.on ? v : null;
    var on = !!alarm;
    document.body.classList.toggle('alarm-on', on && alarm.red !== false);
    $('alarm-title').textContent = on ? alarm.title || P.game.texts.alarm : '';
    $('alarm-text').textContent = on ? alarm.text || '' : '';
    $('alarm').classList.toggle('on', on && alarm.full !== false && !hidden);
    if (on && !was) { hidden = false; $('alarm').classList.toggle('on', alarm.full !== false); P.glitch(); }
    // звук, вибрация, фонарик: в APK — служба (из сети) или местно через плагин; в браузере — здесь
    if (plugin) {
      if (!Net.up) plugin.alarm({ on: on, siren: on && alarm.siren !== false, vibrate: on && alarm.vibrate !== false, torch: on && alarm.torch !== false,
        title: on ? alarm.title || '' : '', text: on ? alarm.text || '' : '' });
    } else {
      if (on && alarm.siren !== false && !siren) sirenStart();
      if (!on || alarm.siren === false) sirenStop();
      if (navigator.vibrate) navigator.vibrate(on && alarm.vibrate !== false ? [700, 300, 700, 300, 700, 300, 700] : 0);
    }
    banners();
  }
  var hidden = false;
  $('alarm-hide').addEventListener('click', function () { hidden = true; $('alarm').classList.remove('on'); });
  function sirenStart() {
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 1000;
    l.frequency.value = 0.5; lg.gain.value = 380;
    l.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0.08;
    o.connect(g); g.connect(c.destination);
    o.start(); l.start();
    siren = { o: o, l: l };
  }
  function sirenStop() { if (siren) { try { siren.o.stop(); siren.l.stop(); } catch (e) { /* уже */ } siren = null; } }

  /* ---------- сбои и состояния персонажа (З, М5) ---------- */
  function mineG() { var m = P.acc() ? P.mine() : null; if (m && !Array.isArray(m.glitches)) m.glitches = []; return m ? m.glitches : []; }
  function active() {
    var g = P.game; if (!g) return [];
    var now = Date.now();
    return mineG().filter(function (x) { return !x.until || x.until > now; })
      .map(function (x) { return { x: x, g: SG.byId(g.glitches, x.id) }; }).filter(function (a) { return a.g; });
  }
  P.activeGlitches = active;
  P.scanBlocked = function () { return active().some(function (a) { return a.g.kind === 'scanner'; }); };
  P.startGlitch = function (id) {
    var g = SG.byId(P.game.glitches, id);
    if (!g || !P.acc()) return;
    if (g.kind === 'fake') { P.notice(g.name, g.text); return; }
    var list = mineG().filter(function (x) { return x.id !== id; });
    var m = P.mine();
    m.glitches = list.concat([{ id: id, at: Date.now(), until: g.seconds ? Date.now() + g.seconds * 1000 : 0 }]);
    P.save();
    P.glitch();
    P.sound('glitch');
    if (navigator.vibrate) navigator.vibrate([40, 30, 40, 30, 200]);
    if (g.text) P.dialog({ title: g.name, warn: !g.state, text: g.text });
    paint();
  };
  P.fixGlitch = function (id) {
    var m = P.mine();
    var before = mineG().length;
    m.glitches = mineG().filter(function (x) { return id && x.id !== id; });
    P.save();
    paint();
    return before !== m.glitches.length;
  };
  var FX = ['noise', 'shift', 'blur', 'invert', 'dark', 'bright', 'tunnel', 'shake', 'tint', 'scramble', 'jam'];
  function paint() {
    var app = $('app');
    var act = active();
    FX.forEach(function (f) { app.classList.toggle('gl-' + f, act.some(function (a) { return a.g.kind === 'visual' && a.g.fx.indexOf(f) >= 0; })); });
    var bar = $('glitchbar');
    var heavy = act.filter(function (a) { return a.g.fix !== 'time' || !a.x.until; });
    bar.classList.toggle('on', !!heavy.length);
    bar.textContent = heavy.map(function (a) {
      return (a.g.state ? '◆ ' : '⚠ ') + a.g.name.toUpperCase() + (a.g.fix === 'shake' ? ' — ВСТРЯХНИТЕ ТЕЛЕФОН' : a.g.fix === 'code' ? ' — НУЖЕН КОД РЕМОНТА' : '');
    }).join(' · ');
    if (P.tab === 'scan' && P.scanBlocked()) $('scan-msg').textContent = P.game.texts.scanFail;
  }
  P.paintGlitches = paint;
  /* П25 (06, 141): сбои «0/1» (везде или только в чатах) и «не те буквы» — доля растёт со временем сбоя. */
  function growLv(a) { var t = (Date.now() - (a.x.at || Date.now())) / 60000; return Math.min(a.g.max, a.g.start + t * a.g.grow) / 100; }
  function fxLv(f) { return active().filter(function (a) { return a.g.kind === 'visual' && a.g.fx.indexOf(f) >= 0; }).reduce(function (m, a) { return Math.max(m, growLv(a)); }, 0); }
  P.typoLevel = function () { return P.state && P.acc() ? fxLv('typo') : 0; };
  setInterval(function () { if (!P.bitsSet || !P.game || !P.state) return; var on = !!P.acc(); P.bitsSet('glitch', on ? fxLv('bits') : 0, on ? fxLv('bitschat') : 0); }, 1000);
  // встряхнуть: 3 сильных рывка за 2 секунды
  var jolts = [];
  P.shake = function () {
    P.hook('shake');   // П16: событие телефона «встряхнули»
    var fixed = active().filter(function (a) { return a.g.fix === 'shake'; });
    if (!fixed.length) return;
    var m = P.mine();
    m.glitches = mineG().filter(function (x) { return !fixed.some(function (a) { return a.x === x; }); });
    P.save();
    paint();
    P.sound('ok');
    if (navigator.vibrate) navigator.vibrate(60);
  };
  window.addEventListener('devicemotion', function (e) {
    var a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x == null) return;
    var mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    if (Math.abs(mag - 9.8) < 14) return;
    var t = Date.now();
    jolts = jolts.filter(function (x) { return t - x < 2000; });
    if (!jolts.length || t - jolts[jolts.length - 1] > 150) jolts.push(t);
    if (jolts.length >= 3) { jolts = []; P.shake(); }
  });
  // случайные сбои по главам (З2): раз в минуту с вероятностью 1/«раз в N минут»
  setInterval(function () {
    var g = P.game, st = P.state;
    if (!g || !st || !P.acc() || P.preview) return;
    g.glitches.forEach(function (x) {
      if (!x.every) return;
      if (x.chapters.length && x.chapters.indexOf(st.chapter) < 0) return;
      if (!SG.allowed(x.who, st.account)) return;
      if (active().some(function (a) { return a.g.id === x.id; })) return;
      if (Math.random() < 1 / x.every) P.startGlitch(x.id);
    });
  }, 60000);
  setInterval(function () { if (P.game && P.acc()) { paint(); tickBanners(); } }, 1000);

  P.on('kind:glitch', function (b) { P.startGlitch(b.id); });
  P.on('kind:fix', function (b) {
    var ok = P.fixGlitch(b.id);
    if (ok) { P.sound('ok'); P.dialog({ title: 'СИСТЕМА ВОССТАНОВЛЕНА' }); }
  });

  /* ---------- состояние сети: авария, отсчёт, голосование ---------- */
  var countdown = null, vote = null;
  P.on('state', function (key, v) {
    if (key === 'alarm') { alarmAll = v; alarmApply(alarmMine && alarmMine.on ? alarmMine : v); }
    // П20 (Т20-3 А): авария одному телефону — «alarm@<персонаж>»; своя перебивает общую, снимается только на этом телефоне
    else if (P.state && P.state.account && key === 'alarm@' + P.state.account) { alarmMine = v; alarmApply(v && v.on ? v : alarmAll); }
    else if (key === 'countdown') { countdown = v && v.on ? v : null; banners(); }
    else if (key === 'vote') voteState(v);
  });
  P.on('route', function () { banners(); paint(); });

  function mmss(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function banners() {
    var box = $('banners');
    box.innerHTML = '';
    if (alarm) {
      var a = document.createElement('button');
      a.className = 'banner warn';
      a.textContent = '⚠ ' + (alarm.title || P.game.texts.alarm);
      a.addEventListener('click', function () { hidden = false; $('alarm').classList.add('on'); });
      box.appendChild(a);
    }
    if (countdown) {
      var c = document.createElement('div');
      c.className = 'banner cd';
      c.innerHTML = '<span class="t"></span><span class="v"></span>';
      c.querySelector('.t').textContent = countdown.title || 'ОТСЧЁТ';
      box.appendChild(c);
    }
    if (vote && voteForMe()) {
      var v = document.createElement('button');
      v.className = 'banner vote';
      v.innerHTML = '<span class="t"></span><span class="v"></span>';
      v.querySelector('.t').textContent = 'ГОЛОСОВАНИЕ: ' + (vote.title || '') + (myVote() != null ? ' ✓' : '');
      v.addEventListener('click', voteDialog);
      box.appendChild(v);
    }
    tickBanners();
  }
  function tickBanners() {
    var c = document.querySelector('#banners .cd .v');
    if (c && countdown) {
      var left = countdown.until - Net.now();
      c.textContent = mmss(left);
      c.parentNode.classList.toggle('zero', left <= 0);
      if (left <= 0 && !countdown.buzzed) { countdown.buzzed = true; if (navigator.vibrate) navigator.vibrate([300, 100, 300]); P.sound('err'); }
    }
    var v = document.querySelector('#banners .vote .v');
    if (v && vote) v.textContent = mmss(vote.until - Net.now());
  }

  /* ---------- голосования (В6) ---------- */
  function voteForMe() { return P.acc() && (!vote.to || !vote.to.length || vote.to.indexOf(P.state.account) >= 0); }
  function myVote() { var x = Net.state['v:' + vote.id + ':' + P.state.account]; return x == null ? null : x; }
  function tally(v) {
    var n = v.options.map(function () { return 0; });
    Object.keys(Net.state).forEach(function (k) {
      if (k.indexOf('v:' + v.id + ':') === 0) { var i = Net.state[k]; if (n[i] != null) n[i]++; }
    });
    return n;
  }
  P.tally = tally;
  function voteState(v) {
    var prev = vote;
    vote = v && v.on ? v : null;
    if (!vote && prev && v && v.id === prev.id && P.acc() && (!v.to || !v.to.length || v.to.indexOf(P.state.account) >= 0)) {
      var n = tally(v), best = Math.max.apply(null, n.concat([0]));
      var win = v.options.filter(function (o, i) { return n[i] === best && best > 0; });
      P.dialog({ title: 'ИТОГ ГОЛОСОВАНИЯ', text: '**' + (v.title || '') + '**\n\n' + v.options.map(function (o, i) { return o + ': ' + n[i]; }).join('\n') +
        (win.length ? '\n\nВыбрано: **' + win.join(', ') + '**' : '') });
    }
    if (vote && voteForMe() && (!prev || prev.id !== vote.id)) { P.sound('note'); if (navigator.vibrate) navigator.vibrate([100, 50, 100]); }
    banners();
  }
  function voteDialog() {
    if (!vote) return;
    var mineV = myVote();
    P.dialog({ title: 'ГОЛОСОВАНИЕ', text: '**' + (vote.title || '') + '**' + (mineV != null ? '\n\nВаш голос: ' + vote.options[mineV] + '. Можно изменить.' : ''),
      buttons: vote.options.map(function (o, i) {
        return { label: (i === mineV ? '✓ ' : '') + o, fn: function () {
          if (!Net.up) { P.dialog({ title: P.game.texts.offline, warn: true }); return; }
          Net.set('v:' + vote.id + ':' + P.state.account, i);
          P.sound('ok');
          setTimeout(banners, 300);
        } };
      }).concat([{ label: 'Закрыть', cls: 'dim' }]) });
  }

  /* ---------- подключение к сети по QR «СЕТЬ» (А6) ---------- */
  P.netUrl = function (u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^wss?:\/\//i.test(u)) u = 'ws://' + u;
    if (!/:\d+(\/|$)/.test(u.replace(/^wss?:\/\//, ''))) u = u.replace(/\/?$/, '') + ':8790';
    return u;
  };
  P.joinNet = function (url) {
    var st = P.state;
    url = P.netUrl(url);
    if (!url) return;
    var same = st.net && st.net.url === url;
    // другой адрес того же центра (шлюз, новый IP) — отметку «до какого сообщения видели» сохраняем:
    // центр сам сверит epoch и пришлёт всё, если это другой центр
    st.net = same ? st.net : { url: url, epoch: st.net && st.net.epoch || null, seq: st.net && st.net.seq || 0 };
    P.save();
    P.startNet();
    P.sound('ok');
    P.route();
    P.netStatus();
  };

  /* Окно «СЕТЬ»: живая проверка — почему нет связи и что сделать (замечание автора 16.11: «висит на подключении»). */
  var netTimer = 0;
  P.netText = function (url, up, d) {
    var host = String(url || '').replace(/^wss?:\/\//, '');
    var L = [url === Net.AUTO ? 'Центр: **ищу сам** (точка доступа мастера, затем вся сеть Wi-Fi)' : 'Центр: **' + host + '**', ''];
    if (url === Net.AUTO && !up) {
      L.push('○ ' + ((d && d.errText) || Net.info || 'Поиск…'));
      L.push('', 'Что сделать: подключите телефон к **точке доступа мастера**; на телефоне мастера должен быть запущен центр (пульт мастера → «Запустить центр»). Телефон найдёт его сам. Не находит — отсканируйте QR «СЕТЬ» с пульта мастера.');
      return L.join('\n');
    }
    if (up) { L.push('**● СВЯЗЬ ЕСТЬ**'); return L.join('\n'); }
    d = d || {};
    L.push('○ Подключение… ' + (d.tries ? 'попытка ' + d.tries : ''));
    if (d.errText) L.push('Последняя попытка: **' + d.errText + '**');
    if (!d.tries && !d.errText) return L.join('\n');
    L.push('', 'ПРОВЕРКА СЕТИ');
    if (d.wifi === false) L.push('✗ Нет Wi-Fi. Включите Wi-Fi и подключитесь к сети игры.');
    else if (d.wifi) L.push('✓ Wi-Fi есть' + (d.ips && d.ips.length ? ', адрес этого телефона ' + d.ips[0] : ''));
    if (d.same === false) L.push('✗ Центр в другой сети. Подключите оба телефона к одной сети Wi-Fi (не к гостевой).');
    else if (d.same === true) L.push('✓ Центр в той же сети');
    if (d.vpn) L.push('✗ **Включён VPN** (значок ключа вверху экрана). Выключите его на время игры: VPN уводит адрес центра в интернет.');
    else if (d.vpn === false) L.push('✓ VPN выключен');
    var e = d.err || '';
    L.push('');
    if (e === 'refused') L.push('Что сделать: на телефоне-центре откройте пульт мастера → «Запустить центр».');
    else if (e === 'notcenter' || e === 'badaddr') L.push('Что сделать: отсканируйте QR «СЕТЬ» заново.');
    else if (d.vpn) L.push('Что сделать: выключите VPN на этом телефоне и на телефоне-центре. Связь появится сама.');
    else if (e === 'timeout' || e === 'unreach' || d.browser) {
      L.push('Что сделать: проверьте, что телефон подключён к **точке доступа мастера**, а не к домашнему Wi-Fi (телефон мог перескочить сам). Связь вернётся сама; если нет — «Переподключить».');
      L.push('• Откройте в Chrome на этом телефоне **http://' + host.replace(/\/.*$/, '') + '** — должно показаться SIGNALY CENTER OK.');
      L.push('• Не открывается — проверьте, что на телефоне мастера включена точка доступа и запущен центр; если точку перезапускали и адрес сменился — покажите QR «СЕТЬ» заново.');
      L.push('• Открывается — напишите разработчику, что видно в этом окне.');
    }
    return L.join('\n');
  };
  P.netStatus = function () {
    if (!Net.url) return;
    P.dialog({ title: 'СЕТЬ', text: P.netText(Net.url, Net.up, null), buttons: [
      { label: 'Переподключить', keep: true, fn: function () { P.startNet(); P.sound('key'); } }, { label: 'Закрыть', cls: 'dim' }] });
    clearInterval(netTimer);
    var tick = function () {
      if ($('dlg-title').textContent !== 'СЕТЬ' || !$('dlg').classList.contains('on') || !Net.url) { clearInterval(netTimer); return; }
      Net.diag().then(function (d) {
        if ($('dlg-title').textContent !== 'СЕТЬ' || !$('dlg').classList.contains('on')) return;
        $('dlg-text').innerHTML = SG.markup(P.netText(Net.url, Net.up, d));
      });
    };
    netTimer = setInterval(tick, 1500);
    tick();
  };
  function loginNet() {
    var ln = $('login-net');
    if (!ln) return;
    if (!Net.url) { ln.textContent = ''; return; }
    var host = Net.url === Net.AUTO ? 'поиск центра' : Net.url.replace(/^ws:\/\//, '');
    ln.textContent = Net.up ? '● СЕТЬ: ' + host : '○ НЕТ СВЯЗИ: ' + host + (Net.info ? ' — ' + Net.info : '') + ' · ПРОВЕРИТЬ';
  }
  P.on('net', loginNet);
  P.on('route', loginNet);
  Net.on('link', loginNet);
  $('login-net').addEventListener('click', function () { P.netStatus(); });
  $('bar-net').addEventListener('click', function () { P.netStatus(); });

  /* ---------- QR на экране телефона (передача блока, адрес сети) ---------- */
  P.qr = function (text, size) {
    var q = window.qrcode(0, 'M');
    q.addData(String(text));
    q.make();
    var n = q.getModuleCount(), cell = Math.max(3, Math.floor((size || 260) / (n + 8)));
    var c = document.createElement('canvas');
    c.width = c.height = cell * (n + 8);
    var x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#000000';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect((k + 4) * cell, (r + 4) * cell, cell, cell);
    c.className = 'qr-show';
    return c;
  };
  P.shareBlock = function (b) {
    var box = document.createElement('div');
    box.style.textAlign = 'center';
    box.appendChild(P.qr('SGB:' + b.id));
    var p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Пусть другой игрок отсканирует этот код вкладкой «СКАНЕР».';
    box.appendChild(p);
    P.dialog({ title: 'ПЕРЕДАТЬ: ' + (b.title || ''), html: box });
  };
})();
