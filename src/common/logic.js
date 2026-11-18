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
    chapter: 'ПЕРЕХОД',
    empty: 'РЕСУРС ИСЧЕРПАН',
    mine: 'ВЫ УЖЕ ПОЛУЧИЛИ СВОЮ ДОЛЮ',
    offline: 'НЕТ СВЯЗИ С ЦЕНТРОМ — ПОВТОРИТЕ',
    sign: 'НУЖНА ЕЩЁ ПОДПИСЬ',
    signed: 'ПОДТВЕРЖДЕНО',
    unknown: 'НЕТ ДАННЫХ',
    used: 'ПРИБОР ИСЧЕРПАН',
    broken: 'ПОВРЕЖДЕНО',
    alarm: 'АВАРИЙНЫЙ РЕЖИМ',
    scanFail: 'СКАНЕР НЕ ОТВЕЧАЕТ',
    busy: 'ЭТОТ ПЕРСОНАЖ УЖЕ В СЕТИ',
    noPaste: 'ВСТАВКА НЕДОСТУПНА — НАБЕРИТЕ ВРУЧНУЮ'
  };
  /* Цвета интерфейса персонажей (П-50): палитра пакета. Из основного цвета выводятся фон, панели, приглушённый и выделение. */
  var DEFAULT_PALETTE = [
    { id: 'green', name: 'Зелёный', color: '#33ff66' },
    { id: 'lightgreen', name: 'Светло-зелёный', color: '#9dffb8' },
    { id: 'darkgreen', name: 'Тёмно-зелёный', color: '#22b84e' },
    { id: 'pink', name: 'Розовый', color: '#ff66c4' },
    { id: 'amber', name: 'Янтарный', color: '#ffb43a' },
    { id: 'blue', name: 'Голубой', color: '#4fd2ff' },
    { id: 'violet', name: 'Фиолетовый', color: '#b58cff' },
    { id: 'red', name: 'Красный', color: '#ff5a4a' },
    { id: 'white', name: 'Белый', color: '#dfe9df' }
  ];
  /* Связь (П-40…П-44): имя мастера в чатах, подпись анонимных, запрет вставки, предел отложенной отправки. */
  var DEFAULT_CHAT = { master: 'Руководитель', masterProf: '', anon: 'НЕИЗВЕСТНЫЙ', noPaste: true, delayMax: 60, masterContact: false,
    bossColor: '', anonColor: '' };   // цвет сообщений Руководителя (и «Системы» с пульта) и анонимных у всех: '' — цветом читающего (П-51)

  /* Голос (П-58): общие настройки. minConf — уверенность распознавания (0…1), digits — цифры голосом,
     sens — детектор голоса: 0 низкая, 1 обычная, 2 высокая чувствительность. */
  var DEFAULT_VOICE = { minConf: 0.6, digits: true, sens: 1, comment: '' };
  var VOICE_MODES = [['off', 'выкл'], ['button', 'по кнопке'], ['screen', 'при разблокированном экране'], ['always', 'всегда в фоне']];

  function uid(prefix) {
    return (prefix || 'x') + Math.random().toString(36).slice(2, 8);
  }

  function newGame() {
    var ch1 = { id: uid('c'), name: 'Глава 1', code: '', theme: clone(DEFAULT_THEME) };
    return {
      format: FORMAT,
      title: 'СИГНАЛЫ',
      version: 1,
      masterCode: String(10000000 + Math.floor(Math.random() * 89999999)),
      texts: clone(DEFAULT_TEXTS),
      chat: clone(DEFAULT_CHAT),
      chapters: [ch1],
      accounts: [],
      blocks: [],
      codes: [],
      apps: [],
      notices: [],
      alarms: [],
      glitches: [],
      rules: [],
      votes: [],
      settingsCode: '0000',
      sounds: true,
      palette: clone(DEFAULT_PALETTE),
      keyboard: 'own',
      firstRun: true,
      photo: { tint: '#33ff66', pixel: 3, grain: true, scan: true, stamp: true, stampText: 'КАМЕРА 01', mono: true }
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
    g.settingsComment = g.settingsComment || '';
    g.settingsCode = typeof g.settingsCode === 'string' ? g.settingsCode : '0000';
    g.sounds = g.sounds !== false;
    g.palette = Array.isArray(g.palette) && g.palette.length ? g.palette : clone(DEFAULT_PALETTE);
    g.palette.forEach(function (p, i) { p.id = p.id || uid('k'); p.name = p.name || 'Цвет ' + (i + 1); p.color = hexOk(p.color) || '#33ff66'; });
    g.keyboard = g.keyboard === 'sys' ? 'sys' : 'own';   // own — своя (игрок может выбрать системную), sys — только системная
    g.firstRun = g.firstRun !== false;
    g.photo = Object.assign({ tint: '#33ff66', pixel: 3, grain: true, scan: true, stamp: true, stampText: 'КАМЕРА 01', mono: true }, g.photo || {});
    g.texts = Object.assign(clone(DEFAULT_TEXTS), g.texts || {});
    g.chat = Object.assign(clone(DEFAULT_CHAT), g.chat || {});
    g.chat.delayMax = Math.max(1, Math.min(240, +g.chat.delayMax || 60));
    g.voice = Object.assign(clone(DEFAULT_VOICE), g.voice || {});
    g.voice.minConf = Math.max(0.1, Math.min(1, +g.voice.minConf || DEFAULT_VOICE.minConf));
    if (!Array.isArray(g.chapters) || !g.chapters.length) g.chapters = base.chapters;
    g.chapters.forEach(function (c, i) {
      c.id = c.id || uid('c');
      if (typeof c.name !== 'string') c.name = 'Глава ' + (i + 1);
      if (typeof c.code !== 'string') c.code = '';
      c.theme = Object.assign(clone(DEFAULT_THEME), c.theme || {});
      c.comment = c.comment || '';
      c.where = c.where || '';
      c.jam = +c.jam || 0;
      c.colors = Array.isArray(c.colors) ? c.colors : [];   // какие цвета можно выбрать ([] — все)
      c.senderColor = !!c.senderColor;                     // сообщения в чужих чатах — цветом отправителя
      c.colorReset = !!c.colorReset;                       // при переходе в главу выбор игроков сбрасывается
      c.force = typeof c.force === 'string' ? c.force : '';   // цвет главы для всех — перебивает выбор (П-50)
      c.decode = Math.max(0, Math.min(120, +c.decode || 0));   // сообщения в чате «расшифровываются» N секунд (П-56)
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
      a.modules = Array.isArray(a.modules) ? a.modules : [];
      a.modState = a.modState && typeof a.modState === 'object' ? a.modState : {};
      a.modChapter = a.modChapter && typeof a.modChapter === 'object' ? a.modChapter : {};
      // цвет по главам: { '1': { def: id палитры, choose: выбирает сам при первом входе, any: меняет в любое время, pin: id — всегда этим цветом в чужих чатах } }
      a.colors = a.colors && typeof a.colors === 'object' && !Array.isArray(a.colors) ? a.colors : {};
      // голос (П-58): режим микрофона, когда функция «Голос» включена ('off' — функции нет)
      a.voiceMode = ['button', 'screen', 'always'].indexOf(a.voiceMode) >= 0 ? a.voiceMode : (a.modules.indexOf('voice') >= 0 ? 'button' : 'off');
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
      b.share = !!b.share;
      b.garble = +b.garble || 0;
    });
    g.codes = Array.isArray(g.codes) ? g.codes : [];
    g.codes.forEach(normCode);
    g.apps = Array.isArray(g.apps) ? g.apps : [];
    g.apps.forEach(function (a) {
      a.id = a.id || uid('p');
      a.name = a.name || 'Прибор';
      a.title = a.title || '';
      a.hint = a.hint || '';
      a.who = Array.isArray(a.who) ? a.who : [];
      a.chapter = a.chapter || 1;
      a.start = a.start !== false;
      a.uses = +a.uses || 0;
      a.showUses = !!a.showUses;
      a.emptyText = a.emptyText || '';
      a.unknown = a.unknown || '';
      a.color = a.color || '';
    });
    g.notices = Array.isArray(g.notices) ? g.notices : [];
    g.notices.forEach(function (n) {
      n.id = n.id || uid('n');
      n.name = n.name || '';
      n.title = n.title || '';
      n.text = n.text || '';
      n.to = Array.isArray(n.to) ? n.to : [];
      n.chapter = +n.chapter || 0;
      n.minutes = +n.minutes || 0;
    });
    g.alarms = Array.isArray(g.alarms) ? g.alarms : [];
    g.alarms.forEach(function (a) {
      a.id = a.id || uid('r');
      a.name = a.name || 'Авария';
      a.title = a.title || '';
      a.text = a.text || '';
      ['red', 'full', 'siren', 'vibrate', 'torch', 'jam'].forEach(function (k) { if (a[k] == null) a[k] = true; });
    });
    g.glitches = Array.isArray(g.glitches) ? g.glitches : [];
    g.glitches.forEach(function (x) {
      x.id = x.id || uid('g');
      x.name = x.name || 'Сбой';
      x.kind = x.kind || 'visual';
      x.fx = Array.isArray(x.fx) ? x.fx : ['noise'];
      x.text = x.text || '';
      x.seconds = x.seconds == null ? 20 : +x.seconds || 0;
      x.fix = x.fix || 'time';
      x.state = !!x.state;
      x.chapters = Array.isArray(x.chapters) ? x.chapters : [];
      x.every = +x.every || 0;
      x.who = Array.isArray(x.who) ? x.who : [];
    });
    g.rules = Array.isArray(g.rules) ? g.rules : [];
    g.rules.forEach(function (r) {
      r.id = r.id || uid('e');
      r.name = r.name || '';
      r.on = r.on || 'event';
      r.event = r.event || '';
      r.chapter = +r.chapter || 1;
      r.minutes = +r.minutes || 0;
      r.chapters = Array.isArray(r.chapters) ? r.chapters : [];
      r.actions = Array.isArray(r.actions) ? r.actions : [];
    });
    g.votes = Array.isArray(g.votes) ? g.votes : [];
    g.votes.forEach(function (v) {
      v.id = v.id || uid('v');
      v.name = v.name || 'Голосование';
      v.title = v.title || '';
      v.options = Array.isArray(v.options) ? v.options : [];
      v.seconds = +v.seconds || 120;
      v.to = Array.isArray(v.to) ? v.to : [];
      v.every = +v.every || 0;
      v.chapters = Array.isArray(v.chapters) ? v.chapters : [];
      v.term = v.term || '';
    });
    return g;
  }

  function normCode(c) {
    c.id = c.id || uid('k');
    c.code = String(c.code == null ? '' : c.code);
    c.app = c.app || '';
    c.note = c.note || '';
    c.who = Array.isArray(c.who) ? c.who : [];
    c.opens = Array.isArray(c.opens) ? c.opens : [];
    c.answer = c.answer || '';
    c.answers = Array.isArray(c.answers) ? c.answers : [];
    c.order = c.order || 'seq';
    c.count = c.count || 'acc';
    c.denied = c.denied || '';
    c.deniedOpens = Array.isArray(c.deniedOpens) ? c.deniedOpens : [];
    c.deniedAsWrong = !!c.deniedAsWrong;
    c.chapter = c.chapter || 1;
    c.comment = c.comment || '';
    c.where = c.where || '';
    c.limit = +c.limit || 0;
    c.perAcc = !!c.perAcc;
    c.showLeft = !!c.showLeft;
    c.emptyText = c.emptyText || '';
    c.mineText = c.mineText || '';
    c.sign = +c.sign || 0;
    c.signWindow = +c.signWindow || 60;
    c.variants = Array.isArray(c.variants) ? c.variants : [];
    c.variants.forEach(function (v) {
      v.id = v.id || uid('w');
      v.who = Array.isArray(v.who) ? v.who : [];
      v.chapter = v.chapter || 1;
      v.answer = v.answer || '';
      v.answers = Array.isArray(v.answers) ? v.answers : [];
      v.order = v.order || 'seq';
      v.opens = Array.isArray(v.opens) ? v.opens : [];
    });
    c.actions = Array.isArray(c.actions) ? c.actions : [];
    c.voice = typeof c.voice === 'string' ? c.voice : '';          // фраза голосом (П-58); код можно оставить пустым — только голосом
    c.voiceMax = Math.max(0, +c.voiceMax || 0);                     // сколько телефонов срабатывает: 0 — все услышавшие
    c.voiceEvery = Math.max(0, +c.voiceEvery || 0);                 // секунд паузы после срабатывания (у всех)
    return c;
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

  /* Блоки, которые видит аккаунт: свои по правам, глава наступила, открыт с начала или кодом.
     Блоки, переданные другим игроком (state.received), видны всегда. */
  function visibleBlocks(game, state) {
    var acc = state.account;
    var unlocked = state.unlocked || [];
    var got = state.received || [];
    return game.blocks.filter(function (b) {
      if (got.indexOf(b.id) >= 0) return true;
      if (!allowed(b.who, acc)) return false;
      if ((state.chapter || 1) < b.chapter) return false;
      return b.start || unlocked.indexOf(b.id) >= 0;
    });
  }

  /* Что делает введённый или отсканированный код.
     app — прибор ('' — вкладки «Код» и «Сканер»). Возвращает {kind, ...}:
     master, settings, net, gift, login, chapter, early, wrong, code (дальше — codeNeeds / codeOutcome). */
  function resolveCode(game, state, input, app) {
    app = app || '';
    var raw = String(input || '').trim();
    var c = norm(raw);
    if (!c) return { kind: 'wrong' };
    if (/^SGNET:/i.test(raw)) return { kind: 'net', url: raw.replace(/^SGNET:/i, '').trim() };
    if (/^SGB:/i.test(raw)) {
      var bid = raw.split(':')[1];
      var gb = byId(game.blocks, bid);
      return gb && gb.share ? { kind: 'gift', block: gb } : { kind: 'wrong' };
    }
    if (!app) {
      if (game.masterCode && norm(game.masterCode) === c) return { kind: 'master' };
      if (game.settingsCode && norm(game.settingsCode) === c && state.account) return { kind: 'settings' };
    }
    if (!state.account) {
      for (var i = 0; i < game.accounts.length; i++) {
        if (game.accounts[i].login && norm(game.accounts[i].login) === c) {
          return { kind: 'login', account: game.accounts[i] };
        }
      }
      return { kind: 'wrong' };
    }
    if (!app) {
      for (var n = 0; n < game.chapters.length; n++) {
        if (game.chapters[n].code && norm(game.chapters[n].code) === c) {
          return { kind: 'chapter', index: n + 1, chapter: game.chapters[n] };
        }
      }
    }
    for (var k = 0; k < game.codes.length; k++) {
      var code = game.codes[k];
      if ((code.app || '') !== app || !code.code || norm(code.code) !== c) continue;
      if ((state.chapter || 1) < code.chapter) return { kind: 'early', code: code };
      var v = pickVariant(code, state);
      var ok = !!v || allowed(code.who, state.account);
      if (!ok && code.deniedAsWrong) return { kind: 'wrong' };
      return { kind: 'code', code: code, ok: ok, variant: v };
    }
    return { kind: 'wrong' };
  }

  /* Особый ответ персонажу: подходящий по «кому» и главе; конкретный персонаж важнее «всем», поздняя глава — ранней. */
  function pickVariant(code, state) {
    var best = null, score = -1;
    (code.variants || []).forEach(function (v) {
      if (!allowed(v.who, state.account)) return;
      if ((state.chapter || 1) < (v.chapter || 1)) return;
      var sc = (v.who.length ? 1000 : 0) + (v.chapter || 1);
      if (sc > score) { score = sc; best = v; }
    });
    return best;
  }

  /* Нужен ли центр: ограничение, «одна в руки», общий счёт, подписи. null — считать на телефоне. */
  function codeNeeds(r) {
    var c = r.code;
    if (!r.ok) return null;
    if (c.sign > 1) return { key: 'sign:' + c.id, sign: c.sign, window: c.signWindow };
    if (c.limit > 0 || c.perAcc || c.count === 'all') return { key: 'code:' + c.id, limit: c.limit, per: c.perAcc };
    return null;
  }

  /* Итог кода. n — номер выдачи (общий или этого персонажа), claim — ответ центра (если нужен).
     Возвращает {kind: open|denied|already|empty|mine|wait|offline, title, text, blocks, fresh, actions, left}. */
  function codeOutcome(game, state, r, n, claim) {
    var c = r.code, T = game.texts;
    var unlocked = state.unlocked || [];
    function pick(ids) {
      return ids.map(function (id) { return byId(game.blocks, id); })
        .filter(function (b) { return b && allowed(b.who, state.account); });
    }
    if (!r.ok) {
      var db = pick(c.deniedOpens);
      return { kind: 'denied', title: T.denied, text: c.denied, blocks: db, fresh: db.filter(function (b) { return unlocked.indexOf(b.id) < 0; }), actions: [] };
    }
    if (claim && !claim.ok) {
      if (claim.reason === 'wait') return { kind: 'wait', title: T.sign, text: 'Подписей: ' + claim.have + ' из ' + claim.need + '. Второй персонаж должен ввести тот же код.', blocks: [], fresh: [], actions: [] };
      if (claim.reason === 'offline') return { kind: 'offline', title: T.offline, text: '', blocks: [], fresh: [], actions: [] };
      if (claim.reason === 'mine') return { kind: 'mine', title: T.mine, text: c.mineText, blocks: [], fresh: [], actions: [] };
      return { kind: 'empty', title: T.empty, text: c.emptyText, blocks: [], fresh: [], actions: [] };
    }
    var src = r.variant || c;
    var texts = [src.answer].concat(src.answers || []);
    var text;
    if (texts.length === 1) text = texts[0];
    else if (src.order === 'random') text = texts[Math.floor(Math.random() * texts.length)];
    else text = texts[Math.max(0, Math.min(texts.length - 1, (n || 1) - 1))];
    var blocks = pick(src.opens);
    var fresh = blocks.filter(function (b) { return unlocked.indexOf(b.id) < 0; });
    var left = claim && c.limit > 0 && c.showLeft ? claim.left : null;
    var again = texts.length === 1 && blocks.length && !fresh.length && !c.actions.length && !c.limit && !c.perAcc;
    return { kind: again ? 'already' : 'open', title: again ? T.already : (claim && claim.signers ? T.signed : T.opened),
      text: text, blocks: blocks, fresh: fresh, actions: c.actions, left: left };
  }

  /* ---------- функции приложения по аккаунтам (Г1, Г2) ---------- */
  /* 'on' | 'hidden' | 'denied' | 'broken'. mods — включено/выключено кодами на этом телефоне. */
  function moduleState(game, acc, chapter, mods, id) {
    if (!acc) return 'hidden';
    if (RETIRED[id]) return 'hidden';
    var off = acc.modState[id] || 'hidden';
    var rt = mods && mods[id];
    if (rt === 'on') return 'on';
    if (rt === 'broken' || rt === 'denied' || rt === 'hidden') return rt;
    if (acc.modules.indexOf(id) < 0) return off;
    if ((chapter || 1) < (acc.modChapter[id] || 1)) return off;
    return 'on';
  }

  /* Приборы, доступные аккаунту: с начала (и с главы) или открытые кодом (opened). */
  function appsFor(game, accId, chapter, opened) {
    opened = opened || [];
    return game.apps.filter(function (a) {
      if (!allowed(a.who, accId)) return false;
      if (opened.indexOf(a.id) >= 0) return true;
      return a.start && (chapter || 1) >= a.chapter;
    });
  }

  /* ---------- действия (у кодов, правил, на пульте мастера) ---------- */
  var ACTIONS = {
    open: 'Открыть блоки', notify: 'Уведомление', alarm: 'Аварийный режим', glitch: 'Сбой / состояние', fix: 'Убрать сбой',
    module: 'Функция приложения', app: 'Открыть прибор', chapter: 'Глава для всех', term: 'Переменная терминала',
    event: 'Событие (для правил и терминала)', countdown: 'Обратный отсчёт', vote: 'Голосование', color: 'Цвет интерфейса'
  };

  /* Разворачивает действия в сообщения протокола (docs/06_NETWORK.md).
     ctx: {self: id аккаунта или null (правила центра), now: время центра или '{{now}}'}.
     Возвращает {local: [действия для этого телефона], net: [сообщения центру]}. */
  function expandActions(game, actions, ctx) {
    var out = { local: [], net: [] };
    var now = ctx.now;
    function plus(ms) { return typeof now === 'number' ? now + ms : '{{now+' + ms + '}}'; }
    function targets(a) {
      // 'self' — тот, кто ввёл код (в правилах центра — все); [] — все; иначе — список аккаунтов
      if (a.to === 'self' || a.to == null) return ctx.self ? 'self' : ['all'];
      if (!a.to.length) return ['all'];
      return a.to.map(function (id) { return 'acc:' + id; });
    }
    function route(a, kind, body) {
      var to = targets(a);
      if (to === 'self') out.local.push({ kind: kind, body: body });
      else out.net.push({ t: 'msg', to: to, kind: kind, body: body });
    }
    actions.forEach(function (a) {
      if (a.type === 'open') route(a, 'open', { blocks: a.blocks || [], title: a.title || '' });
      else if (a.type === 'notify') {
        var n = byId(game.notices, a.notice) || {};
        route(a, 'notify', { title: a.title || n.title || '', text: a.text || n.text || '' });
      } else if (a.type === 'glitch') route(a, 'glitch', { id: a.glitch });
      else if (a.type === 'fix') { if ((a.to == null || a.to === 'self') && ctx.self) out.local.push({ kind: 'fix', body: { id: a.glitch || '' } }); else route(a, 'fix', { id: a.glitch || '' }); }
      else if (a.type === 'module') route(a, 'module', { id: a.module, on: a.on || 'on' });
      else if (a.type === 'app') route(a, 'app', { id: a.app });
      else if (a.type === 'color') route(a, 'color', a.mode === 'set' ? { set: a.color || '' } : a.mode === 'any-on' ? { any: true } : a.mode === 'any-off' ? { any: false } : { offer: true });
      else if (a.type === 'alarm') {
        var al = byId(game.alarms, a.alarm) || {};
        var v = a.on === false ? { on: false, at: now } : { on: true, id: al.id || a.alarm, title: al.title || game.texts.alarm, text: al.text || '',
          red: al.red !== false, full: al.full !== false, siren: al.siren !== false, vibrate: al.vibrate !== false, torch: al.torch !== false, jam: al.jam !== false, at: now };
        out.net.push({ t: 'set', key: 'alarm', value: v, local: true });
      } else if (a.type === 'chapter') out.net.push({ t: 'set', key: 'chapter', value: { n: +a.n || 1, at: now }, local: true });
      else if (a.type === 'term') out.net.push({ t: 'msg', to: ['role:terminal'], kind: 'term', body: { set: (function () { var o = {}; o[a.name] = a.value; return o; })() } });
      else if (a.type === 'event') out.net.push({ t: 'msg', to: ['role:terminal'], kind: 'event', body: { name: a.name } });
      else if (a.type === 'countdown') {
        out.net.push({ t: 'set', key: 'countdown', local: true, value: a.on === false ? { on: false } :
          { on: true, title: a.title || '', until: plus((+a.seconds || 60) * 1000), at: now } });
      } else if (a.type === 'vote') {
        var vt = byId(game.votes, a.vote);
        if (vt) out.net = out.net.concat(voteMessages(vt, now));
      }
    });
    return out;
  }

  function voteMessages(v, now) {
    var id = v.id + '-' + (typeof now === 'number' ? now : '{{now}}');
    var until = typeof now === 'number' ? now + v.seconds * 1000 : '{{now+' + v.seconds * 1000 + '}}';
    var body = { on: true, id: id, title: v.title || v.name, options: v.options.slice(), until: until, to: v.to.slice(), term: v.term || '' };
    var closed = Object.assign({}, body, { on: false });
    return [{ t: 'set', key: 'vote', value: body },
      { t: 'set', key: 'vote', value: closed, delay: v.seconds * 1000 },
      { t: 'msg', to: ['role:terminal', 'role:master'], kind: 'vote-close', body: { id: id, term: v.term || '', options: v.options.slice() }, delay: v.seconds * 1000 + 300 }];
  }

  /* Правила для центра: события терминала, таймеры от начала главы, повторы (В6, Е3). */
  function centerRules(game) {
    var list = [];
    function emit(actions) {
      var x = expandActions(game, actions, { self: null, now: '{{now}}' });
      return x.net.map(function (m) { var o = Object.assign({}, m); delete o.local; return o; });
    }
    function delayAll(items, ms) { return items.map(function (m) { var o = Object.assign({}, m); o.delay = (o.delay || 0) + ms; return o; }); }
    game.rules.forEach(function (r) {
      if (!r.actions.length) return;
      if (r.on === 'event' && r.event) list.push({ id: r.id, on: 'event', event: r.event, chapters: r.chapters, emit: emit(r.actions) });
      else if (r.on === 'chapter') list.push({ id: r.id, on: 'state', key: 'chapter', n: r.chapter, emit: delayAll(emit(r.actions), r.minutes * 60000) });
      else if (r.on === 'every' && r.minutes > 0) list.push({ id: r.id, on: 'every', every: r.minutes * 60000, chapters: r.chapters, emit: emit(r.actions) });
    });
    game.notices.forEach(function (n) {
      if (!n.chapter) return;
      list.push({ id: 'n-' + n.id, on: 'state', key: 'chapter', n: n.chapter,
        emit: delayAll(emit([{ type: 'notify', notice: n.id, to: n.to }]), n.minutes * 60000) });
    });
    game.votes.forEach(function (v) {
      if (v.every > 0) list.push({ id: 'v-' + v.id, on: 'every', every: v.every * 60000, chapters: v.chapters, emit: voteMessages(v, '{{now}}') });
    });
    return list;
  }

  /* ---------- помехи (В3) и искажённый текст до главы (М6) ---------- */
  function rng(seed) {
    var x = 0;
    for (var i = 0; i < String(seed).length; i++) x = (x * 31 + String(seed).charCodeAt(i)) | 0;
    return function () { x = (x * 1103515245 + 12345) | 0; return ((x >>> 8) & 0xffff) / 65536; };
  }
  var JAM = '#%&@$*?!░▒▓█<>/\\|=+~';
  function jam(text, level, seed) {
    if (!level) return text;
    var p = [0, 0.12, 0.35, 0.7][Math.min(3, level)];
    var r = rng(seed);
    return String(text).split('').map(function (ch) {
      if (/\s/.test(ch)) return r() < p / 3 ? '_' : ch;
      return r() < p ? JAM[Math.floor(r() * JAM.length)] : ch;
    }).join('');
  }
  var GARB = 'ΔΣΞΨΩλψ∆∑∂∫≈≠⌁⌇⍉⍜⎍⏃⏚⟟⟒⊥⊤⊢⊣';
  function garble(text, seed) {
    var r = rng(seed);
    return String(text).replace(/[^\s#*_~\-]/g, function (ch) { return r() < 0.8 ? GARB[Math.floor(r() * GARB.length)] : ch; });
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
      var app = c.app ? byId(game.apps || [], c.app) : null;
      out.push({ key: 'k' + c.id, kind: 'code', code: c.code, label: c.note || '', group: app ? 'Прибор «' + app.name + '»' : 'Коды', obj: c, chapter: c.chapter,
        codeKey: 'code', comment: 'comment', where: 'where', app: c.app || '' });
    });
    out[0].codeKey = 'masterCode';
    out.splice(1, 0, { key: 's', kind: 'settings', code: game.settingsCode, label: 'настройки игрока (звук)', group: 'Мастер', obj: game,
      codeKey: 'settingsCode', comment: 'settingsComment', where: null });
    return out;
  }

  /* Проблемы пакета — для редактора. Возвращает [{level: 'error'|'warn', text}] */
  function problems(game, files) {
    var out = [];
    var seen = {};
    function err(t) { out.push({ level: 'error', text: t }); }
    function warn(t) { out.push({ level: 'warn', text: t }); }
    function claim(code, what, app) {
      var c = (app ? app + '|' : '') + norm(code);
      if (!norm(code)) return;
      if (seen[c]) err('Код «' + code + '» повторяется: ' + seen[c] + ' и ' + what);
      else seen[c] = what;
    }
    if (!norm(game.masterCode)) err('Не задан мастерский код');
    else if (norm(game.masterCode).length < 6) warn('Мастерский код короче 6 знаков: игроки могут подобрать его случайно');
    claim(game.masterCode, 'мастерский код');
    claim(game.settingsCode, 'код настроек игрока');
    game.chapters.forEach(function (c, i) {
      if (i > 0 && !norm(c.code)) warn('У главы «' + c.name + '» нет кода перехода');
      claim(c.code, 'переход в «' + c.name + '»');
    });
    if (!game.accounts.length) warn('Нет ни одного аккаунта');
    game.accounts.forEach(function (a) {
      if (!norm(a.login)) err('У аккаунта «' + (a.name || '?') + '» нет кода входа');
      claim(a.login, 'вход «' + (a.name || '?') + '»');
    });
    var voiceSeen = {};
    game.codes.forEach(function (c) {
      var label = c.note || c.code || (c.voice ? '«' + c.voice + '»' : '?');
      var vn = voiceNorm(c.voice);
      if (vn && voiceSeen[vn]) warn('Фраза голосом «' + c.voice + '» повторяется: срабатывает первый код из подходящих персонажу');
      if (vn) voiceSeen[vn] = 1;
      var app = c.app ? byId(game.apps, c.app) : null;
      if (c.app && !app) err('Код «' + label + '»: прибор удалён');
      if (!norm(c.code) && !voiceNorm(c.voice)) err('Пустой код в списке кодов' + (c.note ? ' («' + c.note + '»)' : ''));
      if (c.voice && c.app) warn('Код «' + label + '»: фраза голосом у прибора не срабатывает');
      claim(c.code, 'код «' + label + '»' + (app ? ' (прибор «' + app.name + '»)' : ''), c.app);
      if (!c.opens.length && !c.answer && !c.actions.length && !c.variants.length) warn('Код «' + label + '» ничего не открывает, без ответа и действий');
      c.opens.concat(c.deniedOpens).forEach(function (id) {
        if (!byId(game.blocks, id)) err('Код «' + label + '» открывает удалённый блок');
      });
      if (c.chapter > game.chapters.length) err('Код «' + label + '»: глава ' + c.chapter + ' не существует');
    });
    function opensBlock(id) {
      return game.codes.some(function (c) {
        return c.opens.indexOf(id) >= 0 || c.deniedOpens.indexOf(id) >= 0 ||
          c.variants.some(function (v) { return v.opens.indexOf(id) >= 0; }) ||
          c.actions.some(function (a) { return a.type === 'open' && (a.blocks || []).indexOf(id) >= 0; });
      }) || game.rules.some(function (r) { return r.actions.some(function (a) { return a.type === 'open' && (a.blocks || []).indexOf(id) >= 0; }); });
    }
    game.blocks.forEach(function (b) {
      var name = b.title || '(без названия)';
      if (!b.title) warn('Блок без названия');
      if (b.chapter > game.chapters.length) err('Блок «' + name + '»: глава ' + b.chapter + ' не существует');
      if (!b.start && !b.share && !opensBlock(b.id)) warn('Блок «' + name + '» закрыт, но ни один код его не открывает');
    });
    function checkItems(items, owner) {
      items.forEach(function (it) {
        if ((it.type === 'image' || it.type === 'audio') && it.file && files && !files[it.file]) {
          err(owner + ': нет файла ' + it.file);
        }
        if ((it.type === 'image' || it.type === 'audio') && !it.file) warn(owner + ': не выбран файл');
      });
    }
    game.apps.forEach(function (a) {
      if (!a.start && !game.codes.some(function (c) { return c.actions.some(function (x) { return x.type === 'app' && x.app === a.id; }); }))
        warn('Прибор «' + a.name + '» закрыт, но ни один код его не открывает');
    });
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

  /* Полупрозрачные оттенки цветов главы — переменными (--text-30 и т. п.), а не color-mix():
     старый WebView (Android 7–9 без обновлений) color-mix не знает, и фон кнопок пропадал. */
  var MIX = { text: [8, 15, 30, 40, 60], dim: [40, 50], accent: [45] };
  function rgba(hex, pc) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return hex;
    var x = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
    var n = parseInt(x, 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + (pc / 100) + ')';
  }
  /* ---------- цвета персонажей (П-50) ---------- */
  function hexOk(h) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || '').trim());
    if (!m) return '';
    return '#' + (m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1]).toLowerCase();
  }
  function rgbOf(h) { var n = parseInt((hexOk(h) || '#33ff66').slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function hexOf(c) { return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  /* Цвет по id палитры или прямо '#rrggbb' (мастер с пульта); '' — нет. */
  function paletteColor(game, id) {
    if (!id) return '';
    if (/^#/.test(id)) return hexOk(id);
    var p = byId(game.palette || [], id);
    return p ? p.color : '';
  }
  /* Тема главы с основным цветом персонажа: текст — цвет, остальное выводится из него. */
  function colorTheme(theme, hex) {
    var t = Object.assign({}, DEFAULT_THEME, theme || {});
    hex = hexOk(hex);
    if (!hex) return t;
    var c = rgbOf(hex);
    t.text = hex;
    t.dim = hexOf(c.map(function (v) { return v * 0.55; }));
    t.accent = hexOf(c.map(function (v) { return v + (255 - v) * 0.6; }));
    t.bg = hexOf(c.map(function (v) { return 3 + v * 0.02; }));
    t.panel = hexOf(c.map(function (v) { return 4 + v * 0.065; }));
    return t;
  }
  function colorCfg(acc, n) { return (acc && acc.colors && acc.colors[String(n || 1)]) || {}; }
  /* Цвета, которые можно выбрать в главе n. */
  function allowedColors(game, n) {
    var ch = game.chapters[(n || 1) - 1] || {};
    var list = ch.colors && ch.colors.length ? ch.colors : null;
    return game.palette.filter(function (p) { return !list || list.indexOf(p.id) >= 0; });
  }
  /* Действующий цвет персонажа в главе n: выбор игрока или мастера (если разрешён в главе и не сброшен), иначе цвет по умолчанию; '' — как у главы.
     my: {color, colorCh, colorBy} из состояния телефона. */
  function effColor(game, acc, n, my) {
    n = n || 1;
    var ch = game.chapters[n - 1] || {};
    my = my || {};
    if (ch.force) return ch.force;
    var pick = my.color;
    if (pick && my.colorBy !== 'master') {
      if (ch.colorReset && (my.colorCh || 1) < n) pick = '';
      else if (!/^#/.test(pick) && allowedColors(game, n).every(function (p) { return p.id !== pick; })) pick = '';
    }
    if (pick && my.colorBy === 'master' && ch.colorReset && (my.colorCh || 1) < n) pick = '';
    return pick || colorCfg(acc, n).def || '';
  }
  /* Меняет ли персонаж цвет в любое время (кнопка ◐): по главам в «Аккаунтах»; мастер включает и выключает на время главы. */
  function anyColor(game, acc, n, my) {
    my = my || {};
    if (my.colorAny && my.colorAny.ch === (n || 1)) return !!my.colorAny.v;
    return !!colorCfg(acc, n).any && !(game.chapters[(n || 1) - 1] || {}).force;
  }
  function themeFor(game, acc, n, my) {
    var ch = game.chapters[(n || 1) - 1] || game.chapters[0];
    return colorTheme(ch.theme, paletteColor(game, effColor(game, acc, n, my)));
  }
  /* Каким цветом сообщения персонажа видят другие: закреплённый в главе — всегда; иначе — его цвет, если в главе включено «цветом отправителя». */
  function sendColor(game, acc, n, my) {
    var cfg = colorCfg(acc, n);
    if (cfg.pin) return paletteColor(game, cfg.pin);
    var ch = game.chapters[(n || 1) - 1] || {};
    if (!ch.senderColor) return '';
    return paletteColor(game, effColor(game, acc, n, my)) || colorTheme(ch.theme).text;
  }

  function themeCss(theme) {
    var t = Object.assign({}, DEFAULT_THEME, theme || {});
    var mix = '';
    Object.keys(MIX).forEach(function (k) { MIX[k].forEach(function (pc) { mix += '--' + k + '-' + pc + ':' + rgba(t[k], pc) + ';'; }); });
    return ':root{--bg:' + t.bg + ';--panel:' + t.panel + ';--text:' + t.text + ';--dim:' + t.dim +
      ';--accent:' + t.accent + ';--warn:' + t.warn + ';--font:' + (FONTS[t.font] || FONTS.mono) + ';' + mix + '}';
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

  /* Функции приложения, которые включаются аккаунту (вкладки сверх «Данные», «Код», «Сканер»). */
  /* ---------- голос (П-58) ---------- */
  function voiceNorm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\[\] ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  var DIGIT_WORDS = { 'ноль': '0', 'нуль': '0', 'один': '1', 'одна': '1', 'два': '2', 'две': '2', 'три': '3', 'четыре': '4', 'пять': '5',
    'шесть': '6', 'семь': '7', 'восемь': '8', 'девять': '9' };
  /* Сообщения центру — так же, как их шлёт doActions плеера (таймеры для отложенных). */
  function wireMessages(net) {
    return net.map(function (m) {
      var o = clone(m);
      var delay = o.delay;
      delete o.delay; delete o.local;
      return delay ? { t: 'timer', id: '', delay: delay, emit: [o] } : o;
    });
  }
  /* Что слушает телефон этого персонажа сейчас: фразы кодов, доступных ему в этой главе.
     net — готовые сообщения центру (служба шлёт их сама, даже с погашенным экраном); null — код с ограничениями
     или подписями, его целиком выполняет приложение. every — мс. */
  function voiceConfig(game, state) {
    var out = { phrases: [], digits: game.voice.digits !== false, minConf: game.voice.minConf, sens: game.voice.sens };
    if (!state.account) return out;
    game.codes.forEach(function (c) {
      var text = voiceNorm(c.voice);
      if (!text || c.app) return;
      if ((state.chapter || 1) < c.chapter) return;
      var v = pickVariant(c, state);
      if (!v && !allowed(c.who, state.account)) return;
      var r = { kind: 'code', code: c, ok: true, variant: v };
      var net = codeNeeds(r) ? null : wireMessages(expandActions(game, c.actions, { self: state.account, now: '{{now}}' }).net);
      out.phrases.push({ id: c.id, text: text, max: c.voiceMax || 0, every: (c.voiceEvery || 0) * 1000, net: net });
    });
    return out;
  }
  /* Разбор услышанного текста (в браузере — проба голоса; на телефоне то же делает служба на Java):
     {code: id} — фраза (длинная важнее короткой), {digits: '123'} — одни цифры, null — ничего. */
  function voiceMatch(cfg, text) {
    var w = voiceNorm(text).split(' ').filter(function (x) { return x; });
    if (!w.length) return null;
    var list = cfg.phrases.slice().sort(function (a, b) { return b.text.split(' ').length - a.text.split(' ').length; });
    for (var i = 0; i < list.length; i++) {
      var p = list[i].text.split(' ');
      for (var k = 0; k + p.length <= w.length; k++) {
        if (p.every(function (x, j) { return w[k + j] === x; })) return { code: list[i].id, phrase: list[i] };
      }
    }
    if (cfg.digits && w.every(function (x) { return DIGIT_WORDS[x]; })) return { digits: w.map(function (x) { return DIGIT_WORDS[x]; }).join('') };
    return null;
  }

  var MODULES = [
    { id: 'chat', name: 'Связь', tab: 'СВЯЗЬ', hint: 'вкладка «СВЯЗЬ»: личные сообщения, общий канал, сообщения системы (нужна сеть)' },
    { id: 'anon', name: 'Анонимная отправка', sub: 'chat', hint: 'в «СВЯЗИ» кнопка «?»: получатель видит не имя, а «неизвестный» (мастер видит, кто писал)' },
    { id: 'delay', name: 'Отложенная отправка', sub: 'chat', hint: 'в «СВЯЗИ» кнопка «⏱»: сообщение уйдёт через 1–60 минут (мастер может удалить)' },
    // П-45: приём SSTV на телефонах убран (ненадёжен на разных телефонах). Старые пакеты открываются, функция не показывается.
    { id: 'sstv', name: 'Приём сигналов', tab: 'СИГНАЛ', retired: true, hint: 'убрано (П-45)' },
    { id: 'photo', name: 'Камера-улика', tab: 'КАМЕРА', hint: 'вкладка «КАМЕРА» (снимки, галерея, своя и фронтальная камера) и кнопка ▣ в «СВЯЗИ»: снимок сразу в чат' },
    { id: 'notes', name: 'Заметки', tab: 'ЗАМЕТКИ', hint: 'вкладка «ЗАМЕТКИ»: свои записи игрока на телефоне' },
    { id: 'voice', name: 'Голос', hint: 'микрофон слушает ключевые фразы (у кодов) и цифры; режим — в карточке «Голос»; 🎙 в шапке' }
  ];
  var RETIRED = {};
  MODULES.forEach(function (m) { if (m.retired) RETIRED[m.id] = true; });
  var MOD_OFF = [['hidden', 'скрыта'], ['denied', '«НЕТ ДОСТУПА»'], ['broken', '«ПОВРЕЖДЕНО», чинится кодом']];

  root.SG = {
    MODULES: MODULES,
    MODULES_ON: MODULES.filter(function (m) { return !m.retired; }),
    DEFAULT_CHAT: DEFAULT_CHAT,
    DEFAULT_VOICE: DEFAULT_VOICE,
    VOICE_MODES: VOICE_MODES,
    voiceNorm: voiceNorm,
    voiceConfig: voiceConfig,
    voiceMatch: voiceMatch,
    MOD_OFF: MOD_OFF,
    ACTIONS: ACTIONS,
    normCode: normCode,
    pickVariant: pickVariant,
    codeNeeds: codeNeeds,
    codeOutcome: codeOutcome,
    moduleState: moduleState,
    appsFor: appsFor,
    expandActions: expandActions,
    voteMessages: voteMessages,
    centerRules: centerRules,
    jam: jam,
    garble: garble,
    rng: rng,
    FORMAT: FORMAT,
    DEFAULT_THEME: DEFAULT_THEME,
    DEFAULT_PALETTE: DEFAULT_PALETTE,
    hexOk: hexOk,
    rgbOf: rgbOf,
    paletteColor: paletteColor,
    colorTheme: colorTheme,
    colorCfg: colorCfg,
    allowedColors: allowedColors,
    effColor: effColor,
    themeFor: themeFor,
    sendColor: sendColor,
    anyColor: anyColor,
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
