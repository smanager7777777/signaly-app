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
  var tick = null, spyTuner = null, wasCool = false;

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
    sess = { sid: sid, key: 'spy:' + src + ':' + me(), target: target, src: src, shown: how === 'random' ? '' : how === 'wave' ? label || '' : accName(target), at: now, until: until, lines: [], part: '', ack: false, mic: true };
    note = '';
    Net.set(sess.key, { sid: sid, at: now, until: until, shown: target, spy: me() });
    P.sound('ok');
    openTab();
    paint();
  }
  /* why: '' — сам вышел; 'heat' — перегрев; 'cut' — жертва (или мастер) прервала */
  function stop(why) {
    if (!sess) return;
    var s = sess;
    sess = null;   // П25: при выходе запись стирается (не копить память)
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
        '<div class="spy-log" id="spy-log">' + (sess.lines.length || sess.part ? sess.lines.map(function (l) {
          return '<div class="spy-line"><span class="spy-t">' + new Date(l.at).toTimeString().slice(0, 8) + '</span> ' + marked(l.text) + '</div>';
        }).join('') + (sess.part ? '<div class="spy-line spy-part">' + esc(SG.voiceNorm(sess.part)) + '…</div>' : '') :
          '<p class="hint">Тишина. Речь источника появится здесь.</p>') + '</div>' +
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
    if (b.k !== 'spy' || !sess || b.sid !== sess.sid) return;
    if (b.ready) { sess.ack = true; sess.mic = b.mic !== false; }
    else if (b.part) sess.part = b.text || '';
    else if (b.text) { sess.ack = true; sess.part = ''; sess.lines.push({ text: b.text, at: o.at || Net.now() }); if (sess.lines.length > 200) sess.lines.shift(); }
    if (P.tab === 'spy') paint();
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
      out.push({ key: k, spy: x[2], sid: v.sid, at: v.at || now, until: v.until || 0 });
    });
    return out;
  }
  var acked = {};
  function victim() {
    var list = mySessions();
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
    mySessions().forEach(function (s) { Net.send({ t: 'live', to: ['acc:' + s.spy], body: { k: 'spy', sid: s.sid, text: SG.voiceNorm(text), part: !!part } }); });
  };
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
  var wasOn = false;
  function victimTick() {
    var G = g();
    if (!G || !me()) return;
    var list = mySessions();
    if (!G.spy.glitch || !list.length) { if (wasOn) { wasOn = false; bitsSpy(0); } return; }
    var since = Math.min.apply(null, list.map(function (s) { return s.at; }));
    var sec = (Net.now() - since) / 1000 - G.spy.glitchFrom;
    if (sec < 0) { if (wasOn) { wasOn = false; bitsSpy(0); } return; }
    var lv = Math.min(G.spy.glitchMax / 100, 0.01 + sec / 60 * G.spy.glitchGrow / 100);
    wasOn = true;
    bitsSpy(lv);
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
    bitsSpy(0);
    wasOn = false;
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
