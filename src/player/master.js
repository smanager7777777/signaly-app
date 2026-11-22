/* СИГНАЛЫ — пульт мастера (открывается из режима мастера; на мастерском телефоне — с экрана входа).
   Сеть: центр на этом телефоне, QR «СЕТЬ», список телефонов. Игра: глава всем, авария, уведомления,
   сбои, отсчёт, голосования, автоматика, переменные терминала. Переписка. Сброс центра. */
(function () {
  'use strict';
  var P = window.SGP, SG = window.SG, Net = window.SGNet, $ = P.$;
  var plugin = Net.plugin;
  var tab = 'net';
  var log = [];          // вся переписка, которую видит мастерский телефон
  var center = null;     // состояние центра на этом телефоне (APK)

  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (e) { el.addEventListener(e, v[e]); });
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    function add(x) {
      if (x == null || x === false) return;
      if (Array.isArray(x)) x.forEach(add);
      else el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
    }
    for (var i = 2; i < arguments.length; i++) add(arguments[i]);
    return el;
  }
  function sel(list, cur) {
    return h('select', {}, list.map(function (o) { return h('option', { value: o[0], text: o[1], selected: String(o[0]) === String(cur) }); }));
  }
  function varsNow() {
    var o = {};
    Object.keys(Net.state || {}).forEach(function (k) { if (/^var:/.test(k)) o[k.slice(4)] = Net.state[k]; else if (/^win:/.test(k)) o[k] = Net.state[k]; });
    return o;
  }
  /* ---------- П20: личные переменные на пульте ---------- */
  var pvSel = {}, pvForm = { v: '', val: '' }, pvLog = [];
  try { pvLog = JSON.parse(localStorage.getItem('sg-pvlog' + (window.SG_SLOT ? '-' + window.SG_SLOT : '')) || '[]') || []; } catch (e) { pvLog = []; }
  function winsOf(g, name) {
    var out = [];
    ((g.header || {}).items || []).forEach(function (it) { if (it.var === name && it.win && out.indexOf(it.win) < 0) out.push(it.win); });
    (g.rules || []).forEach(function (r) { if (r.on === 'var' && r.var === name && r.win && out.indexOf(r.win) < 0) out.push(r.win); });
    (g.codes || []).forEach(function (c) { (c.when || []).forEach(function (w) { if (w.var === name && w.win && out.indexOf(w.win) < 0) out.push(w.win); }); });
    (g.termWins || []).forEach(function (w) { if (w.var === name && out.indexOf(w.min) < 0) out.push(w.min); });   // П23: окна терминала
    return out.sort(function (a, b) { return a - b; });
  }
  Net.on('state', function (key, value) {
    var g = P.game;
    if (!g || !/^var:[^@]+@/.test(key)) return;
    var m = key.slice(4).split('@'), a = SG.byId(g.accounts, m[1]), sv = SG.sharedVar(g, m[0]);
    if (!a || !sv || !sv.personal) return;
    var last = pvLog[0];
    if (last && last.k === key && last.v === value) return;
    pvLog.unshift({ k: key, t: Date.now(), who: a.name || a.id, n: sv.label || sv.name, v: value });
    if (pvLog.length > 50) pvLog.length = 50;
    try { localStorage.setItem('sg-pvlog' + (window.SG_SLOT ? '-' + window.SG_SLOT : ''), JSON.stringify(pvLog)); } catch (e) {}
  });
  function personalCard(g, pvs) {
    var vals = varsNow();
    if (!pvForm.v || !SG.sharedVar(g, pvForm.v)) pvForm.v = pvs[0].name;
    var head = h('tr', {}, h('th', { text: '' }), h('th', { text: 'Персонаж' }), pvs.map(function (v) {
      var w = winsOf(g, v.name);
      return h('th', { text: (v.label || v.name) + (w.length ? ' (за ' + w.join('/') + ' мин)' : '') });
    }));
    var rows = g.accounts.map(function (a) {
      var cb = h('input', { type: 'checkbox', 'data-acc': a.id });
      cb.checked = !!pvSel[a.id];
      cb.addEventListener('change', function () { pvSel[a.id] = cb.checked; });
      return h('tr', {}, h('td', {}, cb), h('td', { text: a.name || a.id }), pvs.map(function (v) {
        var x = SG.varValue(g, vals, v.name, a.id), mx = SG.maxOf(v, a.id, 0);
        var w = winsOf(g, v.name).map(function (n) { return fmtVar(SG.winValue(g, vals, v.name, a.id, n)); });
        return h('td', { class: 'pv-cell', 'data-var': v.name, 'data-acc': a.id, text: fmtVar(x) + (mx ? '/' + mx : '') + (w.length ? ' · ' + w.join('/') : '') });
      }));
    });
    var vs = sel(pvs.map(function (v) { return [v.name, v.label || v.name]; }), pvForm.v);
    vs.addEventListener('change', function () { pvForm.v = vs.value; });
    var inp = h('input', { type: 'text', class: 'cin pv-val', value: pvForm.val, placeholder: 'значение' });
    inp.addEventListener('input', function () { pvForm.val = inp.value; });
    function chosen() {
      var ids = g.accounts.filter(function (a) { return pvSel[a.id]; }).map(function (a) { return a.id; });
      if (!ids.length) { P.dialog({ title: 'НИКТО НЕ ВЫБРАН', warn: true, text: 'Отметьте персонажей галочками.' }); return null; }
      return ids;
    }
    function act(o) { if (!need()) return; var ids = chosen(); if (!ids) return; P.doActions([Object.assign({ type: 'term', name: pvForm.v, accs: ids }, o)]); done(); }
    var log = pvLog.slice(0, 50).map(function (e) {
      var d = new Date(e.t);
      return h('div', { class: 'pv-log', text: ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + ' · ' + e.who + ' · ' + e.n + ' = ' + fmtVar(e.v) });
    });
    return card('ЛИЧНЫЕ ПЕРЕМЕННЫЕ',
      h('div', { class: 'pv-wrap' }, h('table', { class: 'pv-table' }, head, rows)),
      h('div', { class: 'row2' }, btn('Выбрать всех', function () { g.accounts.forEach(function (a) { pvSel[a.id] = true; }); render(); }, 'dim'),
        btn('Снять выбор', function () { pvSel = {}; render(); }, 'dim')),
      h('label', { class: 'field' }, 'Переменная', vs),
      h('div', { class: 'row2' }, btn('−1 выбранным', function () { act({ op: 'add', value: -1 }); }, 'dim'), btn('+1 выбранным', function () { act({ op: 'add', value: 1 }); }, 'dim')),
      h('div', { class: 'row2' }, inp, btn('Записать выбранным', function () { act({ value: SG.termValue(pvForm.val) }); }, 'dim')),
      h('p', { class: 'hint', text: 'У каждого персонажа своё значение (видят центр, пульт и терминал). Через «·» — сумма прибавлений за окно «за N мин». В текстах: {{имя}} — своё, {{имя@Имя персонажа}} или {{имя@#номер}} — чужое.' }),
      h('div', { class: 'ct2', text: 'ИЗМЕНЕНИЯ (последние ' + log.length + ')' }), log.length ? log : h('p', { class: 'hint', text: 'Пока нет.' }));
  }
  function fmtVar(x) { return x === true ? 'да' : x === false ? 'нет' : x == null ? '—' : String(x); }
  function card(title) { return h('div', { class: 'ccard' }, h('div', { class: 'ct', text: title }), Array.prototype.slice.call(arguments, 1)); }
  function btn(label, fn, cls) { return h('button', { class: 'btn ' + (cls || ''), text: label, on: { click: fn } }); }
  function need() {
    if (Net.url) return true;
    P.dialog({ title: 'НЕТ СЕТИ', warn: true, text: 'Сначала подключите телефон к центру (вкладка «СЕТЬ» пульта).' });
    return false;
  }
  function done(t) { P.sound('ok'); toast(t || 'ОТПРАВЛЕНО'); }
  function toast(t) {
    var el = h('div', { class: 'toast', text: t });
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1600);
  }
  function whoPicker(list) {
    var g = P.game;
    return h('div', { class: 'cwho' }, g.accounts.map(function (a) {
      var c = h('input', { type: 'checkbox', checked: list.indexOf(a.id) >= 0 });
      c.addEventListener('change', function () {
        var i = list.indexOf(a.id);
        if (c.checked && i < 0) list.push(a.id);
        if (!c.checked && i >= 0) list.splice(i, 1);
      });
      return h('label', {}, c, a.name || '?');
    }), h('div', { class: 'hint', text: 'ничего не отмечено — всем' }));
  }
  function to(list) { return list.length ? list.map(function (id) { return 'acc:' + id; }) : ['all']; }
  function accName(id) { if (id === '@boss') return (P.game.chat || SG.DEFAULT_CHAT).master; var a = SG.byId(P.game.accounts, id); return a ? a.name : id || '—'; }
  function dest(list) { return (list || []).map(function (t) { return t === 'all' ? 'всем' : t.indexOf('acc:') === 0 ? accName(t.slice(4)) : t; }).join(', '); }

  /* ---------- открыть ---------- */
  P.console = function () {
    if (!P.game) return;
    if (!$('console').classList.contains('on')) P.pushLayer('console', function () { P.route(); });
    render();
    refreshCenter();
  };
  $('console-back').addEventListener('click', function () { P.closeTop(); });
  P.on('route', function () {
    var b = $('login-console');
    if (!b) {
      b = h('button', { class: 'btn', id: 'login-console', text: 'ПУЛЬТ МАСТЕРА', on: { click: P.console } });
      $('login-scan').parentNode.appendChild(b);
    }
    b.style.display = P.state && P.state.masterDev ? '' : 'none';
  });
  P.on('msg', function (o) {
    if (o.kind === 'chat' || o.kind === 'notify' || o.kind === 'vote-close' || o.kind === 'event' || o.kind === 'report') {
      log.push(o);
      if (log.length > 500) log.shift();
      if (tab === 'log' && $('console').classList.contains('on')) render();
    }
  });
  P.on('vars', function () { if ($('console').classList.contains('on') && tab === 'game' && !document.activeElement.matches('#console input, #console textarea')) render(); });
  P.on('net', function () { if ($('console').classList.contains('on')) { dot(); if (tab === 'net') render(); } });
  Net.on('later', function () { if ($('console').classList.contains('on') && tab === 'log' && !typing()) render(); });
  Net.on('peers', function () { if ($('console').classList.contains('on') && (tab === 'net' || tab === 'phones') && !typing()) { render(); refreshCenter(); } });
  Net.on('state', function (k) { if (k === 'probe' && $('console').classList.contains('on') && tab === 'phones' && !typing()) render(); });
  // П16: проба голоса — что услышал каждый телефон (центр шлёт только мастеру)
  var heardLog = [];
  Net.on('heard', function (o) {
    heardLog.push(o);
    if (heardLog.length > 300) heardLog.shift();
    var pr = (Net.peers || []).filter(function (p) { return p.dev === o.dev; })[0];
    if (pr) pr.heard = o;
    if ($('console').classList.contains('on') && tab === 'phones' && !typing()) render();
  });
  Net.on('link', function () { if ($('console').classList.contains('on') && tab === 'net' && !typing()) render(); });
  // счёт «подключено» и проверка сети обновляются сами, пока открыта вкладка СЕТЬ (раньше застывал на 0)
  setInterval(function () { if ($('console').classList.contains('on') && tab === 'net') refreshCenter(); }, 3000);
  function typing() { var a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && $('console').contains(a); }
  function dot() { var d = $('console-net'); d.classList.toggle('up', Net.up); d.textContent = Net.up ? '● СВЯЗЬ' : Net.url ? '○ НЕТ СВЯЗИ' : '○ НЕТ СЕТИ'; }

  function render() {
    dot();
    var tabs = $('console-tabs');
    tabs.innerHTML = '';
    [['net', 'СЕТЬ'], ['phones', 'ТЕЛЕФОНЫ'], ['game', 'ИГРА'], ['log', 'ПЕРЕПИСКА']].forEach(function (t) {
      tabs.appendChild(h('button', { class: tab === t[0] ? 'on' : '', text: t[1], on: { click: function () { tab = t[0]; render(); } } }));
    });
    var body = $('console-body');
    var keep = body.scrollTop;
    body.innerHTML = '';
    ({ net: pNet, phones: pPhones, game: pGame, log: pLog })[tab](body);
    body.scrollTop = keep;
  }

  /* ---------- СЕТЬ ---------- */
  function refreshCenter() {
    if (!plugin) return;
    plugin.status().then(function (s) {
      var was = center ? [center.center, center.online, center.vpn, (center.ips || []).join(), center.up, center.rep && center.rep.has].join('|') : '';
      center = s;
      var now = [s.center, s.online, s.vpn, (s.ips || []).join(), s.up, s.rep && s.rep.has].join('|');
      if (was !== now && tab === 'net' && $('console').classList.contains('on') && !typing()) render();
    }).catch(function () {});
  }
  function centerUrl(ip) { return 'ws://' + ip + ':' + ((center && center.port) || 8790); }
  function pNet(box) {
    var st = P.state;
    // центр на этом телефоне
    var cBox;
    if (!plugin) cBox = h('p', { class: 'hint', text: 'Центр сети запускается только в приложении на телефоне (APK). Здесь можно подключиться к центру по адресу.' });
    else if (center && center.center) {
      var ip = (center.ips || [])[0];
      cBox = h('div', {},
        h('p', { text: 'ЦЕНТР РАБОТАЕТ · подключено: ' + center.online + (Net.up && /127\.0\.0\.1/.test(Net.url || '') ? ' (вместе с этим телефоном)' : '') }),
        center.vpn ? h('p', { class: 'warn', text: 'На этом телефоне включён VPN (значок ключа вверху). Если телефоны не подключаются — выключите его на время игры.' }) : null,
        ip ? h('div', { class: 'cqr' }, P.qr('SGNET:' + centerUrl(ip), 300), h('div', { class: 'big', text: ip + ':' + center.port })) :
          h('p', { class: 'warn', text: 'Нет адреса Wi-Fi: включите Wi-Fi или точку доступа.' }),
        (center.ips || []).length > 1 ? h('p', { class: 'hint', text: 'Другие адреса: ' + center.ips.slice(1).join(', ') }) : null,
        h('p', { class: 'hint', text: 'Игроки сканируют этот QR на экране входа («СКАНЕР QR») или вкладкой «СКАНЕР». QR можно сохранить снимком экрана и распечатать.' }),
        ip ? h('p', { class: 'hint', text: 'Проверка сети: на другом телефоне откройте в Chrome http://' + ip + ':' + center.port + ' — должно показаться SIGNALY CENTER OK.' }) : null,
        h('p', { class: 'hint', text: 'На игре: на этом телефоне включена точка доступа, все телефоны и терминал подключены к ней (11 устройств — проверьте в настройках точки «максимум устройств»). Если точку выключили и включили — телефоны переподключатся сами; адрес сменился — найдут центр по шлюзу сети.' }),
        btn('Не гасить экран (телефон на зарядке)', function () { plugin.keepScreen({ on: true }); done('ЭКРАН НЕ ГАСНЕТ'); }, 'dim'),
        btn('Остановить центр', function () {
          P.dialog({ title: 'ОСТАНОВИТЬ ЦЕНТР?', warn: true, text: 'Телефоны игроков потеряют связь, пока центр не запустят снова. Переписка и счёт сохранятся.', buttons: [
            { label: 'Остановить', cls: 'warn', fn: function () { plugin.stopCenter().then(refreshCenter); } }, { label: 'Отмена', cls: 'dim' }] });
        }, 'warn'));
    } else {
      cBox = h('div', {},
        h('p', { class: 'hint', text: 'Центр — телефон, через который идут все сообщения. На игре это телефон мастера с включённой точкой доступа (через роутер телефоны друг друга не видят). Сначала включите точку доступа, затем запустите центр.' }),
        btn('Запустить центр на этом телефоне', function () {
          plugin.startCenter().then(function (s) {
            center = s;
            var ipx = (s.ips || [])[0];
            st.masterDev = true;
            P.joinNet('ws://127.0.0.1:' + s.port);
            render();
            if (!ipx) P.dialog({ title: 'НЕТ WI-FI', warn: true, text: 'Центр запущен, но у телефона нет адреса в сети Wi-Fi.' });
          }).catch(function (e) { P.dialog({ title: 'ЦЕНТР НЕ ЗАПУЩЕН', warn: true, text: String(e.message || e) }); });
        }));
    }
    box.appendChild(card('ЦЕНТР СЕТИ НА ЭТОМ ТЕЛЕФОНЕ', cBox));
    box.appendChild(card('ЗАПАСНОЙ ЦЕНТР', backupBox()));

    // подключение
    var addr = h('input', { type: 'text', class: 'cin', value: Net.url ? Net.url.replace(/^ws:\/\//, '') : '', placeholder: '192.168.1.20' });
    box.appendChild(card('ПОДКЛЮЧЕНИЕ ЭТОГО ТЕЛЕФОНА',
      h('p', { text: Net.url ? (Net.up ? '● Связь есть: ' : '○ Нет связи: ') + Net.url.replace(/^ws:\/\//, '') + (!Net.up && Net.info ? ' — ' + Net.info : '') : 'Не подключён' }),
      Net.url && !Net.up ? btn('Проверить сеть', function () { P.netStatus(); }, 'dim') : null,
      h('label', { class: 'field' }, 'Адрес центра', addr),
      h('div', { class: 'row2' },
        btn('Подключить', function () { if (addr.value.trim()) { P.closeTop(); P.joinNet(addr.value); } }),
        btn('Отключить', function () { Net.stop(); st.net = null; P.save(); render(); }, 'dim')),
      h('label', { class: 'field chk' }, (function () {
        var c = h('input', { type: 'checkbox', checked: !!st.masterDev });
        c.addEventListener('change', function () { st.masterDev = c.checked; P.save(); P.helloNet(); render(); });
        return c;
      })(), 'Этот телефон — мастерский (видит всю переписку, отправляет правила центру)'),
      plugin ? btn('Разрешить работу в фоне (батарея)', function () { plugin.battery({ ask: true }); }, 'dim') : null));

    // телефоны
    var peers = peerList();
    var terms = peers.filter(function (p) { return p.role === 'terminal'; });
    var termOn = terms.some(function (p) { return p.online; });
    box.appendChild(card('В СЕТИ · ' + netCount(peers),
      st.masterDev ? h('div', { class: 'row2' }, h('span', { class: 'term-line', text: 'Терминал: ' + (termOn ? '● в сети' : terms.length ? '○ нет связи' : '○ не подключался') }),
        btn('Записать в терминал', function () { tab = 'game'; render(); setTimeout(function () { var x = document.querySelector('#console .term-name'); if (x) { x.scrollIntoView(); x.focus(); } }, 50); }, 'dim')) : null,
      st.masterDev ? (peers.length ? h('div', { class: 'peers' }, peers.map(function (p) {
        var ago = p.online ? '' : ' · ' + Math.round((Net.now() - p.last) / 60000) + ' мин назад';
        return h('div', { class: 'peer' + (p.online ? ' on' : '') }, h('span', { text: (p.online ? '● ' : '○ ') + (p.dev === st.dev ? 'ЭТОТ ТЕЛЕФОН · ' : '') + (p.role === 'terminal' ? 'ТЕРМИНАЛ' : p.role === 'master' ? 'МАСТЕР' + (p.acc ? ' · ' + accName(p.acc) : '') : accName(p.acc)) }),
          h('span', { class: 'sm', text: (p.name && p.role !== 'phone' ? p.name : '') + ago }));
      })) : h('p', { class: 'hint', text: 'Пока никого.' })) : h('p', { class: 'hint', text: 'Список виден на мастерском телефоне (галочка выше).' })));
  }

  /* ---------- П17 (Т8-1 А): запасной центр и восстановление ---------- */
  var dumpWait = null;
  Net.on('dump', function (o) { if (dumpWait) { var f = dumpWait; dumpWait = null; f(o); } });
  function stamp(t) {
    var d = new Date(t || Date.now());
    function z(n) { return ('0' + n).slice(-2); }
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes());
  }
  /* Сохранить состояние файлом: в APK — в «Загрузки», в браузере — скачиванием. */
  function saveState(text) {
    var name = 'signaly-sostoyanie-' + stamp() + '.json';
    if (plugin && plugin.saveFile) {
      plugin.saveFile({ name: name, text: text }).then(function (r) {
        P.dialog({ title: 'СОСТОЯНИЕ ВЫГРУЖЕНО', text: 'Файл: ' + r.where + '. Его можно загрузить на любом телефоне (пульт → «Загрузить состояние из файла»).' });
      }).catch(function (e) { P.dialog({ title: 'НЕ ЗАПИСАНО', warn: true, text: String(e.message || e) }); });
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.id = 'dump-link';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    done('ВЫГРУЖЕНО');
  }
  function dumpState() {
    if (Net.up && P.state.masterDev) {
      var t = setTimeout(function () { if (dumpWait) { dumpWait = null; P.dialog({ title: 'НЕТ ОТВЕТА', warn: true, text: 'Центр не прислал состояние (старая версия приложения на телефоне-центре?).' }); } }, 15000);
      dumpWait = function (o) { clearTimeout(t); saveState(JSON.stringify(o.data)); };
      Net.send({ t: 'admin', op: 'dump', id: 'd' + Date.now() });
      return;
    }
    if (plugin && plugin.replicaDump) {
      plugin.replicaDump().then(function (r) {
        if (!r.text || r.text.indexOf('"epoch":null') >= 0) { P.dialog({ title: 'НЕТ КОПИИ', warn: true, text: 'На этом телефоне ещё нет копии игры.' }); return; }
        saveState(r.text);
      });
      return;
    }
    P.dialog({ title: 'НЕТ СВЯЗИ', warn: true, text: Net.up ? 'Выгружать может мастерский телефон (вкладка «СЕТЬ» → «Этот телефон — мастерский»).' : 'Подключите телефон к центру.' });
  }
  function loadState(inp) {
    var f = inp.files && inp.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var text = String(r.result || ''), data = null;
      try { data = JSON.parse(text); } catch (e) { /* ниже */ }
      inp.value = '';
      if (!data || !data.epoch) { P.dialog({ title: 'НЕ ТОТ ФАЙЛ', warn: true, text: 'Это не файл состояния СИГНАЛОВ.' }); return; }
      var what = (data.log || []).length + ' сообщений, переменных: ' + Object.keys(data.state || {}).filter(function (k) { return /^var:/.test(k); }).length;
      if (Net.up && P.state.masterDev) {
        P.dialog({ title: 'ЗАГРУЗИТЬ В ЦЕНТР?', warn: true, text: 'Состояние центра заменится файлом (' + what + '). Все телефоны и терминал переподключатся сами.', buttons: [
          { label: 'Загрузить', cls: 'warn', fn: function () { Net.send({ t: 'admin', op: 'restore', data: data }); done('ЗАГРУЖЕНО'); } }, { label: 'Отмена', cls: 'dim' }] });
      } else if (plugin && plugin.takeover && !(center && center.center)) {
        P.dialog({ title: 'ПОДНЯТЬ ЦЕНТР ИЗ ФАЙЛА?', warn: true, text: 'На этом телефоне запустится центр с состоянием из файла (' + what + '). Телефоны и терминал найдут его сами.', buttons: [
          { label: 'Поднять', cls: 'warn', fn: function () { raise(text); } }, { label: 'Отмена', cls: 'dim' }] });
      } else P.dialog({ title: 'НЕКУДА ЗАГРУЗИТЬ', warn: true, text: Net.up ? 'Загружать в центр может мастерский телефон (вкладка «СЕТЬ» → «Этот телефон — мастерский»).' : 'Нет связи с центром. Поднять центр из файла можно только в приложении на телефоне.' });
    };
    r.readAsText(f);
  }
  function raise(data) {
    plugin.takeover(data ? { data: data } : {}).then(function (s) {
      center = s;
      P.state.masterDev = true;
      P.joinNet('ws://127.0.0.1:' + s.port);
      render();
      P.dialog({ title: 'ЦЕНТР ПОДНЯТ', text: 'Центр работает на этом телефоне. Телефоны и терминал найдут его сами (до минуты). Если центр был на точке доступа — включите на этом телефоне точку доступа с тем же именем и паролем.' });
    }).catch(function (e) { P.dialog({ title: 'ЦЕНТР НЕ ПОДНЯТ', warn: true, text: String(e.message || e) }); });
  }
  function backupBox() {
    var rep = center && center.rep, line;
    if (!plugin) line = h('p', { class: 'hint', text: 'Копия игры хранится в приложении на каждом телефоне. Поднять центр из копии можно только в приложении (APK).' });
    else if (center && center.center) line = h('p', { class: 'hint', text: 'Центр — этот телефон. Копия игры есть у всех остальных телефонов.' });
    else line = h('p', { id: 'rep-line', text: rep && rep.has ? 'Копия игры на этом телефоне: ' + rep.msgs + ' сообщений, обновлена ' + hhmmss(rep.at) + '.' : 'Копии игры на этом телефоне пока нет (появится после подключения к центру).' });
    var file = h('input', { type: 'file', accept: '.json,application/json', id: 'state-file', style: 'display:none' });
    file.addEventListener('change', function () { loadState(file); });
    return h('div', {},
      h('p', { class: 'hint', text: 'Если телефон-центр сел или сломался: на любом другом телефоне войдите в режим мастера (мастерский код) → пульт → «Поднять центр отсюда». Центр запустится с копией игры этого телефона; телефоны и терминал найдут его сами. Если старый центр вернётся — он уступит сам. Если центр был на точке доступа — включите точку доступа на новом телефоне с тем же именем и паролем.' }),
      line,
      plugin && !(center && center.center) ? (Net.up ? h('p', { class: 'hint', text: 'Сейчас центр в сети — второй центр поднимать нельзя (кнопка появится, когда связь с центром пропадёт).' }) :
        btn('Поднять центр отсюда', function () {
          P.dialog({ title: 'ПОДНЯТЬ ЦЕНТР ЗДЕСЬ?', warn: true, text: 'Делайте это, только если старый центр не работает: на этом телефоне запустится центр с копией игры' + (rep && rep.has ? ' (' + rep.msgs + ' сообщений, ' + hhmmss(rep.at) + ')' : '') + '.', buttons: [
            { label: 'Поднять', cls: 'warn', fn: function () { raise(null); } }, { label: 'Отмена', cls: 'dim' }] });
        }, 'warn')) : null,
      h('div', { class: 'row2' },
        btn('Выгрузить состояние в файл', dumpState, 'dim'),
        btn('Загрузить состояние из файла', function () { file.click(); }, 'dim')),
      file);
  }

  /* ---------- П16: ТЕЛЕФОНЫ — наблюдение за телефонами и проба голоса (основа 1, раздел 6в) ---------- */
  var VMODES = { off: 'выкл', button: 'по кнопке', screen: 'при разблокированном экране', always: 'всегда в фоне' };
  function ago(t) {
    if (!t) return '';
    var m = Math.round((Net.now() - t) / 60000);
    return m < 1 ? 'сейчас' : m < 60 ? m + ' мин назад' : Math.floor(m / 60) + ' ч ' + (m % 60) + ' мин назад';
  }
  function hhmmss(t) { var d = new Date(t || Date.now()); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }
  /* Пакет телефона против своего: '' — тот же, 'old' — старее, 'other' — другой пакет, 'new' — новее, '?' — не сообщил. */
  P.packCmp = function (pk) {
    var g = P.game;
    if (!pk) return '?';
    if ((pk.t || '') !== (g.title || '')) return 'other';
    return +pk.v < +g.version ? 'old' : +pk.v > +g.version ? 'new' : '';
  };
  var heardFilter = '';
  /* П19 (замечание 3): один список для «СЕТИ» и «ТЕЛЕФОНОВ» — с этим (мастерским) телефоном; из старых записей центра
     без связи — только персонажи, которых нет на другом телефоне, и один терминал. */
  function peerList() {
    var seen = {};
    return (Net.peers || []).slice().sort(function (a, b) { return (b.online ? 1 : 0) - (a.online ? 1 : 0) || (b.last || 0) - (a.last || 0); }).filter(function (p) {
      var key = p.role === 'terminal' ? 'term' : p.acc ? 'acc:' + p.acc : p.role === 'master' ? 'dev:' + p.dev : '';
      if (p.online) { if (key) seen[key] = true; return true; }
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function (a, b) {
      return (b.dev === P.state.dev ? 1 : 0) - (a.dev === P.state.dev ? 1 : 0) || (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(accName(a.acc)).localeCompare(String(accName(b.acc)));
    });
  }
  P.peerList = peerList;
  /* «телефонов в сети: 1 из 1 (с этим) · персонажей: 0 из 0 · терминал: нет» */
  function netCount(peers) {
    var ph = peers.filter(function (p) { return p.role !== 'terminal'; }), ac = ph.filter(function (p) { return p.acc; });
    var on = function (l) { return l.filter(function (p) { return p.online; }).length; };
    var tm = peers.filter(function (p) { return p.role === 'terminal'; });
    var me = ph.some(function (p) { return p.dev === P.state.dev; });
    return 'телефонов в сети: ' + on(ph) + ' из ' + ph.length + (me ? ' (с этим)' : '') + ' · персонажей: ' + on(ac) + ' из ' + ac.length +
      ' · терминал: ' + (on(tm) ? 'в сети' : tm.length ? 'нет связи' : 'нет');
  }
  P.netCount = netCount;
  function pPhones(box) {
    var st = P.state, g = P.game;
    if (!st.masterDev) { box.appendChild(card('ТЕЛЕФОНЫ', h('p', { class: 'hint', text: 'Список виден на мастерском телефоне (вкладка «СЕТЬ» → галочка «Этот телефон — мастерский»).' }))); return; }
    var peers = peerList(), phones = peers.filter(function (p) { return p.role !== 'terminal'; });
    var bad = phones.filter(function (p) { var c = P.packCmp(p.pack); return c === 'old' || c === 'other'; });
    var low = phones.filter(function (p) { return p.online && p.bat && p.bat.l >= 0 && p.bat.l < 20 && !p.bat.c; });
    var warn = [];
    if (bad.length) warn.push('⚠ Старый или другой пакет: ' + bad.map(function (p) { return accName(p.acc) || p.name || p.dev; }).join(', ') + ' — загрузите «' + (g.title || '') + '» v' + g.version + '.');
    if (low.length) warn.push('⚠ Заряд меньше 20 %: ' + low.map(function (p) { return accName(p.acc); }).join(', ') + '.');
    var off = phones.filter(function (p) { return !p.online && p.acc; });
    if (off.length) warn.push('○ Нет связи: ' + off.map(function (p) { return accName(p.acc) + ' (' + ago(p.last) + ')'; }).join(', ') + '.');
    box.appendChild(card('ТЕЛЕФОНЫ · ' + netCount(peers) + ' · пакет мастера: «' + (g.title || '') + '» v' + g.version,
      warn.length ? h('div', { class: 'ph-warn' }, warn.map(function (t) { return h('p', { class: 'warn', text: t }); })) : h('p', { class: 'hint', text: phones.length ? 'Все телефоны с этим пакетом.' : 'Пока никого.' }),
      h('div', { class: 'phones' }, peers.map(function (p) {
        var cmp = P.packCmp(p.pack), v = p.voice || {}, hd = p.heard || (v.at ? { text: v.last, what: v.what, at: v.at } : null);
        var who = (p.dev === st.dev ? 'ЭТОТ ТЕЛЕФОН · ' : '') + (p.role === 'terminal' ? 'ТЕРМИНАЛ' : p.role === 'master' ? 'МАСТЕР' + (p.acc ? ' · ' + accName(p.acc) : p.name ? ' · ' + p.name : '') : accName(p.acc) || 'без персонажа');
        var pack = p.role === 'terminal' ? '' : p.pack ? 'пакет v' + p.pack.v + (cmp === 'old' ? ' — СТАРЫЙ' : cmp === 'other' ? ' — ДРУГОЙ («' + p.pack.t + '»)' : cmp === 'new' ? ' — новее, чем у мастера' : '') : 'пакет: не сообщил (старое приложение)';
        var bat = p.bat && p.bat.l >= 0 ? '🔋 ' + p.bat.l + ' %' + (p.bat.c ? ' ⚡' : '') : '';
        var vm = p.vmode || v.mode;
        var voice = vm && vm !== 'off' ? 'голос: ' + (VMODES[vm] || vm) + (p.voice ? (v.on ? ' · 🎙 слушает' : ' · 🎙 не слушает' + (v.err ? ' (' + v.err + ')' : '')) + (v.free ? ' · свободное' : '') : '') : vm === 'off' ? 'голос: выкл' : '';
        return h('div', { class: 'phone-row' + (p.online ? ' on' : '') + (cmp === 'old' || cmp === 'other' ? ' bad' : ''), 'data-dev': p.dev },
          h('div', { class: 'pr1' }, h('b', { text: (p.online ? '● ' : '○ ') + who }), h('span', { class: 'sm', text: [pack, bat].filter(Boolean).join(' · ') })),
          h('div', { class: 'pr2 sm', text: [voice, 'связь: ' + (p.online ? ago(p.last) : 'нет, ' + ago(p.last)), p.apk || p.ver ? 'прил. ' + (p.apk || p.ver) : ''].filter(Boolean).join(' · ') }),
          hd && hd.text ? h('div', { class: 'pr3 sm', text: 'последнее: «' + hd.text + '» → ' + (hd.what || '—') + ' · ' + ago(hd.at) }) : null);
      }))));
    // проба голоса
    var pr = Net.state.probe || {};
    var freeC = h('input', { type: 'checkbox', checked: !!pr.free });
    freeC.addEventListener('change', function () { if (pr.on && need()) { Net.set('probe', { on: true, free: freeC.checked, at: Net.now() }); setTimeout(render, 300); } });
    var flt = sel([['', 'все телефоны']].concat(phones.filter(function (p) { return p.acc; }).map(function (p) { return [p.dev, accName(p.acc)]; })), heardFilter);
    flt.addEventListener('change', function () { heardFilter = flt.value; render(); });
    var lines = heardLog.filter(function (o) { return !heardFilter || o.dev === heardFilter; }).slice(-120).reverse();
    var area = h('div', { class: 'heard-log' }, lines.length ? lines.map(function (o) {
      return h('div', { class: 'hl' + (/^сработала/.test(o.what || '') ? ' hit' : '') }, h('span', { class: 'sm', text: hhmmss(o.at) + ' ' + (accName(o.acc) || o.name || o.dev) + (o.free ? ' · своб.' : '') + ': ' }),
        '«' + (o.text || '') + '» → ' + (o.what || '—') + (o.conf != null && o.conf !== 1 ? ' (' + Math.round(o.conf * 100) + ' %)' : ''));
    }) : h('p', { class: 'hint', text: pr.on ? 'Говорите рядом с телефонами — здесь появится всё, что они распознали.' : 'Проба выключена.' }));
    box.appendChild(card('ПРОБА ГОЛОСА' + (pr.on ? ' — ИДЁТ' : ''),
      h('p', { class: 'hint', text: 'Все телефоны с голосом присылают сюда всё, что распознали (и не-фразы: «не разобрано», «не фраза»). Так видно, какие пароли и какой длины ещё узнаются. Коды при этом срабатывают как обычно.' }),
      h('label', { class: 'field chk' }, freeC, 'Свободное распознавание (весь текст, а не только фразы кодов; ошибается чаще)'),
      h('div', { class: 'row2' },
        btn(pr.on ? 'Остановить пробу' : 'Начать пробу', function () {
          if (!need()) return;
          Net.set('probe', pr.on ? null : { on: true, free: freeC.checked, at: Net.now() });
          setTimeout(render, 300);
        }, pr.on ? 'dim' : ''),
        btn('Очистить', function () { heardLog = []; render(); }, 'dim')),
      h('label', { class: 'field' }, 'Показывать', flt),
      area));
    // П25 (06, 146): кто кого слушает (шпионаж текстом) — и прервать
    if (P.spyCard) { var sc = P.spyCard(card, h, btn, need); if (sc) box.appendChild(sc); }
  }

  /* ---------- ИГРА ---------- */
  var form = { cto: [], color: '', notice: '', title: '', text: '', to: [], glitch: '', gto: [], cd: 10, cdTitle: '', vote: '', alarm: '', term: '', termv: '' };
  function pGame(box) {
    var g = P.game;
    // глава для всех
    var ch = sel(g.chapters.map(function (c, i) { return [i + 1, c.name]; }), (Net.state.chapter && Net.state.chapter.n) || P.state.chapter);
    box.appendChild(card('ГЛАВА ДЛЯ ВСЕХ', h('label', { class: 'field' }, 'Глава', ch),
      btn('Перевести все телефоны', function () {
        if (!need()) return;
        var n = +ch.value;
        P.dialog({ title: 'ГЛАВА ДЛЯ ВСЕХ?', text: 'Все телефоны перейдут в «' + g.chapters[n - 1].name + '» (и назад тоже).', buttons: [
          { label: 'Да', fn: function () { Net.set('chapter', { n: n, at: Net.now(), force: true }); done(); } }, { label: 'Отмена', cls: 'dim' }] });
      }),
      h('p', { class: 'hint', text: 'Запасной путь — QR перехода с терминала: он меняет главу только на отсканировавшем телефоне.' })));

    // авария
    var al = Net.state.alarm && Net.state.alarm.on ? Net.state.alarm : null;
    var as = sel([['', 'общий (все эффекты)']].concat(g.alarms.map(function (a) { return [a.id, a.name]; })), form.alarm);
    as.addEventListener('change', function () { form.alarm = as.value; });
    box.appendChild(card('АВАРИЙНЫЙ РЕЖИМ' + (al ? ' — ВКЛЮЧЁН' : ''),
      h('label', { class: 'field' }, 'Режим', as),
      h('div', { class: 'row2' },
        btn('ВКЛЮЧИТЬ', function () { if (!need()) return; P.doActions([{ type: 'alarm', alarm: form.alarm, on: true }]); done('АВАРИЯ ВКЛЮЧЕНА'); }, 'warn'),
        btn('ВЫКЛЮЧИТЬ', function () { if (!need()) return; P.doActions([{ type: 'alarm', on: false }]); done('АВАРИЯ ВЫКЛЮЧЕНА'); }))));

    // цвет интерфейса (П-53): предложить выбрать или поставить мастеру
    var cs = sel([['', 'цвет по умолчанию (из редактора)']].concat(g.palette.map(function (c) { return [c.id, c.name]; })), form.color);
    cs.addEventListener('change', function () { form.color = cs.value; });
    box.appendChild(card('ЦВЕТ ИНТЕРФЕЙСА', h('div', { class: 'field', text: 'Кому' }), whoPicker(form.cto),
      btn('Предложить сменить цвет', function () { if (!need()) return; Net.msg(to(form.cto), 'color', { offer: true }); done('ПРЕДЛОЖЕНО'); }),
      h('div', { class: 'row2' },
        btn('◐ Разрешить', function () { if (!need()) return; Net.msg(to(form.cto), 'color', { any: true }); done('ВКЛЮЧЕНО'); }, 'dim'),
        btn('◐ Запретить', function () { if (!need()) return; Net.msg(to(form.cto), 'color', { any: false }); done('ВЫКЛЮЧЕНО'); }, 'dim')),
      h('label', { class: 'field' }, 'Или поставить цвет', cs),
      btn('Поставить', function () { if (!need()) return; Net.msg(to(form.cto), 'color', { set: form.color }); done('ЦВЕТ ПОСТАВЛЕН'); }, 'dim'),
      h('p', { class: 'hint', text: 'Игрок видит «Хотите сменить цвет?» — «Да» / «Нет» и выбирает из цветов, разрешённых в главе. «◐ Разрешить» — игрок меняет цвет в любое время кнопкой ◐ в шапке, до конца главы. Цвет главы для всех (редактор) перебивает всё.' })));

    // уведомление
    var ns = sel([['', '— свой текст —']].concat(g.notices.map(function (n) { return [n.id, n.name || n.title]; })), form.notice);
    var ti = h('input', { type: 'text', class: 'cin', value: form.title, placeholder: 'Заголовок' });
    var tx = h('textarea', { class: 'cin', rows: 3, value: form.text, placeholder: 'Текст' });
    ns.addEventListener('change', function () { form.notice = ns.value; var n = SG.byId(g.notices, ns.value); if (n) { ti.value = form.title = n.title; tx.value = form.text = n.text; } });
    ti.addEventListener('input', function () { form.title = ti.value; });
    tx.addEventListener('input', function () { form.text = tx.value; });
    // П20 (основа 4, Т18-3 А): «в бегущую строку» — N проходов (0 — пока не уберут); шаблон несёт картинку, звук и настройки события
    var tkc = h('input', { type: 'checkbox', id: 'cn-ticker' });
    tkc.checked = !!form.tk;
    tkc.addEventListener('change', function () { form.tk = tkc.checked; });
    var tkn = h('input', { type: 'number', class: 'cin', id: 'cn-repeat', min: 0, max: 99, value: form.tkn || '', placeholder: '0 — пока не уберут' });
    tkn.addEventListener('input', function () { form.tkn = Math.max(0, Math.min(99, Math.round(+tkn.value) || 0)); });
    box.appendChild(card('УВЕДОМЛЕНИЕ', h('label', { class: 'field' }, 'Шаблон', ns), ti, tx, h('div', { class: 'field', text: 'Кому' }), whoPicker(form.to),
      h('label', { class: 'field chk' }, tkc, ' В бегущую строку'), h('label', { class: 'field' }, 'Проходов строки', tkn),
      h('div', { class: 'row2' },
        btn('Отправить', function () {
          if (!need() || !(form.title || form.text)) return;
          var body = { title: form.title, text: form.text }, n = SG.byId(g.notices, form.notice);
          if (n) { SG.EVENT_KEYS.forEach(function (k) { body[k] = n[k]; }); body.ev = n.id; }
          if (form.tk) { body.ticker = true; body.repeat = form.tkn || 0; if (!body.ev) body.ev = 'p' + Date.now().toString(36); }
          Net.msg(to(form.to), 'notify', body);
          done();
        }),
        btn('Убрать строку', function () { if (!need()) return; Net.msg(to(form.to), 'unticker', { ev: '' }); done('УБРАНО'); }, 'dim'))));

    // сбой
    if (g.glitches.length) {
      var gs = sel(g.glitches.map(function (x) { return [x.id, (x.state ? 'состояние: ' : 'сбой: ') + x.name]; }), form.glitch || g.glitches[0].id);
      gs.addEventListener('change', function () { form.glitch = gs.value; });
      box.appendChild(card('СБОЙ / СОСТОЯНИЕ', h('label', { class: 'field' }, 'Что', gs), h('div', { class: 'field', text: 'Кому' }), whoPicker(form.gto),
        h('div', { class: 'row2' },
          btn('Запустить', function () { if (!need()) return; Net.msg(to(form.gto), 'glitch', { id: gs.value }); done(); }),
          btn('Снять', function () { if (!need()) return; Net.msg(to(form.gto), 'fix', { id: gs.value }); done('СНЯТО'); }, 'dim'))));
    }

    // отсчёт
    var cd = Net.state.countdown && Net.state.countdown.on ? Net.state.countdown : null;
    var cm = h('input', { type: 'number', class: 'cin', value: form.cd, min: 1 });
    var ct = h('input', { type: 'text', class: 'cin', value: form.cdTitle, placeholder: 'Надпись, например: ДО ОТКАЗА РЕАКТОРА' });
    cm.addEventListener('input', function () { form.cd = +cm.value || 1; });
    ct.addEventListener('input', function () { form.cdTitle = ct.value; });
    box.appendChild(card('ОБРАТНЫЙ ОТСЧЁТ' + (cd ? ' — ИДЁТ' : ''), h('label', { class: 'field' }, 'Минут', cm), ct,
      h('div', { class: 'row2' },
        btn('Запустить', function () { if (!need()) return; P.doActions([{ type: 'countdown', seconds: form.cd * 60, title: form.cdTitle, on: true }]); done(); }),
        btn('Остановить', function () { if (!need()) return; P.doActions([{ type: 'countdown', on: false }]); done('ОСТАНОВЛЕН'); }, 'dim'))));

    // голосование
    var v = Net.state.vote;
    var vs = sel(g.votes.map(function (x) { return [x.id, x.name]; }), form.vote);
    vs.addEventListener('change', function () { form.vote = vs.value; });
    var res = v ? h('div', { class: 'tally' }, h('p', { text: (v.on ? 'ИДЁТ: ' : 'ПОСЛЕДНЕЕ: ') + (v.title || '') }),
      P.tally(v).map(function (n, i) { return h('div', { text: v.options[i] + ': ' + n }); })) : null;
    box.appendChild(card('ГОЛОСОВАНИЕ', g.votes.length ? [h('label', { class: 'field' }, 'Какое', vs),
      btn('Начать сейчас', function () { if (!need()) return; P.doActions([{ type: 'vote', vote: vs.value || g.votes[0].id }]); done('НАЧАТО'); })] :
      h('p', { class: 'hint', text: 'Голосования задаются в редакторе (вкладка «Сеть и события»).' }), res));

    // П13 (Т4-3): общие переменные терминала и телефонов
    if ((g.shared || []).some(function (v) { return !v.personal; })) {
      var vals = SG.sharedValues(g, varsNow());
      box.appendChild(card('ОБЩИЕ ПЕРЕМЕННЫЕ', g.shared.filter(function (v) { return !v.personal; }).map(function (v) {
        var inp = h('input', { type: 'text', class: 'cin', value: String(vals[v.name]), 'data-var': v.name });
        var isNum = typeof v.value === 'number';
        return h('div', { class: 'shared-var' },
          h('div', { text: (v.label || v.name) + ' ($' + v.name + '): ' + fmtVar(vals[v.name]) }),
          h('div', { class: 'row2' }, inp,
            btn('Записать', function () { if (!need()) return; P.doActions([{ type: 'term', name: v.name, value: SG.termValue(inp.value) }]); done(); }, 'dim')),
          isNum ? h('div', { class: 'row2' },
            btn('−1', function () { if (!need()) return; P.doActions([{ type: 'term', name: v.name, op: 'add', value: -1 }]); done(); }, 'dim'),
            btn('+1', function () { if (!need()) return; P.doActions([{ type: 'term', name: v.name, op: 'add', value: 1 }]); done(); }, 'dim')) : null);
      }), h('p', { class: 'hint', text: 'Видят и меняют терминал, коды телефонов и пульт. В текстах блоков, ответов и уведомлений — {{имя}}. Правила «общая переменная» — в редакторе («Сеть и события» → «Правила»).' })));
    }

    // П20 (Т17-1 А): личные переменные — таблица «персонаж × переменная» (значение у центра, Т17-2 А: и у тех, кто не в сети),
    // окна «за N мин» — в той же ячейке; «выбранным» −1 / +1 / записать; журнал последних 50 изменений (Т17-3 Б)
    var pvs = (g.shared || []).filter(function (v) { return v.personal; });
    if (pvs.length) box.appendChild(personalCard(g, pvs));

    // автоматика и терминал
    var auto = Net.state.auto !== false;
    var tn = h('input', { type: 'text', class: 'cin term-name', value: form.term, placeholder: 'переменная' });
    var tv = h('input', { type: 'text', class: 'cin', value: form.termv, placeholder: 'значение' });
    tn.addEventListener('input', function () { form.term = tn.value; });
    tv.addEventListener('input', function () { form.termv = tv.value; });
    box.appendChild(card('АВТОМАТИКА И ТЕРМИНАЛ',
      h('p', { text: 'Правила, таймеры и повторы (голосования) — ' + (auto ? 'РАБОТАЮТ' : 'ВЫКЛЮЧЕНЫ') }),
      h('div', { class: 'row2' },
        btn(auto ? 'Выключить автоматику' : 'Включить автоматику', function () { if (!need()) return; Net.set('auto', !auto); setTimeout(render, 300); }, auto ? 'dim' : ''),
        btn('Отправить правила заново', function () { if (!need()) return; Net.send({ t: 'rules', ver: 'manual-' + Date.now(), list: SG.centerRules(g) }); done(); }, 'dim')),
      h('div', { class: 'row2' }, tn, tv),
      btn('Записать в терминал', function () { if (!need() || !form.term) return; P.doActions([{ type: 'term', name: form.term.replace(/^\$/, ''), value: SG.termValue(form.termv) }]); done(); }, 'dim'),
      h('p', { class: 'hint', text: 'Терминал (Twine СИГНАЛЫ, движок 28+) запишет переменную сразу; без связи — когда подключится. Число пишется числом, «да»/«нет» (true/false) — включено/выключено, остальное — текстом.' })));
    // П25 (06, 147): мини-игры — запустить выбранным
    if (P.gamesCard) { var gc = P.gamesCard(card, h, btn, need, sel); if (gc) box.appendChild(gc); }

    box.appendChild(card('СБРОС ЦЕНТРА',
      h('p', { class: 'hint', text: 'Перед новой игрой: стирает переписку, общее состояние, счёт выдач (ящики, ампулы) и голоса. Правила останутся.' }),
      btn('Сбросить центр', function () {
        if (!need()) return;
        P.dialog({ title: 'СБРОСИТЬ ЦЕНТР?', warn: true, text: 'Переписка, состояние и счёт выдач будут стёрты на центре.', buttons: [
          { label: 'Сбросить', cls: 'warn', fn: function () { Net.send({ t: 'admin', op: 'reset' }); done('ЦЕНТР СБРОШЕН'); } }, { label: 'Отмена', cls: 'dim' }] });
      }, 'warn')));
  }

  /* ---------- ПЕРЕПИСКА ---------- */
  // П-40: мастер пишет от имени «Руководителя» (по умолчанию), «Системы» или любого персонажа; можно отложить (П-43)
  var sysTo = [], asWho = '@boss', inMin = 0, draft = '';
  function chatCfg() { return P.game.chat || SG.DEFAULT_CHAT; }
  function pLog(box) {
    var g = P.game;
    var tx = h('textarea', { class: 'cin', rows: 2, value: draft, placeholder: 'Текст сообщения' });
    tx.addEventListener('input', function () { draft = tx.value; });
    var ws = sel([['@boss', chatCfg().master + ' (мастер)'], ['@sys', 'Система (канал «СИСТЕМА»)']].concat(g.accounts.map(function (a) { return [a.id, a.name || '?']; }))
      .concat([['@anon', chatCfg().anon + ' (анонимно)']]), asWho);
    ws.id = 'clog-as';
    ws.addEventListener('change', function () { asWho = ws.value; });
    var mi = h('input', { type: 'number', class: 'cin', id: 'clog-min', min: 0, max: 240, value: inMin || '', placeholder: '0 — сразу' });
    mi.addEventListener('input', function () { inMin = Math.max(0, Math.min(240, Math.round(+mi.value) || 0)); });
    tx.id = 'clog-text';
    box.appendChild(card('СООБЩЕНИЕ', h('label', { class: 'field' }, 'От имени', ws), tx,
      h('div', { class: 'field', text: 'Кому (личное) — или никого: в общий канал' }), whoPicker(sysTo),
      h('label', { class: 'field' }, 'Отправить через, минут', mi),
      h('button', { class: 'btn', id: 'clog-send', text: 'Отправить', on: { click: function () {
        if (!need() || !tx.value.trim()) return;
        var body = { text: tx.value.trim() };
        if (asWho === '@sys') body.sys = true;
        else if (asWho === '@anon') body.anon = true;
        else {
          body.as = { acc: asWho, name: accName(asWho) };
          var col = P.sendHex(asWho);   // закреплённый цвет персонажа виден и в сообщениях «от его имени» (П-51)
          if (col) body.color = col;
        }
        Net.msg(to(sysTo), 'chat', body, inMin ? { at: Net.now() + inMin * 60000 } : null);
        tx.value = draft = '';
        done(inMin ? 'ОТПРАВИТСЯ ЧЕРЕЗ ' + inMin + ' МИН' : null);
        setTimeout(render, 400);
      } } }),
      h('p', { class: 'hint', text: 'Меняется только имя отправителя: в чужой аккаунт входить не нужно. «Система» — в канал «СИСТЕМА».' })));

    // отложенные сообщения на центре: мастер может удалить
    var later = (Net.later || []).slice().sort(function (a, b) { return a.at - b.at; });
    box.appendChild(card('ОТЛОЖЕННЫЕ (' + later.length + ')', h('div', { id: 'clog-later' }, later.length ? later.map(function (x) {
      var b = x.body || {}, f = x.from || {};
      var who = f.role === 'master' ? (b.sys ? 'Система' : b.as ? b.as.name : 'мастер') + ' (мастер)' : accName(f.acc) + (b.anon ? ' (анонимно)' : '');
      var d = new Date(x.at - Net.offset);
      return h('div', { class: 'cl' },
        h('div', { class: 'sm', text: '⏱ ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' · ' + who + ' → ' + dest(x.to) }),
        h('div', { text: b.text || '' }),
        btn('Удалить', function () {
          P.dialog({ title: 'УДАЛИТЬ СООБЩЕНИЕ?', text: 'Оно не будет отправлено. У отправителя оно пропадёт из чата.', buttons: [
            { label: 'Удалить', cls: 'warn', fn: function () { Net.send({ t: 'admin', op: 'drop', id: x.id }); done('УДАЛЕНО'); } }, { label: 'Отмена', cls: 'dim' }] });
        }, 'dim'));
    }) : h('p', { class: 'hint', text: P.state.masterDev ? 'Нет.' : 'Список виден на мастерском телефоне.' }))));
    if (!P.state.masterDev) box.appendChild(h('p', { class: 'hint', text: 'Чужую переписку видит только мастерский телефон (вкладка «СЕТЬ»).' }));
    var list = h('div', { class: 'clog' });
    log.slice().reverse().forEach(function (o) {
      var b = o.body || {}, f = o.from || {};
      var who = f.role === 'center' ? 'ЦЕНТР' : f.role === 'terminal' ? 'ТЕРМИНАЛ' :
        f.role === 'master' && !f.acc ? (b.sys ? 'СИСТЕМА' : b.as ? b.as.name : 'МАСТЕР') + ' (мастер)' :
        f.role === 'master' && b.as ? b.as.name + ' (мастер)' : accName(f.acc) + (b.anon ? ' (анонимно)' : '');
      var d = new Date((o.at || Date.now()) - Net.offset);
      var text = o.kind === 'chat' ? (b.photo ? '[снимок] ' : '') + (b.text || '') : o.kind === 'notify' ? '[уведомление] ' + [b.title, b.text].filter(Boolean).join(': ') :
        o.kind === 'event' ? '[событие] ' + b.name : o.kind === 'report' ? '[ЗАМЕТКА ТЕСТИРОВЩИКА] ' + ((b.report || {}).name || '') + ' · ' + ((b.report || {}).build || '') + '\n' + (b.text || '') :
        '[итог голосования] ' + (b.id || '');
      list.appendChild(h('div', { class: 'cl' }, h('div', { class: 'sm', text: ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' · ' + who + ' → ' + dest(o.to) }),
        h('div', { text: text })));
    });
    if (!log.length) list.appendChild(h('p', { class: 'hint', text: 'Сообщений пока нет.' }));
    box.appendChild(list);
  }
})();
