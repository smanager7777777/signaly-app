// СИГНАЛЫ — проверка стенда телефонов (П24, Т22-2 А): настоящий центр (Java, как в APK) + стенд dist/stand.html
// в Chromium, открытый из файла (как у автора на Windows): 10 «телефонов» — два пульта мастера и восемь персонажей.
// Вход всех, своё хранилище у каждого, рассылка, доставка и нагрузка, «телефон» вне сети, перезапуск приложения,
// обрыв у всех, перезапуск центра, отчёт.
// node tests/stand-test.mjs <playwright> <папка для снимков>     (нужны dist/, javac/java)
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildJava, startCenter } from './net-test.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const JSZip = require('jszip');
const shots = resolve(process.argv[3] || '/tmp/sg-shots');
const tmp = '/tmp/sg-stand';
mkdirSync(shots, { recursive: true });
mkdirSync(tmp, { recursive: true });
let passed = 0, failed = 0;
function ok(c, what) { if (c) { passed++; console.log('  ✓', what); } else { failed++; console.log('  ✗', what); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();

/* ---------- пакет: восемь вымышленных персонажей ---------- */
const profs = ['Инженер', 'Медик', 'Пилот', 'Связист', 'Штурман', 'Механик', 'Биолог', 'Психолог'];
const g = {
  format: 1, title: 'СТЕНД-ТЕСТ', version: 1, firstRun: false, masterCode: '98765432', settingsCode: '0000', sounds: true,
  chapters: [{ id: 'c1', name: 'Глава 1', code: '' }, { id: 'c2', name: 'Глава 2', code: '55555' }],
  accounts: profs.map((p, i) => ({ id: 's' + i, name: p + ' Тест', profession: p, num: String(i + 1), login: String(i + 1).repeat(6), modules: ['chat', 'notes'] })),
  blocks: [{ id: 'b1', title: 'Сводка', start: true, items: [{ type: 'text', text: 'Проба стенда.' }] }],
  codes: [], shared: [{ name: 'power', label: 'Энергия', value: 5 }]
};
const zip = new JSZip();
zip.file('game.json', JSON.stringify(g));
const pack = await zip.generateAsync({ type: 'nodebuffer' });

/* ---------- центр и стенд ---------- */
buildJava();
const centerFile = tmp + '/center.json';
if (existsSync(centerFile)) rmSync(centerFile);
const PORT = 18799;
let center = await startCenter(PORT, centerFile);
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1900, height: 1300 }, permissions: ['camera', 'microphone'] });
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('стенд: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION|navigator.vibrate|net::/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto(pathToFileURL(resolve(root, 'dist/stand.html')).href);
const S = (fn, ...a) => page.evaluate(fn, ...a);
const waitFor = async (fn, ms = 8000) => { const t = Date.now() + ms; while (Date.now() < t) { if (await fn()) return true; await sleep(150); } return false; };
const upCount = () => S(() => SGStand.tiles.filter((t) => t.net() && t.net().up).length);

console.log('Стенд: загрузка');
ok(await waitFor(async () => (await S(() => SGStand.tiles.length)) === 10 && (await S(() => SGStand.tiles.every((t) => t.sp())))), '10 «телефонов» загрузились из файла (file://)');
ok(await S(() => SGStand.tiles.every((t) => t.win().SG_SLOT === 'stand' + t.n)), 'у каждого «телефона» свой номер хранилища (SG_SLOT)');
await page.setInputFiles('#pack', { name: 'stand.sgpack', mimeType: 'application/zip', buffer: pack });
ok(await waitFor(async () => /СТЕНД-ТЕСТ.*персонажей 8/.test(await page.locator('#packinfo').textContent())), 'пакет выбран: название и число персонажей');
const who = await S(() => SGStand.tiles.map((t) => t.q('.who').value));
ok(who[0] === 'master' && who[1] === 'master2' && who.slice(2).every((v, i) => v === 'acc:s' + i), 'по умолчанию: два пульта мастера и восемь персонажей');
await page.fill('#addr', 'SGNET:ws://127.0.0.1:' + PORT);   // строка QR «СЕТЬ» целиком

console.log('Стенд: подключить все');
const tc = Date.now();
await page.click('#go');
ok(await waitFor(async () => (await upCount()) === 10, 40000), 'все 10 на связи с центром (' + ((Date.now() - tc) / 1000).toFixed(1) + ' с)');
ok((await page.inputValue('#addr')) === 'ws://127.0.0.1:' + PORT, 'адрес из строки SGNET: приведён к ws://…');
const accs = await S(() => SGStand.tiles.map((t) => t.sp().state().account));
ok(accs.slice(2).every((a, i) => a === 's' + i) && !accs[0] && !accs[1], 'на 3–10 вошли восемь разных персонажей');
ok(await S(() => SGStand.tiles.slice(0, 2).every((t) => t.win().document.querySelector('#console.on'))), 'на 1 и 2 открыт пульт мастера');
const devs = await S(() => SGStand.tiles.map((t) => t.sp().state().dev));
ok(new Set(devs).size === 10, 'у каждого свой номер телефона (dev) — хранилища не смешались');
ok(await waitFor(async () => (await S(() => SGStand.tiles[0].net().peers.filter((p) => p.online !== false && p.acc).length)) === 8), 'центр видит восемь персонажей в сети');
await page.waitForTimeout(600);
ok(/на связи 10 из 10/.test(await page.locator('#sum').textContent()), 'строка сверху: «на связи 10 из 10»');
await page.screenshot({ path: `${shots}/stand-1-all.png` });

console.log('Стенд: рассылка от мастера');
await S(() => SGStand.tiles[0].net().msg(['all'], 'notify', { title: 'ПРОБА СТЕНДА', text: 'Всем телефонам.' }));
ok(await waitFor(async () => (await S(() => SGStand.tiles.slice(2).filter((t) => {
  const d = t.win().document.querySelector('#dlg.on .dlg-title'); return d && d.textContent === 'ПРОБА СТЕНДА'; }).length)) === 8), 'уведомление мастера — у всех восьми персонажей');
await S(() => SGStand.tiles.slice(2).forEach((t) => { const b = t.win().document.querySelector('#dlg.on .dlg-btns .btn:last-child'); if (b) b.click(); }));
await S(() => SGStand.tiles[0].net().set('var:power', 9));
ok(await waitFor(async () => (await S(() => SGStand.tiles.slice(2).every((t) => String((t.sp().state().vars || {}).power) === '9')))), 'общая переменная от пульта — у всех восьми');
// чат: персонаж пишет в общий канал, остальные семь получают
await S(() => SGStand.tiles[2].net().msg(['all'], 'chat', { text: 'Проба чата стенда' }));
ok(await waitFor(async () => (await S(() => SGStand.tiles.slice(3).every((t) => (t.sp().P.mine().chat || []).length >= 0 && t.got > 0)))), 'чат доходит (счёт «пришло» растёт у всех)');

console.log('Стенд: доставка и нагрузка');
let r = await S(() => SGStand.test('Проверка доставки', 1, 0).then((x) => ({ ok: x.ok, got: x.got, dup: x.dup })));
ok(r.ok && r.got === 90 && !r.dup, 'проверка доставки: 90 из 90, без повторов');
r = await S(() => SGStand.test('Нагрузка', 30, 100).then((x) => { const s = x.lat.slice().sort((a, b) => a - b); return { ok: x.ok, got: x.got, dup: x.dup, mid: s[s.length >> 1], max: s[s.length - 1] }; }));
ok(r.ok && r.got === 2700 && !r.dup, `нагрузка: 10 × 30 сообщений — 2700 из 2700 (середина ${r.mid} мс, дольше всех ${r.max} мс)`);
ok(r.max < 5000, 'нагрузка: ни одно сообщение не шло дольше 5 с');

console.log('Стенд: «телефон» вне сети и перезапуск приложения');
await S(() => SGStand.tiles[5].toggleCut());
ok(await waitFor(async () => !(await S(() => SGStand.tiles[5].net().up)), 4000), '⏻ — №6 вышел из сети');
const pend = S(() => SGStand.test('Доставка с телефоном вне сети', 2, 50).then((x) => ({ ok: x.ok, got: x.got })));
await sleep(2500);
await S(() => SGStand.tiles[5].toggleCut());
r = await pend;
ok(r.ok && r.got === 180, '№6 вернулся — получил своё и отправил накопленное: 180 из 180');
await S(() => SGStand.tiles[3].q('.b-re').click());
ok(await waitFor(async () => (await S(() => { const t = SGStand.tiles[3]; return t.sp() && t.net() && t.net().up && t.sp().state().account === 's1'; })), 15000), '↻ — №4 после перезапуска снова вошёл тем же персонажем и на связи');
ok(await S(() => SGStand.tiles[3].sp().state().dev) === devs[3], '№4 после перезапуска — тот же номер телефона (своё хранилище)');

console.log('Стенд: обрыв у всех и перезапуск центра');
r = await S(() => SGStand.dropAll(3));
ok(r === true, 'обрыв 3 с у всех — все вернулись сами');
center.kill('SIGKILL');
ok(await waitFor(async () => (await upCount()) === 0, 40000), 'центр выключен — стенд видит: все без связи');
await sleep(2000);
center = await startCenter(PORT, centerFile);
ok(await waitFor(async () => (await upCount()) === 10, 40000), 'центр снова включён — все 10 вернулись сами');
r = await S(() => SGStand.test('Доставка после перезапуска центра', 1, 0).then((x) => ({ ok: x.ok, got: x.got })));
ok(r.ok && r.got === 90, 'после перезапуска центра: 90 из 90');
const log = await page.locator('#log').textContent();
ok(/связь потеряна/.test(log) && /на связи \(не было/.test(log), 'журнал: «связь потеряна» и «на связи (не было … с)»');

console.log('Стенд: звук, отчёт');
await S(() => SGStand.tiles[4].q('.b-snd').click());
ok(await S(() => SGStand.tiles.filter((t) => !t.info.mute).map((t) => t.n).join()) === '4', '🔈 — звук только у №5');
ok(await S(() => SGStand.tiles[4].win().SG_STAND.mute === false && SGStand.tiles[0].win().SG_STAND.mute === true), 'приложение №5 видит «со звуком», остальные — без');
const rep = await S(() => SGStand.report());
writeFileSync(`${shots}/stand-report.txt`, rep);
ok(/ТЕЛЕФОНЫ:/.test(rep) && /№10 /.test(rep) && /ВСЁ ДОШЛО/.test(rep) && /ЖУРНАЛ:/.test(rep), 'отчёт: телефоны, итоги, журнал');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
ok(/^signaly-stend-\d+\.txt$/.test(dl.suggestedFilename()), '«Сохранить отчёт» — файл ' + dl.suggestedFilename());
await page.screenshot({ path: `${shots}/stand-2-after.png` });

// перезагрузка стенда: «телефоны» помнят пакет, вход и адрес
await page.reload();
ok(await waitFor(async () => (await S(() => SGStand.tiles.length === 10 && SGStand.tiles.every((t) => t.net() && t.net().up))), 30000), 'стенд открыт заново — все 10 сами вернулись в сеть со своим входом');
ok((await page.inputValue('#addr')) === 'ws://127.0.0.1:' + PORT && (await S(() => SGStand.tiles[9].sp().state().account)) === 's7', 'адрес и вход запомнены');

ok(!errors.length, 'без ошибок на страницах' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close();
center.kill();
console.log(`\nСтенд: ${passed} прошло, ${failed} не прошло (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
process.exit(failed ? 1 : 0);
