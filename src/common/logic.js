/* СИГНАЛЫ — общая логика пакета игры (плеер и редактор).
   Пакет игры (.sgpack) — zip: game.json + media/<файлы>. */
(function (root) {
  'use strict';

  var FORMAT = 1;

  var DEFAULT_THEME = {
    bg: '#030803',
    panel: '#071407',
    text: '#33ff66',
    dim: '#1d8a3a',
    accent: '#a8ffbf',
    warn: '#ff4d4d',
    scanlines: true,
    glow: true,
    flicker: false,
    font: 'mono'
  };

  var FONTS = {
    mono: '"Consolas", "Lucida Console", "Courier New", monospace',
    courier: '"Courier New", Courier, monospace',
    sans: '"Segoe UI", Roboto, Arial, sans-serif'
  };

  var DEFAULT_TEXTS = {
    loginTitle: 'ВВЕДИТЕ КОД ДОСТУПА',
    wrongCode: 'КОД НЕ РАСПОЗНАН',
    denied: 'НЕТ ДОСТУПА',
    already: 'ДАННЫЕ УЖЕ ПОЛУЧЕНЫ',
    tooEarly: 'КОД ПОКА НЕ АКТИВЕН',
    opened: 'ДОСТУП ОТКРЫТ',
    chapter: 'ПЕРЕХОД'
  };

  function uid(prefix) {
    return (prefix || 'x') + Math.random().toString(36).slice(2, 8);
  }

  function newGame() {
    var ch1 = { id: uid('c'), name: 'Глава 1', code: '', theme: clone(DEFAULT_THEME) };
    return {
      format: FORMAT,
      title: 'СИГНАЛЫ',
      version: 1,
      masterCode: '0000',
      texts: clone(DEFAULT_TEXTS),
      chapters: [ch1],
      accounts: [],
      blocks: [],
      codes: []
    };
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /* Приводит game.json к полному виду: недостающие поля — по умолчанию. */
  function normalize(game) {
    var g = game || {};
    var base = newGame();
    g.format = g.format || FORMAT;
    if (typeof g.title !== 'string') g.title = base.title;
    if (!g.version) g.version = 1;
    if (typeof g.masterCode !== 'string') g.masterCode = base.masterCode;
    g.masterComment = g.masterComment || '';
    g.texts = Object.assign(clone(DEFAULT_TEXTS), g.texts || {});
    if (!Array.isArray(g.chapters) || !g.chapters.length) g.chapters = base.chapters;
    g.chapters.forEach(function (c, i) {
      c.id = c.id || uid('c');
      if (typeof c.name !== 'string') c.name = 'Глава ' + (i + 1);
      if (typeof c.code !== 'string') c.code = '';
      c.theme = Object.assign(clone(DEFAULT_THEME), c.theme || {});
      c.comment = c.comment || '';
      c.where = c.where || '';
    });
    g.accounts = Array.isArray(g.accounts) ? g.accounts : [];
    g.accounts.forEach(function (a) {
      a.id = a.id || uid('a');
      a.name = a.name || '';
      a.profession = a.profession || '';
      a.login = String(a.login == null ? '' : a.login);
      a.items = Array.isArray(a.items) ? a.items : [];
      a.comment = a.comment || '';
      a.where = a.where || '';
    });
    g.blocks = Array.isArray(g.blocks) ? g.blocks : [];
    g.blocks.forEach(function (b) {
      b.id = b.id || uid('b');
      b.title = b.title || '';
      b.section = folderKey(b.section);
      b.who = Array.isArray(b.who) ? b.who : [];
      b.chapter = b.chapter || 1;
      b.start = !!b.start;
      b.items = Array.isArray(b.items) ? b.items : [];
    });
    g.codes = Array.isArray(g.codes) ? g.codes : [];
    g.codes.forEach(function (c) {
      c.id = c.id || uid('k');
      c.code = String(c.code == null ? '' : c.code);
      c.note = c.note || '';
      c.who = Array.isArray(c.who) ? c.who : [];
      c.opens = Array.isArray(c.opens) ? c.opens : [];
      c.answer = c.answer || '';
      c.denied = c.denied || '';
      c.deniedOpens = Array.isArray(c.deniedOpens) ? c.deniedOpens : [];
      c.chapter = c.chapter || 1;
      c.comment = c.comment || '';
      c.where = c.where || '';
    });
    return g;
  }

  /* Папки: раздел блока — путь через «/», например «Процедуры/Медицина». */
  function folderPath(section) {
    return String(section || '').split('/').map(function (x) { return x.replace(/\s+/g, ' ').trim(); })
      .filter(function (x) { return x; });
  }
  function folderKey(section) { return folderPath(section).join('/'); }

  /* Что лежит на уровне path (массив имён) среди блоков list — в порядке первого появления:
     [{folder: имя, path: [...], blocks: [все блоки внутри, включая вложенные]} | {block: b}] */
  function folderLevel(list, path) {
    var out = [];
    var byName = {};
    var depth = path.length;
    list.forEach(function (b) {
      var p = folderPath(b.section);
      for (var i = 0; i < depth; i++) if (p[i] !== path[i]) return;
      if (p.length === depth) { out.push({ block: b }); return; }
      var name = p[depth];
      if (!byName[name]) {
        byName[name] = { folder: name, path: path.concat([name]), blocks: [] };
        out.push(byName[name]);
      }
      byName[name].blocks.push(b);
    });
    return out;
  }

  /* Все папки (с родительскими) в порядке дерева: родитель, затем его дети по первому появлению. */
  function folderList(blocks) {
    var order = [];
    blocks.forEach(function (b) {
      var p = folderPath(b.section);
      for (var i = 1; i <= p.length; i++) {
        var k = p.slice(0, i).join('/');
        if (order.indexOf(k) < 0) order.push(k);
      }
    });
    var out = [];
    (function walk(prefix) {
      order.forEach(function (k) {
        var parent = k.lastIndexOf('/') < 0 ? '' : k.slice(0, k.lastIndexOf('/'));
        if (parent === prefix) { out.push(k); walk(k); }
      });
    })('');
    return out;
  }

  /* Код игры сравнивается без пробелов и регистра. */
  function norm(code) {
    return String(code || '').replace(/\s+/g, '').toUpperCase();
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function allowed(who, accountId) {
    return !who.length || who.indexOf(accountId) >= 0;
  }

  /* Блоки, которые видит аккаунт: свои по правам, глава наступила, открыт с начала или кодом. */
  function visibleBlocks(game, state) {
    var acc = state.account;
    var unlocked = state.unlocked || [];
    return game.blocks.filter(function (b) {
      if (!allowed(b.who, acc)) return false;
      if ((state.chapter || 1) < b.chapter) return false;
      return b.start || unlocked.indexOf(b.id) >= 0;
    });
  }

  /* Что делает введённый или отсканированный код.
     Возвращает {kind, ...}: master, login, chapter, open, denied, already, early, wrong. */
  function resolveCode(game, state, input) {
    var c = norm(input);
    if (!c) return { kind: 'wrong' };
    if (game.masterCode && norm(game.masterCode) === c) return { kind: 'master' };
    if (!state.account) {
      for (var i = 0; i < game.accounts.length; i++) {
        if (game.accounts[i].login && norm(game.accounts[i].login) === c) {
          return { kind: 'login', account: game.accounts[i] };
        }
      }
      return { kind: 'wrong' };
    }
    for (var n = 0; n < game.chapters.length; n++) {
      if (game.chapters[n].code && norm(game.chapters[n].code) === c) {
        return { kind: 'chapter', index: n + 1, chapter: game.chapters[n] };
      }
    }
    for (var k = 0; k < game.codes.length; k++) {
      var code = game.codes[k];
      if (!code.code || norm(code.code) !== c) continue;
      if ((state.chapter || 1) < code.chapter) return { kind: 'early', code: code };
      var ok = allowed(code.who, state.account);
      var ids = ok ? code.opens : code.deniedOpens;
      var blocks = ids.map(function (id) { return byId(game.blocks, id); })
        .filter(function (b) { return b && allowed(b.who, state.account); });
      var unlocked = state.unlocked || [];
      var fresh = blocks.filter(function (b) { return unlocked.indexOf(b.id) < 0; });
      if (!ok) return { kind: 'denied', code: code, blocks: blocks, fresh: fresh };
      if (blocks.length && !fresh.length) return { kind: 'already', code: code, blocks: blocks, fresh: fresh };
      return { kind: 'open', code: code, blocks: blocks, fresh: fresh };
    }
    return { kind: 'wrong' };
  }

  /* Все коды пакета одной таблицей: мастер, входы, главы, коды игры. */
  function allCodes(game) {
    var out = [];
    out.push({ key: 'm', kind: 'master', code: game.masterCode, label: 'МАСТЕР', group: 'Мастер', obj: game,
      comment: 'masterComment', where: null });
    game.accounts.forEach(function (a) {
      out.push({ key: 'a' + a.id, kind: 'login', code: a.login, label: 'вход: ' + (a.name || '?'), group: 'Входы в аккаунты', obj: a,
        codeKey: 'login', comment: 'comment', where: 'where' });
    });
    game.chapters.forEach(function (c, i) {
      if (!i) return;
      out.push({ key: 'c' + c.id, kind: 'chapter', code: c.code, label: 'переход: ' + c.name, group: 'Главы', obj: c, chapter: i + 1,
        codeKey: 'code', comment: 'comment', where: 'where' });
    });
    game.codes.forEach(function (c) {
      out.push({ key: 'k' + c.id, kind: 'code', code: c.code, label: c.note || '', group: 'Коды', obj: c, chapter: c.chapter,
        codeKey: 'code', comment: 'comment', where: 'where' });
    });
    out[0].codeKey = 'masterCode';
    return out;
  }

  /* Проблемы пакета — для редактора. Возвращает [{level: 'error'|'warn', text}] */
  function problems(game, files) {
    var out = [];
    var seen = {};
    function err(t) { out.push({ level: 'error', text: t }); }
    function warn(t) { out.push({ level: 'warn', text: t }); }
    function claim(code, what) {
      var c = norm(code);
      if (!c) return;
      if (seen[c]) err('Код «' + code + '» повторяется: ' + seen[c] + ' и ' + what);
      else seen[c] = what;
    }
    if (!norm(game.masterCode)) err('Не задан мастерский код');
    claim(game.masterCode, 'мастерский код');
    game.chapters.forEach(function (c, i) {
      if (i > 0 && !norm(c.code)) warn('У главы «' + c.name + '» нет кода перехода');
      claim(c.code, 'переход в «' + c.name + '»');
    });
    if (!game.accounts.length) warn('Нет ни одного аккаунта');
    game.accounts.forEach(function (a) {
      if (!norm(a.login)) err('У аккаунта «' + (a.name || '?') + '» нет кода входа');
      claim(a.login, 'вход «' + (a.name || '?') + '»');
    });
    game.codes.forEach(function (c) {
      var label = c.note || c.code || '?';
      if (!norm(c.code)) err('Пустой код в списке кодов' + (c.note ? ' («' + c.note + '»)' : ''));
      claim(c.code, 'код «' + label + '»');
      if (!c.opens.length && !c.answer) warn('Код «' + label + '» ничего не открывает и без ответа');
      c.opens.concat(c.deniedOpens).forEach(function (id) {
        if (!byId(game.blocks, id)) err('Код «' + label + '» открывает удалённый блок');
      });
      if (c.chapter > game.chapters.length) err('Код «' + label + '»: глава ' + c.chapter + ' не существует');
    });
    game.blocks.forEach(function (b) {
      var name = b.title || '(без названия)';
      if (!b.title) warn('Блок без названия');
      if (b.chapter > game.chapters.length) err('Блок «' + name + '»: глава ' + b.chapter + ' не существует');
      if (!b.start && !game.codes.some(function (c) {
        return c.opens.indexOf(b.id) >= 0 || c.deniedOpens.indexOf(b.id) >= 0;
      })) warn('Блок «' + name + '» закрыт, но ни один код его не открывает');
    });
    function checkItems(items, owner) {
      items.forEach(function (it) {
        if ((it.type === 'image' || it.type === 'audio') && it.file && files && !files[it.file]) {
          err(owner + ': нет файла ' + it.file);
        }
        if ((it.type === 'image' || it.type === 'audio') && !it.file) warn(owner + ': не выбран файл');
      });
    }
    game.accounts.forEach(function (a) { checkItems(a.items, 'Аккаунт «' + (a.name || '?') + '»'); });
    game.blocks.forEach(function (b) { checkItems(b.items, 'Блок «' + (b.title || '?') + '»'); });
    return out;
  }

  /* Простая разметка текста: # заголовок, **жирный**, _курсив_, ~~зачёркнутый~~, переводы строк. */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function markup(text) {
    var lines = String(text || '').split(/\r?\n/);
    var html = [];
    var para = [];
    function inline(s) {
      return esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/~~(.+?)~~/g, '<s>$1</s>')
        .replace(/(^|[\s(])_(.+?)_(?=$|[\s.,!?:;)])/g, '$1<i>$2</i>');
    }
    function flush() {
      if (para.length) html.push('<p>' + para.map(inline).join('<br>') + '</p>');
      para = [];
    }
    lines.forEach(function (l) {
      var m = /^(#{1,2})\s+(.*)$/.exec(l);
      if (m) { flush(); html.push('<h' + (m[1].length + 2) + '>' + inline(m[2]) + '</h' + (m[1].length + 2) + '>'); }
      else if (/^\s*$/.test(l)) flush();
      else if (/^-{3,}\s*$/.test(l)) { flush(); html.push('<hr>'); }
      else para.push(l);
    });
    flush();
    return html.join('');
  }

  function themeCss(theme) {
    var t = Object.assign({}, DEFAULT_THEME, theme || {});
    return ':root{--bg:' + t.bg + ';--panel:' + t.panel + ';--text:' + t.text + ';--dim:' + t.dim +
      ';--accent:' + t.accent + ';--warn:' + t.warn + ';--font:' + (FONTS[t.font] || FONTS.mono) + ';}';
  }

  /* Чтение и запись пакета (нужен JSZip). */
  function readPack(data) {
    return root.JSZip.loadAsync(data).then(function (zip) {
      var entry = zip.file('game.json');
      if (!entry) throw new Error('В пакете нет game.json');
      return entry.async('string').then(function (text) {
        var game = normalize(JSON.parse(text));
        var files = {};
        var jobs = [];
        zip.folder('media').forEach(function (path, file) {
          if (file.dir) return;
          jobs.push(file.async('blob').then(function (b) { files[path] = b; }));
        });
        return Promise.all(jobs).then(function () { return { game: game, files: files }; });
      });
    });
  }

  function usedFiles(game) {
    var used = {};
    game.accounts.concat(game.blocks).forEach(function (o) {
      o.items.forEach(function (it) { if (it.file) used[it.file] = true; });
    });
    return used;
  }

  function writePack(game, files, onlyUsed) {
    var zip = new root.JSZip();
    zip.file('game.json', JSON.stringify(game, null, 1));
    var used = usedFiles(game);
    Object.keys(files).forEach(function (name) {
      if (onlyUsed && !used[name]) return;
      zip.file('media/' + name, files[name], { compression: 'STORE' });
    });
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' });
  }

  root.SG = {
    FORMAT: FORMAT,
    DEFAULT_THEME: DEFAULT_THEME,
    DEFAULT_TEXTS: DEFAULT_TEXTS,
    FONTS: FONTS,
    uid: uid,
    clone: clone,
    newGame: newGame,
    normalize: normalize,
    norm: norm,
    byId: byId,
    allowed: allowed,
    folderPath: folderPath,
    folderKey: folderKey,
    folderLevel: folderLevel,
    folderList: folderList,
    allCodes: allCodes,
    visibleBlocks: visibleBlocks,
    resolveCode: resolveCode,
    problems: problems,
    esc: esc,
    markup: markup,
    themeCss: themeCss,
    readPack: readPack,
    writePack: writePack,
    usedFiles: usedFiles
  };
})(typeof window !== 'undefined' ? window : globalThis);
