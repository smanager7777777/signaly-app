/* СИГНАЛЫ — редактор приложения. Нужны JSZip, qrcode-generator, logic.js (window.SG). */
(function () {
  'use strict';
  var SG = window.SG;
  var $ = function (id) { return document.getElementById(id); };

  var P = { game: SG.newGame(), files: {} };   // проект: game.json + файлы медиа (имя → Blob)
  var ui = { tab: 'general', sel: {}, filter: {}, qr: { picked: null }, pv: {} };
  var urls = {};

  /* ---------- построение элементов ---------- */
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'on') Object.keys(v).forEach(function (e) { el.addEventListener(e, v[e]); });
      else if (k === 'style') el.style.cssText = v;
      else if (k in el && k !== 'list' && k !== 'type') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }

  /* ---------- автосохранение в браузере ---------- */
  var saveTimer = 0;
  function idb() {
    return new Promise(function (ok, fail) {
      var r = indexedDB.open('signaly-editor', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { fail(r.error); };
    });
  }
  function idbGet(k) {
    return idb().then(function (d) {
      return new Promise(function (ok) {
        var q = d.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = function () { ok(q.result); };
        q.onerror = function () { ok(null); };
      });
    });
  }
  function idbPut(k, v) {
    return idb().then(function (d) {
      return new Promise(function (ok, fail) {
        var t = d.transaction('kv', 'readwrite');
        t.objectStore('kv').put(v, k);
        t.oncomplete = function () { ok(); };
        t.onerror = function () { fail(t.error); };
      });
    });
  }
  function status(t) { $('status').textContent = t; }
  var dirty = false;
  function changed() {
    dirty = true;
    status('изменено…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      idbPut('project', { game: P.game, files: P.files }).then(function () {
        status('черновик сохранён в браузере ' + new Date().toLocaleTimeString().slice(0, 5));
      }).catch(function (e) { status('НЕ СОХРАНЕНО в браузере: ' + e.message); });
    }, 600);
    renderNav();
  }

  /* ---------- медиа ---------- */
  function fileUrl(name) {
    if (!P.files[name]) return '';
    if (!urls[name]) urls[name] = URL.createObjectURL(P.files[name]);
    return urls[name];
  }
  function dropUrl(name) { if (urls[name]) { URL.revokeObjectURL(urls[name]); delete urls[name]; } }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toLowerCase() : ''; }
  var IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
  var AUD = ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'opus'];
  function kindOf(name) {
    var e = ext(name);
    return IMG.indexOf(e) >= 0 ? 'image' : AUD.indexOf(e) >= 0 ? 'audio' : 'other';
  }
  function safeName(name) {
    var n = name.replace(/[\\/:*?"<>|#%]+/g, '_').replace(/\s+/g, ' ').trim() || 'file';
    if (!P.files[n]) return n;
    var base = n.replace(/(\.[^.]*)?$/, ''), e = n.slice(base.length), i = 2;
    while (P.files[base + ' (' + i + ')' + e]) i++;
    return base + ' (' + i + ')' + e;
  }
  var mediaCb = null;
  function pickMedia(accept, cb) {
    var inp = $('media-file');
    inp.accept = accept === 'image' ? 'image/*' : accept === 'audio' ? 'audio/*,.mp3' : 'image/*,audio/*,.mp3';
    inp.multiple = !cb;
    mediaCb = cb;
    inp.click();
  }
  $('media-file').addEventListener('change', function () {
    var list = Array.prototype.slice.call($('media-file').files);
    $('media-file').value = '';
    var names = list.map(function (f) {
      var n = safeName(f.name);
      P.files[n] = f;
      return n;
    });
    var big = list.filter(function (f) { return kindOf(f.name) === 'audio' && f.size > 4 * 1024 * 1024; });
    if (big.length) alert('Большие звуковые файлы (больше 4 МБ): ' + big.map(function (f) { return f.name; }).join(', ') +
      '.\nЛучше сжать их в MP3 64–96 кбит/с, иначе приложение станет тяжёлым.');
    changed();
    if (mediaCb && names.length) { var cb = mediaCb; mediaCb = null; cb(names[0]); }
    else render();
  });
  function size(n) {
    return n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ';
  }
  function totalSize() {
    return Object.keys(P.files).reduce(function (s, k) { return s + (P.files[k].size || 0); }, 0);
  }

  /* ---------- поля форм ---------- */
  // fld(подпись, объект, ключ, {type, hint, placeholder, area, list, after, number})
  function fld(label, obj, key, o) {
    o = o || {};
    var input;
    if (o.area) {
      input = h('textarea', { value: obj[key] || '', placeholder: o.placeholder || '', rows: o.rows || 6 });
    } else if (o.options) {
      input = h('select', {});
      o.options.forEach(function (op) {
        input.appendChild(h('option', { value: op[0], text: op[1], selected: String(obj[key]) === String(op[0]) }));
      });
    } else {
      input = h('input', { type: o.type || 'text', value: obj[key] == null ? '' : obj[key], placeholder: o.placeholder || '' });
      if (o.list) input.setAttribute('list', o.list);
    }
    var ev = o.options || o.type === 'color' ? 'change' : 'input';
    input.addEventListener(ev, function () {
      var v = input.value;
      if (o.number) v = Math.max(1, parseInt(v, 10) || 1);
      obj[key] = v;
      changed();
      if (o.after) o.after(v);
    });
    if (o.type === 'color') input.addEventListener('input', function () { obj[key] = input.value; if (o.after) o.after(); });
    return h('div', { class: 'f' }, h('label', { text: label }), o.button ? h('div', { class: 'inline' }, input, o.button(input)) : input,
      o.hint ? h('div', { class: 'hint', text: o.hint }) : null);
  }
  function check(label, obj, key, after) {
    var c = h('input', { type: 'checkbox', checked: !!obj[key] });
    c.addEventListener('change', function () { obj[key] = c.checked; changed(); if (after) after(); });
    return h('label', { class: 'f row', style: 'cursor:pointer' }, c, label);
  }
  function randomCode(len) {
    var used = {};
    allCodes().forEach(function (c) { used[SG.norm(c.code)] = 1; });
    for (var t = 0; t < 1000; t++) {
      var s = '';
      for (var i = 0; i < (len || 4); i++) s += Math.floor(Math.random() * 10);
      if (s[0] !== '0' && !used[s]) return s;
    }
    return String(Date.now()).slice(-6);
  }
  function randBtn(obj, key, len) {
    return function (input) {
      return h('button', { text: 'Случайный', title: 'Придумать неповторяющийся код из цифр', on: { click: function () {
        obj[key] = randomCode(len); input.value = obj[key]; changed();
      } } });
    };
  }
  function chapterOptions() {
    return P.game.chapters.map(function (c, i) { return [i + 1, (i + 1) + '. ' + c.name]; });
  }

  // список «кому» — галочки по аккаунтам
  function whoEditor(list, hint) {
    var g = P.game;
    if (!g.accounts.length) return h('div', { class: 'hint', text: 'Аккаунтов пока нет — блок виден всем.' });
    var info = h('div', { class: 'hint' });
    function upd() { info.textContent = list.length ? (hint || '') : 'Ничего не отмечено — всем аккаунтам.'; }
    upd();
    return h('div', {},
      h('div', { class: 'checks' }, g.accounts.map(function (a) {
        var c = h('input', { type: 'checkbox', checked: list.indexOf(a.id) >= 0 });
        c.addEventListener('change', function () {
          var i = list.indexOf(a.id);
          if (c.checked && i < 0) list.push(a.id);
          if (!c.checked && i >= 0) list.splice(i, 1);
          changed(); upd();
        });
        return h('label', {}, c, (a.name || '(без имени)') + (a.profession ? ' — ' + a.profession : ''));
      })), info);
  }

  // список блоков — галочки, с поиском
  function blocksPicker(list) {
    var box = h('div', { class: 'checks col' });
    var search = h('input', { type: 'search', placeholder: 'Найти блок…', style: 'width:100%;margin-bottom:4px' });
    function draw() {
      box.innerHTML = '';
      var q = search.value.toLowerCase();
      var last = null;
      sortedBlocks().forEach(function (b) {
        if (q && (b.title + ' ' + b.section).toLowerCase().indexOf(q) < 0) return;
        if (b.section !== last) { last = b.section; box.appendChild(h('div', { class: 'sec', text: folderLabel(b.section) || 'без папки' })); }
        var c = h('input', { type: 'checkbox', checked: list.indexOf(b.id) >= 0 });
        c.addEventListener('change', function () {
          var i = list.indexOf(b.id);
          if (c.checked && i < 0) list.push(b.id);
          if (!c.checked && i >= 0) list.splice(i, 1);
          changed();
        });
        box.appendChild(h('label', {}, c, b.title || '(без названия)', b.who.length ? h('span', { class: 'tag', text: whoShort(b.who) }) : null));
      });
      if (!P.game.blocks.length) box.appendChild(h('div', { class: 'hint', text: 'Блоков пока нет.' }));
    }
    search.addEventListener('input', draw);
    draw();
    return h('div', {}, P.game.blocks.length > 8 ? search : null, box);
  }
  function whoShort(who) {
    return who.map(function (id) { var a = SG.byId(P.game.accounts, id); return a ? a.name || '?' : '?'; }).join(', ');
  }
  function sortedBlocks() {
    // блоки по папкам в порядке дерева; внутри папки — в порядке списка
    var keys = SG.folderList(P.game.blocks);
    function rank(b) { var k = SG.folderKey(b.section); return k ? keys.indexOf(k) + 1 : 0; }
    return P.game.blocks.slice().sort(function (a, b) {
      return rank(a) - rank(b) || P.game.blocks.indexOf(a) - P.game.blocks.indexOf(b);
    });
  }
  function folderLabel(section) {
    var p = SG.folderPath(section);
    return p.length ? p.join(' › ') : '';
  }

  // содержимое блока или профиля: текст, картинки, звук
  function itemsEditor(items) {
    var wrap = h('div', {});
    function redraw() { var n = itemsEditor(items); wrap.replaceWith(n); }
    items.forEach(function (it, i) {
      var head = h('div', { class: 'ih' },
        h('b', { text: it.type === 'text' ? 'Текст' : it.type === 'image' ? 'Картинка' : 'Звук' }), h('span', { class: 'sp' }),
        h('button', { class: 'small', text: '↑', title: 'Выше', disabled: i === 0, on: { click: function () { items.splice(i - 1, 0, items.splice(i, 1)[0]); changed(); redraw(); } } }),
        h('button', { class: 'small', text: '↓', title: 'Ниже', disabled: i === items.length - 1, on: { click: function () { items.splice(i + 1, 0, items.splice(i, 1)[0]); changed(); redraw(); } } }),
        h('button', { class: 'small danger', text: 'Удалить', on: { click: function () { items.splice(i, 1); changed(); redraw(); } } }));
      var body;
      if (it.type === 'text') {
        body = fld('', it, 'text', { area: true, rows: 7, placeholder: 'Текст. # Заголовок, **жирный**, _курсив_, ~~зачёркнутый~~, --- линия' });
      } else {
        body = h('div', {}, mediaSelect(it, redraw),
          it.type === 'image' ? fld('Подпись под картинкой', it, 'caption') : fld('Название записи (видно игроку)', it, 'title'),
          it.file && P.files[it.file] ? (it.type === 'image' ? h('img', { src: fileUrl(it.file) }) : h('audio', { controls: true, src: fileUrl(it.file) })) : null);
      }
      wrap.appendChild(h('div', { class: 'item-ed' }, head, body));
    });
    wrap.appendChild(h('div', { class: 'addrow' },
      h('button', { text: '+ Текст', on: { click: function () { items.push({ type: 'text', text: '' }); changed(); redraw(); } } }),
      h('button', { text: '+ Картинка', on: { click: function () { items.push({ type: 'image', file: '', caption: '' }); changed(); redraw(); } } }),
      h('button', { text: '+ Звук (mp3)', on: { click: function () { items.push({ type: 'audio', file: '', title: '' }); changed(); redraw(); } } })));
    return wrap;
  }
  function mediaSelect(it, redraw) {
    var sel = h('select', {});
    sel.appendChild(h('option', { value: '', text: '— выберите файл —' }));
    Object.keys(P.files).sort().forEach(function (n) {
      if (kindOf(n) !== it.type) return;
      sel.appendChild(h('option', { value: n, text: n + ' (' + size(P.files[n].size) + ')', selected: it.file === n }));
    });
    if (it.file && !P.files[it.file]) sel.appendChild(h('option', { value: it.file, text: it.file + ' — ФАЙЛА НЕТ', selected: true }));
    sel.addEventListener('change', function () { it.file = sel.value; changed(); redraw(); });
    return h('div', { class: 'f' }, h('label', { text: 'Файл' }), h('div', { class: 'inline' }, sel,
      h('button', { text: 'Загрузить новый…', on: { click: function () {
        pickMedia(it.type, function (name) { it.file = name; changed(); redraw(); });
      } } })));
  }

  /* ---------- список слева + форма справа ---------- */
  function twoCol(o) {
    // o: {key, items, label(it), small(it), group(it), add(), form(it), tools}
    var sel = ui.sel[o.key];
    var cur = o.items.filter(function (x) { return x.id === sel; })[0] || o.items[0];
    if (cur) ui.sel[o.key] = cur.id;
    var list = h('div', { class: 'list' });
    function drawList() {
      list.innerHTML = '';
      var q = (ui.filter[o.key] || '').toLowerCase();
      var search = h('input', { type: 'search', placeholder: 'Поиск…', value: ui.filter[o.key] || '' });
      search.addEventListener('input', function () { ui.filter[o.key] = search.value; drawList(); search.focus(); search.setSelectionRange(search.value.length, search.value.length); });
      list.appendChild(h('div', { class: 'tools' }, search, h('button', { class: 'main', text: '+ Добавить', on: { click: function () {
        var it = o.add(); ui.sel[o.key] = it.id; changed(); render();
      } } })));
      var last = {};
      o.items.forEach(function (it) {
        var text = o.label(it) + ' ' + (o.small ? o.small(it) : '') + ' ' + (o.group ? o.group(it) : '');
        if (q && text.toLowerCase().indexOf(q) < 0) return;
        if (o.group) {
          var g = o.group(it);
          if (g !== last.g) { last.g = g; list.appendChild(h('div', { class: 'grp', text: (o.groupLabel ? o.groupLabel(g) : g) || (o.noGroup || 'без раздела') })); }
        }
        list.appendChild(h('div', { class: 'row' + (it === cur ? ' on' : ''), on: { click: function () { ui.sel[o.key] = it.id; render(); } } },
          h('span', { class: 'nm', text: o.label(it) || '(пусто)' }), o.small ? h('span', { class: 'sm', text: o.small(it) }) : null));
      });
      if (!o.items.length) list.appendChild(h('div', { class: 'empty', text: 'Пока пусто' }));
    }
    drawList();
    var form = h('div', { class: 'form' }, cur ? o.form(cur, drawList) : h('div', { class: 'empty', text: 'Нажмите «+ Добавить»' }));
    return h('div', { class: 'two' }, list, form);
  }
  function moveDel(arr, it, after) {
    var i = arr.indexOf(it);
    return h('div', { class: 'inline', style: 'justify-content:flex-end;margin-bottom:10px' },
      h('button', { text: '↑ Выше', disabled: i === 0, on: { click: function () { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); changed(); render(); } } }),
      h('button', { text: '↓ Ниже', disabled: i === arr.length - 1, on: { click: function () { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); changed(); render(); } } }),
      after || null,
      h('button', { class: 'danger', text: 'Удалить', on: { click: function () {
        if (!confirm('Удалить «' + (it.name || it.title || it.code || it.note || '') + '»?')) return;
        arr.splice(i, 1);
        if (it.id) cleanupRefs(it.id);
        changed(); render();
      } } }));
  }
  function cleanupRefs(id) {
    var g = P.game;
    g.blocks.forEach(function (b) { b.who = b.who.filter(function (x) { return x !== id; }); });
    g.codes.forEach(function (c) {
      c.who = c.who.filter(function (x) { return x !== id; });
      c.opens = c.opens.filter(function (x) { return x !== id; });
      c.deniedOpens = c.deniedOpens.filter(function (x) { return x !== id; });
    });
  }

  /* ---------- вкладки ---------- */
  var TABS = [
    ['general', 'Общее'], ['chapters', 'Главы и стили'], ['accounts', 'Аккаунты'], ['blocks', 'Блоки данных'],
    ['codes', 'Коды'], ['table', 'Таблица кодов'], ['media', 'Медиа'], ['check', 'Проверка'], ['qr', 'QR-коды'], ['preview', 'Предпросмотр']
  ];
  function renderNav() {
    var nav = $('nav');
    nav.innerHTML = '';
    var g = P.game;
    var probs = SG.problems(g, P.files);
    var errs = probs.filter(function (p) { return p.level === 'error'; }).length;
    var counts = { chapters: g.chapters.length, accounts: g.accounts.length, blocks: g.blocks.length, codes: g.codes.length,
      media: Object.keys(P.files).length, check: probs.length };
    TABS.forEach(function (t) {
      var c = counts[t[0]];
      nav.appendChild(h('button', { class: ui.tab === t[0] ? 'on' : '', on: { click: function () { ui.tab = t[0]; render(); } } },
        t[1], c != null ? h('span', { class: 'cnt' + (t[0] === 'check' && errs ? ' err' : ''), text: String(c) }) : null));
    });
  }
  function render() {
    renderNav();
    var p = $('panel');
    var keepScroll = p.scrollTop;
    p.innerHTML = '';
    var f = { general: pGeneral, chapters: pChapters, accounts: pAccounts, blocks: pBlocks, codes: pCodes, table: pTable, media: pMedia,
      check: pCheck, qr: pQr, preview: pPreview }[ui.tab];
    add(p, f());
    if (ui.tab !== 'preview') p.scrollTop = keepScroll;
  }

  function pGeneral() {
    var g = P.game;
    var T = g.texts;
    var lab = {
      loginTitle: 'Экран входа', wrongCode: 'Неверный код', denied: 'Нет доступа (по умолчанию)', already: 'Код уже введён',
      tooEarly: 'Код ещё не действует (глава не наступила)', opened: 'Код сработал', chapter: 'Переход главы (начало надписи)'
    };
    return [h('h1', { text: 'Общее' }),
      h('p', { class: 'lead', text: 'Название игры, мастерский код и служебные надписи приложения. Пакет игры — это один файл .sgpack: в нём все тексты, коды и медиа. Его загружают в приложение на каждом телефоне.' }),
      h('div', { class: 'card' }, h('h3', { text: 'Пакет' }),
        h('div', { class: 'grid2' },
          fld('Название (видно на экране входа)', g, 'title'),
          fld('Версия пакета', g, 'version', { number: true, type: 'number', hint: 'Растёт сама при каждом «Сохранить пакет». Мастер видит её в режиме мастера на телефоне.' })),
        fld('Мастерский код', g, 'masterCode', { button: randBtn(g, 'masterCode', 6),
          hint: 'Введённый или отсканированный на любом телефоне, открывает режим мастера: сменить аккаунт, выставить главу, сбросить, загрузить другой пакет. Не давайте его игрокам.' }),
        fld('Комментарий к мастерскому коду', g, 'masterComment', { placeholder: 'например: QR на карточке мастера', hint: 'Видно только в редакторе (и в таблице кодов).' })),
      h('div', { class: 'card' }, h('h3', { text: 'Служебные надписи' }),
        h('div', { class: 'grid2' }, Object.keys(SG.DEFAULT_TEXTS).map(function (k) { return fld(lab[k] || k, T, k); })))];
  }

  function pChapters() {
    var g = P.game;
    return [h('h1', { text: 'Главы и стили' }),
      h('p', { class: 'lead', text: 'Каждая глава — свой стиль интерфейса. Игрок сканирует или вводит код главы, и приложение переходит в неё: меняется оформление, открываются блоки этой главы. Переход только вперёд; мастер может выставить любую главу.' }),
      twoCol({
        key: 'chapters', items: g.chapters,
        label: function (c) { return (g.chapters.indexOf(c) + 1) + '. ' + c.name; },
        small: function (c) { return c.code || (g.chapters.indexOf(c) ? 'нет кода' : 'начальная'); },
        add: function () {
          var prev = g.chapters[g.chapters.length - 1];
          var c = { id: SG.uid('c'), name: 'Глава ' + (g.chapters.length + 1), code: randomCode(5), message: '', theme: SG.clone(prev ? prev.theme : SG.DEFAULT_THEME) };
          g.chapters.push(c);
          return c;
        },
        form: function (c, drawList) {
          var idx = g.chapters.indexOf(c);
          var sample = h('div', { class: 'sample' });
          function paint() {
            var t = c.theme;
            sample.style.background = t.bg;
            sample.style.color = t.text;
            sample.style.border = '1px solid ' + t.dim;
            sample.style.fontFamily = SG.FONTS[t.font] || SG.FONTS.mono;
            sample.style.textShadow = t.glow ? '0 0 4px ' + t.text : 'none';
            sample.innerHTML = '<div style="background:' + t.panel + ';padding:6px 8px;border-bottom:1px solid ' + t.dim + ';margin:-14px -14px 10px;display:flex;justify-content:space-between"><span style="color:' + t.accent + '">ИМЯ ФАМИЛИЯ</span><span style="color:' + t.dim + '">' + SG.esc(c.name) + '</span></div>' +
              '<div style="color:' + t.dim + ';font-size:11px;letter-spacing:.2em">РАЗДЕЛ</div><div>≡ Обычный текст блока</div><div style="color:' + t.accent + '">Выделенный текст</div><div style="color:' + t.warn + '">НЕТ ДОСТУПА</div>';
          }
          paint();
          var colors = [['bg', 'Фон'], ['panel', 'Панели'], ['text', 'Текст'], ['dim', 'Приглушённый'], ['accent', 'Выделение'], ['warn', 'Тревога']];
          return [moveDel(g.chapters, c, null),
            h('div', { class: 'card' }, h('h3', { text: 'Глава' }),
              h('div', { class: 'grid2' },
                fld('Название', c, 'name', { after: function () { drawList(); paint(); } }),
                idx === 0 ? h('div', { class: 'f' }, h('label', { text: 'Код перехода' }), h('div', { class: 'hint', text: 'С первой главы игра начинается, код не нужен.' }))
                  : fld('Код перехода (QR)', c, 'code', { button: randBtn(c, 'code', 5), after: drawList })),
              idx > 0 ? fld('Сообщение при переходе', c, 'message', { area: true, rows: 3, placeholder: 'Необязательно. Появится в окне после смены главы.' }) : null),
            h('div', { class: 'card' }, h('h3', { text: 'Стиль интерфейса в этой главе' }),
              h('div', { class: 'colors' }, colors.map(function (k) {
                var inp = h('input', { type: 'color', value: c.theme[k[0]] });
                inp.addEventListener('input', function () { c.theme[k[0]] = inp.value; paint(); changed(); });
                return h('label', {}, inp, k[1]);
              })),
              h('div', { class: 'grid3', style: 'margin-top:12px' },
                check('Полосы монитора', c.theme, 'scanlines'), check('Свечение текста', c.theme, 'glow', paint), check('Мерцание', c.theme, 'flicker')),
              fld('Шрифт', c.theme, 'font', { options: [['mono', 'Моноширинный (Consolas)'], ['courier', 'Courier New'], ['sans', 'Обычный (без засечек)']], after: paint }),
              h('div', { class: 'inline' },
                h('button', { text: 'Как в первой главе', disabled: idx === 0, on: { click: function () { c.theme = SG.clone(g.chapters[0].theme); changed(); render(); } } }),
                h('button', { text: 'Чёрно-зелёный по умолчанию', on: { click: function () { c.theme = SG.clone(SG.DEFAULT_THEME); changed(); render(); } } }),
                h('button', { text: 'Открыть в предпросмотре', on: { click: function () { ui.pv.chapter = idx + 1; ui.tab = 'preview'; render(); } } })),
              sample)];
        }
      })];
  }

  function pAccounts() {
    var g = P.game;
    return [h('h1', { text: 'Аккаунты' }),
      h('p', { class: 'lead', text: 'Один аккаунт — один персонаж. В начале игры мастер вводит на телефоне игрока его код входа, и телефон остаётся в этом аккаунте; сменить его можно только мастерским кодом. Профиль (Мультипаспорт) виден игроку сверху на вкладке «Данные».' }),
      twoCol({
        key: 'accounts', items: g.accounts,
        label: function (a) { return a.name; }, small: function (a) { return a.profession; },
        add: function () {
          var a = { id: SG.uid('a'), name: 'Новый персонаж', profession: '', login: randomCode(6), items: [] };
          g.accounts.push(a);
          return a;
        },
        form: function (a, drawList) {
          var own = g.blocks.filter(function (b) { return b.who.indexOf(a.id) >= 0; });
          return [moveDel(g.accounts, a, h('button', { text: 'Посмотреть глазами игрока', on: { click: function () { ui.pv.account = a.id; ui.tab = 'preview'; render(); } } })),
            h('div', { class: 'card' }, h('h3', { text: 'Персонаж' }),
              h('div', { class: 'grid2' }, fld('Имя (в шапке приложения)', a, 'name', { after: drawList }), fld('Профессия', a, 'profession', { after: drawList })),
              fld('Код входа', a, 'login', { button: randBtn(a, 'login', 6), hint: 'Его вводит мастер в начале игры. Можно напечатать как QR (вкладка «QR-коды»).' })),
            h('div', { class: 'card' }, h('h3', { text: 'Профиль (Мультипаспорт)' }),
              h('div', { class: 'hint', style: 'margin-bottom:8px', text: 'Необязательно. Если пусто, карточки профиля не будет.' }), itemsEditor(a.items)),
            h('div', { class: 'card' }, h('h3', { text: 'Только для этого персонажа' }),
              own.length ? own.map(function (b) { return h('div', {}, '• ', b.title || '(без названия)'); }) : h('div', { class: 'hint', text: 'Блоков, отмеченных только для него, нет.' }))];
        }
      })];
  }

  function codesFor(b) {
    return P.game.codes.filter(function (c) { return c.opens.indexOf(b.id) >= 0 || c.deniedOpens.indexOf(b.id) >= 0; });
  }
  function pBlocks() {
    var g = P.game;
    var folders = SG.folderList(g.blocks);
    return [h('h1', { text: 'Блоки данных' }),
      h('p', { class: 'lead', text: 'Блок — одна запись в приложении: текст, картинки, звук. Блок может быть открыт с начала или открываться кодом; можно ограничить его персонажами и главой. Папки задаются полем «Папка»: вложенные — через «/», например «Процедуры/Медицина». У игрока папка видна, только если в ней есть открытые ему блоки.' }),
      h('datalist', { id: 'dl-sections' }, folders.map(function (s) { return h('option', { value: s }); })),
      folders.length ? foldersCard(folders) : null,
      twoCol({
        key: 'blocks', items: sortedBlocks(),
        label: function (b) { return b.title; },
        small: function (b) { return (b.start ? 'сразу' : codesFor(b).length ? 'код' : '—') + (b.chapter > 1 ? ' · гл.' + b.chapter : ''); },
        group: function (b) { return SG.folderKey(b.section); },
        groupLabel: folderLabel, noGroup: 'без папки',
        add: function () {
          var cur = SG.byId(g.blocks, ui.sel.blocks);
          var b = { id: SG.uid('b'), title: 'Новый блок', section: cur ? cur.section : '', who: [], chapter: 1, start: false, items: [{ type: 'text', text: '' }] };
          g.blocks.push(b);
          return b;
        },
        form: function (b, drawList) {
          var codes = codesFor(b);
          return [moveDel(g.blocks, b, h('button', { text: 'Копия', on: { click: function () {
            var c = SG.clone(b); c.id = SG.uid('b'); c.title += ' (копия)'; g.blocks.splice(g.blocks.indexOf(b) + 1, 0, c); ui.sel.blocks = c.id; changed(); render();
          } } })),
            h('div', { class: 'card' }, h('h3', { text: 'Блок' }),
              h('div', { class: 'grid2' }, fld('Название', b, 'title', { after: drawList }),
                fld('Папка', b, 'section', { list: 'dl-sections', placeholder: 'например: Процедуры/Медицина', after: drawList,
                  hint: 'Вложенные папки — через «/». Пусто — блок лежит сверху, вне папок.' })),
              h('div', { class: 'grid2' },
                fld('С какой главы виден', b, 'chapter', { options: chapterOptions(), number: true, after: drawList }),
                h('div', { class: 'f' }, h('label', { text: 'Как открывается' }), check('Открыт сразу (без кода)', b, 'start', drawList))),
              h('div', { class: 'f' }, h('label', { text: 'Кому виден' }), whoEditor(b.who, 'Остальные этот блок не увидят, даже введя код.')),
              h('div', { class: 'f' }, h('label', { text: 'Открывается кодами' }),
                codes.length ? h('div', {}, codes.map(function (c) {
                  return h('button', { class: 'small', style: 'margin:0 6px 6px 0', text: (c.code || '?') + (c.note ? ' — ' + c.note : ''), on: { click: function () { ui.sel.codes = c.id; ui.tab = 'codes'; render(); } } });
                })) : h('div', { class: 'hint', text: b.start ? 'Открыт сразу, код не нужен.' : 'Ни один код его не открывает.' }),
                h('div', {}, h('button', { text: '+ Новый код для этого блока', on: { click: function () {
                  var c = newCode(); c.opens.push(b.id); c.note = b.title; c.chapter = b.chapter; ui.sel.codes = c.id; ui.tab = 'codes'; changed(); render();
                } } })))),
            h('div', { class: 'card' }, h('h3', { text: 'Содержимое' }), itemsEditor(b.items))];
        }
      })];
  }

  /* Папки: дерево со счётчиками, переименование и порядок среди соседних папок. */
  function foldersCard(folders) {
    var g = P.game;
    var open = !!ui.foldersOpen;
    function inside(b, key) { var k = SG.folderKey(b.section); return k === key || k.indexOf(key + '/') === 0; }
    function rename(key) {
      var p = key.split('/');
      var name = prompt('Новое имя папки «' + p[p.length - 1] + '» (можно путь через «/», чтобы перенести):', p[p.length - 1]);
      if (name == null) return;
      var np = SG.folderPath(name);
      if (!np.length) { alert('Имя папки не может быть пустым.'); return; }
      var base = np.length > 1 ? np : p.slice(0, -1).concat(np);
      g.blocks.forEach(function (b) {
        if (!inside(b, key)) return;
        b.section = base.concat(SG.folderPath(b.section).slice(p.length)).join('/');
      });
      changed(); render();
    }
    function move(key, dir) {
      // соседние папки того же уровня; блоки папки переносятся целиком перед/после соседа
      var parent = key.lastIndexOf('/') < 0 ? '' : key.slice(0, key.lastIndexOf('/'));
      var sibs = folders.filter(function (k) { return (k.lastIndexOf('/') < 0 ? '' : k.slice(0, k.lastIndexOf('/'))) === parent; });
      var i = sibs.indexOf(key), j = i + dir;
      if (j < 0 || j >= sibs.length) return;
      var mine = g.blocks.filter(function (b) { return inside(b, key); });
      var rest = g.blocks.filter(function (b) { return !inside(b, key); });
      var other = sibs[j];
      var pos = -1;
      rest.forEach(function (b, n) { if (inside(b, other)) { if (dir < 0 && pos < 0) pos = n; if (dir > 0) pos = n + 1; } });
      g.blocks.length = 0;
      Array.prototype.push.apply(g.blocks, rest.slice(0, pos).concat(mine, rest.slice(pos)));
      changed(); render();
    }
    var body = !open ? null : h('div', { class: 'ftree' }, folders.map(function (key) {
      var p = key.split('/');
      var n = g.blocks.filter(function (b) { return inside(b, key); }).length;
      return h('div', { class: 'frow', style: 'padding-left:' + (p.length - 1) * 22 + 'px' },
        h('span', { class: 'fn', text: '▸ ' + p[p.length - 1] }), h('span', { class: 'sm', text: n + ' бл.' }),
        h('button', { class: 'small', text: '↑', title: 'Выше среди соседних папок', on: { click: function () { move(key, -1); } } }),
        h('button', { class: 'small', text: '↓', title: 'Ниже среди соседних папок', on: { click: function () { move(key, 1); } } }),
        h('button', { class: 'small', text: 'Переименовать…', on: { click: function () { rename(key); } } }));
    }));
    return h('div', { class: 'card' },
      h('div', { class: 'inline', style: 'cursor:pointer', on: { click: function () { ui.foldersOpen = !open; render(); } } },
        h('h3', { style: 'margin:0;flex:1', text: (open ? '▾' : '▸') + ' Папки (' + folders.length + ')' }),
        h('span', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: open ? 'Порядок папок у игрока — как здесь' : 'дерево, порядок, переименование' })),
      body);
  }

  function newCode() {
    var c = { id: SG.uid('k'), code: randomCode(4), note: '', who: [], opens: [], answer: '', denied: '', deniedOpens: [], chapter: 1 };
    P.game.codes.push(c);
    return c;
  }
  function pCodes() {
    var g = P.game;
    return [h('h1', { text: 'Коды' }),
      h('p', { class: 'lead', text: 'Код вводят на вкладке «Код» или сканируют как QR на вкладке «Сканер». Код открывает блоки и показывает ответ. Если отмечены персонажи, остальные получат текст «нет доступа» и, если нужно, свои блоки (например, короткое описание вместо полных данных).' }),
      twoCol({
        key: 'codes', items: g.codes,
        label: function (c) { return c.code; }, small: function (c) { return c.note; },
        add: newCode,
        form: function (c, drawList) {
          return [moveDel(g.codes, c, null),
            h('div', { class: 'card' }, h('h3', { text: 'Код' }),
              h('div', { class: 'grid2' },
                fld('Код (цифры или буквы)', c, 'code', { button: randBtn(c, 'code', 4), after: drawList, hint: 'Регистр и пробелы не важны.' }),
                fld('Заметка для мастера', c, 'note', { after: drawList, placeholder: 'например: разбитый планшет', hint: 'Игрок её не видит; печатается под QR.' })),
              fld('Действует с главы', c, 'chapter', { options: chapterOptions(), number: true, hint: 'Раньше приложение ответит «код пока не активен».' })),
            h('div', { class: 'card' }, h('h3', { text: 'Кому открывается' }), whoEditor(c.who, 'Остальные получат «нет доступа» (ниже).'),
              h('div', { class: 'f', style: 'margin-top:10px' }, h('label', { text: 'Открывает блоки' }), blocksPicker(c.opens)),
              fld('Ответ (текст в окне после ввода)', c, 'answer', { area: true, rows: 4, placeholder: 'Необязательно' })),
            h('div', { class: 'card' }, h('h3', { text: 'Для остальных персонажей' }),
              c.who.length ? [
                fld('Текст «нет доступа»', c, 'denied', { area: true, rows: 3, placeholder: 'Необязательно. Например: «Устройство повреждено. Нужен специалист.»' }),
                h('div', { class: 'f' }, h('label', { text: 'Открывает им блоки (необязательно)' }), blocksPicker(c.deniedOpens))
              ] : h('div', { class: 'hint', text: 'Код открыт всем персонажам. Отметьте выше, кому он открывается, — тогда здесь можно задать ответ для остальных.' }))];
        }
      })];
  }

  function usage(name) {
    var where = [];
    P.game.accounts.forEach(function (a) { if (a.items.some(function (i) { return i.file === name; })) where.push('профиль ' + a.name); });
    P.game.blocks.forEach(function (b) { if (b.items.some(function (i) { return i.file === name; })) where.push(b.title); });
    return where;
  }
  function pMedia() {
    var names = Object.keys(P.files).sort();
    var total = totalSize();
    return [h('h1', { text: 'Медиа' }),
      h('p', { class: 'lead', text: 'Картинки и звук, которые входят в пакет. Звук — лучше MP3 64–96 кбит/с: 10 минут займут 5–7 МБ. Весь пакет сейчас: ' + size(total) + '.' }),
      h('div', { class: 'inline', style: 'margin-bottom:12px' },
        h('button', { class: 'main', text: '+ Добавить файлы…', on: { click: function () { pickMedia('any'); } } }),
        h('button', { text: 'Удалить неиспользуемые', disabled: !names.some(function (n) { return !usage(n).length; }), on: { click: function () {
          var un = names.filter(function (n) { return !usage(n).length; });
          if (!confirm('Удалить файлы, которые нигде не используются (' + un.length + ')?')) return;
          un.forEach(function (n) { delete P.files[n]; dropUrl(n); }); changed(); render();
        } } })),
      h('div', { class: 'card', style: 'padding:0' }, names.length ? names.map(function (n) {
        var k = kindOf(n), u = usage(n);
        return h('div', { class: 'media-row' },
          k === 'image' ? h('img', { class: 'th', src: fileUrl(n) }) : h('div', { class: 'th ty', text: k === 'audio' ? '♪' : '?' }),
          h('div', {}, h('div', { text: n }), h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: u.length ? 'где: ' + u.join(', ') : 'нигде не используется' })),
          h('div', { class: 'ty', text: size(P.files[n].size) }),
          k === 'audio' ? h('audio', { controls: true, preload: 'none', src: fileUrl(n), style: 'width:200px;height:32px' }) : h('span'),
          h('button', { class: 'small danger', text: 'Удалить', on: { click: function () {
            if (u.length && !confirm('Файл используется: ' + u.join(', ') + '. Всё равно удалить?')) return;
            delete P.files[n]; dropUrl(n); changed(); render();
          } } }));
      }) : h('div', { class: 'empty', text: 'Файлов нет' }))];
  }

  function pCheck() {
    var probs = SG.problems(P.game, P.files);
    var total = totalSize();
    if (total > 80 * 1048576) probs.push({ level: 'warn', text: 'Пакет больше 80 МБ (' + size(total) + '): загрузка на телефоны будет долгой.' });
    return [h('h1', { text: 'Проверка' }),
      h('p', { class: 'lead', text: 'Ошибки (красные) лучше исправить до игры. Предупреждения (жёлтые) — то, на что стоит посмотреть.' }),
      probs.length ? probs.map(function (p) { return h('div', { class: 'prob ' + p.level, text: p.text }); })
        : h('p', { class: 'ok', text: 'Ошибок не найдено.' })];
  }

  function allCodes() {
    return SG.allCodes(P.game).filter(function (c) { return SG.norm(c.code); });
  }

  /* ---------- таблица всех кодов ---------- */
  var WHERE = [['', 'приложение'], ['terminal', 'терминал'], ['both', 'оба'], ['prop', 'реквизит'], ['card', 'карточка мастера']];
  var KIND = { master: 'мастер', login: 'вход', chapter: 'глава', code: 'код' };
  function whereName(v) { var w = WHERE.filter(function (x) { return x[0] === (v || ''); })[0]; return w ? w[1] : v; }
  function opensText(c) {
    return c.opens.map(function (id) { var b = SG.byId(P.game.blocks, id); return b ? b.title || '?' : '?'; }).join(', ');
  }
  function pTable() {
    var g = P.game;
    var T = ui.table = ui.table || { q: '', kind: '', sort: '', dir: 1, dups: false };
    var rows = SG.allCodes(g);
    var body = h('tbody');
    var count = h('span', { class: 'hint', style: 'color:var(--dim);font-size:12px' });
    function dupMap() {
      var seen = {};
      SG.allCodes(g).forEach(function (r) { var c = SG.norm(r.code); if (c) seen[c] = (seen[c] || 0) + 1; });
      return seen;
    }
    function mark() {
      var d = dupMap();
      body.querySelectorAll('tr').forEach(function (tr) {
        var inp = tr.querySelector('input.code');
        var c = SG.norm(inp.value);
        tr.classList.toggle('dup', !!c && d[c] > 1);
        tr.classList.toggle('nocode', !c && tr.dataset.kind !== 'chapter');
      });
    }
    function sortKey(r) {
      if (T.sort === 'code') return SG.norm(r.code);
      if (T.sort === 'kind') return ['master', 'login', 'chapter', 'code'].indexOf(r.kind);
      if (T.sort === 'chapter') return r.chapter || 0;
      if (T.sort === 'where') return whereName(r.where ? r.obj[r.where] : 'card');
      if (T.sort === 'label') return (r.kind === 'code' ? r.obj.note : r.label).toLowerCase();
      return 0;
    }
    function draw() {
      body.innerHTML = '';
      var d = dupMap();
      var q = T.q.toLowerCase();
      var list = rows.filter(function (r) {
        if (T.kind && r.kind !== T.kind) return false;
        if (T.dups && !(SG.norm(r.code) && d[SG.norm(r.code)] > 1)) return false;
        if (!q) return true;
        var o = r.obj;
        var text = [r.code, r.label, r.comment ? o[r.comment] : '', r.kind === 'code' ? opensText(o) + ' ' + whoShort(o.who) : ''].join(' ').toLowerCase();
        return text.indexOf(q) >= 0;
      });
      if (T.sort) list = list.slice().sort(function (a, b) { var x = sortKey(a), y = sortKey(b); return (x > y ? 1 : x < y ? -1 : 0) * T.dir; });
      list.forEach(function (r) { body.appendChild(row(r)); });
      count.textContent = 'Показано ' + list.length + ' из ' + rows.length;
      mark();
    }
    function cellInput(obj, key, cls, ph, after) {
      var inp = h('input', { type: 'text', class: cls, value: obj[key] == null ? '' : obj[key], placeholder: ph || '' });
      inp.addEventListener('input', function () { obj[key] = inp.value; changed(); mark(); if (after) after(inp.value); });
      return inp;
    }
    function row(r) {
      var o = r.obj;
      var code = cellInput(o, r.codeKey, 'code', r.kind === 'chapter' ? 'нет кода' : '', function (v) { r.code = v; });
      var gen = h('button', { class: 'small', text: '⟳', title: 'Случайный неповторяющийся код', on: { click: function () {
        o[r.codeKey] = randomCode(r.kind === 'master' ? 6 : r.kind === 'login' ? 6 : r.kind === 'chapter' ? 5 : 4);
        code.value = o[r.codeKey]; r.code = code.value; changed(); mark();
      } } });
      var label;
      if (r.kind === 'code') label = cellInput(o, 'note', 'note', 'заметка для мастера', function (v) { r.label = v; });
      else label = h('span', { class: 'lbl', text: r.label });
      var chap;
      if (r.kind === 'code') {
        chap = h('select', {}, chapterOptions().map(function (op) { return h('option', { value: op[0], text: String(op[0]), title: op[1], selected: o.chapter === op[0] }); }));
        chap.addEventListener('change', function () { o.chapter = +chap.value; r.chapter = o.chapter; changed(); });
      } else chap = h('span', { class: 'sm', text: r.kind === 'chapter' ? String(r.chapter) : '—' });
      var where;
      if (r.where) {
        where = h('select', {}, WHERE.map(function (w) { return h('option', { value: w[0], text: w[1], selected: (o[r.where] || '') === w[0] }); }));
        where.addEventListener('change', function () { o[r.where] = where.value; changed(); });
      } else where = h('span', { class: 'sm', text: 'карточка мастера' });
      var who = r.kind === 'code' ? (o.who.length ? whoShort(o.who) : 'все') : r.kind === 'login' ? (o.profession || '') : '';
      var opens = r.kind === 'code' ? opensText(o) + (o.answer ? (o.opens.length ? ' + ответ' : 'ответ') : '') : '';
      var go = { master: 'general', login: 'accounts', chapter: 'chapters', code: 'codes' }[r.kind];
      var tr = h('tr', { 'data-kind': r.kind, 'data-key': r.key },
        h('td', { class: 'k', text: KIND[r.kind] }),
        h('td', { class: 'cc' }, h('div', { class: 'inline' }, code, gen)),
        h('td', {}, label),
        h('td', { class: 'sm', text: who, title: who }),
        h('td', { class: 'sm op', text: opens, title: opens }),
        h('td', {}, chap),
        h('td', {}, where),
        h('td', {}, cellInput(o, r.comment, 'cm', 'комментарий')),
        h('td', {}, h('button', { class: 'small', text: '→', title: 'Открыть полностью', on: { click: function () {
          if (r.kind !== 'master') ui.sel[go] = o.id;
          ui.tab = go; render();
        } } })));
      return tr;
    }
    var search = h('input', { type: 'search', placeholder: 'Поиск: код, заметка, комментарий, блок, персонаж…', value: T.q, style: 'flex:1' });
    search.addEventListener('input', function () { T.q = search.value; draw(); });
    var kind = h('select', {}, [['', 'все типы'], ['code', 'коды игры'], ['login', 'входы'], ['chapter', 'главы'], ['master', 'мастер']].map(function (k) {
      return h('option', { value: k[0], text: k[1], selected: T.kind === k[0] });
    }));
    kind.addEventListener('change', function () { T.kind = kind.value; draw(); });
    var dups = h('input', { type: 'checkbox', checked: T.dups });
    dups.addEventListener('change', function () { T.dups = dups.checked; draw(); });
    function th(text, key) {
      var el = h('th', { text: text + (T.sort === key ? (T.dir > 0 ? ' ▲' : ' ▼') : ''), class: key ? 'sortable' : '' });
      if (key) el.addEventListener('click', function () {
        if (T.sort === key) T.dir = -T.dir; else { T.sort = key; T.dir = 1; }
        render();
      });
      return el;
    }
    draw();
    return [h('h1', { text: 'Таблица кодов' }),
      h('p', { class: 'lead', text: 'Все коды пакета в одном окне: мастерский, входы в аккаунты, переходы глав и коды игры. Код, заметку, главу, «где вводится» и комментарий можно менять прямо здесь. Повторяющиеся коды подсвечены красным. Комментарий и «где вводится» видит только мастер.' }),
      h('div', { class: 'inline', style: 'margin-bottom:10px;flex-wrap:wrap' }, search, kind,
        h('label', { class: 'inline', style: 'color:var(--dim);font-size:12px;cursor:pointer' }, dups, 'только повторы'),
        h('button', { text: '+ Новый код', on: { click: function () { newCode(); changed(); T.q = ''; T.kind = ''; T.dups = false; render(); } } }),
        h('button', { text: 'Сохранить таблицу (CSV для Excel)…', on: { click: saveCsv } })),
      h('div', { style: 'margin-bottom:6px' }, count),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'codes' },
        h('thead', {}, h('tr', {}, th('Тип', 'kind'), th('Код', 'code'), th('Заметка / что это', 'label'), h('th', { text: 'Кому' }),
          h('th', { text: 'Открывает' }), th('Гл.', 'chapter'), th('Где вводится', 'where'), h('th', { text: 'Комментарий' }), h('th'))),
        body))];
  }
  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function tableCsv() {
    var g = P.game;
    var lines = [['Тип', 'Код', 'Заметка / что это', 'Кому', 'Открывает', 'Ответ', 'Глава', 'Где вводится', 'Комментарий']];
    SG.allCodes(g).forEach(function (r) {
      var o = r.obj;
      lines.push([KIND[r.kind], r.code, r.kind === 'code' ? o.note : r.label,
        r.kind === 'code' ? (o.who.length ? whoShort(o.who) : 'все') : r.kind === 'login' ? o.profession : '',
        r.kind === 'code' ? opensText(o) : '', r.kind === 'code' ? o.answer : '',
        r.chapter || '', r.where ? whereName(o[r.where]) : 'карточка мастера', o[r.comment] || '']);
    });
    // Excel в русской Windows ждёт «;» и BOM, чтобы понять UTF-8
    return '\ufeff' + lines.map(function (l) { return l.map(csvCell).join(';'); }).join('\r\n') + '\r\n';
  }
  function saveCsv() {
    var blob = new Blob([tableCsv()], { type: 'text/csv' });
    saveBlob(blob, 'Коды-' + (P.game.title || 'signaly').replace(/[\\/:*?"<>|]+/g, '_') + '-v' + P.game.version + '.csv', 'Таблица CSV', 'text/csv', '.csv');
  }

  /* QR на холсте: схема цветов, размер, подпись. Возвращает canvas. */
  var QR_SCHEMES = [
    ['gb', 'Зелёный на чёрном (как терминал)', '#030803', '#33ff66'],
    ['bg', 'Чёрный на зелёном', '#33ff66', '#031003'],
    ['bw', 'Чёрный на белом (для печати)', '#ffffff', '#000000'],
    ['custom', 'Свои цвета', '', '']
  ];
  function qrColors(Q) {
    var sch = QR_SCHEMES.filter(function (x) { return x[0] === Q.scheme; })[0] || QR_SCHEMES[0];
    return sch[0] === 'custom' ? { bg: Q.bg, fg: Q.fg } : { bg: sch[2], fg: sch[3] };
  }
  function qrCanvas(text, Q, caption) {
    var q = window.qrcode(0, 'M');
    q.addData(String(text));
    q.make();
    var n = q.getModuleCount(), quiet = 4;
    var cell = Math.max(2, Math.floor(Q.size / (n + quiet * 2)));
    var side = Math.max(Q.size, cell * (n + quiet * 2));
    var off = Math.floor((side - cell * n) / 2);
    var capH = caption ? Math.round(side * 0.14) : 0;
    var c = document.createElement('canvas');
    c.width = side;
    c.height = side + capH;
    var x = c.getContext('2d');
    var col = qrColors(Q);
    x.fillStyle = col.bg;
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = col.fg;
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) {
      if (q.isDark(r, k)) x.fillRect(off + k * cell, off + r * cell, cell, cell);
    }
    if (caption) {
      var fs = Math.round(capH * 0.55);
      x.font = 'bold ' + fs + 'px Consolas, "Courier New", monospace';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      while (x.measureText(caption).width > side * 0.92 && fs > 8) { fs--; x.font = 'bold ' + fs + 'px Consolas, "Courier New", monospace'; }
      x.fillText(caption, side / 2, side + capH * 0.35);
    }
    return c;
  }
  function jpgBlob(canvas) {
    return new Promise(function (ok) { canvas.toBlob(ok, 'image/jpeg', 0.95); });
  }
  function saveBlob(blob, name, desc, mime, extn) {
    if (window.showSaveFilePicker) {
      var acc = {}; acc[mime] = [extn];
      return window.showSaveFilePicker({ suggestedName: name, types: [{ description: desc, accept: acc }] })
        .then(function (hd) { return hd.createWritable(); })
        .then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
        .catch(function (e) { if (!e || e.name !== 'AbortError') alert('Не удалось сохранить: ' + e.message); });
    }
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    return Promise.resolve();
  }
  function qrFileName(code, label) {
    return ('QR-' + code + (label ? '-' + label : '')).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) + '.jpg';
  }
  function captionOf(Q, code, label) {
    if (Q.caption === 'code') return String(code);
    if (Q.caption === 'label') return label || String(code);
    if (Q.caption === 'own') return Q.ownText || '';
    return '';
  }
  function pQr() {
    var list = allCodes();
    var Q = ui.qr;
    if (!Q.scheme) Object.assign(Q, { scheme: 'gb', bg: '#030803', fg: '#33ff66', size: 512, caption: 'none', ownText: '', text: '' });
    if (!Q.picked) { Q.picked = {}; list.forEach(function (c) { if (c.group !== 'Мастер') Q.picked[c.key] = true; }); }

    // настройки вида — общие для одиночного и для всех кодов
    var preview = h('div', { class: 'qr-prev' });
    function draw() {
      preview.innerHTML = '';
      var t = SG.norm(Q.text) ? Q.text.trim() : '';
      if (!t) { preview.appendChild(h('div', { class: 'hint', text: 'Введите код — здесь появится QR.' })); return; }
      var cv = qrCanvas(t, Q, captionOf(Q, t, ''));
      cv.className = 'qr-canvas';
      preview.appendChild(cv);
    }
    var scheme = h('select', {}, QR_SCHEMES.map(function (s) { return h('option', { value: s[0], text: s[1], selected: Q.scheme === s[0] }); }));
    var custom = h('span', { class: 'inline', style: Q.scheme === 'custom' ? '' : 'display:none' });
    ['bg', 'fg'].forEach(function (k) {
      var inp = h('input', { type: 'color', value: Q[k], title: k === 'bg' ? 'Фон' : 'Узор' });
      inp.addEventListener('input', function () { Q[k] = inp.value; draw(); });
      custom.appendChild(h('label', { class: 'inline', style: 'color:var(--dim);font-size:12px' }, inp, k === 'bg' ? 'фон' : 'узор'));
    });
    scheme.addEventListener('change', function () {
      Q.scheme = scheme.value;
      custom.style.display = Q.scheme === 'custom' ? '' : 'none';
      draw();
    });
    var sizeSel = h('select', {}, [[256, '256 точек'], [512, '512 точек'], [1024, '1024 точки']].map(function (s) {
      return h('option', { value: s[0], text: s[1], selected: Q.size === s[0] });
    }));
    sizeSel.addEventListener('change', function () { Q.size = +sizeSel.value; draw(); });
    var own = h('input', { type: 'text', value: Q.ownText, placeholder: 'текст подписи', style: Q.caption === 'own' ? '' : 'display:none' });
    own.addEventListener('input', function () { Q.ownText = own.value; draw(); });
    var cap = h('select', {}, [['none', 'без подписи'], ['code', 'сам код'], ['label', 'заметка мастера (для кодов игры)'], ['own', 'свой текст']].map(function (s) {
      return h('option', { value: s[0], text: s[1], selected: Q.caption === s[0] });
    }));
    cap.addEventListener('change', function () { Q.caption = cap.value; own.style.display = Q.caption === 'own' ? '' : 'none'; draw(); });
    var codeIn = h('input', { type: 'text', value: Q.text, placeholder: 'например 4242', style: 'font-family:Consolas,monospace;font-size:18px;width:220px' });
    codeIn.addEventListener('input', function () { Q.text = codeIn.value; draw(); });
    draw();

    var single = h('div', { class: 'card' }, h('h3', { text: 'Перевести код в QR' }),
      h('div', { class: 'two', style: 'gap:24px' },
        h('div', { style: 'flex:1' },
          h('div', { class: 'f' }, h('label', { text: 'Код' }), codeIn),
          h('div', { class: 'f' }, h('label', { text: 'Цвета' }), h('div', { class: 'inline' }, scheme, custom)),
          h('div', { class: 'grid2' },
            h('div', { class: 'f' }, h('label', { text: 'Размер картинки' }), sizeSel),
            h('div', { class: 'f' }, h('label', { text: 'Подпись под кодом' }), cap, own)),
          h('button', { class: 'main', text: 'Сохранить JPG…', on: { click: function () {
            var t = (Q.text || '').trim();
            if (!SG.norm(t)) { alert('Сначала введите код.'); return; }
            jpgBlob(qrCanvas(t, Q, captionOf(Q, t, ''))).then(function (b) { return saveBlob(b, qrFileName(t), 'Картинка JPG', 'image/jpeg', '.jpg'); });
          } } }),
          h('p', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-top:10px',
            text: 'Зелёный на чёрном — светлый узор на тёмном фоне: приложение «Сигналы» его читает, а обычные сканеры телефонов иногда нет. Для печати надёжнее «чёрный на белом» или «чёрный на зелёном». С экрана терминала коды сканируются; если плохо — увеличьте размер на экране и уменьшите яркость.' })),
        preview));

    // коды игры
    var groups = {};
    list.forEach(function (c) { (groups[c.group] = groups[c.group] || []).push(c); });
    var rows = Object.keys(groups).map(function (gname) {
      var all = h('input', { type: 'checkbox', checked: groups[gname].every(function (c) { return Q.picked[c.key]; }) });
      all.addEventListener('change', function () { groups[gname].forEach(function (c) { Q.picked[c.key] = all.checked; }); render(); });
      return h('div', { class: 'card' }, h('label', { style: 'display:flex;gap:6px;font-weight:600;color:var(--acc);margin-bottom:6px' }, all, gname),
        groups[gname].map(function (c) {
          var b = h('input', { type: 'checkbox', checked: !!Q.picked[c.key] });
          b.addEventListener('change', function () { Q.picked[c.key] = b.checked; });
          return h('div', { class: 'qr-row' }, b,
            h('span', { class: 'qr-code', text: c.code }), h('span', { class: 'nm', text: c.label }),
            h('button', { class: 'small', text: 'Показать', on: { click: function () { Q.text = c.code; render(); $('panel').scrollTop = 0; } } }),
            h('button', { class: 'small', text: 'JPG', on: { click: function () {
              jpgBlob(qrCanvas(c.code, Q, captionOf(Q, c.code, c.label))).then(function (bl) { return saveBlob(bl, qrFileName(c.code, c.label), 'Картинка JPG', 'image/jpeg', '.jpg'); });
            } } }));
        }));
    });
    var zipBtn = h('button', { text: 'Сохранить отмеченные в JPG (архив .zip)…', on: { click: function () {
      var pick = list.filter(function (c) { return Q.picked[c.key]; });
      if (!pick.length) { alert('Ничего не отмечено.'); return; }
      var zip = new window.JSZip();
      var used = {};
      Promise.all(pick.map(function (c) {
        return jpgBlob(qrCanvas(c.code, Q, captionOf(Q, c.code, c.label))).then(function (b) {
          var n = qrFileName(c.code, c.label), i = 2;
          while (used[n]) n = n.replace(/( \(\d+\))?\.jpg$/, ' (' + (i++) + ').jpg');
          used[n] = 1;
          zip.file(n, b);
        });
      })).then(function () { return zip.generateAsync({ type: 'blob' }); })
        .then(function (b) { return saveBlob(b, 'QR-' + (P.game.title || 'signaly').replace(/[\\/:*?"<>|]+/g, '_') + '.zip', 'Архив ZIP', 'application/zip', '.zip'); });
    } } });
    return [h('h1', { text: 'QR-коды' }),
      h('p', { class: 'lead', text: 'В QR записан сам код — тот же, что вводится руками. Картинку JPG можно вставить в терминал Twine (игроки сканируют с экрана) или напечатать и наклеить на реквизит.' }),
      single,
      h('h3', { style: 'margin:18px 0 8px;font-size:15px', text: 'Коды игры' }),
      h('p', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin:0 0 10px', text: 'Цвета, размер и подпись — как выбраны выше.' }),
      list.length ? [h('div', { style: 'margin-bottom:12px' }, zipBtn), rows] : h('div', { class: 'empty', text: 'Кодов пока нет' })];
  }

  /* ---------- предпросмотр ---------- */
  var frame = null, frameReady = false;
  function pPreview() {
    var g = P.game, V = ui.pv;
    if (V.account && !SG.byId(g.accounts, V.account)) V.account = '';
    if (V.chapter == null || V.chapter > g.chapters.length) V.chapter = 1;
    var acc = h('select', {}, h('option', { value: '', text: '— экран входа —' }), g.accounts.map(function (a) {
      return h('option', { value: a.id, text: a.name + (a.profession ? ' — ' + a.profession : ''), selected: V.account === a.id });
    }));
    var ch = h('select', {}, g.chapters.map(function (c, i) { return h('option', { value: i + 1, text: c.name, selected: V.chapter === i + 1 }); }));
    var all = h('input', { type: 'checkbox', checked: !!V.all });
    acc.addEventListener('change', function () { V.account = acc.value; send(); });
    ch.addEventListener('change', function () { V.chapter = +ch.value; send(); });
    all.addEventListener('change', function () { V.all = all.checked; send(); });
    frameReady = false;
    frame = h('iframe', { name: 'sg-preview', allow: 'camera; autoplay' });
    if (window.SG_PLAYER_HTML) frame.srcdoc = window.SG_PLAYER_HTML;
    else frame.src = window.SG_PLAYER_URL;
    return [h('h1', { text: 'Предпросмотр' }),
      h('p', { class: 'lead', text: 'Так приложение выглядит на телефоне. Здесь можно вводить коды и смотреть блоки; ничего не сохраняется. Сканер работает с веб-камерой компьютера, если она есть.' }),
      h('div', { class: 'two' },
        h('div', { class: 'phone' }, frame),
        h('div', { class: 'card', style: 'width:320px' },
          h('div', { class: 'f' }, h('label', { text: 'Аккаунт' }), acc),
          h('div', { class: 'f' }, h('label', { text: 'Глава' }), ch),
          h('label', { class: 'f row' }, all, 'Открыть все блоки (посмотреть содержимое)'),
          h('button', { text: 'Обновить с начала', on: { click: send } }),
          h('p', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Мастерский код в предпросмотре тоже работает.' })))];
  }
  function send() {
    if (!frame || !frameReady) return;
    var V = ui.pv;
    SG.writePack(P.game, P.files, true).then(function (blob) { return blob.arrayBuffer(); }).then(function (buf) {
      frame.contentWindow.postMessage({ type: 'sg-pack', data: buf, account: V.account || null, chapter: V.chapter || 1, unlockAll: !!V.all }, '*');
    });
  }
  window.addEventListener('message', function (ev) {
    if (ev.data && ev.data.type === 'sg-preview-ready' && frame && ev.source === frame.contentWindow) { frameReady = true; send(); }
  });

  /* ---------- файл пакета ---------- */
  function fileName() {
    return (P.game.title || 'signaly').replace(/[\\/:*?"<>|]+/g, '_') + '-v' + P.game.version + '.sgpack';
  }
  function savePack() {
    var probs = SG.problems(P.game, P.files).filter(function (p) { return p.level === 'error'; });
    if (probs.length && !confirm('В пакете есть ошибки (' + probs.length + '), например:\n' + probs[0].text + '\n\nВсё равно сохранить?')) return;
    var old = P.game.version;
    P.game.version = (parseInt(old, 10) || 0) + 1;
    var name = fileName();
    SG.writePack(P.game, P.files, false).then(function (blob) {
      if (window.showSaveFilePicker) {
        return window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Пакет игры СИГНАЛЫ', accept: { 'application/zip': ['.sgpack'] } }] })
          .then(function (hd) { return hd.createWritable(); })
          .then(function (w) { return w.write(blob).then(function () { return w.close(); }); });
      }
      var a = h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
    }).then(function () {
      dirty = false;
      changed();
      status('пакет сохранён: ' + name);
      render();
    }).catch(function (e) {
      P.game.version = old;
      if (e && e.name === 'AbortError') return;
      alert('Не удалось сохранить: ' + e.message);
    });
  }
  function openPack(file) {
    SG.readPack(file).then(function (p) {
      Object.keys(urls).forEach(dropUrl);
      P = { game: p.game, files: p.files };
      ui.sel = {}; ui.qr.picked = null;
      changed();
      render();
      status('открыт пакет ' + file.name);
    }).catch(function (e) { alert('Не удалось открыть пакет: ' + e.message); });
  }
  $('a-save').addEventListener('click', savePack);
  $('a-open').addEventListener('click', function () {
    if (dirty && !confirm('Открыть другой пакет? Несохранённый в файл черновик будет заменён.')) return;
    $('open-file').click();
  });
  $('open-file').addEventListener('change', function () {
    var f = $('open-file').files[0];
    $('open-file').value = '';
    if (f) openPack(f);
  });
  $('a-new').addEventListener('click', function () {
    if (!confirm('Начать новый пакет? Текущий черновик будет заменён (сохранённые файлы .sgpack не пострадают).')) return;
    Object.keys(urls).forEach(dropUrl);
    P = { game: SG.newGame(), files: {} };
    ui.sel = {}; ui.qr.picked = null; ui.tab = 'general';
    changed();
    render();
  });
  window.addEventListener('beforeunload', function () {
    clearTimeout(saveTimer);
    idbPut('project', { game: P.game, files: P.files });
  });

  // для проверок
  window.sgEditor = { tableCsv: tableCsv, project: function () { return P; }, render: render, setTab: function (t) { ui.tab = t; render(); } };

  idbGet('project').then(function (saved) {
    if (saved && saved.game) {
      P = { game: SG.normalize(saved.game), files: saved.files || {} };
      status('открыт черновик из браузера');
    } else status('новый пакет');
    render();
  }).catch(function () { render(); });
})();
