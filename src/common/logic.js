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
      a.voiceMode = ['button', 'screen', 'always'].indexOf(a.voiceMode) >= 0 ? a.voiceMode : (a.modules.indexOf('voice') >= 0 ? 'always' : 'off');   // П26 (06, 154): по умолчанию — всегда в фоне
      // П17 (Т8-5 А): скрытые программы — функция есть, но вкладки не видно; код («Функция приложения» → «открыть скрытую») открывает её до выхода
      a.secret = Array.isArray(a.secret) ? a.secret : [];
      a.tester = !!a.tester;
      // П25 (06, 146): шпионаж текстом — «код прослушки» этого персонажа (его добывают в игре) и подмена (кого слышно на самом деле: id / 'random')
      a.spyCode = String(a.spyCode == null ? '' : a.spyCode).trim();
      a.spyFake = String(a.spyFake || '');
      a.hackFreq = String(a.hackFreq == null ? '' : a.hackFreq).trim();   // П25 (06, 148): «частота» телефона на шкале (подпись канала)   // П20 (Т16-2 А): тестировщик — у его заметок из пакета кнопка «Отправить мастеру»
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
      b.hidden = !!b.hidden;   // П17 (Т8-5 А): скрытый — открывается только кодом, в списке не виден
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
      a.hidden = !!a.hidden;   // П17 (Т8-5 А): скрытый прибор — открывается только кодом, после выхода не виден
      a.emptyText = a.emptyText || '';
      a.unknown = a.unknown || '';
      a.color = a.color || '';
      // П25 (06, 149): «держи ровно» — измерение идёт N с, пока телефон неподвижен (0 — сразу); строгость 1–3
      a.steady = Math.max(0, Math.min(60, +a.steady || 0));
      a.steadyLevel = [1, 2, 3].indexOf(+a.steadyLevel) >= 0 ? +a.steadyLevel : 2;
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
      normEvent(n);
    });
    // П20 (основа 4, Т18-3, Т21-2…4): бегущая строка — под шапкой; лента последних K событий по кругу; реклама по расписанию
    var tk = g.ticker = Object.assign({ speed: 60, color: '', k: 5, chapter: 1, who: [], adsEvery: 0, adsOrder: 'seq', ads: [] }, g.ticker || {});
    tk.speed = Math.max(10, Math.min(400, +tk.speed || 60));
    tk.color = hexOk(tk.color) || '';
    tk.k = Math.max(1, Math.min(20, Math.round(+tk.k || 5)));
    tk.chapter = +tk.chapter || 1;
    tk.who = Array.isArray(tk.who) ? tk.who : [];
    tk.adsEvery = Math.max(0, +tk.adsEvery || 0);
    tk.adsOrder = tk.adsOrder === 'random' ? 'random' : 'seq';
    tk.ads = Array.isArray(tk.ads) ? tk.ads.filter(function (x) { return typeof x === 'string'; }) : [];
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
      // П25 (06, 141): «0/1» и «не те буквы» растут сами: с start % на grow % в минуту до max %
      x.start = isFinite(+x.start) && x.start !== '' && x.start != null ? Math.max(0, Math.min(100, +x.start)) : 3;
      x.grow = isFinite(+x.grow) && x.grow !== '' && x.grow != null ? Math.max(0, Math.min(1000, +x.grow)) : 10;
      x.max = isFinite(+x.max) && x.max !== '' && x.max != null ? Math.max(0, Math.min(100, +x.max)) : 50;
    });
    /* П13 (Т4-3): общие переменные терминала и телефонов — {name, label, value}; value — начальное значение. */
    g.shared = Array.isArray(g.shared) ? g.shared : [];
    g.shared = g.shared.filter(function (v) { return v && typeof v.name === 'string' && v.name.replace(/^\$/, ''); });
    g.shared.forEach(function (v) {
      v.name = v.name.replace(/^\$/, '');
      v.label = v.label || '';
      if (v.value === undefined) v.value = 0;
      // П20 (Т12, Т20): «у каждого своя» — личная переменная: значение у каждого персонажа своё (ключ центра var:имя@id);
      // byAcc — своё начальное у персонажа (Т12-1 А), maxBy — свой максимум шкалы и предела (Т20-2 Б)
      v.personal = !!v.personal;
      v.byAcc = v.byAcc && typeof v.byAcc === 'object' && !Array.isArray(v.byAcc) ? v.byAcc : {};
      v.maxBy = v.maxBy && typeof v.maxBy === 'object' && !Array.isArray(v.maxBy) ? v.maxBy : {};
    });
    // П15: пределы общих переменных — [{var, min, max}] ('' — нет предела); центр не даёт выйти за предел
    g.limits = (Array.isArray(g.limits) ? g.limits : []).filter(function (l) { return l && l.var; }).map(function (l) {
      return { var: String(l.var).replace(/^\$/, ''), min: limNum(l.min), max: limNum(l.max) };
    });
    // П23 (Т32-1 А, П-81): окна «за N мин» из условий терминала — [{var, min, acc}] (acc '' — у каждого, у личной; у общей — одно окно).
    // Пишет «Опубликовать пакет» Twine (по sgPersonalWin в истории); центр считает их точно, как окна шапки и «когда».
    g.termWins = (Array.isArray(g.termWins) ? g.termWins : []).filter(function (w) { return w && w.var && +w.min > 0; }).map(function (w) {
      return { var: String(w.var).replace(/^\$/, ''), min: +w.min, acc: w.acc ? String(w.acc) : '' };
    });
    g.rules = Array.isArray(g.rules) ? g.rules : [];
    g.rules.forEach(function (r) {
      r.id = r.id || uid('e');
      r.name = r.name || '';
      r.on = r.on || 'event';
      r.event = r.event || '';
      if (r.on === 'var') { r.var = String(r.var || '').replace(/^\$/, ''); r.op = r.op || '='; if (r.value === undefined) r.value = ''; }
      // П20 (Т13): win — «за N минут» (сумма прибавлений за N мин; 0 — само значение); acc — у личной: '' — у любого (у каждого), id — у этого персонажа
      if (r.on === 'var' || r.on === 'limit') { r.win = Math.max(0, Math.min(WIN_MAX, +r.win || 0)); r.acc = typeof r.acc === 'string' ? r.acc : ''; }
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
    normSpy(g);
    normSpyKinds(g);
    // П26 (Т37-6 А): порог движения «в руках» (м/с²; дрожание между замерами датчика)
    g.handsThr = +g.handsThr > 0 ? Math.min(2, +g.handsThr) : 0.08;
    // П25 (06, 152): свои звуки приложения — mp3 из пакета на события, по главам, по желанию — свой у персонажа
    g.soundSet = (Array.isArray(g.soundSet) ? g.soundSet : []).filter(function (x) { return x && x.ev; }).map(function (x) {
      return { id: x.id || uid('snd'), ev: String(x.ev), file: String(x.file || ''), chapter: Math.max(1, +x.chapter || 1), who: Array.isArray(x.who) ? x.who : [] };
    });
    normHack(g);
    g.games = (Array.isArray(g.games) ? g.games : []).map(normGame);
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
    c.voiceScreen = !!c.voiceScreen;                                 // П26 (06, 154): только при включённом экране в приложении (по умолчанию — и в фоне)
    c.term = !!c.term;                                              // фраза «для терминала» (П-60): слышит любой телефон с голосом, молча передаёт терминалу
    // П14 (Т4-5 А): «когда» — код срабатывает, только если верны все условия по общим переменным; иначе «нет доступа» и whenText
    c.when = (Array.isArray(c.when) ? c.when : []).filter(function (w) { return w && w.var; }).map(function (w) {
      // П20: win — «за N минут»; acc — чья личная ('' — своя, id — чужая, Т12-3 А)
      return { var: String(w.var).replace(/^\$/, ''), op: w.op || '>=', value: w.value == null ? '' : String(w.value),
        win: Math.max(0, Math.min(WIN_MAX, +w.win || 0)), acc: typeof w.acc === 'string' ? w.acc : '' };
    });
    c.whenText = c.whenText || '';
    // П15 (Т6-7 Б): условие не выполнено — '' «нет доступа» / 'wrong' как неверный код / 'inactive' «код пока не активен»
    c.whenMode = c.whenMode === 'wrong' || c.whenMode === 'inactive' ? c.whenMode : '';
    // П20 (Т9-4, Т11-4 А, Т15): «После ввода» — '' по умолчанию (окно; только скрытый прибор или программа — сразу),
    // 'window' — показать окно ответа, 'now' — сразу открыть то, что открыл код (первое по порядку), без окна
    c.after = c.after === 'window' || c.after === 'now' ? c.after : '';
    // П31 (06, 170): кнопки — несколько вариантов действий на выбор после скана; у кнопки шаги по порядку
    c.buttons = (Array.isArray(c.buttons) ? c.buttons : []).map(normBtn);
    return c;
  }

  function normWhenList(a) {
    return (Array.isArray(a) ? a : []).filter(function (w) { return w && w.var; }).map(function (w) {
      return { var: String(w.var).replace(/^\$/, ''), op: w.op || '>=', value: w.value == null ? '' : String(w.value),
        win: Math.max(0, Math.min(WIN_MAX, +w.win || 0)), acc: typeof w.acc === 'string' ? w.acc : '' };
    });
  }
  /* П31 (06, 170): кнопка кода {id, label, steps: [{id, who, chapter, when, afterMin, game, level, text, opens, actions, doneText, notify}]}.
     Шаг открывается, когда пройден прошлый (и прошло afterMin минут с его прохождения), подходит «кому», глава и «когда»;
     действует последний открывшийся. Шаг с мини-игрой пройден после успеха, без игры — после нажатия. */
  function normBtnStep(x) {
    x = Object.assign({ who: [], chapter: 1, when: [], afterMin: 0, game: '', level: 1, text: '', opens: [], actions: [], doneText: '', notify: '' }, x || {});
    x.id = x.id || uid('bs');
    x.who = Array.isArray(x.who) ? x.who : [];
    x.chapter = Math.max(1, +x.chapter || 1);
    x.when = normWhenList(x.when);
    x.afterMin = Math.max(0, Math.min(1440, Math.round((+x.afterMin || 0) * 100) / 100));   // минуты (в проверках — доли)
    x.game = String(x.game || '');
    x.level = Math.max(1, Math.min(3, +x.level || 1));
    ['text', 'doneText', 'notify'].forEach(function (k) { x[k] = String(x[k] == null ? '' : x[k]); });
    x.opens = Array.isArray(x.opens) ? x.opens : [];
    x.actions = Array.isArray(x.actions) ? x.actions : [];
    return x;
  }
  function normBtn(b) {
    b = Object.assign({ label: '', steps: [] }, b || {});
    b.id = b.id || uid('bt');
    b.label = String(b.label || '');
    b.steps = (Array.isArray(b.steps) ? b.steps : []).map(normBtnStep);
    if (!b.steps.length) b.steps.push(normBtnStep({}));
    return b;
  }
  /* Какой шаг кнопки действует у персонажа acc. rec = запись телефона {done: {шаг: когда пройден}}; st = {chapter, vars}.
     {i, step} (i = -1 — кнопки не видно), wait — когда откроется следующий шаг по времени (0 — не ждём). */
  function btnNow(game, b, acc, st, rec, now) {
    var done = (rec && rec.done) || {}, cur = -1, wait = 0;
    st = st || {};
    for (var i = 0; i < b.steps.length; i++) {
      var s = b.steps[i];
      if (i > 0) {
        var pd = done[b.steps[i - 1].id];
        if (!pd) break;
        if (s.afterMin && now < pd + s.afterMin * 60000) { wait = pd + s.afterMin * 60000; break; }
      }
      if (s.who.length && s.who.indexOf(acc) < 0) break;
      if ((+st.chapter || 1) < s.chapter) break;
      if (!whenOk(game, s, st.vars || {}, acc)) break;
      cur = i;
    }
    return { i: cur, step: cur >= 0 ? b.steps[cur] : null, wait: wait };
  }

  /* П20 (основа 4): содержимое события (уведомления) — картинка, mp3, в бегущую строку, когда уходит, архив. */
  function normEvent(n) {
    n.img = typeof n.img === 'string' ? n.img : '';            // картинка из медиа пакета (Т18-4 А)
    n.video = typeof n.video === 'string' ? n.video : '';      // П25 (06, 152): видео mp4 из медиа пакета (в окне события; по нажатию — на весь экран)
    n.mp3 = typeof n.mp3 === 'string' ? n.mp3 : '';            // звук: при приходе — короткий сигнал, mp3 — по нажатию (Т21-5 А)
    n.playNow = !!n.playNow;                                    // «играть сразу» — mp3 при приходе (общие объявления)
    n.ticker = !!n.ticker;                                      // в бегущую строку (вместо окна)
    n.open = n.open !== false;                                  // нажатие на строку открывает событие целиком (Т21-1 А)
    n.repeat = Math.max(0, Math.min(99, Math.round(+n.repeat || 0)));   // проходов строки; 0 — пока не уберут (Т18-3 А)
    n.leaveMin = Math.max(0, +n.leaveMin || 0);                 // уходит из строки через N мин
    n.leaveOpen = !!n.leaveOpen;                                // … после открытия
    n.leaveChapter = !!n.leaveChapter;                          // … в конце главы (первое сработавшее; без настроек — вытесняется новыми, Т21-7 А)
    n.save = n.save !== false;                                  // открытое — в «Данных» (Т21-8 А); галочка «не сохранять» — save: false
    n.folder = typeof n.folder === 'string' ? n.folder : '';    // своя папка ('' — «События»)
    return n;
  }
  var EVENT_KEYS = ['img', 'video', 'mp3', 'playNow', 'ticker', 'open', 'repeat', 'leaveMin', 'leaveOpen', 'leaveChapter', 'save', 'folder'];

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
     П19: size — 'compact' / 'normal' / 'large' (высота шкал и подписей), maxItems — в шапке не больше N показателей.
     game.menu: [{tab, label, hidden}] — порядок, названия и скрытые вкладки нижнего меню (пусто — как было). */
  var MENU_TABS = [['data', 'ДАННЫЕ'], ['code', 'КОД'], ['scan', 'СКАНЕР'], ['chat', 'СВЯЗЬ'], ['apps', 'ПРИБОРЫ'], ['photo', 'КАМЕРА'], ['notes', 'ЗАМЕТКИ'], ['spy', 'ПЕРЕХВАТ'], ['hack', 'ВЗЛОМ']];
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
    // П19 (замечание 5): размер шапки и «не больше N показателей» (0 — все; остальные — в окне по нажатию)
    h.size = ['compact', 'large'].indexOf(h.size) >= 0 ? h.size : 'normal';
    h.maxItems = Math.max(0, Math.min(50, Math.round(+h.maxItems || 0)));
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
      it.win = Math.max(0, Math.min(WIN_MAX, +it.win || 0));   // П20 (Т13-5 А): показатель «за N мин» — сумма прибавлений за N минут
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
  /* ---------- П25 (06, 140, 146): шпионаж текстом — программа «ПЕРЕХВАТ» ----------
     game.spy: name — название вкладки; mode — как выбирается жертва: code (по «коду прослушки»), list (из списка), random (случайно),
     fake (подменный: шпион выбирает из списка, слышит того, кто задан у жертвы в spyFake, или случайного); list — кого можно
     слушать (пусто — всех, кроме себя); maxMin / coolMin — сеанс N минут, потом «ПЕРЕГРЕВ» на M минут; heatActions — действия при
     перегреве (себе); partial — показывать недоговорённое; glitch — у жертвы буквы интерфейса понемногу превращаются в 0 и 1
     (с glitchFrom секунд, растёт на glitchGrow % в минуту до glitchMax %); проверка линии у жертвы: код checkCode и строка
     в настройках (checkSettings); прервать — код breakCode или встряхнуть breakShakes раз с промежутком не больше breakGap с;
     cutCoolMin — сколько минут программа шпиона заблокирована после того, как жертва прервала. */
  var SPY_MODES = [['code', 'по коду прослушки (добыть в игре)'], ['list', 'из списка'], ['random', 'случайно'], ['fake', 'подменный (выбирает из списка, слышит другого)'], ['wave', 'ловля волны (шкала, как у взлома)']];
  /* П26 (06, 153): звук шпионажа — 8 кГц, μ-закон (G.711, 1 байт на отсчёт), base64 в живом потоке центра. */
  function ulawEnc(f) {   // f — числа от -1 до 1 → Uint8Array
    var out = new Uint8Array(f.length);
    for (var i = 0; i < f.length; i++) {
      var s = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767))), sign = s < 0 ? 0x80 : 0;
      if (sign) s = -s;
      if (s > 32635) s = 32635;
      s += 0x84;
      var e = 7;
      for (var m = 0x4000; (s & m) === 0 && e > 0; e--, m >>= 1) { /* старший бит */ }
      out[i] = ~(sign | (e << 4) | ((s >> (e + 3)) & 0x0f)) & 0xff;
    }
    return out;
  }
  function ulawDec(u) {   // Uint8Array → Float32Array (-1…1)
    var out = new Float32Array(u.length);
    for (var i = 0; i < u.length; i++) {
      var x = ~u[i] & 0xff, e = (x >> 4) & 7, s = ((((x & 0x0f) << 3) + 0x84) << e) - 0x84;
      out[i] = (x & 0x80 ? -s : s) / 32768;
    }
    return out;
  }
  function b64enc(u) { var s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  function b64dec(t) { var s = atob(t), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  var SPY_FX = [['bits', 'буквы → 0 и 1'], ['typo', '«не те буквы» на клавиатуре'], ['vibe', 'периодическая вибрация'], ['ripple', 'рябь экрана'], ['glitch', 'сбой из «Сбоев и состояний»']];
  /* П28 (06, 166 — Т40-3…Т40-7): виды перехвата по персонажам.
     account.spyKinds = {text, sound, video} — с какой главы вид открыт у этого шпиона (0 — закрыт; открывает действие «Вид перехвата»);
     account.spyCam — камера у вида «видео»: both (обе, ⇄; сначала game.spy.videoCam) / front / back;
     account.spyCodes — у цели ещё коды со своим сочетанием: [{code, text, sound, video, comment}].
     Старый пакет (spyKinds нет): из общих настроек — что слышит шпион (sound: text / sound / both), видео — у videoWho (пусто — у всех). */
  var SPY_KINDS = [['text', 'текст'], ['sound', 'звук'], ['video', 'видео']];
  function normSpyKinds(g) {
    var sp = g.spy;
    (g.accounts || []).forEach(function (a) {
      if (!a.spyKinds || typeof a.spyKinds !== 'object') {
        a.spyKinds = { text: sp.sound !== 'sound' ? 1 : 0, sound: sp.sound !== 'text' ? 1 : 0, video: sp.video && (!sp.videoWho || sp.videoWho === a.id) ? 1 : 0 };
      }
      SPY_KINDS.forEach(function (k) { var v = Math.round(+a.spyKinds[k[0]] || 0); a.spyKinds[k[0]] = v > 0 ? Math.min(99, v) : 0; });
      a.spyCam = ['front', 'back'].indexOf(a.spyCam) >= 0 ? a.spyCam : 'both';
      a.spyCodes = (Array.isArray(a.spyCodes) ? a.spyCodes : []).filter(function (c) { return c && String(c.code || '').trim(); }).map(function (c) {
        return { code: String(c.code).trim(), text: !!c.text, sound: !!c.sound, video: !!c.video, comment: String(c.comment || '') };
      });
    });
  }
  /* Какие виды открыты у шпиона сейчас: «с главы» или действием (состояние центра spyk:<id>:<вид> = {on, text, at}; on: false — закрыт). */
  function spyKindsOf(game, acc, chapter, st) {
    var out = {};
    if (!acc) return out;
    if (!acc.spyKinds) normSpyKinds(game);
    st = st || {};
    SPY_KINDS.forEach(function (k) {
      var v = st['spyk:' + acc.id + ':' + k[0]];
      if (v && v.on === false) out[k[0]] = false;
      else if (v && v.on) out[k[0]] = true;
      else { var f = acc.spyKinds[k[0]]; out[k[0]] = f > 0 && (chapter || 1) >= f; }
    });
    return out;
  }
  function spyKindsText(k) {
    var l = SPY_KINDS.filter(function (x) { return k && k[x[0]]; }).map(function (x) { return x[1].toUpperCase(); });
    return l.length ? l.join(' + ') : 'НЕТ КАНАЛОВ';
  }
  function normSpy(g) {
    // П28 (06, 166 — Т40-5): по умолчанию со старта — ловля волны (шкала радио); код цели — в отдельном окне. dv 2: в старом пакете «по коду» → ловля
    var sdv = g.spy ? +g.spy.dv || 0 : 2;
    var x = g.spy = Object.assign({ name: 'ПЕРЕХВАТ', mode: 'wave', list: [], maxMin: 3, coolMin: 5, heatActions: [], partial: true,
      glitch: true, glitchFrom: 15, glitchGrow: 5, glitchMax: 40, checkCode: '', checkSettings: true, breakCode: '', breakShakes: 3, breakGap: 5, cutCoolMin: 1,
      slider: false, sliderSpeed: 15, sliderBand: 30, sliderSilent: 5, sliderZero: 'cut' }, g.spy || {});
    // П25 (06, 151): ползунок во время шпионажа — вне коридора текст в помехах, до нуля — обрыв / сбой у шпиона / жертва замечает
    x.slider = !!x.slider;
    x.sliderSpeed = n(x.sliderSpeed, 15, 1, 200); x.sliderBand = n(x.sliderBand, 30, 4, 80); x.sliderSilent = n(x.sliderSilent, 5, 0, 100);
    x.sliderZero = ['cut', 'glitch', 'expose'].indexOf(x.sliderZero) >= 0 ? x.sliderZero : 'cut';
    x.sliderSide = x.sliderSide === 'left' ? 'left' : 'right';   // П27: с какой стороны полоса ползунка
    // П27 (06, 150, 157): сбои при долгом шпионаже (текст, звук, камера) — по умолчанию включены: дольше failA с — failPA %
    // каждые failEvery с, дольше failB с — failPB %; сбой — помехи failNoise с, потом обрыв
    x.fail = x.fail !== false;
    x.failA = n(x.failA, 10, 0, 3600); x.failPA = n(x.failPA, 5, 0, 100);
    x.failB = Math.max(x.failA, n(x.failB, 60, 0, 3600)); x.failPB = n(x.failPB, 40, 0, 100);
    x.failEvery = n(x.failEvery, 5, 1, 600); x.failNoise = n(x.failNoise, 3, 0, 60);
    // П28 (06, 161 — Т39-2 Б): после обрыва от сбоя программа заблокирована failCoolMin минут (0 — без блока)
    x.failCoolMin = n(x.failCoolMin, 1, 0, 120);
    // П28 (06, 162): ползунок, установленный игроком (отпустил палец), стоит случайные sliderHoldMin–sliderHoldMax с, потом снова падает
    x.sliderHoldMin = n(x.sliderHoldMin, 5, 0, 120); x.sliderHoldMax = Math.max(x.sliderHoldMin, n(x.sliderHoldMax, 15, 0, 120));
    // П28 (06, 161 — Т39-3 А): 0/1 у жертвы прослушки мигают, как при взломе: буква — 0/1 на bitsOnMin–bitsOnMax с, потом возвращается
    x.bitsOnMin = n(x.bitsOnMin, 2, 0.5, 120); x.bitsOnMax = Math.max(x.bitsOnMin, n(x.bitsOnMax, 8, 0.5, 120));
    x.name = String(x.name || 'ПЕРЕХВАТ');
    if (!SPY_MODES.some(function (m) { return m[0] === x.mode; })) x.mode = 'wave';
    if (sdv < 2 && x.mode === 'code') x.mode = 'wave';
    x.dv = 2;
    x.list = Array.isArray(x.list) ? x.list : [];
    function n(v, d, lo, hi) { v = +v; return isFinite(v) && v >= lo ? Math.min(hi, v) : d; }
    x.maxMin = n(x.maxMin, 3, 0, 120);
    x.coolMin = n(x.coolMin, 5, 0, 120);
    x.heatActions = Array.isArray(x.heatActions) ? x.heatActions : [];
    x.partial = x.partial !== false;
    x.glitch = x.glitch !== false;
    x.glitchFrom = n(x.glitchFrom, 15, 0, 3600);
    x.glitchGrow = n(x.glitchGrow, 5, 0, 1000);
    x.glitchMax = n(x.glitchMax, 40, 0, 100);
    // П26 (06, 155): вид глитча у жертвы — список эффектов, у каждого сила (%, с которой начинается) и рост (% в минуту).
    // bits — буквы → 0 и 1; typo — «не те буквы»; vibe — периодическая вибрация; ripple — рябь экрана; glitch — сбой из «Сбоев и состояний»
    // (сила — вероятность за 10 с, что он начнётся; кончается вместе с прослушкой). Старый пакет: glitch → [0/1, сила 1, рост glitchGrow].
    if (!Array.isArray(x.fx)) x.fx = x.glitch ? [{ kind: 'bits', power: 1, grow: x.glitchGrow }] : [];
    x.fx = x.fx.filter(function (f) { return f && SPY_FX.some(function (k) { return k[0] === f.kind; }); }).map(function (f) {
      return { kind: f.kind, power: n(f.power, 1, 0, 100), grow: n(f.grow, 5, 0, 1000), glitch: String(f.glitch || '') };
    });
    x.glitch = x.fx.length > 0;
    // П26 (06, 150, 153): что слышит шпион — текст, звук (8 кГц через центр) или оба; задержка звука 1–60 с
    x.sound = ['text', 'sound', 'both'].indexOf(x.sound) >= 0 ? x.sound : 'text';
    x.soundDelay = n(x.soundDelay, 2, 1, 60);
    // П26 (06, 156): видео-шпионаж — камера жертвы (видео, пока её приложение на экране; иначе фото раз в 1 с через службу)
    x.video = !!x.video;
    x.videoCam = x.videoCam === 'back' ? 'back' : 'front';
    x.videoWho = typeof x.videoWho === 'string' ? x.videoWho : '';   // П27 (06, 159): камера жертвы — только у этого шпиона (пусто — у любого)
    x.checkCode = String(x.checkCode || '').trim();
    x.checkSettings = x.checkSettings !== false;
    x.breakCode = String(x.breakCode || '').trim();
    x.breakShakes = Math.round(n(x.breakShakes, 3, 0, 10));
    x.breakGap = n(x.breakGap, 5, 1, 60);
    x.cutCoolMin = n(x.cutCoolMin, 1, 0, 120);
  }
  /* ---------- П25 (06, 142, 147): мини-игры (М7) ----------
     game.games: [{id, kind: 'voice2' («два выбора голосом»), name, title, pairs: [{q, ok, no}] — вопрос (по желанию), верный и неверный
     вариант; stages — этапов; random — пары случайно (иначе по порядку); stageSec / totalSec — время на этап / на всю игру (0 — без
     ограничения); maxErr — ошибок до провала; buttonsAfter — через N с на этапе можно нажать вариант (0 — только голос);
     repeat: any / once / pause (pauseMin); okActions / errActions / failActions; okText / failText}] */
  /* П25 (06, 152): события своих звуков; если звук не задан — встроенный (у msg — как note, scan — без звука, win — ok, lose — err). */
  var SOUND_EVENTS = [['note', 'уведомление'], ['msg', 'сообщение в чате'], ['ok', 'код принят'], ['err', 'код отклонён / ошибка'], ['scan', 'QR отсканирован'],
    ['glitch', 'сбой'], ['win', 'мини-игра: успех'], ['lose', 'мини-игра: провал']];
  /* Свой звук для события: персонажа (с наибольшей главой ≤ текущей) важнее общего. */
  function soundFor(game, ev, acc, chapter) {
    var best = null, score = -1;
    (game.soundSet || []).forEach(function (x) {
      if (x.ev !== ev || !x.file || (chapter || 1) < x.chapter) return;
      if (x.who.length && x.who.indexOf(acc) < 0) return;
      var sc = (x.who.length ? 1000 : 0) + x.chapter;
      if (sc > score) { score = sc; best = x; }
    });
    return best ? best.file : '';
  }
  var GAME_REPEAT = [['any', 'без ограничений'], ['once', 'один раз'], ['pause', 'снова — через паузу']];
  /* П25 (06, 151): виды мини-игр (конструктор М7) */
  var GAME_KINDS = [['voice2', 'два выбора голосом'], ['slider', 'ползунок (держать в коридоре)'], ['code', 'код под таймером (запомнить и ввести)'], ['wires', 'провода (схема — у напарника)'],
    ['qr', 'камера на QR (загрузка, пока камера видит QR)'], ['qr2', 'камеры на QR вдвоём и больше (цвет — вариант — выбор)']];
  /* П29 (06, 164, 167): «удерживай камеру на QR». Вид 'qr' — загрузка этапа идёт, пока камера видит QR; 'qr2' — у каждого участника
     свой QR, у ведущего «НУЖНЫЙ ВАРИАНТ» на цветном фоне и серые варианты, у отвечающего — те же варианты в цветах; роли — по кругу
     парами; qrHold — у других видов «держать камеру на QR во время игры». Проверка раз в qrEvery с; срыв — помехи, игра стоит
     (qrTime: 'stop' — и время этапа стоит, 'run' — время идёт); нет QR дольше qrLost с — провал; всего без QR за игру больше qrLostMax с (0 — без предела) — провал (против «паузы»
     срывом); joinSec — ждать, пока все наведут камеры; qrList — какие QR годятся (пусто — любой); qrBy — свой QR у участника
     {аккаунт: текст}; coopOpts — вариантов (2–4, уровень +1). */
  function gameQr(x) { return !!x && (x.kind === 'qr' || x.kind === 'qr2' || !!x.qrHold); }
  function qrNorm(t) { return String(t == null ? '' : t).trim().replace(/^SG:/i, '').toUpperCase(); }
  function qrFits(x, acc, text) {
    var t = qrNorm(text);
    if (!t) return false;
    var own = x.qrBy && x.qrBy[acc];
    if (own) return qrNorm(own) === t;
    return !x.qrList.length || x.qrList.some(function (q) { return qrNorm(q) === t; });
  }
  function normGame(x) {
    x = Object.assign({ kind: 'voice2', name: 'Мини-игра', title: '', pairs: [], stages: 3, random: true, stageSec: 20, totalSec: 0, maxErr: 3, buttonsAfter: 0,
      repeat: 'any', pauseMin: 5, okActions: [], errActions: [], failActions: [], okText: '', failText: '' }, x || {});
    x.id = x.id || uid('mg');
    if (!GAME_KINDS.some(function (k) { return k[0] === x.kind; })) x.kind = 'voice2';
    // ползунок: скорость падения (единиц шкалы из 100 в секунду), ширина коридора, держать в коридоре (с), «тихие падения» (% в секунду)
    x.speed = n(x.speed, 25, 1, 200); x.band = n(x.band, 20, 4, 80); x.holdSec = n(x.holdSec, 5, 1, 120); x.silent = n(x.silent, 10, 0, 100);
    // код: цифр, показ (с), +цифр на этап; провода: проводов, перерезать, напарники (кому схема)
    x.digits = n(x.digits, 4, 1, 12); x.showSec = n(x.showSec, 3, 1, 30); x.grow = n(x.grow, 1, 0, 4);
    x.wires = n(x.wires, 5, 2, 8); x.cuts = Math.min(x.wires, n(x.cuts, 3, 1, 8)); x.partners = Array.isArray(x.partners) ? x.partners : [];
    x.failFrom = x.failFrom === 'stage' ? 'stage' : 'zero';   // провал: снова «с нуля» или с этапа
    // П29: камера на QR
    x.qrHold = !!x.qrHold;
    x.qrEvery = n(x.qrEvery, 2, 1, 30); x.qrLost = n(x.qrLost, 10, 2, 600); x.qrLostMax = n(x.qrLostMax, 30, 0, 3600); x.joinSec = n(x.joinSec, 60, 5, 600);
    x.qrList = (Array.isArray(x.qrList) ? x.qrList : []).map(function (q) { return String(q == null ? '' : q).trim(); }).filter(Boolean);
    var qb = {};
    if (x.qrBy && typeof x.qrBy === 'object') Object.keys(x.qrBy).forEach(function (k) { var v = String(x.qrBy[k] == null ? '' : x.qrBy[k]).trim(); if (v) qb[k] = v; });
    x.qrBy = qb;
    x.coopOpts = n(x.coopOpts, 2, 2, 4);
    x.qrTime = x.qrTime === 'run' ? 'run' : 'stop';
    // П30 (06, 165, 168): развилки — этап выбора исхода после этапа after (after >= stages — после успеха); watch — другие видят ход игры
    x.watch = !!x.watch;
    x.forks = (Array.isArray(x.forks) ? x.forks : []).map(normFork);
    x.name = String(x.name || 'Мини-игра');
    x.title = String(x.title || '');
    x.pairs = (Array.isArray(x.pairs) ? x.pairs : []).map(function (p) { p = p || {}; return { q: String(p.q || ''), ok: String(p.ok || ''), no: String(p.no || '') }; });
    function n(v, d, lo, hi) { v = +v; return isFinite(v) && v >= lo ? Math.min(hi, Math.round(v)) : d; }
    x.stages = n(x.stages, 3, 1, 50);
    x.random = x.random !== false;
    x.stageSec = n(x.stageSec, 20, 0, 3600);
    x.totalSec = n(x.totalSec, 0, 0, 36000);
    x.maxErr = n(x.maxErr, 3, 1, 50);
    x.buttonsAfter = n(x.buttonsAfter, 0, 0, 3600);
    if (!GAME_REPEAT.some(function (r) { return r[0] === x.repeat; })) x.repeat = 'any';
    x.pauseMin = n(x.pauseMin, 5, 0, 1440);
    ['okActions', 'errActions', 'failActions'].forEach(function (k) { x[k] = Array.isArray(x[k]) ? x[k] : []; });
    x.okText = String(x.okText || '');
    x.failText = String(x.failText || '');
    return x;
  }
  /* П30 (06, 165, 168; П-106): развилка мини-игры. after — после какого этапа (>= этапов — после успеха); sec — время на выбор (0 — ждать);
     by — вдвоём и больше: 'lead' (выбирает ведущий) или 'each' (каждый сам себе, тайно); watchText — что видят другие во время выбора;
     var — общая или личная переменная, куда записать выбор (значение исхода или его название). Исход: name (кнопка), hint (последствия —
     видит только выбравший), voice (фраза у «двух выборов голосом»), who / chapter / when (кому доступен), otherText (что видят другие),
     okText / okActions, failText / failActions (пусто — общие игры). */
  function normFork(f) {
    f = Object.assign({ after: 99, title: '', text: '', sec: 0, by: 'lead', watchText: '', var: '', branches: [] }, f || {});
    f.id = f.id || uid('fk');
    f.after = Math.max(1, Math.round(+f.after || 99));
    f.sec = Math.max(0, Math.min(3600, Math.round(+f.sec || 0)));
    f.by = f.by === 'each' ? 'each' : 'lead';
    ['title', 'text', 'watchText'].forEach(function (k) { f[k] = String(f[k] || ''); });
    f.var = String(f.var || '').replace(/^\$/, '').trim();
    f.branches = (Array.isArray(f.branches) ? f.branches : []).map(function (b) {
      b = Object.assign({ name: '', hint: '', voice: '', value: '', who: [], chapter: 1, when: [], otherText: '', okText: '', okActions: [], failText: '', failActions: [] }, b || {});
      b.id = b.id || uid('br');
      ['name', 'hint', 'voice', 'value', 'otherText', 'okText', 'failText'].forEach(function (k) { b[k] = String(b[k] == null ? '' : b[k]); });
      b.who = Array.isArray(b.who) ? b.who : [];
      b.chapter = Math.max(1, +b.chapter || 1);
      b.when = (Array.isArray(b.when) ? b.when : []).filter(function (w) { return w && w.var; }).map(function (w) {
        return { var: String(w.var).replace(/^\$/, ''), op: w.op || '>=', value: w.value == null ? '' : String(w.value),
          win: Math.max(0, Math.min(WIN_MAX, +w.win || 0)), acc: typeof w.acc === 'string' ? w.acc : '' };
      });
      b.okActions = Array.isArray(b.okActions) ? b.okActions : [];
      b.failActions = Array.isArray(b.failActions) ? b.failActions : [];
      return b;
    });
    return f;
  }
  /* П30: доступен ли исход развилки персонажу acc (кому, с главы, «когда»). st = {chapter, vars}. */
  function forkCan(game, b, acc, st) {
    st = st || {};
    if (b.who.length && b.who.indexOf(acc) < 0) return false;
    if ((+st.chapter || 1) < b.chapter) return false;
    return whenOk(game, b, st.vars || {}, acc);
  }
  /* Можно ли играть сейчас (повтор): {ok, why, left} по записи телефона rec = {n, last, won}. */
  function gameCan(x, rec, now) {
    rec = rec || {};
    if (!rec.n) return { ok: true };
    if (x.repeat === 'once') return { ok: false, why: 'once' };
    if (x.repeat === 'pause' && rec.last && now - rec.last < x.pauseMin * 60000) return { ok: false, why: 'pause', left: x.pauseMin * 60000 - (now - rec.last) };
    return { ok: true };
  }
  /* ---------- П25 (06, 141, 148): взлом — ловля волны и чтение экрана жертвы ----------
     game.wave — шкала: channels (каналов на шкале), real (из них настоящих), trap (волн-ловушек; остальное — помехи), holdSec
     (сколько держать, чтобы поймать; 0 — без поимки: «ПОДКЛЮЧИТЬ» на канале), tol (ширина канала, единиц шкалы из 100),
     trapSec (дольше на ловушке — сбой trapGlitch). Каналы раскладываются по шкале случайно при каждом взломе.
     game.hack — программа «ВЗЛОМ»: name, mode (как у шпиона, по умолчанию wave), list, maxMin / coolMin, okActions (при
     подключении, себе); strip (высота полосы, строк), spyMono (у шпиона монохром), look — как полоса выглядит у жертвы
     (noise / glitch / tint / mono), power / powerGrow (% и % в минуту); from–to — через сколько секунд у жертвы начинаются
     сбои (случайно), bits / bitsGrow / bitsMax — буквы → 0/1 (П27: каждая — на bitsOnMin–bitsOnMax с, потом возвращается), typo — «не те буквы»; защита — shakes (встряхнуть N раз,
     промежуток gap с) и / или defendCode (код или фраза голосом); result — off / block / beep (писк у шпиона) / blockbeep
     (блок и писк у beepN случайных телефонов, открытых и в руках), blockMin. */
  var HACK_RESULT = [['blockbeep', 'блок шпиона и писк у нескольких случайных телефонов в руках'], ['block', 'отключить и заблокировать'], ['beep', 'отключить, телефон шпиона пищит (выдаёт его)'], ['off', 'только отключить']];
  var HACK_LOOK = [['noise', 'белый шум'], ['glitch', 'глитчи'], ['tint', 'другой оттенок'], ['mono', 'потеря цвета (монохром)']];
  function normHack(g) {
    function n(v, d, lo, hi) { v = +v; return isFinite(v) && v >= lo && v !== '' ? Math.min(hi, v) : d; }
    var w = g.wave = Object.assign({ channels: 6, real: 3, trap: 1, holdSec: 3, tol: 2.5, trapSec: 6, trapGlitch: '' }, g.wave || {});
    w.channels = Math.round(n(w.channels, 6, 1, 20));
    w.real = Math.round(n(w.real, 3, 0, w.channels));
    w.trap = Math.round(n(w.trap, 1, 0, w.channels - w.real));
    w.holdSec = n(w.holdSec, 3, 0, 60);
    w.tol = n(w.tol, 2.5, 0.5, 20);
    w.trapSec = n(w.trapSec, 6, 1, 120);
    w.trapGlitch = String(w.trapGlitch || '');
    // П26 (06, 150, 153): звук шкалы (шум, музыка, сигналы персонажей) и mp3 из «Медиа» с отметкой «для шкалы» — каналы-музыка
    w.sound = w.sound !== false;
    w.music = Array.isArray(w.music) ? w.music.filter(function (x) { return typeof x === 'string' && x; }) : [];
    // П27 (замечания автора к пробе П25): у жертвы в начале незаметнее, сбои позже и медленнее; 0/1 мигают — буква побыла
    // изменённой bitsOnMin–bitsOnMax с и вернулась. dv — версия значений по умолчанию: в старом пакете (нет dv) прежние
    // значения по умолчанию (30 / 10 / 5–20 / 5) заменяются новыми; значения, которые автор менял, не трогаются.
    // П28 (06, 161 — Т39-5 А): перегрев взлома по умолчанию через 5 мин (было 3) — dv 3; в пакете dv < 3 прежнее 3 → 5.
    var dv = g.hack ? +g.hack.dv || 0 : 3, old = g.hack && dv < 2;
    var x = g.hack = Object.assign({ name: 'ВЗЛОМ', mode: 'wave', list: [], maxMin: 5, coolMin: 5, okActions: [], strip: 2, spyMono: true, look: 'noise', power: 5, powerGrow: 8,
      from: 30, to: 90, bits: true, bitsGrow: 3, bitsMax: 30, bitsOnMin: 2, bitsOnMax: 8, typo: false, shakes: 3, gap: 5, defendCode: '', result: 'blockbeep', blockMin: 1, beepN: 3 }, g.hack || {});
    if (old) {
      if (+x.power === 30) x.power = 5;
      if (+x.powerGrow === 10) x.powerGrow = 8;
      if (+x.from === 5 && +x.to === 20) { x.from = 30; x.to = 90; }
      if (+x.bitsGrow === 5) x.bitsGrow = 3;
    }
    if (dv < 3 && +x.maxMin === 3) x.maxMin = 5;
    x.dv = 3;
    x.name = String(x.name || 'ВЗЛОМ');
    if (!SPY_MODES.some(function (m) { return m[0] === x.mode && m[0] !== 'fake'; })) x.mode = 'wave';
    x.list = Array.isArray(x.list) ? x.list : [];
    x.maxMin = n(x.maxMin, 5, 0, 120); x.coolMin = n(x.coolMin, 5, 0, 120);
    x.okActions = Array.isArray(x.okActions) ? x.okActions : [];
    x.strip = n(x.strip, 2, 1, 10); x.spyMono = x.spyMono !== false;
    if (!HACK_LOOK.some(function (m) { return m[0] === x.look; })) x.look = 'noise';
    x.power = n(x.power, 5, 0, 100); x.powerGrow = n(x.powerGrow, 8, 0, 1000);
    x.from = n(x.from, 30, 0, 3600); x.to = Math.max(x.from, n(x.to, 90, 0, 3600));
    x.bits = x.bits !== false; x.bitsGrow = n(x.bitsGrow, 3, 0, 1000); x.bitsMax = n(x.bitsMax, 30, 0, 100); x.typo = !!x.typo;
    x.bitsOnMin = n(x.bitsOnMin, 2, 0.5, 120); x.bitsOnMax = Math.max(x.bitsOnMin, n(x.bitsOnMax, 8, 0.5, 120));
    x.shakes = Math.round(n(x.shakes, 3, 0, 10)); x.gap = n(x.gap, 5, 1, 60);
    x.defendCode = String(x.defendCode || '').trim();
    if (!HACK_RESULT.some(function (m) { return m[0] === x.result; })) x.result = 'blockbeep';
    x.blockMin = n(x.blockMin, 1, 0, 120); x.beepN = Math.round(n(x.beepN, 3, 0, 20));
  }
  function hackInGame(game) { return (game.accounts || []).some(function (a) { return (a.modules || []).indexOf('hack') >= 0; }); }
  /* Подпись канала телефона на шкале: своя частота из пакета или постоянная по id. */
  function freqOf(acc) {
    if (!acc) return '';
    if (acc.hackFreq) return acc.hackFreq;
    var h = 0, s = String(acc.id);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 900;
    return 'К-' + (100 + h);
  }
  /* Кого шпион может слушать (П25): режим list / random / fake — список (пусто — все, кроме себя). */
  function spyTargets(game, self, list) {
    var l = list || game.spy.list || [];
    return game.accounts.filter(function (a) { return a.id !== self && (!l.length || l.indexOf(a.id) >= 0); });
  }
  /* Кого на самом деле слышно (П25): в режиме fake — подмена у жертвы (spyFake) или случайный другой. */
  function spySource(game, target, self, rnd) {
    if (game.spy.mode !== 'fake' || !target) return target;
    var t = byId(game.accounts, target) || {};
    if (t.spyFake && t.spyFake !== 'random' && byId(game.accounts, t.spyFake)) return t.spyFake;
    var o = game.accounts.filter(function (a) { return a.id !== self && a.id !== target; });
    return o.length ? o[Math.floor((rnd == null ? Math.random() : rnd) * o.length)].id : target;
  }
  /* П25: кто из персонажей может стать жертвой (у кого-то в пакете есть «Перехват»): телефону жертвы нужен микрофон в фоне. */
  function spyInGame(game) { return (game.accounts || []).some(function (a) { return (a.modules || []).indexOf('spy') >= 0; }); }
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
  function limitOf(game, name, acc) {
    name = String(name || '').replace(/^\$/, '');
    var l = (game.limits || []).filter(function (l) { return l.var === name && (l.min !== '' || l.max !== ''); })[0] || null;
    // П20 (Т20-2 Б): у личной переменной свой максимум у персонажа (maxBy) — и для предела, и для шкалы
    var mb = acc ? maxOf(sharedVar(game, name), acc, 0) : 0;
    if (l && mb && l.max !== '') l = { var: l.var, min: l.min, max: mb };
    var lm = layerMax(game, name, acc);
    if (lm === null) return l;
    if (!l) return { var: name, min: '', max: lm, layers: true };
    return { var: name, min: l.min, max: l.max === '' ? lm : Math.min(l.max, lm), layers: l.max === '' || lm < l.max };
  }
  /* П16: предел по слоям шкалы — деления × число слоёв (у нескольких шкал одной переменной — наибольший); нет слоёв — null. */
  function layerMax(game, name, acc) {
    var m = null, sv = acc ? sharedVar(game, name) : null;
    ((game.header || {}).items || []).forEach(function (it) {
      if (it.var !== name || it.show !== 'cells' || !it.max || !(it.layers || []).length || it.win) return;
      var x = maxOf(sv, acc, it.max) * it.layers.length;
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
  function clampVar(game, name, v, acc) {
    var l = limitOf(game, name, acc);
    if (!l || typeof v !== 'number') return { value: v, side: '' };
    if (l.max !== '' && v > l.max) return { value: l.max, side: 'max' };
    if (l.min !== '' && v < l.min) return { value: l.min, side: 'min' };
    return { value: v, side: '' };
  }
  /* Нижнее меню по порядку: [{tab, label, hidden}] — все вкладки, заданные в game.menu — первыми. */
  function menuTabs(game) {
    var out = (game.menu || []).map(function (m) { return { tab: m.tab, label: m.label, hidden: !!m.hidden, chapter: m.chapter || 1, who: (m.who || []).slice() }; });
    MENU_TABS.forEach(function (t) { if (!out.some(function (m) { return m.tab === t[0]; })) out.push({ tab: t[0], label: '', hidden: false, chapter: 1, who: [] }); });
    out.forEach(function (m) { var d = MENU_TABS.filter(function (t) { return t[0] === m.tab; })[0]; m.def = m.tab === 'spy' && game.spy ? game.spy.name || d[1] : m.tab === 'hack' && game.hack ? game.hack.name || d[1] : d[1]; m.text = m.label || d[1]; });
    return out;
  }
  /* Что видно в шапке персонажу: показатели и разделы окна (кому, с главы). */
  function headerFor(game, state) {
    var h = game.header || {}, a = byId(game.accounts, state.account) || {}, n = state.chapter || 1;
    function vis(x) { return n >= (x.chapter || 1) && allowed(x.who || [], state.account); }
    var ch = game.chapters[n - 1];
    function fill(t) {
      return fillVars(String(t || ''), game, state.vars, state.account).replace(/\{name\}/g, a.name || '').replace(/\{prof\}/g, a.profession || '').replace(/\{chapter\}/g, ch ? ch.name : '');
    }
    var vals = sharedValues(game, state.vars, state.account);
    var items = (h.items || []).filter(vis).filter(function (it) { return sharedVar(game, it.var); }).map(function (it) {
      // П20: личная — своё значение и свой максимум (maxBy); «за N мин» — сумма прибавлений за окно (считает центр)
      var sv = sharedVar(game, it.var), v = it.win ? winValue(game, state.vars, it.var, state.account, it.win) : vals[it.var];
      var mx = it.win ? it.max : Math.min(CELLS_MAX, maxOf(sv, state.account, it.max)), cells = it.show === 'cells' ? cellsOf(v, mx) : null;
      var nv = Number(String(v == null ? '' : v).replace(',', '.'));
      var num = cells && mx && typeof v !== 'boolean' && isFinite(nv);
      // П16: перегрузка — сбоит столько делений, на сколько превышено; слои — у каждого деления свой слой (-1 — погасло)
      var ly = num && (it.layers || []).length ? layerCells(nv, mx, it.layers) : null;
      var overN = !ly && it.over && num && nv > mx ? Math.min(mx, Math.round(nv - mx)) : 0;
      if (ly) cells = ly.cells.map(function (k) { return k >= 0; });
      return { id: it.id, var: it.var, label: it.label, show: it.show, max: mx, unit: it.unit || '', value: v, name: sv.label || it.var, win: it.win || 0, personal: !!sv.personal,
        cells: cells, look: it.look || 'cell', fit: !!it.fit, overN: overN, layer: ly ? ly.layer : 0, layerOf: ly ? ly.cells : null,
        layers: ly ? it.layers : null, glow: ly ? ly.glow : 0, tap: tapFill(it.tap), limit: it.win ? null : limitOf(game, it.var, state.account), low0: it.low,
        over: overN > 0,
        low: it.low !== '' && it.low != null && typeof v !== 'boolean' && isFinite(nv) && v !== '' && v != null && nv < it.low,
        lowColor: it.lowColor || '',
        text: v === true ? 'да' : v === false ? 'нет' : v == null ? '' : String(v) + (mx && it.show === 'num' ? '/' + mx : '') + (it.unit ? ' ' + it.unit : '') };
    });
    // П15 (Т6-3 Б): строки главы (последняя «с главы» не позже нынешней); пустое поле — из общей шапки
    var hc = (h.chapters || []).filter(function (c) { return (c.chapter || 1) <= n; }).sort(function (x, y) { return x.chapter - y.chapter; });
    var own = {};
    hc.forEach(function (c) { ['title', 'sub', 'infoTitle', 'about'].forEach(function (k) { if (c[k]) own[k] = c[k]; }); });
    function tapFill(t) { t = t || normTap(); return { kind: t.kind, title: fill(t.title), text: fill(t.text), block: t.block }; }
    var taps = h.taps || {};
    var tt = own.title || h.title, st = own.sub || h.sub, it2 = own.infoTitle || h.infoTitle;
    // П19 (замечание 5): в шапке — не больше N показателей (0 — все), остальные — в окне по нажатию; размер шапки
    var maxN = Math.max(0, Math.round(+h.maxItems || 0)), shown = maxN ? items.slice(0, maxN) : items;
    return { size: ['compact', 'large'].indexOf(h.size) >= 0 ? h.size : 'normal', allItems: items, more: items.length - shown.length,
      title: fill(tt) || a.name || '—', sub: st === '-' ? '' : tt || st ? fill(st) : (a.profession || ''),   // П19: «-» — без второй строки
      chapter: h.chapter !== false ? (ch ? ch.name : '') : '',
      items: shown, infoTitle: fill(it2) || 'СВОДКА', about: fill(own.about), chapterName: ch ? ch.name : '',
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
    // П25 (06, 146): проверка линии, прервать прослушку, «код прослушки» жертвы (только у кого есть «Перехват»)
    if (!app && game.spy) {
      if (game.spy.checkCode && norm(game.spy.checkCode) === c) return { kind: 'spycheck' };
      if (game.spy.breakCode && norm(game.spy.breakCode) === c) return { kind: 'spybreak' };
      if (game.hack && game.hack.defendCode && norm(game.hack.defendCode) === c) return { kind: 'hackdef' };
      var me = byId(game.accounts, state.account);
      if (me && me.modules.indexOf('spy') >= 0) {
        for (var q = 0; q < game.accounts.length; q++) {
          var ta = game.accounts[q];
          if (ta.id !== me.id && ta.spyCode && norm(ta.spyCode) === c) return { kind: 'spy', target: ta };
          // П28 (Т40-5 А): ещё коды цели со своим сочетанием видов
          for (var qq = 0; ta.id !== me.id && qq < (ta.spyCodes || []).length; qq++) {
            var xc = ta.spyCodes[qq];
            if (norm(xc.code) === c) return { kind: 'spy', target: ta, use: { text: xc.text, sound: xc.sound, video: xc.video } };
          }
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
      if (ok && !whenOk(game, code, state.vars, state.account)) return code.whenMode === 'wrong' ? { kind: 'wrong' } : { kind: 'code', code: code, ok: false, cond: false, variant: v };
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
    if (r.cond === false) return { kind: 'denied', title: c.whenMode === 'inactive' ? T.inactive : T.denied, text: c.whenText || whenWhy(game, c, state.vars, state.account), blocks: [], fresh: [], actions: [] };
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
    var again = texts.length === 1 && blocks.length && !fresh.length && !c.actions.length && !c.limit && !c.perAcc && !blocks.some(function (b) { return b.hidden; });
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
    torch: 'Вспышка (фонарик)', beep: 'Короткий сигнал', game: 'Мини-игра', spykind: 'Вид перехвата (шпионаж)'
  };
  /* П16 (основа 2): события телефона — условие правила «на телефоне» (выполняет сам телефон). seconds — «дольше N с». */
  var PHONE_SENSORS = [['shake', 'встряхнули'], ['facedown', 'положили экраном вниз'], ['faceup', 'перевернули экраном вверх'], ['flip', 'перевернули (вниз или вверх)'],
    ['locked', 'экран заблокирован дольше N с (срабатывает при разблокировке)'], ['unlocked', 'экран не блокировали дольше N с'],
    ['away', 'экран включён, но игрок не в приложении дольше N с (свернул, смотрит другое)'], ['photo', 'сделан снимок камерой'], ['scan', 'отсканирован QR'],
    ['hands', 'взяли в руки (разблокирован и в руках; «дольше N с» — держат дольше N с)']];   // П25 (06, 149)
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
    // П25 (06, 149): служба следит, в руках ли телефон, если это где-то нужно (адресат «в руках», взлом)
    out.thr = game.handsThr || 0.08;   // П26
    out.hands = hackInGame(game) || JSON.stringify(game.rules.concat(game.codes)).indexOf('"to":"hands"') >= 0 || (game.rules || []).some(function (r) { return r.sensor === 'hands'; });
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
      if (a.to === 'hit') return ctx.hit ? ['acc:' + ctx.hit] : ctx.self ? 'self' : ['all'];
      if (a.to === 'hands') return ['all'];   // П25 (06, 149): «тем, у кого телефон в руках» — решает сам телефон (body.hands)   // П20 (Т12-5 А): «тому, у кого сработало»
      if (a.to === 'self' || a.to == null) return ctx.self ? 'self' : ['all'];
      if (!a.to.length) return ['all'];
      return a.to.map(function (id) { return 'acc:' + id; });
    }
    function route(a, kind, body) {
      var to = targets(a);
      if (a.to === 'hands') body = Object.assign({}, body, { hands: true });
      if (to === 'self') out.local.push({ kind: kind, body: body });
      else out.net.push({ t: 'msg', to: to, kind: kind, body: body });
    }
    actions.forEach(function (a) {
      if (a.type === 'open') route(a, 'open', { blocks: a.blocks || [], title: a.title || '' });
      else if (a.type === 'notify') {
        var n = byId(game.notices, a.notice) || {};
        // П20 (основа 4): содержимое события идёт вместе с уведомлением; у действия можно перебить «в строку» (a.ticker)
        var nb = { title: a.title || n.title || '', text: a.text || n.text || '' };
        if (n.id) { var ne = normEvent(Object.assign({}, n)); EVENT_KEYS.forEach(function (k) { nb[k] = ne[k]; }); nb.ev = n.id; }
        if (a.ticker === true || a.ticker === false) nb.ticker = a.ticker;
        if (a.repeat != null && a.repeat !== '') nb.repeat = Math.max(0, +a.repeat || 0);
        route(a, 'notify', nb);
      } else if (a.type === 'unticker') { route(a, 'unticker', { ev: a.notice || '' });   // П20 (Т21-7 А): убрать событие из строки (пусто — все)
      } else if (a.type === 'glitch') route(a, 'glitch', { id: a.glitch });
      else if (a.type === 'fix') { if ((a.to == null || a.to === 'self') && ctx.self) out.local.push({ kind: 'fix', body: { id: a.glitch || '' } }); else route(a, 'fix', { id: a.glitch || '' }); }
      else if (a.type === 'module') route(a, 'module', { id: a.module, on: a.on || 'on' });
      else if (a.type === 'app') route(a, 'app', { id: a.app });
      else if (a.type === 'spykind') {
        // П28 (Т40-3 А, Т40-8 А): открыть / закрыть вид перехвата шпиону — состояние центра spyk:<id>:<вид> (видит пульт; действует со следующего подключения — Т40-9 Б)
        var sk = (a.accs || []).length ? a.accs : ctx.hit ? [ctx.hit] : ctx.self ? [ctx.self] : [];
        var kinds = SPY_KINDS.map(function (k) { return k[0]; }).filter(function (k) { return a[k]; });
        sk.forEach(function (id) { kinds.forEach(function (k) {
          out.net.push({ t: 'set', key: 'spyk:' + id + ':' + k, value: { on: a.on !== false, text: a.text || '', at: now }, local: id === ctx.self });
        }); });
      }
      else if (a.type === 'torch') route(a, 'torch', { n: Math.max(1, Math.min(20, +a.n || 3)) });   // П16: мигнуть вспышкой N раз
      else if (a.type === 'game') route(a, 'game', { id: a.game || '', level: Math.max(1, +a.level || 1) });   // П25 (06, 147): запустить мини-игру
      else if (a.type === 'beep') route(a, 'beep', { sound: a.sound || 'beep', vibrate: a.vibrate !== false });   // П16: короткий сигнал
      else if (a.type === 'color') route(a, 'color', a.mode === 'set' ? { set: a.color || '' } : a.mode === 'any-on' ? { any: true } : a.mode === 'any-off' ? { any: false } : { offer: true });
      else if (a.type === 'alarm') {
        var al = byId(game.alarms, a.alarm) || {};
        var v = a.on === false ? { on: false, at: now } : { on: true, id: al.id || a.alarm, title: al.title || game.texts.alarm, text: al.text || '',
          red: al.red !== false, full: al.full !== false, siren: al.siren !== false, vibrate: al.vibrate !== false, torch: al.torch !== false, jam: al.jam !== false, at: now };
        // П20 (Т20-3 А): «только этому телефону» (a.one) — авария у того, кто ввёл код (у кого сработало, у выбранных a.accs)
        if (a.one) {
          var ids1 = (a.accs || []).length ? a.accs : ctx.hit ? [ctx.hit] : ctx.self ? [ctx.self] : [];
          ids1.forEach(function (id) { out.net.push({ t: 'set', key: 'alarm@' + id, value: v, local: id === ctx.self }); });
        } else out.net.push({ t: 'set', key: 'alarm', value: v, local: true });
      } else if (a.type === 'chapter') out.net.push({ t: 'set', key: 'chapter', value: { n: +a.n || 1, at: now }, local: true });
      else if (a.type === 'term') {
        // П13 (Т4-3): общая переменная — состояние центра «var:имя» (видят телефоны и терминал); иначе — только терминалу
        var vn = String(a.name || '').replace(/^\$/, ''), sv = sharedVar(game, vn), add = a.op === 'add';
        var n = add ? Number(String(a.value).replace(',', '.')) || 0 : termValue(a.value);
        if (sv && sv.personal) {
          // П20 (Т12-4 А): личная — у того, кто ввёл код / чей телефон (self), у того, у кого сработало правило (hit),
          // у выбранных (a.accs; '*' — у всех), в правиле центра без выбора — у всех
          var ids = (a.accs || []).indexOf('*') >= 0 ? accIds(game) : (a.accs || []).length ? a.accs.slice() : ctx.hit ? [ctx.hit] : ctx.self ? [ctx.self] : accIds(game);
          ids.forEach(function (id) {
            var k = 'var:' + vn + '@' + id, cur2 = varValue(game, ctx.vars || {}, vn, id);
            out.net.push(add ? { t: 'set', key: k, add: n, base: num(initOf(sv, id)), value: clampVar(game, vn, num(cur2) + n, id).value } : { t: 'set', key: k, value: clampVar(game, vn, n, id).value });
          });
        } else if (sv) {
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
    // П20: «{{личная}}» в сообщениях — того, кто ввёл код или у кого сработало правило
    var pa = ctx.hit || ctx.self;
    if ((game.shared || []).some(function (v) { return v.personal; })) out.net = out.net.map(function (m) { return m.t === 'msg' && m.body ? Object.assign({}, m, { body: pvBody(game, m.body, pa) }) : m; });
    return out;
  }

  function sharedVar(game, name) {
    name = String(name || '').replace(/^\$/, '');
    return (game.shared || []).filter(function (v) { return v.name === name; })[0] || null;
  }
  function num(v) { var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }

  /* ---------- П20: личные переменные «у каждого своя» и окно «за N минут» ----------
     Ключ центра личной — var:имя@id (id аккаунта); на телефоне state.vars['имя@id']. Окно — состояние центра
     win:имя[@id]:N (сумма прибавлений за N минут; центр считает, если окно есть в правиле, условии или шапке). */
  var WIN_MAX = 720;
  function pvKey(name, acc) { return acc ? name + '@' + acc : name; }
  function accIds(game) { return (game.accounts || []).map(function (a) { return a.id; }); }
  /* Персонаж по ссылке: id, номер сотрудника («#3» или «3»), имя или профессия (без регистра); нет — ''. */
  function accRef(game, ref) {
    ref = String(ref == null ? '' : ref).trim();
    if (!ref) return '';
    var l = ref.replace(/^#/, '').toLowerCase(), A = game.accounts || [];
    var a = A.filter(function (x) { return x.id === ref; })[0] || A.filter(function (x) { return x.num && String(x.num).toLowerCase() === l; })[0] ||
      A.filter(function (x) { return (x.name || '').toLowerCase() === l; })[0] || A.filter(function (x) { return (x.profession || '').toLowerCase() === l; })[0];
    return a ? a.id : '';
  }
  function initOf(v, acc) {
    if (v && v.personal && acc && v.byAcc && v.byAcc[acc] !== undefined && v.byAcc[acc] !== '' && v.byAcc[acc] !== null) return termValue(v.byAcc[acc]);
    return v ? v.value : undefined;
  }
  function maxOf(v, acc, def) { var m = v && v.personal && acc && v.maxBy ? +v.maxBy[acc] : 0; return m > 0 ? m : def; }
  /* Значение переменной: личная — у персонажа acc (нет — начальное этого персонажа), общая — общее. */
  function varValue(game, vals, name, acc) {
    var v = sharedVar(game, name);
    if (!v) return undefined;
    var k = v.personal ? pvKey(v.name, acc) : v.name;
    return vals && vals.hasOwnProperty(k) ? vals[k] : initOf(v, v.personal ? acc : '');
  }
  /* «За N минут»: сумма прибавлений (у личной — у персонажа acc); центр не прислал — 0. */
  function winValue(game, vals, name, acc, min) {
    var v = sharedVar(game, name), k = 'win:' + (v && v.personal ? pvKey(v.name, acc) : name) + ':' + min;
    return vals && vals.hasOwnProperty(k) ? vals[k] : 0;
  }
  /* Значения общих переменных (П13): из центра (vals — {имя: значение}), иначе начальные из пакета.
     П20: личная — своя (acc), и у каждого персонажа — «имя@id». */
  function sharedValues(game, vals, acc) {
    var out = {};
    (game.shared || []).forEach(function (v) {
      out[v.name] = varValue(game, vals, v.name, acc);
      if (v.personal) (game.accounts || []).forEach(function (a) { out[v.name + '@' + a.id] = varValue(game, vals, v.name, a.id); });
    });
    return out;
  }
  /* «{{имя}}» в тексте → значение общей переменной; да/нет — «да» / «нет»; неизвестное имя остаётся как есть.
     П20: личная — своя (acc); «{{имя@Инженер}}», «{{имя@#3}}» — у выбранного персонажа (Т12-3 А). */
  function fillVars(text, game, vals, acc) {
    if (!text || String(text).indexOf('{{') < 0 || !game || !(game.shared || []).length) return text;
    return String(text).replace(/\{\{\s*\$?([A-Za-z_][A-Za-z0-9_]*)(?:@([^{}]+?))?\s*\}\}/g, function (all, name, ref) {
      var sv = sharedVar(game, name);
      if (!sv) return all;
      var who = ref ? accRef(game, ref) : acc;
      if (ref && !who) return all;
      var x = varValue(game, vals, name, who);
      return x === true ? 'да' : x === false ? 'нет' : x == null ? '' : String(x);
    });
  }
  /* П20: в сообщениях центру «{{личная}}» — значение того, кто ввёл код или у кого сработало (центр подставит «имя@id»);
     «{{личная@ссылка}}» — у выбранного (id). Без персонажа — как есть (телефон подставит своё при показе). */
  function pvText(game, text, acc) {
    if (typeof text !== 'string' || text.indexOf('{{') < 0) return text;
    return text.replace(/\{\{\s*\$?([A-Za-z_][A-Za-z0-9_]*)(?:@([^{}]+?))?\s*\}\}/g, function (all, name, ref) {
      var sv = sharedVar(game, name);
      if (!sv || !sv.personal) return all;
      var who = ref ? accRef(game, ref) : acc;
      return who ? '{{' + name + '@' + who + '}}' : all;
    });
  }
  function pvBody(game, o, acc) {
    if (typeof o === 'string') return pvText(game, o, acc);
    if (Array.isArray(o)) return o.map(function (x) { return pvBody(game, x, acc); });
    if (o && typeof o === 'object') { var r = {}; Object.keys(o).forEach(function (k) { r[k] = pvBody(game, o[k], acc); }); return r; }
    return o;
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
  function whenOk(game, code, vals, acc) {
    if (!code.when || !code.when.length) return true;
    return code.when.every(function (w) { return varTest(whenValue(game, w, vals, acc), w.op, w.value); });
  }
  /* П20: значение для условия «когда»: своя или чужая (w.acc) личная, «за N мин» (w.win). */
  function whenValue(game, w, vals, acc) {
    var who = w.acc ? accRef(game, w.acc) || w.acc : acc;
    return w.win ? winValue(game, vals, w.var, who, w.win) : varValue(game, vals, w.var, who);
  }
  /* Почему «когда» не выполнено (ответ по умолчанию, П15): «Энергия: нужно не меньше 8, сейчас 5». */
  function whenWhy(game, code, vals, acc) {
    var bad = (code.when || []).filter(function (w) { return !varTest(whenValue(game, w, vals, acc), w.op, w.value); });
    return bad.map(function (w) {
      var sv = sharedVar(game, w.var), x = whenValue(game, w, vals, acc), op = WHEN_OPS.filter(function (o) { return o[0] === (w.op || '='); })[0];
      var show = function (y) { return y === true ? 'да' : y === false ? 'нет' : y == null || y === '' ? '—' : String(y); };
      return (sv && sv.label || w.var) + (w.win ? ' за ' + w.win + ' мин' : '') + ': нужно ' + (op ? op[1] : w.op) + ' ' + (w.value === '' ? '—' : w.value) + ', сейчас ' + show(x);
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
    var list = [], watched = {};
    function emit(actions, hit) {
      var x = expandActions(game, actions, { self: null, now: '{{now}}', hit: hit || null });
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
        // П20: личная — правило у каждого персонажа своё (или только у r.acc), действия «тому, у кого сработало» — ему;
        // «за N мин» — условие по сумме прибавлений за окно (снова — когда стало неверным и опять верным, Т13-4 А)
        var sv = sharedVar(game, r.var);
        pvAccs(sv, r.acc).forEach(function (id) {
          var part = id ? r.var + '@' + id : r.var;
          if (r.win) watch(part, r.win);
          list.push({ id: id ? r.id + '@' + id : r.id, on: 'state', key: r.win ? 'win:' + part + ':' + r.win : 'var:' + part, test: { op: r.op || '=', value: termValue(r.value) },
            init: r.win ? 0 : sv ? initOf(sv, id) : null, chapters: r.chapters, emit: emit(r.actions, id) });
        });
      }
      else if (r.on === 'limit' && r.var) pvAccs(sharedVar(game, r.var), r.acc).forEach(function (id) {
        list.push({ id: id ? r.id + '@' + id : r.id, on: 'limit', key: 'var:' + r.var + (id ? '@' + id : ''), side: r.side || 'max', chapters: r.chapters, emit: emit(r.actions, id) });
      });
    });
    // П15: пределы общих переменных — центр не даёт выйти за них (и сообщает правилам «упёрлась в предел»); П20: у личной — у каждого свой
    limitedVars(game).forEach(function (name) {
      pvAccs(sharedVar(game, name), '').forEach(function (id) {
        var l = limitOf(game, name, id);
        if (!l || (l.min === '' && l.max === '')) return;
        var o = { id: 'lim-' + l.var + (id ? '@' + id : ''), on: 'bounds', key: 'var:' + l.var + (id ? '@' + id : ''), emit: [] };
        if (l.min !== '') o.min = l.min;
        if (l.max !== '') o.max = l.max;
        list.push(o);
      });
    });
    // П16 (Т7-2): начальные значения общих переменных — центру, чтобы «{{имя}}» в уведомлении было числом и до первой записи
    (game.shared || []).forEach(function (v) {
      pvAccs(v, '').forEach(function (id) {
        var x = initOf(v, id);
        if (x !== undefined && x !== null && x !== '') list.push({ id: 'init-' + v.name + (id ? '@' + id : ''), on: 'init', key: 'var:' + v.name + (id ? '@' + id : ''), value: termValue(x), emit: [] });
      });
    });
    // П20: окна «за N мин» из шапки и условий «когда» — центр считает и шлёт win:…; личные — персонажи (номер для терминала)
    ((game.header || {}).items || []).forEach(function (it) { if (it.win && sharedVar(game, it.var)) pvAccs(sharedVar(game, it.var), '').forEach(function (id) { watch(it.var + (id ? '@' + id : ''), it.win); }); });
    (game.codes || []).forEach(function (c) { (c.when || []).forEach(function (w) { if (w.win && sharedVar(game, w.var)) pvAccs(sharedVar(game, w.var), w.acc).forEach(function (id) { watch(w.var + (id ? '@' + id : ''), w.win); }); }); });
    // П23 (Т32-1 А): и окна из условий терминала (sgPersonalWin) — их кладёт в пакет «Опубликовать пакет» Twine
    (game.termWins || []).forEach(function (w) { if (sharedVar(game, w.var)) pvAccs(sharedVar(game, w.var), w.acc).forEach(function (id) { watch(w.var + (id ? '@' + id : ''), w.min); }); });
    Object.keys(watched).forEach(function (k) { list.push(watched[k]); });
    if ((game.shared || []).some(function (v) { return v.personal; })) {
      list.push({ id: 'accs', on: 'accs', list: (game.accounts || []).map(function (a) { return { id: a.id, num: a.num || '', name: a.name || '' }; }),
        vars: (game.shared || []).filter(function (v) { return v.personal; }).map(function (v) { return v.name; }), emit: [] });
    }
    function pvAccs(sv, only) { return sv && sv.personal ? (only ? [only] : accIds(game)) : ['']; }
    function watch(part, min) { var k = part + ':' + min; if (!watched[k]) watched[k] = { id: 'win-' + k, on: 'win', key: 'var:' + part, min: min, emit: [] }; }
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
    // П25: шпионаж текстом — коды прослушки, проверка линии, прервать
    if (game.spy && spyInGame(game)) {
      game.accounts.forEach(function (a) {
        if (a.spyCode) out.push({ key: 'y' + a.id, kind: 'spy', code: a.spyCode, label: 'прослушка: ' + (a.name || '?'), group: 'Шпионаж', obj: a, codeKey: 'spyCode', comment: 'spyComment', where: 'spyWhere' });
        (a.spyCodes || []).forEach(function (xc, i) {
          out.push({ key: 'y' + a.id + '-' + i, kind: 'spy', code: xc.code, label: 'прослушка: ' + (a.name || '?') + ' (' + spyKindsText(xc).toLowerCase() + ')', group: 'Шпионаж', obj: xc, codeKey: 'code', comment: 'comment', where: null });
        });
      });
      if (game.spy.checkCode) out.push({ key: 'yc', kind: 'spy', code: game.spy.checkCode, label: 'проверка линии', group: 'Шпионаж', obj: game.spy, codeKey: 'checkCode', comment: 'checkComment', where: null });
      if (game.spy.breakCode) out.push({ key: 'yb', kind: 'spy', code: game.spy.breakCode, label: 'прервать прослушку', group: 'Шпионаж', obj: game.spy, codeKey: 'breakCode', comment: 'breakComment', where: null });
    }
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
    // П26: музыка шкалы — файлы есть в «Медиа»
    if (game.wave && files) (game.wave.music || []).forEach(function (m) { if (!files[m]) warn('Шкала «ловля волны»: файла «' + m + '» нет в «Медиа».'); });
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
      (c.buttons || []).forEach(function (b, bi) {
        var bl = 'Код «' + label + '», кнопка ' + (b.label ? '«' + b.label + '»' : bi + 1);
        if (!b.label) warn(bl + ': без подписи');
        b.steps.forEach(function (s, si) {
          var sl = bl + (b.steps.length > 1 ? ', шаг ' + (si + 1) : '');
          if (s.game && !byId(game.games || [], s.game)) err(sl + ': мини-игра удалена');
          if (!s.game && !s.text && !s.opens.length && !s.actions.length) warn(sl + ': ничего не делает');
          s.opens.forEach(function (id) { if (!byId(game.blocks, id)) err(sl + ': открывает удалённый блок'); });
          if (s.chapter > game.chapters.length) err(sl + ': глава ' + s.chapter + ' не существует');
        });
      });
      if (!c.opens.length && !c.answer && !c.actions.length && !c.variants.length && !c.term && !(c.buttons || []).length) warn('Код «' + label + '» ничего не открывает, без ответа и действий');
      c.opens.concat(c.deniedOpens).forEach(function (id) {
        if (!byId(game.blocks, id)) err('Код «' + label + '» открывает удалённый блок');
      });
      if (c.chapter > game.chapters.length) err('Код «' + label + '»: глава ' + c.chapter + ' не существует');
    });
    function opensBlock(id) {
      return game.codes.some(function (c) {
        return c.opens.indexOf(id) >= 0 || c.deniedOpens.indexOf(id) >= 0 ||
          c.variants.some(function (v) { return v.opens.indexOf(id) >= 0; }) ||
          (c.buttons || []).some(function (b) { return b.steps.some(function (s) { return s.opens.indexOf(id) >= 0 || s.actions.some(function (a) { return a.type === 'open' && (a.blocks || []).indexOf(id) >= 0; }); }); }) ||
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
      // П20: «у этого персонажа» — персонаж должен быть; «тому, у кого сработало» — только у правила по личной
      if ((r.on === 'var' || r.on === 'limit') && r.acc && !byId(game.accounts, r.acc)) err('Правило «' + (r.name || r.var || '?') + '»: персонажа нет');
      var pv = (r.on === 'var' || r.on === 'limit') && sharedVar(game, r.var) && sharedVar(game, r.var).personal;
      if (!pv && (r.actions || []).some(function (a) { return a.to === 'hit'; })) warn('Правило «' + (r.name || '?') + '»: «тому, у кого сработало» — только у правила по личной переменной; здесь — всем');
    });
    // П20 (основа 4): картинка и звук события — из медиа пакета
    (game.notices || []).forEach(function (n) {
      ['img', 'mp3'].forEach(function (k) { if (n[k] && files && !files[n[k]]) warn('Уведомление «' + (n.name || n.title || '?') + '»: файла «' + n[k] + '» нет в медиа'); });
    });
    ((game.ticker || {}).ads || []).forEach(function (id) { if (!byId(game.notices, id)) warn('Бегущая строка: в рекламе уведомления «' + id + '» нет'); });
    // П23 (Т32-1 А): окна «за N мин» из условий терминала (их пишет Twine)
    (game.termWins || []).forEach(function (w) {
      var sv = sharedVar(game, w.var);
      if (!sv) warn('Окно терминала «$' + w.var + ' за ' + w.min + ' мин»: нет такой общей переменной');
      else if (w.acc && !byId(game.accounts, w.acc)) warn('Окно терминала «$' + w.var + ' за ' + w.min + ' мин»: нет персонажа «' + w.acc + '»');
    });
    function varsIn(text, owner) {
      String(text || '').replace(/\{\{\s*\$?([A-Za-z_][A-Za-z0-9_]*)(?:@([^{}]+?))?\s*\}\}/g, function (all, n, ref) {
        if (!sharedVar(game, n)) warn(owner + ': {{' + n + '}} — нет такой общей переменной («Общее» → «Общие переменные»)');
        else if (ref && !accRef(game, ref)) warn(owner + ': {{' + n + '@' + ref + '}} — нет такого персонажа (имя, номер «#N» или id)');
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
    // П25: мини-игры
    (game.games || []).forEach(function (x) {
      var pr = x.pairs.filter(function (p) { return p.ok && p.no; });
      if (gameQr(x) && !x.qrList.length && !Object.keys(x.qrBy).length) warn('Мини-игра «' + x.name + '» (камера на QR): годится любой QR — лучше указать свои');
      if (x.kind === 'qr2' && !x.partners.length) err('Мини-игра «' + x.name + '» (вдвоём и больше): не отмечен ни один участник');
      // П30: развилки
      x.forks.forEach(function (f, i) {
        var fn = 'Мини-игра «' + x.name + '», развилка ' + (i + 1);
        if (f.branches.length < 2) warn(fn + ': меньше двух исходов — выбора не будет');
        f.branches.forEach(function (b, j) { if (!b.name.trim()) err(fn + ', исход ' + (j + 1) + ': нет названия (кнопки)'); });
        if (f.var && !sharedVar(game, f.var)) warn(fn + ': переменной «' + f.var + '» нет в общих — выбор получит только терминал');
        if (f.by === 'each' && x.kind !== 'qr2') warn(fn + ': «каждый сам себе» действует только вдвоём и больше');
      });
      if (x.kind !== 'voice2') { if (x.kind === 'wires' && !x.partners.length) warn('Мини-игра «' + x.name + '» (провода): нет напарника — схема будет на том же экране'); return; }
      if (!pr.length) err('Мини-игра «' + x.name + '»: нет ни одной пары вариантов');
      else if (pr.length < x.stages) warn('Мини-игра «' + x.name + '»: этапов ' + x.stages + ', а пар ' + pr.length + ' — пары будут повторяться');
      x.pairs.forEach(function (p, i) {
        if ((p.ok || p.no) && !(p.ok && p.no)) warn('Мини-игра «' + x.name + '», пара ' + (i + 1) + ': нужны оба варианта');
        if (p.ok && p.no && voiceNorm(p.ok) === voiceNorm(p.no)) err('Мини-игра «' + x.name + '», пара ' + (i + 1) + ': варианты одинаковые');
        [p.ok, p.no].forEach(function (t) { if (t && !voiceNorm(t)) warn('Мини-игра «' + x.name + '»: вариант «' + t + '» нельзя сказать (нет слов)'); });
      });
      if (!x.stageSec && !x.totalSec && !x.buttonsAfter) warn('Мини-игра «' + x.name + '»: без времени и без кнопок — если телефон не расслышит, игра не кончится');
    });
    // П25: взлом
    if (hackInGame(game)) {
      if (!game.hack) normHack(game);
      if (game.hack.defendCode) claim(game.hack.defendCode, 'защита от взлома');
      if (!game.hack.shakes && !game.hack.defendCode) warn('Взлом: жертва не может защититься (нет ни встряхиваний, ни кода)');
      if (game.wave.real === 0 && game.hack.mode === 'wave') err('Взлом: на шкале нет настоящих каналов');
    }
    // П25: шпионаж текстом
    if (spyInGame(game)) {
      if (!game.spy) normSpy(game);
      var sp = game.spy;
      game.accounts.forEach(function (a) {
        if (a.spyCode) claim(a.spyCode, 'код прослушки «' + (a.name || '?') + '»');
        (a.spyCodes || []).forEach(function (xc) {
          claim(xc.code, 'код прослушки «' + (a.name || '?') + '» (' + spyKindsText(xc).toLowerCase() + ')');
          if (!xc.text && !xc.sound && !xc.video) warn('Шпионаж: у кода прослушки «' + xc.code + '» не отмечен ни один вид — подключиться можно, но ничего не будет');
        });
      });
      if (sp.checkCode) claim(sp.checkCode, 'проверка линии (шпионаж)');
      if (sp.breakCode) claim(sp.breakCode, 'прервать прослушку (шпионаж)');
      game.accounts.forEach(function (a) {
        if (a.modules.indexOf('spy') >= 0 && !SPY_KINDS.some(function (k) { return (a.spyKinds || {})[k[0]]; }) &&
          JSON.stringify(game.codes.concat(game.rules)).indexOf('"spykind"') < 0) warn('Шпионаж: у «' + (a.name || '?') + '» нет ни одного вида перехвата и нет действия «Вид перехвата» — слушать нечем');
      });
      if (sp.mode === 'code' && !game.accounts.some(function (a) { return a.spyCode; })) warn('Шпионаж: режим «по коду», но ни у одного персонажа нет кода прослушки — слушать некого');
      if (!sp.breakCode && !sp.breakShakes) warn('Шпионаж: жертва не может прервать прослушку (нет ни кода, ни встряхиваний)');
      if (!sp.checkCode && !sp.checkSettings) warn('Шпионаж: жертве негде проверить линию (нет кода и строки в настройках)');
    }
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
      out.phrases.push({ id: c.id, text: text, max: c.voiceMax || (c.term ? 1 : 0), every: (c.voiceEvery || 0) * 1000, net: net, term: c.term, mine: mineToo, scr: !!c.voiceScreen });
    });
    // П25: «код прослушки» словами — голосом у шпиона (цифрами — как обычный набранный код)
    var me = byId(game.accounts, state.account);
    if (me && me.modules.indexOf('spy') >= 0) game.accounts.forEach(function (a) {
      var t = voiceNorm(a.spyCode);
      if (a.id !== me.id && t && /[а-яa-z]/.test(t)) out.phrases.push({ id: 'spy:' + a.id, text: t, max: 0, every: 0, net: [], mine: true });
    });
    // П25 (06, 148): защита от взлома фразой — у всех, если в пакете есть «Взлом»
    if (game.hack && game.hack.defendCode && hackInGame(game)) { var dt = voiceNorm(game.hack.defendCode); if (dt && /[а-яa-z]/.test(dt)) out.phrases.push({ id: 'hackdef', text: dt, max: 0, every: 0, net: [], mine: true }); }
    out.spyable = spyInGame(game);
    out.vidable = out.spyable && !!game.spy && !!game.spy.video;   // П26 (06, 156): камера жертвы — служба с типом «камера»
    out.vidCam = game.spy && game.spy.videoCam === 'back' ? 'back' : 'front';
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
    { id: 'spy', name: 'Перехват (шпионаж)', tab: 'ПЕРЕХВАТ', hint: 'П25: вкладка программы шпиона — речь другого телефона приходит текстом; настройка — «Сеть и события» → «Шпионаж»' },
    { id: 'hack', name: 'Взлом (чтение экрана)', tab: 'ВЗЛОМ', hint: 'П25: вкладка программы взлома — ловля волны, экран жертвы размыт, читается полосой; настройка — «Сеть и события» → «Взлом»' },
    { id: 'voice', name: 'Голос', hint: 'микрофон слушает ключевые фразы (у кодов) и цифры; режим — в карточке «Голос»; 🎙 в шапке' }
  ];
  var RETIRED = {};
  MODULES.forEach(function (m) { if (m.retired) RETIRED[m.id] = true; });
  var MOD_OFF = [['hidden', 'скрыта'], ['denied', '«НЕТ ДОСТУПА»'], ['broken', '«ПОВРЕЖДЕНО», чинится кодом']];

  root.SG = {
    MODULES: MODULES,
    SPY_MODES: SPY_MODES, SPY_FX: SPY_FX, ulawEnc: ulawEnc, ulawDec: ulawDec, b64enc: b64enc, b64dec: b64dec, normSpy: normSpy, normSpyKinds: normSpyKinds, SPY_KINDS: SPY_KINDS, spyKindsOf: spyKindsOf, spyKindsText: spyKindsText, normHack: normHack, HACK_RESULT: HACK_RESULT, HACK_LOOK: HACK_LOOK, hackInGame: hackInGame, freqOf: freqOf, GAME_REPEAT: GAME_REPEAT, GAME_KINDS: GAME_KINDS, SOUND_EVENTS: SOUND_EVENTS, soundFor: soundFor, normGame: normGame, normFork: normFork, forkCan: forkCan, gameCan: gameCan, gameQr: gameQr, qrFits: qrFits, qrNorm: qrNorm, spyTargets: spyTargets, spySource: spySource, spyInGame: spyInGame,
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
    normBtn: normBtn,
    normBtnStep: normBtnStep,
    btnNow: btnNow,
    pickVariant: pickVariant,
    codeNeeds: codeNeeds,
    codeOutcome: codeOutcome,
    moduleState: moduleState,
    appsFor: appsFor,
    expandActions: expandActions,
    termValue: termValue,
    sharedVar: sharedVar,
    normEvent: normEvent, EVENT_KEYS: EVENT_KEYS, accRef: accRef, varValue: varValue, winValue: winValue, initOf: initOf, maxOf: maxOf, accIds: accIds, pvKey: pvKey, whenValue: whenValue, WIN_MAX: WIN_MAX,
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
