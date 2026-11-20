// СИГНАЛЫ — проверка связи терминала с центром (сессия П7): страница пробы в Chromium ↔ центр (Java) ↔ «телефоны».
// node tests/terminal-test.mjs [playwright] [путь к Chrome]   (нужны javac, java и dist/terminal-probe.html — node tools/build-term.mjs)
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildJava, startCenter } from './net-test.mjs';
import { rmSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
let passed = 0, failed = 0;
function ok(c, what) { if (c) { passed++; console.log('  ✓', what); } else { failed++; console.log('  ✗', what); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(url, hello) {
  const c = { got: [], ws: new WebSocket(url) };
  c.ws.onmessage = (e) => c.got.push(JSON.parse(e.data));
  c.ready = new Promise((r) => { c.ws.onopen = () => { c.ws.send(JSON.stringify(Object.assign({ t: 'hello' }, hello))); r(); }; });
  c.wait = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const x = c.got.find(fn); if (x) return x; await sleep(50); } return null; };
  return c;
}

const port = 18900 + Math.floor(Math.random() * 400);
buildJava();
const center = await startCenter(port, '');
const url = `ws://127.0.0.1:${port}`;
const browser = await chromium.launch(process.argv[3] ? { executablePath: process.argv[3] } : {});
try {
  const phone = client(url, { role: 'phone', dev: 'ph1', acc: 'eng', name: 'Инженер', epoch: null, since: 0 });
  const master = client(url, { role: 'master', dev: 'm1', acc: null, name: 'Мастер', epoch: null, since: 0 });
  await phone.ready; await master.ready;

  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(root, 'dist/terminal-probe.html')).href + '?center=' + encodeURIComponent(`127.0.0.1:${port}`));
  await page.waitForFunction(() => window.SgTermNet && window.SgTermNet.on, null, { timeout: 5000 });
  ok(await page.evaluate(() => SgTermNet.url) === url, 'адрес без ws:// и порта дополняется: ' + url);
  ok(!!(await master.wait((o) => o.t === 'peers' && o.peers.some((p) => p.role === 'terminal' && p.online))), 'мастер видит терминал в сети');

  await page.click('#plus'); await page.click('#plus');
  const n2 = await phone.wait((o) => o.t === 'msg' && o.kind === 'notify' && o.body.text === 'Значение переменной: 2');
  ok(!!n2, 'телефон получил уведомление «Значение переменной: 2»');
  ok(n2 && n2.from.role === 'terminal' && n2.body.title === 'ТЕРМИНАЛ', 'уведомление от терминала, заголовок ТЕРМИНАЛ');
  ok(phone.got.filter((o) => o.kind === 'notify').length === 2, 'два нажатия — два уведомления');

  master.ws.send(JSON.stringify({ t: 'msg', id: 'm-term-1', to: ['role:terminal'], kind: 'term', body: { set: { sgProbe: 10 } } }));
  await page.waitForFunction(() => document.getElementById('v').textContent === '10', null, { timeout: 4000 }).then(() => ok(true, 'мастер записал переменную терминала: 10'), () => ok(false, 'мастер записал переменную терминала: 10'));

  const found = await page.evaluate((p) => new Promise((r) => SgTermNet.find(r, ['127.0.0.1:1', '127.0.0.1:' + p])), port);
  ok(found === '127.0.0.1:' + port, 'поиск центра по списку адресов: ' + found);

  await page.evaluate(() => SgTermNet.event('probe'));
  ok(!!(await master.wait((o) => o.t === 'msg' && o.kind === 'event' && o.body.name === 'probe')), 'событие терминала дошло мастеру');

  // П9: адрес num:<номер сотрудника>, команды телефонам, очередь и место в журнале переживают перезагрузку
  const ph3 = client(url, { role: 'phone', dev: 'ph3', acc: 'cap', num: '3', name: 'Капитан', epoch: null, since: 0 });
  await ph3.ready; await sleep(200);
  await page.evaluate(() => SgTermNet.notify('ЛИЧНО', 'только третьему', ['3']));
  ok(!!(await ph3.wait((o) => o.t === 'msg' && o.body && o.body.text === 'только третьему')), 'num:3 — уведомление дошло сотруднику №3');
  await sleep(300);
  ok(!phone.got.some((o) => o.body && o.body.text === 'только третьему'), 'другой телефон личное уведомление не получил');
  await page.evaluate(() => { SgTermNet.open('Дневник, b2', 'НОВОЕ', ['3']); SgTermNet.alarm(true, 'ТРЕВОГА', 'утечка'); SgTermNet.chapter(2); SgTermNet.countdown(30, 'ДО ВЗРЫВА'); });
  ok(!!(await ph3.wait((o) => o.t === 'msg' && o.kind === 'open' && o.body.blocks.join() === 'Дневник,b2')), 'открыть блоки: список через запятую');
  ok(!!(await ph3.wait((o) => o.t === 'state' && o.key === 'alarm' && o.value.on && o.value.title === 'ТРЕВОГА')), 'авария на телефонах');
  ok(!!(await ph3.wait((o) => o.t === 'state' && o.key === 'chapter' && o.value.n === 2)), 'глава 2 для всех');
  ok(!!(await ph3.wait((o) => o.t === 'state' && o.key === 'countdown' && o.value.on && o.value.until > Date.now())), 'обратный отсчёт');
  ph3.ws.send(JSON.stringify({ t: 'msg', id: 'c-1', to: ['role:terminal'], kind: 'code', body: { code: '4242', acc: 'cap', num: '3' } }));
  await page.waitForFunction(() => SgTermNet.last.some((m) => m.kind === 'code' && m.body.code === '4242'), null, { timeout: 4000 }).then(() => ok(true, 'терминал получил «код введён на телефоне»'), () => ok(false, 'терминал получил «код введён на телефоне»'));
  const seq1 = await page.evaluate(() => SgTermNet.seq);
  await page.reload();
  await page.waitForFunction(() => window.SgTermNet && window.SgTermNet.on, null, { timeout: 5000 });
  ok(await page.evaluate(() => SgTermNet.seq) >= seq1 && await page.evaluate(() => SgTermNet.last.length) === 0, 'после перезагрузки страницы старые сообщения не повторяются');

  // разрыв: центр перезапущен — терминал переподключается сам, очередь уходит после welcome
  center.kill(); await sleep(500);
  await page.evaluate(() => SgTermNet.notify('ТЕРМИНАЛ', 'после разрыва'));
  ok(await page.evaluate(() => SgTermNet.queued()) === 1 && (await page.evaluate(() => localStorage.getItem('sg-term-net-queue'))).includes('после разрыва'), 'без связи сообщение ждёт в очереди (и в памяти браузера)');
  await page.reload(); await sleep(300);
  ok(await page.evaluate(() => SgTermNet.queued()) === 1, 'очередь пережила перезагрузку терминала');
  const fileA = '/tmp/sg-term-a-' + port + '.json', fileB = '/tmp/sg-term-b-' + port + '.json';
  for (const f of [fileA, fileB]) { try { rmSync(f); } catch (e) {} }
  const center2 = await startCenter(port, fileA);
  const phone2 = client(url, { role: 'phone', dev: 'ph2', acc: 'med', name: 'Медик', epoch: null, since: 0 });
  await phone2.ready;
  ok(!!(await phone2.wait((o) => o.t === 'msg' && o.body && o.body.text === 'после разрыва', 9000)), 'после перезапуска центра терминал переподключился и отправил отложенное');
  // П17: запасной центр — терминал сам находит центр, поднятый из копии на другом телефоне; старый центр уступает
  const port2 = port + 1, url2 = `ws://127.0.0.1:${port2}`;
  await page.evaluate((l) => { window.SG_TERM_FIND = l; SgTermNet.findAfter = 2; }, ['127.0.0.1:' + port, '127.0.0.1:' + port2]);
  await sleep(2500);   // центр записал файл
  center2.kill();
  const centerB = await startCenter(port2, fileB, ['takeover', fileA]);
  await page.waitForFunction((u) => SgTermNet.on && SgTermNet.url === u, url2, { timeout: 30000 }).then(() => ok(true, 'терминал сам нашёл центр, поднятый из копии'), () => ok(false, 'терминал сам нашёл центр, поднятый из копии'));
  ok(await page.evaluate(() => SgTermNet.gen) === 1 && JSON.parse(await page.evaluate(() => localStorage.getItem('sg-term-net-pos'))).gen === 1 && await page.evaluate(() => localStorage.getItem('sg-term-net-url')) === url2,
    'терминал запомнил новый адрес и поколение центра (1)');
  const phB = client(url2, { role: 'phone', dev: 'ph4', acc: 'pil', name: 'Пилот', epoch: null, since: 0 });
  await phB.ready;
  await page.evaluate(() => SgTermNet.notify('ТЕРМИНАЛ', 'через новый центр'));
  ok(!!(await phB.wait((o) => o.t === 'msg' && o.body && o.body.text === 'через новый центр')), 'уведомление терминала идёт через новый центр');
  const centerA = await startCenter(port, fileA);
  await page.evaluate((p) => SgTermNet.connect('127.0.0.1:' + p), port);
  await page.waitForFunction((u) => SgTermNet.on && SgTermNet.url === u, url2, { timeout: 30000 }).then(() => ok(true, 'старый центр уступил (stale), терминал вернулся на новый'), () => ok(false, 'старый центр уступил (stale), терминал вернулся на новый'));
  ok(/STALE 1/.test(centerA.out), 'старый центр знает, что уступил');
  centerA.kill(); centerB.kill();

  ok(await page.evaluate(() => { SgTermNet.panel(); return !!document.querySelector('input'); }), 'окно «Сеть» открывается');
} finally {
  await browser.close();
  try { center.kill(); } catch (e) {}
}
console.log(`\nСвязь терминала: ${passed} ✓, ${failed} ✗`);
process.exit(failed ? 1 : 0);
