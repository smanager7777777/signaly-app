// СИГНАЛЫ — П25: механики поверх основ — настоящий центр (Java) + «телефоны» в Chromium.
// Шпионаж текстом (06, 140, 146): «ПЕРЕХВАТ», код прослушки, живой поток через центр, подсветка фраз, недоговорённое,
// пульт «ПРОСЛУШКА», глитчи 0/1 у жертвы, «Проверка линии», прервать встряхиванием и кодом, перегрев, выход стирает запись.
// node tests/mech-e2e.mjs <playwright> <папка для снимков>     (нужны dist/, javac/java, ffmpeg, python3)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildJava, startCenter } from './net-test.mjs';
import { g, makePack } from './net-pack.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const shots = resolve(process.argv[3] || '/tmp/sg-shots');
const tmp = '/tmp/sg-mech';
mkdirSync(shots, { recursive: true });
mkdirSync(tmp, { recursive: true });
let passed = 0, failed = 0;
function ok(c, what) { if (c) { passed++; console.log('  ✓', what); } else { failed++; console.log('  ✗', what); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// короткие для проверки: перегрев 4 с, блок после прерывания 8 с (сеанс 6 с — только перед проверкой перегрева)
const game = JSON.parse(JSON.stringify(g));
Object.assign(game.spy, { maxMin: 1, coolMin: 4 / 60, cutCoolMin: 8 / 60, glitchFrom: 1, glitchGrow: 600, glitchMax: 40 });
const pack = await makePack(game);

buildJava();
const centerFile = tmp + '/center.json';
if (existsSync(centerFile)) rmSync(centerFile);
const PORT = 18805;
const center = await startCenter(PORT, centerFile);
const NET = 'SGNET:ws://127.0.0.1:' + PORT;
const web = spawn('python3', ['-m', 'http.server', '8767', '--bind', '127.0.0.1'], { cwd: resolve(root, 'dist/www'), stdio: 'ignore' });
await sleep(700);
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1, hasTouch: true, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION|navigator.vibrate/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
  await p.goto('http://127.0.0.1:8767/');
  await p.locator('#scr-boot.on').waitFor();
  await p.setInputFiles('#file', { name: 'test.sgpack', mimeType: 'application/zip', buffer: pack });
  await p.locator('#scr-login.on').waitFor();
  return p;
}
const enter = (p, code) => p.evaluate((c) => window.sgPlayer.enter(c, 'pad'), code);
const title = (p) => p.locator('#dlg.on .dlg-title').textContent({ timeout: 4000 }).catch(() => '');
const text = (p) => p.locator('#dlg.on .dlg-text').textContent({ timeout: 1000 }).catch(() => '');
const closeDlg = async (p) => { for (let i = 0; i < 12 && await p.locator('#dlg.on').count(); i++) { await p.locator('#dlg .dlg-btns .btn').last().click(); await sleep(110); } };
const waitFor = async (fn, ms = 5000) => { const t = Date.now() + ms; while (Date.now() < t) { if (await fn()) return true; await sleep(100); } return false; };
const st = (p, k) => p.evaluate((k) => window.SGNet.state[k], k);
const spyKey = 'spy:aA:aT';

console.log('Шпионаж текстом (П25, 06: 140, 146)');
const pA = await phone('A'), pB = await phone('B'), pT = await phone('T'), pM = await phone('M');
for (const [p, login] of [[pA, '111111'], [pB, '222222'], [pT, '555555']]) {
  await enter(p, NET);
  await closeDlg(p);
  await enter(p, login);
  await p.locator('#scr-main.on').waitFor();
  await closeDlg(p);
}
ok(await waitFor(async () => (await pA.locator('#bar-net.up').count()) && (await pT.locator('#bar-net.up').count())), 'телефоны на связи');
await enter(pM, NET); await closeDlg(pM); await enter(pM, '98765432');
await pM.locator('#dlg .btn', { hasText: 'Пульт мастера' }).click();
await pM.locator('#console.on').waitFor();
await pM.locator('label', { hasText: 'Этот телефон — мастерский' }).locator('input').check();

ok(await pT.locator('#tabs button[data-tab=spy]:not([hidden])').count() === 1 && (await pT.locator('#tabs button[data-tab=spy]').textContent()) === 'ПЕРЕХВАТ', 'у шпиона вкладка «ПЕРЕХВАТ»');
ok(await pA.locator('#tabs button[data-tab=spy]:not([hidden])').count() === 0, 'у остальных вкладки нет');
await pT.locator('#tabs button[data-tab=spy]').click();
ok(await pT.locator('#tab-spy.on #spy-code').count() === 1, 'режим «по коду»: поле кода прослушки');
await pT.screenshot({ path: `${shots}/mech-1-spy-idle.png` });
await pT.locator('#spy-code').fill('9999');
await pT.locator('#spy-go').click();
ok(/НЕТ ТАКОГО КАНАЛА/.test(await pT.locator('#tab-spy').textContent()), 'неверный код — «нет такого канала»');
// код прослушки из вкладки «КОД»
await enter(pT, '7101');
ok(await waitFor(async () => !!(await st(pA, spyKey))), 'код 7101 → в центре сеанс «spy:<жертва>:<шпион>», жертва его видит');
ok(await waitFor(async () => /СИГНАЛ ЕСТЬ/.test(await pT.locator('#tab-spy').textContent())), 'телефон жертвы ответил — «СИГНАЛ ЕСТЬ»');
ok(/КАНАЛ: Инженер Тест/.test(await pT.locator('#tab-spy').textContent()), 'канал — Инженер Тест');
await pA.evaluate(() => window.sgPlayer.P.voiceHeard('где лежит ключ от шлюза', true));
ok(await waitFor(async () => /где лежит ключ от шлюза/.test(await pT.locator('#spy-log').textContent())), 'речь жертвы пришла шпиону текстом');
await pA.evaluate(() => window.sgPlayer.P.voiceHeard('я сказал слава лидеру всем', true));
ok(await waitFor(async () => (await pT.locator('#spy-log mark.spy-hit').count()) > 0 && /слава лидеру/.test(await pT.locator('#spy-log mark.spy-hit').first().textContent())), 'фраза кода подсвечена');
await pA.evaluate(() => window.sgPlayer.P.spyRelay('медленно и тихо', true));
ok(await waitFor(async () => /медленно и тихо…/.test(await pT.locator('#spy-log .spy-part').textContent().catch(() => ''))), 'недоговорённое — серой строкой');
ok(!(await pB.evaluate(() => (window.sgPlayer.P.mine().chat || []).some((x) => /ключ от шлюза/.test(x.text)))), 'у третьего телефона ничего нет');
await pT.screenshot({ path: `${shots}/mech-2-spy-session.png` });
// пульт мастера: кто кого слушает
await pM.locator('#console-tabs button', { hasText: 'ТЕЛЕФОНЫ' }).click();
ok(await waitFor(async () => /Психолог Тест → Инженер Тест/.test(await pM.locator('.ccard', { hasText: 'ПРОСЛУШКА' }).textContent().catch(() => ''))), 'пульт «ПРОСЛУШКА»: Психолог Тест → Инженер Тест');
await pM.screenshot({ path: `${shots}/mech-3-pult-spy.png`, fullPage: true });
// глитчи 0/1 у жертвы
const bits = () => pA.evaluate(() => { const t = document.querySelector('#scr-main').innerText; const n = (t.match(/[01]/g) || []).length; return n; });
const bits0 = await bits();
ok(await waitFor(async () => (await bits()) > bits0 + 10, 6000), 'у жертвы буквы интерфейса становятся 0 и 1 (' + bits0 + ' → ' + (await bits()) + ')');
await pA.screenshot({ path: `${shots}/mech-4-victim-bits.png` });
// проверка линии и прервать встряхиванием
await enter(pA, 'ЛИНИЯ');
ok((await title(pA)) === 'ПРОВЕРКА ЛИНИИ' && /ОБНАРУЖЕНО ПОДКЛЮЧЕНИЕ/.test(await text(pA)), 'жертва: «Проверка линии» — обнаружено подключение');
ok(/встряхните телефон 3 раза/.test(await text(pA)), 'подсказка: встряхнуть 3 раза');
ok(!/[01]{3}/.test(await pA.locator('#dlg').innerText()), 'окно проверки без глитчей');
await pA.screenshot({ path: `${shots}/mech-5-victim-check.png` });
for (let i = 0; i < 3; i++) { await pA.evaluate(() => window.sgPlayer.P.shake()); await sleep(300); }
ok(await waitFor(async () => (await title(pA)) === 'ПРОСЛУШКА ПРЕРВАНА'), 'три встряхивания — «ПРОСЛУШКА ПРЕРВАНА»');
ok(await waitFor(async () => !(await st(pT, spyKey))), 'сеанс убран из центра');
ok(await waitFor(async () => (await bits()) <= bits0), 'у жертвы глитчи прошли');
ok(await waitFor(async () => /СОЕДИНЕНИЕ ПРЕРВАНО/.test(await pT.locator('#tab-spy').textContent())), 'у шпиона — «СОЕДИНЕНИЕ ПРЕРВАНО», программа заблокирована');
await pT.screenshot({ path: `${shots}/mech-6-spy-cut.png` });
await closeDlg(pA);
await enter(pT, '7101');
ok(!(await st(pT, spyKey)) && /СОЕДИНЕНИЕ ПРЕРВАНО/.test(await pT.locator('#tab-spy').textContent()), 'во время блока подключиться нельзя');
ok(await waitFor(async () => !!(await pT.locator('#spy-code').count()), 10000), 'блок кончился — снова поле кода');
// кодом прерывания из вкладки «КОД»
await enter(pT, '7101');
ok(await waitFor(async () => !!(await st(pA, spyKey))), 'снова подключились');
await enter(pA, 'РАЗРЫВ');
ok(await waitFor(async () => (await title(pA)) === 'ПРОСЛУШКА ПРЕРВАНА' && !(await st(pA, spyKey))), 'код РАЗРЫВ во вкладке «КОД» прерывает');
await closeDlg(pA);
await enter(pA, 'ЛИНИЯ');
ok(/Линия чиста/.test(await text(pA)), 'после прерывания — «линия чиста»');
await closeDlg(pA);
// настройки 0000 — строка «Проверка линии»
await enter(pB, '0000');
ok(await pB.locator('#dlg.on .btn', { hasText: 'Проверка линии' }).count() === 1, 'в настройках игрока — «Проверка линии»');
await pB.locator('#dlg.on .btn', { hasText: 'Проверка линии' }).click();
ok(/Линия чиста/.test(await text(pB)), 'Медик: линия чиста');
await closeDlg(pB);
// перегрев: сеанс 6 с
await waitFor(async () => !!(await pT.locator('#spy-code').count()), 12000);
await pT.evaluate(() => { window.sgPlayer.game().spy.maxMin = 0.1; });
await enter(pT, 'УХО МЕДИКА');
ok(await waitFor(async () => !!(await st(pB, 'spy:aB:aT'))), 'код прослушки словами (Медик)');
ok(await waitFor(async () => /ПЕРЕГРЕВ/.test(await pT.locator('#tab-spy').textContent()), 9000), 'через N минут — «ПЕРЕГРЕВ»');
ok(!(await st(pT, 'spy:aB:aT')), 'перегрев — сеанс убран из центра');
ok(await waitFor(async () => (await title(pT)) === 'ПЕРЕГРЕВ ПЕРЕХВАТА'), 'действие при перегреве (уведомление себе)');
await closeDlg(pT);
await pT.screenshot({ path: `${shots}/mech-7-spy-heat.png` });
ok(await waitFor(async () => !!(await pT.locator('#spy-code').count()), 7000), 'перегрев кончился');
await pT.evaluate(() => { window.sgPlayer.game().spy.maxMin = 1; });
// голосом у шпиона: «ухо медика»
await pT.evaluate(() => window.sgPlayer.P.voiceHeard('ухо медика', false));
ok(await waitFor(async () => !!(await st(pB, 'spy:aB:aT'))), 'код прослушки голосом шпиона');
await pB.evaluate(() => window.sgPlayer.P.voiceHeard('проверка связи', true));
ok(await waitFor(async () => /проверка связи/.test(await pT.locator('#spy-log').textContent())), 'Медик без голоса в фоне — всё равно слышно');
// выход из программы — запись стирается
await pT.locator('#tabs button[data-tab=data]').click();
ok(await waitFor(async () => !(await st(pB, 'spy:aB:aT'))), 'ушёл из программы — сеанс закрыт');
await pT.locator('#tabs button[data-tab=spy]').click();
ok(!(await pT.locator('#spy-log').count()) && !/проверка связи/.test(await pT.locator('#tab-spy').textContent()), 'запись стёрта');
// старый сеанс после перезапуска шпиона убирается
await enter(pT, '7101');
ok(await waitFor(async () => !!(await st(pA, spyKey))), 'подключились к Инженеру');
await pT.reload();
await pT.locator('#scr-main.on').waitFor();
ok(await waitFor(async () => !(await st(pA, spyKey)), 8000), 'шпион перезапустил приложение — старый сеанс убран');
// пульт может прервать
await enter(pT, '7101');
await waitFor(async () => !!(await st(pA, spyKey)));
await pM.locator('#console-tabs button', { hasText: 'ИГРА' }).click();
await pM.locator('#console-tabs button', { hasText: 'ТЕЛЕФОНЫ' }).click();
await pM.locator('.ccard', { hasText: 'ПРОСЛУШКА' }).locator('button', { hasText: 'Прервать' }).first().click();
ok(await waitFor(async () => !(await st(pA, spyKey)) && /СОЕДИНЕНИЕ ПРЕРВАНО/.test(await pT.locator('#tab-spy').textContent())), 'мастер прервал с пульта');

console.log('Мини-игра «два выбора голосом» (П25, 06: 142, 147)');
await closeDlg(pT);
await pT.locator('#tabs button[data-tab=data]').click();
const OK = ['красный', 'северный шлюз', 'налево', 'открыть'];
const opts = () => pT.evaluate(() => Array.from(document.querySelectorAll('#mg .mg-opt')).map((b) => b.textContent));
const okOf = async () => (await opts()).find((t) => OK.includes(t));
const noOf = async () => (await opts()).find((t) => !OK.includes(t));
const say = (p, t) => p.evaluate((t) => window.sgPlayer.P.voiceHeard(t, true), t);
await enter(pT, 'GAME');
ok(await waitFor(async () => (await pT.locator('#mg.on').count()) === 1), 'код GAME → мини-игра на экране');
ok(/ЭТАП 1 \/ 3/.test(await pT.locator('#mg-stage').textContent()) && (await opts()).length === 2 && !!(await okOf()), 'этап 1 из 3, два варианта: ' + (await opts()).join(' / '));
ok(/СКАЖИТЕ ВЕРНЫЙ ВАРИАНТ/.test(await pT.locator('#mg-hint').textContent()) && !(await pT.locator('#mg .mg-opt.can').count()), 'сначала только голос (кнопки не нажимаются)');
await pT.screenshot({ path: `${shots}/mech-8-game.png` });
const v1 = await pT.evaluate(() => JSON.parse(JSON.stringify(window.sgPlayer.P.mgPhrases())));
ok(v1.length === 2 && /^mg:\d+:[01]$/.test(v1[0].id), 'варианты этапа — в грамматике голоса (' + v1.map((p) => p.text).join(', ') + ')');
await say(pT, await noOf());
ok(await waitFor(async () => /Ошибок: 1 из 3/.test(await pT.locator('#mg-err').textContent())), 'сказал неверный — ошибка 1 из 3, новая пара');
await say(pT, 'я думаю ' + await okOf());
ok(await waitFor(async () => /ЭТАП 2 \/ 3/.test(await pT.locator('#mg-stage').textContent())), 'сказал верный (внутри фразы) — этап 2');
ok(await waitFor(async () => (await pT.locator('#mg .mg-opt.can').count()) === 2, 12000), 'через 10 с — кнопки');
await pT.locator('#mg .mg-opt', { hasText: new RegExp('^(' + OK.join('|') + ')$') }).click();
ok(await waitFor(async () => /ЭТАП 3 \/ 3/.test(await pT.locator('#mg-stage').textContent())), 'нажал верный — этап 3');
await say(pT, await okOf());
ok(await waitFor(async () => (await pT.locator('#mg-end-t').textContent()) === 'УСПЕХ' && /Шлюз открыт/.test(await pT.locator('#mg-end-x').textContent())), 'все этапы — «УСПЕХ» и текст успеха');
await pT.screenshot({ path: `${shots}/mech-9-game-win.png` });
await pT.locator('#mg-ok').click();
ok(await waitFor(async () => (await title(pT)) === 'ШЛЮЗ ОТКРЫТ'), 'действие при успехе (уведомление)');
await closeDlg(pT);
ok(await pT.evaluate(() => { const r = window.sgPlayer.P.mine().games.mg1; return r.n === 1 && r.won; }), 'запись: сыграно 1, выиграно');
// провал по ошибкам
await enter(pT, 'GAME');
await waitFor(async () => (await pT.locator('#mg.on').count()) === 1);
for (let i = 0; i < 3; i++) { await say(pT, await noOf()); await sleep(250); }
ok(await waitFor(async () => (await pT.locator('#mg-end-t').textContent()) === 'ПРОВАЛ' && /Шлюз заблокирован/.test(await pT.locator('#mg-end-x').textContent())), '3 ошибки — «ПРОВАЛ»');
await pT.screenshot({ path: `${shots}/mech-10-game-fail.png` });
await pT.locator('#mg-ok').click();
ok(await waitFor(async () => (await pT.locator('#app.gl-noise, #app.gl-shift').count()) > 0), 'действие при провале — сбой экрана');
await pT.evaluate(() => window.sgPlayer.P.shake());
// общее время и пауза
await pT.evaluate(() => { window.sgPlayer.game().games[1].totalSec = 3; });
await enter(pT, 'GAME2');
ok(await waitFor(async () => /до конца игры/.test(await pT.locator('#mg-timetxt').textContent())), 'GAME2 — время на всю игру');
ok(/альфа|бета/.test((await opts()).join()), 'пары по порядку: первая — альфа/бета');
ok(await waitFor(async () => (await pT.locator('#mg-end-t').textContent()) === 'ПРОВАЛ' && /ВРЕМЯ ВЫШЛО/.test(await pT.locator('#mg-end-x').textContent()), 6000), 'вышло общее время — провал');
await pT.locator('#mg-ok').click();
await enter(pT, 'GAME2');
ok(/Снова — через/.test(await text(pT)), 'повтор с паузой — «снова через …»');
await closeDlg(pT);
// с пульта — Медику; выход — провал
await pM.locator('#console-tabs button', { hasText: 'ИГРА' }).click();
const gcard = pM.locator('.ccard', { hasText: 'МИНИ-ИГРЫ' });
ok(await gcard.count() === 1, 'пульт: карточка «МИНИ-ИГРЫ»');
await gcard.locator('label', { hasText: 'Медик Тест' }).locator('input').check();
await gcard.locator('button', { hasText: 'Запустить' }).click();
ok(await waitFor(async () => (await pB.locator('#mg.on').count()) === 1) && !(await pA.locator('#mg.on').count()), 'с пульта — мини-игра у Медика (у Инженера нет)');
await pB.locator('#mg-back').click();
ok(await waitFor(async () => !(await pB.locator('#mg.on').count()) && await pB.evaluate(() => { const r = window.sgPlayer.P.mine().games.mg1; return r && r.n === 1 && !r.won; })), 'Медик вышел из игры — засчитано как провал');
await closeDlg(pM);

web.kill();
center.kill();
await browser.close();
ok(errors.length === 0, 'ошибок на страницах нет' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
console.log(failed ? `${passed}/${passed + failed} проверок механик пройдено` : `МЕХАНИКИ: ВСЁ ХОРОШО (${passed})`);
process.exit(failed ? 1 : 0);
