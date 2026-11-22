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
  var VID = ['mp4', 'webm', 'm4v'];   // П25 (06, 152): видео события
  function kindOf(name) {
    var e = ext(name);
    return IMG.indexOf(e) >= 0 ? 'image' : AUD.indexOf(e) >= 0 ? 'audio' : VID.indexOf(e) >= 0 ? 'video' : 'other';
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
    inp.accept = accept === 'image' ? 'image/*' : accept === 'audio' ? 'audio/*,.mp3' : accept === 'video' ? 'video/mp4,video/*,.mp4' : 'image/*,audio/*,.mp3,video/mp4';
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
    var bigV = list.filter(function (f) { return kindOf(f.name) === 'video' && f.size > 20 * 1024 * 1024; });
    if (bigV.length) alert('Большие видео (больше 20 МБ): ' + bigV.map(function (f) { return f.name; }).join(', ') +
      '.\nЛучше сжать (MP4 H.264, 480p, 1 Мбит/с): пакет загружается на каждый телефон.');
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
  /* П13 (Т4-3): общие переменные терминала и телефонов (в Twine — галочка «общая» в окне «Переменные»). */
  function sharedCard(g) {
    var box = h('div', { class: 'card shared-card' }, h('h3', { text: 'Общие переменные (терминал и телефоны)' }),
      h('div', { class: 'hint', text: 'Значение хранит центр сети: видят и меняют терминал (переменная $имя), коды телефонов (действие «Переменная терминала»), правила и пульт мастера. В текстах блоков, ответов кодов и уведомлений — {{имя}}. Начальное — пока терминал не прислал своё.' }));
    g.shared.forEach(function (v, i) {
      var val = h('input', { type: 'text', value: v.value === true ? 'true' : v.value === false ? 'false' : String(v.value), placeholder: 'начальное значение' });
      val.addEventListener('input', function () { v.value = SG.termValue(val.value); changed(); });
      var prevName = v.name;
      var del = h('button', { class: 'btn small dim', text: '✕', title: 'Убрать' });
      del.addEventListener('click', function () { g.shared.splice(i, 1); changed(); render(); });
      box.appendChild(h('div', { class: 'grid3 shared-row' }, fld('Имя (латиница)', v, 'name', { placeholder: 'power', after: function () {
          v.name = v.name.replace(/^\$/, '').trim();
          (g.limits || []).forEach(function (l) { if (l.var === prevName) l.var = v.name; });
          prevName = v.name;
        } }),
        fld('Подпись', v, 'label', { placeholder: 'Энергия' }), h('div', { class: 'f' }, h('label', { text: 'Начальное' }), h('div', { class: 'inline' }, val, del))));
      box.appendChild(limitRow(g, v));
    });
    var add = h('button', { class: 'btn', text: '+ Общая переменная' });
    add.addEventListener('click', function () { g.shared.push({ name: 'var' + (g.shared.length + 1), label: '', value: 0 }); changed(); render(); });
    box.appendChild(add);
    return box;
  }
  /* П15: предел общей переменной — game.limits [{var, min, max}]; центр не даёт выйти за предел. */
  function limitRow(g, sv) {
    if (!Array.isArray(g.limits)) g.limits = [];
    var name = sv.name;
    var l = g.limits.filter(function (x) { return x.var === name; })[0];
    var tmp = l || { var: name, min: '', max: '' };
    function upd() {
      tmp.var = sv.name;
      var n = function (x) { x = String(x == null ? '' : x).trim().replace(',', '.'); return x === '' || !isFinite(+x) ? '' : +x; };
      tmp.min = n(tmp.min); tmp.max = n(tmp.max);
      var i = g.limits.indexOf(tmp);
      if (tmp.min === '' && tmp.max === '') { if (i >= 0) g.limits.splice(i, 1); }
      else if (i < 0) g.limits.push(tmp);
      changed();
    }
    return h('div', { class: 'grid3 limit-row', 'data-var': name },
      fld('Не меньше (пусто — без предела)', tmp, 'min', { type: 'number', after: upd }),
      fld('Не больше', tmp, 'max', { type: 'number', after: upd, hint: 'Центр не даёт выйти за предел (терминал, коды, пульт). «Упёрлась в предел» — правило в «Сеть и события».' }),
      h('div'));
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

  /* П20 / П25 (06, 152): содержимое события — картинка, видео (mp4), звук; «играть сразу», «в бегущую строку». */
  function evMediaCard(n, drawList) {
    var box = h('div', { class: 'card ev-media' });
    function draw() {
      box.innerHTML = '';
      function proxy(type, key) { return { type: type, get file() { return n[key] || ''; }, set file(v) { n[key] = v; } }; }
      box.appendChild(h('h3', { text: 'Содержимое события' }));
      box.appendChild(h('div', { class: 'hint', text: 'Необязательно. С картинкой, видео или звуком уведомление открывается окном события; видео — в окне, по кнопке — на весь экран, звук видео — по нажатию (или «играть сразу»). Видео — MP4 (H.264), лучше до 20 МБ.' }));
      box.appendChild(h('div', { class: 'grid3' }, h('div', {}, h('b', { text: 'Картинка' }), mediaSelect(proxy('image', 'img'), draw)),
        h('div', {}, h('b', { text: 'Видео' }), mediaSelect(proxy('video', 'video'), draw)), h('div', {}, h('b', { text: 'Звук' }), mediaSelect(proxy('audio', 'mp3'), draw))));
      if (n.video && P.files[n.video]) box.appendChild(h('video', { controls: true, src: fileUrl(n.video), style: 'max-width:320px;max-height:200px;display:block;margin-top:6px' }));
      box.appendChild(h('div', { class: 'grid2' }, check('Играть сразу (звук или видео при приходе)', n, 'playNow'), check('В бегущую строку (вместо окна)', n, 'ticker')));
    }
    draw();
    return box;
  }

  /* П25 (06, 152): свои звуки приложения — mp3 на события, по главам, по желанию свой у персонажа. */
  function soundSetEd(g) {
    if (!Array.isArray(g.soundSet)) g.soundSet = [];
    var box = h('div', { class: 'f sound-set' }, h('label', { text: 'Свои звуки (mp3 из «Медиа»; не задан — встроенный)' }));
    function draw() {
      box.querySelectorAll('.snd-row, .snd-add').forEach(function (e) { e.remove(); });
      g.soundSet.forEach(function (x, i) {
        var ev = h('select', {}, SG.SOUND_EVENTS.map(function (e) { return h('option', { value: e[0], text: e[1], selected: x.ev === e[0] }); }));
        ev.addEventListener('change', function () { x.ev = ev.value; changed(); });
        var ch = h('select', {}, chapterOptions().map(function (o) { return h('option', { value: o[0], text: 'с гл. ' + o[0], selected: x.chapter === o[0] }); }));
        ch.addEventListener('change', function () { x.chapter = +ch.value; changed(); });
        var who = h('select', {}, [h('option', { value: '', text: 'всем' })].concat(g.accounts.map(function (a) { return h('option', { value: a.id, text: a.name, selected: x.who[0] === a.id }); })));
        who.addEventListener('change', function () { x.who = who.value ? [who.value] : []; changed(); });
        var it = { type: 'audio', get file() { return x.file; }, set file(v) { x.file = v; } };
        box.appendChild(h('div', { class: 'snd-row grid3' }, h('div', { class: 'f' }, ev, ch, who), mediaSelect(it, draw),
          h('button', { class: 'small danger', text: 'Убрать', on: { click: function () { g.soundSet.splice(i, 1); changed(); draw(); } } })));
      });
      box.appendChild(h('button', { class: 'snd-add', text: '+ Свой звук', on: { click: function () { g.soundSet.push({ id: SG.uid('snd'), ev: 'note', file: '', chapter: 1, who: [] }); changed(); draw(); } } }));
    }
    draw();
    return box;
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
    function strip(list) { for (var i = list.length - 1; i >= 0; i--) if (list[i] === id) list.splice(i, 1); }
    g.apps.forEach(function (a) { strip(a.who); });
    g.notices.forEach(function (n) { strip(n.to); });
    g.votes.forEach(function (v) { strip(v.to); });
    g.glitches.forEach(function (x) { strip(x.who); });
    g.codes.forEach(function (c) {
      c.variants.forEach(function (v) { strip(v.who); strip(v.opens); });
      if (c.app === id) c.app = '';
    });
    g.codes.concat(g.rules).forEach(function (c) { c.actions.forEach(function (a) { if (Array.isArray(a.to)) strip(a.to); if (a.blocks) strip(a.blocks); }); });
    g.blocks.forEach(function (b) { b.who = b.who.filter(function (x) { return x !== id; }); });
    g.codes.forEach(function (c) {
      c.who = c.who.filter(function (x) { return x !== id; });
      c.opens = c.opens.filter(function (x) { return x !== id; });
      c.deniedOpens = c.deniedOpens.filter(function (x) { return x !== id; });
    });
  }

  /* ---------- вкладки ---------- */
  var TABS = [
    ['general', 'Общее'], ['chapters', 'Главы и стили'], ['accounts', 'Аккаунты'], ['header', 'Шапка и меню'], ['blocks', 'Блоки данных'],
    ['codes', 'Коды'], ['voice', 'Голос'], ['apps', 'Приборы'], ['events', 'Сеть и события'], ['games', 'Мини-игры'], ['table', 'Таблица кодов'], ['media', 'Медиа'], ['check', 'Проверка'], ['qr', 'QR-коды'], ['sstv', 'SSTV (звук для терминала)'], ['preview', 'Предпросмотр']
  ];
  function renderNav() {
    var nav = $('nav');
    nav.innerHTML = '';
    var g = P.game;
    var probs = SG.problems(g, P.files);
    var errs = probs.filter(function (p) { return p.level === 'error'; }).length;
    var counts = { chapters: g.chapters.length, accounts: g.accounts.length, blocks: g.blocks.length, codes: g.codes.length, apps: g.apps.length,
      voice: g.codes.filter(function (c) { return c.voice; }).length,
      events: g.notices.length + g.alarms.length + g.glitches.length + g.rules.length + g.votes.length, games: (g.games || []).length,
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
    var f = { general: pGeneral, chapters: pChapters, accounts: pAccounts, header: pHeader, blocks: pBlocks, codes: pCodes, voice: pVoice, apps: pApps, events: pEvents, games: pGames, table: pTable, media: pMedia,
      check: pCheck, qr: pQr, sstv: pSstv, preview: pPreview }[ui.tab];
    add(p, f());
    if (ui.tab !== 'preview') p.scrollTop = keepScroll;
  }

  function pGeneral() {
    var g = P.game;
    var T = g.texts;
    var lab = {
      loginTitle: 'Экран входа', wrongCode: 'Неверный код', denied: 'Нет доступа (по умолчанию)', already: 'Код уже введён',
      tooEarly: 'Код ещё не действует (глава не наступила)', inactive: 'Код с условием «когда»: «пока не активен»', opened: 'Код сработал', chapter: 'Переход главы (начало надписи)'
    };
    return [h('h1', { text: 'Общее' }),
      h('p', { class: 'lead', text: 'Название игры, мастерский код и служебные надписи приложения. Пакет игры — это один файл .sgpack: в нём все тексты, коды и медиа. Его загружают в приложение на каждом телефоне.' }),
      h('div', { class: 'card' }, h('h3', { text: 'Пакет' }),
        h('div', { class: 'grid2' },
          fld('Название (видно на экране входа)', g, 'title'),
          fld('Версия пакета', g, 'version', { number: true, type: 'number', hint: 'Растёт сама при каждом «Сохранить пакет». Мастер видит её в режиме мастера на телефоне.' })),
        fld('Мастерский код', g, 'masterCode', { button: randBtn(g, 'masterCode', 8),
          hint: 'Введённый или отсканированный на любом телефоне, открывает режим мастера: пульт сети, сменить аккаунт, выставить главу, сбросить, загрузить другой пакет. Лучше 8–16 цифр; QR — только на карточке мастера.' }),
        fld('Комментарий к мастерскому коду', g, 'masterComment', { placeholder: 'например: QR на карточке мастера', hint: 'Видно только в редакторе (и в таблице кодов).' })),
      h('div', { class: 'card' }, h('h3', { text: 'Звуки и настройки игрока' }),
        check('Звуки интерфейса (щелчки клавиш, сигналы «открыто», «ошибка», «сообщение»)', g, 'sounds'),
        soundSetEd(g),
        fld('Код настроек игрока', g, 'settingsCode', { hint: 'Игрок вводит его на вкладке «Код» и может выключить звуки у себя. Отдельного значка нет, чтобы не отвлекать.' })),
      h('div', { class: 'card' }, h('h3', { text: 'Связь (чаты)' }),
        h('div', { class: 'grid2' },
          fld('Имя мастера в чатах', g.chat, 'master', { hint: 'Так подписаны сообщения, которые мастер пишет с пульта («ПЕРЕПИСКА»). Там же можно выбрать другое имя: «Система» или любой персонаж.' }),
          fld('Профессия мастера (необязательно)', g.chat, 'masterProf')),
        check('Игроки видят мастера в списке контактов и могут написать ему лично (иначе — только ответить, если он написал первым)', g.chat, 'masterContact'),
        h('div', { class: 'grid2' },
          fld('Подпись анонимных сообщений', g.chat, 'anon', { hint: 'Функция «Анонимная отправка» у персонажа. Мастер видит настоящего отправителя.' }),
          fld('Отложенная отправка: не дольше, минут', g.chat, 'delayMax', { number: true, type: 'number', hint: 'Функция «Отложенная отправка» у персонажа: от 1 минуты до этого числа.' })),
        check('Запретить вставку в чатах (всё набирать вручную); выделять и копировать сообщения тоже нельзя', g.chat, 'noPaste'),
        check('Телефон сам ищет центр после входа (точка доступа мастера, затем вся сеть Wi-Fi); QR «СЕТЬ» — запасной путь', g.chat, 'auto'),
        h('div', { class: 'grid2' },
          fld('Цвет сообщений Руководителя (и «Системы» с пульта) у всех', g.chat, 'bossColor', { options: chatColorOptions() }),
          fld('Цвет анонимных сообщений у всех', g.chat, 'anonColor', { options: chatColorOptions(),
            hint: 'Иначе — цветом читающего. Чёрный — тёмный текст на светлой плашке.' })),
        h('div', { class: 'hint', text: 'В чатах — только текст. Один персонаж может быть в сети только на одном телефоне: второй вход тем же кодом центр не пустит.' })),
      paletteCard(g),
      sharedCard(g),
      h('div', { class: 'card' }, h('h3', { text: 'Клавиатура и первый вход' }),
        fld('Клавиатура у игроков', g, 'keyboard', { options: [['own', 'клавиатура приложения; игрок может выбрать клавиатуру телефона (первый вход, код настроек)'], ['sys', 'только клавиатура телефона (как раньше)']],
          hint: 'Клавиатура приложения — в поле кода (кнопка «ABC»), в чатах и заметках; цвет — как у интерфейса; вставки из буфера у неё нет. На пульте мастера — всегда клавиатура телефона.' }),
        check('Первый вход: после кода входа телефон проверяет разрешения (камера, уведомления, микрофон, работа в фоне, окно при аварии, звук), игрок выбирает клавиатуру, затем цвет (если так отмечено у аккаунта)', g, 'firstRun'),
        h('div', { class: 'hint', text: 'Без камеры и уведомлений дальше не пройти, остальное — желательно. Мастер может повторить первый вход: режим мастера → «Повторить первый вход».' })),
      h('div', { class: 'card' }, h('h3', { text: 'Камера-улика (функция «Камера-улика»)' }),
        h('div', { class: 'hint', text: 'Цвет снимка — цвет интерфейса персонажа, если он задан (вкладка «Аккаунты»); иначе — этот.' }),
        h('div', { class: 'grid3' },
          h('div', { class: 'f' }, h('label', { text: 'Цвет' }), (function () {
            var c = h('input', { type: 'color', value: g.photo.tint });
            c.addEventListener('input', function () { g.photo.tint = c.value; changed(); });
            return c;
          })()),
          fld('Пикселизация', g.photo, 'pixel', { options: [[1, 'нет'], [2, 'слабая'], [3, 'средняя'], [5, 'сильная'], [8, 'очень сильная']], after: function () { g.photo.pixel = +g.photo.pixel; } }),
          fld('Надпись на снимке', g.photo, 'stampText')),
        h('div', { class: 'grid3' }, check('Одним цветом', g.photo, 'mono'), check('Зерно', g.photo, 'grain'), check('Полосы монитора', g.photo, 'scan')),
        check('Рамка, дата и время, «● REC»', g.photo, 'stamp')),
      h('div', { class: 'card' }, h('h3', { text: 'Служебные надписи' }),
        h('div', { class: 'grid2' }, Object.keys(SG.DEFAULT_TEXTS).map(function (k) { return fld(lab[k] || k, T, k); })))];
  }

  /* Палитра цветов интерфейса (П-50): из них выбирают игроки и мастер. */
  function paletteCard(g) {
    var box = h('div', {});
    function draw() {
      box.innerHTML = '';
      g.palette.forEach(function (c, i) {
        var col = h('input', { type: 'color', value: c.color });
        col.addEventListener('input', function () { c.color = col.value; changed(); });
        var nm = h('input', { type: 'text', value: c.name });
        nm.addEventListener('input', function () { c.name = nm.value; changed(); });
        box.appendChild(h('div', { class: 'inline', style: 'margin-bottom:6px' }, col, nm,
          h('button', { class: 'small danger', text: 'Удалить', disabled: g.palette.length < 2, on: { click: function () {
            g.palette.splice(i, 1); changed(); draw();
          } } })));
      });
      box.appendChild(h('div', { class: 'inline' },
        h('button', { text: '+ Цвет', on: { click: function () { g.palette.push({ id: SG.uid('k'), name: 'Новый цвет', color: '#ffffff' }); changed(); draw(); } } }),
        h('button', { text: 'Набор по умолчанию', on: { click: function () { g.palette = SG.clone(SG.DEFAULT_PALETTE); changed(); render(); } } })));
    }
    draw();
    return h('div', { class: 'card' }, h('h3', { text: 'Цвета интерфейса (палитра)' }),
      h('div', { class: 'hint', style: 'margin-bottom:8px', text: 'Один цвет — на весь интерфейс: из него выводятся фон, рамки, приглушённый текст, клавиатура и оттенок снимков. Какие цвета можно выбирать в главе — вкладка «Главы и стили»; цвет персонажа по главам — вкладка «Аккаунты». Если цвет персонажу не задан — стиль главы как есть.' }),
      box);
  }
  function chatColorOptions() {
    return [['', 'цветом читающего'], ['#ffffff', 'белый'], ['#000000', 'чёрный']].concat(P.game.palette.map(function (c) { return [c.id, c.name]; }));
  }
  function colorOptions(first) {
    return [['', first]].concat(P.game.palette.map(function (c) { return [c.id, c.name]; }));
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
          var c = { id: SG.uid('c'), name: 'Глава ' + (g.chapters.length + 1), code: randomCode(5), message: '', theme: SG.clone(prev ? prev.theme : SG.DEFAULT_THEME), colors: prev ? prev.colors.slice() : [], senderColor: prev ? prev.senderColor : false, colorReset: false, jam: 0, comment: '', where: '' };
          g.chapters.push(c);
          return c;
        },
        form: function (c, drawList) {
          var idx = g.chapters.indexOf(c);
          if (!Array.isArray(c.colors)) c.colors = [];
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
              idx > 0 ? fld('Сообщение при переходе', c, 'message', { area: true, rows: 3, placeholder: 'Необязательно. Появится в окне после смены главы.' }) : null,
              fld('Помехи в «Связи» и уведомлениях', c, 'jam', { options: [[0, 'нет'], [1, 'слабые (часть букв искажена)'], [2, 'сильные'], [3, 'почти ничего не разобрать']], after: function () { c.jam = +c.jam; },
                hint: 'Во время аварии с отметкой «глушить связь» помехи не меньше «сильных».' })),
            h('div', { class: 'card' }, h('h3', { text: 'Цвета персонажей в этой главе' }),
              h('div', { class: 'hint', style: 'margin-bottom:6px', text: 'Из каких цветов игроки выбирают («Хотите сменить цвет?», первый вход, кнопка ◐). Ничего не отмечено — из всех. Так гамма сужается к общей от главы к главе.' }),
              h('div', { class: 'checks' }, g.palette.map(function (p) {
                var cb = h('input', { type: 'checkbox', checked: c.colors.indexOf(p.id) >= 0 });
                cb.addEventListener('change', function () {
                  var i = c.colors.indexOf(p.id);
                  if (cb.checked && i < 0) c.colors.push(p.id);
                  if (!cb.checked && i >= 0) c.colors.splice(i, 1);
                  changed();
                });
                return h('label', {}, cb, h('span', { style: 'display:inline-block;width:12px;height:12px;margin:0 6px;vertical-align:-1px;background:' + p.color }), p.name);
              })),
              fld('Цвет главы для всех', c, 'force', { options: colorOptions('нет — у каждого свой'),
                hint: 'Перебивает выбор игроков и цвета по умолчанию; кнопка ◐ в этой главе не работает. Например, в последней главе — один цвет у всех.' }),
              check('Сообщения и снимки в чужих чатах — цветом отправителя (иначе цветом читающего; закреплённый у аккаунта цвет — всегда)', c, 'senderColor'),
              check('При переходе в эту главу выбор игроков сбрасывается — у всех цвет по умолчанию из «Аккаунтов»', c, 'colorReset'),
              fld('«Расшифровка» сообщений в чатах, секунд', c, 'decode', { type: 'number', after: function () { c.decode = Math.max(0, Math.min(120, parseInt(c.decode, 10) || 0)); },
                hint: '0 — нет. Иначе пришедшее в этой главе сообщение сначала из 0 и 1, буквы проступают по одной за это время (у всех, и у отправителя). Пишется как обычно.' })),
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

  /* П14 (Т4-6 Б): шапка приложения и нижнее меню. */
  function pHeader() {
    var g = P.game;
    if (!g.header || !g.menu) SG.normHeader(g);
    var hd = g.header;
    function small(t) { return h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: t }); }
    function delBtn(arr, i) { return h('button', { class: 'small danger', text: 'Удалить', on: { click: function () { arr.splice(i, 1); changed(); render(); } } }); }
    function upBtn(arr, i) { return h('button', { class: 'small', text: '↑', disabled: i === 0, on: { click: function () { var x = arr.splice(i, 1)[0]; arr.splice(i - 1, 0, x); changed(); render(); } } }); }
    // П16 (Т6-8 Б): что открывается по нажатию на часть шапки
    function tapEd(t, label, autoText) {
      var box = h('div', { class: 'f hdr-tap' }, h('label', { text: label }),
        fld('', t, 'kind', { options: SG.TAP_KINDS.map(function (k) { return k[0] === 'auto' ? ['auto', 'по месту: ' + autoText] : k; }), after: render }));
      if (t.kind === 'text') box.appendChild(h('div', { class: 'grid2' }, fld('Заголовок окна', t, 'title'), fld('Текст ({{имя}}, {name}, **жирный**)', t, 'text', { area: true, rows: 3 })));
      if (t.kind === 'block') box.appendChild(fld('Блок', t, 'block', { options: [['', '—']].concat(g.blocks.map(function (b) { return [b.id, (b.section ? b.section + ' / ' : '') + (b.title || b.id)]; })) }));
      return box;
    }
    // П16: слои перезаполнения шкалы — у каждого свой эффект; предел переменной — деления × слои
    function layersEd(it) {
      it.layers = it.layers || [];
      var n = it.max || 0, box = h('div', { class: 'f hdr-layers' }, h('label', { text: 'Слои перезаполнения шкалы' }),
        small(n ? 'Слой 1 — значения 1…' + n + ', слой 2 — ' + (n + 1) + '…' + 2 * n + ' и т. д.: шкала заполняется заново со своим эффектом. Переменная не поднимется выше ' + n + ' × число слоёв' +
          (it.layers.length ? ' = ' + n * it.layers.length : '') + '; на последнем слое шкала остаётся полной. Пусто — слоёв нет.' : 'Сначала задайте число делений.'));
      it.layers.forEach(function (l, i) {
        box.appendChild(h('div', { class: 'inline hdr-layer' }, h('b', { text: 'Слой ' + (i + 1) + (n ? ' (' + (i * n + 1) + '…' + (i + 1) * n + ')' : '') }),
          fld('', l, 'fx', { options: SG.LAYER_FX, after: function () { if (l.fx === 'color' && !l.color) l.color = '#ffaa00'; render(); } }),
          (function () { var f = fld('', l, 'color', { type: 'color' }); f.querySelector('input').value = l.color || '#ffaa00'; return f; })(),
          delBtn(it.layers, i)));
      });
      box.appendChild(h('button', { class: 'small', text: '+ Слой', disabled: !n || it.layers.length >= SG.LAYERS_MAX, on: { click: function () {
        if (!it.layers.length) it.layers.push({ fx: 'fill', color: '' });
        it.layers.push({ fx: it.layers.length === 1 ? 'color' : it.layers.length === 2 ? 'glitch' : 'glow', color: it.layers.length === 1 ? '#ffaa00' : '' }); changed(); render();
      } } }));
      return box;
    }
    var items = h('div', { class: 'card hdr-items' }, h('h3', { text: 'Показатели в шапке (общие переменные)' }),
      small('Строка под именем: значение общей переменной числом («7» или «7/10») или квадратиками — горящие и погасшие (■■■□□). Подпись можно оставить пустой.'));
    if (!g.shared.length) items.appendChild(small('Общих переменных нет — добавьте на вкладке «Общее» → «Общие переменные».'));
    hd.items.forEach(function (it, i) {
      items.appendChild(h('div', { class: 'item-ed hdr-item' },
        h('div', { class: 'ih' }, h('b', { text: 'Показатель ' + (i + 1) }), h('span', { class: 'sp' }), upBtn(hd.items, i), delBtn(hd.items, i)),
        h('div', { class: 'grid3' },
          fld('Переменная', it, 'var', { options: [['', '—']].concat(g.shared.map(function (v) { return [v.name, (v.label || v.name) + ' ($' + v.name + ')']; })) }),
          fld('Подпись', it, 'label', { placeholder: 'пусто — без подписи' }),
          fld('Как показывать', it, 'show', { options: [['num', 'числом'], ['cells', 'квадратиками']], after: render })),
        h('div', { class: 'grid3' },
          fld(it.show === 'cells' ? 'Делений шкалы (максимум)' : 'Из скольких (пусто — просто число)', it, 'max', { type: 'number', after: function () { it.max = Math.max(0, Math.min(SG.CELLS_MAX, parseInt(it.max, 10) || 0)); } }),
          it.show === 'num' ? fld('Единица', it, 'unit', { placeholder: 'например: %' }) : fld('Вид делений', it, 'look', { options: [['cell', 'квадратики'], ['bar', 'черточки (узкие)']] }),
          fld('С главы', it, 'chapter', { options: chapterOptions(), number: true })),
        // П15: Т6-4 Б — порог тревоги; шкала по ширине экрана и перегрузка
        h('div', { class: 'grid3' },
          fld('Тревога, если меньше', it, 'low', { type: 'number', placeholder: 'пусто — нет', after: function () { var x = String(it.low).trim().replace(',', '.'); it.low = x === '' || !isFinite(+x) ? '' : +x; },
            hint: 'Ниже порога — тревожным цветом и мигает.' }),
          (function () { var f = fld('Цвет тревоги', it, 'lowColor', { type: 'color' }); f.querySelector('input').value = it.lowColor || '#ff3b3b'; return f; })(),
          it.show === 'cells' ? h('div', {}, check('Шкала по ширине экрана', it, 'fit'),
            (it.layers || []).length ? small('Перегрузка — не нужна: заданы слои.') : check('Перегрузка: больше максимума — сбоит столько делений, на сколько превышено', it, 'over')) : h('div')),
        it.show === 'cells' ? layersEd(it) : h('div'),
        tapEd(it.tap = it.tap || SG.normTap(), 'По нажатию на показатель', 'сведения о нём (значение, пределы, слой, тревога)'),
        h('div', { class: 'f' }, h('label', { text: 'Кому видно' }), whoEditor(it.who, 'Пусто — всем.'))));
    });
    items.appendChild(h('button', { class: 'btn', text: '+ Показатель', disabled: !g.shared.length, on: { click: function () {
      hd.items.push({ id: SG.uid('h'), var: g.shared[0] ? g.shared[0].name : '', label: '', show: 'num', max: 0, chapter: 1, who: [], unit: '' }); changed(); render();
    } } }));
    // П15 (Т6-3 Б): свои строки шапки у главы
    var hch = h('div', { class: 'card hdr-chapters' }, h('h3', { text: 'Строки шапки по главам' }),
      small('С главы N — свои строки и заголовок окна-сводки (пустое поле — как в общей шапке выше). Действует до следующей такой записи.'));
    hd.chapters.forEach(function (c, i) {
      hch.appendChild(h('div', { class: 'item-ed hdr-ch' },
        h('div', { class: 'ih' }, h('b', { text: 'С главы' }), fld('', c, 'chapter', { options: chapterOptions(), number: true }), h('span', { class: 'sp' }), delBtn(hd.chapters, i)),
        h('div', { class: 'grid3' }, fld('Первая строка', c, 'title', { placeholder: 'как в общей' }), fld('Вторая строка', c, 'sub', { placeholder: 'как в общей' }),
          fld('Заголовок сводки', c, 'infoTitle', { placeholder: 'как в общей' })),
        fld('Окно по нажатию на главу (П16; пусто — как в предыдущей)', c, 'about', { area: true, rows: 3, placeholder: 'например: Режим аварийного питания. Связь ограничена.' })));
    });
    hch.appendChild(h('button', { class: 'btn', text: '+ Строки для главы', on: { click: function () {
      hd.chapters.push({ id: SG.uid('hc'), chapter: Math.min(g.chapters.length, 2), title: '', sub: '', infoTitle: '' }); changed(); render();
    } } }));
    hd.taps = hd.taps || {};
    var taps = h('div', { class: 'card hdr-taps' }, h('h3', { text: 'Нажатие на части шапки' }),
      small('В шапке несколько мест нажатия: имя, глава (справа), каждый показатель (настраивается у показателя). По месту: имя — досье персонажа (профиль с вкладки «Аккаунты»; нет профиля — общая сводка), глава — окно главы (текст в «Строках шапки по главам»; нет текста — общая сводка).'),
      tapEd(hd.taps.who = hd.taps.who || SG.normTap(), 'По нажатию на имя', 'досье персонажа'),
      tapEd(hd.taps.chapter = hd.taps.chapter || SG.normTap(), 'По нажатию на главу', 'окно главы'));
    var info = h('div', { class: 'card hdr-info' }, h('h3', { text: 'Окно по нажатию на шапку' }),
      small('Игрок нажимает на шапку — окно со всеми показателями и разделами ниже. В тексте — {{имя}} (общая переменная), **жирный**. Нет ни показателей, ни разделов — шапка не нажимается.'),
      fld('Заголовок окна', hd, 'infoTitle', { placeholder: 'СВОДКА' }));
    hd.info.forEach(function (s, i) {
      info.appendChild(h('div', { class: 'item-ed hdr-sec' },
        h('div', { class: 'ih' }, h('b', { text: 'Раздел ' + (i + 1) }), h('span', { class: 'sp' }), upBtn(hd.info, i), delBtn(hd.info, i)),
        h('div', { class: 'grid2' }, fld('Заголовок раздела', s, 'title'), fld('С главы', s, 'chapter', { options: chapterOptions(), number: true })),
        fld('Текст', s, 'text', { area: true, rows: 4, placeholder: 'например: Реактор: {{power}} из 10. Шлюз открыт: {{open}}.' }),
        h('div', { class: 'f' }, h('label', { text: 'Кому видно' }), whoEditor(s.who, 'Пусто — всем.'))));
    });
    info.appendChild(h('button', { class: 'btn', text: '+ Раздел', on: { click: function () { hd.info.push({ id: SG.uid('i'), title: '', text: '', chapter: 1, who: [] }); changed(); render(); } } }));
    // меню: полный список по порядку, правится копия → game.menu
    var menu = SG.menuTabs(g);
    function saveMenu() {
      g.menu = menu.map(function (m) { return { tab: m.tab, label: m.label || '', hidden: !!m.hidden, chapter: +m.chapter || 1, who: m.who || [] }; });
      if (g.menu.every(function (m, i) { return !m.label && !m.hidden && m.chapter === 1 && !m.who.length && m.tab === SG.MENU_TABS[i][0]; })) g.menu = [];
      changed();
    }
    var mt = h('table', { class: 'codes menu-table' }, h('tr', {}, h('th', { text: 'Вкладка' }), h('th', { text: 'Название на телефоне' }), h('th', { text: 'С главы' }), h('th', { text: 'Кому' }), h('th', { text: 'Скрыть' }), h('th', { text: '' })));
    menu.forEach(function (m, i) {
      var lab = h('input', { type: 'text', value: m.label, placeholder: m.def });
      lab.addEventListener('input', function () { m.label = lab.value; saveMenu(); });
      var hid = h('input', { type: 'checkbox', class: 'menu-hide', checked: m.hidden });
      hid.addEventListener('change', function () { m.hidden = hid.checked; saveMenu(); });
      // П15 (Т6-5 Б): с главы и кому
      var chs = h('select', { class: 'menu-ch' });
      chapterOptions().forEach(function (op) { chs.appendChild(h('option', { value: op[0], text: op[1], selected: String(m.chapter || 1) === String(op[0]) })); });
      chs.addEventListener('change', function () { m.chapter = +chs.value || 1; saveMenu(); });
      if (!m.who) m.who = [];
      var whoBox = h('div', { class: 'checks small-checks' }, g.accounts.map(function (a) {
        var c = h('input', { type: 'checkbox', checked: m.who.indexOf(a.id) >= 0 });
        c.addEventListener('change', function () { var k = m.who.indexOf(a.id); if (c.checked && k < 0) m.who.push(a.id); if (!c.checked && k >= 0) m.who.splice(k, 1); saveMenu(); });
        return h('label', {}, c, a.name);
      }));
      mt.appendChild(h('tr', { 'data-tab': m.tab }, h('td', { text: m.def }), h('td', {}, lab), h('td', {}, chs), h('td', { title: 'Ничего не отмечено — всем' }, whoBox), h('td', {}, hid),
        h('td', {}, h('button', { class: 'small', text: '↑', disabled: i === 0, on: { click: function () { var x = menu.splice(i, 1)[0]; menu.splice(i - 1, 0, x); saveMenu(); render(); } } }))));
    });
    return [h('h1', { text: 'Шапка и меню' }),
      h('div', { class: 'card' }, h('h3', { text: 'Строки шапки' }),
        h('div', { class: 'grid2' },
          fld('Первая строка', hd, 'title', { placeholder: 'пусто — имя персонажа', hint: '{name} — имя, {prof} — профессия, {chapter} — глава, {{имя}} — общая переменная.' }),
          fld('Вторая строка', hd, 'sub', { placeholder: 'пусто — профессия', hint: 'Под именем, мелко (сейчас там профессия из карточки персонажа). Те же {name}, {prof}, {chapter}, {{имя}}; «-» — без второй строки.' })),
        check('Показывать главу справа', hd, 'chapter'),
        // П19 (замечание 5): размер шапки и сколько показателей в ней
        h('div', { class: 'grid2 hdr-size' },
          fld('Размер шапки', hd, 'size', { options: [['compact', 'компактно (мелкие шкалы и подписи)'], ['normal', 'обычно'], ['large', 'крупно']] }),
          fld('В шапке не больше показателей', hd, 'maxItems', { type: 'number', placeholder: '0 — все', hint: '0 — все. Остальные — в окне по нажатию на шапку (в шапке — «+N»).' }))),
      hch, items, taps, info,
      h('div', { class: 'card hdr-menu' }, h('h3', { text: 'Нижнее меню' }),
        small('Порядок (↑), свои названия, с какой главы и кому видна вкладка (ничего не отмечено — всем), скрытые у всех. «Связь», «Камера», «Заметки», «Приборы» видны, только если функция есть у персонажа. Скрытая «Код» — коды вводятся только сканером и голосом.'),
        mt, h('button', { class: 'small', text: 'Как было', on: { click: function () { g.menu = []; changed(); render(); } } })),
      small('Как это выглядит — вкладка «Предпросмотр».')];
  }

  function pAccounts() {
    var g = P.game;
    return [h('h1', { text: 'Аккаунты' }),
      h('p', { class: 'lead', text: 'Один аккаунт — один персонаж. В начале игры мастер вводит на телефоне игрока его код входа, и телефон остаётся в этом аккаунте; сменить его можно только мастерским кодом. Профиль (Мультипаспорт) виден игроку сверху на вкладке «Данные».' }),
      twoCol({
        key: 'accounts', items: g.accounts,
        label: function (a) { return a.name; }, small: function (a) { return a.profession; },
        add: function () {
          var a = { id: SG.uid('a'), name: 'Новый персонаж', profession: '', num: '', login: randomCode(6), items: [], modules: ['chat', 'notes', 'voice'], modState: {}, modChapter: {}, colors: {}, comment: '', where: '', voiceMode: 'always' };   // П26 (06, 154): голос в фоне по умолчанию
          g.accounts.push(a);
          return a;
        },
        form: function (a, drawList) {
          var own = g.blocks.filter(function (b) { return b.who.indexOf(a.id) >= 0; });
          if (!Array.isArray(a.modules)) a.modules = [];
          a.modState = a.modState || {}; a.modChapter = a.modChapter || {};
          return [moveDel(g.accounts, a, h('button', { text: 'Посмотреть глазами игрока', on: { click: function () { ui.pv.account = a.id; ui.tab = 'preview'; render(); } } })),
            h('div', { class: 'card' }, h('h3', { text: 'Персонаж' }),
              h('div', { class: 'grid2' }, fld('Имя (в шапке приложения)', a, 'name', { after: drawList }), fld('Профессия', a, 'profession', { after: drawList })),
              fld('Номер на терминале', a, 'num', { hint: 'Номер сотрудника в таблице кодов терминала Twine («Коды» → «Сотрудники»). По нему терминал шлёт этому персонажу уведомления, сбои и открывает блоки; «тому, кто ввёл код» — тоже по нему. Пусто — терминал персонажа не различает.' }),
              fld('Код входа', a, 'login', { button: randBtn(a, 'login', 6), hint: 'Его вводит мастер в начале игры. Можно напечатать как QR (вкладка «QR-коды»).' })),
            h('div', { class: 'card' }, h('h3', { text: 'Функции приложения' }),
              h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-bottom:8px', text: 'Галочка — функция включена с указанной главы. Без галочки или до главы — как выбрано справа. Кодом (действие «Функция приложения») её можно включить, выключить или «сломать» во время игры.' }),
              h('table', { class: 'mods' }, h('tbody', {}, SG.MODULES_ON.map(function (md) {
                var c = h('input', { type: 'checkbox', checked: a.modules.indexOf(md.id) >= 0 });
                c.addEventListener('change', function () {
                  var i = a.modules.indexOf(md.id);
                  if (c.checked && i < 0) a.modules.push(md.id);
                  if (!c.checked && i >= 0) a.modules.splice(i, 1);
                  if (md.id === 'voice') { a.voiceMode = c.checked ? (a.voiceMode && a.voiceMode !== 'off' ? a.voiceMode : 'always') : 'off'; changed(); render(); return; }
                  changed();
                });
                var ch = h('select', {}, chapterOptions().map(function (o) { return h('option', { value: o[0], text: 'с гл. ' + o[0], title: o[1], selected: (a.modChapter[md.id] || 1) === o[0] }); }));
                ch.addEventListener('change', function () { a.modChapter[md.id] = +ch.value; changed(); });
                var off = h('select', {}, SG.MOD_OFF.map(function (o) { return h('option', { value: o[0], text: 'иначе: ' + o[1], selected: (a.modState[md.id] || 'hidden') === o[0] }); }));
                off.addEventListener('change', function () { a.modState[md.id] = off.value; changed(); });
                if (!Array.isArray(a.secret)) a.secret = [];
                var sc = h('input', { type: 'checkbox', checked: a.secret.indexOf(md.id) >= 0 });
                sc.addEventListener('change', function () { var k = a.secret.indexOf(md.id); if (sc.checked && k < 0) a.secret.push(md.id); if (!sc.checked && k >= 0) a.secret.splice(k, 1); changed(); });
                return h('tr', {}, h('td', {}, h('label', { class: 'inline', style: 'cursor:pointer' }, c, h('b', { text: md.name }))),
                  h('td', {}, ch), h('td', {}, off), h('td', {}, h('label', { class: 'inline secret', title: 'П17: вкладки не видно; код с действием «Функция приложения» → «открыть скрытую программу» открывает её, после выхода она снова скрыта', style: 'cursor:pointer;font-size:12px' }, sc, 'скрытая')),
                  h('td', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: md.hint }));
              })))),
            voiceAccCard(a),
            spyAccCard(a),
            colorsCard(a),
            notesCard(a),
            h('div', { class: 'card' }, h('h3', { text: 'Профиль (Мультипаспорт)' }),
              h('div', { class: 'hint', style: 'margin-bottom:8px', text: 'Необязательно. Если пусто, карточки профиля не будет.' }), itemsEditor(a.items)),
            h('div', { class: 'card' }, h('h3', { text: 'Только для этого персонажа' }),
              own.length ? own.map(function (b) { return h('div', {}, '• ', b.title || '(без названия)'); }) : h('div', { class: 'hint', text: 'Блоков, отмеченных только для него, нет.' }))];
        }
      })];
  }

  /* П17: заметки персонажа с начала игры (вкладка «ЗАМЕТКИ»): памятка, список проверки. Новая версия пакета обновляет
     текст заметки, если игрок её не правил. */
  function notesCard(a) {
    if (!Array.isArray(a.notes)) a.notes = [];
    return h('div', { class: 'card notes-card' }, h('h3', { text: 'Заметки с начала игры' }),
      h('div', { class: 'hint', style: 'margin-bottom:8px', text: 'Появляются во вкладке «ЗАМЕТКИ» у персонажа (нужна функция «Заметки»). Игрок может их читать, править и удалять. Первая строка — заголовок.' }),
      a.notes.map(function (n, i) {
        var ta = h('textarea', { rows: 6, value: n.text });
        ta.addEventListener('input', function () { n.text = ta.value; changed(); });
        return h('div', { class: 'f' }, ta, h('button', { text: 'Убрать заметку', on: { click: function () { a.notes.splice(i, 1); changed(); render(); } } }));
      }),
      h('button', { text: '+ Заметка', on: { click: function () { a.notes.push({ id: SG.uid('pn'), text: '' }); changed(); render(); } } }));
  }

  /* Голос персонажа (П-58): режим микрофона. «выкл» — функции «Голос» нет; включить по ходу игры — кодом (действие «Функция приложения»). */
  function setVoiceMode(a, v) {
    a.voiceMode = v;
    var i = a.modules.indexOf('voice');
    if (v === 'off' && i >= 0) a.modules.splice(i, 1);
    if (v !== 'off' && i < 0) a.modules.push('voice');
  }
  var VOICE_HINT = {
    off: 'Микрофон не слушает. Функцию «Голос» можно включить кодом во время игры (тогда — «всегда в фоне», если не выбран режим).',
    button: 'Кнопка 🎙 в шапке: держать — слушает, пока нажата; коротко нажать — слушает, пока не нажмёшь снова. Только когда приложение на экране.',
    screen: 'Слушает в фоне, пока экран включён и разблокирован (и в других приложениях). Экран погас или заблокирован — микрофон выключается.',
    always: 'Слушает всегда, и с погашенным экраном: служба с типом «микрофон», значок в шторке. Больше всего расходует батарею.'
  };
  function voiceAccCard(a) {
    var sl = h('select', {}, SG.VOICE_MODES.map(function (o) { return h('option', { value: o[0], text: o[1], selected: (a.voiceMode || 'off') === o[0] }); }));
    sl.addEventListener('change', function () { setVoiceMode(a, sl.value); changed(); render(); });
    var n = P.game.codes.filter(function (c) { return c.voice && !c.app && (c.term || SG.allowed(c.who, a.id)); }).length;
    return h('div', { class: 'card' }, h('h3', { text: '🎙 Голос' }),
      h('div', { class: 'f' }, h('label', { text: 'Микрофон' }), sl, h('div', { class: 'hint', text: VOICE_HINT[a.voiceMode || 'off'] })),
      h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Фраз для этого персонажа: ' + n + '. Во всех режимах, кроме кнопки, работает детектор голоса: распознаватель включается только на речь. С какой главы и что видно без функции — в таблице «Функции приложения» (строка «Голос»).' }));
  }

  /* П25: шпионаж текстом — код прослушки этого персонажа и подмена (кого слышно на самом деле). */
  function spyAccCard(a) {
    var g = P.game;
    var hackOn = SG.hackInGame(g);
    if (!SG.spyInGame(g) && !hackOn) return null;
    if (!g.spy) SG.normSpy(g);
    var opts = [['', 'случайный другой']].concat(g.accounts.filter(function (x) { return x.id !== a.id; }).map(function (x) { return [x.id, x.name || x.id]; }));
    return h('div', { class: 'card' }, h('h3', { text: '🕵 Шпионаж' }),
      h('div', { class: 'grid2' }, fld('Код прослушки (и цели взлома) этого персонажа', a, 'spyCode', { button: randBtn(a, 'spyCode', 5), hint: 'Его добывают в игре: шпион вводит, сканирует (QR — вкладка «QR-коды») или говорит. Пусто — по коду его не послушать.' }),
        g.spy.mode === 'fake' ? fld('Подменный: вместо него слышно', a, 'spyFake', { options: opts }) : h('div')),
      hackOn || g.spy.mode === 'wave' ? fld('Частота на шкале (подпись канала)', a, 'hackFreq', { placeholder: SG.freqOf(a), hint: 'Её видно у канала при ловле волны; можно узнать в игре. Пусто — ' + SG.freqOf(a) + '.' }) : null);
  }

  /* Цвет персонажа по главам (П-50, П-51): по умолчанию, выбирает сам, всегда этим цветом в чужих чатах. */
  function colorsCard(a) {
    var g = P.game;
    a.colors = a.colors || {};
    function cfg(n) { return a.colors[n] || (a.colors[n] = {}); }
    function tidy(n) { var c = a.colors[n]; if (c && !c.def && !c.choose && !c.any && !c.pin) delete a.colors[n]; }
    function selC(n, key, first) {
      var sl = h('select', {}, colorOptions(first).map(function (o) { return h('option', { value: o[0], text: o[1], selected: ((a.colors[n] || {})[key] || '') === o[0] }); }));
      sl.addEventListener('change', function () { cfg(n)[key] = sl.value; tidy(n); changed(); });
      return sl;
    }
    return h('div', { class: 'card' }, h('h3', { text: 'Цвет интерфейса' }),
      h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-bottom:8px', text: 'По главам. «Выбирает сам» — на первом входе персонаж выбирает цвет (заданный стоит отмеченным). «В любое время» — кнопка ◐ в шапке; мастер может включить и выключить её с пульта до конца главы. «В чужих чатах» — его сообщения и снимки у других всегда этим цветом, какой бы он ни выбрал; только в этой главе. Предложить сменить цвет — правило («каждые N минут») или пульт мастера.' }),
      h('table', { class: 'mods' }, h('tbody', {},
        h('tr', {}, h('td', { text: 'Глава' }), h('td', { text: 'По умолчанию' }), h('td', { text: 'Выбирает сам' }), h('td', { text: 'В любое время' }), h('td', { text: 'В чужих чатах всегда' })),
        g.chapters.map(function (ch, i) {
          var n = String(i + 1);
          function box(key) {
            var cb = h('input', { type: 'checkbox', checked: !!(a.colors[n] || {})[key] });
            cb.addEventListener('change', function () { cfg(n)[key] = cb.checked; tidy(n); changed(); });
            return cb;
          }
          return h('tr', {}, h('td', { text: (i + 1) + '. ' + ch.name }), h('td', {}, selC(n, 'def', 'как у главы')), h('td', { class: 'c-choose' }, box('choose')), h('td', { class: 'c-any' }, box('any')),
            h('td', {}, selC(n, 'pin', 'нет (как настроено в главе)')));
        }))));
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
                h('div', { class: 'f' }, h('label', { text: 'Как открывается' }), check('Открыт сразу (без кода)', b, 'start', drawList),
                  check('Можно передать другому игроку (QR с телефона)', b, 'share'),
                  check('Скрытый: открывается только кодом, в списке не виден', b, 'hidden', drawList))),
              fld('Текст искажён до главы (нечитаемые знаки)', b, 'garble', { options: [[0, 'не искажён']].concat(chapterOptions().slice(1).map(function (o) { return [o[0], 'до «' + o[1].replace(/^\d+\. /, '') + '»']; })),
                after: function () { b.garble = +b.garble; }, hint: 'До этой главы игрок видит текст блока искажёнными знаками; с неё — настоящий текст.' }),
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

  function newCode(app) {
    var c = SG.normCode({ id: SG.uid('k'), code: randomCode(4), app: app || '' });
    P.game.codes.push(c);
    return c;
  }
  function appOptions() { return [['', 'вкладки «Код» и «Сканер»']].concat(P.game.apps.map(function (a) { return [a.id, 'прибор «' + a.name + '»']; })); }

  /* Список строк текста (ответы по счёту) */
  function textList(list, label) {
    var wrap = h('div', {});
    function draw() {
      wrap.innerHTML = '';
      list.forEach(function (t, i) {
        var ta = h('textarea', { rows: 2, value: t, style: 'min-height:48px' });
        ta.addEventListener('input', function () { list[i] = ta.value; changed(); });
        wrap.appendChild(h('div', { class: 'f' }, h('div', { class: 'inline' }, h('label', { style: 'color:var(--dim);font-size:12px;flex:1', text: label(i) }),
          h('button', { class: 'small danger', text: 'Удалить', on: { click: function () { list.splice(i, 1); changed(); draw(); } } })), ta));
      });
      wrap.appendChild(h('button', { class: 'small', text: '+ ещё ответ', on: { click: function () { list.push(''); changed(); draw(); } } }));
    }
    draw();
    return wrap;
  }

  /* Действия кода или правила. self — есть «тот, кто ввёл код». */
  function actionsEditor(list, self) {
    var g = P.game;
    var wrap = h('div', {});
    function opts(arr, cur) { return arr.map(function (o) { return h('option', { value: o[0], text: o[1], selected: String(cur) === String(o[0]) }); }); }
    function selF(label, a, key, arr, after) {
      var sl = h('select', {}, opts(arr, a[key]));
      sl.addEventListener('change', function () { a[key] = sl.value; changed(); if (after) after(); });
      return h('div', { class: 'f' }, h('label', { text: label }), sl);
    }
    function txt(label, a, key, ph) {
      var inp = h('input', { type: 'text', value: a[key] == null ? '' : a[key], placeholder: ph || '' });
      inp.addEventListener('input', function () { a[key] = inp.value; changed(); });
      return h('div', { class: 'f' }, h('label', { text: label }), inp);
    }
    function toEd(a) {
      var mode = a.to === 'hands' ? 'hands' : a.to === 'self' || (a.to == null && self) ? 'self' : Array.isArray(a.to) && a.to.length ? 'some' : 'all';
      if (!self && mode === 'self') mode = 'all';
      var box = h('div', {});
      var sl = h('select', {}, opts((self ? [['self', 'тому, кто ввёл код']] : []).concat([['all', 'всем'], ['some', 'выбранным персонажам'], ['hands', 'тем, у кого телефон в руках']]), mode));
      sl.addEventListener('change', function () { a.to = sl.value === 'self' ? 'self' : sl.value === 'hands' ? 'hands' : []; changed(); draw(); });
      box.appendChild(h('div', { class: 'f' }, h('label', { text: 'Кому' }), sl));
      if (mode === 'some' || (mode === 'all' && Array.isArray(a.to))) {
        if (!Array.isArray(a.to)) a.to = [];
        if (mode === 'some') box.appendChild(whoEditor(a.to, ''));
      }
      return box;
    }
    function body(a) {
      switch (a.type) {
        case 'open': a.blocks = a.blocks || []; return [blocksPicker(a.blocks), txt('Заголовок окна', a, 'title', 'НОВЫЕ ДАННЫЕ'), toEd(a)];
        case 'notify': return [selF('Шаблон', a, 'notice', [['', '— свой текст —']].concat(g.notices.map(function (n) { return [n.id, n.name || n.title]; }))),
          txt('Заголовок (если без шаблона)', a, 'title'), txt('Текст (если без шаблона)', a, 'text'), toEd(a)];
        case 'alarm': if (a.on == null) a.on = true;
          return [selF('Режим', a, 'alarm', [['', 'общий']].concat(g.alarms.map(function (x) { return [x.id, x.name]; }))),
            selF('Что сделать', a, 'on', [[true, 'включить у всех'], [false, 'выключить у всех']], function () { a.on = a.on === 'true' || a.on === true; })];
        case 'glitch': return [selF('Сбой / состояние', a, 'glitch', g.glitches.map(function (x) { return [x.id, x.name]; })), toEd(a)];
        case 'fix': return [selF('Какой', a, 'glitch', [['', 'все']].concat(g.glitches.map(function (x) { return [x.id, x.name]; }))), toEd(a),
          h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Обычно код ремонта вводят на телефоне со сбоем («тому, кто ввёл код»). «Выбранным» и «всем» — снять сбой на других телефонах через сеть (например, фраза голосом на ключевом телефоне).' })];
        case 'module': return [selF('Функция', a, 'module', SG.MODULES_ON.map(function (m) { return [m.id, m.name]; })),
          selF('Что сделать', a, 'on', [['on', 'включить / починить'], ['broken', 'сломать («ПОВРЕЖДЕНО»)'], ['denied', '«НЕТ ДОСТУПА»'], ['hidden', 'скрыть'], ['open', 'открыть скрытую программу (до выхода)']]), toEd(a)];
        case 'app': return [selF('Прибор', a, 'app', g.apps.map(function (x) { return [x.id, x.name]; })), toEd(a),
          h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Прибор появится, только если персонаж отмечен у прибора в «Кому доступен».' })];
        case 'chapter': return [selF('Глава', a, 'n', chapterOptions())];
        case 'term': return [txt('Переменная терминала', a, 'name', 'например: door_open'),
          selF('Что сделать', a, 'op', [['set', 'записать значение'], ['add', 'прибавить (число; минус — убавить)']]), txt('Значение', a, 'value', 'например: 1'),
          h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: SG.sharedVar(g, a.name) ? 'Общая переменная: центр запишет её для всех (терминал, телефоны, правила).' : 'Только терминалу (не общая переменная — список в «Общем»).' })];
        case 'event': return [txt('Название события', a, 'name', 'например: reactor_breach'),
          h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Его получает терминал и правила (вкладка «Сеть и события» → «Правила»).' })];
        case 'countdown': if (a.on == null) a.on = true;
          return [selF('Что сделать', a, 'on', [[true, 'запустить'], [false, 'остановить']], function () { a.on = a.on === 'true' || a.on === true; }),
            txt('Секунд', a, 'seconds', '600'), txt('Надпись', a, 'title', 'ДО ОТКАЗА СИСТЕМ')];
        case 'vote': return [selF('Голосование', a, 'vote', g.votes.map(function (x) { return [x.id, x.name]; }))];
        // П16 (основа 2): вспышка и короткий сигнал
        case 'torch': return [txt('Сколько раз мигнуть', a, 'n', '3'), toEd(a),
          h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Фонарик телефона (в браузере и предпросмотре — вспышка экраном). Пока приложение открыто.' })];
        case 'beep': return [selF('Звук', a, 'sound', [['beep', 'сигнал'], ['ok', 'успех'], ['err', 'ошибка']]), toEd(a)];
        case 'game': return [selF('Мини-игра', a, 'game', (g.games || []).map(function (x) { return [x.id, x.name]; })), txt('Уровень (1 — обычный; выше — труднее)', a, 'level', '1'), toEd(a)];   // П25
        case 'color': if (!a.mode) a.mode = 'offer';
          return [selF('Что сделать', a, 'mode', [['offer', 'предложить сменить цвет («Да» / «Нет»)'], ['set', 'поставить цвет'], ['any-on', 'разрешить менять в любое время (до конца главы)'], ['any-off', 'запретить менять в любое время (до конца главы)']], draw),
            a.mode === 'set' ? selF('Цвет', a, 'color', colorOptions('по умолчанию (из «Аккаунтов»)')) : null, toEd(a)];
      }
      return [];
    }
    function draw() {
      wrap.innerHTML = '';
      list.forEach(function (a, i) {
        wrap.appendChild(h('div', { class: 'item-ed' },
          h('div', { class: 'ih' }, h('b', { text: (i + 1) + '. ' + (SG.ACTIONS[a.type] || a.type) }), h('span', { class: 'sp' }),
            h('button', { class: 'small danger', text: 'Удалить', on: { click: function () { list.splice(i, 1); changed(); draw(); } } })),
          h('div', { class: 'grid2' }, body(a))));
      });
      var add = h('select', {}, h('option', { value: '', text: '+ Добавить действие…' }),
        Object.keys(SG.ACTIONS).map(function (k) { return h('option', { value: k, text: SG.ACTIONS[k] }); }));
      add.addEventListener('change', function () {
        if (!add.value) return;
        var a = { type: add.value };
        if (['open', 'notify', 'glitch', 'fix', 'module', 'app', 'color', 'torch', 'beep', 'game'].indexOf(a.type) >= 0) a.to = self ? 'self' : [];
        if (a.type === 'game' && g.games && g.games[0]) a.game = g.games[0].id;
        if (a.type === 'torch') a.n = 3;
        if (a.type === 'color') a.mode = 'offer';
        if (a.type === 'glitch' && g.glitches[0]) a.glitch = g.glitches[0].id;
        if (a.type === 'module') { a.module = SG.MODULES[0].id; a.on = 'on'; }
        if (a.type === 'app' && g.apps[0]) a.app = g.apps[0].id;
        if (a.type === 'vote' && g.votes[0]) a.vote = g.votes[0].id;
        if (a.type === 'chapter') a.n = 2;
        if (a.type === 'countdown') { a.seconds = 600; a.on = true; }
        list.push(a); changed(); draw();
      });
      wrap.appendChild(add);
    }
    draw();
    return wrap;
  }

  function pCodes() {
    var g = P.game;
    return [h('h1', { text: 'Коды' }),
      h('p', { class: 'lead', text: 'Код вводят на вкладке «Код» или сканируют на вкладке «Сканер»; коды приборов — только камерой прибора. Код открывает блоки, показывает ответ и выполняет действия. Ответ может меняться от раза к разу, быть особым для персонажей, а выдачи — ограничены («ампула на 1 раз», «ящик на 8 доз, по одной в руки»).' }),
      twoCol({
        key: 'codes', items: g.codes,
        label: function (c) { return c.code || (c.voice ? '🎙 ' + c.voice : ''); }, small: function (c) { return (c.code && c.voice ? '🎙 ' + c.voice + (c.note ? ' · ' : '') : '') + (c.note || ''); },
        group: function (c) { return c.app; }, groupLabel: function (a) { var x = SG.byId(g.apps, a); return x ? 'Прибор «' + x.name + '»' : ''; }, noGroup: 'Коды',
        add: function () { var cur = SG.byId(g.codes, ui.sel.codes); return newCode(cur ? cur.app : ''); },
        form: function (c, drawList) {
          var needNet = c.limit > 0 || c.perAcc || c.count === 'all' || c.sign > 1;
          return [moveDel(g.codes, c, h('button', { text: 'Копия', on: { click: function () {
            var k = SG.normCode(SG.clone(c)); k.id = SG.uid('k'); k.code = randomCode(4); g.codes.splice(g.codes.indexOf(c) + 1, 0, k); ui.sel.codes = k.id; changed(); render();
          } } })),
            h('div', { class: 'card' }, h('h3', { text: 'Код' }),
              h('div', { class: 'grid2' },
                fld('Код (цифры или буквы)', c, 'code', { button: randBtn(c, 'code', 4), after: drawList, hint: 'Регистр и пробелы не важны.' }),
                fld('Заметка для мастера', c, 'note', { after: drawList, placeholder: 'например: бейдж Медика', hint: 'Игрок её не видит; печатается под QR.' })),
              h('div', { class: 'grid2' },
                fld('Где срабатывает', c, 'app', { options: appOptions(), after: function () { drawList(); render(); }, hint: c.app ? 'Только камерой этого прибора, без ручного ввода.' : '' }),
                fld('Действует с главы', c, 'chapter', { options: chapterOptions(), number: true, hint: 'Раньше приложение ответит «код пока не активен».' })),
              fld('Комментарий (за что отвечает код)', c, 'comment', { placeholder: 'для себя: зачем этот код, где он лежит', hint: 'Видно только в редакторе и таблице кодов.' })),
            c.app ? null : voiceCard(c, drawList),
            h('div', { class: 'card' }, h('h3', { text: 'Кому открывается и что показывает' }), whoEditor(c.who, 'Остальные получат «нет доступа» (ниже).'),
              h('div', { class: 'f', style: 'margin-top:10px' }, h('label', { text: 'Открывает блоки' }), blocksPicker(c.opens)),
              fld('Ответ (текст в окне после ввода)', c, 'answer', { area: true, rows: 4, placeholder: 'Необязательно. Для приборов — показание: «38,4 °C»' }),
              h('div', { class: 'f' }, h('label', { text: 'Следующие разы — другие ответы (2-й, 3-й…; последний повторяется)' }),
                textList(c.answers, function (i) { return (i + 2) + '-й раз'; })),
              c.answers.length ? h('div', { class: 'grid2' },
                fld('Порядок ответов', c, 'order', { options: [['seq', 'по счёту (1-й, 2-й, 3-й…)'], ['random', 'случайно (детектор лжи)']] }),
                fld('Как считать раз', c, 'count', { options: [['acc', 'у каждого персонажа свой счёт'], ['all', 'общий счёт на всех (нужна сеть)']], after: render })) : null),
            whenCard(c),
            h('div', { class: 'card' }, h('h3', { text: 'Ограничения выдачи' + (needNet ? ' — нужна сеть' : '') }),
              h('div', { class: 'grid2' },
                fld('Сколько раз можно (всего, на всех)', c, 'limit', { type: 'number', after: function () { c.limit = Math.max(0, parseInt(c.limit, 10) || 0); render(); }, hint: '0 — без ограничения. Пример: ампула — 1, ящик — 8.' }),
                h('div', { class: 'f' }, h('label', { text: ' ' }), check('Одному персонажу — только один раз («вы уже получили»)', c, 'perAcc', render),
                  check('Показывать, сколько осталось', c, 'showLeft'))),
              c.limit > 0 || c.perAcc ? h('div', { class: 'grid2' },
                fld('Когда всё разобрали', c, 'emptyText', { placeholder: 'например: Ампула пуста', hint: 'Пусто — «' + g.texts.empty + '».' }),
                fld('Когда этот персонаж уже брал', c, 'mineText', { placeholder: 'например: Вы уже получили свою дозу', hint: 'Пусто — «' + g.texts.mine + '».' })) : null,
              h('div', { class: 'grid2' },
                fld('Подписей нужно', c, 'sign', { options: [[0, 'одна (обычный код)'], [2, 'две разных персонажа'], [3, 'три'], [4, 'четыре']], after: function () { c.sign = +c.sign; render(); } }),
                c.sign > 1 ? fld('За сколько секунд', c, 'signWindow', { type: 'number', after: function () { c.signWindow = Math.max(5, parseInt(c.signWindow, 10) || 60); } }) : h('div')),
              h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: needNet ?
                'Такой код спрашивает центр сети: двум игрокам одна ампула не достанется, даже если отсканировать одновременно. Без связи телефон ответит «' + g.texts.offline + '».' :
                'Код без ограничений работает и без сети.' })),
            h('div', { class: 'card' }, h('h3', { text: 'Особые ответы персонажам' }),
              h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-bottom:8px', text: 'Например, стимулятор: Медику — один текст, Инженеру — другой. Подходит самый точный вариант: персонаж важнее «всем», поздняя глава — ранней.' }),
              variantsEditor(c)),
            h('div', { class: 'card' }, h('h3', { text: 'Для остальных персонажей' }),
              c.who.length ? [
                check('Остальным — как неверный код (ничего не происходит)', c, 'deniedAsWrong', render),
                c.deniedAsWrong ? null : fld('Текст «нет доступа»', c, 'denied', { area: true, rows: 3, placeholder: 'Необязательно. Например: «Устройство повреждено. Нужен специалист.»' }),
                c.deniedAsWrong ? null : h('div', { class: 'f' }, h('label', { text: 'Открывает им блоки (необязательно)' }), blocksPicker(c.deniedOpens))
              ] : h('div', { class: 'hint', text: 'Код открыт всем персонажам. Отметьте выше, кому он открывается, — тогда здесь можно задать ответ для остальных.' })),
            h('div', { class: 'card' }, h('h3', { text: 'Действия' }),
              h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-bottom:8px', text: 'Выполняются, когда код сработал: уведомление, авария, сбой, функция, прибор, глава всем, отсчёт, голосование, переменная терминала. Действия «всем» и «выбранным» идут через сеть.' }),
              actionsEditor(c.actions, true))];
        }
      })];
  }

  /* Т4-5 А (П14): «когда» — условия по общим переменным. Все верны — код срабатывает; иначе «нет доступа». */
  function whenCard(c) {
    var g = P.game, box = h('div', { class: 'card when-card' });
    function draw() {
      box.innerHTML = '';
      box.appendChild(h('h3', { text: 'Когда срабатывает (общие переменные)' }));
      if (!g.shared.length) {
        box.appendChild(h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Общих переменных нет («Общее» → «Общие переменные»). С ними код может срабатывать только при условии: например, «энергия не меньше 8».' }));
        return;
      }
      c.when.forEach(function (w, i) {
        box.appendChild(h('div', { class: 'grid3 when-row' },
          fld('Переменная', w, 'var', { options: g.shared.map(function (v) { return [v.name, (v.label || v.name) + ' ($' + v.name + ')']; }) }),
          fld('Условие', w, 'op', { options: SG.WHEN_OPS }),
          h('div', { class: 'f' }, fld('Значение', w, 'value', { placeholder: 'число, текст или да/нет' }),
            h('button', { class: 'small danger', text: 'Убрать условие', on: { click: function () { c.when.splice(i, 1); changed(); draw(); } } }))));
      });
      box.appendChild(h('button', { class: 'small', text: '+ Условие', on: { click: function () {
        c.when.push({ var: g.shared[0].name, op: '>=', value: '' }); changed(); draw();
      } } }));
      if (c.when.length) {
        // П15 (Т6-7 Б): что видит игрок, если условие не выполнено
        box.appendChild(fld('Если условие не выполнено', c, 'whenMode', { options: [['', '«' + g.texts.denied + '» и ответ'], ['inactive', '«' + g.texts.inactive + '» и ответ'], ['wrong', 'как неверный код (молча)']], after: draw }));
        if (c.whenMode !== 'wrong') box.appendChild(fld('Ответ, если условие не выполнено', c, 'whenText', { area: true, rows: 2,
          placeholder: 'Необязательно. Пусто — список невыполненных условий («Энергия: нужно не меньше 8, сейчас 5»). Можно {{' + c.when[0].var + '}}.', hint: 'Все условия должны быть верны. Значения — из центра сети (без связи — последние известные).' }));
      }
      else box.appendChild(h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Без условий код срабатывает всегда (по главе и «кому»).' }));
    }
    draw();
    return box;
  }

  /* Фраза голосом у кода (П-58). */
  function voiceCard(c, drawList) {
    return h('div', { class: 'card' }, h('h3', { text: '🎙 Голосом' }),
      (function () { var hs = SG.voiceWordHints(P.game, c.voice); return hs.length ? h('div', { class: 'hint', style: 'color:#fc6;font-size:12px', text: '⚠ ' + hs.map(function (x) { return '«' + x.word + '»: ' + x.why; }).join('; ') }) : null; })(),
      fld('Фраза голосом', c, 'voice', { after: drawList, placeholder: 'например: слава лидеру',
        hint: 'Слова, как их произносят (регистр, знаки, ё не важны). Срабатывает у персонажей с функцией «Голос» («Аккаунты»), которым код открывается. Поле «Код» пустое — только голосом; если код задан (например, «СЛАВА ЛИДЕРУ»), его можно и напечатать.' }),
      h('div', { class: 'grid2' },
        fld('Сколько телефонов срабатывает', c, 'voiceMax', { type: 'number', after: function () { c.voiceMax = Math.max(0, parseInt(c.voiceMax, 10) || 0); },
          hint: '0 — у всех, кто расслышал. 1 — у одного: телефон сначала спрашивает центр, кто первый — у того и сработало; без связи — у каждого.' }),
        fld('Пауза после срабатывания, секунд', c, 'voiceEvery', { type: 'number', after: function () { c.voiceEvery = Math.max(0, parseInt(c.voiceEvery, 10) || 0); },
          hint: '0 — без паузы. Например, 60 — фраза срабатывает не чаще раза в минуту (у всех, через центр).' })),
      check('Только при включённом экране в приложении (иначе — и в фоне, с погашенным экраном)', c, 'voiceScreen', drawList),
      check('Для терминала: слышит любой телефон с голосом и молча передаёт терминалу', c, 'term', drawList),
      h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Для терминала (П-60): фраза есть у всех персонажей с функцией «Голос», на телефоне ничего не происходит — центр передаёт терминалу «услышано» (в Twine: условие «Пришло с телефона → код или фраза»). По умолчанию передаёт один телефон (кто первый). Действия ниже выполняются только у тех, кому код открывается.' }),
      h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Все фразы и общие настройки — вкладка «Голос».' }));
  }

  function variantsEditor(c) {
    var wrap = h('div', {});
    function draw() {
      wrap.innerHTML = '';
      c.variants.forEach(function (v, i) {
        wrap.appendChild(h('div', { class: 'item-ed' },
          h('div', { class: 'ih' }, h('b', { text: 'Вариант ' + (i + 1) }), h('span', { class: 'sp' }),
            h('button', { class: 'small danger', text: 'Удалить', on: { click: function () { c.variants.splice(i, 1); changed(); draw(); } } })),
          h('div', { class: 'f' }, h('label', { text: 'Кому' }), whoEditor(v.who, '')),
          fld('С главы', v, 'chapter', { options: chapterOptions(), number: true }),
          fld('Ответ', v, 'answer', { area: true, rows: 3 }),
          h('div', { class: 'f' }, h('label', { text: 'Следующие разы' }), textList(v.answers, function (k) { return (k + 2) + '-й раз'; })),
          v.answers.length ? fld('Порядок', v, 'order', { options: [['seq', 'по счёту'], ['random', 'случайно']] }) : null,
          h('div', { class: 'f' }, h('label', { text: 'Открывает блоки' }), blocksPicker(v.opens))));
      });
      wrap.appendChild(h('button', { text: '+ Особый ответ', on: { click: function () {
        c.variants.push({ id: SG.uid('w'), who: [], chapter: 1, answer: '', answers: [], order: 'seq', opens: [] }); changed(); draw();
      } } }));
    }
    draw();
    return wrap;
  }

  /* ---------- приборы (градусник, пульсоксиметр, детектор лжи…) ---------- */
  function pApps() {
    var g = P.game;
    return [h('h1', { text: 'Приборы' }),
      h('p', { class: 'lead', text: 'Прибор — отдельное «приложение» внутри приложения игрока: только камера, без ручного ввода. Один и тот же QR (например, бейдж на груди персонажа) в разных приборах даёт разное: камерой «Сканер» — имя, градусником — температуру, детектором лжи — случайно правду или ложь. У каждого персонажа свой набор приборов.' }),
      twoCol({
        key: 'apps', items: g.apps,
        label: function (a) { return a.name; }, small: function (a) { return g.codes.filter(function (c) { return c.app === a.id; }).length + ' код.'; },
        add: function () {
          var a = { id: SG.uid('p'), name: 'Градусник', title: '', hint: 'Наведите на бейдж пациента', who: [], chapter: 1, start: true, uses: 0, showUses: false, emptyText: '', unknown: '', color: '' };
          g.apps.push(a);
          return a;
        },
        form: function (a, drawList) {
          var codes = g.codes.filter(function (c) { return c.app === a.id; });
          var openers = g.codes.filter(function (c) { return c.actions.some(function (x) { return x.type === 'app' && x.app === a.id; }); });
          return [moveDel(g.apps, a, null),
            h('div', { class: 'card' }, h('h3', { text: 'Прибор' }),
              h('div', { class: 'grid2' }, fld('Название (в списке «ПРИБОРЫ»)', a, 'name', { after: drawList }), fld('Заголовок на экране прибора', a, 'title', { placeholder: 'например: ТЕРМОМЕТР ТМ-3' })),
              fld('Подсказка под камерой', a, 'hint'),
              h('div', { class: 'grid2' },
                fld('Неизвестный код', a, 'unknown', { placeholder: g.texts.unknown, hint: 'Что показать, если у этого прибора нет ответа на код.' }),
                h('div', { class: 'f' }, h('label', { text: 'Цвет рамки (необязательно)' }), (function () {
                  var c = h('input', { type: 'color', value: a.color || '#33ff66' });
                  c.addEventListener('input', function () { a.color = c.value; changed(); });
                  return h('div', { class: 'inline' }, c, h('button', { class: 'small', text: 'как у главы', on: { click: function () { a.color = ''; changed(); } } }));
                })()))),
            h('div', { class: 'card' }, h('h3', { text: 'Кому доступен и когда' }), whoEditor(a.who, 'Другим персонажам прибор не появится, даже если ввести код открытия.'),
              h('div', { class: 'grid2' },
                fld('С главы', a, 'chapter', { options: chapterOptions(), number: true }),
                h('div', { class: 'f' }, h('label', { text: 'Как появляется' }), check('Сразу (без кода)', a, 'start', render),
                  check('Скрытый: открывается только кодом (сразу на экране), после выхода не виден', a, 'hidden'))),
              !a.start ? h('div', { class: 'f' }, h('label', { text: 'Коды открытия' }),
                openers.length ? h('div', {}, openers.map(function (c) { return h('button', { class: 'small', style: 'margin:0 6px 6px 0', text: c.code + (c.note ? ' — ' + c.note : ''), on: { click: function () { ui.sel.codes = c.id; ui.tab = 'codes'; render(); } } }); }))
                  : h('div', { class: 'hint', text: 'Пока нет.' }),
                h('button', { text: '+ Код открытия прибора', on: { click: function () {
                  var c = newCode(''); c.note = 'открыть «' + a.name + '»'; c.who = a.who.slice(); c.deniedAsWrong = true; c.chapter = a.chapter;
                  c.actions.push({ type: 'app', app: a.id, to: 'self' }); ui.sel.codes = c.id; ui.tab = 'codes'; changed(); render();
                } } }), h('div', { class: 'hint', text: 'Другим персонажам такой код покажет «код не распознан».' })) : null),
            h('div', { class: 'card' }, h('h3', { text: 'Сколько раз можно измерить' }),
              h('div', { class: 'grid2' },
                fld('Измерений на персонажа', a, 'uses', { type: 'number', after: function () { a.uses = Math.max(0, parseInt(a.uses, 10) || 0); }, hint: '0 — без ограничения; 1 — одноразовый градусник.' }),
                h('div', { class: 'f' }, h('label', { text: ' ' }), check('Показывать, сколько осталось', a, 'showUses'))),
              fld('Когда прибор исчерпан', a, 'emptyText', { placeholder: g.texts.used }),
              h('div', { class: 'grid2' }, fld('«Держи ровно»: измерение, с', a, 'steady', { type: 'number', after: function () { a.steady = Math.max(0, +a.steady || 0); }, hint: 'П25: после QR полоса заполняется, пока телефон неподвижен; дрогнул — сначала. 0 — сразу.' }),
                fld('Строгость', a, 'steadyLevel', { options: [[1, 'мягко'], [2, 'обычно'], [3, 'строго']], after: function () { a.steadyLevel = +a.steadyLevel; } }))),
            h('div', { class: 'card' }, h('h3', { text: 'Что прибор показывает (коды прибора: ' + codes.length + ')' }),
              h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-bottom:8px', text: 'Каждый код — то, что видит прибор на этом QR. Разные ответы по разам, персонажам и главам, ограничения («ампула пуста») — как у обычных кодов.' }),
              codes.length ? h('table', { class: 'mini' }, h('tbody', {}, codes.map(function (c) {
                return h('tr', {}, h('td', { class: 'qr-code', text: c.code }), h('td', { text: c.note }), h('td', { class: 'sm', text: (c.answer || '').slice(0, 40) + (c.answers.length ? ' (+' + c.answers.length + ')' : '') }),
                  h('td', {}, h('button', { class: 'small', text: '→', on: { click: function () { ui.sel.codes = c.id; ui.tab = 'codes'; render(); } } })));
              }))) : null,
              h('div', { class: 'inline', style: 'margin-top:8px' },
                h('button', { text: '+ Код прибора', on: { click: function () { var c = newCode(a.id); c.note = a.name; ui.sel.codes = c.id; ui.tab = 'codes'; changed(); render(); } } }),
                h('button', { text: '+ Ответы на все коды входа… (бейджи)', title: 'Если бейдж персонажа — его код входа', on: { click: function () {
                  var made = 0;
                  g.accounts.forEach(function (acc) {
                    if (!acc.login || g.codes.some(function (c) { return c.app === a.id && SG.norm(c.code) === SG.norm(acc.login); })) return;
                    var c = newCode(a.id); c.code = acc.login; c.note = a.name + ': ' + acc.name; made++;
                  });
                  changed(); render();
                  alert(made ? 'Добавлено кодов: ' + made + '. Впишите показания в каждый.' : 'Все коды входа уже есть у прибора.');
                } } })),
              h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-top:6px', text: 'Подсказка: бейджу персонажа удобно дать свой код (не код входа). Тогда в «Кодах» сделайте код «бейдж» с ответом-именем, а у прибора — код с тем же значением и показанием.' }))];
        }
      })];
  }

  /* ---------- сеть и события: уведомления, аварии, сбои, правила, голосования ---------- */
  function pEvents() {
    var g = P.game;
    var sub = ui.evSub = ui.evSub || 'notices';
    var subs = [['notices', 'Уведомления'], ['alarms', 'Аварийные режимы'], ['glitches', 'Сбои и состояния'], ['rules', 'Правила'], ['votes', 'Голосования'], ['spy', 'Шпионаж'], ['hack', 'Взлом'], ['net', 'Как устроена сеть']];
    var nav = h('div', { class: 'subnav' }, subs.map(function (x) {
      return h('button', { class: sub === x[0] ? 'on' : '', text: x[1] + (Array.isArray(g[x[0]]) ? ' (' + g[x[0]].length + ')' : ''), on: { click: function () { ui.evSub = x[0]; render(); } } });
    }));
    var body = { notices: evNotices, alarms: evAlarms, glitches: evGlitches, rules: evRules, votes: evVotes, spy: evSpy, hack: evHack, net: evNet }[sub]();
    return [h('h1', { text: 'Сеть и события' }), nav, body];
  }
  /* П25 (06, 142, 147): мини-игры (М7). Первая — «два выбора голосом». */
  function pGames() {
    var g = P.game;
    if (!Array.isArray(g.games)) g.games = [];
    return [h('h1', { text: 'Мини-игры' }),
      h('p', { class: 'lead', text: 'Виды: «два выбора голосом», ползунок, код под таймером, провода (схема — у напарника). Уровень (у действия «Мини-игра») делает игру труднее: быстрее ползунок, длиннее код, больше проводов. «Два выбора голосом»: на экране телефона два варианта (и вопрос, если нужен) — игрок говорит верный. Только голос; кнопки — если задать «через N с». Ошибка — её действия и новая пара; провал — много ошибок или вышло время; успех — все этапы. Запуск — действием «Мини-игра» (у кода, правила) или с пульта мастера («ИГРА» → «МИНИ-ИГРЫ»). Выйти из игры до конца — провал.' }),
      twoCol({ key: 'games', items: g.games, label: function (x) { return x.name; }, small: function (x) { return x.stages + ' эт. · пар ' + x.pairs.length; },
        add: function () { var x = SG.normGame({ name: 'Два выбора', title: 'ВЫБЕРИТЕ ВЕРНОЕ', pairs: [{ q: '', ok: '', no: '' }] }); g.games.push(x); return x; },
        form: function (x, drawList) {
          function nm(label, key, hint) { return fld(label, x, key, { type: 'number', hint: hint, after: function () { x[key] = Math.max(0, Math.round(+x[key] || 0)); drawList(); } }); }
          var pairsBox = h('div', { class: 'mg-pairs' });
          function drawPairs() {
            pairsBox.innerHTML = '';
            x.pairs.forEach(function (p, i) {
              var del = h('button', { class: 'small danger', text: '✕', title: 'Убрать пару', on: { click: function () { x.pairs.splice(i, 1); changed(); drawPairs(); drawList(); } } });
              pairsBox.appendChild(h('div', { class: 'grid3 mg-pair' }, fld('Вопрос (по желанию)', p, 'q'), fld('Верный вариант', p, 'ok'),
                h('div', { class: 'f' }, h('label', { text: 'Неверный вариант' }), h('div', { class: 'inline' }, (function () {
                  var inp = h('input', { type: 'text', value: p.no });
                  inp.addEventListener('input', function () { p.no = inp.value; changed(); });
                  return inp;
                })(), del))));
            });
            pairsBox.appendChild(h('button', { text: '+ Пара', on: { click: function () { x.pairs.push({ q: '', ok: '', no: '' }); changed(); drawPairs(); drawList(); } } }));
          }
          drawPairs();
          return [moveDel(g.games, x, null),
            h('div', { class: 'card' }, h('h3', { text: 'Игра' }),
              fld('Вид', x, 'kind', { options: SG.GAME_KINDS, after: function () { drawList(); render(); } }),
              h('div', { class: 'grid2' }, fld('Название (для мастера и действий)', x, 'name', { after: drawList }), fld('Заголовок на экране', x, 'title')),
              h('div', { class: 'grid3' }, nm('Этапов', 'stages'), nm('Ошибок до провала', 'maxErr'), fld('Повтор', x, 'repeat', { options: SG.GAME_REPEAT, after: function () { render(); } })),
              x.repeat === 'pause' ? nm('Пауза перед новой игрой, минут', 'pauseMin') : null,
              x.kind === 'voice2' ? check('Пары — случайно (иначе по порядку)', x, 'random') : null,
              fld('После провала — снова', x, 'failFrom', { options: [['zero', 'с нуля'], ['stage', 'с этапа, на котором проиграл']] })),
            x.kind === 'voice2' ? h('div', { class: 'card' }, h('h3', { text: 'Пары вариантов' }),
              h('div', { class: 'hint', text: 'Варианты говорят вслух: пишите словами, как слышится (цифры — словами). Варианты на экране меняются местами случайно. Пар лучше не меньше этапов.' }), pairsBox) : null,
            x.kind === 'slider' ? h('div', { class: 'card' }, h('h3', { text: 'Ползунок' }), h('div', { class: 'hint', text: 'Ползунок падает сам — игрок ведёт пальцем вверх. Этап — продержать его в коридоре N секунд (коридор понемногу ходит); упал до нуля — ошибка. «Тихие падения» — резкие провалы без подсказки.' }),
              h('div', { class: 'grid2' }, nm('Скорость падения (из 100 в секунду)', 'speed'), nm('Ширина коридора (из 100)', 'band')),
              h('div', { class: 'grid2' }, nm('Держать в коридоре, с', 'holdSec'), nm('«Тихие падения», % в секунду', 'silent'))) : null,
            x.kind === 'code' ? h('div', { class: 'card' }, h('h3', { text: 'Код под таймером' }), h('div', { class: 'hint', text: 'Код показывается на N секунд — потом скрывается, его надо ввести. Каждый этап — на сколько-то цифр длиннее.' }),
              h('div', { class: 'grid3' }, nm('Цифр', 'digits'), nm('Показ, с', 'showSec'), nm('+ цифр на этап', 'grow'))) : null,
            x.kind === 'wires' ? h('div', { class: 'card' }, h('h3', { text: 'Провода' }), h('div', { class: 'hint', text: 'Провода случайных цветов; на телефоне напарника — схема: какие перерезать и в каком порядке. Неверный — ошибка. Без напарника схема видна на том же экране.' }),
              h('div', { class: 'grid2' }, nm('Проводов', 'wires'), nm('Перерезать', 'cuts')),
              h('div', { class: 'f' }, h('label', { text: 'Напарник (кому приходит схема)' }), whoEditor(x.partners, ''))) : null,
            h('div', { class: 'card' }, h('h3', { text: 'Время' + (x.kind === 'voice2' ? ' и кнопки' : '') + ' (0 — нет)' }),
              h('div', { class: 'grid3' }, nm('На этап, с', 'stageSec', 'Например, 4 этапа по 20 с.'), nm('На всю игру, с', 'totalSec', 'Например, 90 с.'),
                x.kind === 'voice2' ? nm('Кнопки через, с', 'buttonsAfter', '0 — только голос; 10 — через 10 с на этапе можно нажать вариант.') : h('div'))),
            h('div', { class: 'card' }, h('h3', { text: 'Итог' }),
              h('div', { class: 'grid2' }, fld('Текст при успехе', x, 'okText', { placeholder: 'УСПЕХ' }), fld('Текст при провале', x, 'failText', { placeholder: 'ПРОВАЛ' })),
              h('div', { class: 'f' }, h('label', { text: 'Действия при успехе' }), actionsEditor(x.okActions, true)),
              h('div', { class: 'f' }, h('label', { text: 'Действия при ошибке (каждой)' }), actionsEditor(x.errActions, true)),
              h('div', { class: 'f' }, h('label', { text: 'Действия при провале' }), actionsEditor(x.failActions, true)))];
        } })];
  }

  /* П26 (06, 155): вид глитча у жертвы прослушки — список эффектов, у каждого сила и рост. */
  var SPY_FX_HINT = { bits: 'доля букв интерфейса, ставших 0 и 1', typo: 'вероятность, что клавиша напечатает соседнюю букву (не больше 50 %)', vibe: 'чем сильнее, тем чаще и дольше (раз в 20 с → раз в 2 с)',
    ripple: 'размах волны и насыщенность полос по экрану', glitch: 'вероятность за 10 с, что сбой начнётся; кончается вместе с прослушкой' };
  function spyFxEditor(g, sp) {
    var box = h('div', { class: 'f spy-fx' });
    function draw() {
      box.innerHTML = '';
      box.appendChild(h('label', { text: 'Глитчи у жертвы (несколько сразу; ничего — жертва ничего не замечает сама)' }));
      sp.fx.forEach(function (f, i) {
        var kind = h('select', {}, SG.SPY_FX.map(function (o) { return h('option', { value: o[0], text: o[1], selected: f.kind === o[0] }); }));
        kind.addEventListener('change', function () { f.kind = kind.value; changed(); draw(); });
        var gl = null;
        if (f.kind === 'glitch') {
          gl = h('select', {}, [h('option', { value: '', text: '— сбой —' })].concat(g.glitches.map(function (x) { return h('option', { value: x.id, text: x.name, selected: f.glitch === x.id }); })));
          gl.addEventListener('change', function () { f.glitch = gl.value; changed(); });
        }
        function num(key, title) {
          var inp = h('input', { type: 'number', min: 0, value: f[key], title: title, style: 'width:80px !important;flex:0 0 80px' });
          inp.addEventListener('input', function () { f[key] = Math.max(0, +inp.value || 0); changed(); });
          return inp;
        }
        box.appendChild(h('div', { class: 'inline spy-fx-row', style: 'gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0' }, kind, gl,
          h('span', { class: 'sm', text: 'сила, %' }), num('power', 'с какой силы начинается'), h('span', { class: 'sm', text: 'рост, % в мин' }), num('grow', 'на сколько растёт за минуту'),
          h('button', { class: 'small', text: '✕', title: 'убрать эффект', on: { click: function () { sp.fx.splice(i, 1); changed(); render(); } } }),
          h('span', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: SPY_FX_HINT[f.kind] || '' })));
      });
      box.appendChild(h('button', { class: 'small', text: '+ Эффект', on: { click: function () { sp.fx.push({ kind: sp.fx.some(function (f) { return f.kind === 'bits'; }) ? 'vibe' : 'bits', power: 1, grow: 5, glitch: '' }); changed(); render(); } } }));
    }
    draw();
    return box;
  }

  /* П25 (06, 140, 146): шпионаж текстом — программа «Перехват» (функция персонажа «Перехват (шпионаж)»). */
  function evSpy() {
    var g = P.game;
    if (!g.spy) SG.normSpy(g);
    var sp = g.spy;
    function nm(label, key, hint, after) {
      return fld(label, sp, key, { type: 'number', hint: hint, after: function () { sp[key] = Math.max(0, +sp[key] || 0); if (after) after(); } });
    }
    var spies = g.accounts.filter(function (a) { return a.modules.indexOf('spy') >= 0; });
    return [h('p', { class: 'lead', text: 'Шпион открывает программу (вкладка с названием ниже), выбирает, кого слушать, — и речь у телефона жертвы приходит ему текстом (свободное распознавание; фразы кодов подсвечены). При выходе из программы запись стирается. Нужна сеть. Программу персонажу дают в «Аккаунтах» → «Функции приложения» → «Перехват (шпионаж)» (можно скрытой и с главы); код прослушки каждого персонажа — там же, в карточке «Шпионаж».' }),
      h('div', { class: 'card spy-card' }, h('h3', { text: 'Программа шпиона' }),
        h('div', { class: 'hint', text: spies.length ? 'Программа есть у: ' + spies.map(function (a) { return a.name; }).join(', ') + '.' : 'Пока ни у одного персонажа нет функции «Перехват (шпионаж)».' }),
        h('div', { class: 'grid2' }, fld('Название вкладки', sp, 'name', { placeholder: 'ПЕРЕХВАТ' }),
          fld('Как выбирается, кого слушать', sp, 'mode', { options: SG.SPY_MODES, after: function () { render(); } })),
        sp.mode !== 'code' ? h('div', { class: 'f' }, h('label', { text: 'Кого можно слушать (ничего не отмечено — всех, кроме себя)' }), whoEditor(sp.list, '')) : null,
        sp.mode === 'fake' ? h('div', { class: 'hint', text: 'Подменный: кого на самом деле слышно — у каждого персонажа в карточке «Шпионаж» (пусто — случайный другой).' }) : null,
        h('div', { class: 'grid3' }, nm('Сеанс, минут (0 — без предела)', 'maxMin'), nm('Перегрев, минут', 'coolMin', 'Сколько программа недоступна после сеанса.'),
          nm('Блок после прерывания, минут', 'cutCoolMin', 'Жертва прервала прослушку — программа шпиона заблокирована.')),
        check('Показывать недоговорённое (серой строкой)', sp, 'partial'),
        h('div', { class: 'grid2' }, fld('Что слышит шпион', sp, 'sound', { options: [['text', 'текст (речь словами)'], ['sound', 'звук (8 кГц через центр)'], ['both', 'текст и звук']], after: function () { render(); } }),
          sp.sound !== 'text' ? nm('Задержка звука, с (1–60)', 'soundDelay', 'Звук жертвы доходит до шпиона через столько секунд. Ползунок во время шпионажа: вне коридора — в помехах.', function () { sp.soundDelay = Math.max(1, Math.min(60, sp.soundDelay || 1)); }) : h('div')),
        // П27: ползунок во время шпионажа (06, 151) — узкая полоса на всю высоту сбоку
        h('div', { class: 'grid2' }, check('Ползунок во время шпионажа (вне коридора — помехи)', sp, 'slider', function () { render(); }),
          sp.slider ? fld('Ползунок — с какой стороны', sp, 'sliderSide', { options: [['right', 'справа'], ['left', 'слева']] }) : h('div')),
        sp.slider ? h('div', { class: 'grid3' }, nm('Падает, % в секунду', 'sliderSpeed'), nm('Коридор, % высоты', 'sliderBand'),
          fld('Упал до нуля', sp, 'sliderZero', { options: [['cut', 'обрыв сеанса'], ['glitch', 'сбой у шпиона'], ['expose', 'жертва замечает']] })) : null,
        // П27 (06, 150, 157): сбои при долгом шпионаже
        check('Сбои при долгом сеансе (текст, звук и камера): помехи, потом обрыв', sp, 'fail', function () { render(); }),
        sp.fail ? h('div', { class: 'grid3' }, nm('Дольше, с', 'failA'), nm('шанс, %', 'failPA'), nm('Каждые, с', 'failEvery')) : null,
        sp.fail ? h('div', { class: 'grid3' }, nm('Дольше, с', 'failB'), nm('шанс, %', 'failPB'), nm('Помехи до обрыва, с', 'failNoise', 'Шпион видит «ПОМЕХИ», текст, звук и картинка — в шуме; потом «СИГНАЛ ПОТЕРЯН» (без блока).')) : null,
        h('div', { class: 'grid2' }, check('Камера жертвы: видео (её приложение на экране) или фото раз в 1 с (свёрнуто, экран погашен)', sp, 'video', function () { render(); }),
          sp.video ? fld('Какая камера', sp, 'videoCam', { options: [['front', 'передняя (лицо)'], ['back', 'задняя']] }) : h('div')),
        sp.video ? h('div', { class: 'hint', text: 'Android может не дать камеру в фоне — тогда шпион видит «камера цели недоступна», а снимки идут, когда жертва открывает приложение. Право «камера» телефоны спросят при загрузке пакета.' }) : null,
        h('div', { class: 'f' }, h('label', { text: 'Действия при перегреве (этому телефону)' }), actionsEditor(sp.heatActions, true))),
      h('div', { class: 'card' }, h('h3', { text: 'Жертва может заметить' }),
        spyFxEditor(g, sp),
        sp.fx.length ? h('div', { class: 'grid2' }, nm('С какой секунды сеанса', 'glitchFrom'), nm('Не больше, % (буквы и клавиатура)', 'glitchMax')) : null,
        h('div', { class: 'grid2' }, fld('Код «Проверка линии»', sp, 'checkCode', { hint: 'Ввести во вкладке «КОД» (или QR): окно покажет, идёт ли прослушка. Пусто — только из настроек.' }),
          check('«Проверка линии» в настройках игрока (код настроек)', sp, 'checkSettings')),
        h('div', { class: 'grid3' }, fld('Код прерывания', sp, 'breakCode', { hint: 'В окне проверки или во вкладке «КОД». Пусто — без кода.' }),
          nm('Встряхнуть, раз (0 — нельзя)', 'breakShakes'), nm('Промежуток между встряхиваниями, с', 'breakGap')))];
  }
  /* П25 (06, 141, 148): взлом — шкала «ловли волны» и программа «Взлом (чтение экрана)». */
  function evHack() {
    var g = P.game;
    if (!g.hack || !g.wave) SG.normHack(g);
    var x = g.hack, w = g.wave;
    function nm(obj, label, key, hint) { return fld(label, obj, key, { type: 'number', hint: hint, after: function () { obj[key] = Math.max(0, +obj[key] || 0); } }); }
    var hk = g.accounts.filter(function (a) { return a.modules.indexOf('hack') >= 0; });
    return [h('p', { class: 'lead', text: 'Взломщик ловит волну телефона на шкале (каналы раскладываются случайно при каждом взломе), и экран жертвы открывается у него на весь экран размытым — читается полоса в 2 строки, её двигают пальцем; времени сеанса взломщик не видит — следит за сбоями жертвы. У жертвы эта полоса сначала почти незаметна и проступает со временем, позже начинаются сбои (буквы ненадолго становятся 0 и 1); защита — встряхнуть или код / фраза. Программу дают в «Аккаунтах» → «Взлом (чтение экрана)». Та же шкала — режим «ловля волны» у шпионажа.' }),
      h('div', { class: 'card hack-card' }, h('h3', { text: 'Шкала: ловля волны' }),
        h('div', { class: 'grid3' }, nm(w, 'Каналов на шкале', 'channels'), nm(w, 'Из них настоящих', 'real', 'Телефоны (подпись — «частота» из карточки персонажа).'), nm(w, 'Волн-ловушек', 'trap', 'Остальные — помехи.')),
        h('div', { class: 'grid3' }, nm(w, 'Держать, чтобы поймать, с', 'holdSec', '0 — без поимки: кнопка «ПОДКЛЮЧИТЬ» на канале.'), nm(w, 'Ширина канала (из 100)', 'tol'),
          nm(w, 'Дольше на ловушке — сбой, с', 'trapSec')),
        fld('Сбой ловушки', w, 'trapGlitch', { options: [['', 'встряска экрана']].concat(g.glitches.map(function (q) { return [q.id, q.name]; })) }),
        check('Звук шкалы: шум, музыка, позывные персонажей', w, 'sound'),
        h('div', { class: 'hint', text: 'Музыка на шкале — mp3 из «Медиа» с отметкой «для шкалы» (сейчас: ' + (w.music.length ? w.music.join(', ') : 'нет') + '). Каждый файл — свой канал «FM …», поймать его нельзя.' })),
      h('div', { class: 'card' }, h('h3', { text: 'Программа взлома' }),
        h('div', { class: 'hint', text: hk.length ? 'Программа есть у: ' + hk.map(function (a) { return a.name; }).join(', ') + '.' : 'Пока ни у одного персонажа нет функции «Взлом (чтение экрана)».' }),
        h('div', { class: 'grid2' }, fld('Название вкладки', x, 'name', { placeholder: 'ВЗЛОМ' }), fld('Как выбирается цель', x, 'mode', { options: SG.SPY_MODES.filter(function (m) { return m[0] !== 'fake'; }), after: function () { render(); } })),
        x.mode !== 'code' ? h('div', { class: 'f' }, h('label', { text: 'Кого можно взломать (ничего не отмечено — всех, кроме себя)' }), whoEditor(x.list, '')) : null,
        h('div', { class: 'grid3' }, nm(x, 'Сеанс, минут (0 — без предела)', 'maxMin'), nm(x, 'Перегрев, минут', 'coolMin'), nm(x, 'Полоса, строк', 'strip')),
        check('У взломщика экран монохромный', x, 'spyMono'),
        h('div', { class: 'f' }, h('label', { text: 'Действия при подключении (этому телефону)' }), actionsEditor(x.okActions, true))),
      h('div', { class: 'card' }, h('h3', { text: 'Что видит жертва' }),
        h('div', { class: 'grid3' }, fld('Полоса у жертвы', x, 'look', { options: SG.HACK_LOOK }), nm(x, 'Сила полосы, %', 'power'), nm(x, 'Растёт, % в минуту', 'powerGrow')),
        h('div', { class: 'grid2' }, nm(x, 'Сбои начинаются: от, с', 'from'), nm(x, 'до, с (случайно между)', 'to')),
        check('Буквы → 0 и 1', x, 'bits'), h('div', { class: 'grid2' }, nm(x, '0/1: рост, % в минуту', 'bitsGrow'), nm(x, '0/1: не больше, %', 'bitsMax')),
        h('div', { class: 'grid2' }, nm(x, 'Буква — 0/1 от, с', 'bitsOnMin'), nm(x, 'до, с (потом возвращается, меняется другая)', 'bitsOnMax')),
        check('Клавиатура печатает не те буквы', x, 'typo')),
      h('div', { class: 'card' }, h('h3', { text: 'Защита и итог' }),
        h('div', { class: 'grid3' }, nm(x, 'Встряхнуть, раз (0 — нельзя)', 'shakes'), nm(x, 'Промежуток, с', 'gap'), fld('Код или фраза защиты', x, 'defendCode', { hint: 'Ввести во вкладке «КОД» или сказать (словами). Пусто — только встряхнуть.' })),
        h('div', { class: 'grid2' }, fld('Итог защиты', x, 'result', { options: SG.HACK_RESULT }), nm(x, 'Блок взломщика, минут', 'blockMin')),
        nm(x, 'Писк — у скольких телефонов (в руках)', 'beepN'))];
  }
  function evNet() {
    return h('div', { class: 'card' }, h('h3', { text: 'Как устроена сеть игры' }), h('div', { class: 'rich-ed', html: [
      '<p><b>Центр сети</b> — один телефон с приложением (лучше запасной на зарядке, можно телефон мастера). На нём: мастерский код → «Пульт мастера (сеть)» → «Запустить центр на этом телефоне». Появится QR «СЕТЬ».</p>',
      '<p><b>Wi-Fi</b>: все телефоны в одной сети — роутер квартиры или точка доступа телефона (до ~20 устройств). Интернет не нужен.</p>',
      '<p><b>Подключить телефон игрока</b>: на экране входа «СКАНЕР QR» → QR «СЕТЬ» (или вкладка «Сканер» уже в аккаунте). В шапке появится ● — связь есть.</p>',
      '<p><b>Без связи</b> коды и QR работают как раньше; сообщения уходят, когда связь вернётся. Не работают только коды с ограничениями (ответ «' + SG.esc(P.game.texts.offline) + '») и голосования.</p>',
      '<p><b>Терминал Twine</b> подключится к тому же центру, когда в движке появится сетевой модуль (протокол — docs/06_NETWORK.md в репозитории).</p>',
      '<p><b>Пульт мастера</b>: глава для всех, авария, уведомления, сбои, отсчёт, голосования, переписка, сброс центра. Мастерский телефон видит всю переписку.</p>'].join('') }));
  }
  function evNotices() {
    var g = P.game;
    return [h('p', { class: 'lead', text: 'Шаблоны уведомлений: мастер отправляет их с пульта, их шлют коды и правила; можно поставить на таймер от начала главы. Игрок не может их отключить. На телефоне — окно в приложении и уведомление в шторке Android.' }),
      twoCol({ key: 'notices', items: g.notices, label: function (n) { return n.name || n.title; }, small: function (n) { return n.chapter ? 'гл.' + n.chapter + ' +' + n.minutes + ' мин' : ''; },
        add: function () { var n = { id: SG.uid('n'), name: 'Уведомление', title: 'СООБЩЕНИЕ', text: '', to: [], chapter: 0, minutes: 0 }; g.notices.push(n); return n; },
        form: function (n, drawList) {
          return [moveDel(g.notices, n, null), h('div', { class: 'card' },
            fld('Название (для мастера)', n, 'name', { after: drawList }), fld('Заголовок', n, 'title'), fld('Текст', n, 'text', { area: true, rows: 4 }),
            h('div', { class: 'f' }, h('label', { text: 'Кому (для таймера; с пульта — выбирает мастер)' }), whoEditor(n.to, '')),
            h('div', { class: 'grid2' },
              fld('Автоматически в главе', n, 'chapter', { options: [[0, 'нет, только вручную']].concat(chapterOptions()), after: function () { n.chapter = +n.chapter; drawList(); } }),
              fld('Через минут от начала главы', n, 'minutes', { type: 'number', after: function () { n.minutes = Math.max(0, +n.minutes || 0); drawList(); } })),
            h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Таймер ведёт центр сети: он считает от момента, когда глава пришла на центр (кнопкой мастера).' })),
            evMediaCard(n, drawList)];
        } })];
  }
  function evAlarms() {
    var g = P.game;
    return [h('p', { class: 'lead', text: 'Аварийные режимы: красное оформление, окно на весь экран, сирена (громче беззвучного режима — через будильник), вибрация, мигающий фонарик, помехи в связи. Включаются с пульта, кодом/QR или правилом (событие терминала); выключаются с пульта или кодом.' }),
      twoCol({ key: 'alarms', items: g.alarms, label: function (a) { return a.name; },
        add: function () { var a = { id: SG.uid('r'), name: 'Разгерметизация', title: 'РАЗГЕРМЕТИЗАЦИЯ', text: 'Всем в отсек 3.', red: true, full: true, siren: true, vibrate: true, torch: true, jam: true }; g.alarms.push(a); return a; },
        form: function (a, drawList) {
          return [moveDel(g.alarms, a, null), h('div', { class: 'card' },
            fld('Название (для мастера)', a, 'name', { after: drawList }), fld('Заголовок на экране', a, 'title'), fld('Текст', a, 'text', { area: true, rows: 3 }),
            h('div', { class: 'grid3' }, check('Красное оформление', a, 'red'), check('Окно на весь экран', a, 'full'), check('Сирена', a, 'siren'),
              check('Вибрация', a, 'vibrate'), check('Фонарик мигает', a, 'torch'), check('Помехи в связи', a, 'jam')),
            h('div', { class: 'inline' },
              h('button', { text: '+ Код включения', on: { click: function () { var c = newCode(''); c.note = 'авария: ' + a.name; c.actions.push({ type: 'alarm', alarm: a.id, on: true }); ui.sel.codes = c.id; ui.tab = 'codes'; changed(); render(); } } }),
              h('button', { text: '+ Код выключения', on: { click: function () { var c = newCode(''); c.note = 'конец аварии'; c.actions.push({ type: 'alarm', on: false }); ui.sel.codes = c.id; ui.tab = 'codes'; changed(); render(); } } })))];
        } })];
  }
  var FXN = [['noise', 'шум, полосы'], ['shift', 'сдвиг и цветовой сбой'], ['blur', 'размытие'], ['shake', 'дрожь экрана'], ['tunnel', 'туннельное зрение'],
    ['dark', 'темнота'], ['bright', 'засветка'], ['tint', 'красный оттенок'], ['invert', 'негатив'], ['scramble', 'пляшущие буквы'], ['jam', 'помехи в связи'],
    ['bits', 'буквы → 0 и 1 (весь интерфейс)'], ['bitschat', 'буквы → 0 и 1 (только чаты)'], ['typo', 'клавиатура печатает не те буквы']];   // П25 (06, 141)
  function evGlitches() {
    var g = P.game;
    return [h('p', { class: 'lead', text: 'Сбои системы и состояния персонажа (стимулятор, алкоголь, ранение) меняют интерфейс телефона. Запускаются с пульта, кодом, правилом или случайно в выбранных главах. Проходят сами через заданное время; тяжёлые — встряхнуть телефон или ввести код ремонта (действие «Убрать сбой»).' }),
      twoCol({ key: 'glitches', items: g.glitches, label: function (x) { return (x.state ? '◆ ' : '⚠ ') + x.name; }, small: function (x) { return x.every ? 'случайно' : ''; },
        add: function () { var x = { id: SG.uid('g'), name: 'Сбой экрана', kind: 'visual', fx: ['noise', 'shift'], text: '', seconds: 20, fix: 'time', state: false, chapters: [], every: 0, who: [] }; g.glitches.push(x); return x; },
        form: function (x, drawList) {
          var fx = h('div', { class: 'checks' }, FXN.map(function (f) {
            var c = h('input', { type: 'checkbox', checked: x.fx.indexOf(f[0]) >= 0 });
            c.addEventListener('change', function () { var i = x.fx.indexOf(f[0]); if (c.checked && i < 0) x.fx.push(f[0]); if (!c.checked && i >= 0) x.fx.splice(i, 1); changed(); });
            return h('label', {}, c, f[1]);
          }));
          var chs = h('div', { class: 'checks' }, P.game.chapters.map(function (c, i) {
            var cb = h('input', { type: 'checkbox', checked: x.chapters.indexOf(i + 1) >= 0 });
            cb.addEventListener('change', function () { var k = x.chapters.indexOf(i + 1); if (cb.checked && k < 0) x.chapters.push(i + 1); if (!cb.checked && k >= 0) x.chapters.splice(k, 1); changed(); });
            return h('label', {}, cb, c.name);
          }));
          return [moveDel(g.glitches, x, null), h('div', { class: 'card' },
            h('div', { class: 'grid2' }, fld('Название (видно игроку на полосе сверху)', x, 'name', { after: drawList }),
              fld('Что это', x, 'state', { options: [['false', 'сбой системы'], ['true', 'состояние персонажа']], after: function () { x.state = x.state === 'true'; drawList(); } })),
            fld('Вид', x, 'kind', { options: [['visual', 'искажение экрана'], ['scanner', '«сканер не отвечает» (камера не читает QR)'], ['fake', 'ложное уведомление']], after: render }),
            x.kind === 'visual' ? h('div', { class: 'f' }, h('label', { text: 'Эффекты' }), fx) : null,
            x.kind === 'visual' ? h('div', { class: 'grid3 grow-row' }, fld('0/1 и «не те буквы»: в начале, %', x, 'start', { type: 'number', after: function () { x.start = Math.max(0, Math.min(100, +x.start || 0)); } }),
              fld('Растёт, % в минуту', x, 'grow', { type: 'number', after: function () { x.grow = Math.max(0, +x.grow || 0); } }),
              fld('Не больше, %', x, 'max', { type: 'number', after: function () { x.max = Math.max(0, Math.min(100, +x.max || 0)); }, hint: 'Только для эффектов «0 и 1» и «не те буквы» (П25).' })) : null,
            fld(x.kind === 'fake' ? 'Текст ложного уведомления' : 'Сообщение при начале (необязательно)', x, 'text', { area: true, rows: 2 }),
            x.kind !== 'fake' ? h('div', { class: 'grid2' },
              fld('Длится, секунд', x, 'seconds', { type: 'number', after: function () { x.seconds = Math.max(0, parseInt(x.seconds, 10) || 0); }, hint: '0 — пока не снимут.' }),
              fld('Как проходит', x, 'fix', { options: [['time', 'сам, по времени'], ['shake', 'встряхнуть телефон (или время)'], ['code', 'код ремонта (или время)']] })) : null),
            h('div', { class: 'card' }, h('h3', { text: 'Случайно в игре' }),
              fld('Примерно раз в … минут', x, 'every', { type: 'number', after: function () { x.every = Math.max(0, parseInt(x.every, 10) || 0); drawList(); }, hint: '0 — только с пульта, кодом или правилом.' }),
              h('div', { class: 'f' }, h('label', { text: 'В главах (ничего не отмечено — во всех)' }), chs),
              h('div', { class: 'f' }, h('label', { text: 'У кого' }), whoEditor(x.who, ''))),
            h('div', { class: 'inline' },
              h('button', { text: '+ Код, запускающий это', on: { click: function () { var c = newCode(''); c.note = x.name; c.actions.push({ type: 'glitch', glitch: x.id, to: 'self' }); ui.sel.codes = c.id; ui.tab = 'codes'; changed(); render(); } } }),
              h('button', { text: '+ Код ремонта', on: { click: function () { var c = newCode(''); c.note = 'ремонт: ' + x.name; c.actions.push({ type: 'fix', glitch: x.id }); ui.sel.codes = c.id; ui.tab = 'codes'; changed(); render(); } } }))];
        } })];
  }
  function evRules() {
    var g = P.game;
    if (!(+g.handsThr > 0)) g.handsThr = 0.08;   // П26: новый проект — порог по умолчанию виден в поле
    return [h('p', { class: 'lead', text: 'Правила выполняет центр сети, даже если телефон мастера в кармане: событие терминала («в терминале X») → действия; начало главы + N минут → действия; каждые N минут → действия; общая переменная стала, например, ≥ 8 → действия. Мастер может выключить автоматику на пульте. В Twine СИГНАЛЫ правила — в окне «События».' }),
      h('div', { class: 'card hands-thr' }, h('h3', { text: 'Датчик «в руках»' }), fld('Порог «в руках», м/с²', g, 'handsThr', { type: 'number', after: function () { g.handsThr = +g.handsThr > 0 ? Math.min(2, +g.handsThr) : 0.08; },
        hint: 'Дрожание между замерами датчика, выше которого телефон считается «в руках» (правило «взяли в руки», адресат «тем, у кого в руках», писк взлома). Обычно 0,08. Подобрать — пульт мастера → «ТЕЛЕФОНЫ» → «В руках — настройка датчика».' })),
      twoCol({ key: 'rules', items: g.rules, label: function (r) { return r.name || r.event || '(правило)'; },
        small: function (r) { return r.on === 'event' ? 'событие' : r.on === 'chapter' ? 'гл.' + r.chapter + ' +' + r.minutes : r.on === 'var' ? '$' + r.var + ' ' + r.op + ' ' + r.value : r.on === 'limit' ? '$' + r.var + ' — предел' : r.on === 'phone' ? '📱 ' + (SG.PHONE_SENSORS.filter(function (x) { return x[0] === r.sensor; })[0] || ['', '?'])[1].replace(/ \(.*$/, '') : 'каждые ' + r.minutes; },
        add: function () { var r = { id: SG.uid('e'), name: 'Правило', on: 'event', event: '', chapter: 1, minutes: 0, chapters: [], actions: [] }; g.rules.push(r); return r; },
        form: function (r, drawList) {
          var chs = h('div', { class: 'checks' }, P.game.chapters.map(function (c, i) {
            var cb = h('input', { type: 'checkbox', checked: r.chapters.indexOf(i + 1) >= 0 });
            cb.addEventListener('change', function () { var k = r.chapters.indexOf(i + 1); if (cb.checked && k < 0) r.chapters.push(i + 1); if (!cb.checked && k >= 0) r.chapters.splice(k, 1); changed(); });
            return h('label', {}, cb, c.name);
          }));
          return [moveDel(g.rules, r, null), h('div', { class: 'card' },
            fld('Название (для мастера)', r, 'name', { after: drawList }),
            fld('Когда', r, 'on', { options: [['event', 'событие (терминал или код)'], ['chapter', 'через N минут от начала главы'], ['every', 'каждые N минут'], ['var', 'общая переменная (когда условие станет верным)'], ['limit', 'общая переменная упёрлась в предел'], ['phone', 'на самом телефоне: встряхнули, перевернули, экран… (выполняет телефон)']], after: function () { if (r.on === 'limit') { r.side = r.side || 'max'; r.var = r.var || (g.shared[0] ? g.shared[0].name : ''); } if (r.on === 'phone') { r.sensor = r.sensor || 'shake'; r.seconds = r.seconds || 0; r.every = r.every || 0; r.who = r.who || []; } drawList(); render(); } }),
            // П16 (основа 2): событие телефона — выполняет сам телефон (тому, «кто ввёл» — этому телефону)
            r.on === 'phone' ? h('div', {},
              h('div', { class: 'grid3' },
                fld('Что случилось', r, 'sensor', { options: SG.PHONE_SENSORS, after: function () { drawList(); render(); } }),
                fld('Дольше, с', r, 'seconds', { type: 'number', after: function () { r.seconds = Math.max(0, +r.seconds || 0); }, hint: 'Для «экраном вниз», «заблокирован», «не блокировали»: 0 — сразу.' }),
                fld('Не чаще, чем раз в, с', r, 'every', { type: 'number', after: function () { r.every = Math.max(0, +r.every || 0); }, hint: '0 — каждый раз.' })),
              h('div', { class: 'f' }, h('label', { text: 'На чьих телефонах' }), whoEditor(r.who = r.who || [], 'Пусто — у всех.')),
              fld('Когда работает', r, 'screen', { options: SG.PHONE_SCREEN, hint: 'П17: правило срабатывает и когда приложение свёрнуто или экран погашен (следит служба Android). Можно ограничить: только при включённом экране или только при выключенном (в кармане).' }),
              h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Выполняет сам телефон — и в фоне (служба Android; снимок и QR — пока приложение открыто). «Не в приложении» — экран горит и разблокирован, но игрок свернул приложение или смотрит другое. Действия «тому, кто ввёл код» — этому телефону; «всем» и «выбранным» — через центр. «Выйти на общий экран» — действие «Событие»: его получает терминал.' })) : null,
            r.on === 'limit' ? h('div', { class: 'grid3' },
              fld('Переменная', r, 'var', { options: [['', '—']].concat(g.shared.map(function (v) { return [v.name, (v.label || v.name) + ' ($' + v.name + ')']; })), after: drawList }),
              fld('Предел', r, 'side', { options: [['max', 'наибольший (попытка прибавить сверх)'], ['min', 'наименьший'], ['any', 'любой']], after: drawList }),
              h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Предел задаётся в «Общее» → «Общие переменные». Срабатывает каждый раз, когда кто-то пытается выйти за него (значение остаётся на пределе).' })) : null,
            r.on === 'var' ? h('div', { class: 'grid3' },
              fld('Переменная', r, 'var', { options: [['', '—']].concat(g.shared.map(function (v) { return [v.name, (v.label || v.name) + ' ($' + v.name + ')']; })), after: drawList }),
              fld('Условие', r, 'op', { options: [['=', '='], ['!=', '≠'], ['>', '>'], ['>=', '≥'], ['<', '<'], ['<=', '≤']], after: drawList }),
              fld('Значение', r, 'value', { after: drawList })) : null,
            r.on === 'event' ? fld('Название события', r, 'event', { placeholder: 'например: reactor_breach', after: drawList, hint: 'Терминал (после доработки движка) или код с действием «Событие» присылают это название.' }) : null,
            r.on === 'chapter' ? fld('Глава', r, 'chapter', { options: chapterOptions(), number: true, after: drawList }) : null,
            r.on === 'chapter' || r.on === 'every' ? fld('Минут', r, 'minutes', { type: 'number', after: function () { r.minutes = Math.max(0, +r.minutes || 0); drawList(); } }) : null,
            r.on !== 'chapter' ? h('div', { class: 'f' }, h('label', { text: 'Только в главах (ничего не отмечено — во всех)' }), chs) : null),
            h('div', { class: 'card' }, h('h3', { text: 'Действия' }), actionsEditor(r.actions, r.on === 'phone'))];   // П16: на телефоне — «этому телефону»
        } })];
  }
  function evVotes() {
    var g = P.game;
    return [h('p', { class: 'lead', text: 'Голосования (например, раз в полчаса — за музыку на терминале из открытых альбомов). Игроки голосуют с телефонов по сети; итог видят все голосовавшие, мастер и терминал. Варианты задаются здесь или на пульте; когда у терминала будет сеть, он сможет прислать список открытых альбомов сам.' }),
      twoCol({ key: 'votes', items: g.votes, label: function (v) { return v.name; }, small: function (v) { return v.every ? 'каждые ' + v.every + ' мин' : 'вручную'; },
        add: function () { var v = { id: SG.uid('v'), name: 'Музыка на терминале', title: 'КАКУЮ МУЗЫКУ ВКЛЮЧИТЬ?', options: ['Альбом 1', 'Альбом 2'], seconds: 120, to: [], every: 0, chapters: [], term: 'vote_music' }; g.votes.push(v); return v; },
        form: function (v, drawList) {
          var chs = h('div', { class: 'checks' }, P.game.chapters.map(function (c, i) {
            var cb = h('input', { type: 'checkbox', checked: v.chapters.indexOf(i + 1) >= 0 });
            cb.addEventListener('change', function () { var k = v.chapters.indexOf(i + 1); if (cb.checked && k < 0) v.chapters.push(i + 1); if (!cb.checked && k >= 0) v.chapters.splice(k, 1); changed(); });
            return h('label', {}, cb, c.name);
          }));
          return [moveDel(g.votes, v, null), h('div', { class: 'card' },
            fld('Название (для мастера)', v, 'name', { after: drawList }), fld('Вопрос игрокам', v, 'title'),
            h('div', { class: 'f' }, h('label', { text: 'Варианты' }), textList(v.options, function (i) { return 'Вариант ' + (i + 1); })),
            h('div', { class: 'grid2' },
              fld('Сколько секунд идёт', v, 'seconds', { type: 'number', after: function () { v.seconds = Math.max(15, parseInt(v.seconds, 10) || 120); } }),
              fld('Повторять каждые … минут', v, 'every', { type: 'number', after: function () { v.every = Math.max(0, parseInt(v.every, 10) || 0); drawList(); }, hint: '0 — только с пульта или кодом.' })),
            v.every ? h('div', { class: 'f' }, h('label', { text: 'Повторять только в главах (ничего не отмечено — во всех)' }), chs) : null,
            fld('Переменная терминала для итога', v, 'term', { hint: 'Терминал получит итог (сетевой модуль движка).' }),
            h('div', { class: 'f' }, h('label', { text: 'Кто голосует' }), whoEditor(v.to, '')))];
        } })];
  }

  function usage(name) {
    var where = [];
    P.game.accounts.forEach(function (a) { if (a.items.some(function (i) { return i.file === name; })) where.push('профиль ' + a.name); });
    P.game.blocks.forEach(function (b) { if (b.items.some(function (i) { return i.file === name; })) where.push(b.title); });
    if (P.game.wave && P.game.wave.music.indexOf(name) >= 0) where.push('шкала');
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
          k === 'audio' ? (function () {   // П26 (06, 153): mp3 на шкале ловли волны
            var w = P.game.wave || (SG.normHack(P.game), P.game.wave), cb = h('input', { type: 'checkbox', class: 'for-scale', checked: w.music.indexOf(n) >= 0 });
            cb.addEventListener('change', function () { var i = w.music.indexOf(n); if (cb.checked && i < 0) w.music.push(n); if (!cb.checked && i >= 0) w.music.splice(i, 1); changed(); render(); });
            return h('label', { class: 'sm', style: 'white-space:nowrap', title: 'музыка на шкале «ловля волны»' }, cb, ' для шкалы');
          })() : h('span'),
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
  var KIND = { master: 'мастер', settings: 'настройки', login: 'вход', chapter: 'глава', code: 'код', spy: 'шпионаж' };
  function whereName(v) { var w = WHERE.filter(function (x) { return x[0] === (v || ''); })[0]; return w ? w[1] : v; }
  function opensText(c) {
    return c.opens.map(function (id) { var b = SG.byId(P.game.blocks, id); return b ? b.title || '?' : '?'; }).join(', ');
  }
  /* Вкладка «Голос» (П-58): общие настройки, кто слушает, все фразы. */
  function pVoice() {
    var g = P.game;
    var V = g.voice || (g.voice = SG.clone(SG.DEFAULT_VOICE));
    var list = g.codes.filter(function (c) { return c.voice; });
    function actText(c) {
      return c.actions.map(function (a) {
        var to = a.to === 'self' || a.to == null ? '' : Array.isArray(a.to) && a.to.length ? ' → ' + whoShort(a.to) : ' → всем';
        var what = a.type === 'glitch' || a.type === 'fix' ? ((SG.byId(g.glitches, a.glitch) || {}).name || (a.type === 'fix' ? 'все' : '?')) : a.type === 'game' ? ((SG.byId(g.games || [], a.game) || {}).name || '?') : '';
        return (SG.ACTIONS[a.type] || a.type) + (what ? ' «' + what + '»' : '') + to;
      }).join('; ') || (c.answer || c.opens.length ? 'ответ / блоки' : '—');
    }
    function num(obj, key, after) {
      var inp = h('input', { type: 'number', min: 0, value: obj[key] || 0, style: 'width:70px' });
      inp.addEventListener('input', function () { obj[key] = Math.max(0, parseInt(inp.value, 10) || 0); changed(); if (after) after(); });
      return inp;
    }
    function txt(obj, key, ph) {
      var inp = h('input', { type: 'text', value: obj[key] || '', placeholder: ph || '' });
      inp.addEventListener('input', function () { obj[key] = inp.value; changed(); });
      return inp;
    }
    var conf = h('select', {}, [[0.4, '0,4 — ловит больше, чаще ошибается'], [0.5, '0,5'], [0.6, '0,6 — обычно'], [0.7, '0,7'], [0.8, '0,8 — только чёткая речь']].map(function (o) {
      return h('option', { value: o[0], text: o[1], selected: Math.abs(V.minConf - o[0]) < 0.01 });
    }));
    conf.addEventListener('change', function () { V.minConf = +conf.value; changed(); });
    var sens = h('select', {}, [[0, 'низкая — шумное помещение'], [1, 'обычная'], [2, 'высокая — тихая речь']].map(function (o) {
      return h('option', { value: o[0], text: o[1], selected: (V.sens == null ? 1 : V.sens) === o[0] });
    }));
    sens.addEventListener('change', function () { V.sens = +sens.value; changed(); });
    var accRows = g.accounts.map(function (a) {
      var sl = h('select', {}, SG.VOICE_MODES.map(function (o) { return h('option', { value: o[0], text: o[1], selected: (a.voiceMode || 'off') === o[0] }); }));
      sl.addEventListener('change', function () { setVoiceMode(a, sl.value); changed(); render(); });
      var ch = h('select', {}, chapterOptions().map(function (o) { return h('option', { value: o[0], text: 'с гл. ' + o[0], selected: (a.modChapter.voice || 1) === o[0] }); }));
      ch.addEventListener('change', function () { a.modChapter.voice = +ch.value; changed(); });
      var n = g.codes.filter(function (c) { return c.voice && !c.app && (c.term || SG.allowed(c.who, a.id)); }).length;
      return h('tr', {}, h('td', {}, h('b', { text: a.name || '?' })), h('td', {}, sl), h('td', {}, a.voiceMode && a.voiceMode !== 'off' ? ch : ''),
        h('td', { class: 'sm', text: 'фраз: ' + n }));
    });
    var rows = list.map(function (c) {
      return h('tr', { 'data-id': c.id },
        h('td', {}, txt(c, 'voice', 'фраза')),
        h('td', {}, txt(c, 'code', 'только голосом')),
        h('td', { class: 'sm', text: c.who.length ? whoShort(c.who) : 'все' }),
        h('td', { class: 'sm', text: String(c.chapter) }),
        h('td', {}, num(c, 'voiceMax')),
        h('td', {}, num(c, 'voiceEvery')),
        h('td', { style: 'text-align:center' }, (function () { var b = h('input', { type: 'checkbox', checked: !!c.voiceScreen, title: 'только при включённом экране в приложении' }); b.addEventListener('change', function () { c.voiceScreen = b.checked; changed(); }); return b; })()),
        h('td', { class: 'sm op', text: actText(c), title: actText(c) }),
        h('td', { class: 'sm warn', text: SG.voiceWordHints(g, c.voice).map(function (x) { return '«' + x.word + '»: ' + x.why; }).join('; '), style: 'color:#fc6' }),
        h('td', {}, txt(c, 'comment', 'комментарий')),
        h('td', {}, h('button', { class: 'small', text: '→', title: 'Открыть код полностью', on: { click: function () { ui.sel.codes = c.id; ui.tab = 'codes'; render(); } } })));
    });
    return [h('h1', { text: 'Голос' }),
      h('p', { class: 'lead', text: 'Офлайн-распознавание речи на телефоне (Vosk, малая русская модель, внутри APK). Телефон узнаёт только фразы из этого списка и цифры — всё прочее для него «непонятно». Фраза — это код: у неё те же «кому», «с главы», ответ и действия (вкладка «Коды»).' }),
      h('div', { class: 'card' }, h('h3', { text: 'Общие настройки' }),
        h('div', { class: 'grid2' },
          h('div', { class: 'f' }, h('label', { text: 'Уверенность распознавания' }), conf, h('div', { class: 'hint', text: 'Ниже — фраза срабатывает и при невнятной речи, но чаще «слышится» в разговоре. Видно в режиме мастера на телефоне: «Голос: проверка».' })),
          h('div', { class: 'f' }, h('label', { text: 'Детектор голоса (в фоне)' }), sens, h('div', { class: 'hint', text: 'Распознаватель включается, только когда громкость выше шума. Экономит батарею.' }))),
        check('Цифры голосом: «один два три четыре» — как набранный код (по кнопке — любой код; в фоне — только существующий, неверные молча пропускаются)', V, 'digits'),
        fld('Комментарий', V, 'comment', { placeholder: 'для себя' })),
      h('div', { class: 'card' }, h('h3', { text: 'Кто слушает' }),
        g.accounts.length ? h('table', { class: 'mods' }, h('tbody', {}, accRows)) : h('div', { class: 'hint', text: 'Аккаунтов пока нет.' }),
        g.accounts.length ? h('button', { class: 'small', id: 'voice-all-bg', text: 'Всем — «всегда в фоне»', style: 'margin-top:6px', on: { click: function () { g.accounts.forEach(function (a) { setVoiceMode(a, 'always'); }); changed(); render(); } } }) : null,
        h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-top:6px', text: 'По умолчанию все телефоны слушают в фоне — и при включённом, и при погашенном экране; все фразы срабатывают в фоне. Фразе, которая должна срабатывать только в приложении, поставьте «Только при экране» (колонка в таблице фраз или карточка кода).' }),
        h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-top:6px', text: 'выкл — микрофон не слушает (функцию можно включить кодом: действие «Функция приложения» → «Голос»); по кнопке — 🎙 в шапке; при разблокированном экране — в фоне, пока экран включён и разблокирован; всегда в фоне — и с погашенным экраном (значок в шторке).' })),
      h('div', { class: 'card' }, h('h3', { text: 'Фразы (' + list.length + ')' }),
        list.length ? h('table', { class: 'codes voice-table' },
          h('thead', {}, h('tr', {}, ['Фраза', 'Код (напечатать)', 'Кому', 'Гл.', 'Телефонов', 'Пауза, с', 'Только при экране', 'Действия', 'Слова', 'Комментарий', ''].map(function (t) { return h('th', { text: t }); }))),
          h('tbody', {}, rows)) : h('div', { class: 'hint', text: 'Фраз пока нет.' }),
        h('div', { class: 'inline', style: 'margin-top:8px' },
          h('button', { text: '+ Голосовая фраза', on: { click: function () { var c = newCode(''); c.code = ''; c.voice = 'новая фраза'; ui.sel.codes = c.id; ui.tab = 'codes'; changed(); render(); } } })),
        h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-top:6px', text: 'Телефонов: 0 — срабатывает у всех, кто расслышал; 1 (2…) — у первых, кто спросил центр (соседние телефоны тоже слышат фразу). Пауза — сколько секунд фраза молчит после срабатывания. Длинная фраза важнее короткой: «слава лидеру всем» не сработает как «слава лидеру».' })),
      h('div', { class: 'card' }, h('h3', { text: 'Проверка слов' }),
        fld('Слова, которых модель не знает', V, 'unknown', { area: true, rows: 2,
          placeholder: 'например: стлрт императив',
          hint: 'Перепишите сюда строку «Модель не знает» из окна «Голос: проверка» на телефоне (режим мастера). Такие слова Vosk молча выбрасывает, и фраза не срабатывает. В таблице фраз (колонка «Слова») и в карточке кода появится подсказка, что заменить.' }),
        h('button', { class: 'small', text: 'Обновить подсказки', on: { click: function () { render(); } } })),
      h('div', { class: 'card' }, h('h3', { text: 'Батарея: как замерить' }),
        h('div', { class: 'hint', style: 'white-space:pre-line', text:
          '1. Зарядите телефон до 100 %, закройте другие приложения, яркость — как на игре.\n' +
          '2. Режим мастера на телефоне → «Голос: проверка и замер» → «Начать замер». Телефон раз в 5 минут записывает заряд, режим, экран, сколько минут слушал и сколько распознавал.\n' +
          '3. Проведите 2 часа в одном режиме (выкл, по кнопке, при разблокированном экране, всегда в фоне) — экран так, как будет на игре. Затем — следующий режим.\n' +
          '4. В окне замера — расход «% в час» по каждому режиму. Сравните с «выкл»: разница — цена голоса. Ещё: Настройки Android → Батарея → Использование по приложениям.' }))];
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
        tr.classList.toggle('nocode', !c && tr.dataset.kind !== 'chapter' && !tr.dataset.voice);
      });
    }
    function sortKey(r) {
      if (T.sort === 'code') return SG.norm(r.code);
      if (T.sort === 'kind') return ['master', 'settings', 'login', 'chapter', 'code'].indexOf(r.kind);
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
        var text = [r.code, r.label, r.comment ? o[r.comment] : '', r.kind === 'code' ? opensText(o) + ' ' + whoShort(o.who) + ' ' + (o.voice || '') : ''].join(' ').toLowerCase();
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
        o[r.codeKey] = randomCode(r.kind === 'master' ? 8 : r.kind === 'login' ? 6 : r.kind === 'chapter' ? 5 : 4);
        code.value = o[r.codeKey]; r.code = code.value; changed(); mark();
      } } });
      var label;
      if (r.kind === 'code') {
        label = cellInput(o, 'note', 'note', 'заметка для мастера', function (v) { r.label = v; });
        if (r.app) label = h('div', {}, label, h('span', { class: 'tag g', text: r.group }));
        if (o.voice) label = h('div', {}, label, h('span', { class: 'tag', text: '🎙 ' + o.voice, title: 'фраза голосом' }));
      } else label = h('span', { class: 'lbl', text: r.label });
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
      var go = { master: 'general', settings: 'general', login: 'accounts', chapter: 'chapters', code: 'codes' }[r.kind];
      var tr = h('tr', { 'data-kind': r.kind, 'data-key': r.key, 'data-voice': r.kind === 'code' && o.voice ? '1' : '' },
        h('td', { class: 'k', text: KIND[r.kind] }),
        h('td', { class: 'cc' }, h('div', { class: 'inline' }, code, gen)),
        h('td', {}, label),
        h('td', { class: 'sm', text: who, title: who }),
        h('td', { class: 'sm op', text: opens, title: opens }),
        h('td', {}, chap),
        h('td', {}, where),
        h('td', {}, cellInput(o, r.comment, 'cm', 'комментарий')),
        h('td', {}, h('button', { class: 'small', text: '→', title: 'Открыть полностью', on: { click: function () {
          if (r.kind !== 'master' && r.kind !== 'settings') ui.sel[go] = o.id;
          ui.tab = go; render();
        } } })));
      return tr;
    }
    var search = h('input', { type: 'search', placeholder: 'Поиск: код, заметка, комментарий, блок, персонаж…', value: T.q, style: 'flex:1' });
    search.addEventListener('input', function () { T.q = search.value; draw(); });
    var kind = h('select', {}, [['', 'все типы'], ['code', 'коды игры'], ['login', 'входы'], ['chapter', 'главы'], ['master', 'мастер'], ['settings', 'настройки']].map(function (k) {
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
        h('button', { text: 'Сохранить таблицу (CSV для Excel)…', on: { click: saveCsv } }),
        h('button', { text: 'Печать (A4, по главам)…', on: { click: printTable } })),
      h('div', { style: 'margin-bottom:6px' }, count),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'codes' },
        h('thead', {}, h('tr', {}, th('Тип', 'kind'), th('Код', 'code'), th('Заметка / что это', 'label'), h('th', { text: 'Кому' }),
          h('th', { text: 'Открывает' }), th('Гл.', 'chapter'), th('Где вводится', 'where'), h('th', { text: 'Комментарий' }), h('th'))),
        body))];
  }
  /* Справочник мастера для печати: коды по главам (К3). */
  function printTable() {
    var g = P.game;
    var rows = SG.allCodes(g).filter(function (r) { return SG.norm(r.code); });
    var byCh = {};
    rows.forEach(function (r) { var c = r.kind === 'code' || r.kind === 'chapter' ? r.chapter || 1 : 0; (byCh[c] = byCh[c] || []).push(r); });
    var html = ['<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Коды — ' + SG.esc(g.title) + '</title><style>',
      'body{font:11pt Arial,sans-serif;margin:12mm}h1{font-size:16pt;margin:0 0 4mm}h2{font-size:13pt;margin:6mm 0 2mm;border-bottom:1px solid #000}',
      'table{width:100%;border-collapse:collapse}td,th{border:1px solid #888;padding:3px 5px;vertical-align:top;text-align:left}th{background:#eee}',
      'td.c{font:bold 12pt Consolas,monospace;white-space:nowrap}tr{page-break-inside:avoid}@page{size:A4;margin:10mm}</style></head><body>',
      '<h1>' + SG.esc(g.title) + ' — коды (пакет v' + SG.esc(String(g.version)) + ')</h1>'];
    Object.keys(byCh).sort(function (a, b) { return a - b; }).forEach(function (c) {
      html.push('<h2>' + (c === '0' ? 'Мастер и входы' : SG.esc(g.chapters[c - 1] ? g.chapters[c - 1].name : 'Глава ' + c)) + '</h2>');
      html.push('<table><tr><th>Код</th><th>Тип</th><th>Что это</th><th>Кому</th><th>Открывает / ответ</th><th>Где</th><th>Комментарий</th></tr>');
      byCh[c].forEach(function (r) {
        var o = r.obj;
        html.push('<tr><td class="c">' + SG.esc(r.code) + '</td><td>' + KIND[r.kind] + (r.app ? '<br>' + SG.esc(r.group) : '') + '</td><td>' + SG.esc(r.kind === 'code' ? o.note : r.label) +
          '</td><td>' + SG.esc(r.kind === 'code' ? (o.who.length ? whoShort(o.who) : 'все') : r.kind === 'login' ? o.profession : '') +
          '</td><td>' + SG.esc(r.kind === 'code' ? [opensText(o), o.answer].filter(Boolean).join(' · ') : '') +
          '</td><td>' + SG.esc(r.where ? whereName(o[r.where]) : 'карточка мастера') + '</td><td>' + SG.esc(o[r.comment] || '') + '</td></tr>');
      });
      html.push('</table>');
    });
    html.push('<script>window.onload=function(){window.print()}<\/script></body></html>');
    var w = window.open('', '_blank');
    if (!w) { alert('Браузер не дал открыть окно печати. Разрешите всплывающие окна для этого файла.'); return; }
    w.document.write(html.join(''));
    w.document.close();
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
      lines.push([KIND[r.kind], r.code, r.kind === 'code' ? (r.app ? '[' + r.group + '] ' : '') + o.note : r.label,
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

  /* ---------- SSTV: картинка → звук ---------- */
  function loadImage(blob) {
    return new Promise(function (ok, fail) {
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { fail(new Error('картинка не читается')); };
      im.src = URL.createObjectURL(blob);
    });
  }
  function pSstv() {
    var S = window.SGSSTV;
    var V = ui.sstv = ui.sstv || { file: '', mode: 'Robot 36', rate: 22050, fit: 'cover', result: null, label: '', code: '', codeRes: null };
    var imgs = Object.keys(P.files).sort().filter(function (n) { return kindOf(n) === 'image'; });
    var out = h('div', { class: 'sstv-out' });
    var srcCanvas = h('canvas', { class: 'sstv-cv', width: 320, height: 240 });
    var info = h('div', { class: 'hint', style: 'color:var(--dim);font-size:12px' });
    function md() { return S.mode(V.mode); }
    function drawSource() {
      var m = md();
      srcCanvas.width = m.width; srcCanvas.height = m.height;
      var x = srcCanvas.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, m.width, m.height);
      info.textContent = m.name + ': ' + m.width + '×' + m.height + ', звук ' + Math.round(S.duration(m)) + ' с.';
      if (!V.file || !P.files[V.file]) return Promise.resolve(false);
      return loadImage(P.files[V.file]).then(function (im) {
        var sw = im.naturalWidth, sh = im.naturalHeight, k;
        if (V.fit === 'stretch') x.drawImage(im, 0, 0, m.width, m.height);
        else {
          k = V.fit === 'cover' ? Math.max(m.width / sw, m.height / sh) : Math.min(m.width / sw, m.height / sh);
          x.drawImage(im, (m.width - sw * k) / 2, (m.height - sh * k) / 2, sw * k, sh * k);
        }
        return true;
      });
    }
    function make() {
      var m = md();
      out.innerHTML = '';
      drawSource().then(function (has) {
        if (!has) { alert('Сначала выберите картинку.'); return; }
        out.appendChild(h('div', { class: 'hint', text: 'Кодирую…' }));
        setTimeout(function () {
          var rgba = srcCanvas.getContext('2d').getImageData(0, 0, m.width, m.height).data;
          var snd = S.encode(m, rgba, m.width, m.height, V.rate, 0.5);
          var label = (V.label || '').trim();
          if (label && window.SGModem) {
            // метка перед картинкой: код звуком, пауза, затем SSTV (Д2)
            var mk = window.SGModem.encode(label, V.rate, 0.6), gap = Math.round(V.rate * 0.4);
            var both = new Float32Array(mk.length + gap + snd.length);
            both.set(mk); both.set(snd, mk.length + gap);
            snd = both;
          }
          var wav = new Blob([S.wav(snd, V.rate)], { type: 'audio/wav' });
          // самопроверка: тот же декодер, что в телефоне, на чистом звуке
          var got = null, heard = null;
          var d = new S.Decoder(V.rate, { onDone: function (img) { got = img; } });
          var md = window.SGModem ? new window.SGModem.Decoder(V.rate, function (c) { heard = c; }) : null;
          for (var i = 0; i < snd.length; i += 8192) { d.push(snd.subarray(i, i + 8192)); if (md) md.push(snd.subarray(i, i + 8192)); }
          var base = (V.file.replace(/\.[^.]+$/, '') || 'signal') + ' ' + m.name.replace(/\s+/g, '') + (label ? ' метка ' + label : '');
          V.result = { wav: wav, name: base.replace(/[\\/:*?"<>|]+/g, '_') + '.wav', got: got, label: label, heard: heard };
          showResult();
        }, 30);
      });
    }
    function showResult() {
      var r = V.result;
      out.innerHTML = '';
      if (!r) return;
      var check = h('canvas', { class: 'sstv-cv' });
      if (r.got) {
        check.width = r.got.width; check.height = r.got.rows;
        check.getContext('2d').putImageData(new ImageData(r.got.rgba.slice(0, r.got.width * r.got.rows * 4), r.got.width, r.got.rows), 0, 0);
      }
      out.appendChild(h('div', { class: 'two', style: 'gap:16px;align-items:flex-start' },
        h('div', {}, h('div', { class: 'f' }, h('label', { text: 'Так её примет телефон (чистый звук)' }), check)),
        h('div', { style: 'flex:1' },
          h('p', { text: r.name + ' — ' + size(r.wav.size) + (r.got ? ', проверка: ' + r.got.mode + ', ' + r.got.rows + ' строк' : ', ПРОВЕРКА НЕ ПРОШЛА') +
            (r.label ? (r.heard === r.label ? ', метка «' + r.heard + '» слышна' : ', МЕТКА НЕ РАСПОЗНАНА') : '') }),
          h('audio', { controls: true, src: URL.createObjectURL(r.wav), style: 'width:100%;margin-bottom:10px' }),
          h('div', { class: 'inline' },
            h('button', { class: 'main', text: 'Сохранить WAV…', on: { click: function () { saveBlob(r.wav, r.name, 'Звук WAV', 'audio/wav', '.wav'); } } }),
            h('button', { text: 'Добавить звук в медиа пакета', on: { click: function () {
              var n = safeName(r.name);
              P.files[n] = new File([r.wav], n, { type: 'audio/wav' });
              changed(); renderNav();
              alert('Звук «' + n + '» добавлен во вкладку «Медиа». Его можно вставить в блок как звук.');
            } } })),
          h('p', { class: 'hint', style: 'color:var(--dim);font-size:12px;margin-top:12px', text:
            'Этот звук — для терминала Twine (радио с декодером или обычный трек), колонки или реквизита. На телефонах игроков приёма SSTV нет (решение П-45: слишком зависит от телефона и шума). Показать на экране терминала заданную картинку — доработка движка (Д5, в очереди движка).' }))));
    }
    var fileSel = h('select', {}, h('option', { value: '', text: '— картинка из медиа пакета —' }),
      imgs.map(function (n) { return h('option', { value: n, text: n, selected: V.file === n }); }));
    fileSel.addEventListener('change', function () { V.file = fileSel.value; V.result = null; drawSource(); showResult(); });
    var modeSel = h('select', {}, S.MODES.map(function (m) {
      return h('option', { value: m.name, text: m.name + ' — ' + Math.round(S.duration(m)) + ' с, ' + m.width + '×' + m.height, selected: V.mode === m.name });
    }));
    modeSel.addEventListener('change', function () { V.mode = modeSel.value; V.result = null; drawSource(); showResult(); });
    var fitSel = h('select', {}, [['cover', 'заполнить кадр (обрезать края)'], ['contain', 'вписать целиком (поля)'], ['stretch', 'растянуть']].map(function (o) {
      return h('option', { value: o[0], text: o[1], selected: V.fit === o[0] });
    }));
    fitSel.addEventListener('change', function () { V.fit = fitSel.value; V.result = null; drawSource(); showResult(); });
    var rateSel = h('select', {}, [[22050, '22 050 Гц (меньше файл)'], [44100, '44 100 Гц'], [48000, '48 000 Гц']].map(function (o) {
      return h('option', { value: o[0], text: o[1], selected: V.rate === o[0] });
    }));
    rateSel.addEventListener('change', function () { V.rate = +rateSel.value; V.result = null; showResult(); });
    drawSource();
    showResult();
    return [h('h1', { text: 'SSTV' }),
      h('p', { class: 'lead', text: 'Картинка → звук SSTV. Звук ставится в терминал или в блок; телефон с функцией «Приём SSTV» (вкладка «Аккаунты» → «Функции приложения») набирает картинку из звука через микрофон, строку за строкой, как Robot36.' }),
      h('div', { class: 'card' }, h('h3', { text: 'Картинка' }),
        h('div', { class: 'two', style: 'gap:18px;align-items:flex-start' },
          h('div', { style: 'flex:1' },
            h('div', { class: 'f' }, h('label', { text: 'Файл' }), h('div', { class: 'inline' }, fileSel,
              h('button', { text: 'Загрузить новую…', on: { click: function () {
                pickMedia('image', function (name) { V.file = name; V.result = null; render(); });
              } } }))),
            h('div', { class: 'grid2' },
              h('div', { class: 'f' }, h('label', { text: 'Режим SSTV' }), modeSel),
              h('div', { class: 'f' }, h('label', { text: 'Как уложить в кадр' }), fitSel)),
            h('div', { class: 'grid2' },
              h('div', { class: 'f' }, h('label', { text: 'Частота звука' }), rateSel),
              fld('Метка перед картинкой (код, необязательно)', V, 'label', { placeholder: 'например 7301', hint: 'Код из «Кодов»: сработает у принявшего картинку.' })),
            h('button', { class: 'main', text: 'Сделать звук', on: { click: make } })),
          h('div', {}, h('div', { class: 'f' }, h('label', { text: 'Кадр передачи' }), srcCanvas, info)))),
      h('div', { class: 'card' }, h('h3', { text: 'Звук' }), out),
      codeSoundCard()];
  }

  /* Код звуком (М1): терминал «пищит» кодом, телефоны рядом с функцией «Приём сигналов» его получают. */
  function codeSoundCard() {
    var V = ui.sstv;
    var res = h('div', {});
    function show() {
      res.innerHTML = '';
      var r = V.codeRes;
      if (!r) return;
      res.appendChild(h('p', { text: r.name + ' — ' + size(r.wav.size) + ', ' + r.secs.toFixed(1) + ' с' + (r.heard === r.code ? ', проверка: код слышен' : ', ПРОВЕРКА НЕ ПРОШЛА') }));
      res.appendChild(h('audio', { controls: true, src: URL.createObjectURL(r.wav), style: 'width:100%;margin-bottom:8px' }));
      res.appendChild(h('div', { class: 'inline' },
        h('button', { class: 'main', text: 'Сохранить WAV…', on: { click: function () { saveBlob(r.wav, r.name, 'Звук WAV', 'audio/wav', '.wav'); } } }),
        h('button', { text: 'Добавить звук в медиа пакета', on: { click: function () {
          var n = safeName(r.name); P.files[n] = new File([r.wav], n, { type: 'audio/wav' }); changed(); renderNav(); alert('Звук «' + n + '» добавлен во вкладку «Медиа».');
        } } })));
    }
    function make() {
      var code = (V.code || '').trim();
      if (!code) { alert('Введите код.'); return; }
      var rate = 44100;
      var snd = window.SGModem.encode(code, rate, 0.7);
      var lead = new Float32Array(Math.round(rate * 0.3));
      var all = new Float32Array(lead.length * 2 + snd.length);
      all.set(snd, lead.length);
      var heard = null;
      var d = new window.SGModem.Decoder(rate, function (c) { heard = c; });
      d.push(all);
      V.codeRes = { code: code, heard: heard, secs: all.length / rate, wav: new Blob([window.SGSSTV.wav(all, rate)], { type: 'audio/wav' }), name: ('Код ' + code).replace(/[\\/:*?"<>|]+/g, '_') + '.wav' };
      show();
    }
    show();
    return h('div', { class: 'card' }, h('h3', { text: 'Код звуком' }),
      h('p', { class: 'hint', style: 'color:var(--dim);font-size:12px', text: 'Короткий писк (1–3 с), в котором записан код. На телефонах приёма звука нет (П-45): звук пригодится для терминала или реквизита как «передача данных» на слух.' }),
      h('div', { class: 'inline', style: 'margin-bottom:10px' }, (function () {
        var inp = h('input', { type: 'text', value: V.code || '', placeholder: 'код, например 4242', style: 'font-family:Consolas,monospace;font-size:16px;max-width:240px' });
        inp.addEventListener('input', function () { V.code = inp.value; });
        return inp;
      })(), h('button', { class: 'main', text: 'Сделать звук кода', on: { click: make } })),
      res);
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
  window.sgEditor = { sstv: function () { return ui.sstv; }, tableCsv: tableCsv, printTable: printTable, project: function () { return P; }, render: render, setTab: function (t) { ui.tab = t; render(); } };

  idbGet('project').then(function (saved) {
    if (saved && saved.game) {
      P = { game: SG.normalize(saved.game), files: saved.files || {} };
      status('открыт черновик из браузера');
    } else status('новый пакет');
    render();
  }).catch(function () { render(); });
})();
