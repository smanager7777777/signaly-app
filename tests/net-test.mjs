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
  execFileSync('javac', ['-encoding', 'UTF-8', '-Xlint:none', '-d', cls, ...['SgJson', 'SgWs', 'SgCenter', 'SgLink', 'SgSeen', 'SgVad', 'SgVoiceCore'].map((n) => `${src}/${n}.java`),
    resolve(root, 'tests/java/LinkCheck.java'), resolve(root, 'tests/java/VoiceCheck.java')], { stdio: ['ignore', 'ignore', 'inherit'] });
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
  const voice = spawn('java', ['-Dstdout.encoding=UTF-8', '-cp', cls, 'VoiceCheck'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let voiceOut = '';
  voice.stdout.on('data', (d) => { voiceOut += d; });
  const voiceDone = new Promise((r) => voice.on('exit', r));

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

  // П-39: один персонаж — один телефон
  const X = new Client(url, { role: 'phone', dev: 'dX', acc: 'aA', name: 'Инженер' });
  await X.ready;
  const busy = await X.wait((m) => m.t === 'busy');
  ok(busy && busy.acc === 'aA', 'второй телефон с тем же персонажем: центр ответил «уже в сети»');
  A.send({ t: 'msg', id: 'mx', to: ['acc:aA'], kind: 'chat', body: { text: 'только первому' } });
  await A.wait((m) => m.t === 'ack' && m.id === 'mx');
  await sleep(200);
  ok(!X.all((m) => m.id === 'mx').length, 'непущенный телефон чужие сообщения не получает');
  const pX = await M.wait((m) => m.t === 'peers' && m.peers.some((p) => p.dev === 'dX'));
  ok(pX && pX.peers.find((p) => p.dev === 'dX').acc == null, 'у мастера он в списке без персонажа');
  X.close();

  // П-40: «от имени» — только мастер; П-42: анонимно
  A.send({ t: 'msg', id: 'as1', to: ['all'], kind: 'chat', body: { text: 'подделка', as: { acc: 'aB', name: 'Медик' } } });
  const as1 = await B2.wait((m) => m.id === 'as1');
  ok(as1 && !as1.body.as, 'игрок не может писать от чужого имени (поле убрано центром)');
  M.send({ t: 'msg', id: 'as2', to: ['all'], kind: 'chat', body: { text: 'от руководителя', as: { acc: '@boss', name: 'Руководитель' } } });
  const as2 = await B2.wait((m) => m.id === 'as2');
  ok(as2 && as2.body.as && as2.body.as.name === 'Руководитель', 'мастер пишет от имени (Руководитель)');
  A.send({ t: 'msg', id: 'an1', to: ['acc:aB'], kind: 'chat', body: { text: 'тайна', anon: true } });
  const an1 = await B2.wait((m) => m.id === 'an1');
  ok(an1 && an1.from.anon && !an1.from.acc && !an1.from.dev, 'анонимное: получатель не знает отправителя');
  const an1m = await M.wait((m) => m.id === 'an1');
  ok(an1m && an1m.from.acc === 'aA', 'анонимное: мастер видит, кто писал');

  // П-43: отложенная отправка
  A.send({ t: 'msg', id: 'L1', to: ['acc:aB'], kind: 'chat', body: { text: 'через полторы секунды' }, at: Date.now() + 1500 });
  const l1 = await A.wait((m) => m.t === 'ack' && m.id === 'L1');
  ok(l1 && l1.later && l1.at > Date.now(), 'отложенное: центр принял и держит');
  const lm = await M.wait((m) => m.t === 'later' && m.list.some((x) => x.id === 'L1'));
  ok(!!lm, 'мастер видит отложенное в списке');
  await sleep(300);
  ok(!B2.all((m) => m.id === 'L1').length, 'адресат пока его не получил');
  const l1got = await B2.wait((m) => m.id === 'L1', 4000);
  ok(l1got && l1got.from.acc === 'aA' && l1got.at - l1.at >= -50, 'отложенное доставлено в срок от имени отправителя');
  ok(!!(await A.wait((m) => m.t === 'ack' && m.id === 'L1' && m.seq > 0)), 'отправитель узнал, что доставлено');
  A.send({ t: 'msg', id: 'L2', to: ['acc:aB'], kind: 'chat', body: { text: 'не дойдёт' }, at: Date.now() + 2000 });
  await M.wait((m) => m.t === 'later' && m.list.some((x) => x.id === 'L2'));
  M.send({ t: 'admin', op: 'drop', id: 'L2' });
  ok(!!(await A.wait((m) => m.t === 'dropped' && m.id === 'L2')), 'мастер удалил отложенное — отправитель узнал');
  ok(!!(await M.wait((m) => m.t === 'later' && !m.list.length)), 'список отложенных пуст');
  await sleep(2400);
  ok(!B2.all((m) => m.id === 'L2').length, 'удалённое не доставлено');

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

  // П13 (Т4-3): общие переменные — «прибавить» и правила «когда условие станет верным»
  M.send({ t: 'set', key: 'auto', value: true });
  M.send({ t: 'rules', ver: 4, list: [
    { id: 'r4', on: 'state', key: 'var:power', test: { op: '>=', value: 8 }, init: 5, emit: [{ t: 'msg', to: ['acc:aA'], kind: 'notify', body: { title: 'ЭНЕРГИЯ {{now}}', text: 'Теперь {{power}} · {{nobody}}' } }] },
    { id: 'r5', on: 'state', key: 'var:door', test: { op: '=', value: 'open' }, init: 'closed', chapters: [2], emit: [{ t: 'set', key: 'var:power', add: -3, base: 5 }] }
  ] });
  await sleep(100);
  const nPow = () => A.all((m) => m.kind === 'notify' && /^ЭНЕРГИЯ/.test(m.body.title)).length;
  A.send({ t: 'set', key: 'var:power', add: 1, base: 5 });
  const p6 = await B2.wait((m) => m.t === 'state' && m.key === 'var:power');
  ok(p6 && p6.value === 6, 'общая переменная: «+1» без значения — от начального 5 → ' + (p6 && p6.value));
  B.send({ t: 'set', key: 'var:power', add: 1, base: 5 });
  await B2.wait((m) => m.t === 'state' && m.key === 'var:power' && m.value === 7);
  await sleep(150);
  ok(nPow() === 0, 'правило «энергия ≥ 8» молчит при 7');
  T.send({ t: 'set', key: 'var:power', value: 8 });
  ok(!!(await A.wait((m) => m.kind === 'notify' && /^ЭНЕРГИЯ \d+$/.test(m.body.title))), 'терминал записал 8 → правило сработало (уведомление)');
  const nTxt = A.all((m) => m.kind === 'notify' && /^ЭНЕРГИЯ/.test(m.body.title))[0];
  ok(nTxt && nTxt.body.text === 'Теперь 8 · {{nobody}}', 'П16: «{{power}}» в уведомлении подставил центр (неизвестное имя осталось) → ' + (nTxt && nTxt.body.text));
  B2.send({ t: 'msg', id: 'n-var', to: ['acc:aA'], kind: 'notify', body: { title: 'ЗАРЯД {{power}}', text: 'ok' } });
  const nB = await A.wait((m) => m.id === 'n-var');
  ok(nB && nB.body.title === 'ЗАРЯД 8', 'П16: уведомление с телефона — тоже со значением центра');
  T.send({ t: 'set', key: 'var:power', value: 9 });
  await sleep(300);
  ok(nPow() === 1, 'условие уже верное (9) — второй раз не срабатывает');
  T.send({ t: 'set', key: 'var:power', value: 2 });
  T.send({ t: 'set', key: 'var:power', value: 12 });
  await sleep(300);
  ok(nPow() === 2, 'стало ложным и снова верным — сработало ещё раз');
  A.send({ t: 'set', key: 'var:door', value: 'Open ' });
  const p9 = await B2.wait((m) => m.t === 'state' && m.key === 'var:power' && m.value === 9, 2000);
  ok(!!p9, 'текст сравнивается без регистра и пробелов; действие правила — «−3» к общей переменной (12 → 9)');

  // П15: предел общей переменной (bounds) и правило «упёрлась в предел» (limit)
  M.send({ t: 'rules', ver: 5, list: [
    { id: 'lim-power', on: 'bounds', key: 'var:power', emit: [], min: 0, max: 10 },
    { id: 'init-heat', on: 'init', key: 'var:heat', value: 3, emit: [] },
    { id: 'r6', on: 'limit', key: 'var:power', side: 'max', emit: [{ t: 'msg', to: ['acc:aA'], kind: 'notify', body: { title: 'РЕАКТОР ЗАРЯЖЕН' } }] }
  ] });
  await sleep(100);
  B2.send({ t: 'msg', id: 'n-init', to: ['acc:aA'], kind: 'notify', body: { title: 'НАГРЕВ {{heat}}' } });
  const nI = await A.wait((m) => m.id === 'n-init');
  ok(nI && nI.body.title === 'НАГРЕВ 3', 'П16: переменную ещё никто не записал — в уведомлении начальное значение из пакета (правило init)');
  const nFull = () => A.all((m) => m.kind === 'notify' && m.body.title === 'РЕАКТОР ЗАРЯЖЕН').length;
  A.send({ t: 'set', key: 'var:power', add: 1 });
  ok(!!(await B2.wait((m) => m.t === 'state' && m.key === 'var:power' && m.value === 10, 2000)), 'предел: 9 + 1 = 10');
  await sleep(150);
  ok(nFull() === 0, 'до предела правило «упёрлась в предел» молчит');
  A.send({ t: 'set', key: 'var:power', add: 1 });
  ok(!!(await A.wait((m) => m.kind === 'notify' && m.body.title === 'РЕАКТОР ЗАРЯЖЕН', 2000)), '10 + 1 — упёрлась в наибольшее: уведомление');
  const big = () => B2.all((m) => m.t === 'state' && m.key === 'var:power' && m.value > 10).length, big0 = big();
  T.send({ t: 'set', key: 'var:power', value: 15 });
  await sleep(400);
  ok(big() === big0 && nFull() === 2, 'терминал записал 15 — у всех 10, правило сработало снова');
  T.send({ t: 'set', key: 'var:power', value: -4 });
  ok(!!(await B2.wait((m) => m.t === 'state' && m.key === 'var:power' && m.value === 0, 2000)), 'меньше наименьшего — 0');
  await sleep(150);
  ok(nFull() === 2, 'правило «наибольшее» на наименьшее не срабатывает');

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
  await voiceDone;
  for (const l of voiceOut.trim().split('\n')) console.log(l);
  ok(voiceOut.includes('VOICE OK'), 'голос (SgVad, SgVoiceCore): детектор голоса, фразы, цифры, предел и пауза через центр');
  console.log(failed ? `${passed}/${passed + failed} проверок пройдено` : `ВСЁ ХОРОШО (${passed})`);
  process.exit(failed ? 1 : 0);
}
