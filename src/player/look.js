/* СИГНАЛЫ — оформление игрока: цвет интерфейса персонажа (П-50…П-53), своя клавиатура (П-54), первый вход (П-55). */
(function () {
  'use strict';
  var P = window.SGP, SG = window.SG, $ = P.$;
  var native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() &&
    window.Capacitor.Plugins && window.Capacitor.Plugins.SgNet;

  /* ---------- цвет ---------- */
  function my() { var m = P.mine(); return { color: m.color || '', colorCh: m.colorCh || 1, colorBy: m.colorBy || '', colorAny: m.colorAny || null }; }
  P.myColor = my;
  /* Действующий основной цвет этого телефона (#rrggbb). */
  P.curHex = function () {
    var g = P.game;
    if (!g) return '#33ff66';
    return SG.themeFor(g, P.acc(), P.state.chapter, P.acc() ? my() : {}).text;
  };
  /* Каким цветом сообщения этого персонажа увидят другие ('' — их собственным). */
  P.sendHex = function (accId) {
    var g = P.game, a = accId ? SG.byId(g.accounts, accId) : P.acc();
    if (!a) return '';
    return SG.sendColor(g, a, P.state.chapter, a === P.acc() ? my() : {});
  };
  P.themeNow = function () {
    var g = P.game;
    return SG.themeFor(g, P.acc(), P.state.chapter, P.acc() ? my() : {});
  };
  function setColor(id, by) {
    var m = P.mine();
    m.color = id; m.colorCh = P.state.chapter; m.colorBy = by || '';
    P.save();
    P.applyTheme();
    P.glitch();
    P.sound('ok');
    P.renderBar();
  }
  P.setColor = setColor;

  /* Окно выбора цвета: образцы из разрешённых в главе. done(id) — после выбора. */
  function pickColor(title, text, done, cancel) {
    var g = P.game;
    var list = SG.allowedColors(g, P.state.chapter);
    var cur = SG.effColor(g, P.acc(), P.state.chapter, my());
    var box = document.createElement('div');
    if (text) { var p = document.createElement('p'); p.textContent = text; box.appendChild(p); }
    var grid = document.createElement('div');
    grid.className = 'swatches';
    list.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'swatch' + (c.id === cur ? ' on' : '');
      b.dataset.color = c.id;
      b.style.color = c.color;
      b.style.borderColor = c.color;
      b.innerHTML = '<i></i><span></span>';
      b.querySelector('i').style.background = c.color;
      b.querySelector('span').textContent = c.name;
      b.addEventListener('click', function () { P.closeTop(); setTimeout(function () { done(c.id); }, 30); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
    P.dialog({ title: title, html: box, buttons: [{ label: cancel || 'Оставить как есть', cls: 'dim' }] });
  }
  P.pickColor = pickColor;

  /* Мастер или правило: предложить сменить цвет / поставить цвет. */
  P.on('kind:color', function (b) {
    if (!P.acc()) return;
    if (b.any != null) {   // мастер разрешил или запретил менять цвет в любое время — до конца главы
      P.mine().colorAny = { v: !!b.any, ch: P.state.chapter };
      P.save();
      barColor();
      if (b.any) { P.sound('note'); P.dialog({ title: 'ЦВЕТ ИНТЕРФЕЙСА', text: 'Теперь цвет можно менять в любое время: кнопка ◐ в шапке.' }); }
      return;
    }
    if (b.set != null) {
      if (b.set) setColor(b.set, 'master');
      else { var m = P.mine(); m.color = ''; m.colorBy = ''; P.save(); P.applyTheme(); P.renderBar(); }
      return;
    }
    if (b.offer) {
      if (!SG.allowedColors(P.game, P.state.chapter).length) return;
      P.sound('note');
      P.dialog({ title: 'ХОТИТЕ СМЕНИТЬ ЦВЕТ?', text: 'Можно выбрать другой цвет интерфейса.', buttons: [
        { label: 'Да', fn: function () { pickColor('ЦВЕТ ИНТЕРФЕЙСА', '', function (id) { setColor(id); }); } },
        { label: 'Нет', cls: 'dim' }] });
    }
  });

  /* Кнопка ◐ в шапке — «меняет цвет в любое время» (П-52). */
  var barBtn = document.createElement('button');
  barBtn.id = 'bar-color';
  barBtn.className = 'bar-btn';
  barBtn.textContent = '◐';
  barBtn.title = 'цвет интерфейса';
  barBtn.hidden = true;
  $('bar').querySelector('.bar-r').insertBefore(barBtn, $('bar-chap'));
  barBtn.addEventListener('click', function () {
    if (!canAny()) { barColor(); return; }
    P.sound('key');
    pickColor('ЦВЕТ ИНТЕРФЕЙСА', '', function (id) { setColor(id); });
  });
  function canAny() { return !!P.acc() && SG.anyColor(P.game, P.acc(), P.state.chapter, my()); }
  function barColor() { barBtn.hidden = !canAny(); }
  P.on('modules', barColor);
  P.on('route', barColor);

  /* Оттенок снимка при показе (П-49): снимок хранится без цвета, в чате окрашивается цветом отправителя (если закреплён)
     или цветом читающего. Запоминается, чтобы не перекрашивать заново. */
  var tints = {}, tintN = 0;
  P.tintPhoto = function (img, src, hex) {
    hex = SG.hexOk(hex) || P.curHex();
    var key = hex + (src.length + ':' + src.slice(-40));
    if (tints[key]) { img.src = tints[key]; return; }
    img.src = src;
    var im = new Image();
    im.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = im.width; cv.height = im.height;
      var x = cv.getContext('2d');
      x.drawImage(im, 0, 0);
      var d = x.getImageData(0, 0, cv.width, cv.height), a = d.data, t = SG.rgbOf(hex);
      for (var i = 0; i < a.length; i += 4) {
        var l = Math.max(a[i], a[i + 1], a[i + 2]) / 255;
        a[i] = t[0] * l; a[i + 1] = t[1] * l; a[i + 2] = t[2] * l;
      }
      x.putImageData(d, 0, 0);
      if (++tintN > 80) { tints = {}; tintN = 0; }
      tints[key] = cv.toDataURL('image/jpeg', 0.8);
      img.src = tints[key];
    };
    im.src = src;
  };

  /* ---------- своя клавиатура (П-54) ---------- */
  var LAYOUTS = {
    ru: ['йцукенгшщзхъ', 'фывапролджэ', '⇧ячсмитьбю⌫'],
    en: ['qwertyuiop', 'asdfghjkl', '⇧zxcvbnm⌫'],
    sym: ['1234567890', '-/:;()«»?!', '.,"\'@#%+=*⌫']
  };
  /* Клавиатура для поля input. o: {upper — всегда заглавные (коды), auto — заглавная в начале фразы,
     enter(), hide() — кнопка ⌄, sys() — кнопка ⌨ (системная клавиатура), start: 'ru' | 'sym'}. */
  /* П25 (06, 141): сбой «не те буквы» — с вероятностью P.typoLevel() клавиша печатает соседнюю букву своего ряда. */
  function typo(ch) {
    var lv = P.typoLevel ? P.typoLevel() : 0;
    if (!lv || !/[a-zа-яё]/i.test(ch) || Math.random() >= lv) return ch;
    var low = ch.toLowerCase(), row = '';
    Object.keys(LAYOUTS).forEach(function (l) { LAYOUTS[l].forEach(function (r) { if (r.indexOf(low) >= 0) row = r.replace(/[^a-zа-яё]/g, ''); }); });
    if (row.length < 2) return ch;
    var i = row.indexOf(low), j = i + (Math.random() < 0.5 ? -1 : 1);
    if (j < 0 || j >= row.length) j = i ? i - 1 : 1;
    return ch === low ? row[j] : row[j].toUpperCase();
  }
  function kbd(input, o) {
    o = o || {};
    var el = document.createElement('div');
    el.className = 'kbd';
    var lay = o.start || 'ru', letters = 'ru', shift = false, held = false, timer = 0, rep = 0;
    function autoShift() {
      if (!o.auto || o.upper) return;
      var v = input.value;
      shift = !v.trim() || /[.!?]\s+$/.test(v);
    }
    function ins(s) {
      var v = input.value;
      var a = v.length, b = v.length;
      if (document.activeElement === input && input.selectionStart != null) { a = input.selectionStart; b = input.selectionEnd; }
      if (s === '\b') {
        if (a === b) a = Math.max(0, a - 1);
        input.value = v.slice(0, a) + v.slice(b);
        b = a;
      } else {
        var max = input.maxLength > 0 ? input.maxLength : 100000;
        if (v.length - (b - a) + s.length > max) return;
        input.value = v.slice(0, a) + s + v.slice(b);
        a = b = a + s.length;
      }
      if (document.activeElement === input) { try { input.selectionStart = input.selectionEnd = b; } catch (e) { /* number */ } }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function press(k) {
      P.sound('key');
      if (k === '⌫') ins('\b');
      else if (k === '⇧') { shift = !shift; draw(); return; }
      else if (k === '123') { lay = 'sym'; }
      else if (k === 'АБВ' || k === 'ABC') { lay = letters; }
      else if (k === 'EN') { lay = letters = 'en'; }
      else if (k === 'RU') { lay = letters = 'ru'; }
      else if (k === '⏎') { if (o.newline) ins('\n'); else if (o.enter) o.enter(); }
      else if (k === '⌄') { if (o.hide) o.hide(); return; }
      else if (k === '⌨') { if (o.sys) o.sys(); return; }
      else if (k === '␣') ins(' ');
      else { ins(typo(shift || o.upper ? k.toUpperCase() : k)); if (shift) shift = false; }
      autoShift();
      draw();
      // П15: нажатая клавиша подсвечивается и после перерисовки (раньше подсветка пропадала вместе со старой кнопкой)
      lit(k);
    }
    function lit(k) {
      var b = el.querySelector('.k[data-k="' + (k === '"' ? '\\"' : k) + '"]');
      if (!b) return;
      b.classList.add('dn');
      setTimeout(function () { b.classList.remove('dn'); }, 160);
    }
    function key(k, cls) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'k' + (cls ? ' ' + cls : '');
      b.dataset.k = k;
      b.textContent = k === '␣' ? '' : /^[a-zа-яё]$/.test(k) && (shift || o.upper) ? k.toUpperCase() : k;
      if (k === '⇧' && shift) b.className += ' on';
      // клавиша не забирает фокус у поля (курсор остаётся на месте)
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('pointerdown', function () {
        b.classList.add('dn');
        held = false;
        clearTimeout(timer); clearInterval(rep);
        if (k === 'е') timer = setTimeout(function () { held = true; ins(shift || o.upper ? 'Ё' : 'ё'); if (shift) shift = false; draw(); }, 450);
        if (k === '⌫') timer = setTimeout(function () { held = true; rep = setInterval(function () { ins('\b'); }, 70); }, 450);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) { b.addEventListener(t, function () { clearTimeout(timer); clearInterval(rep); setTimeout(function () { b.classList.remove('dn'); }, 120); }); });
      b.addEventListener('click', function () { if (held) { held = false; return; } press(k); });
      return b;
    }
    function draw() {
      el.innerHTML = '';
      LAYOUTS[lay].forEach(function (row) {
        var r = document.createElement('div');
        r.className = 'kr';
        row.split('').forEach(function (k) {
          if (k === '⇧' && o.upper) return;
          r.appendChild(key(k, k === '⇧' || k === '⌫' ? 'fn' : ''));
        });
        el.appendChild(r);
      });
      var r = document.createElement('div');
      r.className = 'kr';
      r.appendChild(key(lay === 'sym' ? (letters === 'ru' ? 'АБВ' : 'ABC') : '123', 'fn'));
      if (lay !== 'sym') r.appendChild(key(lay === 'ru' ? 'EN' : 'RU', 'fn'));
      if (o.sys) r.appendChild(key('⌨', 'fn'));
      r.appendChild(key('␣', 'space'));
      r.appendChild(key(',', ''));
      if (o.hide) r.appendChild(key('⌄', 'fn'));
      r.appendChild(key('⏎', 'fn ok'));
      el.appendChild(r);
    }
    autoShift();
    draw();
    el.refresh = function () { autoShift(); draw(); };
    el.layout = function (l) { lay = l; if (l !== 'sym') letters = l; draw(); };
    return el;
  }
  P.kbd = kbd;
  /* Клавиатура: своя или телефона — выбирает игрок (первый вход, код настроек); в редакторе можно оставить только телефонную. */
  P.kbdMode = function () {
    if (P.game && P.game.keyboard === 'sys') return 'sys';
    return P.state && P.state.kbd === 'sys' ? 'sys' : 'own';
  };

  /* Своя клавиатура у текстового поля: показывается при касании поля, ⌄ — убрать. */
  P.attachKbd = function (input, after, o) {
    o = o || {};
    if (P.kbdMode() === 'sys') { input.removeAttribute('inputmode'); return null; }
    input.setAttribute('inputmode', 'none');
    var k = kbd(input, { auto: o.auto, enter: o.enter, start: o.start, newline: o.newline,
      hide: function () { k.hidden = true; input.blur(); if (o.onHide) o.onHide(); } });
    k.hidden = !o.open;
    after.parentNode.insertBefore(k, after.nextSibling);
    function show() { if (input.getAttribute('inputmode') === 'none') { k.hidden = false; k.refresh(); if (o.onShow) o.onShow(); } }
    input.addEventListener('focus', show);
    input.addEventListener('click', show);
    return k;
  };

  /* ---------- первый вход (П-55): разрешения, затем цвет ---------- */
  function camCheck(kind) {
    if (native && native.perms) return native.perms({}).then(function (r) { return !!r[kind]; });
    if (navigator.permissions && navigator.permissions.query) {
      return navigator.permissions.query({ name: kind === 'cam' ? 'camera' : 'microphone' })
        .then(function (r) { return r.state === 'granted' ? true : r.state === 'denied' ? false : null; }, function () { return null; });
    }
    return Promise.resolve(null);
  }
  function camAsk(kind) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(false);
    return navigator.mediaDevices.getUserMedia(kind === 'cam' ? { video: true } : { audio: true })
      .then(function (s) { s.getTracks().forEach(function (t) { t.stop(); }); return true; }, function () { return false; });
  }
  function nat(key, ask) {
    if (!native) return Promise.resolve(undefined);   // в браузере не нужно
    if (key === 'battery') return native.battery({ ask: !!ask }).then(function (r) { return !!r.ok; }, function () { return null; });
    if (!native.perms) return Promise.resolve(undefined);
    return native.perms(ask ? { ask: key } : {}).then(function (r) { return r[key] == null ? undefined : !!r[key]; }, function () { return null; });
  }
  var PERMS = [
    { id: 'cam', name: 'Камера', why: 'сканер QR, приборы, снимки', need: true, check: function () { return camCheck('cam'); }, ask: function () { return camAsk('cam'); } },
    { id: 'mic', name: 'Микрофон', why: 'звук в приложении и коды звуком', check: function () { return camCheck('mic'); }, ask: function () { return camAsk('mic'); } },
    { id: 'notify', name: 'Уведомления', why: 'сообщения и тревоги при погашенном экране', need: true, check: function () { return nat('notify'); }, ask: function () { return nat('notify', true); } },
    { id: 'full', name: 'Окно поверх экрана', why: 'аварийный режим включает экран', check: function () { return nat('full'); }, ask: function () { return nat('full', true); } },
    { id: 'battery', name: 'Работа в фоне', why: 'связь не рвётся, когда экран погашен', check: function () { return nat('battery'); }, ask: function () { return nat('battery', true); } },
    { id: 'sound', name: 'Звук', why: 'нажмите — должен прозвучать сигнал', check: function () { return Promise.resolve(!!soundOk); }, ask: function () { soundOk = true; P.sound('ok'); if (navigator.vibrate) navigator.vibrate(120); return Promise.resolve(true); } }
  ];
  var soundOk = false, poll = 0, res = {};
  function firstNeeded() {
    var g = P.game;
    return !!(g && g.firstRun && P.acc() && !P.preview && !P.mine().first);
  }
  function drawPerms() {
    var box = $('first-body');
    box.innerHTML = '<p class="tab-title">ПЕРВЫЙ ВХОД</p><p class="hint">Проверка телефона перед игрой. Нажмите «РАЗРЕШИТЬ» и согласитесь в окне Android.</p>';
    PERMS.forEach(function (p) {
      var v = res[p.id];
      if (v === undefined && p.id !== 'sound' && p.id !== 'cam' && p.id !== 'mic') return;   // не нужно на этом устройстве
      var row = document.createElement('div');
      row.className = 'perm ' + (v ? 'ok' : p.need ? 'need' : 'opt');
      row.dataset.perm = p.id;
      row.innerHTML = '<span class="pm">' + (v ? '✓' : '✗') + '</span><span class="pt"><b></b><small></small></span>';
      row.querySelector('b').textContent = p.name + (p.need ? '' : ' (желательно)');
      row.querySelector('small').textContent = p.why;
      if (!v) {
        var b = document.createElement('button');
        b.className = 'btn small';
        b.textContent = p.id === 'sound' ? 'ПРОВЕРИТЬ' : 'РАЗРЕШИТЬ';
        b.addEventListener('click', function () { p.ask().then(function () { setTimeout(refresh, 300); }); });
        row.appendChild(b);
      }
      box.appendChild(row);
    });
    var miss = PERMS.filter(function (p) { return p.need && res[p.id] !== undefined && !res[p.id]; });
    var go = document.createElement('button');
    go.className = 'btn';
    go.id = 'first-go';
    go.textContent = 'ДАЛЕЕ';
    go.disabled = !!miss.length;
    var note = document.createElement('p');
    note.className = 'hint';
    note.textContent = miss.length ? 'Без разрешений «' + miss.map(function (p) { return p.name; }).join('», «') + '» дальше нельзя.' :
      PERMS.some(function (p) { return !p.need && res[p.id] === false; }) ? 'Желательные разрешения можно дать и позже, но в игре что-то может не сработать.' : 'Всё готово.';
    go.addEventListener('click', kbdStep);
    box.appendChild(note);
    box.appendChild(go);
  }
  function refresh() {
    if (!$('first').classList.contains('on')) return;
    Promise.all(PERMS.map(function (p) { return p.check().then(function (v) { res[p.id] = v; }, function () { res[p.id] = null; }); }))
      .then(function () {
        // камера и микрофон в браузере без ответа — спросить при нажатии
        drawPerms();
      });
  }
  /* Клавиатура приложения или телефона (П-54) — выбор игрока; потом меняется кодом настроек. */
  function kbdStep() {
    clearInterval(poll);
    if (P.game.keyboard === 'sys') { colorStep(); return; }
    var box = $('first-body');
    box.innerHTML = '<p class="tab-title">КЛАВИАТУРА</p><p class="hint">Чем набирать текст в чатах и заметках. Потом можно поменять в настройках (код у мастера).</p>';
    [['own', 'КЛАВИАТУРА ПРИЛОЖЕНИЯ', 'буквы и цифры в стиле игры'], ['sys', 'КЛАВИАТУРА ТЕЛЕФОНА', 'обычная клавиатура Android']].forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'btn' + (k[0] === 'sys' ? ' dim' : '');
      b.dataset.kbd = k[0];
      b.innerHTML = k[1] + '<small style="display:block;letter-spacing:0;text-transform:none;font-size:11px;margin-top:4px"></small>';
      b.querySelector('small').textContent = k[2];
      b.addEventListener('click', function () { P.state.kbd = k[0]; P.save(); P.sound('key'); colorStep(); });
      box.appendChild(b);
    });
  }
  function colorStep() {
    clearInterval(poll);
    var cfg = SG.colorCfg(P.acc(), P.state.chapter);
    if (!cfg.choose || !SG.allowedColors(P.game, P.state.chapter).length) { done(); return; }
    var box = $('first-body');
    box.innerHTML = '<p class="tab-title">ЦВЕТ ИНТЕРФЕЙСА</p><p class="hint">Выберите цвет своего приложения.</p>';
    var grid = document.createElement('div');
    grid.className = 'swatches';
    var cur = SG.effColor(P.game, P.acc(), P.state.chapter, my());
    SG.allowedColors(P.game, P.state.chapter).forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'swatch' + (c.id === cur ? ' on' : '');
      b.dataset.color = c.id;
      b.style.color = c.color;
      b.style.borderColor = c.color;
      b.innerHTML = '<i></i><span></span>';
      b.querySelector('i').style.background = c.color;
      b.querySelector('span').textContent = c.name;
      b.addEventListener('click', function () {
        var m = P.mine();
        m.color = c.id; m.colorCh = P.state.chapter; m.colorBy = '';
        P.applyTheme();
        P.sound('key');
        grid.querySelectorAll('.swatch').forEach(function (x) { x.classList.toggle('on', x === b); });
      });
      grid.appendChild(b);
    });
    box.appendChild(grid);
    var go = document.createElement('button');
    go.className = 'btn';
    go.id = 'first-done';
    go.textContent = 'ГОТОВО';
    go.addEventListener('click', done);
    box.appendChild(go);
  }
  function done() {
    clearInterval(poll);
    P.mine().first = Date.now();
    P.save();
    $('first').classList.remove('on');
    P.applyTheme();
    P.glitch();
    P.sound('ok');
    P.renderBar();
  }
  P.firstRun = function (force) {
    if (!force && !firstNeeded()) return;
    if (force && P.acc()) delete P.mine().first;
    res = {};
    $('first').classList.add('on');
    drawPerms();
    refresh();
    clearInterval(poll);
    poll = setInterval(refresh, 1500);   // вернулись из окна Android — обновить галочки
  };
  P.on('login', function () { P.firstRun(); });
  P.on('route', function () { if (firstNeeded() && !$('first').classList.contains('on')) P.firstRun(); });
})();
