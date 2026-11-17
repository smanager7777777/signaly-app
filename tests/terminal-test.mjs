// СИГНАЛЫ — проверка связи терминала с центром (сессия П7): страница пробы в Chromium ↔ центр (Java) ↔ «телефоны».
// node tests/terminal-test.mjs [playwright] [путь к Chrome]   (нужны javac, java и dist/terminal-probe.html — node tools/build-term.mjs)
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildJava, startCenter } from './net-test.mjs';

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

const port = 18790 + Math.floor(Math.random() * 500);
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

  // разрыв: центр перезапущен — терминал переподключается сам, очередь уходит после welcome
  center.kill(); await sleep(500);
  await page.evaluate(() => SgTermNet.notify('ТЕРМИНАЛ', 'после разрыва'));
  const center2 = await startCenter(port, '');
  const phone2 = client(url, { role: 'phone', dev: 'ph2', acc: 'med', name: 'Медик', epoch: null, since: 0 });
  await phone2.ready;
  ok(!!(await phone2.wait((o) => o.t === 'msg' && o.body && o.body.text === 'после разрыва', 9000)), 'после перезапуска центра терминал переподключился и отправил отложенное');
  center2.kill();

  ok(await page.evaluate(() => { SgTermNet.panel(); return !!document.querySelector('input'); }), 'окно «Сеть» открывается');
} finally {
  await browser.close();
  try { center.kill(); } catch (e) {}
}
console.log(`\nСвязь терминала: ${passed} ✓, ${failed} ✗`);
process.exit(failed ? 1 : 0);
