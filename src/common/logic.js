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
    inactive: 'КОД ПОКА НЕ АКТИВЕН',
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
  var DEFAULT_CHAT = { master: 'Руководитель', masterProf: '', anon: 'НЕИЗВЕСТНЫЙ', noPaste: true, delayMax: 60, masterContact: false, auto: true,
    bossColor: '', anonColor: '' };   // цвет сообщений Руководителя (и «Системы» с пульта) и анонимных у всех: '' — цветом читающего (П-51)

  /* Голос (П-58): общие настройки. minConf — уверенность распознавания (0…1), digits — цифры голосом,
     sens — детектор голоса: 0 низкая, 1 обычная, 2 высокая чувствительность. */
  var DEFAULT_VOICE = { minConf: 0.6, digits: true, sens: 1, comment: '', unknown: '' };
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
      voice: clone(DEFAULT_VOICE),
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
      shared: [],
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
    normHeader(g);
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
      // номер сотрудника на терминале Twine (сессия П9): терминал шлёт этому персонажу по адресу num:<номер>
      a.num = String(a.num == null ? '' : a.num).trim();
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
      // П17: заметки с начала игры («Заметки» персонажа: памятка, список проверки тестировщика)
      a.notes = Array.isArray(a.notes) ? a.notes.filter(function (n) { return n && typeof n.text === 'string'; }).map(function (n, i) { return { id: n.id || 'pn' + (i + 1), text: n.text }; }) : [];
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
    /* П13 (Т4-3): общие переменные терминала и телефонов — {name, label, value}; value — начальное значение. */
    g.shared = Array.isArray(g.shared) ? g.shared : [];
    g.shared = g.shared.filter(function (v) { return v && typeof v.name === 'string' && v.name.replace(/^\$/, ''); });
    g.shared.forEach(function (v) {
      v.name = v.name.replace(/^\$/, '');
      v.label = v.label || '';
      if (v.value === undefined) v.value = 0;
    });
    // П15: пределы общих переменных — [{var, min, max}] ('' — нет предела); центр не даёт выйти за предел
    g.limits = (Array.isArray(g.limits) ? g.limits : []).filter(function (l) { return l && l.var; }).map(function (l) {
      return { var: String(l.var).replace(/^\$/, ''), min: limNum(l.min), max: limNum(l.max) };
    });
    g.rules = Array.isArray(g.rules) ? g.rules : [];
    g.rules.forEach(function (r) {
      r.id = r.id || uid('e');
      r.name = r.name || '';
      r.on = r.on || 'event';
      r.event = r.event || '';
      if (r.on === 'var') { r.var = String(r.var || '').replace(/^\$/, ''); r.op = r.op || '='; if (r.value === undefined) r.value = ''; }
      // П15: «общая переменная упёрлась в предел» (game.limits): side — max / min / any
      if (r.on === 'limit') { r.var = String(r.var || '').replace(/^\$/, ''); r.side = r.side === 'min' || r.side === 'any' ? r.side : 'max'; }
      // П16 (основа 2): событие на самом телефоне — встряхнули, экраном вниз/вверх, экран заблокирован дольше N с…; выполняет телефон
      if (r.on === 'phone') {
        r.sensor = PHONE_SENSORS.some(function (x) { return x[0] === r.sensor; }) ? r.sensor : 'shake';
        r.seconds = Math.max(0, +r.seconds || 0);
        r.every = Math.max(0, +r.every || 0);
        r.who = Array.isArray(r.who) ? r.who : [];
        r.screen = r.screen === 'on' || r.screen === 'off' ? r.screen : '';
      }
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
    c.term = !!c.term;                                              // фраза «для терминала» (П-60): слышит любой телефон с голосом, молча передаёт терминалу
    // П14 (Т4-5 А): «когда» — код срабатывает, только если верны все условия по общим переменным; иначе «нет доступа» и whenText
    c.when = (Array.isArray(c.when) ? c.when : []).filter(function (w) { return w && w.var; }).map(function (w) {
      return { var: String(w.var).replace(/^\$/, ''), op: w.op || '>=', value: w.value == null ? '' : String(w.value) };
    });
    c.whenText = c.whenText || '';
    // П15 (Т6-7 Б): условие не выполнено — '' «нет доступа» / 'wrong' как неверный код / 'inactive' «код пока не активен»
    c.whenMode = c.whenMode === 'wrong' || c.whenMode === 'inactive' ? c.whenMode : '';
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

  /* ---------- П14 (Т4-6 Б): шапка и меню приложения ----------
     game.header: title / sub — строки шапки (пусто — имя и профессия; {{имя}} — общая переменная, {name} {prof} {chapter});
     chapter — показывать главу справа; items — показатели (общая переменная: подпись или без, числом или квадратиками);
     infoTitle и info — окно по нажатию на шапку (разделы: заголовок, текст, кому, с главы).
     game.menu: [{tab, label, hidden}] — порядок, названия и скрытые вкладки нижнего меню (пусто — как было). */
  var MENU_TABS = [['data', 'ДАННЫЕ'], ['code', 'КОД'], ['scan', 'СКАНЕР'], ['chat', 'СВЯЗЬ'], ['apps', 'ПРИБОРЫ'], ['photo', 'КАМЕРА'], ['notes', 'ЗАМЕТКИ']];
  /* П16 (Т6-8 Б): нажатие на часть шапки — auto (по месту: имя — досье, глава — окно главы, показатель — сведения о нём),
     info (общая сводка), text (своё окно), block (блок данных), none (ничего). */
  var TAP_KINDS = [['auto', 'по месту (досье / глава / сведения о показателе)'], ['info', 'общая сводка'], ['text', 'своё окно (заголовок и текст)'], ['block', 'блок данных'], ['none', 'ничего']];
  function normTap(t) {
    t = Object.assign({ kind: 'auto', title: '', text: '', block: '' }, t || {});
    if (!TAP_KINDS.some(function (k) { return k[0] === t.kind; })) t.kind = 'auto';
    return { kind: t.kind, title: String(t.title || ''), text: String(t.text || ''), block: String(t.block || '') };
  }
  function normHeader(g) {
    var h = g.header = Object.assign({ title: '', sub: '', chapter: true, infoTitle: '', items: [], info: [], chapters: [], taps: {} }, g.header || {});
    h.chapter = h.chapter !== false;
    // П16 (Т6-8 Б): что открывается по нажатию на имя и на главу (у показателя — своё, it.tap)
    h.taps = { who: normTap((h.taps || {}).who), chapter: normTap((h.taps || {}).chapter) };
    h.items = (Array.isArray(h.items) ? h.items : []).map(function (it) {
      it = Object.assign({ var: '', label: '', show: 'num', max: 0, chapter: 1, who: [], unit: '', low: '', lowColor: '', look: 'cell', fit: false, over: false }, it || {});
      it.id = it.id || uid('h');
      it.var = String(it.var || '').replace(/^\$/, '');
      it.show = it.show === 'cells' ? 'cells' : 'num';
      it.max = Math.max(0, Math.min(CELLS_MAX, +it.max || 0));
      it.chapter = +it.chapter || 1;
      it.who = Array.isArray(it.who) ? it.who : [];
      // П15: Т6-4 Б — ниже порога тревожным цветом и мигают; шкала — квадратики или черточки, по ширине экрана, перегрузка
      it.low = limNum(it.low);
      it.lowColor = hexOk(it.lowColor) || '';
      it.look = it.look === 'bar' ? 'bar' : 'cell';
      it.fit = !!it.fit;
      it.over = !!it.over;
      it.tap = normTap(it.tap);
      // П16: слои перезаполнения — 1-й (значения 1…max), 2-й (max+1…2·max)…; предел переменной — max × число слоёв
      it.layers = (Array.isArray(it.layers) ? it.layers : []).slice(0, LAYERS_MAX).map(function (l) {
        l = Object.assign({ fx: 'fill', color: '' }, l || {});
        return { fx: LAYER_FX.some(function (f) { return f[0] === l.fx; }) ? l.fx : 'fill', color: hexOk(l.color) || '' };
      });
      return it;
    });
    // П15 (Т6-3 Б): у главы свои строки шапки и заголовок сводки — с главы N (пусто — как в общей шапке)
    h.chapters = (Array.isArray(h.chapters) ? h.chapters : []).map(function (c) {
      c = Object.assign({ chapter: 1, title: '', sub: '', infoTitle: '', about: '' }, c || {});
      c.id = c.id || uid('hc');
      c.chapter = +c.chapter || 1;
      return c;
    });
    h.info = (Array.isArray(h.info) ? h.info : []).map(function (s) {
      s = Object.assign({ title: '', text: '', chapter: 1, who: [] }, s || {});
      s.id = s.id || uid('i');
      s.chapter = +s.chapter || 1;
      s.who = Array.isArray(s.who) ? s.who : [];
      return s;
    });
    var seen = {};
    g.menu = (Array.isArray(g.menu) ? g.menu : []).filter(function (m) {
      if (!m || seen[m.tab] || !MENU_TABS.some(function (t) { return t[0] === m.tab; })) return false;
      return (seen[m.tab] = true);
    }).map(function (m) {
      // П15 (Т6-5 Б): вкладка — с главы и кому
      return { tab: m.tab, label: String(m.label || ''), hidden: !!m.hidden, chapter: +m.chapter || 1, who: Array.isArray(m.who) ? m.who : [] };
    });
  }
  var LAYERS_MAX = 20;
  /* П16: эффекты слоёв шкалы: обычный (цвет интерфейса), свой цвет, сбой, свечение растёт, мигание. */
  var LAYER_FX = [['fill', 'обычный цвет'], ['color', 'свой цвет'], ['glitch', 'деления сбоят'], ['glow', 'растёт свечение'], ['blink', 'мигают']];
  var CELLS_MAX = 200;
  function limNum(v) {
    if (v === '' || v == null) return '';
    var n = Number(String(v).trim().replace(',', '.'));
    return isFinite(n) ? n : '';
  }
  /* Вкладка нижнего меню скрыта персонажу: «Скрыть» у всех, до главы или не «кому» (П15). */
  function menuOff(game, state, tab) {
    var m = (game.menu || []).filter(function (x) { return x.tab === tab; })[0];
    if (!m) return false;
    return !!m.hidden || (state.chapter || 1) < (m.chapter || 1) || !allowed(m.who || [], state.account);
  }
  /* Предел общей переменной (П15): {min, max} или null. */
  function limitOf(game, name) {
    name = String(name || '').replace(/^\$/, '');
    var l = (game.limits || []).filter(function (l) { return l.var === name && (l.min !== '' || l.max !== ''); })[0] || null;
    var lm = layerMax(game, name);
    if (lm === null) return l;
    if (!l) return { var: name, min: '', max: lm, layers: true };
    return { var: name, min: l.min, max: l.max === '' ? lm : Math.min(l.max, lm), layers: l.max === '' || lm < l.max };
  }
  /* П16: предел по слоям шкалы — деления × число слоёв (у нескольких шкал одной переменной — наибольший); нет слоёв — null. */
  function layerMax(game, name) {
    var m = null;
    ((game.header || {}).items || []).forEach(function (it) {
      if (it.var !== name || it.show !== 'cells' || !it.max || !(it.layers || []).length) return;
      var x = it.max * it.layers.length;
      if (m === null || x > m) m = x;
    });
    return m;
  }
  /* Все переменные с пределом (из «Пределов» и из слоёв шкалы). */
  function limitedVars(game) {
    var out = [];
    (game.limits || []).forEach(function (l) { if (out.indexOf(l.var) < 0) out.push(l.var); });
    ((game.header || {}).items || []).forEach(function (it) { if (it.var && (it.layers || []).length && out.indexOf(it.var) < 0) out.push(it.var); });
    return out;
  }
  /* Значение в пределах; side — 'max' / 'min', если упёрлось (для телефона без связи — как считает центр). */
  function clampVar(game, name, v) {
    var l = limitOf(game, name);
    if (!l || typeof v !== 'number') return { value: v, side: '' };
    if (l.max !== '' && v > l.max) return { value: l.max, side: 'max' };
    if (l.min !== '' && v < l.min) return { value: l.min, side: 'min' };
    return { value: v, side: '' };
  }
  /* Нижнее меню по порядку: [{tab, label, hidden}] — все вкладки, заданные в game.menu — первыми. */
  function menuTabs(game) {
    var out = (game.menu || []).map(function (m) { return { tab: m.tab, label: m.label, hidden: !!m.hidden, chapter: m.chapter || 1, who: (m.who || []).slice() }; });
    MENU_TABS.forEach(function (t) { if (!out.some(function (m) { return m.tab === t[0]; })) out.push({ tab: t[0], label: '', hidden: false, chapter: 1, who: [] }); });
    out.forEach(function (m) { var d = MENU_TABS.filter(function (t) { return t[0] === m.tab; })[0]; m.def = d[1]; m.text = m.label || d[1]; });
    return out;
  }
  /* Что видно в шапке персонажу: показатели и разделы окна (кому, с главы). */
  function headerFor(game, state) {
    var h = game.header || {}, a = byId(game.accounts, state.account) || {}, n = state.chapter || 1;
    function vis(x) { return n >= (x.chapter || 1) && allowed(x.who || [], state.account); }
    var ch = game.chapters[n - 1];
    function fill(t) {
      return fillVars(String(t || ''), game, state.vars).replace(/\{name\}/g, a.name || '').replace(/\{prof\}/g, a.profession || '').replace(/\{chapter\}/g, ch ? ch.name : '');
    }
    var vals = sharedValues(game, state.vars);
    var items = (h.items || []).filter(vis).filter(function (it) { return sharedVar(game, it.var); }).map(function (it) {
      var v = vals[it.var], sv = sharedVar(game, it.var), cells = it.show === 'cells' ? cellsOf(v, it.max) : null;
      var nv = Number(String(v == null ? '' : v).replace(',', '.'));
      var num = cells && it.max && typeof v !== 'boolean' && isFinite(nv);
      // П16: перегрузка — сбоит столько делений, на сколько превышено; слои — у каждого деления свой слой (-1 — погасло)
      var ly = num && (it.layers || []).length ? layerCells(nv, it.max, it.layers) : null;
      var overN = !ly && it.over && num && nv > it.max ? Math.min(it.max, Math.round(nv - it.max)) : 0;
      if (ly) cells = ly.cells.map(function (k) { return k >= 0; });
      return { id: it.id, var: it.var, label: it.label, show: it.show, max: it.max, unit: it.unit || '', value: v, name: sv.label || it.var,
        cells: cells, look: it.look || 'cell', fit: !!it.fit, overN: overN, layer: ly ? ly.layer : 0, layerOf: ly ? ly.cells : null,
        layers: ly ? it.layers : null, glow: ly ? ly.glow : 0, tap: tapFill(it.tap), limit: limitOf(game, it.var), low0: it.low,
        over: overN > 0,
        low: it.low !== '' && it.low != null && typeof v !== 'boolean' && isFinite(nv) && v !== '' && v != null && nv < it.low,
        lowColor: it.lowColor || '',
        text: v === true ? 'да' : v === false ? 'нет' : v == null ? '' : String(v) + (it.max && it.show === 'num' ? '/' + it.max : '') + (it.unit ? ' ' + it.unit : '') };
    });
    // П15 (Т6-3 Б): строки главы (последняя «с главы» не позже нынешней); пустое поле — из общей шапки
    var hc = (h.chapters || []).filter(function (c) { return (c.chapter || 1) <= n; }).sort(function (x, y) { return x.chapter - y.chapter; });
    var own = {};
    hc.forEach(function (c) { ['title', 'sub', 'infoTitle', 'about'].forEach(function (k) { if (c[k]) own[k] = c[k]; }); });
    function tapFill(t) { t = t || normTap(); return { kind: t.kind, title: fill(t.title), text: fill(t.text), block: t.block }; }
    var taps = h.taps || {};
    var tt = own.title || h.title, st = own.sub || h.sub, it2 = own.infoTitle || h.infoTitle;
    return { title: fill(tt) || a.name || '—', sub: tt || st ? fill(st) : (a.profession || ''), chapter: h.chapter !== false ? (ch ? ch.name : '') : '',
      items: items, infoTitle: fill(it2) || 'СВОДКА', about: fill(own.about), chapterName: ch ? ch.name : '',
      taps: { who: tapFill(taps.who), chapter: tapFill(taps.chapter) }, profile: (a.items || []).length > 0,
      info: (h.info || []).filter(vis).map(function (s) { return { title: fill(s.title), text: fill(s.text) }; }) };
  }
  /* П16: слои шкалы. Значение v при делениях max: слой L = ⌈v/max⌉−1 (не больше последнего), в нём заполнено c делений;
     остальные — полностью в предыдущем слое (у первого — погасшие). glow — доля заполнения слоя (для «свечение растёт»). */
  function layerCells(v, max, layers) {
    var n = layers.length, total = max * n;
    v = Math.max(0, Math.min(total, Math.round(v)));
    var L = v <= 0 ? 0 : Math.min(n - 1, Math.ceil(v / max) - 1), c = v - L * max, out = [];
    for (var i = 0; i < max; i++) out.push(i < c ? L : L - 1);
    return { cells: out, layer: L, glow: c / max };
  }
  /* Квадратики: [true, true, false…] — горящие по значению (да/нет — один квадратик); max 0 — по значению, не больше 10. */
  function cellsOf(v, max) {
    if (v === true || v === false) return [v];
    var n = Number(String(v == null ? '' : v).replace(',', '.'));
    if (!isFinite(n)) n = 0;
    var m = Math.min(CELLS_MAX, max || Math.max(1, Math.min(10, Math.ceil(n))));
    var out = [];
    for (var i = 0; i < m; i++) out.push(i < Math.round(n));
    return out;
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
      if (ok && !whenOk(game, code, state.vars)) return code.whenMode === 'wrong' ? { kind: 'wrong' } : { kind: 'code', code: code, ok: false, cond: false, variant: v };
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
    if (r.cond === false) return { kind: 'denied', title: c.whenMode === 'inactive' ? T.inactive : T.denied, text: c.whenText || whenWhy(game, c, state.vars), blocks: [], fresh: [], actions: [] };
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
    event: 'Событие (для правил и терминала)', countdown: 'Обратный отсчёт', vote: 'Голосование', color: 'Цвет интерфейса',
    torch: 'Вспышка (фонарик)', beep: 'Короткий сигнал'
  };
  /* П16 (основа 2): события телефона — условие правила «на телефоне» (выполняет сам телефон). seconds — «дольше N с». */
  var PHONE_SENSORS = [['shake', 'встряхнули'], ['facedown', 'положили экраном вниз'], ['faceup', 'перевернули экраном вверх'], ['flip', 'перевернули (вниз или вверх)'],
    ['locked', 'экран заблокирован дольше N с (срабатывает при разблокировке)'], ['unlocked', 'экран не блокировали дольше N с'],
    ['away', 'экран включён, но игрок не в приложении дольше N с (свернул, смотрит другое)'], ['photo', 'сделан снимок камерой'], ['scan', 'отсканирован QR']];
  // П17 (Т8-6 Б): когда работает правило «на самом телефоне»
  var PHONE_SCREEN = [['', 'всегда'], ['on', 'только при включённом экране'], ['off', 'только при выключенном экране']];
  /* П17: что выполняет служба Android (и в фоне): правила «на телефоне» этого персонажа в этой главе, кроме снимка и QR.
     net — готовые сообщения центру; local — что сделать на этом телефоне (вспышку, сигнал и шторку служба делает сама,
     остальное — приложение по событию t:'phone'). seconds — с, every — мс. */
  function phoneConfig(game, state) {
    var out = { rules: [] };
    if (!state || !state.account) return out;
    (game.rules || []).forEach(function (r) {
      if (r.on !== 'phone' || r.sensor === 'photo' || r.sensor === 'scan') return;
      if (r.who && r.who.length && r.who.indexOf(state.account) < 0) return;
      if (r.chapters && r.chapters.length && r.chapters.indexOf(state.chapter || 1) < 0) return;
      var x = expandActions(game, r.actions, { self: state.account, now: '{{now}}' });
      out.rules.push({ id: r.id, sensor: r.sensor, seconds: r.seconds || 0, every: (r.every || 0) * 1000, screen: r.screen || '', net: wireMessages(x.net), local: x.local });
    });
    return out;
  }

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
      else if (a.type === 'torch') route(a, 'torch', { n: Math.max(1, Math.min(20, +a.n || 3)) });   // П16: мигнуть вспышкой N раз
      else if (a.type === 'beep') route(a, 'beep', { sound: a.sound || 'beep', vibrate: a.vibrate !== false });   // П16: короткий сигнал
      else if (a.type === 'color') route(a, 'color', a.mode === 'set' ? { set: a.color || '' } : a.mode === 'any-on' ? { any: true } : a.mode === 'any-off' ? { any: false } : { offer: true });
      else if (a.type === 'alarm') {
        var al = byId(game.alarms, a.alarm) || {};
        var v = a.on === false ? { on: false, at: now } : { on: true, id: al.id || a.alarm, title: al.title || game.texts.alarm, text: al.text || '',
          red: al.red !== false, full: al.full !== false, siren: al.siren !== false, vibrate: al.vibrate !== false, torch: al.torch !== false, jam: al.jam !== false, at: now };
        out.net.push({ t: 'set', key: 'alarm', value: v, local: true });
      } else if (a.type === 'chapter') out.net.push({ t: 'set', key: 'chapter', value: { n: +a.n || 1, at: now }, local: true });
      else if (a.type === 'term') {
        // П13 (Т4-3): общая переменная — состояние центра «var:имя» (видят телефоны и терминал); иначе — только терминалу
        var vn = String(a.name || '').replace(/^\$/, ''), sv = sharedVar(game, vn), add = a.op === 'add';
        var n = add ? Number(String(a.value).replace(',', '.')) || 0 : termValue(a.value);
        if (sv) {
          var cur = ctx.vars && ctx.vars.hasOwnProperty(vn) ? ctx.vars[vn] : sv.value;
          out.net.push(add ? { t: 'set', key: 'var:' + vn, add: n, base: num(sv.value), value: clampVar(game, vn, num(cur) + n).value } : { t: 'set', key: 'var:' + vn, value: clampVar(game, vn, n).value });
        } else {
          var o = {};
          o[vn] = n;
          out.net.push({ t: 'msg', to: ['role:terminal'], kind: 'term', body: add ? { add: o } : { set: o } });
        }
      }
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

  function sharedVar(game, name) {
    name = String(name || '').replace(/^\$/, '');
    return (game.shared || []).filter(function (v) { return v.name === name; })[0] || null;
  }
  function num(v) { var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }

  /* Значения общих переменных (П13): из центра (vals — {имя: значение}), иначе начальные из пакета. */
  function sharedValues(game, vals) {
    var out = {};
    (game.shared || []).forEach(function (v) { out[v.name] = vals && vals.hasOwnProperty(v.name) ? vals[v.name] : v.value; });
    return out;
  }
  /* «{{имя}}» в тексте → значение общей переменной; да/нет — «да» / «нет»; неизвестное имя остаётся как есть. */
  function fillVars(text, game, vals) {
    if (!text || String(text).indexOf('{{') < 0 || !game || !(game.shared || []).length) return text;
    var v = sharedValues(game, vals);
    return String(text).replace(/\{\{\s*\$?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, function (all, name) {
      if (!v.hasOwnProperty(name)) return all;
      var x = v[name];
      return x === true ? 'да' : x === false ? 'нет' : x == null ? '' : String(x);
    });
  }

  /* Сравнение общей переменной с числом или текстом (как в центре, SgCenter.test): числа — числами,
     остальное — текстом без регистра и пробелов по краям (только = и !=); да/нет — «да»/«нет» (и true/false, 1/0). */
  function varTest(v, op, w) {
    op = op || '=';
    if (v === true || v === false) {
      var t = String(w == null ? '' : w).trim().toLowerCase();
      var yes = t === 'да' || t === 'true' || t === '1', no = t === 'нет' || t === 'false' || t === '0' || t === '';
      if (op === '=' ) return v ? yes : no;
      if (op === '!=') return v ? !yes : !no;
      v = v ? 1 : 0;
    }
    var x = Number(String(v == null ? '' : v).trim().replace(',', '.')), y = Number(String(w == null ? '' : w).trim().replace(',', '.'));
    var nx = v !== '' && v != null && isFinite(x), ny = w !== '' && w != null && isFinite(y);
    if (nx && ny) {
      if (op === '>') return x > y;
      if (op === '>=') return x >= y;
      if (op === '<') return x < y;
      if (op === '<=') return x <= y;
      if (op === '!=') return x !== y;
      return x === y;
    }
    var a = String(v == null ? '' : v).trim().toLowerCase(), b = String(w == null ? '' : w).trim().toLowerCase();
    if (op === '!=') return a !== b;
    if (op === '=') return a === b;
    return false;
  }
  /* Условия кода «когда» (Т4-5): все верны? vals — значения центра ({имя: значение}). */
  function whenOk(game, code, vals) {
    if (!code.when || !code.when.length) return true;
    var v = sharedValues(game, vals);
    return code.when.every(function (w) { return varTest(v[w.var], w.op, w.value); });
  }
  /* Почему «когда» не выполнено (ответ по умолчанию, П15): «Энергия: нужно не меньше 8, сейчас 5». */
  function whenWhy(game, code, vals) {
    var v = sharedValues(game, vals);
    var bad = (code.when || []).filter(function (w) { return !varTest(v[w.var], w.op, w.value); });
    return bad.map(function (w) {
      var sv = sharedVar(game, w.var), x = v[w.var], op = WHEN_OPS.filter(function (o) { return o[0] === (w.op || '='); })[0];
      var show = function (y) { return y === true ? 'да' : y === false ? 'нет' : y == null || y === '' ? '—' : String(y); };
      return (sv && sv.label || w.var) + ': нужно ' + (op ? op[1] : w.op) + ' ' + (w.value === '' ? '—' : w.value) + ', сейчас ' + show(x);
    }).join('\n');
  }
  var WHEN_OPS = [['>=', 'не меньше'], ['<=', 'не больше'], ['>', 'больше'], ['<', 'меньше'], ['=', 'равно'], ['!=', 'не равно']];

  /* Значение для переменной терминала: число — числом, да/нет — true/false, остальное — текстом. */
  function termValue(v) {
    if (typeof v !== 'string') return v;
    var t = v.trim();
    if (/^-?\d+(\.\d+)?$/.test(t.replace(',', '.'))) return Number(t.replace(',', '.'));
    if (/^(true|да|вкл)$/i.test(t)) return true;
    if (/^(false|нет|выкл)$/i.test(t)) return false;
    return v;
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
      else if (r.on === 'var' && r.var) {
        // П13 (Т4-3): общая переменная — когда условие станет верным (было ложным)
        var sv = sharedVar(game, r.var);
        list.push({ id: r.id, on: 'state', key: 'var:' + r.var, test: { op: r.op || '=', value: termValue(r.value) }, init: sv ? sv.value : null,
          chapters: r.chapters, emit: emit(r.actions) });
      }
      else if (r.on === 'limit' && r.var) list.push({ id: r.id, on: 'limit', key: 'var:' + r.var, side: r.side || 'max', chapters: r.chapters, emit: emit(r.actions) });
    });
    // П15: пределы общих переменных — центр не даёт выйти за них (и сообщает правилам «упёрлась в предел»)
    limitedVars(game).forEach(function (name) {
      var l = limitOf(game, name);
      if (!l || (l.min === '' && l.max === '')) return;
      var o = { id: 'lim-' + l.var, on: 'bounds', key: 'var:' + l.var, emit: [] };
      if (l.min !== '') o.min = l.min;
      if (l.max !== '') o.max = l.max;
      list.push(o);
    });
    // П16 (Т7-2): начальные значения общих переменных — центру, чтобы «{{имя}}» в уведомлении было числом и до первой записи
    (game.shared || []).forEach(function (v) {
      if (v.value !== undefined && v.value !== null && v.value !== '') list.push({ id: 'init-' + v.name, on: 'init', key: 'var:' + v.name, value: termValue(v.value), emit: [] });
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
      if (!c.opens.length && !c.answer && !c.actions.length && !c.variants.length && !c.term) warn('Код «' + label + '» ничего не открывает, без ответа и действий');
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
    // П13 (Т4-3): общие переменные
    var sharedSeen = {};
    (game.shared || []).forEach(function (v) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.name)) err('Общая переменная «' + v.name + '»: имя — латиница, цифры и «_»');
      if (sharedSeen[v.name]) err('Общая переменная «' + v.name + '» повторяется');
      sharedSeen[v.name] = 1;
    });
    ((game.header || {}).items || []).forEach(function (it, i) {
      if (!sharedVar(game, it.var)) err('Шапка, показатель ' + (i + 1) + (it.label ? ' «' + it.label + '»' : '') + ': общей переменной «' + (it.var || '') + '» нет');
      if (it.tap && it.tap.kind === 'block' && !byId(game.blocks, it.tap.block)) err('Шапка, показатель ' + (i + 1) + ': по нажатию открывается блок, которого нет');
    });
    var hidAll = game.menu && game.menu.length && MENU_TABS.every(function (t) { return game.menu.some(function (m) { return m.tab === t[0] && m.hidden; }); });
    if (hidAll) err('Меню: скрыты все вкладки');
    game.codes.forEach(function (c) {
      (c.when || []).forEach(function (w) {
        if (!sharedVar(game, w.var)) err('Код «' + (c.note || c.code || c.voice || '?') + '»: в условии «когда» общей переменной «' + w.var + '» нет');
      });
    });
    (game.limits || []).forEach(function (l) {
      if (!sharedVar(game, l.var)) err('Предел общей переменной «' + l.var + '»: такой общей переменной нет');
      else if (l.min !== '' && l.max !== '' && l.min > l.max) err('Предел общей переменной «' + l.var + '»: наименьшее больше наибольшего');
    });
    game.rules.forEach(function (r) {
      if (r.on === 'limit' && !sharedVar(game, r.var)) err('Правило «' + (r.name || r.var || '?') + '»: общей переменной «' + (r.var || '') + '» нет');
      else if (r.on === 'limit' && !limitOf(game, r.var)) warn('Правило «' + (r.name || r.var || '?') + '»: у переменной «' + r.var + '» нет предела — правило не сработает');
      if (r.on === 'var' && !sharedVar(game, r.var)) err('Правило «' + (r.name || r.var || '?') + '»: общей переменной «' + (r.var || '') + '» нет');
      if (r.on === 'phone' && !r.actions.length) warn('Правило «' + (r.name || '?') + '» (на телефоне): нет действий');
    });
    function varsIn(text, owner) {
      String(text || '').replace(/\{\{\s*\$?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, function (all, n) {
        if (!sharedVar(game, n)) warn(owner + ': {{' + n + '}} — нет такой общей переменной («Общее» → «Общие переменные»)');
        return all;
      });
    }
    game.blocks.forEach(function (b) { b.items.forEach(function (it) { if (it.type === 'text') varsIn(it.text, 'Блок «' + (b.title || '?') + '»'); }); });
    game.codes.forEach(function (c) {
      var label = c.note || c.code || c.voice || '?';
      [c.answer, c.whenText].concat(c.answers || [], (c.variants || []).map(function (v) { return v.answer; })).forEach(function (t) { varsIn(t, 'Код «' + label + '»'); });
    });
    var hh = game.header || {};
    [hh.title, hh.sub, hh.infoTitle].forEach(function (t) { varsIn(t, 'Шапка'); });
    (hh.chapters || []).forEach(function (c) { [c.title, c.sub, c.infoTitle].forEach(function (t) { varsIn(t, 'Шапка главы ' + c.chapter); }); });
    (hh.info || []).forEach(function (s) { varsIn((s.title || '') + ' ' + (s.text || ''), 'Шапка, раздел «' + (s.title || '?') + '»'); });
    game.notices.forEach(function (n) { varsIn((n.title || '') + ' ' + (n.text || ''), 'Уведомление «' + (n.name || n.title || '?') + '»'); });
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
      var mineToo = !!v || allowed(c.who, state.account);
      if (!mineToo && !c.term) return;
      var r = { kind: 'code', code: c, ok: true, variant: v };
      // с условием «когда» код целиком решает приложение (служба условий не знает)
      var net = !mineToo ? [] : codeNeeds(r) || (c.when && c.when.length) ? null : wireMessages(expandActions(game, c.actions, { self: state.account, now: '{{now}}' }).net);
      if (c.term && net) net = [termCodeMsg(game, c, state.account, true)].concat(net);
      // фраза для терминала — по умолчанию у одного телефона (кто первый спросил центр), чтобы терминал не получил её дважды
      out.phrases.push({ id: c.id, text: text, max: c.voiceMax || (c.term ? 1 : 0), every: (c.voiceEvery || 0) * 1000, net: net, term: c.term, mine: mineToo });
    });
    return out;
  }
  /* Подсказки к словам фразы (П9, ответ 12А): слова, которых модель не знает (список с телефона — game.voice.unknown),
     латиница, цифры, сокращения без гласных. → [{word, why}] */
  function voiceWordHints(game, text) {
    var unk = {};
    String((game.voice && game.voice.unknown) || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).forEach(function (w) { if (w) unk[w] = 1; });
    var out = [];
    String(text || '').split(/\s+/).forEach(function (raw) {
      var w = voiceNorm(raw);
      if (!w) return;
      if (unk[w]) out.push({ word: w, why: 'модель этого слова не знает — замените синонимом или другой формой (проверьте снова на телефоне)' });
      else if (/[a-z]/.test(w)) out.push({ word: w, why: 'латиница: модель русская — напишите по-русски, как слышится' });
      else if (/\d/.test(w)) out.push({ word: w, why: 'цифры в фразе: напишите словами («два», «сорок»); одни цифры распознаются и без фразы' });
      else if (w.length >= 3 && !/[аеиоуыэюя]/.test(w)) out.push({ word: w, why: 'похоже на сокращение: напишите, как произносят («эс тэ эл»), или замените словом' });
    });
    return out;
  }

  /* Сообщение терминалу «на телефоне ввели код / услышана фраза» (сессия П9, условие «пришло с телефона»). */
  function termCodeMsg(game, c, accId, voice) {
    var a = byId(game.accounts, accId) || {};
    return { t: 'msg', to: ['role:terminal'], kind: 'code', body: { code: String(c.code || ''), phrase: voiceNorm(c.voice), label: c.label || '',
      acc: accId || '', num: a.num || '', voice: !!voice } };
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
    termValue: termValue,
    sharedVar: sharedVar,
    MENU_TABS: MENU_TABS,
    normHeader: normHeader,
    menuTabs: menuTabs,
    headerFor: headerFor,
    cellsOf: cellsOf,
    varTest: varTest,
    whenOk: whenOk,
    whenWhy: whenWhy,
    menuOff: menuOff,
    limitOf: limitOf,
    clampVar: clampVar,
    CELLS_MAX: CELLS_MAX,
    LAYER_FX: LAYER_FX,
    PHONE_SENSORS: PHONE_SENSORS,
    PHONE_SCREEN: PHONE_SCREEN,
    phoneConfig: phoneConfig,
    TAP_KINDS: TAP_KINDS,
    normTap: normTap,
    LAYERS_MAX: LAYERS_MAX,
    layerCells: layerCells,
    layerMax: layerMax,
    WHEN_OPS: WHEN_OPS,
    sharedValues: sharedValues,
    fillVars: fillVars,
    termCodeMsg: termCodeMsg,
    voiceWordHints: voiceWordHints,
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
