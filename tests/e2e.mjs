// СИГНАЛЫ — сквозная проверка: редактор → пакет → приложение игрока (Chromium, Playwright).
// node tests/e2e.mjs <playwright> <папка для снимков>
// Нужны: dist/ (npm run build), ffmpeg, python3.
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const shots = resolve(process.argv[3] || '/tmp/sg-shots');
const tmp = '/tmp/sg-e2e';
mkdirSync(shots, { recursive: true });
mkdirSync(tmp, { recursive: true });

let passed = 0, failed = 0;
function ok(cond, what) {
  if (cond) { passed++; console.log('  ✓', what); }
  else { failed++; console.log('  ✗', what); }
}

// медиа и видео камеры
execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
im=Image.new('RGB',(320,200),'#102010');d=ImageDraw.Draw(im);d.rectangle([20,20,300,180],outline='#33ff66',width=4);d.text((40,90),'TEST',fill='#33ff66');im.save('${tmp}/plan.png')`]);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-b:a', '64k', `${tmp}/signal.mp3`]);

const errors = [];
function watch(page, name) {
  page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
}

const edBrowser = await chromium.launch();

/* ================= РЕДАКТОР ================= */
console.log('Редактор');
const ectx = await edBrowser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
const ed = await ectx.newPage();
watch(ed, 'editor');
// окно «Сохранить как» подменяется: файл забирается из страницы
await ed.addInitScript(() => {
  window.showSaveFilePicker = async (o) => ({ createWritable: async () => ({
    write: async (blob) => { window.__saved = { name: o.suggestedName, data: new Uint8Array(await blob.arrayBuffer()) }; },
    close: async () => {} }) });
});
await ed.goto('file://' + resolve(root, 'dist/editor.html'));
await ed.waitForSelector('#nav button');

const nav = (name) => ed.locator('#nav button', { hasText: new RegExp('^' + name) }).click();
const field = (label) => ed.locator('.f', { has: ed.locator(`label:text-is("${label}")`) }).locator('input, textarea, select').first();

// Общее
await field('Мастерский код').fill('9999');
await field('Название (видно на экране входа)').fill('ТЕСТ');

// Аккаунты через интерфейс
await nav('Аккаунты');
for (const [name, prof, login] of [['Инженер Тест', 'Инженер', '111111'], ['Медик Тест', 'Медик', '222222']]) {
  await ed.locator('.list .tools button', { hasText: '+ Добавить' }).click();
  await field('Имя (в шапке приложения)').fill(name);
  await field('Профессия').fill(prof);
  await field('Код входа').fill(login);
  if (prof === 'Инженер') await field('Номер на терминале').fill('2');
}
ok(await ed.evaluate(() => window.sgEditor.project().game.accounts.find((a) => a.name === 'Инженер Тест').num) === '2', 'номер сотрудника на терминале записан (П9)');
await ed.locator('.list .row', { hasText: 'Инженер Тест' }).click();
await ed.locator('button', { hasText: '+ Текст' }).click();
await ed.locator('.item-ed textarea').fill('**Допуск:** техотсеки\nПроцедуры: 101, 102');
ok(await ed.locator('.list .row').count() === 2, 'два аккаунта в списке');
ok(await ed.locator('.card', { hasText: 'Функции приложения' }).locator('label', { hasText: 'Приём сигналов' }).count() === 0, 'функции «Приём сигналов» в редакторе нет (П-45)');
await ed.locator('.card', { hasText: 'Функции приложения' }).locator('label', { hasText: 'Анонимная отправка' }).locator('input').check();
await ed.locator('.card', { hasText: 'Функции приложения' }).locator('label', { hasText: 'Отложенная отправка' }).locator('input').check();
ok(await ed.evaluate(() => window.sgEditor.project().game.accounts.find((a) => a.name === 'Инженер Тест').modules.join()) === 'chat,notes,anon,delay', 'инженеру включены связь, заметки, анонимная и отложенная отправка');

// цвет интерфейса персонажа (П-50, П-52): в главе 1 по умолчанию розовый, выбирает сам; «Смена цвета» в любое время
const colCard = ed.locator('.card', { has: ed.locator('h3', { hasText: /^Цвет интерфейса$/ }) });
await colCard.locator('tr', { hasText: '1. Глава 1' }).locator('select').first().selectOption({ label: 'Розовый' });
await colCard.locator('tr', { hasText: '1. Глава 1' }).locator('.c-choose input').check();
await colCard.locator('tr', { hasText: '1. Глава 1' }).locator('.c-any input').check();
ok(await ed.evaluate(() => JSON.stringify(window.sgEditor.project().game.accounts.find((a) => a.name === 'Инженер Тест').colors)) === '{"1":{"def":"pink","choose":true,"any":true}}', 'цвет инженера в главе 1: розовый, выбирает сам, меняет в любое время');
await ed.screenshot({ path: `${shots}/editor-colors-account.png` });
await nav('Общее');
ok(await ed.locator('.card', { hasText: 'Цвета интерфейса (палитра)' }).locator('input[type=color]').count() === 9, 'палитра: 9 цветов по умолчанию');
ok(await field('Клавиатура у игроков').inputValue() === 'own', 'по умолчанию — своя клавиатура');
await ed.screenshot({ path: `${shots}/editor-general-colors.png` });
await nav('Главы и стили');
await ed.locator('.card', { hasText: 'Цвета персонажей в этой главе' }).locator('label', { hasText: 'Белый' }).locator('input').check();
await ed.locator('.card', { hasText: 'Цвета персонажей в этой главе' }).locator('label', { hasText: 'Белый' }).locator('input').uncheck();
ok(await ed.evaluate(() => window.sgEditor.project().game.chapters[0].colors.length) === 0, 'разрешённые цвета главы: отметка и снятие');

// Блоки через интерфейс: открытый блок с картинкой
await nav('Блоки данных');
await ed.locator('.list .tools button', { hasText: '+ Добавить' }).click();
await field('Название').fill('План отсека');
await field('Папка').fill('Схемы/Палуба А');
await ed.locator('label', { hasText: 'Открыт сразу (без кода)' }).locator('input').check();
await ed.locator('.item-ed .ih button', { hasText: 'Удалить' }).click();
await ed.locator('button', { hasText: '+ Картинка' }).click();
let fc = ed.waitForEvent('filechooser');
await ed.locator('button', { hasText: 'Загрузить новый…' }).click();
await (await fc).setFiles(`${tmp}/plan.png`);
ok(await ed.locator('.item-ed img').count() === 1, 'картинка загружена и видна в блоке');

// закрытый блок со звуком + код из кнопки блока
await ed.locator('.list .tools button', { hasText: '+ Добавить' }).click();
await field('Название').fill('Журнал планшета');
await field('Папка').fill('');
await ed.locator('.f', { hasText: 'Кому виден' }).locator('label', { hasText: 'Инженер Тест' }).locator('input').check();
await ed.locator('.item-ed textarea').fill('# Запись 1\nСистема **повреждена**.');
await ed.locator('button', { hasText: '+ Звук (mp3)' }).click();
fc = ed.waitForEvent('filechooser');
await ed.locator('button', { hasText: 'Загрузить новый…' }).click();
await (await fc).setFiles(`${tmp}/signal.mp3`);
await field('Название записи (видно игроку)').fill('Голосовая запись');
await ed.locator('button', { hasText: '+ Новый код для этого блока' }).click();
ok(await ed.locator('h1', { hasText: 'Коды' }).count() === 1, 'кнопка «новый код для блока» ведёт в коды');
await field('Код (цифры или буквы)').fill('4242');
await field('Заметка для мастера').fill('разбитый планшет');
await ed.locator('.card', { hasText: 'Кому открывается' }).getByRole('checkbox', { name: 'Инженер Тест — Инженер' }).check();
await field('Ответ (текст в окне после ввода)').fill('Планшет включился.');

// остальное — программно (блок для остальных, глава 2, код главы 2)
await ed.evaluate(() => {
  const P = window.sgEditor.project();
  const g = P.game;
  const damaged = { id: 'b_dmg', title: 'Повреждённое устройство', section: 'Находки', who: [], chapter: 1, start: false, items: [{ type: 'text', text: 'Экран треснут.' }] };
  const late = { id: 'b_late', title: 'Данные второй главы', section: 'Схемы', who: [], chapter: 2, start: true, items: [{ type: 'text', text: 'Новые данные.' }] };
  g.blocks.push(damaged, late);
  const code = g.codes.find((c) => c.code === '4242');
  code.denied = 'Нужен инженер.';
  code.deniedOpens.push('b_dmg');
  g.chapters.push({ id: 'c2', name: 'Глава 2', code: '55555', message: 'Сигнал усилился.', theme: Object.assign({}, g.chapters[0].theme, { text: '#ffb000', dim: '#8a6000', accent: '#ffe0a0' }) });
  g.codes.push({ id: 'k_late', code: '7777', note: 'код второй главы', who: [], opens: ['b_dmg'], answer: '', denied: '', deniedOpens: [], chapter: 2 });
  window.sgEditor.render();
});

// папки: дерево и переименование
await nav('Блоки данных');
await ed.locator('.card h3', { hasText: 'Папки' }).click();
ok(await ed.locator('.frow').count() === 3, 'дерево папок: Схемы, Палуба А, Находки (' + await ed.locator('.frow').count() + ')');
ok(await ed.locator('.frow', { hasText: 'Палуба А' }).evaluate((e) => e.style.paddingLeft) === '22px', 'вложенная папка с отступом');
ed.once('dialog', (d) => d.accept('Отсек 1'));
await ed.locator('.frow', { hasText: 'Палуба А' }).locator('button', { hasText: 'Переименовать' }).click();
ok(await ed.evaluate(() => window.sgEditor.project().game.blocks.find((b) => b.title === 'План отсека').section) === 'Схемы/Отсек 1', 'папка переименована в блоках');
await ed.locator('.frow', { hasText: 'Находки' }).locator('button', { hasText: '↑' }).click();
ok((await ed.locator('.frow .fn').first().textContent()).includes('Находки'), 'папка «Находки» поднята выше «Схемы»');
await ed.screenshot({ path: `${shots}/editor-folders.png` });

// таблица кодов
await nav('Таблица кодов');
ok(await ed.locator('table.codes tbody tr').count() === 7, 'таблица кодов: все 7 кодов в одном окне (с кодом настроек)');
const keyOf = (code) => ed.evaluate((c) => 'k' + window.sgEditor.project().game.codes.find((x) => x.code === c).id, code);
const row4242 = ed.locator(`table.codes tr[data-key="${await keyOf('4242')}"]`);
await row4242.locator('input.cm').fill('наклейка на планшете');
await row4242.locator('select').nth(1).selectOption('prop');
const row7777 = ed.locator(`table.codes tr[data-key="${await keyOf('7777')}"]`);
await row7777.locator('input.code').fill('4242');
ok(await ed.locator('table.codes tr.dup').count() === 2, 'повтор кода подсвечен');
await ed.locator('label', { hasText: 'только повторы' }).locator('input').check();
ok(await ed.locator('table.codes tbody tr').count() === 2, 'фильтр «только повторы»');
await ed.locator('label', { hasText: 'только повторы' }).locator('input').uncheck();
await row7777.locator('input.code').fill('7777');
ok(await ed.locator('table.codes tr.dup').count() === 0, 'повтор исправлен прямо в таблице');
const k4242 = await ed.evaluate(() => window.sgEditor.project().game.codes.find((c) => c.code === '4242'));
ok(k4242.comment === 'наклейка на планшете' && k4242.where === 'prop', 'комментарий и «где вводится» записаны в код');
await ed.locator('table.codes th', { hasText: 'Код' }).click();
ok((await ed.locator('table.codes tbody tr input.code').first().inputValue()) === '0000', 'сортировка по коду');
await ed.locator('input[type=search]').fill('планшет');
ok(await ed.locator('table.codes tbody tr').count() === 1, 'поиск по таблице');
await ed.screenshot({ path: `${shots}/editor-table.png` });
await ed.locator('input[type=search]').fill('');
const csv = await ed.evaluate(() => window.sgEditor.tableCsv());
ok(csv.charCodeAt(0) === 0xfeff && csv.includes('код;4242;разбитый планшет;Инженер Тест;Журнал планшета;Планшет включился.;1;реквизит;наклейка на планшете'), 'CSV для Excel');

// SSTV: картинка → звук
await nav('SSTV');
await ed.locator('.card', { hasText: 'Картинка' }).locator('select').first().selectOption('plan.png');
await ed.locator('.card', { hasText: 'Картинка' }).locator('select').nth(3).selectOption('44100');
await ed.getByRole('button', { name: 'Сделать звук', exact: true }).click();
await ed.locator('.sstv-out audio').waitFor({ timeout: 30000 });
const sstvInfo = await ed.evaluate(() => { const r = window.sgEditor.sstv().result; return { name: r.name, size: r.wav.size, rows: r.got && r.got.rows, mode: r.got && r.got.mode }; });
ok(sstvInfo.name === 'plan Robot36.wav' && sstvInfo.rows === 240 && sstvInfo.mode === 'Robot 36', 'SSTV: звук сделан и проверен декодером: ' + JSON.stringify(sstvInfo));
await ed.screenshot({ path: `${shots}/editor-sstv.png` });
await ed.locator('button', { hasText: 'Сохранить WAV…' }).click();
await ed.waitForFunction(() => window.__saved);
const wavSaved = await ed.evaluate(() => ({ name: window.__saved.name, b64: btoa(Array.from(window.__saved.data, (c) => String.fromCharCode(c)).join('')) }));
await ed.evaluate(() => { window.__saved = null; });
writeFileSync(`${tmp}/sstv.wav`, Buffer.from(wavSaved.b64, 'base64'));
ok(wavSaved.name === 'plan Robot36.wav' && Buffer.from(wavSaved.b64, 'base64').slice(0, 4).toString() === 'RIFF', 'WAV сохранён: ' + wavSaved.name);

// все вкладки открываются без ошибок
for (const t of ['Общее', 'Главы и стили', 'Аккаунты', 'Блоки данных', 'Коды', 'Приборы', 'Сеть и события', 'Таблица кодов', 'Медиа', 'Проверка', 'QR-коды', 'SSTV']) {
  await nav(t);
  await ed.screenshot({ path: `${shots}/editor-${t.split(' ')[0]}.png` });
}
await nav('Проверка');
ok(await ed.locator('.prob.error').count() === 0, 'проверка: ошибок нет');
await nav('QR-коды');
ok(await ed.locator('.qr-row').count() === 7, 'коды игры в списке QR (' + await ed.locator('.qr-row').count() + ')');
await ed.locator('.qr-row', { hasText: '4242' }).locator('button', { hasText: 'Показать' }).click();
ok(await ed.locator('.qr-prev canvas').count() === 1, 'QR кода 4242 нарисован');
await ed.locator('.card', { hasText: 'Перевести код в QR' }).locator('select').nth(2).selectOption('code');
await ed.screenshot({ path: `${shots}/editor-QR-show.png` });
await ed.locator('button', { hasText: 'Сохранить JPG…' }).click();
await ed.waitForFunction(() => window.__saved);
const jpg = await ed.evaluate(() => ({ name: window.__saved.name, b64: btoa(Array.from(window.__saved.data, (c) => String.fromCharCode(c)).join('')) }));
await ed.evaluate(() => { window.__saved = null; });
writeFileSync(`${tmp}/qr.jpg`, Buffer.from(jpg.b64, 'base64'));
ok(jpg.name === 'QR-4242.jpg' && jpg.b64.startsWith('/9j/'), 'QR сохранён в JPG: ' + jpg.name);
const px = execFileSync('python3', ['-c', `from PIL import Image;im=Image.open('${tmp}/qr.jpg').convert('RGB');print(im.size, im.getpixel((2,2)))`]).toString().trim();
ok(/\(512, \d+\) \([0-9], (?:[0-9]|1[0-9]), [0-9]\)/.test(px), 'JPG тёмный фон, размер 512: ' + px);
await ed.locator('button', { hasText: 'Сохранить отмеченные в JPG' }).click();
await ed.waitForFunction(() => window.__saved);
const zipName = await ed.evaluate(() => window.__saved.name);
const zipCount = await ed.evaluate(async () => Object.keys((await JSZip.loadAsync(window.__saved.data)).files).length);
ok(zipName === 'QR-ТЕСТ.zip' && zipCount === 5, 'архив JPG отмеченных кодов: ' + zipName + ', файлов ' + zipCount);
await ed.evaluate(() => { window.__saved = null; });

// голос (П-58): вкладка «Голос», режим у аккаунта, фраза у кода
await nav('Голос');
ok(await ed.locator('h1', { hasText: 'Голос' }).count() === 1, 'вкладка «Голос» открывается');
await ed.locator('.card', { hasText: 'Кто слушает' }).locator('tr', { hasText: 'Инженер Тест' }).locator('select').first().selectOption('button');
const eng = await ed.evaluate(() => window.sgEditor.project().game.accounts.find((a) => a.name === 'Инженер Тест'));
ok(eng.voiceMode === 'button' && eng.modules.includes('voice'), 'Инженер: голос «по кнопке» — функция «Голос» включена');
await ed.locator('button', { hasText: '+ Голосовая фраза' }).click();
ok(await ed.locator('h1', { hasText: 'Коды' }).count() === 1, '«+ Голосовая фраза» ведёт в карточку кода');
await ed.locator('.card', { hasText: 'Голосом' }).locator('input').first().fill('Слава лидеру');
const vc = await ed.evaluate(() => window.sgEditor.project().game.codes.find((c) => c.voice === 'Слава лидеру'));
ok(vc && vc.code === '' && vc.voiceMax === 0, 'фраза записана в код (код пустой — только голосом)');
await nav('Голос');
ok(await ed.locator('table.voice-table tbody tr').count() === 1, 'фраза в перечне вкладки «Голос»');
// П9 (12А): слова, которых модель не знает, — подсказка в перечне и в карточке кода
await field('Слова, которых модель не знает').fill('лидеру');
await ed.locator('button', { hasText: 'Обновить подсказки' }).click();
ok((await ed.locator('table.voice-table td.warn').first().textContent()).includes('«лидеру»: модель этого слова не знает'), 'подсказка: «лидеру» модель не знает — заменить');
await field('Слова, которых модель не знает').fill('');
await ed.locator('button', { hasText: 'Обновить подсказки' }).click();
await ed.screenshot({ path: `${shots}/editor-voice.png` });
await nav('Проверка');
ok(await ed.locator('.prob.error').count() === 0, 'код только голосом — не ошибка «пустой код»');

// П13 (Т4-3): общие переменные и правило «общая переменная» в старом редакторе
await nav('Общее');
await ed.locator('button', { hasText: '+ Общая переменная' }).click();
const shRow = ed.locator('.shared-card .shared-row').first();
await shRow.locator('input').nth(0).fill('power');
await shRow.locator('input').nth(1).fill('Энергия');
await shRow.locator('input').nth(2).fill('5');
await nav('Сеть и события');
await ed.locator('.subnav button', { hasText: 'Правила' }).click();
await ed.locator('button', { hasText: '+ Добавить' }).click();
await field('Когда').selectOption('var');
await field('Переменная').selectOption('power');
await field('Условие').selectOption('>=');
await field('Значение').fill('8');
const shG = await ed.evaluate(() => { const g = window.sgEditor.project().game; return { shared: g.shared, rule: g.rules[g.rules.length - 1], rules: SG.centerRules(Object.assign({}, g, { rules: g.rules.map((r) => Object.assign({}, r, { actions: [{ type: 'notify', title: 'x' }] })) })).filter((r) => r.test) }; });
ok(shG.shared.length === 1 && shG.shared[0].name === 'power' && shG.shared[0].value === 5 && shG.shared[0].label === 'Энергия', 'общая переменная: имя, подпись, начальное число');
ok(shG.rule.on === 'var' && shG.rule.var === 'power' && shG.rule.op === '>=' && shG.rules.length === 1 && shG.rules[0].key === 'var:power' && shG.rules[0].test.value === 8 && shG.rules[0].init === 5,
  'правило «общая переменная ≥ 8» → правило центра с условием и начальным значением');
await ed.screenshot({ path: `${shots}/editor-rule-var.png` });
await field('Переменная').selectOption('');
await nav('Проверка');
ok(await ed.locator('.prob.error', { hasText: 'общей переменной «» нет' }).count() === 1, 'проверка: правило без общей переменной — ошибка');
await nav('Сеть и события');
await ed.locator('.subnav button', { hasText: 'Правила' }).click();
await ed.locator('.list .row').last().click();
await field('Переменная').selectOption('power');
await nav('Проверка');
ok(await ed.locator('.prob.error').count() === 0, 'проверка: снова без ошибок');
// Т4-5 А (П14): у кода — «когда» по общим переменным
await nav('Коды');
await ed.locator('.list .row', { hasText: '4242' }).click();
const wc = ed.locator('.when-card');
await wc.locator('button', { hasText: '+ Условие' }).click();
await wc.locator('.when-row select').nth(1).selectOption('>');
await wc.locator('.when-row input').first().fill('6');
await wc.locator('textarea').fill('Мало энергии: {{power}}');
const wcG = await ed.evaluate(() => window.sgEditor.project().game.codes.find((c) => c.code === '4242'));
ok(wcG.when.length === 1 && wcG.when[0].var === 'power' && wcG.when[0].op === '>' && wcG.when[0].value === '6' && wcG.whenText === 'Мало энергии: {{power}}', 'код: условие «когда энергия > 6» и ответ, если не выполнено');
ok(await ed.evaluate(() => { const g = window.sgEditor.project().game; const c = g.codes.find((x) => x.code === '4242');
  return SG.whenOk(g, c, {}) === false && SG.whenOk(g, c, { power: 7 }) === true && SG.whenOk(g, c, { power: '6,5' }) === true; }), 'условие: начальное 5 — нет, 7 и «6,5» — да');
await ed.screenshot({ path: `${shots}/editor-when.png` });
await wc.locator('button', { hasText: 'Убрать условие' }).click();
ok((await ed.evaluate(() => window.sgEditor.project().game.codes.find((c) => c.code === '4242').when.length)) === 0, 'условие убрано');

// П14 (Т4-6 Б): шапка и меню
await nav('Шапка и меню');
await field('Первая строка').fill('{name} · {prof}');
await field('Вторая строка').fill('ЭНЕРГИЯ {{power}}');
await ed.locator('button', { hasText: '+ Показатель' }).click();
const hi = ed.locator('.hdr-item').first();
await hi.locator('input').nth(0).fill('РЕАКТОР');
await hi.locator('select').nth(1).selectOption('cells');
await ed.locator('.hdr-item').first().locator('input[type=number]').fill('8');
await ed.locator('.hdr-item').first().locator('input[type=number]').blur();
await ed.locator('button', { hasText: '+ Показатель' }).click();
await ed.locator('.hdr-item').nth(1).locator('input').nth(1).fill('10');
await ed.locator('.hdr-item').nth(1).locator('input').nth(1).blur();
await ed.locator('button', { hasText: '+ Раздел' }).click();
await ed.locator('.hdr-sec input').first().fill('Состояние корабля');
await ed.locator('.hdr-sec textarea').fill('Реактор: {{power}} из 8.');
await field('Заголовок окна').fill('БОРТОВАЯ СВОДКА');
await ed.locator('.menu-table tr[data-tab=code] input[type=text]').fill('ВВОД');
await ed.locator('.menu-table tr[data-tab=scan] input[type=checkbox]').check();
await ed.locator('.menu-table tr[data-tab=code] button').click();
const hdG = await ed.evaluate(() => { const g = window.sgEditor.project().game; return { h: g.header, m: g.menu }; });
ok(hdG.h.title === '{name} · {prof}' && hdG.h.items.length === 2 && hdG.h.items[0].show === 'cells' && hdG.h.items[0].max === 8 && hdG.h.items[0].label === 'РЕАКТОР' &&
  hdG.h.items[1].show === 'num' && hdG.h.items[1].max === 10 && !hdG.h.items[1].label && hdG.h.info.length === 1 && hdG.h.infoTitle === 'БОРТОВАЯ СВОДКА', 'шапка: строки, показатели (квадратики 8, число из 10 без подписи), раздел окна');
ok(hdG.m[0].tab === 'code' && hdG.m[0].label === 'ВВОД' && hdG.m.find((m) => m.tab === 'scan').hidden, 'меню: «Код» первым и «ВВОД», «Сканер» скрыт');
await ed.screenshot({ path: `${shots}/editor-header.png`, fullPage: true });

// предпросмотр
await nav('Предпросмотр');
const pv = ed.frameLocator('.phone iframe');
await pv.locator('#scr-login.on').waitFor({ timeout: 10000 });
ok(true, 'предпросмотр показывает экран входа');
await ed.locator('.card select').first().selectOption({ label: 'Инженер Тест — Инженер' });
await pv.locator('#scr-main.on').waitFor();
ok(await pv.locator('.item.folder', { hasText: 'Схемы' }).count() === 1, 'предпросмотр: папка с открытым блоком видна');
ok((await pv.locator('#bar-name').textContent()) === 'Инженер Тест · Инженер' && (await pv.locator('#bar-prof').textContent()) === 'ЭНЕРГИЯ 5', 'шапка: свои строки с {name}, {prof} и {{power}}');
ok(await pv.locator('#bar-vars .hv-cells .cells i').count() === 8 && await pv.locator('#bar-vars .hv-cells .cells i.on').count() === 5 && (await pv.locator('#bar-vars .hv-cells b').textContent()) === 'РЕАКТОР', 'шапка: «РЕАКТОР» — 5 горящих квадратиков из 8');
ok((await pv.locator('#bar-vars .hv').nth(1).textContent()) === '5/10', 'шапка: второй показатель без подписи — «5/10»');
const tabsNow = await pv.locator('#tabs button:not([hidden])').allTextContents();
ok(tabsNow[0] === 'ВВОД' && tabsNow[1] === 'ДАННЫЕ' && !tabsNow.includes('СКАНЕР'), 'меню: ' + tabsNow.join(' '));
await ed.screenshot({ path: `${shots}/editor-preview.png` });
await pv.locator('#bar-name').click();
ok((await pv.locator('#dlg.on .dlg-title').textContent()) === 'БОРТОВАЯ СВОДКА' && (await pv.locator('#dlg.on .dlg-text').textContent()).includes('Реактор: 5 из 8'), 'нажатие на шапку — окно со сводкой и разделом');
await ed.screenshot({ path: `${shots}/editor-preview-info.png` });
await pv.locator('#dlg .dlg-btns .btn').last().click();
await nav('Шапка и меню');
await ed.locator('button', { hasText: 'Как было' }).click();
ok((await ed.evaluate(() => window.sgEditor.project().game.menu.length)) === 0, 'меню «Как было»');
await field('Первая строка').fill('');
await field('Вторая строка').fill('');

// сохранить пакет
await ed.locator('#a-save').click();
await ed.waitForFunction(() => window.__saved);
const saved = await ed.evaluate(() => ({ name: window.__saved.name, b64: btoa(Array.from(window.__saved.data, (c) => String.fromCharCode(c)).join('')) }));
const packPath = `${tmp}/${saved.name}`;
writeFileSync(packPath, Buffer.from(saved.b64, 'base64'));
ok(saved.name === 'ТЕСТ-v2.sgpack', 'пакет сохранён с версией: ' + saved.name);

// черновик переживает перезагрузку
await ed.reload();
await ed.waitForSelector('#nav button');
await nav('Коды');
ok(await ed.locator('.list .row', { hasText: '4242' }).count() === 1, 'черновик восстановлен после перезагрузки');

await edBrowser.close();

/* ================= ПРИЛОЖЕНИЕ ИГРОКА ================= */
console.log('Приложение игрока');
// микрофон слышит сигнал SSTV из редактора: секунда тишины, сигнал, тишина (Chrome повторяет файл по кругу)
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-i', `${tmp}/sstv.wav`,
  '-filter_complex', '[0]atrim=0:1,asplit[s1][s2];[1]volume=0.5[v];[s1][v][s2]concat=n=3:v=0:a=1', '-ar', '48000', '-ac', '1', `${tmp}/sstv-mic.wav`]);
// камера показывает QR, сохранённый редактором (зелёный на чёрном)
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', `${tmp}/qr.jpg`, '-t', '4', '-r', '10',
  '-vf', 'scale=360:-2,pad=640:480:(ow-iw)/2:(oh-ih)/2:black', '-pix_fmt', 'yuv420p', `${tmp}/qr.y4m`]);
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${tmp}/qr.y4m`,
    `--use-file-for-fake-audio-capture=${tmp}/sstv-mic.wav`, '--autoplay-policy=no-user-gesture-required']
});
const server = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: resolve(root, 'dist/www'), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const pctx = await browser.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2, hasTouch: true, permissions: ['camera', 'microphone'] });
const app = await pctx.newPage();
watch(app, 'player');
await app.goto('http://127.0.0.1:8765/');
await app.locator('#scr-boot.on').waitFor();
await app.screenshot({ path: `${shots}/app-1-boot.png` });
// путь с кириллицей Playwright не передаёт — даём содержимое и имя
await app.setInputFiles('#file', { name: saved.name, mimeType: 'application/zip', buffer: readFileSync(packPath) });
await app.locator('#scr-login.on').waitFor();
ok((await app.locator('#login-logo').textContent()) === 'ТЕСТ', 'пакет загружен, экран входа');

async function type(code, where = 'login') {
  const pad = app.locator(`[data-pad=${where}] .pad`);
  for (const ch of code) await pad.locator('button', { hasText: new RegExp('^' + ch + '$') }).click();
  await pad.locator('button.ok').click();
}
await type('000');
ok(await app.locator('#dlg.on .dlg-title', { hasText: 'КОД НЕ РАСПОЗНАН' }).count() === 1, 'неверный код входа');
await app.locator('#dlg .btn').click();
await type('111111');
await app.locator('#scr-main.on').waitFor();
ok((await app.locator('#bar-name').textContent()) === 'Инженер Тест', 'вход в аккаунт инженера');
ok(await app.locator('#bar-vars .cells i.on').count() === 5 && (await app.locator('#bar-prof').textContent()) === 'Инженер', 'шапка приложения: имя, профессия и показатели из пакета');
// первый вход (П-55): разрешения, затем цвет
const cssVar = (n) => app.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), n);
await app.locator('#first.on').waitFor();
await app.locator('#first .perm[data-perm=cam].ok').waitFor({ timeout: 5000 });
ok(true, 'первый вход: камера разрешена');
ok(await app.locator('#first .perm[data-perm=notify]').count() === 0, 'в браузере уведомления и работа в фоне не спрашиваются');
ok(await cssVar('--text') === '#ff66c4', 'до выбора — цвет персонажа по умолчанию (розовый)');
await app.screenshot({ path: `${shots}/app-1b-first.png` });
await app.locator('#first-go').click();
ok(await app.locator('#first [data-kbd=own]').count() === 1 && await app.locator('#first [data-kbd=sys]').count() === 1, 'первый вход: выбор клавиатуры — приложения или телефона');
await app.screenshot({ path: `${shots}/app-1b2-kbd-choice.png` });
await app.locator('#first [data-kbd=own]').click();
ok(await app.locator('#first .swatch.on[data-color=pink]').count() === 1 && await app.locator('#first .swatch').count() === 9, 'выбор цвета: заданный отмечен, все 9 цветов');
await app.locator('#first .swatch[data-color=blue]').click();
await app.screenshot({ path: `${shots}/app-1c-color.png` });
await app.locator('#first-done').click();
ok(await app.locator('#first.on').count() === 0 && await cssVar('--text') === '#4fd2ff' && (await cssVar('--bg')) !== '#030803', 'выбран голубой: весь интерфейс голубой (' + await cssVar('--bg') + ')');
await app.locator('#bar-color').click();
await app.locator('#dlg.on .swatch[data-color=violet]').click();
await app.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim() === '#b58cff', null, { timeout: 3000 }).catch(() => {});
ok(await cssVar('--text') === '#b58cff', 'кнопка ◐ («в любое время»): фиолетовый');
ok(await app.locator('.profile', { hasText: 'Допуск' }).count() === 1, 'профиль (Мультипаспорт) виден');
ok(await app.locator('.item.folder', { hasText: 'Схемы' }).count() === 1 && await app.locator('.item', { hasText: 'План отсека' }).count() === 0, 'на верхнем уровне — папка «Схемы»');
ok(await app.locator('.item.folder', { hasText: 'Находки' }).count() === 0, 'папки без открытых блоков не видно');
ok((await app.locator('.item.folder', { hasText: 'Схемы' }).locator('.new').textContent()) === 'НОВОЕ 1', 'у папки счётчик новых');
ok(await app.locator('.item', { hasText: 'Журнал планшета' }).count() === 0, 'закрытый блок не виден');
ok(await app.locator('.item', { hasText: 'Данные второй главы' }).count() === 0, 'блок второй главы не виден');
await app.waitForTimeout(1600);
ok(await app.locator('#glitch.on').count() === 0, 'эффект перехода исчезает');
await app.screenshot({ path: `${shots}/app-2-data.png` });
await app.locator('.item.folder', { hasText: 'Схемы' }).click();
await app.locator('.item.folder', { hasText: 'Отсек 1' }).click();
ok((await app.locator('.crumbs .path').textContent()) === 'ДАННЫЕ / Схемы / Отсек 1', 'путь папки сверху');
ok(await app.locator('.item', { hasText: 'План отсека' }).count() === 1, 'открытый блок виден во вложенной папке');
await app.screenshot({ path: `${shots}/app-2b-folder.png` });

await app.locator('.item', { hasText: 'План отсека' }).click();
ok(await app.locator('#view.on .media-img img').count() === 1, 'картинка в блоке');
ok((await app.locator('#view-sec').textContent()) === 'Схемы / Отсек 1', 'в блоке виден путь папки');
await app.screenshot({ path: `${shots}/app-3-block.png` });
await app.goBack();
ok(await app.locator('#view.on').count() === 0, 'кнопка «назад» закрывает блок');
ok(await app.locator('.item.folder', { hasText: 'Схемы' }).count() === 0 && await app.locator('.item', { hasText: 'План отсека' }).count() === 1, 'после блока — та же папка');
await app.locator('.crumbs .up').click();
ok((await app.locator('.crumbs .path').textContent()) === 'ДАННЫЕ / Схемы', '«‹» поднимает на уровень выше');
ok(await app.locator('.item.folder', { hasText: 'Отсек 1' }).locator('.new').count() === 0, 'прочитанное снимает «НОВОЕ» с папки');
await app.locator('.crumbs .path button', { hasText: 'ДАННЫЕ' }).click();
ok(await app.locator('.crumbs').count() === 0, 'щелчок по «ДАННЫЕ» — на верхний уровень');

await app.locator('#tabs button', { hasText: 'КОД' }).click();
await type('7777', 'main');
ok(await app.locator('#dlg.on .dlg-title', { hasText: 'КОД ПОКА НЕ АКТИВЕН' }).count() === 1, 'код второй главы раньше времени');
await app.locator('#dlg .btn').click();
await type('4242', 'main');
ok(await app.locator('#dlg.on .dlg-title', { hasText: 'ДОСТУП ОТКРЫТ' }).count() === 1, 'код открыл блок инженеру');
await app.screenshot({ path: `${shots}/app-4-opened.png` });
await app.locator('#dlg-list .item', { hasText: 'Журнал планшета' }).click();
await app.locator('#view.on').waitFor();
ok(await app.locator('#view .aud').count() === 1, 'звук в блоке');
await app.locator('#view .a-play').click();
await app.waitForFunction(() => /^0:0[1-9]/.test(document.querySelector('#view .a-time').textContent), null, { timeout: 8000 }).catch(() => {});
ok(/^0:0[1-9] \/ 0:06$/.test(await app.locator('#view .a-time').textContent()) && (await app.locator('#view .a-play').textContent()) === '❚❚',
  'звук играет: ' + await app.locator('#view .a-time').textContent());
await app.screenshot({ path: `${shots}/app-5-audio.png` });
await app.locator('#view-back').click();
ok(await app.locator('#tab-data .item', { hasText: 'Журнал планшета' }).count() === 1, 'блок появился в данных');

await type('4242', 'main');
ok(await app.locator('#dlg.on .dlg-title', { hasText: 'ДАННЫЕ УЖЕ ПОЛУЧЕНЫ' }).count() === 1, 'повторный ввод кода');
await app.locator('#dlg .btn').click();

// своя клавиатура (П-54): «ABC» у поля кода — буквы и знаки в стиле игры, системная не открывается
await app.locator('[data-pad=main] .kb').click();
ok(await app.locator('[data-pad=main] .kbd').isVisible() && !(await app.locator('[data-pad=main] .pad').isVisible()), '«ABC»: своя клавиатура вместо цифр');
ok(await app.locator('[data-pad=main] input').getAttribute('inputmode') === 'none', 'системная клавиатура не открывается');
ok(await app.locator('[data-pad=main] .kbd .k[data-k=q]').textContent() === 'Q', 'в поле кода — заглавные буквы');
await app.screenshot({ path: `${shots}/app-4b-kbd.png` });
await app.locator('[data-pad=main] .kbd .k[data-k="123"]').click();
for (let i = 0; i < 4; i++) await app.locator('[data-pad=main] .kbd .k[data-k="0"]').click();
await app.locator('[data-pad=main] .kbd .k[data-k="⏎"]').click();
ok(await app.locator('#dlg.on .dlg-title', { hasText: 'НАСТРОЙКИ' }).count() === 1, 'код 0000 набран своей клавиатурой');
await app.locator('#dlg .btn', { hasText: 'Клавиатура: ПРИЛОЖЕНИЯ' }).click();
ok(await app.evaluate(() => window.sgPlayer.state().kbd) === 'sys' && await app.locator('#dlg .btn', { hasText: 'Клавиатура: ТЕЛЕФОНА' }).count() === 1, 'настройки (код 0000): клавиатура телефона');
await app.locator('#dlg .btn', { hasText: 'Клавиатура: ТЕЛЕФОНА' }).click();
ok(await app.evaluate(() => window.sgPlayer.state().kbd) === 'own', 'и обратно — клавиатура приложения');
await app.locator('#dlg .btn', { hasText: 'Закрыть' }).click();
await app.locator('[data-pad=main] .kb').click();
ok(await app.locator('[data-pad=main] .pad').isVisible(), '«123» — снова цифры');
// заметка своей клавиатурой: заглавная в начале, ё — долгим нажатием «е»
await app.locator('#tabs button', { hasText: 'ЗАМЕТКИ' }).click();
await app.locator('#tab-notes .btn', { hasText: 'НОВАЯ ЗАМЕТКА' }).click();
const nk = app.locator('#dlg.on .kbd');
await nk.waitFor();
for (const k of ['п', 'р', 'и']) await nk.locator(`.k[data-k="${k}"]`).click();
await nk.locator('.k[data-k="␣"]').click();
const eKey = nk.locator('.k[data-k="е"]');
const eb = await eKey.boundingBox();
await app.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
await app.mouse.down(); await app.waitForTimeout(600); await app.mouse.up();
await nk.locator('.k[data-k="ж"]').click();
ok(await app.locator('#dlg.on textarea').inputValue() === 'При ёж', 'заметка набрана своей клавиатурой: «' + await app.locator('#dlg.on textarea').inputValue() + '»');
await app.screenshot({ path: `${shots}/app-4c-note-kbd.png` });
await app.locator('#dlg .btn', { hasText: 'Готово' }).click();
await app.locator('#tab-notes .item', { hasText: 'При ёж' }).waitFor({ timeout: 3000 }).catch(() => {});
ok(await app.locator('#tab-notes .item', { hasText: 'При ёж' }).count() === 1, 'заметка сохранена');
await app.locator('#tabs button', { hasText: 'КОД' }).click();

// перезагрузка — аккаунт и открытое сохраняются
await app.reload();
await app.locator('#scr-main.on').waitFor();
ok(await app.locator('.item', { hasText: 'Журнал планшета' }).count() === 1, 'после перезагрузки аккаунт и данные на месте');

// П-45: приёма SSTV на телефоне нет — даже если в старом пакете функция включена
ok(!(await app.locator('#tabs button[data-tab=sstv]').isVisible()), 'вкладки «СИГНАЛ» нет (П-45)');
ok(await app.evaluate(() => { const g = window.sgPlayer.game(); const a = g.accounts.find((x) => x.name === 'Инженер Тест'); a.modules.push('sstv'); return window.SG.moduleState(g, a, 1, {}, 'sstv'); }) === 'hidden', 'старый пакет с «Приёмом сигналов»: функция скрыта');
// старый WebView: оттенки цветов — переменными (без color-mix), запасные отступы без gap
const css = readFileSync(resolve(root, 'src/player/player.css'), 'utf8');
ok(!/color-mix|inset:/.test(css), 'в стилях нет color-mix и inset (их не знает старый WebView)');
ok(await app.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-30').trim().startsWith('rgba(')), 'оттенки цветов главы заданы переменными');
await app.evaluate(() => document.documentElement.classList.add('nogap'));
await app.screenshot({ path: `${shots}/app-9-nogap.png` });
const gapM = await app.evaluate(() => { const b = document.querySelector('#bar .bar-r > * + *') || document.querySelector('.item > * + *'); return b ? getComputedStyle(b).marginLeft : ''; });
ok(gapM && gapM !== '0px', 'без gap у flex: отступы полями (' + gapM + ')');
await app.evaluate(() => document.documentElement.classList.remove('nogap'));

// мастер: сменить аккаунт
await app.locator('#tabs button', { hasText: 'КОД' }).click();
await type('9999', 'main');
ok(await app.locator('#dlg.on .dlg-title', { hasText: 'РЕЖИМ МАСТЕРА' }).count() === 1, 'мастерский код открывает режим мастера');
await app.screenshot({ path: `${shots}/app-6-master.png` });
await app.locator('#dlg .btn', { hasText: 'Сменить аккаунт' }).click();
await app.locator('#scr-login.on').waitFor();
await type('222222');
await app.locator('#scr-main.on').waitFor();
ok((await app.locator('#bar-name').textContent()) === 'Медик Тест', 'вход в аккаунт медика');
await app.locator('#first.on').waitFor();
await app.locator('#first .perm[data-perm=cam].ok').waitFor({ timeout: 5000 });
await app.locator('#first-go').click();
await app.locator('#first [data-kbd=own]').click();
ok(await app.locator('#first.on').count() === 0 && await cssVar('--text') === '#33ff66', 'медик: первый вход без выбора цвета, интерфейс главы (зелёный)');
ok(!(await app.locator('#bar-color').isVisible()), 'у медика нет кнопки ◐');

// сканер: QR 4242 у медика — нет доступа + описание повреждения
await app.locator('#tabs button', { hasText: 'СКАНЕР' }).click();
await app.locator('#dlg.on').waitFor({ timeout: 15000 });
ok(await app.locator('#dlg.on .dlg-title', { hasText: 'НЕТ ДОСТУПА' }).count() === 1, 'зелёно-чёрный QR из редактора отсканирован: медику «нет доступа»');
ok(await app.locator('#dlg-list .item', { hasText: 'Повреждённое устройство' }).count() === 1, 'медику открылось описание повреждения');
await app.screenshot({ path: `${shots}/app-7-scan.png` });
await app.locator('#dlg .btn').click();
await app.locator('#tabs button', { hasText: 'ДАННЫЕ' }).click();
ok(await app.locator('.item', { hasText: 'Журнал планшета' }).count() === 0, 'журнал инженера медику не виден');

// глава 2
const before = await app.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim());
await app.locator('#tabs button', { hasText: 'КОД' }).click();
await type('55555', 'main');
await app.locator('#dlg.on .dlg-title', { hasText: 'ГЛАВА 2' }).waitFor();
const after = await app.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim());
ok(before !== after && after === '#ffb000', 'смена главы меняет стиль (' + before + ' → ' + after + ')');
ok(await app.locator('#dlg-list .item', { hasText: 'Данные второй главы' }).count() === 1, 'окно главы показывает новые блоки');
await app.screenshot({ path: `${shots}/app-8-chapter2.png` });
await app.locator('#dlg .btn').click();
ok((await app.locator('#bar-chap').textContent()) === 'Глава 2', 'в шапке — Глава 2');
await type('7777', 'main');
ok(await app.locator('#dlg.on .dlg-title', { hasText: /ДОСТУП ОТКРЫТ|ДАННЫЕ УЖЕ ПОЛУЧЕНЫ/ }).count() === 1, 'код второй главы теперь работает');

server.kill();
await browser.close();
ok(errors.length === 0, 'ошибок на страницах нет' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
console.log(failed ? `${passed}/${passed + failed} проверок пройдено` : `ВСЁ ХОРОШО (${passed})`);
process.exit(failed ? 1 : 0);
