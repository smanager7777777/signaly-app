// СИГНАЛЫ — проверка Java-кода Android без Android SDK (сессия О1, 21.11.2026).
// Ловит ошибки компиляции до сборки на GitHub: ссылка вперёд (П19), доступ к не-public из другого пакета (П17),
// опечатки в именах своих классов, полей и методов, неверные типы между своими классами.
// Как: javac по всем .java из android/app/src/main/java; классов Android, AndroidX, Capacitor, Vosk, JNA и org.json
// здесь нет — ошибки «нет такого пакета/класса» про них отбрасываются, остальные ошибки печатаются и роняют проверку.
// Ограничение: вызовы методов самих Android-классов (их нет) не проверяются — это ловит только сборка APK.
// Запуск: node tools/android-check.mjs        (нужен только javac; ~5 с; поведение приложения не меняет)
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(root, 'android/app/src/main/java');
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.java')) files.push(p); } })(srcRoot);

// Пакеты, которых без SDK нет (их ошибки — не наши).
const EXT = /^(android|androidx|com\.getcapacitor|org\.vosk|com\.sun\.jna|org\.json|org\.apache\.cordova)\b/;
// Свои классы — чтобы «cannot find symbol: class X» про свой класс не отбрасывать.
const own = new Set(files.map((f) => f.split('/').pop().replace(/\.java$/, '')));
// Импорты и предки своих классов: класс с предком из SDK (Service, Plugin, Activity…) наследует методы, которых здесь нет.
const src = {}, imports = {}, supers = {};
for (const f of files) {
  const t = readFileSync(f, 'utf8'); src[f] = t.split('\n');
  for (const m of t.matchAll(/^import\s+(?:static\s+)?([\w.]+)\.(\w+);/gm)) imports[m[2]] = m[1] + '.' + m[2];
  for (const m of t.matchAll(/\b(?:class|interface)\s+(\w+)([^{]*)\{/g)) {
    const h = m[2].replace(/<[^>]*>/g, '');
    supers[m[1]] = [...h.matchAll(/(?:extends|implements|,)\s*([\w.]+)/g)].map((x) => x[1]);
  }
}
const JDK = /^java\./;
function extType(name, seen = new Set()) {
  name = name.split('.').pop();
  if (own.has(name) || supers[name]) { if (seen.has(name)) return false; seen.add(name); return (supers[name] || []).some((x) => extType(x, seen)); }
  const imp = imports[name];
  if (imp) return EXT.test(imp);
  return !/^(Object|Runnable|Thread|Exception|RuntimeException|Comparable|Iterable|AutoCloseable|Cloneable)$/.test(name);
}
function enclosing(file, line) {
  // Стек фигурных скобок до строки ошибки: у скобки класса или анонимного класса — его тип.
  const L = src[file] || [], stack = [];
  for (let i = 0; i < line - 1 && i < L.length; i++) {
    const t = L[i].replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""').replace(/\/\/.*$/, '');
    const marks = [];
    for (const m of t.matchAll(/\bnew\s+([\w.]+)\s*(?:<[^>]*>)?\s*\([^()]*\)\s*\{/g)) marks.push([m.index + m[0].length - 1, m[1]]);
    for (const m of t.matchAll(/\b(?:class|interface|enum)\s+(\w+)[^{;]*\{/g)) marks.push([m.index + m[0].length - 1, m[1]]);
    for (let k = 0; k < t.length; k++) {
      if (t[k] === '{') { const mk = marks.find((x) => x[0] === k); stack.push(mk ? mk[1] : null); }
      else if (t[k] === '}') stack.pop();
    }
  }
  for (let k = stack.length - 1; k >= 0; k--) if (stack[k]) return stack[k];
  return '';
}


const out = mkdtempSync(join(tmpdir(), 'sg-acheck-'));
let log = '';
try {
  execFileSync('javac', ['-encoding', 'UTF-8', '-Xlint:none', '-Xmaxerrs', '100000', '-proc:none', '-implicit:none', '-d', out, ...files], { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) { log = String(e.stderr || '') + String(e.stdout || ''); }
rmSync(out, { recursive: true, force: true });

// Разбор: блок ошибки = строка «путь:строка: error: …» и следующие строки до следующей такой.
const blocks = [];
for (const line of log.split('\n')) {
  if (/^\S.*\.java:\d+: (error|ошибка):/.test(line)) blocks.push([line]);
  else if (blocks.length && !/^\d+ (errors?|ошиб)/.test(line)) blocks[blocks.length - 1].push(line);
}
function external(b) {
  const head = b[0], body = b.join('\n');
  const fm = head.match(/^(\S+\.java):(\d+):/); const file = fm ? fm[1] : '', line = fm ? +fm[2] : 0;
  let m = head.match(/package (\S+) does not exist/);
  if (m) return EXT.test(m[1]) || (!m[1].includes('.') && (m[1] === 'R' || extType(m[1]))); // Build.VERSION, Manifest.permission, R.drawable…
  if (/does not override or implement a method from a supertype/.test(head)) return extType(enclosing(file, line));
  if (/cannot find symbol/.test(head) && /symbol:\s+(method \w+|variable super)/.test(body)) {
    const loc = (body.match(/location:\s+(?:class|interface)\s+([\w.$]+)/) || body.match(/location:\s+variable \S+ of type\s+([\w.$]+)/) || [])[1];
    if (loc && extType(loc)) return true;               // метод, унаследованный от класса SDK
  }
  if (/cannot find symbol|не удается найти символ/.test(head)) {
    m = body.match(/symbol:\s+(class|variable|method)\s+([A-Za-z_$][\w$]*)/);
    const loc = (body.match(/location:\s+(?:package|class|interface|variable \S+ of type)\s+(\S+)/) || [])[1] || '';
    if (EXT.test(loc)) return true;                       // символ из внешнего пакета
    if (m && m[1] === 'class' && !own.has(m[2])) return true; // неизвестный класс не из наших файлов (импорт из SDK)
    if (m && /^[A-Z]/.test(m[2]) && !own.has(m[2]) && m[1] === 'variable') return true; // Build, Manifest… без импорта класса
    return false;
  }
  if (/static import only from classes and interfaces/.test(head)) return true;
  return false;
}
const real = blocks.filter((b) => !external(b));
const skipped = blocks.length - real.length;
if (real.length) {
  console.log(`android-check: ✗ ${real.length} ошибок в своём коде (отброшено как «нет SDK»: ${skipped}), файлов ${files.length}`);
  for (const b of real) console.log(b.join('\n').replace(root + '/', ''));
  process.exit(1);
}
console.log(`android-check: ✓ ошибок в своём коде нет (файлов ${files.length}; отброшено как «нет SDK»: ${skipped})`);
