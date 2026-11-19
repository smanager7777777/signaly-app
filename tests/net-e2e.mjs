// СИГНАЛЫ — сквозная проверка сети: настоящий центр (Java, как в APK) + четыре «телефона» в Chromium
// (три игрока и мастерский). Чаты, уведомления, авария, глава всем, ограниченные коды наперегонки, две подписи,
// приборы, сбои, сломанная функция, голосование, отсчёт, правило по событию терминала, очередь без связи,
// передача блока, искажённый текст, настройки 0000, заметки, камера-улика.
// node tests/net-e2e.mjs <playwright> <папка для снимков>     (нужны dist/, javac/java, ffmpeg, python3)
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildJava, startCenter } from './net-test.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const JSZip = require('jszip');
const shots = resolve(process.argv[3] || '/tmp/sg-shots');
const tmp = '/tmp/sg-net';
mkdirSync(shots, { recursive: true });
mkdirSync(tmp, { recursive: true });
let passed = 0, failed = 0;
function ok(c, what) { if (c) { passed++; console.log('  ✓', what); } else { failed++; console.log('  ✗', what); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- тестовый пакет (вымышленный) ---------- */
const A = 'aA', B = 'aB', C = 'aC';
const g = {
  chat: { master: 'Руководитель', anon: 'НЕИЗВЕСТНЫЙ', noPaste: true, delayMax: 60, bossColor: '#ffffff', anonColor: '#000000' },
  format: 1, title: 'СЕТЬ-ТЕСТ', version: 3, firstRun: false, masterCode: '98765432', settingsCode: '0000', sounds: true,
  chapters: [{ id: 'c1', name: 'Глава 1', code: '' }, { id: 'c2', name: 'Глава 2', code: '55555', jam: 0, force: 'green', decode: 3 }],
  accounts: [
    { id: A, name: 'Инженер Тест', profession: 'Инженер', num: '1', login: '111111', modules: ['chat', 'notes', 'photo', 'anon', 'delay', 'voice'], voiceMode: 'always',
      colors: { 1: { def: 'blue', pin: 'green' } } },
    { id: B, name: 'Медик Тест', profession: 'Медик', login: '222222', modules: ['chat', 'voice'], voiceMode: 'screen' },
    { id: C, name: 'Пилот Тест', profession: 'Пилот', login: '333333', modules: ['chat', 'voice'], voiceMode: 'button', modState: { notes: 'broken' },
      colors: { 1: { def: 'amber', pin: 'pink' } } },
    { id: 'aD', name: 'Связист Тест', profession: 'Связист', login: '444444', modules: ['chat'] }],
  blocks: [
    { id: 'b1', title: 'Общая сводка', start: true, items: [{ type: 'text', text: 'Сводка.' }] },
    { id: 'bs', title: 'Секретный отчёт', start: false, items: [{ type: 'text', text: 'Секрет.' }] },
    { id: 'bsh', title: 'Схема для передачи', start: true, who: [A], share: true, items: [{ type: 'text', text: 'Схема.' }] },
    { id: 'bg', title: 'Чужой язык', start: true, garble: 2, items: [{ type: 'text', text: 'ПРАВДА ОТКРЫТА' }] },
    { id: 'bv', title: 'Реактор', start: true, items: [{ type: 'text', text: 'Энергия: {{power}} · шлюз: {{open}}' }] }],
  shared: [{ name: 'power', label: 'Энергия', value: 5 }, { name: 'open', label: 'Шлюз открыт', value: false }, { name: 'heat', label: 'Нагрев', value: 3 },
    { name: 'charge', label: 'Заряд', value: 0 }],
  // П15: предел энергии 0…10 (центр не даёт выйти), «упёрлась в предел» — правило r3
  limits: [{ var: 'power', min: 0, max: 10 }],
  header: { items: [{ var: 'power', label: 'ЭНЕРГИЯ', show: 'cells', max: 10, low: 3 }, { var: 'open', label: 'ШЛЮЗ', show: 'num' },
    { var: 'heat', label: 'НАГРЕВ', show: 'cells', max: 30, look: 'bar', fit: true, over: true },
    // П16: слои перезаполнения — 1…10 обычный, 11…20 янтарный, 21…30 сбоят, 31…40 растёт свечение; выше 40 переменная не поднимается
    { var: 'charge', label: 'ЗАРЯД', show: 'cells', max: 10, layers: [{ fx: 'fill' }, { fx: 'color', color: '#ffaa00' }, { fx: 'glitch' }, { fx: 'glow' }] }],
    info: [{ title: 'Реактор', text: 'Энергия {{power}} из 10.' }], chapters: [{ chapter: 2, sub: '{prof} · ГЛАВА 2', infoTitle: 'СВОДКА ГЛАВЫ 2' }] },
  apps: [
    { id: 'pT', name: 'Градусник', title: 'ТЕРМОМЕТР ТМ-3', who: [B], start: true, uses: 2, showUses: true },
    { id: 'pL', name: 'Детектор лжи', who: [A], start: false }],
  codes: [
    { id: 'kBadge', code: 'BADGE-A', answer: 'Инженер Тест' },
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
    { id: 'kNote', code: 'NOTE', actions: [{ type: 'notify', title: 'ДЛЯ МЕДИКА', text: 'Срочно в медотсек', to: [B] }, { type: 'open', blocks: ['bs'], to: [B] }] }],
  alarms: [{ id: 'al1', name: 'Разгерметизация', title: 'РАЗГЕРМЕТИЗАЦИЯ', text: 'Всем в отсек 3.', torch: false }],
  glitches: [{ id: 'g1', name: 'Сбой экрана', kind: 'visual', fx: ['noise', 'shift'], seconds: 0, fix: 'shake' },
    { id: 'gV', name: 'Сбой системы', kind: 'visual', fx: ['dark', 'scramble'], seconds: 0, fix: 'code', text: 'ИМПЕРАТИВ. ДОСТУП ЗАБЛОКИРОВАН.' }],
  notices: [{ id: 'n1', name: 'Проверка', title: 'ПРОВЕРКА СВЯЗИ', text: 'Ответьте мастеру.' }],
  votes: [{ id: 'v1', name: 'Музыка', title: 'КАКУЮ МУЗЫКУ?', options: ['Альбом 1', 'Альбом 2'], seconds: 6, term: 'music' }],
  rules: [{ id: 'r1', name: 'Пробой', on: 'event', event: 'breach', actions: [{ type: 'notify', title: 'ПРОБОЙ', text: 'Пробой корпуса!', to: [] }] },
    { id: 'r2', name: 'Энергия в норме', on: 'var', var: 'power', op: '>=', value: '8', actions: [{ type: 'notify', title: 'ЭНЕРГИЯ НОРМА', text: 'Теперь {{power}}', to: [] }] },
    { id: 'r3', name: 'Реактор полон', on: 'limit', var: 'power', side: 'max', actions: [{ type: 'notify', title: 'РЕАКТОР ЗАРЯЖЕН ПОЛНОСТЬЮ', text: 'Энергия {{power}} из 10.', to: [] }] }]
};
const zip = new JSZip();
zip.file('game.json', JSON.stringify(g));
const pack = await zip.generateAsync({ type: 'nodebuffer' });
(await import('node:fs')).writeFileSync(tmp + '/net-test.sgpack', pack);   // в релиз: попробовать сеть на телефонах

/* ---------- центр, сервер страниц, браузер ---------- */
buildJava();
const centerFile = tmp + '/center.json';
if (existsSync(centerFile)) rmSync(centerFile);
const PORT = 18795;
let center = await startCenter(PORT, centerFile);
const NET = 'SGNET:ws://127.0.0.1:' + PORT;
const web = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { cwd: resolve(root, 'dist/www'), stdio: 'ignore' });
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=10', '-t', '3', '-pix_fmt', 'yuv420p', `${tmp}/cam.y4m`]);
await sleep(700);
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-video-capture=${tmp}/cam.y4m`, '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function phone(name, find) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1, hasTouch: true, permissions: ['camera', 'microphone'] });
  if (find) await ctx.addInitScript((l) => { window.SG_NET_FIND = l; }, find);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION|navigator.vibrate/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
  await p.goto('http://127.0.0.1:8766/');
  await p.locator('#scr-boot.on').waitFor();
  await p.setInputFiles('#file', { name: 'test.sgpack', mimeType: 'application/zip', buffer: pack });
  await p.locator('#scr-login.on').waitFor();
  return p;
}
const enter = (p, code) => p.evaluate((c) => window.sgPlayer.enter(c, 'pad'), code);
const title = (p) => p.locator('#dlg.on .dlg-title').textContent({ timeout: 4000 }).catch(() => '');
const text = (p) => p.locator('#dlg.on .dlg-text').textContent({ timeout: 1000 }).catch(() => '');
const closeDlg = async (p) => { if (await p.locator('#dlg.on').count()) await p.locator('#dlg .dlg-btns .btn').last().click(); await sleep(60); };
const waitFor = async (fn, ms = 5000) => { const t = Date.now() + ms; while (Date.now() < t) { if (await fn()) return true; await sleep(100); } return false; };

console.log('Сеть: подключение');
const pA = await phone('A'), pB = await phone('B'), pC = await phone('C'), pM = await phone('M');
for (const [p, login] of [[pA, '111111'], [pB, '222222'], [pC, '333333']]) {
  await enter(p, NET);
  await closeDlg(p);
  await enter(p, login);
  await p.locator('#scr-main.on').waitFor();
}
ok(await waitFor(async () => (await pA.locator('#bar-net.up').count()) && (await pB.locator('#bar-net.up').count()) && (await pC.locator('#bar-net.up').count())), 'три телефона подключены к центру (● в шапке)');
await pA.screenshot({ path: `${shots}/net-1-main.png` });

// нет связи: окно «СЕТЬ» объясняет почему и что сделать (замечание автора 16.11: «висит на подключении»)
const pX = await phone('X');
await enter(pX, 'SGNET:ws://127.0.0.1:18797');
ok((await title(pX)) === 'СЕТЬ', 'QR «СЕТЬ» → окно «СЕТЬ»');
ok(await waitFor(async () => (await text(pX)).includes('ПРОВЕРКА СЕТИ'), 6000), 'центр недоступен → окно показывает проверку сети');
ok((await text(pX)).includes('SIGNALY CENTER OK') && (await text(pX)).includes('http://127.0.0.1:18797') && (await text(pX)).includes('точке доступа мастера'), 'совет: точка доступа мастера, адрес в Chrome');
await pX.screenshot({ path: `${shots}/net-0-fail.png` });
await closeDlg(pX);
ok(await waitFor(async () => /НЕТ СВЯЗИ.*ПРОВЕРИТЬ/.test(await pX.locator('#login-net').textContent())), 'экран входа: «нет связи — причина · проверить»');
await pX.locator('#login-net').click();
ok((await title(pX)) === 'СЕТЬ', 'нажатие на строку связи открывает проверку');
await closeDlg(pX);
await enter(pX, NET);
ok(await waitFor(async () => (await text(pX)).includes('СВЯЗЬ ЕСТЬ')), 'верный QR → «СВЯЗЬ ЕСТЬ» в том же окне');
await closeDlg(pX);
await pX.context().close();

// П-62: без QR «СЕТЬ» — после входа телефон сам ищет центр (первым — шлюз точки доступа, затем подсеть)
const pZ = await phone('Z', ['ws://127.0.0.1:18781', 'ws://127.0.0.1:18782', 'ws://127.0.0.1:' + PORT]);
ok(!(await pZ.evaluate(() => window.sgPlayer.state().net)), 'до входа телефон не в сети и QR не сканировали');
await enter(pZ, '444444');
await pZ.locator('#scr-main.on').waitFor();
ok(await waitFor(async () => (await pZ.locator('#bar-net.up').count()) > 0, 8000), 'после входа телефон сам нашёл центр (● в шапке)');
ok((await pZ.evaluate(() => window.sgPlayer.state().net.url)) === 'ws://127.0.0.1:' + PORT, 'найденный адрес центра запомнен');
await pZ.reload();
await pZ.locator('#scr-main.on').waitFor();
ok(await waitFor(async () => (await pZ.locator('#bar-net.up').count()) > 0, 8000), 'после перезапуска — сразу по запомненному адресу');
await pZ.context().close();
const pW = await phone('W', ['ws://127.0.0.1:18783']);
await enter(pW, '333333');
await pW.locator('#bar-net:not([hidden])').click();
ok(await waitFor(async () => (await text(pW)).includes('не найден') && (await text(pW)).includes('ищу сам') && (await text(pW)).includes('QR «СЕТЬ»'), 6000), 'центра не нашлось — окно «СЕТЬ»: «ищу сам», «не найден», совет про QR');
await pW.screenshot({ path: `${shots}/net-0b-search.png` });
await pW.context().close();
await sleep(1500);

// мастерский телефон: QR «СЕТЬ», мастерский код, пульт, «этот телефон — мастерский»
await enter(pM, NET);
await closeDlg(pM);
await enter(pM, '98765432');
await pM.locator('#dlg .btn', { hasText: 'Пульт мастера' }).click();
await pM.locator('#console.on').waitFor();
await pM.locator('label', { hasText: 'Этот телефон — мастерский' }).locator('input').check();
ok(await waitFor(async () => (await pM.locator('.peer.on').count()) >= 4), 'пульт: список телефонов (' + await pM.locator('.peer.on').count() + ' на связи)');
await pM.screenshot({ path: `${shots}/net-2-console.png` });

console.log('Связь');
await pA.locator('#tabs button[data-tab=chat]').click();
await pA.locator('.item.chan', { hasText: 'ОБЩИЙ КАНАЛ' }).click();
await pA.fill('#chatview-input', 'Всем привет');
await pA.click('#chatview-go');
ok(await waitFor(async () => (await pB.evaluate(() => (window.sgPlayer.P.mine().chat || []).some((x) => x.text === 'Всем привет' && x.ch === 'all')))), 'общий канал: сообщение дошло до Медика');
await pB.locator('#tabs button[data-tab=chat]').click();
ok(await pB.locator('.item.chan', { hasText: 'ОБЩИЙ КАНАЛ' }).locator('.new').count() === 1, 'у Медика — непрочитанное в общем канале');
await pB.locator('.item.chan', { hasText: 'Инженер Тест' }).click();
await pB.fill('#chatview-input', 'Лично инженеру');
await pB.click('#chatview-go');
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'Лично инженеру' && x.ch === 'acc:aB')))), 'личное сообщение: Медик → Инженер');
ok(!(await pC.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'Лично инженеру'))), 'Пилот чужое личное не видит');
ok(await waitFor(async () => (await pB.locator('#chatview-list .msg.own', { hasText: 'Лично инженеру' }).count()) === 1 && !(await pB.locator('#chatview-list .msg.own .mh', { hasText: '⌛' }).count())), 'своё сообщение подтверждено центром (без ⌛)');
await pB.screenshot({ path: `${shots}/net-3-chat.png` });
await pB.locator('#chatview-back').click();
await pA.locator('#chatview-back').click();
await pM.locator('.ctabs button', { hasText: 'ПЕРЕПИСКА' }).click();
ok(await pM.locator('.clog .cl', { hasText: 'Лично инженеру' }).count() === 1, 'мастер видит личную переписку (В2)');

console.log('Связь: мастер, анонимно, отложенно, один вход, без вставки');
// мастерский телефон с персонажем пишет от персонажа, а не «от системы» (замечание автора по build-19)
await enter(pM, '98765432');
await pM.locator('#dlg .btn', { hasText: 'Сменить аккаунт' }).click();
await enter(pM, '444444');
await pM.locator('#scr-main.on').waitFor();
await pM.evaluate(() => window.sgPlayer.P.sendChat('acc:aA', 'от связиста'));
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'от связиста' && x.ch === 'acc:aD')))), 'мастерский телефон с персонажем: личное от персонажа, не «система»');
// П-39: второй телефон тем же персонажем — вход блокируется
const pY = await phone('Y');
await enter(pY, NET); await closeDlg(pY);
await enter(pY, '111111');
ok(await waitFor(async () => (await title(pY)) === 'ЭТОТ ПЕРСОНАЖ УЖЕ В СЕТИ'), 'второй вход Инженером: «этот персонаж уже в сети»');
ok(await pY.locator('#scr-login.on').count() === 1 && !(await pY.evaluate(() => window.sgPlayer.state().account)), 'второй телефон вернулся на экран входа');
await pY.close();
// пульт: от имени Руководителя и от имени игрока
await enter(pM, '98765432');
await pM.locator('#dlg .btn', { hasText: 'Пульт мастера' }).click();
await pM.locator('#console.on').waitFor();
await pM.locator('.ctabs button', { hasText: 'ПЕРЕПИСКА' }).click();
await pM.fill('#clog-text', 'Говорит руководитель');
await pM.click('#clog-send');
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'Говорит руководитель' && x.ch === 'all' && x.from.name === 'Руководитель')))), 'пульт: в общий канал от «Руководителя»');
await pM.selectOption('#clog-as', 'aC');
await pM.fill('#clog-text', 'Я пилот, честно');
await pM.click('#clog-send');
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'Я пилот, честно' && x.ch === 'all' && x.from.name === 'Пилот Тест')))), 'пульт: от имени Пилота (входить в его аккаунт не нужно)');
ok(await waitFor(async () => (await pC.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'Я пилот, честно' && x.own)))), 'у самого Пилота — как его сообщение');
await pM.selectOption('#clog-as', '@boss');
await pM.locator('.ccard', { hasText: 'СООБЩЕНИЕ' }).locator('.cwho label', { hasText: 'Медик Тест' }).locator('input').check();
await pM.fill('#clog-text', 'Зайдите ко мне');
await pM.click('#clog-send');
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'Зайдите ко мне' && x.ch === 'acc:@boss')))), 'личное от Руководителя Медику');
await pB.locator('#tabs button[data-tab=chat]').click();
ok(await pB.locator('.item.chan', { hasText: 'Руководитель' }).count() === 1, 'у Медика появился чат с Руководителем');
await pB.locator('.item.chan', { hasText: 'Руководитель' }).click();
await pB.fill('#chatview-input', 'Иду');
await pB.click('#chatview-go');
ok(await waitFor(async () => (await pM.locator('.clog .cl', { hasText: 'Иду' }).count()) === 1), 'ответ Руководителю виден мастеру');
await pB.locator('#chatview-back').click();
await pM.locator('.ccard', { hasText: 'СООБЩЕНИЕ' }).locator('.cwho label', { hasText: 'Медик Тест' }).locator('input').uncheck();
// П-42: анонимно
await pA.locator('#tabs button[data-tab=chat]').click();
await pA.locator('.item.chan', { hasText: 'Медик Тест' }).click();
ok(await pA.locator('#chatview-anon').isVisible() && await pA.locator('#chatview-delay').isVisible(), 'у Инженера кнопки «?» и «⏱»');
await pA.click('#chatview-anon');
await pA.locator('#chatview-input').pressSequentially('Я знаю твою тайну');  // fill() — это вставка, её чат не пускает
await pA.click('#chatview-go');
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'Я знаю твою тайну' && x.ch === 'anon' && !x.from.acc)))), 'анонимное: у Медика — в «НЕИЗВЕСТНЫЙ», без имени');
ok(await waitFor(async () => (await pM.locator('.clog .cl', { hasText: 'Я знаю твою тайну' }).locator('.sm', { hasText: 'Инженер Тест (анонимно)' }).count()) === 1), 'мастер видит настоящего отправителя');
ok(await pA.locator('#chatview-list .msg.own .mh', { hasText: 'ВЫ (АНОНИМНО)' }).count() === 1, 'у Инженера — «ВЫ (АНОНИМНО)»');
await pB.locator('#tabs button[data-tab=chat]').click();
await pB.locator('.item.chan', { hasText: 'НЕИЗВЕСТНЫЙ' }).click();
ok(!(await pB.locator('#chatview-send').isVisible()), 'анониму не ответить');
await pB.screenshot({ path: `${shots}/net-3-anon.png` });
await pB.locator('#chatview-back').click();
ok(!(await pB.evaluate(() => { window.sgPlayer.P.openChan('all'); const r = document.getElementById('chatview-anon').hidden; window.sgPlayer.P.closeTop(); return !r; })), 'у Медика кнопки «?» нет');
// П-43: отложенно — через минуту; мастер видит и удаляет
await pA.click('#chatview-delay');
await pA.locator('#dlg .btn', { hasText: '1 мин' }).click();
ok(await waitFor(async () => (await pA.locator('#chatview-delay').textContent()) === '⏱1'), 'выбрана отправка через 1 минуту');
await pA.fill('#chatview-input', 'Через минуту');
await pA.click('#chatview-go');
ok(await waitFor(async () => (await pA.locator('#chatview-list .msg.own .mh', { hasText: '⏱' }).count()) === 1), 'у отправителя — время отправки ⏱');
await pA.screenshot({ path: `${shots}/net-3-later.png` });
ok(await waitFor(async () => (await pM.locator('#clog-later .cl', { hasText: 'Через минуту' }).count()) === 1), 'мастер видит отложенное');
await pM.screenshot({ path: `${shots}/net-3-console-chat.png` });
await pM.locator('#clog-later .cl', { hasText: 'Через минуту' }).locator('.btn', { hasText: 'Удалить' }).click();
await pM.locator('#dlg .btn', { hasText: 'Удалить' }).click();
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'Через минуту' && x.dropped)))), 'мастер удалил — телефон отправителя узнал');
ok(await pA.locator('#chatview-list .msg.own', { hasText: 'Через минуту' }).locator('.mh', { hasText: '⏱' }).count() === 1, 'у отправителя по-прежнему «⏱», как будто ещё уйдёт (Ч2 — б)');
ok(await waitFor(async () => (await pM.locator('#clog-later .cl').count()) === 0), 'список отложенных пуст');
// короткая задержка напрямую: доставка в срок
const atSoon = await pA.evaluate(() => window.sgPlayer.net.now() + 2500);
await pA.evaluate((t) => { const N = window.sgPlayer.net; N.msg(['acc:aB'], 'chat', { text: 'точно в срок' }, { at: t }); }, atSoon);
await sleep(800);
ok(!(await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'точно в срок'))), 'отложенное ещё не пришло');
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'точно в срок' && x.ch === 'acc:aA'))), 5000), 'отложенное пришло в срок от Инженера');
// П-41: без вставки
await pA.locator('#chatview-input').focus();
await pA.evaluate(() => { const i = document.getElementById('chatview-input'); const dt = new DataTransfer(); dt.setData('text/plain', 'вставленный текст'); i.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
await pA.keyboard.insertText('длинная вставка из буфера клавиатуры');
ok((await pA.inputValue('#chatview-input')) === '', 'вставка в чат не проходит');
await pA.keyboard.type('руками');
ok((await pA.inputValue('#chatview-input')) === 'руками', 'набор вручную работает');
ok(await pA.evaluate(() => getComputedStyle(document.getElementById('chatview-list')).userSelect === 'none'), 'выделить и скопировать сообщения нельзя');
await pA.fill('#chatview-input', '');
await pA.locator('#chatview-back').click();

console.log('Уведомления и действия кодов');
await pM.locator('.ctabs button', { hasText: 'ИГРА' }).click();
const notCard = pM.locator('.ccard', { hasText: 'УВЕДОМЛЕНИЕ' });
await notCard.locator('select').selectOption('n1');
await notCard.locator('.cwho label', { hasText: 'Медик Тест' }).locator('input').check();
await notCard.locator('button', { hasText: 'Отправить' }).click();
ok(await waitFor(async () => (await title(pB)) === 'ПРОВЕРКА СВЯЗИ'), 'уведомление с пульта — Медику');
await sleep(300);
ok((await title(pA)) !== 'ПРОВЕРКА СВЯЗИ', 'Инженеру оно не пришло');
await closeDlg(pB);
await enter(pA, 'NOTE');
await closeDlg(pA);
ok(await waitFor(async () => (await title(pB)) === 'ДЛЯ МЕДИКА' || (await title(pB)) === 'НОВЫЕ ДАННЫЕ'), 'код Инженера → уведомление Медику');
await closeDlg(pB); await closeDlg(pB);
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().unlocked.includes('bs')))), 'код Инженера открыл блок Медику');

console.log('Авария');
await enter(pA, 'ALARM1');
ok(await waitFor(async () => (await pB.locator('body.alarm-on').count()) && (await pC.locator('#alarm.on').count())), 'код → аварийный режим у всех (красное, окно на весь экран)');
ok((await pC.locator('#alarm-title').textContent()) === 'РАЗГЕРМЕТИЗАЦИЯ', 'заголовок аварии из пакета');
await pB.screenshot({ path: `${shots}/net-4-alarm.png` });
await pC.click('#alarm-hide');
ok(await pC.locator('#banners .banner.warn').count() === 1, 'авария свёрнута в полосу сверху');
await enter(pC, 'ALOFF');
ok(await waitFor(async () => !(await pA.locator('body.alarm-on').count()) && !(await pB.locator('body.alarm-on').count())), 'код другого игрока выключил аварию у всех');
for (const p of [pA, pB, pC]) await closeDlg(p);

console.log('Ограниченные коды');
const [rA, rB] = await Promise.all([enter(pA, 'AMP1'), enter(pB, 'AMP1')]);
await sleep(600);
const tA = await title(pA), tB = await title(pB), xA = await text(pA), xB = await text(pB);
ok([tA, tB].filter((t) => t === 'ДОСТУП ОТКРЫТ').length === 1 && [xA, xB].includes('Ампула пуста'), 'ампула наперегонки: доза одному, второму «Ампула пуста» (' + tA + ' / ' + tB + ')');
ok(tA !== 'ДОСТУП ОТКРЫТ' || xA === 'Инженеру: прилив сил', 'особый ответ Инженеру');
await closeDlg(pA); await closeDlg(pB);
await enter(pA, 'BOX8');
await sleep(500);
ok((await text(pA)).includes('ОСТАЛОСЬ: 7'), 'ящик: первая доза, «ОСТАЛОСЬ: 7»');
await closeDlg(pA);
await enter(pA, 'BOX8');
await sleep(500);
ok((await text(pA)) === 'Вы уже получили свою дозу', 'ящик: второй раз тому же — «Вы уже получили свою дозу»');
await closeDlg(pA);

console.log('Две подписи');
await enter(pA, 'DOOR');
await sleep(500);
ok((await title(pA)) === 'НУЖНА ЕЩЁ ПОДПИСЬ', 'первая подпись: ждём вторую');
await closeDlg(pA);
await enter(pB, 'DOOR');
await sleep(500);
ok((await title(pB)) === 'ПОДТВЕРЖДЕНО' && (await text(pB)) === 'Дверь открыта', 'вторая подпись: код сработал');
ok(await waitFor(async () => (await title(pA)) === 'ПОДТВЕРЖДЕНО'), 'первый подписавший получил «ПОДТВЕРЖДЕНО»');
await closeDlg(pA); await closeDlg(pB);

console.log('Приборы');
ok(await pB.locator('#tabs button[data-tab=apps]').isVisible() && !(await pA.locator('#tabs button[data-tab=apps]').isVisible()), 'градусник есть у Медика, у Инженера приборов нет');
await pB.locator('#tabs button[data-tab=apps]').click();
await pB.locator('.item.app', { hasText: 'Градусник' }).click();
await pB.locator('#scanlay.on').waitFor();
ok((await pB.locator('#scanlay-title').textContent()) === 'ТЕРМОМЕТР ТМ-3' && await pB.locator('#scanlay input').count() === 0, 'прибор: только камера, без ручного ввода');
const scanB = (c) => pB.evaluate((x) => window.sgPlayer.P.scanCb()(x), c);
await scanB('BADGE-A');
ok((await title(pB)) === 'ТЕРМОМЕТР ТМ-3' && (await text(pB)) === '36,6 °C', 'градусник на бейдже: 36,6 °C');
await pB.screenshot({ path: `${shots}/net-5-thermo.png` });
await closeDlg(pB);
await scanB('BADGE-A');
ok((await text(pB)) === '37,2 °C', 'второе измерение: 37,2 °C');
await closeDlg(pB);
await scanB('BADGE-A');
ok((await text(pB)) === 'ПРИБОР ИСЧЕРПАН', 'одноразовый ресурс градусника исчерпан (2 измерения)');
await closeDlg(pB);
await pB.locator('#scanlay-back').click();
await enter(pB, 'BADGE-A');
ok((await text(pB)) === 'Инженер Тест', 'тот же бейдж обычным сканером — имя');
await closeDlg(pB);
await enter(pB, '7001');
ok((await title(pB)) === 'КОД НЕ РАСПОЗНАН', 'код открытия детектора у Медика — «не распознан»');
await closeDlg(pB);
await enter(pA, '7001');
ok(await waitFor(async () => (await title(pA)) === 'ДОСТУПЕН ПРИБОР'), 'Инженеру код открыл детектор лжи');
await closeDlg(pA);
await pA.locator('#tabs button[data-tab=apps]').click();
await pA.locator('.item.app', { hasText: 'Детектор лжи' }).click();
const lie = new Set();
for (let i = 0; i < 8; i++) { await pA.evaluate(() => window.sgPlayer.P.scanCb()('BADGE-A')); lie.add(await text(pA)); await closeDlg(pA); }
ok(lie.has('ПРАВДА') && lie.has('ЛОЖЬ'), 'детектор лжи: случайно правда или ложь (' + [...lie].join(', ') + ')');
await pA.locator('#scanlay-back').click();

console.log('Цвета, снимок из чата, своя клавиатура');
const cssV = (p, n) => p.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), n);
ok(await cssV(pC, '--text') === '#ffb43a' && await cssV(pA, '--text') === '#4fd2ff' && await cssV(pB, '--text') === '#33ff66', 'цвета по умолчанию: Пилот — янтарный, Инженер — голубой, Медик — как у главы');
await pC.evaluate(() => window.sgPlayer.P.sendChat('all', 'пилот на связи'));
const got = (p, t) => p.evaluate((x) => (window.sgPlayer.P.mine().chat.filter((m) => m.text === x)[0] || {}).color || '', t);
ok(await waitFor(async () => (await got(pB, 'пилот на связи')) === '#ff66c4'), 'закреплённый цвет Пилота в чужом чате — розовый, хотя у него янтарный (П-51)');
await pB.locator('#tabs button[data-tab=chat]').click();
await pB.locator('.item.chan', { hasText: 'ОБЩИЙ КАНАЛ' }).click();
ok(await pB.locator('#chatview-list .msg.tinted', { hasText: 'пилот на связи' }).locator('.mt').evaluate((e) => getComputedStyle(e).color) === 'rgb(255, 102, 196)', 'у Медика сообщение Пилота — розовым');
// своя клавиатура в чате (П-54): касание поля — клавиатура, ⏎ — отправить
await pB.locator('#chatview-input').click();
ok(await pB.locator('#chatview .kbd').isVisible() && (await pB.locator('#chatview-input').getAttribute('inputmode')) === 'none', 'чат: своя клавиатура, системная не открывается');
for (const k of ['д', 'а']) await pB.locator(`#chatview .kbd .k[data-k="${k}"]`).click();
ok((await pB.inputValue('#chatview-input')) === 'Да', 'набрано своей клавиатурой (заглавная в начале): ' + await pB.inputValue('#chatview-input'));
await pB.screenshot({ path: `${shots}/net-3b-kbd.png` });
await pB.locator('#chatview .kbd .k[data-k="⏎"]').click();
ok(await waitFor(async () => (await got(pC, 'Да')) === '' && (await pC.evaluate(() => window.sgPlayer.P.mine().chat.some((m) => m.text === 'Да')))), '⏎ отправил; у Медика цвет не закреплён — у других без цвета');
await pB.locator('#chatview .kbd .k[data-k="⌄"]').click();
ok(!(await pB.locator('#chatview .kbd').isVisible()), '⌄ убирает клавиатуру');
ok(await pB.locator('#chatview-list .msg.tinted', { hasText: 'Говорит руководитель' }).locator('.mt').evaluate((e) => getComputedStyle(e).color) === 'rgb(255, 255, 255)', 'Руководитель у всех — белым (настройка «Связь»)');
await pB.locator('#chatview-back').click();
await pA.evaluate(() => window.sgPlayer.P.sendChat('acc:aB', 'анонимно и без цвета', '', { anon: true }));
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((m) => m.text === 'анонимно и без цвета' && m.ch === 'anon' && !m.color)))), 'анонимное — без цвета отправителя (не выдаёт его)');
await pB.locator('.item.chan', { hasText: 'НЕИЗВЕСТНЫЙ' }).click();
ok(await pB.locator('#chatview-list .msg.inv', { hasText: 'анонимно и без цвета' }).count() === 1, 'анонимные у всех — чёрным (тёмный текст на светлой плашке)');
await pB.screenshot({ path: `${shots}/net-3c-anon-black.png` });
await pB.locator('#chatview-back').click();
// снимок прямо из чата (П-47), фронтальная камера (П-48), перекраска в закреплённый цвет
await pA.locator('#tabs button[data-tab=chat]').click();
await pA.locator('.item.chan', { hasText: 'Медик Тест' }).click();
ok(await pA.locator('#chatview-cam').isVisible(), 'в чате Инженера кнопка ▣ (функция «Камера-улика»)');
await pA.locator('#chatview-cam').click();
await pA.locator('#camlay.on').waitFor();
await sleep(1200);
await pA.locator('#camlay-flip').click();
await sleep(800);
await pA.screenshot({ path: `${shots}/net-8b-chatcam.png` });
await pA.locator('#camlay-take').click();
ok(await pA.locator('#camlay.on').count() === 0 && await pA.locator('#chatview.on').count() === 1, 'мгновенный снимок: нажал — отправлено, снова чат');
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((m) => m.ch === 'acc:aA' && m.photo)))), 'снимок из чата дошёл Медику');
ok(await pA.evaluate(() => window.sgPlayer.P.mine().photos[0].gray) === true, 'снимок хранится без оттенка, оттенок — при показе (П-49)');
const avgImg = (p, sel) => p.locator(sel).last().evaluate((im) => new Promise((ok) => {
  const go = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } ok(s.map((v) => Math.round(v / (d.length / 4)))); };
  setTimeout(go, 600);
}));
const avgA = await avgImg(pA, '#chatview-list .msg.own img');
ok(avgA[2] > avgA[0] * 1.6, 'у Инженера свой снимок — его голубым: ' + avgA.join(','));
await pA.locator('#chatview-back').click();
await pB.locator('#tabs button[data-tab=chat]').click();
await pB.locator('.item.chan', { hasText: 'Инженер Тест' }).click();
const avgB = await avgImg(pB, '#chatview-list .msg img');
ok(avgB[1] > avgB[0] * 1.6 && avgB[1] > avgB[2] * 1.6, 'у Медика снимок Инженера — закреплённым зелёным: ' + avgB.join(','));
await pB.screenshot({ path: `${shots}/net-8c-photo-in-chat.png` });
await pB.locator('#chatview-back').click();
// мастер: предложить сменить цвет (П-53) и поставить цвет
await pM.locator('.ctabs button', { hasText: 'ИГРА' }).click();
const cc = pM.locator('.ccard', { hasText: 'ЦВЕТ ИНТЕРФЕЙСА' });
await cc.locator('.cwho label', { hasText: 'Медик Тест' }).locator('input').check();
await cc.locator('button', { hasText: 'Предложить сменить цвет' }).click();
ok(await waitFor(async () => (await title(pB)) === 'ХОТИТЕ СМЕНИТЬ ЦВЕТ?'), 'Медику: «Хотите сменить цвет?»');
ok(!(await title(pC)), 'Пилоту предложения нет');
await pB.screenshot({ path: `${shots}/net-9-offer.png` });
await pB.locator('#dlg .btn', { hasText: 'Да' }).click();
await pB.locator('#dlg.on .swatch[data-color=red]').click();
ok(await waitFor(async () => (await cssV(pB, '--text')) === '#ff5a4a'), 'Медик выбрал красный');
await cc.locator('.cwho label', { hasText: 'Медик Тест' }).locator('input').uncheck();
await cc.locator('.cwho label', { hasText: 'Пилот Тест' }).locator('input').check();
await cc.locator('select').selectOption('violet');
await cc.locator('button', { hasText: 'Поставить' }).click();
ok(await waitFor(async () => (await cssV(pC, '--text')) === '#b58cff'), 'мастер поставил Пилоту фиолетовый');
await cc.locator('.cwho label', { hasText: 'Пилот Тест' }).locator('input').uncheck();
ok(!(await pB.locator('#bar-color').isVisible()), 'у Медика нет ◐');
await cc.locator('.cwho label', { hasText: 'Медик Тест' }).locator('input').check();
await cc.locator('button', { hasText: '◐ Разрешить' }).click();
ok(await waitFor(async () => await pB.locator('#bar-color').isVisible()), 'мастер разрешил Медику менять цвет в любое время — ◐ в шапке');
await closeDlg(pB);
await cc.locator('.cwho label', { hasText: 'Медик Тест' }).locator('input').uncheck();
await pM.screenshot({ path: `${shots}/net-9b-console-color.png` });
await closeDlg(pB); await closeDlg(pC);

console.log('Сбои, функции, настройки');
await enter(pA, 'GL1');
await closeDlg(pA);
ok(await pA.locator('#app.gl-noise.gl-shift').count() === 1 && (await pA.locator('#glitchbar.on').textContent()).includes('ВСТРЯХНИТЕ'), 'сбой экрана: искажения и «встряхните телефон»');
await pA.screenshot({ path: `${shots}/net-6-glitch.png` });
await pA.evaluate(() => window.sgPlayer.P.shake());
ok(await pA.locator('#app.gl-noise').count() === 0, 'встряхнули — сбой прошёл');
await pC.locator('#tabs button[data-tab=notes]').click();
ok((await pC.locator('#tab-off.on .big').textContent()) === 'ПОВРЕЖДЕНО', 'у Пилота «ЗАМЕТКИ» повреждены');
await enter(pC, 'REP');
await closeDlg(pC);
await pC.locator('#tabs button[data-tab=notes]').click();
ok(await pC.locator('#tab-notes.on').count() === 1, 'код ремонта включил функцию');
await pC.locator('#tabs button[data-tab=data]').click();
await enter(pA, '0000');
ok((await title(pA)) === 'НАСТРОЙКИ', 'код 0000 — скрытые настройки игрока');
await pA.locator('#dlg .btn', { hasText: 'Звуки интерфейса' }).click();
ok(await pA.evaluate(() => window.sgPlayer.state().mute === true), 'звуки интерфейса выключены игроком');
await closeDlg(pA);

console.log('Глава всем, отсчёт, голосование, правило');
await pA.locator('#tabs button[data-tab=data]').click();
await pA.locator('.item', { hasText: 'Чужой язык' }).click();
const garbled = await pA.locator('#view-body .garbled').count();
await pA.locator('#view-back').click();
ok(garbled === 1, 'искажённый текст: до главы 2 текст искажён');
await pM.locator('.ctabs button', { hasText: 'ИГРА' }).click();
await pM.locator('.ccard', { hasText: 'ГЛАВА ДЛЯ ВСЕХ' }).locator('select').selectOption('2');
await pM.locator('.ccard', { hasText: 'ГЛАВА ДЛЯ ВСЕХ' }).locator('button', { hasText: 'Перевести' }).click();
await pM.locator('#dlg .btn', { hasText: 'Да' }).click();
ok(await waitFor(async () => (await pA.locator('#bar-chap').textContent()) === 'Глава 2' && (await pC.locator('#bar-chap').textContent()) === 'Глава 2'), 'пульт: глава 2 на всех телефонах');
for (const p of [pA, pB, pC]) await closeDlg(p);
ok(await cssV(pA, '--text') === '#33ff66' && await cssV(pB, '--text') === '#33ff66' && await cssV(pC, '--text') === '#33ff66', 'глава 2: цвет главы для всех — зелёный перебил выбор');
ok(!(await pB.locator('#bar-color').isVisible()), 'в главе с общим цветом ◐ нет (разрешение мастера было до конца главы 1)');
// «расшифровка» (П-56): сообщение приходит из 0 и 1, буквы проступают
await pB.locator('#tabs button[data-tab=chat]').click();
await pB.locator('.item.chan', { hasText: 'ОБЩИЙ КАНАЛ' }).click();
await pC.evaluate(() => window.sgPlayer.P.sendChat('all', 'шифр прошёл'));
await pB.locator('#chatview-list .msg', { hasText: /^.*$/ }).last().waitFor();
ok(await waitFor(async () => (await pB.locator('#chatview-list .mt.enc').count()) === 1), 'сообщение пришло зашифрованным');
const encText = await pB.locator('#chatview-list .mt.enc').textContent();
ok(/^[01ш-я ]+$/i.test(encText) && encText.length === 'шифр прошёл'.length, 'вместо текста — 0 и 1: ' + encText);
await pB.screenshot({ path: `${shots}/net-7b-decode.png` });
ok(await waitFor(async () => (await pB.locator('#chatview-list .mt:not(.enc)', { hasText: 'шифр прошёл' }).count()) === 1, 6000), 'через 3 с — расшифровано');
await pB.locator('#chatview-back').click();
await pB.locator('.item.chan', { hasText: 'ОБЩИЙ КАНАЛ' }).click();
ok(await pB.locator('#chatview-list .mt.enc').count() === 0, 'расшифрованное больше не шифруется');
await pB.locator('#chatview-back').click();
await pB.locator('#tabs button[data-tab=data]').click();
await pA.locator('.item', { hasText: 'Чужой язык' }).click();
ok((await pA.locator('#view-body').textContent()).includes('ПРАВДА ОТКРЫТА'), 'с главы 2 текст читается');
await pA.locator('#view-back').click();
const cd = pM.locator('.ccard', { hasText: 'ОБРАТНЫЙ ОТСЧЁТ' });
await cd.locator('input[type=number]').fill('2');
await cd.locator('input[type=text]').fill('ДО ОТКАЗА РЕАКТОРА');
await cd.locator('button', { hasText: 'Запустить' }).click();
ok(await waitFor(async () => /^1:5\d$|^2:00$/.test((await pB.locator('#banners .cd .v').textContent().catch(() => '')) || '')), 'обратный отсчёт у игроков: ' + await pB.locator('#banners .cd .v').textContent().catch(() => '—'));
await pM.locator('.ccard', { hasText: 'ГОЛОСОВАНИЕ' }).locator('button', { hasText: 'Начать сейчас' }).click();
ok(await waitFor(async () => (await pA.locator('#banners .vote').count()) === 1), 'голосование: полоса у игроков');
await pA.screenshot({ path: `${shots}/net-7-vote.png` });
for (const p of [pA, pB]) {
  await p.locator('#banners .vote').click();
  await p.locator('#dlg .btn', { hasText: 'Альбом 2' }).click();
}
ok(await waitFor(async () => (await title(pA)) === 'ИТОГ ГОЛОСОВАНИЯ', 9000) && (await text(pA)).includes('Выбрано: Альбом 2'), 'итог голосования: Альбом 2');
await closeDlg(pA); await closeDlg(pB); await closeDlg(pC);
const term = new WebSocket('ws://127.0.0.1:' + PORT);
await new Promise((r) => { term.onopen = r; });
term.send(JSON.stringify({ t: 'hello', role: 'terminal', dev: 'T1', name: 'Терминал' }));
await sleep(200);
term.send(JSON.stringify({ t: 'msg', id: 'ev1', to: ['role:master'], kind: 'event', body: { name: 'breach' } }));
ok(await waitFor(async () => (await title(pC)) === 'ПРОБОЙ'), 'событие терминала → правило центра → уведомление всем');
await closeDlg(pA); await closeDlg(pB); await closeDlg(pC);

console.log('Общие переменные (П13, Т4-3)');
const tState = {};
term.onmessage = (e) => { const o = JSON.parse(e.data); if (o.t === 'state') tState[o.key] = o.value; };
await pA.locator('#tabs button[data-tab=data]').click();
await pA.locator('.item', { hasText: 'Реактор' }).click();
ok((await pA.locator('#view-body').textContent()).includes('Энергия: 5 · шлюз: нет'), 'блок: {{power}} и {{open}} — начальные значения из пакета (5, «нет»)');
term.send(JSON.stringify({ t: 'set', key: 'var:power', value: 7 }));
term.send(JSON.stringify({ t: 'set', key: 'var:open', value: true }));
ok(await waitFor(async () => (await pA.locator('#view-body').textContent()).includes('Энергия: 7 · шлюз: да')), 'терминал записал 7 и «да» — открытый блок обновился сам');
ok(await waitFor(async () => (await pA.locator('#bar-vars .hv[data-var=power] .cells i.on').count()) === 7), 'шапка (П14): квадратики энергии обновились сами — 7 из 10');
await pA.screenshot({ path: `${shots}/net-7c-shared.png` });
await pA.locator('#view-back').click();
await enter(pB, 'POW+');
ok(await waitFor(async () => tState['var:power'] === 8), 'код телефона «+1» → центр: 8, терминал получил');
ok(await waitFor(async () => (await title(pC)) === 'ЭНЕРГИЯ НОРМА') && (await text(pC)).includes('Теперь 8'), 'правило «энергия ≥ 8» → уведомление всем, в тексте {{power}} = 8');
for (const p of [pA, pB, pC, pM]) await closeDlg(p);
await pM.locator('.ctabs button', { hasText: 'ИГРА' }).click();
const sv = pM.locator('.ccard', { hasText: 'ОБЩИЕ ПЕРЕМЕННЫЕ' });
ok(await waitFor(async () => (await sv.textContent()).includes('Энергия ($power): 8')), 'пульт: общие переменные со значениями');
await sv.locator('.shared-var', { hasText: 'power' }).locator('button', { hasText: '−1' }).click();
ok(await waitFor(async () => tState['var:power'] === 7), 'пульт «−1» → 7 у терминала');
await enter(pA, 'POWQ');
ok((await text(pA)).includes('Сейчас 7'), 'ответ кода: {{power}} = 7');
await closeDlg(pA);
// Т4-5 А (П14): код с условием «когда» по общим переменным
await enter(pA, 'GATE');
ok((await title(pA)) === 'НЕТ ДОСТУПА' && (await text(pA)) === 'Энергия: нужно не меньше 8, сейчас 7', 'код «когда энергия ≥ 8 и шлюз = да»: при 7 — «нет доступа» и причина (П15): ' + (await text(pA)));
await closeDlg(pA);
term.send(JSON.stringify({ t: 'set', key: 'var:power', value: 9 }));
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.state().vars.power)) === 9), 'терминал записал 9');
await waitFor(async () => (await title(pA)) === 'ЭНЕРГИЯ НОРМА', 3000);   // правило «≥ 8» снова стало верным
await sleep(300);
for (const p of [pA, pB, pC, pM]) await closeDlg(p);
await enter(pA, 'GATE');
ok((await text(pA)) === 'Шлюз открыт', 'при 9 и «да» — код срабатывает');
await closeDlg(pA);
term.send(JSON.stringify({ t: 'set', key: 'var:open', value: false }));
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.state().vars.open)) === false), 'терминал записал «нет»');
await enter(pA, 'GATE');
ok((await title(pA)) === 'НЕТ ДОСТУПА' && (await text(pA)) === 'Шлюз открыт: нужно равно да, сейчас нет', 'шлюз «нет» — снова «нет доступа», причина — шлюз (условия — все сразу)');
await closeDlg(pA);
// П15: шлюз кодом, предел энергии и правило «упёрлась в предел», перегрузка шкалы, режимы отказа
await enter(pB, 'OPEN');
ok(await waitFor(async () => tState['var:open'] === true), 'код OPEN → шлюз «да» у терминала');
await closeDlg(pB);
await enter(pA, 'GATE');
ok((await text(pA)) === 'Шлюз открыт', 'после OPEN — GATE срабатывает');
await closeDlg(pA);
term.send(JSON.stringify({ t: 'set', key: 'var:power', value: 10 }));
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.state().vars.power)) === 10), 'энергия 10');
await enter(pB, 'POW+');
ok(await waitFor(async () => (await title(pC)) === 'РЕАКТОР ЗАРЯЖЕН ПОЛНОСТЬЮ') && (await text(pC)).includes('Энергия 10 из 10'), '10 + 1 — предел: «реактор заряжен полностью» у всех, энергия осталась 10');
ok(await waitFor(async () => tState['var:power'] === 10 && (await pA.locator('#bar-vars .hv[data-var=power] .cells i.on').count()) === 10), 'терминал и шапка — 10: ' + tState['var:power']);
for (const p of [pA, pB, pC, pM]) await closeDlg(p);
term.send(JSON.stringify({ t: 'set', key: 'var:power', value: 25 }));
await sleep(400);
ok(tState['var:power'] === 10, 'терминал записал 25 — центр оставил 10');
for (const p of [pA, pB, pC, pM]) await closeDlg(p);
term.send(JSON.stringify({ t: 'set', key: 'var:power', value: 2 }));
ok(await waitFor(async () => (await pA.locator('#bar-vars .hv-low[data-var=power]').count()) === 1), 'энергия 2 < 3 — шкала тревожным цветом и мигает (Т6-4 Б)');
ok(await pA.locator('#bar-vars .hv[data-var=heat].hv-bar.hv-fit .cells i').count() === 30, 'нагрев — 30 черточек по ширине экрана');
await enter(pA, 'HEAT+'); await closeDlg(pA);
await enter(pA, 'HEAT+'); await closeDlg(pA);
await enter(pA, 'HEAT+'); await closeDlg(pA);
ok(await waitFor(async () => (await pA.locator('#bar-vars .hv[data-var=heat].hv-over .cells i.ov').count()) === 3), 'нагрев 33 > 30 — перегрузка: сбоят 3 черточки (на сколько превышено, П16)');
// П16: слои перезаполнения шкалы «ЗАРЯД»
const chg = (p) => p.evaluate(() => { const e = document.querySelector('#bar-vars .hv[data-var=charge]'); const c = [...e.querySelectorAll('.cells i')];
  return { layer: e.getAttribute('data-layer'), on: c.filter((i) => i.classList.contains('on')).length, ov: c.filter((i) => i.classList.contains('ov')).length,
    amber: c.filter((i) => /255, 170, 0/.test(getComputedStyle(i).backgroundColor)).length, glow: c.filter((i) => i.classList.contains('gw')).length,
    l: c.map((i) => i.getAttribute('data-l') || '-').join('') }; });
for (let k = 0; k < 3; k++) { await enter(pA, 'CHG+'); await closeDlg(pA); }
ok(await waitFor(async () => { const x = await chg(pA); return x.layer === '2' && x.on === 10 && x.amber === 5; }), 'заряд 15: слой 2 — 5 делений янтарные, остальные — полные первого слоя');
await enter(pA, 'CHG+'); await closeDlg(pA); await enter(pA, 'CHG+'); await closeDlg(pA);
ok(await waitFor(async () => { const x = await chg(pA); return x.layer === '3' && x.ov === 5 && x.amber === 10; }), 'заряд 25: слой 3 — 5 делений сбоят поверх янтарных');
for (let k = 0; k < 4; k++) { await enter(pA, 'CHG+'); await closeDlg(pA); }
ok(await waitFor(async () => { const x = await chg(pA); return x.layer === '4' && x.glow === 10; }), 'заряд 45 → 40 (предел по слоям 10 × 4): последний слой — свечение у всех');
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.state.vars.charge)) === 40), 'центр не дал подняться выше 40 (у второго телефона 40)');
await pA.screenshot({ path: `${shots}/net-7e-p16-layers.png` });
await enter(pA, 'CHG0'); await closeDlg(pA);
await pA.screenshot({ path: `${shots}/net-7d-p15-header.png` });
await enter(pA, 'CORE');
ok((await title(pA)) === 'КОД ПОКА НЕ АКТИВЕН' && (await text(pA)).includes('Нагрев 33'), 'режим «пока не активен» (Т6-7 Б)');
await closeDlg(pA);
await enter(pA, 'HIDDEN');
ok((await title(pA)) === 'КОД НЕ РАСПОЗНАН', 'режим «как неверный код»');
await closeDlg(pA);
await enter(pA, 'HEAT0'); await closeDlg(pA);
term.send(JSON.stringify({ t: 'set', key: 'var:power', value: 9 }));
await sleep(300);
for (const p of [pA, pB, pC, pM]) await closeDlg(p);
term.close();

console.log('Голос');
await closeDlg(pA); await closeDlg(pB); await closeDlg(pC);
const voiceBtn = (p) => p.locator('#bar-voice:not([hidden])').count();
ok(!(await voiceBtn(pA)) && !(await voiceBtn(pB)) && await voiceBtn(pC), '🎙 в шапке только «по кнопке»; в фоновых режимах не видно (П9, 13Б)');
ok(await pC.locator('#bar-voice.on').count() === 0, '🎙 «по кнопке» тусклая, пока не нажата');
const say = (p, t, bg = true) => p.evaluate(([t, bg]) => { const r = window.sgPlayer.P.voiceHeard(t, bg); return r ? (r.code || r.digits || (r.cool ? 'cool' : '')) : null; }, [t, bg]);
const blocked = (p) => p.evaluate(() => window.sgPlayer.P.activeGlitches().some((a) => a.g.id === 'gV'));
const fixedDlg = async (p) => (await waitFor(async () => (await title(p)) === 'СИСТЕМА ВОССТАНОВЛЕНА')) && (await closeDlg(p), true);
await say(pB, 'Императив, блок!');
ok(await waitFor(() => blocked(pB)) && (await title(pB)) === 'Сбой системы', 'Медик сказал «императив блок» → сбой системы на своём телефоне');
await pB.screenshot({ path: `${shots}/net-9-voice-block.png` });
await closeDlg(pB);
ok((await pB.locator('#glitchbar').textContent()).includes('НУЖЕН КОД РЕМОНТА'), 'сбой держится, в полосе — «нужен код ремонта»');
await enter(pB, 'слава лидеру');
ok(await fixedDlg(pB) && !(await blocked(pB)), 'напечатал «слава лидеру» (буквы, пробел) — сбой снят');
await say(pB, 'императив блок');
await waitFor(() => blocked(pB)); await closeDlg(pB);
await say(pB, 'слава лидеру');
ok(await fixedDlg(pB) && !(await blocked(pB)), 'сказал «слава лидеру» — сбой снят');
ok((await say(pB, 'императив блок второй')) === 'kV1' && (await waitFor(() => blocked(pB))), 'чужая ключевая фраза у Медика не срабатывает (сработала только короткая «императив блок»)');
await closeDlg(pB);
await say(pB, 'слава лидеру'); await fixedDlg(pB);
ok((await say(pA, 'императив блок второй')) === 'kV3', 'Инженер (ключевой телефон): «императив блок второй»');
ok(await waitFor(() => blocked(pB)) && !(await blocked(pA)), 'через центр: сбой у Медика, у Инженера — нет');
await closeDlg(pB);
await say(pA, 'слава лидеру второй');
ok(await fixedDlg(pB) && !(await blocked(pB)), '«слава лидеру второй» — Медик разблокирован удалённо');
await say(pA, 'императив блок оба');
ok(await waitFor(async () => (await blocked(pA)) && (await blocked(pB))), '«императив блок оба» — заблокированы оба телефона');
await closeDlg(pA); await closeDlg(pB);
await say(pA, 'слава лидеру оба');
ok(await fixedDlg(pA) && await fixedDlg(pB) && !(await blocked(pA)) && !(await blocked(pB)), '«слава лидеру оба» — оба разблокированы');
// фраза для терминала (П-60): слышит любой телефон с голосом, молча передаёт терминалу, один раз
const tv = new WebSocket('ws://127.0.0.1:' + PORT), tvGot = [];
tv.onmessage = (e) => tvGot.push(JSON.parse(e.data));
await new Promise((r) => { tv.onopen = r; });
tv.send(JSON.stringify({ t: 'hello', role: 'terminal', dev: 'T2', name: 'Терминал' }));
await sleep(300);
await Promise.all([say(pA, 'сигнал терминалу'), say(pB, 'сигнал терминалу')]);
ok(await waitFor(() => tvGot.some((o) => o.t === 'msg' && o.kind === 'code' && o.body.phrase === 'сигнал терминалу' && o.body.voice)), 'фраза для терминала: терминал получил «услышано»');
await sleep(1200);
ok(tvGot.filter((o) => o.t === 'msg' && o.kind === 'code' && o.body.phrase === 'сигнал терминалу').length === 1, 'два телефона расслышали — терминал получил один раз');
ok(!(await pA.locator('#dlg.on').count()) && !(await pB.locator('#dlg.on').count()), 'на телефонах ничего не видно');
await Promise.all([say(pA, 'внимание экипаж'), say(pC, 'внимание экипаж')]);
await sleep(1500);
const firstA = (await title(pA)) === 'ВНИМАНИЕ ЭКИПАЖ', firstC = (await title(pC)) === 'ВНИМАНИЕ ЭКИПАЖ';
ok(firstA !== firstC, 'предел 1: фраза расслышана двумя телефонами, сработала только на одном (' + (firstA ? 'Инженер' : 'Пилот') + ')');
await closeDlg(pA); await closeDlg(pC);
await say(firstA ? pA : pC, 'внимание экипаж');
await sleep(1200);
ok((await title(firstA ? pA : pC)) !== 'ВНИМАНИЕ ЭКИПАЖ', 'пауза 60 с: второй раз фраза молчит');
ok((await say(pA, 'четыре два четыре два')) === '4242' && (await text(pA)) === 'ГОЛОС: КОД ПРИНЯТ', 'цифры голосом в фоне: «четыре два четыре два» → код 4242');
ok(await waitFor(() => tvGot.some((o) => o.t === 'msg' && o.kind === 'code' && o.body.code === '4242' && o.body.num === '1')), 'терминал узнал: код 4242 введён на телефоне сотрудника №1');
tv.close();
await closeDlg(pA);
await say(pA, 'девять девять');
await sleep(300);
ok(!(await pA.locator('#dlg.on').count()), 'неверные цифры в фоне — молча');
await say(pC, 'девять девять', false);
ok((await title(pC)) === 'КОД НЕ РАСПОЗНАН', 'по кнопке неверные цифры — «неверный код», как набранный');
await closeDlg(pC);
await pC.locator('#bar-voice').click();
ok((await title(pC)) === 'ГОЛОС (ПРОБА)', 'браузер: 🎙 по кнопке — проба (фраза текстом)');
await pC.fill('#voice-say', 'императив блок');
await pC.locator('#dlg .btn', { hasText: 'Сказать' }).click();
ok(await waitFor(() => blocked(pC)), 'проба: Пилот «сказал» фразу — сбой');
await closeDlg(pC);
await say(pC, 'слава лидеру'); await fixedDlg(pC);

console.log('ТЕЛЕФОНЫ и проба голоса (П16, основа 1)');
for (const p of [pA, pB, pC]) await closeDlg(p);
// «телефон» со старым пакетом и низким зарядом — прямое подключение к центру
const old = new WebSocket('ws://127.0.0.1:' + PORT);
await new Promise((r) => { old.onopen = r; });
old.send(JSON.stringify({ t: 'hello', role: 'phone', dev: 'dOld', acc: 'aD', name: 'Связист Тест', pack: { t: 'СЕТЬ-ТЕСТ', v: 2 }, vmode: 'off' }));
await sleep(200);
old.send(JSON.stringify({ t: 'stat', bat: { l: 12, c: false }, voice: { mode: 'off', on: false }, apk: '0.1.99' }));
await pM.evaluate(() => window.sgPlayer.P.console());
await pM.locator('#console.on').waitFor();
await pM.locator('#console-tabs button', { hasText: 'ТЕЛЕФОНЫ' }).click();
for (const p of [pA, pB, pC]) await p.evaluate(() => window.sgPlayer.P.sendStat());
const row = (dev) => pM.locator('.phone-row[data-dev=' + dev + ']').textContent().catch(() => '');
const devA = await pA.evaluate(() => window.sgPlayer.P.state.dev);
ok(await waitFor(async () => /Инженер Тест/.test(await row(devA)) && /пакет v3/.test(await row(devA)) && /всегда в фоне/.test(await row(devA)) && /связь: сейчас/.test(await row(devA))),
  'ТЕЛЕФОНЫ: строка Инженера — пакет v3, голос «всегда в фоне», связь сейчас: ' + await row(devA));
ok(await waitFor(async () => /пакет v2 — СТАРЫЙ/.test(await row('dOld')) && /🔋 12 %/.test(await row('dOld')) && /0\.1\.99/.test(await row('dOld'))), 'старый пакет (v2) и заряд 12 % видны: ' + await row('dOld'));
const warnT = await pM.locator('.ph-warn').textContent().catch(() => '');
ok(/Старый или другой пакет: Связист Тест/.test(warnT) && /Заряд меньше 20 %: Связист Тест/.test(warnT), 'предупреждения: старый пакет, низкий заряд');
await pM.locator('.ccard', { hasText: 'ПРОБА ГОЛОСА' }).locator('button', { hasText: 'Начать пробу' }).click();
ok(await waitFor(() => pA.evaluate(() => !!(window.SGNet.state.probe && window.SGNet.state.probe.on))), 'проба голоса включена у телефонов (состояние центра «probe»)');
ok((await say(pA, 'зелёный апельсин лежит в траве и готовится быть съеденным мной сегодня')) === 'kP3' && (await text(pA)) === 'ПАРОЛЬ 3 (11 слов)', 'пароль 11 слов — длинный, а не «апельсин» внутри');
await closeDlg(pA);
ok((await say(pB, 'ну зелёный апельсин лежит в траве вот')) === 'kP2', 'пароль 5 слов посреди речи');
await closeDlg(pB);
ok((await say(pA, 'апельсин')) === 'kP1', 'пароль 1 слово');
await closeDlg(pA);
await say(pC, 'просто разговор рядом');
const hl = () => pM.locator('.heard-log .hl').allTextContents();
ok(await waitFor(async () => { const l = await hl(); return l.length === 4 && l.some((x) => /разговор рядом» → не фраза/.test(x)) && l.some((x) => /апельсин лежит в траве и готовится быть съеденным мной сегодня» → сработала/.test(x)); }),
  'на пульте — всё услышанное с каждого телефона (и не-фразы): ' + (await hl()).length);
ok(await waitFor(async () => /последнее: «апельсин» → сработала: апельсин/.test(await row(devA))), 'в строке телефона — последняя фраза');
await pM.locator('.ccard', { hasText: 'ПРОБА ГОЛОСА' }).locator('select').selectOption(devA);
ok((await hl()).length === 2, 'фильтр по телефону: 2 строки Инженера');
await pM.screenshot({ path: `${shots}/net-7f-p16-phones.png`, fullPage: true });
await pM.locator('.ccard', { hasText: 'ПРОБА ГОЛОСА' }).locator('label', { hasText: 'Свободное' }).locator('input').check();
ok(await waitFor(() => pA.evaluate(() => !!(window.SGNet.state.probe && window.SGNet.state.probe.free))), 'свободное распознавание включено с пульта');
await say(pA, 'синий ключ'); await closeDlg(pA);
ok(await waitFor(async () => (await hl()).some((x) => /своб\./.test(x) && /синий ключ/.test(x))), 'строка свободного распознавания помечена');
await pM.locator('.ccard', { hasText: 'ПРОБА ГОЛОСА' }).locator('button', { hasText: 'Остановить пробу' }).click();
ok(await waitFor(() => pA.evaluate(() => !window.SGNet.state.probe)), 'проба остановлена');
const n0 = (await hl()).length;
await say(pA, 'капитан'); await closeDlg(pA);
await sleep(500);
ok((await hl()).length === n0, 'после остановки пробы услышанное на пульт не идёт');
old.close();
await pM.evaluate(() => window.sgPlayer.P.closeTop());

console.log('Без связи');
center.kill();
ok(await waitFor(async () => !(await pA.locator('#bar-net.up').count()), 8000), 'центр выключен — ○ в шапке');
await enter(pA, 'BOX8');
await sleep(300);
ok((await title(pA)) === 'НЕТ СВЯЗИ С ЦЕНТРОМ — ПОВТОРИТЕ', 'ограниченный код без связи: «нет связи, повторите»');
await closeDlg(pA);
await enter(pA, 'BADGE-A');
ok((await text(pA)) === 'Инженер Тест', 'обычный код без связи работает');
await closeDlg(pA);
await pA.evaluate(() => window.sgPlayer.P.sendChat('all', 'пока нет связи'));
center = await startCenter(PORT, centerFile);
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'пока нет связи'))), 30000), 'связь вернулась — сообщение из очереди дошло');

console.log('Передача блока, заметки, камера');
await pA.locator('.item', { hasText: 'Схема для передачи' }).click();
await pA.locator('#view-body .btn', { hasText: 'ПЕРЕДАТЬ' }).click();
ok(await pA.locator('#dlg.on canvas.qr-show').count() === 1, 'QR передачи блока на экране');
await closeDlg(pA);
await pA.locator('#view-back').click();
ok(!(await pB.evaluate(() => window.sgPlayer.P.mine().received.includes('bsh'))), 'до передачи у Медика блока нет');
await enter(pB, 'SGB:bsh');
ok((await title(pB)) === 'ПОЛУЧЕНЫ ДАННЫЕ', 'Медик отсканировал QR — блок получен');
await closeDlg(pB);
ok(await pB.locator('#tab-data .item', { hasText: 'Схема для передачи' }).count() === 1, 'переданный блок в «Данных» у Медика');
await pA.locator('#tabs button[data-tab=notes]').click();
await pA.locator('#tab-notes .btn').click();
await pA.fill('.note-ed', 'Код двери — у медика');
await pA.locator('#dlg .btn', { hasText: 'Готово' }).click();
ok(await waitFor(async () => (await pA.locator('#tab-notes .item.note', { hasText: 'Код двери' }).count()) === 1), 'заметка игрока сохранена');
await pA.locator('#tabs button[data-tab=photo]').click();
await sleep(1500);
await pA.click('#photo-shot');
ok(await pA.locator('#photo-got img').count() === 2, 'камера-улика: снимок в галерее (рядом — снятый из чата)');
await pA.screenshot({ path: `${shots}/net-8-photo.png` });
await pA.locator('#photo-got img').first().click();
await pA.locator('#dlg .btn', { hasText: 'Отправить в «СВЯЗЬ»' }).click();
await pA.locator('#dlg .btn', { hasText: 'ОБЩИЙ КАНАЛ' }).click();
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.photo && x.photo.startsWith('data:image/jpeg'))))), 'снимок пришёл в общий канал Медику');
await closeDlg(pA);

console.log('Сброс прогресса телефона (замечание build-26/36)');
const chatB = await pB.evaluate(() => window.sgPlayer.P.mine().chat.length);
ok(chatB > 0 && await pB.evaluate(() => window.sgPlayer.P.mine().unlocked.includes('bs')), 'до сброса у Медика есть переписка (' + chatB + ') и открытый по сети блок');
// сброс и вход тем же персонажем раньше, чем телефон вернулся в сеть (так центр присылал всё старое заново)
const scr = await pB.evaluate(() => { window.sgPlayer.P.resetPhone(); const s = document.querySelector('#scr-login.on') ? 'login' : ''; window.sgPlayer.enter('222222', 'pad'); return s; });
ok(scr === 'login', 'сброс → экран входа');
await pB.locator('#scr-main.on').waitFor();
ok(await waitFor(async () => (await pB.locator('#bar-net.up').count()) > 0, 8000), 'после сброса телефон сам вернулся в сеть (адрес центра сохранён)');
await sleep(1500);
await pB.reload();   // приложение перезапущено (старый телефон выгружает его из памяти)
await pB.locator('#scr-main.on').waitFor();
ok(await waitFor(async () => (await pB.locator('#bar-net.up').count()) > 0, 8000), 'после перезапуска — снова в сети');
await sleep(1500);
const after = await pB.evaluate(() => ({ chat: window.sgPlayer.P.mine().chat.length, bs: window.sgPlayer.P.mine().unlocked.includes('bs'), dlg: document.querySelector('#dlg.on .dlg-title') ? document.querySelector('#dlg.on .dlg-title').textContent : '' }));
ok(after.chat === 0 && !after.bs, 'старая переписка, снимки и открытое по сети не вернулись: ' + JSON.stringify(after));
ok(after.dlg !== 'ДЛЯ МЕДИКА', 'старое уведомление не всплыло');
await pA.evaluate(() => window.sgPlayer.P.sendChat('all', 'после сброса'));
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'после сброса')))), 'новое сообщение после сброса доходит');

for (const p of [pA, pB, pC, pM]) await p.evaluate(() => 0);
web.kill();
center.kill();
await browser.close();
ok(errors.length === 0, 'ошибок на страницах нет' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
console.log(failed ? `${passed}/${passed + failed} проверок сети пройдено` : `СЕТЬ: ВСЁ ХОРОШО (${passed})`);
process.exit(failed ? 1 : 0);
