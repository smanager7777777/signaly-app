// СИГНАЛЫ — тестовый пакет сети (вымышленный): общий для net-e2e и mech-e2e (П25); в релиз — test-net-pack.sgpack
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const tmp = '/tmp/sg-net';
mkdirSync(tmp, { recursive: true });
/* ---------- тестовый пакет (вымышленный) ---------- */
export const A = 'aA', B = 'aB', C = 'aC';
export const g = {
  chat: { master: 'Руководитель', anon: 'НЕИЗВЕСТНЫЙ', noPaste: true, delayMax: 60, bossColor: '#ffffff', anonColor: '#000000' },
  format: 1, title: 'СЕТЬ-ТЕСТ', version: 3, firstRun: false, masterCode: '98765432', settingsCode: '0000', sounds: true,
  chapters: [{ id: 'c1', name: 'Глава 1', code: '' }, { id: 'c2', name: 'Глава 2', code: '55555', jam: 0, force: 'green', decode: 3 }],
  accounts: [
    { id: A, name: 'Инженер Тест', profession: 'Инженер', num: '1', login: '111111', spyCode: '7101', spyCodes: [{ code: '7201', video: true }], modules: ['chat', 'notes', 'photo', 'anon', 'delay', 'voice'], voiceMode: 'always',
      colors: { 1: { def: 'blue', pin: 'green' } }, items: [{ type: 'text', text: '**Досье (проба).** Инженер экипажа. Отвечает за реактор и шлюз.' }] },
    { id: B, name: 'Медик Тест', profession: 'Медик', login: '222222', spyCode: 'УХО МЕДИКА', modules: ['chat', 'voice'], voiceMode: 'screen' },
    { id: C, name: 'Пилот Тест', profession: 'Пилот', login: '333333', spyCode: '7103', modules: ['chat', 'voice'], voiceMode: 'button', modState: { notes: 'broken' },
      colors: { 1: { def: 'amber', pin: 'pink' } } },
    { id: 'aD', name: 'Связист Тест', profession: 'Связист', login: '444444', spyCode: '7104', modules: ['chat'] },
    // П24: ещё три персонажа — восемь, как в игре (стенд из 10 «телефонов»: два пульта мастера и восемь персонажей)
    { id: 'aE', name: 'Штурман Тест', profession: 'Штурман', login: '666666', modules: ['chat', 'notes'] },
    { id: 'aF', name: 'Механик Тест', profession: 'Механик', login: '777777', modules: ['chat', 'notes'] },
    { id: 'aG', name: 'Биолог Тест', profession: 'Биолог', login: '888888', modules: ['chat', 'notes'] },
    // П17: тестировщик — в «Заметках» список проверки (новое в сборке, затем всё приложение); текст — tests/tester-note.txt
    { id: 'aT', name: 'Психолог Тест', profession: 'Психолог', num: '7', login: '555555', tester: true, modules: ['chat', 'notes', 'photo', 'anon', 'delay', 'voice', 'spy', 'hack'], voiceMode: 'button', secret: ['photo'],
      spyKinds: { text: 1, sound: 0, video: 0 }, spyCam: 'both',   // П28 (Т40-11 А): сначала только текст; 7301 — + звук, 7302 — + видео
      // П19: досье тестировщика (нажатие на имя в шапке)
      items: [{ type: 'text', text: '**Досье (проба).** Психолог экипажа и тестировщик приложения: список проверки — в «Заметках».' }],
      notes: [{ id: 'nTest', text: readFileSync(resolve(root, 'tests/tester-note.txt'), 'utf8').trim() }] }],
  blocks: [
    { id: 'b1', title: 'Общая сводка', start: true, items: [{ type: 'text', text: 'Сводка.' }] },
    { id: 'bs', title: 'Секретный отчёт', start: false, items: [{ type: 'text', text: 'Секрет.' }] },
    { id: 'bsh', title: 'Схема для передачи', start: true, who: [A], share: true, items: [{ type: 'text', text: 'Схема.' }] },
    { id: 'bg', title: 'Чужой язык', start: true, garble: 2, items: [{ type: 'text', text: 'ПРАВДА ОТКРЫТА' }] },
    { id: 'bv', title: 'Реактор', start: true, items: [{ type: 'text', text: 'Энергия: {{power}} · шлюз: {{open}}' }] },
    // П17 (Т8-5 А): скрытый блок — только кодом SECRET, в списке не виден
    { id: 'bh', title: 'Тайный журнал', start: false, hidden: true, items: [{ type: 'text', text: 'Запись шпиона.' }] }],
  shared: [{ name: 'power', label: 'Энергия', value: 5 }, { name: 'open', label: 'Шлюз открыт', value: false }, { name: 'heat', label: 'Нагрев', value: 3 },
    { name: 'charge', label: 'Заряд', value: 0 }, { name: 'shakes', label: 'Встряхиваний', value: 0 },
    // П20: личная «у каждого своя» — у тестировщика своё начальное (1) и свой максимум (5), у остальных — 0 и 3
    { name: 'hacks', label: 'Взломы', value: 0, personal: true, byAcc: { aT: 1 }, maxBy: { aT: 5 } }],
  // П15: предел энергии 0…10 (центр не даёт выйти), «упёрлась в предел» — правило r3; П20: взломы 0…3 (у тестировщика 0…5)
  limits: [{ var: 'power', min: 0, max: 10 }, { var: 'hacks', min: 0, max: 3 }],
  // П23 (Т32-1 А): окно «за 5 мин» из условий терминала (в игре его пишет «Опубликовать пакет» Twine) — центр считает, пульт показывает
  termWins: [{ var: 'hacks', min: 5, acc: '' }],
  header: { items: [
    // П20: личная в шапке тестировщика — своё значение и «за 1 мин» (сумма прибавлений за окно)
    { var: 'hacks', label: 'ВЗЛОМЫ', show: 'cells', max: 3, who: ['aT'] }, { var: 'hacks', label: 'ЗА 1 МИН', show: 'num', win: 1, who: ['aT'] },{ var: 'power', label: 'ЭНЕРГИЯ', show: 'cells', max: 10, low: 3 }, { var: 'open', label: 'ШЛЮЗ', show: 'num' },
    { var: 'heat', label: 'НАГРЕВ', show: 'cells', max: 30, look: 'bar', fit: true, over: true },
    // П16: слои перезаполнения — 1…10 обычный, 11…20 янтарный, 21…30 сбоят, 31…40 растёт свечение; выше 40 переменная не поднимается
    { var: 'charge', label: 'ЗАРЯД', show: 'cells', max: 10, layers: [{ fx: 'fill' }, { fx: 'color', color: '#ffaa00' }, { fx: 'glitch' }, { fx: 'glow' }] },
    // П19 (замечание 5): пятый показатель — в шапку не помещается (не больше 4), виден в окне по нажатию («+1»)
    { var: 'shakes', label: 'ВСТРЯХ.', show: 'num' }],
    size: 'compact', maxItems: 4,
    info: [{ title: 'Реактор', text: 'Энергия {{power}} из 10.' }], chapters: [{ chapter: 2, sub: '{prof} · ГЛАВА 2', infoTitle: 'СВОДКА ГЛАВЫ 2' }] },
  apps: [
    { id: 'pT', name: 'Градусник', title: 'ТЕРМОМЕТР ТМ-3', who: [B], start: true, uses: 2, showUses: true },
    { id: 'pL', name: 'Детектор лжи', who: [A], start: false },
    // П25 (06, 149): «держи ровно» — измерение 3 с, пока телефон неподвижен
    { id: 'pO', name: 'Пульсоксиметр', title: 'ПУЛЬСОКСИМЕТР', who: [B], start: true, steady: 3, steadyLevel: 2 },
    // П17 (Т8-5 А): скрытый прибор тестировщика — кодом SPY (или голосом «шпион на связи»), сразу на экране
    { id: 'pS', name: 'Сканер шпиона', title: 'СКАНЕР ШПИОНА', who: ['aT'], start: false, hidden: true }],
  codes: [
    { id: 'kBadge', code: 'BADGE-A', answer: 'Инженер Тест' },
    { id: 'kOx', code: 'BADGE-A', app: 'pO', answer: 'SpO₂ 97 %, пульс 72' },
    // П25 (06, 149): HANDS — уведомление только тем, у кого телефон сейчас в руках
    { id: 'kHands', code: 'HANDS', actions: [{ type: 'notify', title: 'В РУКАХ', text: 'Это видят только те, у кого телефон в руках.', to: 'hands' }] },
    { id: 'kT', code: 'BADGE-A', app: 'pT', answer: '36,6 °C', answers: ['37,2 °C'] },
    { id: 'kL', code: 'BADGE-A', app: 'pL', answer: 'ПРАВДА', answers: ['ЛОЖЬ'], order: 'random' },
    { id: 'kOpenL', code: '7001', who: [A], deniedAsWrong: true, actions: [{ type: 'app', app: 'pL', to: 'self' }] },
    { id: 'kAmp', code: 'AMP1', limit: 1, answer: 'Доза получена', emptyText: 'Ампула пуста', variants: [{ who: [A], answer: 'Инженеру: прилив сил' }] },
    { id: 'kBox', code: 'BOX8', limit: 8, perAcc: true, showLeft: true, answer: 'Стимулятор', mineText: 'Вы уже получили свою дозу' },
    { id: 'kDoor', code: 'DOOR', sign: 2, signWindow: 60, answer: 'Дверь открыта' },
    { id: 'kAl', code: 'ALARM1', actions: [{ type: 'alarm', alarm: 'al1', on: true }] },
    { id: 'kAlOff', code: 'ALOFF', actions: [{ type: 'alarm', on: false }] },
    { id: 'kGl', code: 'GL1', actions: [{ type: 'glitch', glitch: 'g1', to: 'self' }] },
    { id: 'kRep', code: 'REP', actions: [{ type: 'module', module: 'notes', on: 'on', to: 'self' }] },
    // голос (П-58): «императив блок» — сбой, «слава лидеру» — сказать или напечатать; ключевой телефон (Инженер) — второй и оба
    { id: 'kV1', code: '', voice: 'императив блок', actions: [{ type: 'glitch', glitch: 'gV', to: 'self' }] },
    { id: 'kV2', code: 'СЛАВА ЛИДЕРУ', voice: 'слава лидеру', actions: [{ type: 'fix', glitch: 'gV', to: 'self' }] },
    { id: 'kV3', code: '', voice: 'императив блок второй', who: [A], voiceMax: 1, actions: [{ type: 'glitch', glitch: 'gV', to: [B] }] },
    { id: 'kV4', code: '', voice: 'императив блок оба', who: [A], actions: [{ type: 'glitch', glitch: 'gV', to: [A, B] }] },
    { id: 'kV5', code: '', voice: 'слава лидеру второй', who: [A], actions: [{ type: 'fix', glitch: 'gV', to: [B] }] },
    { id: 'kV6', code: '', voice: 'слава лидеру оба', who: [A], actions: [{ type: 'fix', glitch: 'gV', to: [A, B] }] },
    { id: 'kV9', code: '', voice: 'сигнал терминалу', term: true, who: [C] },
    { id: 'kV7', code: '', voice: 'внимание экипаж', voiceMax: 1, voiceEvery: 60, actions: [{ type: 'notify', title: 'ВНИМАНИЕ ЭКИПАЖ', text: 'Вы сказали первым.', to: 'self' }] },
    { id: 'kV8', code: '4242', answer: 'ГОЛОС: КОД ПРИНЯТ' },
    { id: 'kPow', code: 'POW+', actions: [{ type: 'term', name: 'power', op: 'add', value: '1' }] },
    { id: 'kPowQ', code: 'POWQ', answer: 'Сейчас {{power}}' },
    { id: 'kGate', code: 'GATE', answer: 'Шлюз открыт', when: [{ var: 'power', op: '>=', value: '8' }, { var: 'open', op: '=', value: 'да' }] },
    // П15: шлюз — кодами; нагрев (перегрузка шкалы); режимы отказа «когда»
    { id: 'kOpen', code: 'OPEN', answer: 'Шлюз: {{open}}', actions: [{ type: 'term', name: 'open', value: 'да' }] },
    { id: 'kShut', code: 'SHUT', answer: 'Шлюз: {{open}}', actions: [{ type: 'term', name: 'open', value: 'нет' }] },
    { id: 'kHeat', code: 'HEAT+', actions: [{ type: 'term', name: 'heat', op: 'add', value: '10' }] },
    { id: 'kHeat0', code: 'HEAT0', actions: [{ type: 'term', name: 'heat', value: '3' }] },
    // П16: проба голоса — пароли разной длины (короткий — часть длинных; длинная фраза важнее короткой)
    { id: 'kP1', code: '', voice: 'апельсин', answer: 'ПАРОЛЬ 1 (1 слово)', note: 'проба голоса' },
    { id: 'kP2', code: '', voice: 'зелёный апельсин лежит в траве', answer: 'ПАРОЛЬ 2 (5 слов)', note: 'проба голоса' },
    { id: 'kP3', code: '', voice: 'зелёный апельсин лежит в траве и готовится быть съеденным мной сегодня', answer: 'ПАРОЛЬ 3 (11 слов)', note: 'проба голоса' },
    { id: 'kP4', code: '', voice: 'синий ключ', answer: 'ПАРОЛЬ 4 (2 слова)', note: 'проба голоса' },
    { id: 'kP5', code: '', voice: 'красная звезда горит над северным отсеком', answer: 'ПАРОЛЬ 5 (6 слов)', note: 'проба голоса' },
    { id: 'kP6', code: '', voice: 'код доступа семь три девять', answer: 'ПАРОЛЬ 6 (слова и цифры)', note: 'проба голоса' },
    { id: 'kP7', code: '', voice: 'капитан', answer: 'ПАРОЛЬ 7 (частое слово)', note: 'проба голоса' },
    { id: 'kP8', code: '', voice: 'медленно и тихо открывается старая дверь', answer: 'ПАРОЛЬ 8 (6 слов, тихо и быстро)', note: 'проба голоса' },
    { id: 'kChg', code: 'CHG+', answer: 'Заряд {{charge}}', actions: [{ type: 'term', name: 'charge', op: 'add', value: '5' }] },
    { id: 'kChg0', code: 'CHG0', actions: [{ type: 'term', name: 'charge', value: '0' }] },
    { id: 'kCore', code: 'CORE', answer: 'Ядро доступно', when: [{ var: 'heat', op: '>=', value: '100' }], whenMode: 'inactive', whenText: 'Нагрев {{heat}} — ядро откроется при 100.' },
    { id: 'kHid', code: 'HIDDEN', answer: 'Тайник', when: [{ var: 'heat', op: '>=', value: '100' }], whenMode: 'wrong' },
    { id: 'kSecret', code: 'SECRET', opens: ['bh'] },
    { id: 'kSpk1', code: '7301', answer: 'Перехват: добавлен звук.', who: ['aT'], actions: [{ type: 'spykind', on: true, sound: true }] },
    { id: 'kSpk2', code: '7302', answer: 'Перехват: добавлено видео.', who: ['aT'], actions: [{ type: 'spykind', on: true, video: true, text: 'ОТКРЫТ ВИДЕОКАНАЛ. Камера цели — со следующего подключения.' }] },
    { id: 'kSpk0', code: '7300', answer: 'Перехват: снова только текст.', who: ['aT'], actions: [{ type: 'spykind', on: false, sound: true, video: true }] },
    { id: 'kSpy', code: 'SPY', voice: 'шпион на связи', who: ['aT'], actions: [{ type: 'app', app: 'pS', to: 'self' }] },
    // П19: скрытый прибор кодом со своим ответом — сначала окно, после OK — прибор
    { id: 'kSpyN', code: 'SPYN', answer: 'Сканер настроен на частоту шпиона.', who: ['aT'], actions: [{ type: 'app', app: 'pS', to: 'self' }] },
    { id: 'kCam', code: 'CAM', who: ['aT'], actions: [{ type: 'module', module: 'photo', on: 'open', to: 'self' }] },
    // П20: личные — HACK (+1 себе), HACK0 (сброс себе), HACKQ (своё и чужое); «перегрев» — правило r10 (≥ 3 за 1 мин → авария только этому телефону), COOL — снять
    { id: 'kHack', code: 'HACK', answer: 'Взлом: {{hacks}}', actions: [{ type: 'term', name: 'hacks', op: 'add', value: '1' }] },
    { id: 'kHack0', code: 'HACK0', answer: 'Взломы сброшены', actions: [{ type: 'term', name: 'hacks', value: '0' }] },
    { id: 'kHackQ', code: 'HACKQ', answer: 'Мои взломы: {{hacks}} · у Инженера: {{hacks@Инженер Тест}} · у №7: {{hacks@#7}}' },
    { id: 'kHackW', code: 'HACKW', answer: 'Можно взламывать', when: [{ var: 'hacks', op: '<', value: '2', win: 1 }], whenMode: '', whenText: '' },
    // П26 (06, 154): фраза «только при экране в приложении» — в фоне молчит
    { id: 'kScr', code: '', voice: 'только при экране', voiceScreen: true, who: [A], answer: 'Фраза сработала в приложении' },
    { id: 'kCool', code: 'COOL', voice: 'охлаждение', answer: 'Телефон охлаждён', actions: [{ type: 'alarm', one: true, on: false }] },
    // П20 (Т15): «После ввода» — NOWB сразу открывает блок (без окна), WINS — окно, потом сканер; отказ — всегда окном
    { id: 'kNowB', code: 'NOWB', answer: 'Этого окна не должно быть', opens: ['bs'], after: 'now' },
    { id: 'kWinS', code: 'WINS', who: ['aT'], after: 'window', actions: [{ type: 'app', app: 'pS', to: 'self' }] },
    // П20 (основа 4): события — NEWS в бегущую строку всем, ANN — окно с картинкой и звуком «играть сразу», NEWS0 — убрать строку
    { id: 'kNews', code: 'NEWS', actions: [{ type: 'notify', notice: 'n2', to: [] }] },
    { id: 'kAnn', code: 'ANN', actions: [{ type: 'notify', notice: 'n3', to: [] }] },
    { id: 'kVideo', code: 'VIDEO', actions: [{ type: 'notify', notice: 'n6', to: 'self' }] },
    { id: 'kNews0', code: 'NEWS0', actions: [{ type: 'unticker', to: [] }] },
    { id: 'kBits', code: 'BITS', actions: [{ type: 'glitch', glitch: 'g01', to: 'self' }] },
    { id: 'kTypo', code: 'TYPO', actions: [{ type: 'glitch', glitch: 'gTy', to: 'self' }] },
    { id: 'kGame', code: 'GAME', actions: [{ type: 'game', game: 'mg1', to: 'self' }] },
    { id: 'kGame2', code: 'GAME2', actions: [{ type: 'game', game: 'mg2', to: 'self' }] },
    { id: 'kSlide', code: 'SLIDE', actions: [{ type: 'game', game: 'mg3', to: 'self' }] },
    { id: 'kCodeG', code: 'CODEG', actions: [{ type: 'game', game: 'mg4', to: 'self' }] },
    { id: 'kWires', code: 'WIRES', actions: [{ type: 'game', game: 'mg5', to: 'self' }] },
    { id: 'kWires2', code: 'WIRES2', actions: [{ type: 'game', game: 'mg5', level: 2, to: 'self' }] },
    { id: 'kNote', code: 'NOTE', actions: [{ type: 'notify', title: 'ДЛЯ МЕДИКА', text: 'Срочно в медотсек', to: [B] }, { type: 'open', blocks: ['bs'], to: [B] }] }],
  // П25 (06, 146): шпионаж текстом — у тестировщика «ПЕРЕХВАТ» по коду прослушки (7101 Инженер, «УХО МЕДИКА» словами, 7103, 7104);
  // сеанс 2 мин, перегрев 1 мин; у жертвы глитчи с 5-й секунды; «Проверка линии» — ЛИНИЯ или настройки 0000; прервать — РАЗРЫВ или встряхнуть 3 раза
  spy: { name: 'ПЕРЕХВАТ', mode: 'wave', dv: 2, sound: 'both', soundDelay: 2, video: true, videoCam: 'front', videoWho: 'aT', slider: true, sliderSpeed: 12, sliderBand: 34, sliderZero: 'cut', maxMin: 2, coolMin: 1, cutCoolMin: 1, glitch: true, glitchFrom: 5, glitchGrow: 20, glitchMax: 40,
    // П26 (06, 155): вид глитча у жертвы — 0/1, вибрация, рябь, «не те буквы»
    fx: [{ kind: 'bits', power: 1, grow: 20 }, { kind: 'vibe', power: 20, grow: 30 }, { kind: 'ripple', power: 15, grow: 20 }, { kind: 'typo', power: 5, grow: 10 }],
    checkCode: 'ЛИНИЯ', checkSettings: true, breakCode: 'РАЗРЫВ', breakShakes: 3, breakGap: 5,
    heatActions: [{ type: 'notify', title: 'ПЕРЕГРЕВ ПЕРЕХВАТА', text: 'Программа остывает.', to: 'self' }] },
  // П25 (06, 147): мини-игры «два выбора голосом» — GAME (3 этапа по 20 с, 3 ошибки, кнопки через 10 с), GAME2 (4 этапа, 40 с на всё, только голос, снова — через 1 мин)
  games: [{ id: 'mg1', name: 'Шлюз', title: 'ОТКРОЙТЕ ШЛЮЗ', stages: 3, stageSec: 20, totalSec: 0, maxErr: 3, buttonsAfter: 10, repeat: 'any', random: true,
    pairs: [{ q: 'Какой цвет у аварии?', ok: 'красный', no: 'синий' }, { q: 'Где выход?', ok: 'северный шлюз', no: 'южный шлюз' }, { q: 'Куда повернуть?', ok: 'налево', no: 'направо' }, { ok: 'открыть', no: 'закрыть' }],
    okText: 'Шлюз открыт.', failText: 'Шлюз заблокирован.',
    okActions: [{ type: 'notify', title: 'ШЛЮЗ ОТКРЫТ', text: 'Мини-игра пройдена.', to: 'self' }], errActions: [{ type: 'beep', sound: 'err', to: 'self' }],
    failActions: [{ type: 'glitch', glitch: 'g1', to: 'self' }] },
    { id: 'mg2', name: 'Пароль', title: 'НАЗОВИТЕ ПАРОЛЬ', stages: 4, stageSec: 0, totalSec: 40, maxErr: 2, buttonsAfter: 0, repeat: 'pause', pauseMin: 1, random: false,
      pairs: [{ ok: 'альфа', no: 'бета' }, { ok: 'гамма', no: 'дельта' }, { ok: 'омега', no: 'сигма' }, { ok: 'зенит', no: 'надир' }],
      okActions: [{ type: 'term', name: 'hacks', value: '0' }] },
    // П25 (06, 151): конструктор — ползунок (SLIDE), код под таймером (CODEG), провода со схемой у Медика (WIRES; WIRES2 — уровень 2)
    { id: 'mg3', kind: 'slider', name: 'Ползунок', title: 'УДЕРЖИТЕ СИГНАЛ', stages: 2, holdSec: 4, speed: 20, band: 24, silent: 8, maxErr: 3, stageSec: 30, failFrom: 'stage',
      okActions: [{ type: 'notify', title: 'СИГНАЛ УДЕРЖАН', text: 'Ползунок пройден.', to: 'self' }] },
    { id: 'mg4', kind: 'code', name: 'Код', title: 'ЗАПОМНИТЕ КОД', stages: 2, digits: 3, showSec: 2, grow: 1, maxErr: 2, stageSec: 25 },
    { id: 'mg5', kind: 'wires', name: 'Провода', title: 'ОБЕЗВРЕДЬТЕ', stages: 1, wires: 4, cuts: 2, partners: [B], maxErr: 1, stageSec: 60,
      failActions: [{ type: 'alarm', alarm: 'al1', on: true }] }],
  // П25 (06, 141, 148): взлом — ловля волны (6 каналов: 3 настоящих, 1 ловушка, держать 3 с), экран жертвы полосой; защита — встряхнуть 3 раза или ЩИТ (словом «щит»)
  wave: { channels: 6, real: 3, trap: 1, holdSec: 3, tol: 2.5, trapSec: 6, trapGlitch: 'g1', sound: true, music: ['radio.mp3'] },   // П26: звук шкалы и музыка «для шкалы»
  hack: { name: 'ВЗЛОМ', mode: 'wave', maxMin: 5, coolMin: 2, strip: 2, spyMono: true, look: 'noise', power: 5, powerGrow: 8, from: 30, to: 90, bits: true, bitsGrow: 3, bitsMax: 30, bitsOnMin: 2, bitsOnMax: 8, dv: 3,
    typo: true, shakes: 3, gap: 5, defendCode: 'ЩИТ', result: 'blockbeep', blockMin: 1, beepN: 3, okActions: [{ type: 'term', name: 'hacks', op: 'add', value: '1' }] },
  // П25 (06, 152): свои звуки — успех мини-игры (всем), сообщение в чате (только у Медика)
  soundSet: [{ ev: 'win', file: 'win.mp3', chapter: 1, who: [] }, { ev: 'msg', file: 'ev.mp3', chapter: 1, who: [B] }],
  alarms: [{ id: 'al1', name: 'Разгерметизация', title: 'РАЗГЕРМЕТИЗАЦИЯ', text: 'Всем в отсек 3.', torch: false },
    { id: 'al2', name: 'Перегрев', title: 'ПЕРЕГРЕВ', text: 'Слишком много взломов. Введите COOL или скажите «охлаждение».', torch: false, siren: false }],
  glitches: [{ id: 'g1', name: 'Сбой экрана', kind: 'visual', fx: ['noise', 'shift'], seconds: 0, fix: 'shake' },
    // П25 (06, 141): буквы → 0/1 (растут) и «не те буквы» — коды BITS и TYPO
    { id: 'g01', name: 'Сбой знаков', kind: 'visual', fx: ['bits'], seconds: 0, fix: 'shake', start: 15, grow: 30, max: 60 },
    { id: 'gTy', name: 'Сбой клавиатуры', kind: 'visual', fx: ['typo'], seconds: 120, fix: 'time', start: 20, grow: 20, max: 60 },
    { id: 'gV', name: 'Сбой системы', kind: 'visual', fx: ['dark', 'scramble'], seconds: 0, fix: 'code', text: 'ИМПЕРАТИВ. ДОСТУП ЗАБЛОКИРОВАН.' }],
  notices: [{ id: 'n1', name: 'Проверка', title: 'ПРОВЕРКА СВЯЗИ', text: 'Ответьте мастеру.' },
    // П20 (основа 4): событие в бегущей строке (по нажатию — целиком, с картинкой и звуком; открытое — в «Данных» → «События»)
    { id: 'n2', name: 'Новости', title: 'НОВОСТИ КОРАБЛЯ', text: 'Реактор работает штатно. Энергия {{power}}.', ticker: true, img: 'ev.png', mp3: 'ev.mp3', leaveOpen: false },
    { id: 'n3', name: 'Объявление', title: 'ОБЪЯВЛЕНИЕ', text: 'Общий сбор в кают-компании.', img: 'ev.png', mp3: 'ev.mp3', playNow: true, folder: 'Объявления' },
    // П25 (06, 152): событие с видео (VIDEO) — в окне, «на весь экран»
    { id: 'n6', name: 'Видео', title: 'ВИДЕОСООБЩЕНИЕ', text: 'Запись с камеры шлюза.', video: 'ev.mp4', folder: 'Видео' },
    { id: 'n4', name: 'Реклама 1', title: 'РЕКЛАМА', text: 'Консервы «Орбита» — вкус дома.', ticker: true, save: false },
    { id: 'n5', name: 'Реклама 2', title: 'РЕКЛАМА', text: 'Скафандры «Луч» — дышите свободно.', ticker: true, save: false }],
  ticker: { k: 3, adsEvery: 2, adsOrder: 'seq', ads: ['n4', 'n5'] },
  votes: [{ id: 'v1', name: 'Музыка', title: 'КАКУЮ МУЗЫКУ?', options: ['Альбом 1', 'Альбом 2'], seconds: 6, term: 'music' }],
  rules: [{ id: 'r1', name: 'Пробой', on: 'event', event: 'breach', actions: [{ type: 'notify', title: 'ПРОБОЙ', text: 'Пробой корпуса!', to: [] }] },
    { id: 'r2', name: 'Энергия в норме', on: 'var', var: 'power', op: '>=', value: '8', actions: [{ type: 'notify', title: 'ЭНЕРГИЯ НОРМА', text: 'Теперь {{power}}', to: [] }] },
    // П16 (основа 2): события самого телефона (выполняет телефон Инженера)
    { id: 'r4', name: 'Встряхнули', on: 'phone', sensor: 'shake', who: [A], actions: [{ type: 'term', name: 'shakes', op: 'add', value: '1' }, { type: 'beep', to: 'self' }] },
    { id: 'r5', name: 'Экраном вниз', on: 'phone', sensor: 'facedown', who: [A], every: 5, actions: [{ type: 'torch', n: 2, to: 'self' }, { type: 'event', name: 'face_down' }] },
    { id: 'r6', name: 'Долго не смотрел', on: 'phone', sensor: 'locked', seconds: 2, who: [A], actions: [{ type: 'notify', title: 'ИНЖЕНЕР НЕ СМОТРЕЛ', text: 'Экран был заблокирован.', to: [B] }, { type: 'torch', n: 4, to: [B] }] },
    { id: 'r7', name: 'Снимок', on: 'phone', sensor: 'photo', who: [A], actions: [{ type: 'term', name: 'shakes', value: '100' }] },
    // П17 (Т8-6 Б): «не в приложении дольше N с» и «только при выключенном экране» (Пилот)
    { id: 'r8', name: 'Не в приложении', on: 'phone', sensor: 'away', seconds: 10, who: [C], actions: [{ type: 'notify', title: 'ПИЛОТ НЕ В ПРИЛОЖЕНИИ', text: 'Вернитесь.', to: [B] }] },
    { id: 'r9', name: 'В кармане', on: 'phone', sensor: 'shake', screen: 'off', who: [C], actions: [{ type: 'term', name: 'shakes', op: 'add', value: '10' }] },
    // П25 (06, 149): Медик взял телефон в руки — короткий сигнал
    { id: 'r11', name: 'Взяли в руки', on: 'phone', sensor: 'hands', who: [B], every: 60, actions: [{ type: 'beep', to: 'self' }, { type: 'term', name: 'shakes', op: 'add', value: '1' }] },
    { id: 'r10', name: 'Перегрев', on: 'var', var: 'hacks', op: '>=', value: '3', win: 1, actions: [{ type: 'alarm', alarm: 'al2', one: true, on: true },
      { type: 'notify', title: 'ПЕРЕГРЕВ', text: 'Взломов за минуту: {{hacks}}.', to: 'hit' }] },
    { id: 'r3', name: 'Реактор полон', on: 'limit', var: 'power', side: 'max', actions: [{ type: 'notify', title: 'РЕАКТОР ЗАРЯЖЕН ПОЛНОСТЬЮ', text: 'Энергия {{power}} из 10.', to: [] }] }]
};
// П20: картинка и звук события (вымышленные: таблица и тон)
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x160:rate=1', '-frames:v', '1', `${tmp}/ev.png`]);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1', '-b:a', '64k', `${tmp}/ev.mp3`]);
// П25 (06, 152): видео события (вымышленное: таблица 2 с, H.264) и свой звук (другой тон)
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${tmp}/ev.mp4`]);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=0.4', '-b:a', '64k', `${tmp}/win.mp3`]);
// П26 (06, 153): музыка на шкале — вымышленная мелодия (чередование тонов, 8 с)
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', "aevalsrc=0.3*sin(2*PI*(440+220*floor(mod(t*2\\,4)))*t):s=22050:d=8", '-b:a', '64k', `${tmp}/radio.mp3`]);
/* П25: пакет из любого варианта игры (mech-e2e меняет время сеансов) */
export async function makePack(game) {
  const zip = new JSZip();
  zip.file('game.json', JSON.stringify(game));
  zip.file('media/ev.png', readFileSync(`${tmp}/ev.png`));
  zip.file('media/ev.mp3', readFileSync(`${tmp}/ev.mp3`));
  zip.file('media/ev.mp4', readFileSync(`${tmp}/ev.mp4`));
  zip.file('media/win.mp3', readFileSync(`${tmp}/win.mp3`));
  zip.file('media/radio.mp3', readFileSync(`${tmp}/radio.mp3`));
  return zip.generateAsync({ type: 'nodebuffer' });
}
export const pack = await makePack(g);
writeFileSync(tmp + '/net-test.sgpack', pack);   // в релиз: попробовать сеть на телефонах
