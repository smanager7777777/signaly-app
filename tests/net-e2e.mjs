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
  format: 1, title: 'СЕТЬ-ТЕСТ', version: 3, masterCode: '98765432', settingsCode: '0000', sounds: true,
  chapters: [{ id: 'c1', name: 'Глава 1', code: '' }, { id: 'c2', name: 'Глава 2', code: '55555', jam: 0 }],
  accounts: [
    { id: A, name: 'Инженер Тест', profession: 'Инженер', login: '111111', modules: ['chat', 'notes', 'sstv', 'photo'] },
    { id: B, name: 'Медик Тест', profession: 'Медик', login: '222222', modules: ['chat'] },
    { id: C, name: 'Пилот Тест', profession: 'Пилот', login: '333333', modules: ['chat'], modState: { sstv: 'broken' } }],
  blocks: [
    { id: 'b1', title: 'Общая сводка', start: true, items: [{ type: 'text', text: 'Сводка.' }] },
    { id: 'bs', title: 'Секретный отчёт', start: false, items: [{ type: 'text', text: 'Секрет.' }] },
    { id: 'bsh', title: 'Схема для передачи', start: true, who: [A], share: true, items: [{ type: 'text', text: 'Схема.' }] },
    { id: 'bg', title: 'Чужой язык', start: true, garble: 2, items: [{ type: 'text', text: 'ПРАВДА ОТКРЫТА' }] }],
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
    { id: 'kRep', code: 'REP', actions: [{ type: 'module', module: 'sstv', on: 'on', to: 'self' }] },
    { id: 'kNote', code: 'NOTE', actions: [{ type: 'notify', title: 'ДЛЯ МЕДИКА', text: 'Срочно в медотсек', to: [B] }, { type: 'open', blocks: ['bs'], to: [B] }] }],
  alarms: [{ id: 'al1', name: 'Разгерметизация', title: 'РАЗГЕРМЕТИЗАЦИЯ', text: 'Всем в отсек 3.', torch: false }],
  glitches: [{ id: 'g1', name: 'Сбой экрана', kind: 'visual', fx: ['noise', 'shift'], seconds: 0, fix: 'shake' }],
  notices: [{ id: 'n1', name: 'Проверка', title: 'ПРОВЕРКА СВЯЗИ', text: 'Ответьте мастеру.' }],
  votes: [{ id: 'v1', name: 'Музыка', title: 'КАКУЮ МУЗЫКУ?', options: ['Альбом 1', 'Альбом 2'], seconds: 6, term: 'music' }],
  rules: [{ id: 'r1', name: 'Пробой', on: 'event', event: 'breach', actions: [{ type: 'notify', title: 'ПРОБОЙ', text: 'Пробой корпуса!', to: [] }] }]
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
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1, hasTouch: true, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
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

console.log('Сбои, функции, настройки');
await enter(pA, 'GL1');
await closeDlg(pA);
ok(await pA.locator('#app.gl-noise.gl-shift').count() === 1 && (await pA.locator('#glitchbar.on').textContent()).includes('ВСТРЯХНИТЕ'), 'сбой экрана: искажения и «встряхните телефон»');
await pA.screenshot({ path: `${shots}/net-6-glitch.png` });
await pA.evaluate(() => window.sgPlayer.P.shake());
ok(await pA.locator('#app.gl-noise').count() === 0, 'встряхнули — сбой прошёл');
await pC.locator('#tabs button[data-tab=sstv]').click();
ok((await pC.locator('#tab-off.on .big').textContent()) === 'ПОВРЕЖДЕНО', 'у Пилота «СИГНАЛ» повреждён');
await enter(pC, 'REP');
await closeDlg(pC);
await pC.locator('#tabs button[data-tab=sstv]').click();
ok(await pC.locator('#tab-sstv.on').count() === 1, 'код ремонта включил функцию');
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
term.close();
await closeDlg(pA); await closeDlg(pB); await closeDlg(pC);

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
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.text === 'пока нет связи'))), 15000), 'связь вернулась — сообщение из очереди дошло');

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
ok(await pA.locator('#photo-got img').count() === 1, 'камера-улика: снимок в галерее');
await pA.screenshot({ path: `${shots}/net-8-photo.png` });
await pA.locator('#photo-got img').click();
await pA.locator('#dlg .btn', { hasText: 'Отправить в «СВЯЗЬ»' }).click();
await pA.locator('#dlg .btn', { hasText: 'ОБЩИЙ КАНАЛ' }).click();
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.mine().chat.some((x) => x.photo && x.photo.startsWith('data:image/jpeg'))))), 'снимок пришёл в общий канал Медику');
await closeDlg(pA);

for (const p of [pA, pB, pC, pM]) await p.evaluate(() => 0);
web.kill();
center.kill();
await browser.close();
ok(errors.length === 0, 'ошибок на страницах нет' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
console.log(failed ? `${passed}/${passed + failed} проверок сети пройдено` : `СЕТЬ: ВСЁ ХОРОШО (${passed})`);
process.exit(failed ? 1 : 0);
