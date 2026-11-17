// СИГНАЛЫ — проба связи терминала с телефонами (сессия П7): собирает
//   dist/terminal-probe.html — страница для Chrome на ноутбуке (двойной щелчок);
//   dist/terminal-probe.twee — то же для «Twine СИГНАЛЫ» (Библиотека → Импорт), в «JavaScript истории» — модуль сети.
// node tools/build-term.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const net = readFileSync(resolve(root, 'src/terminal/sg-term-net.js'), 'utf8');
const jsqr = readFileSync(require.resolve('jsqr/dist/jsQR.js'), 'utf8');
mkdirSync(resolve(root, 'dist'), { recursive: true });
const js = '/* jsQR 1.4.0 — Apache-2.0, github.com/cozmo/jsQR */\n' + jsqr + '\n' + net;

const page = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>СИГНАЛЫ — проба связи терминала</title>
<style>body{background:#000;color:#3f3;font:20px monospace;padding:40px}button{background:#000;color:#3f3;border:2px solid #3f3;font:22px monospace;padding:12px 24px;margin:8px 8px 8px 0;cursor:pointer}button:hover{background:#030}#v{font-size:64px}</style>
</head><body>
<h2>ПРОБА СВЯЗИ: ТЕРМИНАЛ → ТЕЛЕФОНЫ</h2>
<p>1. Ноутбук — в точке доступа телефона мастера. 2. «СЕТЬ» (или Ctrl+Shift+N) → адрес с пульта мастера, QR камерой или «НАЙТИ».</p>
<p>ЗНАЧЕНИЕ: <span id="v">0</span></p>
<button id="plus">+1 И ОТПРАВИТЬ ИГРОКАМ</button><button id="net">СЕТЬ</button>
<p id="s"></p>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
<script>
var v = 0; try { v = +localStorage.getItem('sg-probe') || 0; } catch (e) {}
var out = document.getElementById('v'), s = document.getElementById('s');
out.textContent = v;
document.getElementById('plus').onclick = function () {
  v++; try { localStorage.setItem('sg-probe', v); } catch (e) {}
  out.textContent = v;
  SgTermNet.notify('ТЕРМИНАЛ', 'Значение переменной: ' + v);
};
document.getElementById('net').onclick = function () { SgTermNet.panel(); };
function paint() { s.textContent = SgTermNet.on ? '● В СЕТИ: ' + SgTermNet.url : '○ нет связи с центром' + (SgTermNet.url ? ' (' + SgTermNet.url + ')' : ''); }
SgTermNet.listen(function (t, o) { paint(); if (t === 'vars' && o.sgProbe !== undefined) { v = +o.sgProbe || 0; out.textContent = v; } });
paint();
</script>
</body></html>
`;
writeFileSync(resolve(root, 'dist/terminal-probe.html'), page);

const twee = `:: StoryTitle
СИГНАЛЫ — проба связи терминала


:: StoryData
{
  "ifid": "5C2E7A10-4B1D-4E8A-9F61-7D3B2A9C0E14",
  "format": "SugarCube",
  "format-version": "2.37.3",
  "start": "Start"
}


:: StoryInit
<<set $sgProbe to 0>>


:: Start
ПРОБА СВЯЗИ: ТЕРМИНАЛ → ТЕЛЕФОНЫ

Ноутбук — в точке доступа телефона мастера. «СЕТЬ» (или Ctrl+Shift+N): адрес с пульта мастера, QR камерой или «НАЙТИ».

ЗНАЧЕНИЕ: <span class="sg-value"><<= $sgProbe>></span>

<<button "+1 И ОТПРАВИТЬ ИГРОКАМ">><<set $sgProbe to $sgProbe + 1>><<sg-net-notify "ТЕРМИНАЛ" \`"Значение переменной: " + $sgProbe\`>><<goto "Start">><</button>>
<<button "СЕТЬ">><<sg-net-panel>><</button>>


:: Story JavaScript [script]
${js}
`;
writeFileSync(resolve(root, 'dist/terminal-probe.twee'), twee);
console.log('dist/terminal-probe.html, dist/terminal-probe.twee');
