/* СИГНАЛЫ — приложение игрока. Нужны JSZip, jsQR, logic.js (window.SG). */
(function () {
  'use strict';
  var SG = window.SG;
  var $ = function (id) { return document.getElementById(id); };
  var preview = /[#&]preview\b/.test(location.hash) || window.name === 'sg-preview';

  var game = null;      // game.json
  var urls = {};        // имя файла → object URL
  var state = null;     // {account, chapter, chapterAt, dev, masterDev, net: {url, epoch, seq}, byAccount: {id: {...}}}
  var Net = window.SGNet;
  /* Общее для остальных файлов приложения (feat.js, chat.js, apps.js, master.js). */
  var P = window.SGP = { hooks: {} };
  function hook(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    (P.hooks[name] || []).forEach(function (fn) { try { fn.apply(null, args); } catch (e) { console.error(e); } });
  }
  P.on = function (name, fn) { (P.hooks[name] = P.hooks[name] || []).push(fn); };

  /* ---------- хранилище (IndexedDB; в предпросмотре — память) ---------- */
  var DB = 'signaly-player';
  var mem = {};
  function db() {
    return new Promise(function (ok, fail) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { fail(r.error); };
    });
  }
  function get(key) {
    if (preview) return Promise.resolve(mem[key]);
    return db().then(function (d) {
      return new Promise(function (ok, fail) {
        var q = d.transaction('kv').objectStore('kv').get(key);
        q.onsuccess = function () { ok(q.result); };
        q.onerror = function () { fail(q.error); };
      });
    });
  }
  function put(key, value) {
    if (preview) { mem[key] = value; return Promise.resolve(); }
    return db().then(function (d) {
      return new Promise(function (ok, fail) {
        var t = d.transaction('kv', 'readwrite');
        t.objectStore('kv').put(value, key);
        t.oncomplete = function () { ok(); };
        t.onerror = function () { fail(t.error); };
      });
    });
  }
  function save() { return put('state', state); }

  function acc() { return state.account ? SG.byId(game.accounts, state.account) : null; }
  function mine() {
    var id = state.account;
    if (!state.byAccount[id]) state.byAccount[id] = { unlocked: [], seen: [] };
    var m = state.byAccount[id];
    ['counts', 'mods', 'appUses', 'chatSeen', 'pendingSign'].forEach(function (k) { if (!m[k] || typeof m[k] !== 'object') m[k] = {}; });
    ['apps', 'chat', 'notes', 'photos', 'received'].forEach(function (k) { if (!Array.isArray(m[k])) m[k] = []; });
    return m;
  }
  function flatState() {
    var m = state.account ? mine() : { unlocked: [], received: [] };
    return { account: state.account, chapter: state.chapter, unlocked: m.unlocked, received: m.received, vars: state.vars || {} };
  }
  function fresh() { return { account: null, chapter: 1, byAccount: {}, dev: SG.uid('d'), masterDev: false, net: null }; }
  /* «Сбросить прогресс этого телефона»: стираются аккаунт, глава и данные. Остаются номер телефона,
     адрес центра и отметка «до какого сообщения уже видели» (epoch + seq): иначе центр при входе
     в сеть присылает всю старую переписку и уведомления заново (замечание автора, build-26/36). */
  function resetPhone() {
    var old = state || {}, n = old.net || null;
    var seq = Math.max(n && n.seq || 0, Net.epoch && n && Net.epoch === n.epoch ? Net.seq : 0);
    Net.stop();
    state = fresh();
    if (old.dev) state.dev = old.dev;
    if (old.voiceAt) state.voiceAt = old.voiceAt;
    if (n && n.url) state.net = { url: n.url, epoch: n.epoch || Net.epoch || null, seq: seq };
    folder = [];
    save();
    route();
    startNet();
  }
  P.resetPhone = resetPhone;

  /* ---------- пакет ---------- */
  function usePack(data) {
    return SG.readPack(data).then(function (p) {
      Object.keys(urls).forEach(function (k) { URL.revokeObjectURL(urls[k]); });
      urls = {};
      Object.keys(p.files).forEach(function (k) { urls[k] = URL.createObjectURL(p.files[k]); });
      game = p.game;
      if (!state) state = fresh();
      if (!state.dev) state.dev = SG.uid('d');
      if (state.account && !acc()) state.account = null;
      if (state.chapter > game.chapters.length) state.chapter = game.chapters.length;
      // блоки, которых больше нет в пакете, убираем из открытых
      Object.keys(state.byAccount).forEach(function (id) {
        var m = state.byAccount[id];
        m.unlocked = m.unlocked.filter(function (b) { return SG.byId(game.blocks, b); });
      });
      document.title = game.title || 'СИГНАЛЫ';
    });
  }

  function loadFile(file) {
    return usePack(file).then(function () {
      return preview ? null : put('pack', file);
    }).then(function () { return save(); }).then(route)
      .catch(function (e) { alert('Не удалось открыть пакет: ' + e.message); });
  }

  /* ---------- оформление ---------- */
  function applyTheme() {
    // тема главы + цвет персонажа (П-50): look.js
    var t = P.themeNow ? P.themeNow() : (game.chapters[(state.chapter || 1) - 1] || game.chapters[0]).theme;
    $('sg-theme').textContent = SG.themeCss(t);
    document.body.classList.toggle('fx-scan', !!t.scanlines);
    document.body.classList.toggle('fx-glow', !!t.glow);
    document.body.classList.toggle('fx-flicker', !!t.flicker);
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = t.bg;
  }
  function glitch() {
    var g = $('glitch');
    g.classList.remove('on'); void g.offsetWidth; g.classList.add('on');
    clearTimeout(glitch.t);
    glitch.t = setTimeout(function () { g.classList.remove('on'); }, 1500);
    if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  }

  /* ---------- экраны ---------- */
  function show(id) {
    ['scr-boot', 'scr-login', 'scr-main'].forEach(function (s) { $(s).classList.toggle('on', s === id); });
  }
  function route() {
    stopScan();
    stopRadio();
    if (!game) { show('scr-boot'); return; }
    applyTheme();
    $('login-logo').textContent = game.title || 'СИГНАЛЫ';
    $('login-title').textContent = game.texts.loginTitle;
    $('login-net').textContent = Net.url ? (Net.up ? '● СЕТЬ: ' : '○ НЕТ СВЯЗИ: ') + (Net.url === Net.AUTO ? 'поиск центра' : Net.url.replace(/^ws:\/\//, '')) : '';
    hook('route');
    if (!acc()) { show('scr-login'); if (state.masterDev) hook('masterHome'); return; }
    show('scr-main');
    renderBar();
    renderData();
    renderModules();
  }
  /* Шапка (П14, Т4-6 Б): строки, глава, показатели общих переменных; нажатие — окно «сводка». */
  function renderBar() {
    var hd = SG.headerFor(game, flatState());
    $('bar-name').textContent = hd.title;
    $('bar-prof').textContent = hd.sub;
    $('bar-chap').textContent = hd.chapter;
    $('bar-chap').hidden = !hd.chapter;
    var box = $('bar-vars');
    box.innerHTML = '';
    hd.items.forEach(function (it) {
      var el = document.createElement('span');
      // П15: черточки (look bar), по ширине экрана (fit), перегрузка — первая горит со сбоем (over), ниже порога — тревога (low)
      el.className = 'hv' + (it.cells ? ' hv-cells' + (it.look === 'bar' ? ' hv-bar' : '') + (it.fit ? ' hv-fit' : '') + (it.over ? ' hv-over' : '') : '') + (it.low ? ' hv-low' : '');
      el.setAttribute('data-var', it.var);
      if (it.low && it.lowColor) el.style.setProperty('--low', it.lowColor);
      if (it.label) { var lb = document.createElement('b'); lb.textContent = it.label; el.appendChild(lb); }
      if (it.cells) {
        var cs = document.createElement('span');
        cs.className = 'cells';
        if (it.cells.length > 40) cs.className += ' dense';
        it.cells.forEach(function (on, i) { var c = document.createElement('i'); if (on) c.className = 'on' + (it.over && i === 0 ? ' ov' : ''); cs.appendChild(c); });
        el.appendChild(cs);
      } else {
        var v = document.createElement('span');
        v.className = 'v';
        v.textContent = it.text;
        el.appendChild(v);
      }
      box.appendChild(el);
    });
    box.hidden = !hd.items.length;
    $('bar').classList.toggle('tap', !!(hd.items.length || hd.info.length));
    renderNetDot();
  }
  P.headerInfo = function () {
    if (!acc()) return false;
    var hd = SG.headerFor(game, flatState());
    if (!hd.items.length && !hd.info.length) return false;
    var L = [];
    hd.items.forEach(function (it) {
      var cells = it.cells && it.cells.length <= 40 ? ' ' + it.cells.map(function (on) { return on ? '■' : '□'; }).join('') : '';
      L.push((it.label || it.name) + ': **' + it.text + '**' + cells + (it.over ? ' — ПЕРЕГРУЗКА' : '') + (it.low ? ' — НИЖЕ НОРМЫ' : ''));
    });
    hd.info.forEach(function (s) {
      if (L.length) L.push('');
      if (s.title) L.push('**' + s.title + '**');
      if (s.text) L.push(s.text);
    });
    P.sound('key');
    dialog({ title: hd.infoTitle, cls: 'hinfo', text: L.join('\n') });
    return true;
  };
  $('bar').addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#bar-net, #bar-voice, #bar-color, button')) return;
    P.headerInfo();
  });
  function renderNetDot() {
    var d = $('bar-net');
    d.hidden = !Net.url;
    d.classList.toggle('up', Net.up);
    d.textContent = Net.up ? '●' : '○';
    d.title = Net.up ? 'связь с центром есть' : 'нет связи с центром';
  }

  var icons = { text: '≡', image: '▣', audio: '♪' };
  function blockIcon(b) {
    var kinds = b.items.map(function (i) { return i.type; });
    if (kinds.indexOf('audio') >= 0) return icons.audio;
    if (kinds.indexOf('image') >= 0 && kinds.indexOf('text') < 0) return icons.image;
    return icons.text;
  }

  function itemButton(b, isNew) {
    var el = document.createElement('button');
    el.className = 'item';
    el.innerHTML = '<span class="ic">' + blockIcon(b) + '</span><span class="t">' + SG.esc(b.title || '—') + '</span>' +
      (isNew ? '<span class="new">НОВОЕ</span>' : '');
    el.addEventListener('click', function () { openBlock(b); });
    return el;
  }

  function renderData() {
    var box = $('tab-data');
    box.innerHTML = '';
    var a = acc();
    if (a.items.length) {
      var p = document.createElement('div');
      p.className = 'profile';
      p.innerHTML = '<div class="p-head"><span>МУЛЬТИПАСПОРТ</span><span>' + SG.esc(a.profession || '') + '</span></div>';
      p.appendChild(renderItems(a.items));
      box.appendChild(p);
    }
    var list = SG.visibleBlocks(game, flatState());
    var seen = mine().seen;
    // папка, в которой стоит игрок; если её больше нет (блоки закрыли) — поднимаемся выше
    while (folder.length && !SG.folderLevel(list, folder).length) folder.pop();
    if (folder.length) {
      var crumbs = document.createElement('div');
      crumbs.className = 'crumbs';
      var up = document.createElement('button');
      up.className = 'up';
      up.textContent = '‹';
      up.setAttribute('aria-label', 'Назад');
      up.addEventListener('click', folderUp);
      crumbs.appendChild(up);
      var path = document.createElement('div');
      path.className = 'path';
      ['ДАННЫЕ'].concat(folder).forEach(function (name, i) {
        var s = document.createElement('button');
        s.textContent = name;
        if (i === folder.length) s.className = 'cur';
        else s.addEventListener('click', function () { folder = folder.slice(0, i); renderData(); });
        path.appendChild(s);
        if (i < folder.length) path.appendChild(document.createTextNode(' / '));
      });
      crumbs.appendChild(path);
      box.appendChild(crumbs);
    }
    if (!list.length) {
      var e = document.createElement('p');
      e.className = 'empty';
      e.textContent = 'НЕТ ДОСТУПНЫХ ДАННЫХ';
      box.appendChild(e);
      return;
    }
    SG.folderLevel(list, folder).forEach(function (x) {
      if (x.block) { box.appendChild(itemButton(x.block, seen.indexOf(x.block.id) < 0)); return; }
      var fresh = x.blocks.filter(function (b) { return seen.indexOf(b.id) < 0; }).length;
      var el = document.createElement('button');
      el.className = 'item folder';
      el.innerHTML = '<span class="ic">▸</span><span class="t">' + SG.esc(x.folder) + '</span>' +
        '<span class="cnt">' + x.blocks.length + '</span>' + (fresh ? '<span class="new">НОВОЕ ' + fresh + '</span>' : '');
      el.addEventListener('click', function () { folder = x.path; renderData(); $('tab-data').scrollTop = 0; });
      box.appendChild(el);
    });
  }
  var folder = [];   // открытая папка на вкладке «Данные»
  function folderUp() {
    if (!folder.length) return false;
    folder = folder.slice(0, -1);
    renderData();
    return true;
  }

  function fmtTime(s) {
    if (!isFinite(s)) return '--:--';
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  var audios = [];
  function stopAudio() { audios.forEach(function (a) { a.pause(); }); audios = []; }

  function renderItems(items, block) {
    var frag = document.createElement('div');
    frag.className = 'rich';
    var garbled = block && block.garble && (state.chapter || 1) < block.garble;
    items.forEach(function (it, n) {
      if (it.type === 'text') {
        var d = document.createElement('div');
        d.innerHTML = SG.markup(garbled ? SG.garble(it.text, block.id + n) : fillVars(it.text));
        if (garbled) d.className = 'garbled';
        frag.appendChild(d);
      } else if (it.type === 'image' && urls[it.file]) {
        var f = document.createElement('figure');
        f.className = 'media-img';
        f.style.margin = '6px 0 16px';
        var img = document.createElement('img');
        img.src = urls[it.file];
        img.alt = it.caption || '';
        img.addEventListener('click', function () { zoom(img.src); });
        f.appendChild(img);
        if (it.caption) {
          var c = document.createElement('figcaption');
          c.textContent = it.caption;
          f.appendChild(c);
        }
        frag.appendChild(f);
      } else if (it.type === 'audio' && urls[it.file]) {
        frag.appendChild(audioPlayer(urls[it.file], it.title || it.file));
        if (hasModule('sstv') && P.decodeFile) {
          var rb = document.createElement('button');
          rb.className = 'btn dim small';
          rb.textContent = '◉ В ПРИЁМНИК СИГНАЛОВ';
          rb.addEventListener('click', function () { P.decodeFile(urls[it.file]); });
          frag.appendChild(rb);
        }
      }
    });
    return frag;
  }

  function audioPlayer(src, title) {
    var w = document.createElement('div');
    w.className = 'aud';
    w.innerHTML = '<div class="a-title"></div><div class="a-row"><button class="a-play">▶</button>' +
      '<div class="a-bar"><div class="a-fill"></div></div><span class="a-time">0:00 / --:--</span></div>';
    w.querySelector('.a-title').textContent = title;
    var a = new Audio(src);
    a.preload = 'metadata';
    var btn = w.querySelector('.a-play');
    var fill = w.querySelector('.a-fill');
    var time = w.querySelector('.a-time');
    function upd() {
      fill.style.width = (a.duration ? a.currentTime / a.duration * 100 : 0) + '%';
      time.textContent = fmtTime(a.currentTime) + ' / ' + fmtTime(a.duration);
      btn.textContent = a.paused ? '▶' : '❚❚';
    }
    ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended'].forEach(function (e) { a.addEventListener(e, upd); });
    btn.addEventListener('click', function () {
      if (a.paused) {
        audios.forEach(function (o) { if (o !== a) o.pause(); });
        a.play();
      } else a.pause();
    });
    w.querySelector('.a-bar').addEventListener('click', function (ev) {
      if (!a.duration) return;
      var r = ev.currentTarget.getBoundingClientRect();
      a.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * a.duration;
    });
    audios.push(a);
    return w;
  }

  /* ---------- окна поверх (кнопка «назад» Android закрывает верхнее) ---------- */
  var stack = [];
  /* Пока открыто хоть одно окно, в истории браузера есть одна запись: «назад» браузера закрывает верхнее окно.
     Само закрытие окна историю не трогает (иначе асинхронный history.back() закрывал соседние окна). */
  var armed = false;
  function pushLayer(id, onClose) {
    stack.push({ id: id, onClose: onClose });
    $(id).classList.add('on');
    if (!armed) { history.pushState({ sg: 1 }, ''); armed = true; }
  }
  function closeTop() {
    var top = stack.pop();
    if (!top) return;
    $(top.id).classList.remove('on');
    if (top.onClose) top.onClose();
  }
  window.addEventListener('popstate', function () {
    armed = false;
    if (!stack.length) return;
    closeTop();
    if (stack.length) { history.pushState({ sg: 1 }, ''); armed = true; }
  });
  var native = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (native) {
    // в приложении Android: «назад» закрывает окно поверх; на главном экране ничего не делает,
    // чтобы игрок случайно не вышел из игры
    native.addListener('backButton', function () {
      if (stack.length) closeTop();
      else if ($('tab-data').classList.contains('on')) folderUp();
    });
  }

  var openNow = null;
  function openBlock(b) {
    stopAudio();
    openNow = b;
    var m = mine();
    if (m.seen.indexOf(b.id) < 0) { m.seen.push(b.id); save(); }
    $('view-sec').textContent = SG.folderPath(b.section).join(' / ');
    var body = $('view-body');
    body.innerHTML = '<h2>' + SG.esc(b.title || '') + '</h2>';
    body.appendChild(renderItems(b.items, b));
    if (b.share && P.shareBlock) {
      var sh = document.createElement('button');
      sh.className = 'btn';
      sh.textContent = 'ПЕРЕДАТЬ ДРУГОМУ (QR)';
      sh.addEventListener('click', function () { P.shareBlock(b); });
      body.appendChild(sh);
    }
    body.scrollTop = 0;
    if ($('view').classList.contains('on')) return; // уже открыт (переход из окна)
    pushLayer('view', function () { stopAudio(); renderData(); });
  }
  $('view-back').addEventListener('click', function () { closeTop(); });

  function zoom(src) {
    $('zoom-img').src = src;
    $('zoom').classList.remove('big');
    pushLayer('zoom');
  }
  var lastTap = 0;
  $('zoom').addEventListener('click', function () {
    var now = Date.now();
    if (now - lastTap < 350) { $('zoom').classList.toggle('big'); lastTap = 0; }
    else lastTap = now;
  });

  /* окно-сообщение: {title, text, warn, blocks, buttons: [{label, cls, fn}]} */
  function dialog(o) {
    $('dlg').className = 'modal' + ($('dlg').classList.contains('on') ? ' on' : '') + (o.cls ? ' ' + o.cls : '');
    $('dlg-title').textContent = o.title || '';
    $('dlg-title').classList.toggle('warn', !!o.warn);
    var t = $('dlg-text');
    t.innerHTML = '';
    t.className = 'dlg-text';
    if (o.html) t.appendChild(o.html);
    else if (o.text) { t.className = 'dlg-text rich'; t.innerHTML = SG.markup(fillVars(o.text)); }
    var list = $('dlg-list');
    list.innerHTML = '';
    (o.blocks || []).forEach(function (b) {
      var el = itemButton(b, false);
      el.addEventListener('click', function () { closeTop(); setTimeout(function () { openBlock(b); }, 30); }, true);
      list.appendChild(el);
    });
    var btns = $('dlg-btns');
    btns.innerHTML = '';
    (o.buttons || [{ label: 'OK' }]).filter(Boolean).forEach(function (b) {
      var el = document.createElement('button');
      el.className = 'btn ' + (b.cls || '');
      el.textContent = b.label;
      el.addEventListener('click', function () {
        if (b.keep) { b.fn(); return; }
        closeTop();
        if (b.fn) setTimeout(b.fn, 30);
      });
      btns.appendChild(el);
    });
    if (!$('dlg').classList.contains('on')) pushLayer('dlg');
  }

  /* ---------- коды ---------- */
  /* app — прибор ('' — вкладки «Код» и «Сканер»). Возвращает true, если код что-то сделал. */
  function enter(raw, source, app) {
    if (!game) return;
    app = app || '';
    var r = SG.resolveCode(game, flatState(), raw, app);
    var T = game.texts;
    var ap = app ? SG.byId(game.apps, app) : null;
    if (r.kind === 'master') { master(); return true; }
    if (r.kind === 'settings') { P.settings(); return true; }
    if (r.kind === 'net') { P.joinNet(r.url); return true; }
    if (r.kind === 'gift') { gift(r.block); return true; }
    if (r.kind === 'login') {
      state.account = r.account.id;
      folder = [];
      mine();
      save();
      glitch();
      P.sound('ok');
      if (Net.url) helloNet(); else startNet();
      route();
      setTab(firstTab());
      hook('login');
      return true;
    }
    if (r.kind === 'wrong') {
      if (navigator.vibrate) navigator.vibrate(200);
      P.sound('err');
      if (ap) dialog({ title: ap.title || ap.name, warn: true, cls: 'instr', text: ap.unknown || T.unknown });
      else dialog({ title: T.wrongCode, warn: true, text: source === 'scan' ? 'Код: ' + raw : '' });
      return false;
    }
    if (r.kind === 'chapter') {
      if (r.index <= state.chapter) {
        dialog({ title: T.chapter + ': ' + r.chapter.name, text: 'Терминал уже работает в этом режиме.' });
        return true;
      }
      setChapter(r.index, Net.now());
      return true;
    }
    if (r.kind === 'early') {
      P.sound('err');
      dialog({ title: T.tooEarly, warn: true });
      return false;
    }
    runCode(r, ap);
    return true;
  }

  function setChapter(n, at) {
    var ch = game.chapters[n - 1];
    if (!ch) return;
    state.chapter = n;
    state.chapterAt = at || Net.now();
    save();
    glitch();
    P.sound('glitch');
    setTimeout(function () {
      route();
      if (!acc()) return;
      var fr = SG.visibleBlocks(game, flatState()).filter(function (b) { return mine().seen.indexOf(b.id) < 0; });
      dialog({ title: game.texts.chapter + ': ' + ch.name, text: ch.message || '', blocks: fr });
    }, 500);
  }

  /* Код игры: при необходимости спрашиваем центр (ограничения, общий счёт, подписи). */
  function runCode(r, ap) {
    var need = SG.codeNeeds(r);
    var m = mine();
    var id = r.code.id;
    if (!need) {
      m.counts[id] = (m.counts[id] || 0) + 1;
      finish(r, m.counts[id], null, ap);
      return;
    }
    Net.claim(Object.assign({ acc: state.account }, need)).then(function (cl) {
      if (need.sign) {
        if (!cl.ok && cl.reason === 'wait') { m.pendingSign[need.key] = { code: id, at: Date.now() }; save(); }
      } else if (cl.ok) m.counts[id] = cl.mine;
      var n = r.code.count === 'all' ? cl.n : (cl.mine || m.counts[id] || 1);
      finish(r, n, cl, ap);
    });
  }

  /* Фраза голосом (П-58). netDone — сообщения центру уже отправила служба Android (экран мог быть погашен). */
  function voiceCode(id, netDone) {
    var code = game && SG.byId(game.codes, id);
    if (!code || !acc()) return false;
    if (code.term) {
      // фраза для терминала (П-60): телефон молча передаёт её терминалу; свои действия — только если код открывается персонажу
      if (!netDone && Net.url) { var tm = SG.termCodeMsg(game, code, state.account, true); Net.msg(tm.to, tm.kind, tm.body); }
      if (!SG.pickVariant(code, flatState()) && code.who.length && code.who.indexOf(state.account) < 0) { hook('voiceCode', code); return true; }
    }
    var r = { kind: 'code', code: code, ok: true, variant: SG.pickVariant(code, flatState()), voice: true, noNet: !!netDone };
    if (!SG.whenOk(game, code, state.vars)) {
      if (code.whenMode === 'wrong') { hook('voiceCode', code); return true; }   // П15: «как неверный код» — голосом молча
      r.ok = false; r.cond = false;
    }
    if (netDone) {
      var m = mine();
      m.counts[id] = (m.counts[id] || 0) + 1;
      finish(r, m.counts[id], null, null);
    } else runCode(r, null);
    hook('voiceCode', code);
    return true;
  }

  function finish(r, n, claim, ap) {
    var o = SG.codeOutcome(game, flatState(), r, n, claim);
    var m = mine();
    o.fresh.forEach(function (b) { if (m.unlocked.indexOf(b.id) < 0) m.unlocked.push(b.id); });
    save();
    renderData();
    var bad = ['denied', 'empty', 'mine', 'offline', 'wait'].indexOf(o.kind) >= 0;
    var hadDlg = $('dlg').classList.contains('on');
    if (o.kind === 'open' || o.kind === 'already') doActions(o.actions, r.noNet);
    // терминалу Twine: «на телефоне ввели код» (условие «пришло с телефона», сессия П9)
    if (o.kind === 'open' && Net.url && r.code && !(r.voice && r.code.term)) {
      var tm = SG.termCodeMsg(game, r.code, state.account, !!r.voice);
      Net.msg(tm.to, tm.kind, tm.body);
    }
    var text = o.text || '';
    // голосом, без ответа и блоков: окно показывает только само действие (сбой, уведомление); иначе — тихо
    if (r.voice && !bad && !text && !o.blocks.length) { if (!hadDlg && !$('dlg').classList.contains('on')) P.sound('ok'); return; }
    // код без своего ответа, но с действием, которое само показало окно (прибор, данные) — окно действия главнее
    if (!bad && !text && !o.blocks.length && !hadDlg && $('dlg').classList.contains('on')) { P.sound('ok'); return; }
    if (o.left != null) text += (text ? '\n\n' : '') + '**ОСТАЛОСЬ: ' + o.left + '**';
    if (bad) { P.sound('err'); if (navigator.vibrate) navigator.vibrate(200); }
    else { P.sound('ok'); if (o.fresh.length) glitch(); }
    dialog({ title: ap ? (ap.title || ap.name) + (bad ? ': ' + o.title : '') : o.title, warn: bad, cls: ap ? 'instr' : '', text: text, blocks: o.blocks });
  }

  /* Блок, переданный другим игроком по QR (В4). */
  function gift(b) {
    if (!acc()) return;
    var m = mine();
    var had = SG.visibleBlocks(game, flatState()).some(function (x) { return x.id === b.id; });
    if (m.received.indexOf(b.id) < 0) m.received.push(b.id);
    save();
    renderData();
    P.sound('ok');
    dialog({ title: had ? game.texts.already : 'ПОЛУЧЕНЫ ДАННЫЕ', blocks: [b] });
  }

  /* ---------- действия: местные и через центр ---------- */
  function doActions(actions, noNet) {
    if (!actions || !actions.length) return;
    var x = SG.expandActions(game, actions, { self: state.account, now: Net.now(), vars: state.vars || {} });
    x.local.forEach(function (l) { onMsg({ kind: l.kind, body: l.body, to: ['acc:' + state.account], from: { acc: state.account }, local: true }); });
    x.net.forEach(function (m) {
      var o = Object.assign({}, m);
      var delay = o.delay;
      delete o.delay; delete o.local;
      if (m.t === 'set' && (m.local || !Net.up)) onState(m.key, m.value);
      if (m.t === 'msg' && !Net.url && toMe(m.to)) onMsg({ kind: m.kind, body: m.body, to: m.to, from: { acc: state.account }, local: true });
      if (!Net.url || noNet) return;   // noNet — уже отправила служба (голос, П-58)
      if (delay) Net.send({ t: 'timer', id: 'p' + SG.uid('t'), delay: delay, emit: [o] });
      else if (o.t === 'msg') Net.msg(o.to, o.kind, o.body);
      else Net.send(o);
    });
  }

  function toMe(to) {
    return (to || []).some(function (t) { return t === 'all' || (state.account && t === 'acc:' + state.account) || t === 'dev:' + state.dev; });
  }

  /* ---------- сеть: входящее ---------- */
  /* Терминал (сессия П9) может назвать блок, сбой или функцию не id, а названием — как в редакторе. */
  function byName(kind, b) {
    function find(list, x, key) {
      if (SG.byId(list, x)) return x;
      var t = String(x || '').trim().toLowerCase();
      var hit = list.filter(function (y) { return String(y[key] || '').trim().toLowerCase() === t; })[0];
      return hit ? hit.id : x;
    }
    if (kind === 'open' && Array.isArray(b.blocks)) return Object.assign({}, b, { blocks: b.blocks.map(function (x) { return find(game.blocks, x, 'title'); }) });
    if ((kind === 'glitch' || kind === 'fix') && b.id) return Object.assign({}, b, { id: find(game.glitches, b.id, 'name') });
    if (kind === 'module' && b.id) return Object.assign({}, b, { id: find(SG.MODULES, b.id, 'name') });
    return b;
  }
  function onMsg(o) {
    if (!game) return;
    hook('msg', o);
    if (!o.local && !toMe(o.to)) return;          // мастерский телефон видит всё, но выполняет только своё
    var b = byName(o.kind, o.body || {});
    var m = state.account ? mine() : null;
    if (o.kind === 'notify') { P.notice(b.title, b.text, o); return; }
    if (!m) return;
    if (o.kind === 'open') {
      var ids = (b.blocks || []).filter(function (id) { return SG.byId(game.blocks, id) && m.unlocked.indexOf(id) < 0; });
      ids.forEach(function (id) { m.unlocked.push(id); });
      save();
      renderData();
      var bl = SG.visibleBlocks(game, flatState()).filter(function (x) { return ids.indexOf(x.id) >= 0; });
      if (bl.length) { glitch(); P.sound('note'); dialog({ title: b.title || 'НОВЫЕ ДАННЫЕ', blocks: bl }); }
    } else if (o.kind === 'module') {
      m.mods[b.id] = b.on || 'on';
      save();
      renderModules();
    } else if (o.kind === 'app') {
      if (m.apps.indexOf(b.id) < 0) m.apps.push(b.id);
      save();
      renderModules();
      var ap = SG.byId(game.apps, b.id);
      if (ap && SG.allowed(ap.who, state.account)) { P.sound('note'); dialog({ title: 'ДОСТУПЕН ПРИБОР', text: '**' + ap.name + '**\n\nВкладка «ПРИБОРЫ».' }); }
    } else if (o.kind === 'signed') {
      var p = m.pendingSign[b.key];
      if (!p) return;
      delete m.pendingSign[b.key];
      var code = SG.byId(game.codes, p.code);
      if (!code) return;
      var r = { kind: 'code', code: code, ok: true, variant: SG.pickVariant(code, flatState()) };
      finish(r, 1, { ok: true, signers: b.signers }, code.app ? SG.byId(game.apps, code.app) : null);
    } else hook('kind:' + o.kind, b, o);
  }

  /* П13 (Т4-3): общие переменные — состояние центра «var:имя»; на телефоне — копия state.vars, «{{имя}}» в текстах. */
  function fillVars(text) { return game ? SG.fillVars(text, game, state && state.vars) : text; }
  P.fillVars = fillVars;
  var varsPaint = 0;
  function onState(key, value) {
    if (!game) return;
    if (/^var:/.test(key)) {
      var vn = key.slice(4);
      state.vars = state.vars || {};
      if (value === null || value === undefined) delete state.vars[vn]; else state.vars[vn] = value;
      saveSoon();
      clearTimeout(varsPaint);
      varsPaint = setTimeout(function () {
        if (state.account && mine()) {
          renderData();
          var open = $('view').classList.contains('on') && openNow;
          if (open) openBlock(open);
        }
        if (state.account && acc()) renderBar();
        hook('vars', vn);
      }, 50);
      return;
    }
    if (key === 'chapter' && value && value.n) {
      // побеждает более позднее решение: центр или местный код главы
      if ((value.at || 0) <= (state.chapterAt || 0)) return;
      if (value.n === state.chapter) { state.chapterAt = value.at; save(); return; }
      if (value.n < state.chapter && !value.force) return;
      setChapter(value.n, value.at);
      return;
    }
    hook('state', key, value);
  }

  function helloNet() {
    if (!Net.url) return;
    var a = acc();
    Net.setHello({ role: state.masterDev ? 'master' : 'phone', dev: state.dev, acc: state.account || null,
      num: a && a.num ? a.num : null, name: a ? a.name : (state.masterDev ? 'Мастер' : ''), ver: window.SG_APP_VERSION || '' });
  }
  /* П-62: адреса центра нет (QR «СЕТЬ» не сканировали) — после входа телефон ищет центр сам. */
  function autoNet() {
    return !!(game && state.account && !state.masterDev && (game.chat || {}).auto !== false);
  }
  function startNet() {
    if ((!state.net || !state.net.url) && autoNet()) state.net = { url: Net.AUTO, epoch: state.net && state.net.epoch || null, seq: state.net && state.net.seq || 0 };
    if (!state.net || !state.net.url) return;
    var a = acc();
    Net.start(state.net.url, { role: state.masterDev ? 'master' : 'phone', dev: state.dev, acc: state.account || null,
      num: a && a.num ? a.num : null, name: a ? a.name : (state.masterDev ? 'Мастер' : ''), ver: window.SG_APP_VERSION || '' }, state.net);
  }
  Net.on('msg', onMsg);
  Net.on('state', onState);
  Net.on('welcome', function (w) {
    state.net = state.net || {};
    state.net.epoch = w.epoch;
    state.vars = {};
    Object.keys(w.state || {}).forEach(function (k) { onState(k, w.state[k]); });
    if (state.masterDev && game) {
      var ver = rulesVer();
      if (w.rulesVer !== ver) Net.send({ t: 'rules', ver: ver, list: SG.centerRules(game) });
    }
    save();
    renderNetDot();
    hook('net', true);
  });
  Net.on('seq', function (n) { if (state.net) { state.net.seq = n; state.net.epoch = Net.epoch; saveSoon(); } });
  Net.on('status', function (up) { renderNetDot(); hook('net', up); });
  Net.on('reset', function () { state.vars = {}; if (state.net) { state.net.seq = 0; state.net.epoch = Net.epoch; save(); } });
  // центр нашёл себя по запасному адресу (шлюз точки доступа) — запомнить
  Net.on('moved', function (u) { if (state.net && u) { state.net.url = u; save(); } });
  // П-39: этот персонаж уже в сети на другом телефоне — вход блокируется
  Net.on('busy', function (o) {
    if (!o || o.acc !== state.account) return;
    var a = acc();
    state.account = null;
    folder = [];
    save();
    route();
    dialog({ title: game ? game.texts.busy : 'ЭТОТ ПЕРСОНАЖ УЖЕ В СЕТИ', warn: true,
      text: (a ? '«' + a.name + '» ' : 'Этот персонаж ') + 'уже в сети на другом телефоне. Вход заблокирован. Если тот телефон выключен или потерял связь — подождите полминуты и войдите снова.' });
    P.sound('err');
  });
  function rulesVer() { return (game.title || '') + ':' + game.version + ':' + JSON.stringify(SG.centerRules(game)).length; }
  var saveT = 0;
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 800); }

  function makePad(box, onEnter) {
    box.innerHTML = '<div class="code-field"><input type="text" inputmode="none" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="32"><button class="kb">ABC</button></div>' +
      '<div class="pad"></div>';
    var input = box.querySelector('input');
    var pad = box.querySelector('.pad');
    var kb = box.querySelector('.kb');
    '1 2 3 4 5 6 7 8 9 ⌫ 0 ВВОД'.split(' ').forEach(function (k) {
      var b = document.createElement('button');
      b.textContent = k;
      if (k === 'ВВОД') b.className = 'ok';
      if (k === '⌫') b.className = 'del';
      b.addEventListener('click', function () {
        P.sound('key');
        if (k === '⌫') input.value = input.value.slice(0, -1);
        else if (k === 'ВВОД') submit();
        else if (input.value.length < 32) input.value += k;
      });
      pad.appendChild(b);
    });
    function submit() {
      var v = input.value;
      if (!SG.norm(v)) return;
      input.value = '';
      input.blur();
      onEnter(v);
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    // «ABC»: буквы — своей клавиатурой вместо цифр (П-54); системная — только если так выбрано в редакторе
    var letters = null;
    function sysKbd() {
      input.setAttribute('inputmode', 'text');
      input.blur();
      setTimeout(function () { input.focus(); }, 50);
    }
    function mode(m) {
      box.dataset.mode = m;
      pad.hidden = m !== 'pad';
      if (letters) letters.hidden = m !== 'abc';
      if (m !== 'sys') input.setAttribute('inputmode', 'none');
      kb.textContent = m === 'pad' ? 'ABC' : '123';
    }
    kb.addEventListener('click', function () {
      P.sound('key');
      if (box.dataset.mode && box.dataset.mode !== 'pad') { mode('pad'); input.blur(); return; }
      if (P.kbdMode && P.kbdMode() === 'sys') { mode('sys'); kb.textContent = '123'; sysKbd(); return; }
      if (!letters) {
        letters = P.kbd(input, { upper: true, enter: submit, start: 'en', sys: P.kbdMode() === 'both' ? function () { mode('sys'); sysKbd(); } : null });
        letters.layout('en');
        box.appendChild(letters);
      }
      mode('abc');
    });
    box.resetPad = function () { mode('pad'); };
    return input;
  }

  /* ---------- мастер ---------- */
  /* Версия WebView и экран — для разбора «съехавшего» интерфейса на старых телефонах (Redmi Note 6 Pro). */
  P.webview = function () {
    var m = /Chrome\/(\d+)/.exec(navigator.userAgent || '');
    return 'WebView: ' + (m ? 'Chrome ' + m[1] : '?') + (m && +m[1] < 90 ? ' (СТАРЫЙ — обновите в Play Маркете: на Android 7–9 — «Google Chrome», на Android 10+ — «Android System WebView»; версии «Dev» и «Beta» не нужны)' : '') +
      ' · экран ' + window.innerWidth + '×' + window.innerHeight + ' · масштаб ' + (window.devicePixelRatio || 1);
  };
  function master() {
    var form = document.createElement('div');
    var a = acc();
    form.innerHTML = '<p>' + (a ? 'Аккаунт: <b>' + SG.esc(a.name) + '</b>' : 'Аккаунт не выбран') + '<br>Пакет: ' +
      SG.esc(game.title) + ', версия ' + SG.esc(String(game.version)) + '<br>Приложение: ' + SG.esc(window.SG_APP_VERSION || '—') + '<br>' + SG.esc(P.webview()) + '</p>' +
      '<label class="field">Глава<select id="m-chap"></select></label>';
    var sel = form.querySelector('select');
    game.chapters.forEach(function (c, i) {
      var o = document.createElement('option');
      o.value = i + 1;
      o.textContent = c.name;
      if (i + 1 === state.chapter) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      state.chapter = +sel.value;
      state.chapterAt = Net.now();
      save();
      applyTheme();
      if (acc()) { renderBar(); renderData(); }
    });
    dialog({
      title: 'РЕЖИМ МАСТЕРА',
      html: form,
      buttons: [
        { label: 'Пульт мастера (сеть)', fn: function () { P.console(); } },
        { label: 'Сменить аккаунт', fn: function () { state.account = null; save(); helloNet(); route(); } },
        a ? { label: 'Повторить первый вход (разрешения, цвет)', cls: 'dim', fn: function () { P.firstRun(true); } } : null,
        { label: 'Голос: проверка и замер', cls: 'dim', fn: function () { P.voiceDiag(); } },
        { label: 'Сбросить прогресс этого телефона', cls: 'warn', fn: function () {
          dialog({ title: 'СБРОСИТЬ ВСЁ?', warn: true, text: 'Аккаунт, глава и все открытые данные на этом телефоне будут стёрты.',
            buttons: [
              { label: 'Да, сбросить', cls: 'warn', fn: function () { resetPhone(); } },
              { label: 'Отмена', cls: 'dim' }
            ] });
        } },
        { label: 'Загрузить другой пакет', cls: 'dim', fn: function () { $('file').click(); } },
        { label: 'Закрыть', cls: 'dim' }
      ]
    });
  }

  /* ---------- сканер QR (вкладка, экран входа, приборы) ---------- */
  /* Один сканер на всё: start(видео, сообщение, обработчик кода). */
  var scan = { stream: null, timer: 0, canvas: document.createElement('canvas'), busy: false, video: null, msg: null, cb: null, owner: '' };
  function setScanMsg(t) { if (scan.msg) scan.msg.textContent = t; }
  function startCam(video, msg, cb, owner, facing) {
    facing = facing || 'environment';
    if (scan.stream && scan.owner === owner && scan.facing === facing) return;
    stopCam();
    scan.facing = facing;
    scan.video = video; scan.msg = msg; scan.cb = cb; scan.owner = owner;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setScanMsg('КАМЕРА НЕДОСТУПНА'); return; }
    setScanMsg('ПОДКЛЮЧЕНИЕ…');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false })
      .then(function (s) {
        if (scan.owner !== owner || scan.stream) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        scan.stream = s;
        video.srcObject = s;
        video.play();
        video.parentNode.classList.add('scanning');
        hook('camOn', owner);
        if (!cb) { setScanMsg(''); return; }   // камера-улика: без поиска QR
        setScanMsg(P.scanBlocked && P.scanBlocked() ? game.texts.scanFail : 'НАВЕДИТЕ НА QR-КОД');
        scan.timer = setInterval(tick, 150);
      })
      .catch(function (e) {
        setScanMsg(e && e.name === 'NotAllowedError' ? 'НЕТ РАЗРЕШЕНИЯ НА КАМЕРУ' : 'КАМЕРА НЕДОСТУПНА');
      });
  }
  function stopCam(owner) {
    if (owner && scan.owner !== owner) return;
    clearInterval(scan.timer);
    if (scan.stream) scan.stream.getTracks().forEach(function (t) { t.stop(); });
    scan.stream = null;
    if (scan.video) { scan.video.srcObject = null; scan.video.parentNode.classList.remove('scanning'); }
    hook('camOff', scan.owner);
    scan.owner = '';
  }
  function startScan() {
    startCam($('scan-video'), $('scan-msg'), function (code) { found(code); }, 'tab');
    $('scan-toggle').textContent = 'ВЫКЛЮЧИТЬ КАМЕРУ';
  }
  function stopScan() {
    stopCam('tab');
    $('scan-toggle').textContent = 'ВКЛЮЧИТЬ КАМЕРУ';
    if (!scan.stream) $('scan-msg').textContent = 'НАЖМИТЕ «ВКЛЮЧИТЬ»';
  }
  function tick() {
    var v = scan.video;
    if (!scan.cb || scan.busy || !v || !v.videoWidth || $('dlg').classList.contains('on')) return;
    if (P.scanBlocked && P.scanBlocked()) { setScanMsg(game.texts.scanFail); return; }
    var w = v.videoWidth, hh = v.videoHeight;
    var k = Math.min(1, 640 / Math.max(w, hh));
    var c = scan.canvas;
    c.width = Math.round(w * k);
    c.height = Math.round(hh * k);
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, c.width, c.height);
    var img = ctx.getImageData(0, 0, c.width, c.height);
    var res = window.jsQR(img.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    if (res && res.data) {
      var text = res.data.trim();
      var now = Date.now();
      if (text === lastCode.v && now - lastCode.t < 3000) return;
      lastCode = { v: text, t: now };
      if (navigator.vibrate) navigator.vibrate(80);
      if (scan.cb) scan.cb(text.replace(/^SG:/i, ''));
    }
  }
  var lastCode = { v: '', t: 0 };
  function found(text) {
    var code = text.replace(/^SG:/i, '');
    if (acc()) enter(code, 'scan');
    else { stopScan(); enter(code, 'scan'); }
  }
  $('scan-toggle').addEventListener('click', function () { scan.owner === 'tab' && scan.stream ? stopScan() : startScan(); });

  /* Сканер поверх (экран входа: QR «СЕТЬ», код входа, мастер; приборы — только камера). */
  function scanOverlay(title, hint, cb, cls) {
    $('scanlay-title').textContent = title;
    $('scanlay-hint').textContent = hint || '';
    $('scanlay').className = 'overlay' + (cls ? ' ' + cls : '');
    pushLayer('scanlay', function () { stopCam('lay'); });
    startCam($('scanlay-video'), $('scanlay-msg'), cb, 'lay');
  }
  $('scanlay-back').addEventListener('click', function () { closeTop(); });
  $('login-scan').addEventListener('click', function () {
    scanOverlay('СКАНЕР', 'QR «СЕТЬ», код входа или мастерский код', function (code) {
      closeTop();
      setTimeout(function () { enter(code, 'scan'); }, 60);
    });
  });

  /* ---------- приём SSTV (функция «sstv» у аккаунта) ---------- */
  var radio = { stream: null, ctx: null, node: null, dec: null, img: null, t: 0 };
  function sstvStatus(t) { $('sstv-status').textContent = t; }
  function sstvDraw(img) {
    var c = $('sstv-canvas');
    if (c.width !== img.width || c.height !== img.height) { c.width = img.width; c.height = img.height; }
    var x = c.getContext('2d');
    x.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
    $('sstv-idle').style.display = 'none';
  }
  function startRadio() {
    if (radio.stream || !window.SGSSTV) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { sstvStatus('МИКРОФОН НЕДОСТУПЕН'); return; }
    sstvStatus('ВКЛЮЧЕНИЕ…');
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(function (s) {
        if (!$('tab-sstv').classList.contains('on')) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        radio.stream = s;
        var AC = window.AudioContext || window.webkitAudioContext;
        radio.ctx = new AC();
        var src = radio.ctx.createMediaStreamSource(s);
        radio.node = radio.ctx.createScriptProcessor(4096, 1, 1);
        radio.dec = new window.SGSSTV.Decoder(radio.ctx.sampleRate, {
          onStart: function (e) {
            $('sstv-mode').textContent = e.mode.toUpperCase();
            sstvStatus('ПРИЁМ…');
            var c = $('sstv-canvas'); c.width = e.width; c.height = e.height;
            c.getContext('2d').fillRect(0, 0, e.width, e.height);
            $('sstv-idle').style.display = 'none';
            if (navigator.vibrate) navigator.vibrate(80);
          },
          onLine: function (img) {
            radio.img = img;
            var now = Date.now();
            if (now - radio.t > 120 || img.rows === img.height) { radio.t = now; sstvDraw(img); }
            $('sstv-prog').style.width = (img.rows / img.height * 100) + '%';
            sstvStatus('ПРИЁМ: СТРОКА ' + img.rows + ' / ' + img.height);
          },
          onDone: function (img) {
            sstvDraw(img);
            sstvStatus('ПРИНЯТО' + (img.rows < img.height ? ' ЧАСТИЧНО' : ''));
            $('sstv-prog').style.width = '0';
            keepSstv(img);
            if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
            sstvDone(img);
          }
        });
        radio.modem = window.SGModem ? new window.SGModem.Decoder(radio.ctx.sampleRate, heard) : null;
        radio.node.onaudioprocess = function (ev) {
          var data = ev.inputBuffer.getChannelData(0);
          radio.dec.push(data);
          if (radio.modem) radio.modem.push(data);
          $('sstv-level').style.width = Math.min(100, radio.dec.level * 300) + '%';
        };
        src.connect(radio.node);
        radio.node.connect(radio.ctx.destination);   // иначе ScriptProcessor молчит
        if (radio.ctx.state === 'suspended') radio.ctx.resume();
        $('sstv-toggle').textContent = 'ВЫКЛЮЧИТЬ ПРИЁМ';
        sstvStatus('ОЖИДАНИЕ СИГНАЛА…');
      }).catch(function (e) {
        sstvStatus(e && e.name === 'NotAllowedError' ? 'НЕТ РАЗРЕШЕНИЯ НА МИКРОФОН' : 'МИКРОФОН НЕДОСТУПЕН');
      });
  }
  /* Код из звука (М1) или метка перед картинкой (Д2): метку показываем, когда картинка принята. */
  function heard(code) {
    if (navigator.vibrate) navigator.vibrate(80);
    if (radio.dec && radio.dec.img) { radio.label = code; sstvStatus('МЕТКА ПРИНЯТА · ПРИЁМ…'); return; }
    radio.label = code;
    setTimeout(function () {
      // метка перед SSTV: ждём начала картинки 4 с, иначе это просто код
      if (radio.label === code && !(radio.dec && radio.dec.img)) { radio.label = null; enter(code, 'radio'); }
    }, 4000);
  }
  /* Картинка принята: метка → её код; QR внутри картинки → как отсканированный (Д3). */
  function sstvDone(img) {
    var label = radio.label;
    radio.label = null;
    setTimeout(function () {
      if (label) { enter(label, 'radio'); return; }
      try {
        var q = window.jsQR(img.rgba, img.width, img.rows, { inversionAttempts: 'attemptBoth' });
        if (q && q.data) enter(q.data.trim().replace(/^SG:/i, ''), 'scan');
      } catch (e) { /* нет QR */ }
    }, 400);
  }
  /* Звук из блока (mp3) → приёмник, без микрофона (Д4). */
  P.decodeFile = function (url) {
    closeTop();
    setTab('sstv');
    stopRadio();
    sstvStatus('РАСШИФРОВКА ЗАПИСИ…');
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = new AC();
    fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return ctx.decodeAudioData(b); }).then(function (buf) {
      var rate = buf.sampleRate, data = buf.getChannelData(0);
      var got = null, label = null;
      var dec = new window.SGSSTV.Decoder(rate, { onStart: function (e) { $('sstv-mode').textContent = e.mode.toUpperCase(); }, onDone: function (img) { got = img; } });
      var md = window.SGModem ? new window.SGModem.Decoder(rate, function (c) { label = c; }) : null;
      for (var i = 0; i < data.length; i += 8192) { var ch = data.subarray(i, i + 8192); dec.push(ch); if (md) md.push(ch); }
      dec.push(new Float32Array(rate * 2));
      ctx.close();
      if (got) {
        sstvDraw(got);
        keepSstv(got);
        sstvStatus('ЗАПИСЬ РАСШИФРОВАНА');
        radio.label = label;
        sstvDone(got);
      } else if (label) { sstvStatus('КОД ИЗ ЗАПИСИ'); enter(label, 'radio'); }
      else sstvStatus('В ЗАПИСИ НЕТ СИГНАЛА');
    }).catch(function (e) { sstvStatus('ЗАПИСЬ НЕ ЧИТАЕТСЯ'); });
  };
  function stopRadio() {
    if (radio.node) { radio.node.onaudioprocess = null; try { radio.node.disconnect(); } catch (e) { /* уже */ } }
    if (radio.ctx) radio.ctx.close();
    if (radio.stream) radio.stream.getTracks().forEach(function (t) { t.stop(); });
    radio.stream = radio.ctx = radio.node = radio.dec = radio.modem = null;
    $('sstv-toggle').textContent = 'ВКЛЮЧИТЬ ПРИЁМ';
    $('sstv-level').style.width = '0';
    $('sstv-prog').style.width = '0';
    sstvStatus('ПРИЁМНИК ВЫКЛЮЧЕН');
  }
  $('sstv-toggle').addEventListener('click', function () { radio.stream ? stopRadio() : startRadio(); });
  /* принятая картинка остаётся у игрока (последние 12) */
  function keepSstv(img) {
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.rows;
    c.getContext('2d').putImageData(new ImageData(img.rgba.slice(0, img.width * img.rows * 4), img.width, img.rows), 0, 0);
    var m = mine();
    m.sstv = m.sstv || [];
    m.sstv.unshift({ at: Date.now(), mode: img.mode, src: c.toDataURL('image/jpeg', 0.85) });
    m.sstv.length = Math.min(m.sstv.length, 12);
    save();
    renderSstvGot();
  }
  function renderSstvGot() {
    var box = $('sstv-got');
    box.innerHTML = '';
    var list = (state.account && mine().sstv) || [];
    $('sstv-got-title').style.display = list.length ? '' : 'none';
    list.forEach(function (it) {
      var f = document.createElement('figure');
      var im = document.createElement('img');
      im.src = it.src;
      im.addEventListener('click', function () { zoom(it.src); });
      var cap = document.createElement('figcaption');
      var d = new Date(it.at);
      cap.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' · ' + it.mode;
      f.appendChild(im); f.appendChild(cap);
      box.appendChild(f);
    });
  }
  /* Вкладки функций: включены у аккаунта (с главы), включены/сломаны кодами; иначе скрыты или «нет доступа». */
  var MODTABS = ['chat', 'sstv', 'photo', 'notes'];
  function modState(id) {
    var a = acc();
    return a ? SG.moduleState(game, a, state.chapter, mine().mods, id) : 'hidden';
  }
  function hasModule(id) { return modState(id) === 'on'; }
  /* Нижнее меню (П14): порядок, названия, скрытые вкладки — из пакета (game.menu). */
  function menuHidden(id) { return SG.menuOff(game, flatState(), id); }
  function applyMenu() {
    var nav = $('tabs');
    SG.menuTabs(game).forEach(function (m) {
      var b = nav.querySelector('button[data-tab=' + m.tab + ']');
      if (!b) return;
      b.textContent = m.text;
      nav.appendChild(b);
    });
    var sst = nav.querySelector('button[data-tab=sstv]');
    if (sst) nav.appendChild(sst);
    ['data', 'code', 'scan'].forEach(function (id) { nav.querySelector('button[data-tab=' + id + ']').hidden = menuHidden(id); });
  }
  function firstTab() {
    var b = Array.prototype.filter.call(document.querySelectorAll('#tabs button'), function (x) { return !x.hidden; })[0];
    return b ? b.dataset.tab : 'data';
  }
  function renderModules() {
    if (!acc()) return;
    applyMenu();
    MODTABS.forEach(function (id) {
      var st = modState(id);
      var b = document.querySelector('#tabs button[data-tab=' + id + ']');
      b.hidden = st === 'hidden' || menuHidden(id);
      b.classList.toggle('broken', st === 'broken' || st === 'denied');
    });
    var apps = SG.appsFor(game, state.account, state.chapter, mine().apps);
    document.querySelector('#tabs button[data-tab=apps]').hidden = !apps.length || menuHidden('apps');
    var cur = document.querySelector('#tabs button.on');
    if (cur && cur.hidden) setTab(firstTab());
    else if (cur) { var t = cur.dataset.tab; if (MODTABS.indexOf(t) >= 0 && modState(t) !== 'on') setTab(t); }
    if (hasModule('sstv')) renderSstvGot();
    hook('modules');
  }

  /* ---------- вкладки ---------- */
  var TABS = ['data', 'code', 'scan', 'chat', 'apps', 'sstv', 'photo', 'notes', 'off'];
  function setTab(name) {
    var show = name;
    var st = MODTABS.indexOf(name) >= 0 ? modState(name) : 'on';
    if (st !== 'on') {
      show = 'off';
      var T = game.texts;
      $('tab-off').innerHTML = '<div class="offpanel ' + st + '"><div class="big">' + SG.esc(st === 'broken' ? T.broken : T.denied) + '</div>' +
        '<p>' + (st === 'broken' ? 'Модуль неисправен. Нужен ремонт.' : 'Функция недоступна для этого профиля.') + '</p></div>';
    }
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    TABS.forEach(function (t) { $('tab-' + t).classList.toggle('on', t === show); });
    if (show !== 'scan') stopScan();
    else startScan();
    if (show !== 'sstv') stopRadio();
    else startRadio();
    hook('tab', show);
    P.tab = show;
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { P.sound('key'); setTab(b.dataset.tab); });
  });

  /* ---------- запуск ---------- */
  makePad(document.querySelector('[data-pad=login]'), function (v) { enter(v, 'login'); });
  makePad(document.querySelector('[data-pad=main]'), function (v) { enter(v, 'pad'); });
  $('boot-load').addEventListener('click', function () { $('file').click(); });
  $('file').addEventListener('change', function () {
    var f = $('file').files[0];
    $('file').value = '';
    if (f) loadFile(f);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stopScan(); stopCam(); stopAudio(); stopRadio(); hook('hidden'); }
  });

  function boot() {
    if (preview) {
      $('badge').textContent = 'ПРЕДПРОСМОТР';
      $('badge').style.display = 'block';
      $('boot-msg').textContent = 'ОЖИДАНИЕ ПАКЕТА ИЗ РЕДАКТОРА';
      $('boot-load').style.display = 'none';
      $('boot-hint').style.display = 'none';
      show('scr-boot');
      window.addEventListener('message', function (ev) {
        var d = ev.data || {};
        if (d.type !== 'sg-pack') return;
        var keep = state && d.keepState;
        if (!keep) { state = fresh(); state.account = d.account || null; state.chapter = d.chapter || 1; }
        if (d.unlockAll && d.account) state.byAccount[d.account] = { unlocked: [], seen: [], all: true };
        usePack(d.data).then(function () {
          if (d.unlockAll && state.account) {
            mine().unlocked = game.blocks.map(function (b) { return b.id; });
          }
          stack.splice(0).forEach(function (l) { $(l.id).classList.remove('on'); });
          route();
          if (d.tab) setTab(d.tab);
        }).catch(function (e) { $('boot-msg').textContent = 'ОШИБКА: ' + e.message; });
      });
      if (window.parent !== window) window.parent.postMessage({ type: 'sg-preview-ready' }, '*');
      return;
    }
    Promise.all([get('pack'), get('state')]).then(function (r) {
      state = r[1] || null;
      if (state && !state.dev) state.dev = SG.uid('d');
      if (!r[0]) { route(); return; }
      return usePack(r[0]).then(function () { save(); route(); startNet(); });
    }).catch(function (e) {
      $('boot-msg').textContent = 'ОШИБКА ЗАГРУЗКИ: ' + e.message;
      show('scr-boot');
    });
  }

  Object.defineProperty(P, 'game', { get: function () { return game; } });
  Object.defineProperty(P, 'state', { get: function () { return state; } });
  Object.assign(P, {
    $: $, urls: function () { return urls; }, preview: preview,
    acc: acc, mine: mine, flatState: flatState, save: save, saveSoon: saveSoon, route: route, renderData: renderData, renderModules: renderModules,
    renderBar: renderBar, applyTheme: applyTheme, dialog: dialog, closeTop: closeTop, pushLayer: pushLayer, stack: stack, glitch: glitch, zoom: zoom, setTab: setTab,
    enter: enter, voiceCode: voiceCode, doActions: doActions, toMe: toMe, onMsg: onMsg, onState: onState, helloNet: helloNet, startNet: startNet, setChapter: setChapter,
    hasModule: hasModule, modState: modState, scanCb: function () { return scan.cb; }, makePad: makePad, scanOverlay: scanOverlay, startCam: startCam, stopCam: stopCam,
    renderItems: renderItems, openBlock: openBlock, itemButton: itemButton, fresh: fresh, master: master, sstvCode: null
  });
  // для проверок
  window.sgPlayer = { folder: function () { return folder.slice(); }, folderUp: folderUp, enter: enter, state: function () { return state; }, game: function () { return game; }, found: found, net: Net, P: P };
  setTimeout(boot, 0);   // сначала загружаются feat.js, chat.js, apps.js, master.js
})();
