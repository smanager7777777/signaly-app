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
    if (o.kind === 'chat' || o.kind === 'notify' || o.kind === 'vote-close' || o.kind === 'event') {
      log.push(o);
      if (log.length > 500) log.shift();
      if (tab === 'log' && $('console').classList.contains('on')) render();
    }
  });
  P.on('net', function () { if ($('console').classList.contains('on')) { dot(); if (tab === 'net') render(); } });
  Net.on('later', function () { if ($('console').classList.contains('on') && tab === 'log' && !typing()) render(); });
  Net.on('peers', function () { if ($('console').classList.contains('on') && tab === 'net') { render(); refreshCenter(); } });
  Net.on('link', function () { if ($('console').classList.contains('on') && tab === 'net' && !typing()) render(); });
  // счёт «подключено» и проверка сети обновляются сами, пока открыта вкладка СЕТЬ (раньше застывал на 0)
  setInterval(function () { if ($('console').classList.contains('on') && tab === 'net') refreshCenter(); }, 3000);
  function typing() { var a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && $('console').contains(a); }
  function dot() { var d = $('console-net'); d.classList.toggle('up', Net.up); d.textContent = Net.up ? '● СВЯЗЬ' : Net.url ? '○ НЕТ СВЯЗИ' : '○ НЕТ СЕТИ'; }

  function render() {
    dot();
    var tabs = $('console-tabs');
    tabs.innerHTML = '';
    [['net', 'СЕТЬ'], ['game', 'ИГРА'], ['log', 'ПЕРЕПИСКА']].forEach(function (t) {
      tabs.appendChild(h('button', { class: tab === t[0] ? 'on' : '', text: t[1], on: { click: function () { tab = t[0]; render(); } } }));
    });
    var body = $('console-body');
    var keep = body.scrollTop;
    body.innerHTML = '';
    ({ net: pNet, game: pGame, log: pLog })[tab](body);
    body.scrollTop = keep;
  }

  /* ---------- СЕТЬ ---------- */
  function refreshCenter() {
    if (!plugin) return;
    plugin.status().then(function (s) {
      var was = center ? [center.center, center.online, center.vpn, (center.ips || []).join()].join('|') : '';
      center = s;
      var now = [s.center, s.online, s.vpn, (s.ips || []).join()].join('|');
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
    var peers = (Net.peers || []).slice().sort(function (a, b) { return (b.online ? 1 : 0) - (a.online ? 1 : 0); });
    box.appendChild(card('ТЕЛЕФОНЫ В СЕТИ (' + peers.filter(function (p) { return p.online; }).length + ' из ' + peers.length + ')',
      st.masterDev ? (peers.length ? h('div', { class: 'peers' }, peers.map(function (p) {
        var ago = p.online ? '' : ' · ' + Math.round((Net.now() - p.last) / 60000) + ' мин назад';
        return h('div', { class: 'peer' + (p.online ? ' on' : '') }, h('span', { text: (p.online ? '● ' : '○ ') + (p.role === 'terminal' ? 'ТЕРМИНАЛ' : p.role === 'master' ? 'МАСТЕР' : accName(p.acc)) }),
          h('span', { class: 'sm', text: (p.name && p.role !== 'phone' ? p.name : '') + ago }));
      })) : h('p', { class: 'hint', text: 'Пока никого.' })) : h('p', { class: 'hint', text: 'Список виден на мастерском телефоне (галочка выше).' })));
  }

  /* ---------- ИГРА ---------- */
  var form = { notice: '', title: '', text: '', to: [], glitch: '', gto: [], cd: 10, cdTitle: '', vote: '', alarm: '', term: '', termv: '' };
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

    // уведомление
    var ns = sel([['', '— свой текст —']].concat(g.notices.map(function (n) { return [n.id, n.name || n.title]; })), form.notice);
    var ti = h('input', { type: 'text', class: 'cin', value: form.title, placeholder: 'Заголовок' });
    var tx = h('textarea', { class: 'cin', rows: 3, value: form.text, placeholder: 'Текст' });
    ns.addEventListener('change', function () { form.notice = ns.value; var n = SG.byId(g.notices, ns.value); if (n) { ti.value = form.title = n.title; tx.value = form.text = n.text; } });
    ti.addEventListener('input', function () { form.title = ti.value; });
    tx.addEventListener('input', function () { form.text = tx.value; });
    box.appendChild(card('УВЕДОМЛЕНИЕ', h('label', { class: 'field' }, 'Шаблон', ns), ti, tx, h('div', { class: 'field', text: 'Кому' }), whoPicker(form.to),
      btn('Отправить', function () {
        if (!need() || !(form.title || form.text)) return;
        Net.msg(to(form.to), 'notify', { title: form.title, text: form.text });
        done();
      })));

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

    // автоматика и терминал
    var auto = Net.state.auto !== false;
    var tn = h('input', { type: 'text', class: 'cin', value: form.term, placeholder: 'переменная' });
    var tv = h('input', { type: 'text', class: 'cin', value: form.termv, placeholder: 'значение' });
    tn.addEventListener('input', function () { form.term = tn.value; });
    tv.addEventListener('input', function () { form.termv = tv.value; });
    box.appendChild(card('АВТОМАТИКА И ТЕРМИНАЛ',
      h('p', { text: 'Правила, таймеры и повторы (голосования) — ' + (auto ? 'РАБОТАЮТ' : 'ВЫКЛЮЧЕНЫ') }),
      h('div', { class: 'row2' },
        btn(auto ? 'Выключить автоматику' : 'Включить автоматику', function () { if (!need()) return; Net.set('auto', !auto); setTimeout(render, 300); }, auto ? 'dim' : ''),
        btn('Отправить правила заново', function () { if (!need()) return; Net.send({ t: 'rules', ver: 'manual-' + Date.now(), list: SG.centerRules(g) }); done(); }, 'dim')),
      h('div', { class: 'row2' }, tn, tv),
      btn('Записать в терминал', function () { if (!need() || !form.term) return; P.doActions([{ type: 'term', name: form.term, value: form.termv }]); done(); }, 'dim'),
      h('p', { class: 'hint', text: 'Терминал получит переменную, когда в движке будет сетевой модуль.' })));

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
        else body.as = { acc: asWho, name: accName(asWho) };
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
        o.kind === 'event' ? '[событие] ' + b.name : '[итог голосования] ' + (b.id || '');
      list.appendChild(h('div', { class: 'cl' }, h('div', { class: 'sm', text: ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' · ' + who + ' → ' + dest(o.to) }),
        h('div', { text: text })));
    });
    if (!log.length) list.appendChild(h('p', { class: 'hint', text: 'Сообщений пока нет.' }));
    box.appendChild(list);
  }
})();
