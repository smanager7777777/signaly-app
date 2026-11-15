/* СИГНАЛЫ — приложение игрока. Нужны JSZip, jsQR, logic.js (window.SG). */
(function () {
  'use strict';
  var SG = window.SG;
  var $ = function (id) { return document.getElementById(id); };
  var preview = /[#&]preview\b/.test(location.hash) || window.name === 'sg-preview';

  var game = null;      // game.json
  var urls = {};        // имя файла → object URL
  var state = null;     // {account, chapter, byAccount: {id: {unlocked: [], seen: []}}}

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
    return state.byAccount[id];
  }
  function flatState() {
    var m = state.account ? mine() : { unlocked: [] };
    return { account: state.account, chapter: state.chapter, unlocked: m.unlocked };
  }

  /* ---------- пакет ---------- */
  function usePack(data) {
    return SG.readPack(data).then(function (p) {
      Object.keys(urls).forEach(function (k) { URL.revokeObjectURL(urls[k]); });
      urls = {};
      Object.keys(p.files).forEach(function (k) { urls[k] = URL.createObjectURL(p.files[k]); });
      game = p.game;
      if (!state) state = { account: null, chapter: 1, byAccount: {} };
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
    var ch = game.chapters[(state.chapter || 1) - 1] || game.chapters[0];
    var t = ch.theme;
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
    if (!game) { show('scr-boot'); return; }
    applyTheme();
    $('login-logo').textContent = game.title || 'СИГНАЛЫ';
    $('login-title').textContent = game.texts.loginTitle;
    if (!acc()) { show('scr-login'); return; }
    show('scr-main');
    renderBar();
    renderData();
  }
  function renderBar() {
    var a = acc();
    $('bar-name').textContent = a.name || '—';
    $('bar-prof').textContent = a.profession || '';
    var ch = game.chapters[state.chapter - 1];
    $('bar-chap').textContent = ch ? ch.name : '';
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
    if (!list.length) {
      var e = document.createElement('p');
      e.className = 'empty';
      e.textContent = 'НЕТ ДОСТУПНЫХ ДАННЫХ';
      box.appendChild(e);
      return;
    }
    var groups = [];
    var bySec = {};
    list.forEach(function (b) {
      var s = b.section || '';
      if (!bySec[s]) { bySec[s] = []; groups.push(s); }
      bySec[s].push(b);
    });
    groups.forEach(function (s) {
      if (s) {
        var h = document.createElement('div');
        h.className = 'section';
        h.textContent = s;
        box.appendChild(h);
      }
      bySec[s].forEach(function (b) { box.appendChild(itemButton(b, seen.indexOf(b.id) < 0)); });
    });
  }

  function fmtTime(s) {
    if (!isFinite(s)) return '--:--';
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  var audios = [];
  function stopAudio() { audios.forEach(function (a) { a.pause(); }); audios = []; }

  function renderItems(items) {
    var frag = document.createElement('div');
    frag.className = 'rich';
    items.forEach(function (it) {
      if (it.type === 'text') {
        var d = document.createElement('div');
        d.innerHTML = SG.markup(it.text);
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
  function pushLayer(id, onClose) {
    stack.push({ id: id, onClose: onClose });
    $(id).classList.add('on');
    history.pushState({ sg: stack.length }, '');
  }
  function closeTop(fromPop) {
    var top = stack.pop();
    if (!top) return;
    $(top.id).classList.remove('on');
    if (top.onClose) top.onClose();
    if (!fromPop) history.back();
  }
  window.addEventListener('popstate', function () { if (stack.length) closeTop(true); });
  var native = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (native) {
    // в приложении Android: «назад» закрывает окно поверх; на главном экране ничего не делает,
    // чтобы игрок случайно не вышел из игры
    native.addListener('backButton', function () { if (stack.length) closeTop(); });
  }

  function openBlock(b) {
    stopAudio();
    var m = mine();
    if (m.seen.indexOf(b.id) < 0) { m.seen.push(b.id); save(); }
    $('view-sec').textContent = b.section || '';
    var body = $('view-body');
    body.innerHTML = '<h2>' + SG.esc(b.title || '') + '</h2>';
    body.appendChild(renderItems(b.items));
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
    $('dlg-title').textContent = o.title || '';
    $('dlg-title').classList.toggle('warn', !!o.warn);
    var t = $('dlg-text');
    t.innerHTML = '';
    if (o.html) t.appendChild(o.html);
    else if (o.text) { t.className = 'dlg-text rich'; t.innerHTML = SG.markup(o.text); }
    var list = $('dlg-list');
    list.innerHTML = '';
    (o.blocks || []).forEach(function (b) {
      var el = itemButton(b, false);
      el.addEventListener('click', function () { closeTop(); setTimeout(function () { openBlock(b); }, 30); }, true);
      list.appendChild(el);
    });
    var btns = $('dlg-btns');
    btns.innerHTML = '';
    (o.buttons || [{ label: 'OK' }]).forEach(function (b) {
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
  function enter(raw, source) {
    if (!game) return;
    var r = SG.resolveCode(game, flatState(), raw);
    var T = game.texts;
    if (r.kind === 'master') { master(); return true; }
    if (r.kind === 'login') {
      state.account = r.account.id;
      mine();
      save();
      glitch();
      route();
      setTab('data');
      return true;
    }
    if (r.kind === 'wrong') {
      if (navigator.vibrate) navigator.vibrate(200);
      dialog({ title: T.wrongCode, warn: true, text: source === 'scan' ? 'Код: ' + raw : '' });
      return false;
    }
    if (r.kind === 'chapter') {
      if (r.index <= state.chapter) {
        dialog({ title: T.chapter + ': ' + r.chapter.name, text: 'Терминал уже работает в этом режиме.' });
        return true;
      }
      state.chapter = r.index;
      save();
      glitch();
      setTimeout(function () {
        route();
        var fresh = SG.visibleBlocks(game, flatState()).filter(function (b) { return mine().seen.indexOf(b.id) < 0; });
        dialog({ title: T.chapter + ': ' + r.chapter.name, text: r.chapter.message || '', blocks: fresh });
      }, 500);
      return true;
    }
    if (r.kind === 'early') {
      dialog({ title: T.tooEarly, warn: true });
      return false;
    }
    var m = mine();
    r.fresh.forEach(function (b) { m.unlocked.push(b.id); });
    save();
    renderData();
    if (r.kind === 'denied') {
      dialog({ title: T.denied, warn: true, text: r.code.denied, blocks: r.blocks });
      return true;
    }
    if (r.kind === 'already') {
      dialog({ title: T.already, text: r.code.answer, blocks: r.blocks });
      return true;
    }
    if (r.fresh.length) glitch();
    dialog({ title: T.opened, text: r.code.answer, blocks: r.blocks });
    return true;
  }

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
    kb.addEventListener('click', function () {
      var sys = input.getAttribute('inputmode') === 'none';
      input.setAttribute('inputmode', sys ? 'text' : 'none');
      kb.textContent = sys ? '123' : 'ABC';
      input.blur();
      if (sys) setTimeout(function () { input.focus(); }, 50);
    });
    return input;
  }

  /* ---------- мастер ---------- */
  function master() {
    var form = document.createElement('div');
    var a = acc();
    form.innerHTML = '<p>' + (a ? 'Аккаунт: <b>' + SG.esc(a.name) + '</b>' : 'Аккаунт не выбран') + '<br>Пакет: ' +
      SG.esc(game.title) + ', версия ' + SG.esc(String(game.version)) + '<br>Приложение: ' + SG.esc(window.SG_APP_VERSION || '—') + '</p>' +
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
      save();
      applyTheme();
      if (acc()) { renderBar(); renderData(); }
    });
    dialog({
      title: 'РЕЖИМ МАСТЕРА',
      html: form,
      buttons: [
        { label: 'Сменить аккаунт', fn: function () { state.account = null; save(); route(); } },
        { label: 'Сбросить прогресс этого телефона', cls: 'warn', fn: function () {
          dialog({ title: 'СБРОСИТЬ ВСЁ?', warn: true, text: 'Аккаунт, глава и все открытые данные на этом телефоне будут стёрты.',
            buttons: [
              { label: 'Да, сбросить', cls: 'warn', fn: function () { state = { account: null, chapter: 1, byAccount: {} }; save(); route(); } },
              { label: 'Отмена', cls: 'dim' }
            ] });
        } },
        { label: 'Загрузить другой пакет', cls: 'dim', fn: function () { $('file').click(); } },
        { label: 'Закрыть', cls: 'dim' }
      ]
    });
  }

  /* ---------- сканер QR ---------- */
  var scan = { stream: null, timer: 0, canvas: document.createElement('canvas'), busy: false };
  function setScanMsg(t) { $('scan-msg').textContent = t; }
  function startScan() {
    if (scan.stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScanMsg('КАМЕРА НЕДОСТУПНА');
      return;
    }
    setScanMsg('ПОДКЛЮЧЕНИЕ…');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(function (s) {
        scan.stream = s;
        var v = $('scan-video');
        v.srcObject = s;
        v.play();
        $('tab-scan').querySelector('.scanbox').classList.add('scanning');
        $('scan-toggle').textContent = 'ВЫКЛЮЧИТЬ КАМЕРУ';
        setScanMsg('НАВЕДИТЕ НА QR-КОД');
        scan.timer = setInterval(tick, 150);
      })
      .catch(function (e) {
        setScanMsg(e && e.name === 'NotAllowedError' ? 'НЕТ РАЗРЕШЕНИЯ НА КАМЕРУ' : 'КАМЕРА НЕДОСТУПНА');
      });
  }
  function stopScan() {
    clearInterval(scan.timer);
    if (scan.stream) scan.stream.getTracks().forEach(function (t) { t.stop(); });
    scan.stream = null;
    var v = $('scan-video');
    v.srcObject = null;
    var box = $('tab-scan').querySelector('.scanbox');
    box.classList.remove('scanning');
    $('scan-toggle').textContent = 'ВКЛЮЧИТЬ КАМЕРУ';
    setScanMsg('НАЖМИТЕ «ВКЛЮЧИТЬ»');
  }
  function tick() {
    var v = $('scan-video');
    if (scan.busy || !v.videoWidth || stack.length) return;
    var w = v.videoWidth, h = v.videoHeight;
    var k = Math.min(1, 640 / Math.max(w, h));
    var c = scan.canvas;
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, c.width, c.height);
    var img = ctx.getImageData(0, 0, c.width, c.height);
    var res = window.jsQR(img.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    if (res && res.data) found(res.data.trim());
  }
  var lastCode = { v: '', t: 0 };
  function found(text) {
    var now = Date.now();
    if (text === lastCode.v && now - lastCode.t < 3000) return;
    lastCode = { v: text, t: now };
    if (navigator.vibrate) navigator.vibrate(80);
    var code = text.replace(/^SG:/i, '');
    if (acc()) enter(code, 'scan');
    else {
      stopScan();
      enter(code, 'scan');
    }
  }
  $('scan-toggle').addEventListener('click', function () { scan.stream ? stopScan() : startScan(); });

  /* ---------- вкладки ---------- */
  function setTab(name) {
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    ['data', 'code', 'scan'].forEach(function (t) { $('tab-' + t).classList.toggle('on', t === name); });
    if (name !== 'scan') stopScan();
    else startScan();
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { setTab(b.dataset.tab); });
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
    if (document.hidden) { stopScan(); stopAudio(); }
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
        if (!keep) state = { account: d.account || null, chapter: d.chapter || 1, byAccount: {} };
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
      if (!r[0]) { route(); return; }
      return usePack(r[0]).then(function () { save(); route(); });
    }).catch(function (e) {
      $('boot-msg').textContent = 'ОШИБКА ЗАГРУЗКИ: ' + e.message;
      show('scr-boot');
    });
  }

  // для проверок
  window.sgPlayer = { enter: enter, state: function () { return state; }, game: function () { return game; }, found: found };
  boot();
})();
