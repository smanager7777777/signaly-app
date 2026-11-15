// СИГНАЛЫ — проверка центра сети (Java, тот же код, что в APK): маршруты, повтор пропущенного,
// общее состояние, «сколько раз взяли» (гонка), две подписи, правила, таймеры, сброс, сохранение.
// node tests/net-test.mjs   (нужны javac и java)
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cls = '/tmp/sg-java';
let passed = 0, failed = 0;
function ok(c, what) { if (c) { passed++; console.log('  ✓', what); } else { failed++; console.log('  ✗', what); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function buildJava() {
  rmSync(cls, { recursive: true, force: true });
  mkdirSync(cls, { recursive: true });
  const src = resolve(root, 'android/app/src/main/java/ru/signaly/net');
  execFileSync('javac', ['-encoding', 'UTF-8', '-Xlint:none', '-d', cls, ...['SgJson', 'SgWs', 'SgCenter', 'SgLink'].map((n) => `${src}/${n}.java`),
    resolve(root, 'tests/java/LinkCheck.java')], { stdio: ['ignore', 'ignore', 'inherit'] });
}

export async function startCenter(port, file) {
  const p = spawn('java', ['-Dstdout.encoding=UTF-8', '-cp', cls, 'ru.signaly.net.SgCenter', String(port), file || ''], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => {
    p.stdout.on('data', (d) => { if (String(d).includes('SIGNALY CENTER')) ok(); });
    p.on('exit', (c) => fail(new Error('центр не запустился: ' + c)));
  });
  return p;
}

class Client {
  constructor(url, hello) {
    this.got = [];
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => this.got.push(JSON.parse(e.data));
    this.ready = new Promise((r) => { this.ws.onopen = () => { this.send(Object.assign({ t: 'hello' }, hello)); r(); }; });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  async wait(fn, ms = 3000) {
    const t = Date.now() + ms;
    while (Date.now() < t) { const x = this.got.find(fn); if (x) return x; await sleep(20); }
    return null;
  }
  all(fn) { return this.got.filter(fn); }
  close() { this.ws.close(); }
}

if (process.argv[1] && process.argv[1].endsWith('net-test.mjs')) {
  console.log('Центр сети (Java)');
  buildJava();
  const link = spawn('java', ['-Dstdout.encoding=UTF-8', '-cp', cls, 'LinkCheck'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let linkOut = '';
  link.stdout.on('data', (d) => { linkOut += d; });
  const linkDone = new Promise((r) => link.on('exit', r));

  const file = '/tmp/sg-center-test.json';
  if (existsSync(file)) rmSync(file);
  const port = 18790;
  let center = await startCenter(port, file);
  const url = 'ws://127.0.0.1:' + port;

  const A = new Client(url, { role: 'phone', dev: 'dA', acc: 'aA', name: 'Инженер' });
  const B = new Client(url, { role: 'phone', dev: 'dB', acc: 'aB', name: 'Медик' });
  const M = new Client(url, { role: 'master', dev: 'dM', name: 'Мастер' });
  const T = new Client(url, { role: 'terminal', dev: 'dT', name: 'Терминал' });
  await Promise.all([A.ready, B.ready, M.ready, T.ready]);
  const wA = await A.wait((m) => m.t === 'welcome');
  ok(wA && wA.epoch && typeof wA.now === 'number', 'welcome: эпоха и время центра');
  const peers = await M.wait((m) => m.t === 'peers' && m.peers.length === 4);
  ok(!!peers, 'мастер видит список телефонов (4)');

  // личное сообщение
  A.send({ t: 'msg', id: 'm1', to: ['acc:aB'], kind: 'chat', body: { text: 'привет' } });
  ok(!!(await B.wait((m) => m.t === 'msg' && m.body.text === 'привет')), 'личное сообщение дошло адресату');
  ok(!!(await M.wait((m) => m.t === 'msg' && m.id === 'm1')), 'мастер видит личную переписку (В2)');
  ok(!!(await A.wait((m) => m.t === 'ack' && m.id === 'm1' && m.seq === 1)), 'отправитель получил подтверждение с номером');
  await sleep(200);
  ok(!T.all((m) => m.id === 'm1').length, 'терминал личное не получает');
  A.send({ t: 'msg', id: 'm1', to: ['acc:aB'], kind: 'chat', body: { text: 'привет' } });
  ok(!!(await A.wait((m) => m.t === 'ack' && m.dup)), 'повтор того же сообщения не дублируется');
  ok(B.all((m) => m.id === 'm1').length === 1, 'адресат получил его один раз');

  // общий канал
  B.send({ t: 'msg', id: 'm2', to: ['all'], kind: 'chat', body: { text: 'всем' } });
  ok(!!(await A.wait((m) => m.id === 'm2')) && !!(await T.wait((m) => m.id === 'm2')), 'общий канал: всем и терминалу');

  // общее состояние
  M.send({ t: 'set', key: 'alarm', value: { on: true, id: 'al1' } });
  ok(!!(await B.wait((m) => m.t === 'state' && m.key === 'alarm' && m.value.on)), 'аварийный режим включён у всех (состояние)');

  // повтор пропущенного после разрыва
  B.close();
  await sleep(200);
  A.send({ t: 'msg', id: 'm3', to: ['acc:aB'], kind: 'chat', body: { text: 'пока тебя не было' } });
  await A.wait((m) => m.t === 'ack' && m.id === 'm3');
  const B2 = new Client(url, { role: 'phone', dev: 'dB', acc: 'aB', epoch: wA.epoch, since: 2 });
  await B2.ready;
  ok(!!(await B2.wait((m) => m.id === 'm3')), 'после переподключения пришло пропущенное');
  ok(!B2.all((m) => m.id === 'm1' || m.id === 'm2').length, 'уже полученное не повторяется');
  const w2 = await B2.wait((m) => m.t === 'welcome');
  ok(w2 && w2.state.alarm && w2.state.alarm.on, 'после переподключения состояние приходит в welcome');

  // ограниченный код: 8 доз, одна в руки, 12 одновременных запросов от 10 персонажей
  const many = [];
  for (let i = 0; i < 10; i++) {
    const c = new Client(url, { role: 'phone', dev: 'r' + i, acc: 'p' + i });
    many.push(c);
  }
  await Promise.all(many.map((c) => c.ready));
  many.forEach((c, i) => c.send({ t: 'claim', id: 'c' + i, key: 'box', limit: 8, per: true }));
  many[0].send({ t: 'claim', id: 'c0b', key: 'box', limit: 8, per: true });
  many[1].send({ t: 'claim', id: 'c1b', key: 'box', limit: 8, per: true });
  const res = [];
  for (const c of many) for (const m of await Promise.all([c.wait((m) => m.t === 'claimed' && !m.id.endsWith('b')), c.wait((m) => m.t === 'claimed' && m.id.endsWith('b'), 500)])) if (m) res.push(m);
  const okN = res.filter((r) => r.ok).length;
  ok(okN === 8, 'ящик на 8 доз: выдано ровно 8 из 12 запросов (' + okN + ')');
  // порядок в гонке любой: повторный запрос получает «уже получили», если первый успел взять дозу, иначе «пусто»
  const okIds = new Set(res.filter((r) => r.ok).map((r) => r.id));
  ok(res.length === 12 && res.filter((r) => !r.ok).every((r) => r.reason === 'empty' || r.reason === 'mine'), 'отказы — только «пусто» или «уже получили»');
  ok(['c0', 'c1'].every((id) => !okIds.has(id) || res.find((r) => r.id === id + 'b').reason === 'mine'), 'второй раз тому же персонажу — «уже получили»');
  ok(new Set(res.filter((r) => r.ok).map((r) => r.n)).size === 8, 'у каждой выдачи свой номер (1…8)');
  ok(!!(await T.wait((m) => m.t === 'state' && m.key === 'claim:box' && m.value.n === 8)), 'терминал видит, сколько взяли');

  // одноразовая ампула: два почти одновременных скана
  A.send({ t: 'claim', id: 'amp-A', key: 'amp', limit: 1 });
  B2.send({ t: 'claim', id: 'amp-B', key: 'amp', limit: 1 });
  const ra = await A.wait((m) => m.id === 'amp-A'), rb = await B2.wait((m) => m.id === 'amp-B');
  ok(ra && rb && ra.ok !== rb.ok && [ra, rb].find((r) => !r.ok).reason === 'empty', 'ампула: первому — доза, второму — «пусто»');

  // две подписи
  A.send({ t: 'claim', id: 's1', key: 'sign:door', sign: 2, window: 30 });
  const s1 = await A.wait((m) => m.id === 's1');
  ok(s1 && !s1.ok && s1.reason === 'wait' && s1.have === 1, 'первая подпись: ждём вторую');
  B2.send({ t: 'claim', id: 's2', key: 'sign:door', sign: 2, window: 30 });
  const s2 = await B2.wait((m) => m.id === 's2');
  ok(s2 && s2.ok && s2.signers.length === 2, 'вторая подпись: код сработал');
  ok(!!(await A.wait((m) => m.t === 'msg' && m.kind === 'signed' && m.body.key === 'sign:door')), 'первый подписавший получил подтверждение');

  // правила: событие терминала → уведомление; глава → уведомление через 1 с; повтор каждые 5 с
  M.send({ t: 'rules', ver: 3, list: [
    { id: 'r1', on: 'event', event: 'breach', emit: [{ t: 'msg', to: ['acc:aA'], kind: 'notify', body: { title: 'ПРОБОЙ' } }, { t: 'set', key: 'alarm', value: { on: true, id: 'breach', at: '{{now}}' } }] },
    { id: 'r2', on: 'state', key: 'chapter', n: 2, emit: [{ t: 'msg', to: ['all'], kind: 'notify', body: { title: 'ЧЕРЕЗ СЕКУНДУ' }, delay: 1000 }] },
    { id: 'r3', on: 'every', every: 5000, chapters: [2], emit: [{ t: 'msg', to: ['all'], kind: 'vote', body: { id: 'v{{now}}' } }] }
  ] });
  await sleep(100);
  T.send({ t: 'msg', id: 'e1', to: ['role:master'], kind: 'event', body: { name: 'breach' } });
  ok(!!(await A.wait((m) => m.kind === 'notify' && m.body.title === 'ПРОБОЙ')), 'событие терминала → уведомление инженеру (правило)');
  const al = await B2.wait((m) => m.t === 'state' && m.key === 'alarm' && m.value.id === 'breach');
  ok(al && typeof al.value.at === 'number', 'событие терминала → авария у всех, {{now}} подставлен числом');
  const t0 = Date.now();
  M.send({ t: 'set', key: 'chapter', value: { n: 2, at: t0 } });
  const late = await A.wait((m) => m.kind === 'notify' && m.body.title === 'ЧЕРЕЗ СЕКУНДУ', 4000);
  ok(late && late.at - t0 >= 900, 'глава 2 → уведомление по таймеру через ' + (late ? late.at - t0 : '?') + ' мс');
  const v = await A.wait((m) => m.kind === 'vote', 7000);
  ok(v && /^v\d+$/.test(v.body.id), 'повторяющееся правило (каждые 5 с) запустило голосование ' + (v && v.body.id));
  M.send({ t: 'set', key: 'auto', value: false });
  const before = A.all((m) => m.kind === 'vote').length;
  await sleep(5600);
  ok(A.all((m) => m.kind === 'vote').length === before, 'автоматика выключена мастером — правила молчат');

  // таймер от телефона
  M.send({ t: 'timer', id: 'cd', delay: 600, emit: [{ t: 'set', key: 'countdown', value: { on: false } }] });
  ok(!!(await A.wait((m) => m.key === 'countdown', 3000)), 'таймер: состояние сменилось в срок');

  // сохранение: центр перезапускается
  await sleep(2600);
  center.kill();
  await sleep(300);
  center = await startCenter(port, file);
  const C = new Client(url, { role: 'phone', dev: 'dC', acc: 'aB', epoch: wA.epoch, since: 0 });
  await C.ready;
  const wc = await C.wait((m) => m.t === 'welcome');
  ok(wc && wc.epoch === wA.epoch && wc.state.alarm && wc.state.chapter.n === 2, 'после перезапуска центр помнит состояние');
  ok(!!(await C.wait((m) => m.id === 'm3')), 'после перезапуска центр помнит переписку');
  C.send({ t: 'claim', id: 'again', key: 'box', limit: 8, per: true });
  const again = await C.wait((m) => m.id === 'again');
  ok(again && !again.ok, 'после перезапуска счёт выдач сохранён');

  // сброс мастером
  const M2 = new Client(url, { role: 'master', dev: 'dM' });
  await M2.ready;
  M2.send({ t: 'admin', op: 'reset' });
  const rs = await C.wait((m) => m.t === 'reset');
  ok(rs && rs.epoch !== wA.epoch, 'сброс центра: новая эпоха у всех');

  // обычный браузер по адресу центра видит «центр работает»
  const page = await fetch('http://127.0.0.1:' + port + '/').then((r) => r.text()).catch(() => '');
  ok(page.includes('SIGNALY CENTER OK'), 'страница центра в браузере');

  for (const c of [A, M, T, B2, C, M2, ...many]) c.close();
  center.kill();
  await linkDone;
  for (const l of linkOut.trim().split('\n')) console.log(l);
  ok(linkOut.includes('LINK OK'), 'клиент Android (SgLink): очередь и переподключение');
  console.log(failed ? `${passed}/${passed + failed} проверок пройдено` : `ВСЁ ХОРОШО (${passed})`);
  process.exit(failed ? 1 : 0);
}
