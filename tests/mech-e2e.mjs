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
Object.assign(game.spy, { fail: false, slider: false, maxMin: 1, coolMin: 4 / 60, cutCoolMin: 8 / 60, glitchFrom: 1, glitchGrow: 600, glitchMax: 40,
  fx: [{ kind: 'bits', power: 1, grow: 600 }, { kind: 'typo', power: 20, grow: 0 }, { kind: 'vibe', power: 100, grow: 0 }, { kind: 'ripple', power: 50, grow: 0 }, { kind: 'glitch', glitch: 'gTy', power: 100, grow: 0 }] });
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
// П26 (06, 154): голос в фоне по умолчанию; фраза «только при экране в приложении»
await pA.evaluate(() => { window.SG_NO_MIC = true; });   // П26: звук шпионажа подаёт проверка (P.spyAudioFeed); микрофон страницы — ниже
{
  const cfgScr = await pA.evaluate(() => (window.SG.voiceConfig(window.sgPlayer.game(), window.sgPlayer.P.flatState()).phrases.find((x) => x.id === 'kScr') || {}).scr);
  ok(cfgScr === true, 'П26: у фразы флаг «только при экране» уходит в настройку голоса');
  const rb = await pA.evaluate(() => window.sgPlayer.P.voiceHeard('только при экране', true));
  ok(rb && rb.scr === 'kScr' && !(await pA.locator('#dlg.on').count()), 'П26: в фоне фраза «только при экране» молчит');
  const rf = await pA.evaluate(() => window.sgPlayer.P.voiceHeard('только при экране', false));
  ok(rf && !rf.scr && await waitFor(async () => /Фраза сработала в приложении/.test(await text(pA))), 'П26: в приложении — срабатывает');
  await closeDlg(pA);
  const dm = await pA.evaluate(() => { const g = JSON.parse(JSON.stringify(window.sgPlayer.game())); const a = g.accounts.find((x) => x.id === 'aB'); delete a.voiceMode; window.SG.normalize(g); return a.voiceMode; });
  ok(dm === 'always', 'П26: голос без режима — «всегда в фоне»');
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
ok(await waitFor(async () => /Психолог Тест → Инженер Тест/.test(await pM.locator('.ccard', { hasText: 'ПРОСЛУШКА И ВЗЛОМ' }).textContent().catch(() => ''))), 'пульт «ПРОСЛУШКА»: Психолог Тест → Инженер Тест');
await pM.screenshot({ path: `${shots}/mech-3-pult-spy.png`, fullPage: true });
// глитчи 0/1 у жертвы
const bits = () => pA.evaluate(() => { const t = document.querySelector('#scr-main').innerText; const n = (t.match(/[01]/g) || []).length; return n; });
const bits0 = await bits();
ok(await waitFor(async () => (await bits()) > bits0 + 10, 6000), 'у жертвы буквы интерфейса становятся 0 и 1 (' + bits0 + ' → ' + (await bits()) + ')');
// П26 (06, 155): вид глитча — несколько эффектов сразу
ok(await waitFor(async () => { const f = await pA.evaluate(() => window.sgPlayer.P.spyFxNow()); return f.typo > 0 && f.vibe > 0 && f.ripple > 0 && f['glitch:gTy'] > 0; }), 'П26: у жертвы — 0/1, «не те буквы», вибрация, рябь и сбой из списка');
ok(await pA.locator('#spy-ripple.on').count() === 1 && await pA.locator('#app.spy-rip').count() === 1, 'П26: рябь экрана видна');
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.P.spyVibes || 0)) > 0), 'П26: вибрация была');
ok((await pA.evaluate(() => window.sgPlayer.P.typoLevel())) >= 0.2, 'П26: «не те буквы» — уровень клавиатуры от прослушки');
ok(await waitFor(async () => await pA.evaluate(() => window.sgPlayer.P.activeGlitches().some((a) => a.g.id === 'gTy')), 12000), 'П26: сбой «Сбой клавиатуры» начался от прослушки');
await pA.screenshot({ path: `${shots}/mech-4-victim-bits.png` });
// П26 (06, 153): шпионаж звуком — у шпиона строка «ЗВУК», куски 0,5 с через центр, играют с задержкой
ok(await pT.locator('#spy-snd').count() === 1 && /задержка 2 с/.test(await pT.locator('#spy-snd').textContent()), 'П26: у шпиона — «🔊 ЗВУК · задержка 2 с»');
await pA.evaluate(() => { const f = new Float32Array(8000); for (let i = 0; i < f.length; i++) f[i] = 0.5 * Math.sin(i / 3); window.sgPlayer.P.spyAudioFeed(f); });
ok((await pA.evaluate(() => window.sgPlayer.P.spySndStat().sent)) >= 2, 'П26: жертва отправила звук (1 с — 2 куска)');
ok(await waitFor(async () => (await pT.evaluate(() => window.sgPlayer.P.spySndStat().got)) >= 2, 4000), 'П26: шпион получил звук через центр');
ok((await pT.evaluate(() => window.sgPlayer.P.spySndStat().played)) === 0, 'П26: сразу не играет — задержка');
ok(await waitFor(async () => { const s = await pT.evaluate(() => window.sgPlayer.P.spySndStat()); return s.played >= 2 && s.level > 0.3; }, 5000), 'П26: через 2 с звук играет (уровень на полосе)');
await pT.screenshot({ path: `${shots}/mech-2b-spy-sound.png` });
// П26 (06, 156): видео-шпионаж — приложение жертвы на экране: видео; свёрнуто (браузер) — «камера цели недоступна»
ok(await pT.locator('#spy-cam').count() === 1, 'П26: у шпиона — окно камеры цели');
ok(await waitFor(async () => { const c = await pT.evaluate(() => window.sgPlayer.P.spyCamStat()); return c && c.cam === 'video' && c.frames >= 3; }, 10000) && /● ВИДЕО/.test(await pT.locator('#spy-cam-st').textContent()), 'П26: жертва на экране — «● ВИДЕО», кадры идут');
ok(await pT.evaluate(() => /^data:image\/jpeg;base64,/.test(document.getElementById('spy-img').src)), 'П26: кадр — JPEG');
await pT.screenshot({ path: `${shots}/mech-2c-spy-video.png` });
const hide = (p, h) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }, h);
await hide(pA, true);
ok(await waitFor(async () => /КАМЕРА ЦЕЛИ НЕДОСТУПНА/.test(await pT.locator('#spy-cam-st').textContent()), 8000), 'П26: жертва свернула (браузер — камеры в фоне нет) — «○ КАМЕРА ЦЕЛИ НЕДОСТУПНА»');
await hide(pA, false);
ok(await waitFor(async () => /● ВИДЕО/.test(await pT.locator('#spy-cam-st').textContent()), 10000), 'П26: жертва открыла приложение — снова видео');
const sent0 = await pA.evaluate(() => window.sgPlayer.P.spySndStat().sent);
await pA.evaluate(() => { window.SG_NO_MIC = false; });
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.P.spySndStat().sent)) > sent0 + 2, 8000), 'П26: браузер жертвы — звук со своего микрофона (8 кГц, кусками)');
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
ok(await pA.locator('#spy-ripple.on').count() === 0 && (await pA.evaluate(() => window.sgPlayer.P.typoLevel())) === 0 && !(await pA.evaluate(() => window.sgPlayer.P.activeGlitches().some((a) => a.g.id === 'gTy'))), 'П26: рябь, клавиатура и сбой от прослушки прошли');
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
// П26 (Т37-6 А): «в руках / лежит» на пульте «ТЕЛЕФОНЫ»
const rowB = () => pM.locator('.phone-row', { hasText: 'Медик Тест' }).locator('.pr4').textContent().catch(() => '');
ok(await waitFor(async () => /в руках/.test(await rowB()), 8000), 'П26: на пульте — «✋ в руках» (браузер без датчика)');
await pB.evaluate(() => { window.SG_HANDS = false; });
ok(await waitFor(async () => /лежит/.test(await rowB()), 8000), 'П26: положили — «лежит» (сразу при смене)');
await pM.locator('.ccard', { hasText: 'В РУКАХ — НАСТРОЙКА' }).locator('button', { hasText: 'Следить у всех' }).click();
ok(await waitFor(async () => /дрожание .* порог 0,08/.test(await rowB()), 8000) && !!(await pB.evaluate(() => window.SGNet.state.handsProbe && window.SGNet.state.handsProbe.on)), 'П26: «Следить у всех» — дрожание и порог у каждого телефона');
await pM.screenshot({ path: `${shots}/mech-3b-pult-hands.png`, fullPage: true });
await pM.locator('.ccard', { hasText: 'В РУКАХ — НАСТРОЙКА' }).locator('button', { hasText: 'Перестать следить' }).click();
ok(await waitFor(async () => !(await pB.evaluate(() => window.SGNet.state.handsProbe))), 'П26: «Перестать следить»');
await pB.evaluate(() => { window.SG_HANDS = null; });

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
await closeDlg(pT); await pT.locator('#mg-ok').click();
ok(await waitFor(async () => (await title(pT)) === 'ШЛЮЗ ОТКРЫТ'), 'действие при успехе (уведомление)');
await closeDlg(pT);
ok(await pT.evaluate(() => { const r = window.sgPlayer.P.mine().games.mg1; return r.n === 1 && r.won; }), 'запись: сыграно 1, выиграно');
// провал по ошибкам
await enter(pT, 'GAME');
await waitFor(async () => (await pT.locator('#mg.on').count()) === 1);
for (let i = 0; i < 3; i++) { await say(pT, await noOf()); await sleep(250); }
ok(await waitFor(async () => (await pT.locator('#mg-end-t').textContent()) === 'ПРОВАЛ' && /Шлюз заблокирован/.test(await pT.locator('#mg-end-x').textContent())), '3 ошибки — «ПРОВАЛ»');
await pT.screenshot({ path: `${shots}/mech-10-game-fail.png` });
await closeDlg(pT); await pT.locator('#mg-ok').click();
ok(await waitFor(async () => (await pT.locator('#app.gl-noise, #app.gl-shift').count()) > 0), 'действие при провале — сбой экрана');
await pT.evaluate(() => window.sgPlayer.P.shake());
// общее время и пауза
await pT.evaluate(() => { window.sgPlayer.game().games[1].totalSec = 3; });
await enter(pT, 'GAME2');
ok(await waitFor(async () => /до конца игры/.test(await pT.locator('#mg-timetxt').textContent())), 'GAME2 — время на всю игру');
ok(/альфа|бета/.test((await opts()).join()), 'пары по порядку: первая — альфа/бета');
ok(await waitFor(async () => (await pT.locator('#mg-end-t').textContent()) === 'ПРОВАЛ' && /ВРЕМЯ ВЫШЛО/.test(await pT.locator('#mg-end-x').textContent()), 6000), 'вышло общее время — провал');
await closeDlg(pT); await pT.locator('#mg-ok').click();
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

console.log('Взлом: ловля волны, чтение экрана, защита (П25, 06: 141, 148)');
await pT.evaluate(() => { const g = window.sgPlayer.game(); g.hack.list = ['aA', 'aB']; g.wave.real = 2; g.hack.blockMin = 0.08; });
for (const p of [pA, pB]) await p.evaluate(() => { const g = window.sgPlayer.game(); g.hack.from = 0; g.hack.to = 1; g.hack.bitsGrow = 300; });   // П26: рост быстрее — проверка не зависит от того, какие буквы выпали
ok(await pT.locator('#tabs button[data-tab=hack]:not([hidden])').count() === 1, 'у тестировщика вкладка «ВЗЛОМ»');
await pT.locator('#tabs button[data-tab=hack]').click();
ok(await waitFor(async () => (await pT.locator('#hk-wave .wv-scale').count()) === 1), 'шкала ловли волны');
const chans = await pT.evaluate(() => document.querySelector('#hk-wave').wave.chans.map((c) => ({ at: c.at, kind: c.kind, id: c.id || '', label: c.label || '' })));
ok(chans.filter((c) => c.kind !== 'music').length === 6 && chans.filter((c) => c.kind === 'music').length === 1 && chans.filter((c) => c.kind === 'real').length === 2 && chans.filter((c) => c.kind === 'trap').length === 1, 'каналы: 6 и музыка (П26), из них 2 настоящих и ловушка (' + chans.map((c) => c.kind[0] + Math.round(c.at)).join(' ') + ')');
const rA = chans.find((c) => c.id === 'aA');
await pT.screenshot({ path: `${shots}/mech-11-wave.png` });
await pT.evaluate((x) => document.querySelector('#hk-wave').wave.set(x), rA.at);
ok(await waitFor(async () => /СИГНАЛ К-/.test(await pT.locator('#wv-info').textContent())), 'на канале — «СИГНАЛ» и частота ' + rA.label);
ok(await waitFor(async () => !!(await st(pA, 'hack:aA:aT')), 6000), 'удержал 3 с — взлом: сеанс «hack:Инженер:тестировщик»');
ok(await waitFor(async () => (await pT.locator('#hklay.on #hk-view .hk-clear .hk-t').count()) > 5, 6000), 'у взломщика — экран цели в окне на весь экран (П27: раскладка — размытая копия и полоса)');
const inner = () => pT.evaluate(() => document.querySelector('#hk-view .hk-clear').textContent);
ok(await waitFor(async () => /Инженер|ДАННЫЕ/.test(await inner())), 'в снимке — экран Инженера');
ok(await pT.evaluate(() => getComputedStyle(document.querySelector('#hk-view .hk-blur')).filter.includes('blur')) && await pT.locator('#hklay.mono').count() === 1, 'размыт и монохромный');
const box = await pT.locator('#hk-view').boundingBox();
await pT.mouse.move(box.x + 50, box.y + box.height * 0.6); await pT.mouse.down(); await pT.mouse.move(box.x + 60, box.y + box.height * 0.62); await pT.mouse.up();
ok(await waitFor(async () => { const o = await pA.evaluate(() => window.sgPlayer.P.hackOwn()); return o && Math.abs(o.top / 800 - 0.62) < 0.08 && /hk-noise/.test(o.cls); }), 'у жертвы полоса там, где читает взломщик (белый шум)');
ok(await waitFor(async () => (await pA.evaluate(() => (document.querySelector('#scr-main').innerText.match(/[01]/g) || []).length)) > 8, 6000), 'у жертвы начались 0/1');
ok(await pA.evaluate(() => window.sgPlayer.P.typoLevel()) > 0, 'и «не те буквы» на клавиатуре');
await pT.screenshot({ path: `${shots}/mech-12-hack-view.png` });
await pA.screenshot({ path: `${shots}/mech-13-hack-victim.png` });
// П27 (замечания автора к взлому): экран цели целиком на весь экран, без времени сеанса; строки там же, где у жертвы; 0/1 мигают
const hv = await pT.evaluate(() => window.sgPlayer.P.hackView());
ok(hv && hv.x >= -1 && hv.y >= -1 && hv.x + hv.w <= hv.W + 1 && hv.y + hv.h <= hv.H + 1 && (Math.abs(hv.w - hv.W) < 2 || Math.abs(hv.h - hv.H) < 2), 'П27: экран цели вписан целиком и во весь экран (' + (hv && [hv.w, hv.h, hv.W, hv.H].map(Math.round).join('×')) + ')');
ok(!/\d\d:\d\d/.test(await pT.locator('#hklay').textContent() + await pT.locator('#tab-hack').textContent()), 'П27: времени сеанса у взломщика нет');
await pT.setViewportSize({ width: 360, height: 600 });
await sleep(300);
const hv2 = await pT.evaluate(() => window.sgPlayer.P.hackView());
ok(hv2 && hv2.y >= -1 && hv2.y + hv2.h <= 601 && hv2.x + hv2.w <= 361 && hv2.fh === 800, 'П27: у шпиона экран меньше (360×600) — экран цели (400×800) всё равно целиком, низ не обрезан');
await pT.screenshot({ path: `${shots}/mech-12b-hack-small.png` });
await pT.setViewportSize({ width: 400, height: 800 });
const pos = await pA.evaluate(() => {
  const w = document.createTreeWalker(document.querySelector('#scr-main'), NodeFilter.SHOW_TEXT, null); let n, r = null;
  while ((n = w.nextNode())) { if (!/\S/.test(n.nodeValue) || !n.parentElement.getClientRects().length) continue; const rg = document.createRange(); rg.selectNodeContents(n); const q = rg.getClientRects()[0]; if (q && q.width > 20 && q.top > 0) { r = { x: q.left, y: q.top }; break; } }
  const f = window.sgPlayer.P.hackSnap();
  return { r, hit: !!r && f.items.some((it) => it[0] === 't' && Math.abs(it[1] - r.x) < 2 && Math.abs(it[2] - r.y) < 2) };
});
ok(pos.hit, 'П27: в снимке строка стоит там же, где у жертвы (' + (pos.r ? Math.round(pos.r.x) + ',' + Math.round(pos.r.y) : '—') + ')');
ok(await pT.evaluate(() => { const v = document.querySelector('#hk-view'), k = v.getBoundingClientRect().width / v.offsetWidth, R = v.getBoundingClientRect(), bad = [];
  document.querySelectorAll('#hk-view .hk-clear .hk-t').forEach((e) => { const r = e.getBoundingClientRect(); const x = R.left + parseFloat(e.style.left) * k, wd = +e.dataset.w * k; if (Math.abs(r.left - x) > 2 || Math.abs(r.width - wd) > 3) bad.push(e.textContent); });
  return bad.length === 0; }), 'П27: у шпиона каждая строка — точно в своём прямоугольнике (ширина как у жертвы)');
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.P.bitsStat().back)) > 0, 12000), 'П27: 0/1 мигают — буква побыла 0/1 и вернулась (' + JSON.stringify(await pA.evaluate(() => window.sgPlayer.P.bitsStat())) + ')');
const beeps0 = await pB.evaluate(() => window.sgPlayer.P.hackBeeps || 0);
for (let i = 0; i < 3; i++) { await pA.evaluate(() => window.sgPlayer.P.shake()); await sleep(300); }
ok(await waitFor(async () => (await title(pA)) === 'ВЗЛОМ ОТРАЖЁН' && !(await st(pA, 'hack:aA:aT'))), 'жертва встряхнула 3 раза — «ВЗЛОМ ОТРАЖЁН», сеанс убран');
ok(await waitFor(async () => /ВЗЛОМ ОБНАРУЖЕН/.test(await pT.locator('#tab-hack').textContent())), 'у взломщика — «ВЗЛОМ ОБНАРУЖЕН», блок');
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.hackBeeps || 0)) > beeps0, 4000), 'писк у случайного телефона в руках (Медик)');
await closeDlg(pA);
ok(await waitFor(async () => !(await pA.evaluate(() => window.sgPlayer.P.hackOwn())) && (await pA.evaluate(() => (document.querySelector('#scr-main').innerText.match(/[01]/g) || []).length)) < 6), 'у жертвы полоса и 0/1 прошли');
// ловушка
ok(await waitFor(async () => (await pT.locator('#hk-wave .wv-scale').count()) === 1, 9000), 'блок кончился — снова шкала');
await pT.evaluate(() => { window.sgPlayer.game().wave.trapSec = 1; });
await pT.locator('#tabs button[data-tab=data]').click(); await pT.locator('#tabs button[data-tab=hack]').click();
const trap = await pT.evaluate(() => document.querySelector('#hk-wave').wave.chans.find((c) => c.kind === 'trap').at);
await pT.evaluate((x) => document.querySelector('#hk-wave').wave.set(x), trap);
ok(await waitFor(async () => /ЛОЖНАЯ ВОЛНА/.test(await pT.locator('#tab-hack').textContent()), 4000), 'волна-ловушка — сбой у взломщика');
ok(await waitFor(async () => (await pT.locator('#app.gl-noise, #app.gl-shift').count()) > 0), 'сбой ловушки — «Сбой экрана»');
await pT.evaluate(() => window.sgPlayer.P.shake());
await closeDlg(pT);
// защита кодом
const ch2 = await pT.evaluate(() => document.querySelector('#hk-wave').wave.chans.find((c) => c.id === 'aB').at);
await pT.evaluate((x) => document.querySelector('#hk-wave').wave.set(x), ch2);
ok(await waitFor(async () => !!(await st(pB, 'hack:aB:aT')), 6000), 'взлом Медика');
await enter(pB, 'ЩИТ');
ok(await waitFor(async () => (await title(pB)) === 'ВЗЛОМ ОТРАЖЁН' && !(await st(pB, 'hack:aB:aT'))), 'код ЩИТ отражает взлом');
await closeDlg(pB);
// пульт видит взлом
// сбои «0/1» и «не те буквы» (06, 141)
await enter(pB, 'BITS');
await closeDlg(pB);
ok(await waitFor(async () => (await pB.evaluate(() => (document.querySelector('#scr-main').innerText.match(/[01]/g) || []).length)) > 4, 4000), 'сбой «0/1»: буквы → 0 и 1');
await pB.evaluate(() => window.sgPlayer.P.shake());
ok(await waitFor(async () => (await pB.evaluate(() => (document.querySelector('#scr-main').innerText.match(/[01]/g) || []).length)) < 4), 'встряхнул — прошло');
await enter(pB, 'TYPO');
await closeDlg(pB);
ok((await pB.evaluate(() => window.sgPlayer.P.typoLevel())) >= 0.19, 'сбой «не те буквы»: вероятность ' + (await pB.evaluate(() => window.sgPlayer.P.typoLevel())).toFixed(2));
// ловля волны у «ПЕРЕХВАТА»
await pT.evaluate(() => { const g = window.sgPlayer.game(); g.spy.mode = 'wave'; g.spy.list = ['aA', 'aB']; g.wave.real = 2; });
await pT.locator('#tabs button[data-tab=data]').click(); await pT.locator('#tabs button[data-tab=spy]').click();
ok(await waitFor(async () => (await pT.locator('#spy-wave .wv-scale').count()) === 1), '«ПЕРЕХВАТ» в режиме «ловля волны» — та же шкала');
// П26 (06, 150, 153): на шкале — музыка «для шкалы», звук шкалы (шум, музыка, позывные)
const chM = await pT.evaluate(() => { const w = document.querySelector('#spy-wave').wave; return { m: w.chans.find((c) => c.kind === 'music'), n: w.chans.find((c) => c.kind === 'noise'), r: !!w.radio }; });
ok(chM.r && chM.m && chM.m.file === 'radio.mp3' && /^FM /.test(chM.m.label), 'П26: на шкале канал-музыка «' + (chM.m && chM.m.label) + '» (radio.mp3) и звук шкалы');
await pT.evaluate((x) => document.querySelector('#spy-wave').wave.set(x), chM.m.at);
ok(await waitFor(async () => { const l = await pT.evaluate(() => document.querySelector('#spy-wave').wave.radio.levels()); return l.kind === 'music' && l.music > 0.5 && l.noise < 0.1; }), 'П26: на музыке — играет mp3, шума почти нет');
ok(/ЭФИР FM/.test(await pT.locator('#wv-info').textContent()) && !(await st(pA, 'spy:aA:aT')), 'П26: музыку поймать нельзя («ЭФИР FM …»)');
await pT.evaluate((x) => document.querySelector('#spy-wave').wave.set(x), chM.n.at);
ok(await waitFor(async () => { const l = await pT.evaluate(() => document.querySelector('#spy-wave').wave.radio.levels()); return l.kind === 'noise' && l.music === 0 && l.noise > 0.1; }), 'П26: на помехах — только шум');
const sA = await pT.evaluate(() => document.querySelector('#spy-wave').wave.chans.find((c) => c.id === 'aA'));
await pT.evaluate((x) => document.querySelector('#spy-wave').wave.set(x - 1), sA.at);
ok(await waitFor(async () => { const l = await pT.evaluate(() => document.querySelector('#spy-wave').wave.radio.levels()); return l.kind === 'real'; }), 'П26: у сигнала персонажа — его позывные');
await pT.evaluate((x) => document.querySelector('#spy-wave').wave.set(x), sA.at);
ok(await waitFor(async () => !!(await st(pA, 'spy:aA:aT')), 6000) && new RegExp('КАНАЛ: ' + sA.label).test(await pT.locator('#tab-spy').textContent()), 'поймал волну — прослушка, канал подписан частотой ' + sA.label);
await pT.locator('#spy-stop').click();

console.log('Конструктор мини-игр: ползунок, код, провода; ползунок в шпионаже (П25, 06: 151)');
// взломы выше дали «перегрев» (правило r10: 3 взлома за минуту) — снять аварию и сбросить счёт
await enter(pT, 'HACK0'); await sleep(1500);
const unAlarm = async (p) => { await p.evaluate(() => window.sgPlayer.enter('COOL', 'pad')); await sleep(300); if (await p.locator('#alarm.on').count()) await p.locator('#alarm-hide').click(); await closeDlg(p); };
await unAlarm(pT);
await pT.locator('#tabs button[data-tab=data]').click();
await enter(pT, 'SLIDE');
ok(await waitFor(async () => (await pT.locator('#mg.on.kind-slider .sl-track').count()) === 1), 'SLIDE — ползунок на экране');
await pT.screenshot({ path: `${shots}/mech-15-slider.png` });
// держим в коридоре: ставим ползунок в середину коридора каждые 100 мс
const holdBand = async (ms) => { const t = Date.now() + ms; while (Date.now() < t) { await pT.evaluate(() => { const s = document.querySelector('#mg-play').slider; if (s) s.set(s.band()); }); await sleep(100); } };
await holdBand(5000);
ok(await waitFor(async () => /ЭТАП 2 \/ 2/.test(await pT.locator('#mg-stage').textContent())), 'продержал 4 с в коридоре — этап 2');
await pT.evaluate(() => { const s = document.querySelector('#mg-play').slider; s.set(0.5); });
ok(await waitFor(async () => /Ошибок: 1 из 3/.test(await pT.locator('#mg-err').textContent())), 'упал до нуля — ошибка');
await holdBand(5000);
ok(await waitFor(async () => (await pT.locator('#mg-end-t').textContent()) === 'УСПЕХ'), 'ползунок — «УСПЕХ»');
await closeDlg(pT); await pT.locator('#mg-ok').click();
ok(await waitFor(async () => (await title(pT)) === 'СИГНАЛ УДЕРЖАН'), 'действие успеха ползунка');
await closeDlg(pT);
// код под таймером
await enter(pT, 'CODEG');
ok(await waitFor(async () => /^\d{3}$/.test(await pT.locator('#cg-code').textContent())), 'CODEG — код из 3 цифр на экране');
const code1 = await pT.locator('#cg-code').textContent();
await pT.screenshot({ path: `${shots}/mech-16-code.png` });
ok(await waitFor(async () => !/\d/.test(await pT.locator('#cg-code').textContent()), 3500), 'через 2 с код скрыт');
const typeCode = async (c) => { for (const d of c) await pT.locator('#cg-pad .btn', { hasText: new RegExp('^' + d + '$') }).click(); await pT.locator('#cg-pad .btn', { hasText: '✓' }).click(); };
await typeCode(code1);
ok(await waitFor(async () => /ЭТАП 2 \/ 2/.test(await pT.locator('#mg-stage').textContent()) && /^\d{4}$/.test(await pT.locator('#cg-code').textContent())), 'верно — этап 2, код длиннее (4 цифры)');
const code2 = await pT.locator('#cg-code').textContent();
await typeCode('0000' === code2 ? '1111' : '0000');
ok(await waitFor(async () => /Ошибок: 1 из 2/.test(await pT.locator('#mg-err').textContent())), 'неверно — ошибка');
await typeCode(code2);
ok(await waitFor(async () => (await pT.locator('#mg-end-t').textContent()) === 'УСПЕХ'), 'код — «УСПЕХ»');
await closeDlg(pT); await pT.locator('#mg-ok').click();
// провода: схема — у Медика
await closeDlg(pB);
await enter(pT, 'WIRES2');
ok(await waitFor(async () => (await pT.locator('#mg .wr-w').count()) === 5), 'WIRES2 (уровень 2) — 5 проводов вместо 4');
ok(await waitFor(async () => await pB.locator('#mg-scheme.on').count() === 1), 'у напарника (Медик) — схема');
const order = (await pB.locator('#mgs-text').textContent()).split(': ').pop().split(' → ');
ok(order.length === 2, 'схема: перерезать по порядку ' + order.join(' → '));
await pB.screenshot({ path: `${shots}/mech-17-scheme.png` });
await pT.screenshot({ path: `${shots}/mech-18-wires.png` });
for (const c of order) await pT.locator('#mg .wr-w', { hasText: c }).click();
ok(await waitFor(async () => (await pT.locator('#mg-end-t').textContent()) === 'УСПЕХ'), 'перерезал по схеме — «УСПЕХ»');
ok(await waitFor(async () => !(await pB.locator('#mg-scheme.on').count())), 'у напарника схема закрылась');
await closeDlg(pT); await pT.locator('#mg-ok').click();
// провал проводов — авария (действие провала)
await enter(pT, 'WIRES');
await waitFor(async () => (await pB.locator('#mg-scheme.on').count()) === 1);
const ord2 = (await pB.locator('#mgs-text').textContent()).split(': ').pop().split(' → ');
const wrong = (await pT.locator('#mg .wr-w span').allTextContents()).find((c) => c !== ord2[0]);
await pT.locator('#mg .wr-w', { hasText: wrong }).click();
ok(await waitFor(async () => (await pT.locator('#mg-end-t').textContent()) === 'ПРОВАЛ'), 'не тот провод — провал (1 ошибка)');
await closeDlg(pT); await pT.locator('#mg-ok').click();
ok(await waitFor(async () => (await pT.locator('#alarm.on').count()) === 1 || await pT.evaluate(() => document.body.classList.contains('alarm-on'))), 'действие провала — авария');
await enter(pT, 'ALOFF');
await closeDlg(pT);
// ползунок во время шпионажа: вне коридора текст в помехах, до нуля — обрыв
await pT.evaluate(() => { const g = window.sgPlayer.game(); g.spy.slider = true; g.spy.mode = 'code'; });
await pT.locator('#tabs button[data-tab=spy]').click();
await enter(pT, '7101');
ok(await waitFor(async () => (await pT.locator('#spy-slider .sl-track').count()) === 1), 'шпионаж с ползунком');
await pT.evaluate(() => { const s = document.querySelector('#spy-slider').slider; s.set(s.band()); });
await pA.evaluate(() => window.sgPlayer.P.voiceHeard('чистый сигнал есть', true));
ok(await waitFor(async () => /чистый сигнал есть/.test(await pT.locator('#spy-log').textContent())), 'в коридоре — текст чистый');
await pT.evaluate(() => { const s = document.querySelector('#spy-slider').slider; s.set(s.band() > 50 ? 5 : 95); });
await pA.evaluate(() => window.sgPlayer.P.voiceHeard('секретные слова здесь сейчас', true));
ok(await waitFor(async () => /▒/.test(await pT.locator('#spy-log').textContent())), 'вне коридора — помехи');
await pT.screenshot({ path: `${shots}/mech-19-spy-slider.png` });
ok(await pT.evaluate(() => { const t = document.querySelector('#spy-slider .sl-track').getBoundingClientRect(), m = document.querySelector('.spy-main').getBoundingClientRect();
  return t.width <= 60 && t.height >= window.innerHeight * 0.45 && t.left >= m.right - 1 && m.width > 200; }), 'П27: ползунок — узкая полоса во всю высоту справа, рядом — пойманный текст');
await pT.evaluate(() => { const s = document.querySelector('#spy-slider').slider; s.set(0.1); });
ok(await waitFor(async () => /СОЕДИНЕНИЕ ПРЕРВАНО/.test(await pT.locator('#tab-spy').textContent()) && !(await st(pA, spyKey))), 'ползунок до нуля — обрыв');
await pT.evaluate(() => { const g = window.sgPlayer.game(); g.spy.slider = false; window.sgPlayer.P.mine().spyCool = 0; });

console.log('Сбои при долгом шпионаже (П27, 06: 150, 157)');
await closeDlg(pT); await closeDlg(pA);
ok(await pT.evaluate(() => { const x = { spy: {} }; window.SG.normSpy(x); return x.spy.fail === true && x.spy.failA === 10 && x.spy.failPA === 5 && x.spy.failB === 60 && x.spy.failPB === 40 && x.spy.failEvery === 5; }),
  'по умолчанию включено: дольше 10 с — 5 % каждые 5 с, дольше 60 с — 40 % (06, 150)');
await pT.evaluate(() => { const g = window.sgPlayer.game(); Object.assign(g.spy, { fail: true, failA: 1, failPA: 100, failEvery: 1, failB: 600, failPB: 100, failNoise: 2 }); });
await pT.locator('#tabs button[data-tab=data]').click(); await pT.locator('#tabs button[data-tab=spy]').click();
await enter(pT, '7101');
ok(await waitFor(async () => !!(await st(pA, spyKey))), 'сеанс начался');
ok(await waitFor(async () => (await pT.evaluate(() => (window.sgPlayer.P.spyFailStat() || {}).noise)) && /ПОМЕХИ/.test(await pT.locator('#tab-spy').textContent()), 5000), 'дольше 1 с (шанс 100 %) — сбой: «ПОМЕХИ»');
await pA.evaluate(() => window.sgPlayer.P.voiceHeard('слова в помехах сейчас', true));
ok(await waitFor(async () => /▒/.test(await pT.locator('#spy-log').textContent()), 2500), 'во время сбоя услышанное — в помехах');
await pT.screenshot({ path: `${shots}/mech-19b-spy-fail.png` });
ok(await waitFor(async () => /СИГНАЛ ПОТЕРЯН/.test(await pT.locator('#tab-spy').textContent()) && !(await st(pA, spyKey)), 5000), 'через 2 с помех — обрыв «СИГНАЛ ПОТЕРЯН», сеанс снят');
ok(await pT.locator('#spy-code').count() === 1, 'без блока — можно подключиться снова');
await pT.evaluate(() => { window.sgPlayer.game().spy.fail = false; });

console.log('Видео-шпионаж: до 24 кадров/с, камеру выбирает шпион, видео — у одного шпиона (П27, 06: 159)');
await closeDlg(pT); await closeDlg(pA);
await pT.locator('#tabs button[data-tab=data]').click(); await pT.locator('#tabs button[data-tab=spy]').click();
await enter(pT, '7101');
ok(await waitFor(async () => !!(await st(pA, spyKey))), 'сеанс с камерой');
ok(await waitFor(async () => ((await pT.evaluate(() => window.sgPlayer.P.spyCamStat())) || {}).fps >= 8, 10000), 'видео — до 24 кадров/с с подтверждением: у шпиона ' + ((await pT.evaluate(() => window.sgPlayer.P.spyCamStat())) || {}).fps + ' к/с');
ok(/● ВИДЕО · \d+ К\/С/.test(await pT.locator('#spy-cam-st').textContent()), 'строка «● ВИДЕО · N К/С»');
ok(await pT.evaluate(() => { const i = document.getElementById('spy-img'); return i.naturalWidth === 480 && i.naturalHeight === 360; }), 'кадр 480×360');
ok(await pA.evaluate(() => Object.values(window.sgPlayer.P.spyVidStat().out).every((q) => q.n - q.ack <= 2)), 'в пути не больше 2 кадров без подтверждения');
ok(/ОСНОВНАЯ/.test(await pT.locator('#spy-cam-sw').textContent()), 'у шпиона кнопка «⇄ ОСНОВНАЯ» (сейчас передняя)');
await pT.locator('#spy-cam-sw').click();
ok(await waitFor(async () => { const v = await pA.evaluate(() => window.sgPlayer.P.spyVidStat()); return v.on && v.side === 'back'; }, 8000) && (await st(pA, spyKey)).cam === 'back', 'шпион переключил — у жертвы основная (задняя) камера');
ok(/ФРОНТАЛЬНАЯ/.test(await pT.locator('#spy-cam-sw').textContent()) && await waitFor(async () => ((await pT.evaluate(() => window.sgPlayer.P.spyCamStat())) || {}).cam === 'video', 8000), 'видео идёт с основной; кнопка «⇄ ФРОНТАЛЬНАЯ»');
await pT.screenshot({ path: `${shots}/mech-19c-spy-video24.png` });
await pT.locator('#spy-cam-sw').click();
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.P.spyVidStat())).side === 'front', 8000), 'обратно — фронтальная');
await pT.locator('#spy-stop').click();
await pT.evaluate(() => { window.sgPlayer.game().spy.videoWho = 'aB'; window.sgPlayer.P.mine().spyCool = 0; });
await enter(pT, '7101');
ok(await waitFor(async () => !!(await st(pA, spyKey))) && !(await st(pA, spyKey)).vid && (await pT.locator('#spy-cam').count()) === 0, 'камера — только у шпиона из «Камера жертвы — у кого»: у другого — без камеры');
await pT.locator('#spy-stop').click();
await pT.evaluate(() => { window.sgPlayer.game().spy.videoWho = ''; window.sgPlayer.P.mine().spyCool = 0; });

console.log('Датчики: «держи ровно», «в руках» (П25, 06: 149)');
const motion = (p, x, y, z) => p.evaluate(([x, y, z]) => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x, y, z } })), [x, y, z]);
await closeDlg(pB);
const sh0 = await pB.evaluate(() => window.SGNet.state['var:shakes'] || 0);
await pB.locator('#tabs button[data-tab=apps]').click();
await pB.locator('#tab-apps .item', { hasText: 'Пульсоксиметр' }).click();
await pB.locator('#scanlay.on').waitFor();
await pB.evaluate(() => window.sgPlayer.P.appScanned('BADGE-A'));
ok(await waitFor(async () => /ИЗМЕРЕНИЕ/.test(await pB.locator('#scanlay-hint').textContent())), 'прибор: после QR — «ИЗМЕРЕНИЕ…», полоса');
await sleep(1200);
for (let i = 0; i < 4; i++) { await motion(pB, i % 2 ? 3 : -3, 0, 9.8); await sleep(40); }
ok(await waitFor(async () => /ДЕРЖИТЕ РОВНО/.test(await pB.locator('#scanlay-hint').textContent()), 1500), 'дрогнул — «ДЕРЖИТЕ РОВНО», полоса с начала');
await pB.screenshot({ path: `${shots}/mech-14-steady.png` });
ok(!(await pB.locator('#dlg.on').count()), 'результата ещё нет');
ok(await waitFor(async () => (await title(pB)) === 'ПУЛЬСОКСИМЕТР' && /SpO₂ 97/.test(await text(pB)), 6000), 'держал ровно 3 с — показание');
await closeDlg(pB);
if (await pB.locator('#scanlay.on').count()) await pB.locator('#scanlay-back').click();
// в руках: неподвижно → не в руках; дрогнул — в руках (правило «взяли в руки» у Медика)
for (let i = 0; i < 5; i++) { await motion(pB, 0, 0, 9.8); await sleep(30); }
await pB.evaluate(() => { window.__t = Date.now; const d = Date.now() + 11000; Date.now = () => d; });
ok(!(await pB.evaluate(() => window.sgPlayer.P.inHands())), 'неподвижно 10 с — не в руках');
await pB.evaluate(() => { Date.now = window.__t; });
await motion(pB, 0, 0, 9.8);
await pB.evaluate(() => { window.__t = Date.now; const d = Date.now() + 11000; Date.now = () => d; });
await motion(pB, 0.3, 0.1, 9.8);
await pB.evaluate(() => { Date.now = window.__t; });
ok(await pB.evaluate(() => window.sgPlayer.P.inHands()), 'дрогнул — в руках');
ok(await waitFor(async () => (await pB.evaluate(() => window.SGNet.state['var:shakes'] || 0)) > sh0), 'правило «взяли в руки» сработало (Медик; не чаще раза в минуту)');
// уведомление «тем, у кого в руках»: у Медика — да, у Инженера (SG_HANDS = false) — нет
await pA.evaluate(() => { window.SG_HANDS = false; });
await pB.evaluate(() => { window.SG_HANDS = true; });
await closeDlg(pA); await closeDlg(pB); await closeDlg(pT);
await enter(pT, 'HANDS');
ok(await waitFor(async () => (await title(pB)) === 'В РУКАХ'), 'HANDS: у Медика (в руках) — уведомление');
await sleep(800);
ok((await title(pA)) !== 'В РУКАХ', 'у Инженера (не в руках) — нет');
await closeDlg(pB); await closeDlg(pT);

console.log('Свои звуки и видео в событии (П25, 06: 152)');
await closeDlg(pT);
await enter(pT, 'VIDEO');
ok(await waitFor(async () => (await title(pT)) === 'ВИДЕОСООБЩЕНИЕ' && (await pT.locator('#dlg.on video.media-video').count()) === 1), 'VIDEO — окно события с видео');
ok(/^blob:/.test(await pT.locator('#dlg.on video.media-video').getAttribute('src')) && (await pT.locator('#dlg.on .btn', { hasText: 'НА ВЕСЬ ЭКРАН' }).count()) === 1, 'видео из пакета и кнопка «на весь экран»');
await pT.screenshot({ path: `${shots}/mech-20-video.png` });
await closeDlg(pT);
ok(await pT.evaluate(() => (window.sgPlayer.P.mine().events || []).some((e) => e.video === 'ev.mp4' && e.folder === 'Видео')), 'событие с видео — в архиве («Данные» → «Видео»)');
// свои звуки: сообщение в чате — у Медика свой (ev.mp3), у Инженера встроенный; успех мини-игры — свой у всех
await closeDlg(pA); await closeDlg(pB);
await pT.evaluate(() => window.sgPlayer.P.sendChat('acc:aB', 'звук проверка'));
ok(await waitFor(async () => (await pB.evaluate(() => window.sgPlayer.P.lastSound)) === 'ev.mp3'), 'Медику пришло сообщение — свой звук «сообщение» (ev.mp3)');
await pT.evaluate(() => window.sgPlayer.P.sendChat('acc:aA', 'звук проверка'));
ok(await waitFor(async () => (await pA.evaluate(() => window.sgPlayer.P.lastSound)) === 'msg'), 'Инженеру — встроенный (своего нет)');
await enter(pT, 'CODEG');
await waitFor(async () => /^\d+$/.test(await pT.locator('#cg-code').textContent()));
const cz = await pT.locator('#cg-code').textContent();
await pT.evaluate(() => { const g = window.sgPlayer.game().games.find((x) => x.id === 'mg4'); g.stages = 1; });
for (const d of cz) await pT.locator('#cg-pad .btn', { hasText: new RegExp('^' + d + '$') }).click();
await pT.locator('#cg-pad .btn', { hasText: '✓' }).click();
ok(await waitFor(async () => (await pT.evaluate(() => window.sgPlayer.P.lastSound)) === 'win.mp3'), 'успех мини-игры — свой звук (win.mp3)');
await closeDlg(pT); if (await pT.locator('#mg.on').count()) await pT.locator('#mg-ok').click();

web.kill();
center.kill();
await browser.close();
ok(errors.length === 0, 'ошибок на страницах нет' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
console.log(failed ? `${passed}/${passed + failed} проверок механик пройдено` : `МЕХАНИКИ: ВСЁ ХОРОШО (${passed})`);
process.exit(failed ? 1 : 0);
