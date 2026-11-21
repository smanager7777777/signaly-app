// СИГНАЛЫ — сборка: dist/editor.html (редактор одним файлом), dist/stand.html (стенд телефонов, П24) и dist/www/index.html (приложение игрока).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = process.env.SG_VERSION_NAME || pkg.version;
const stamp = `${version} (${new Date().toISOString().slice(0, 10)})`;

function inline(htmlPath, extra = '') {
  const dir = dirname(htmlPath);
  let html = readFileSync(htmlPath, 'utf8');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
    `<style>\n${readFileSync(resolve(dir, href), 'utf8')}\n</style>`);
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
    `<script>\n${readFileSync(resolve(dir, src), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);
  html = html.replace(/<script>window\.SG_PLAYER_URL[^<]*<\/script>/, () => extra);
  return html.replace('</head>', `<meta name="generator" content="signaly-app ${stamp}">\n<script>window.SG_APP_VERSION = ${JSON.stringify(stamp)};</script>\n</head>`);
}

mkdirSync(resolve(root, 'dist/www'), { recursive: true });
const player = inline(resolve(root, 'src/player/index.html'));
writeFileSync(resolve(root, 'dist/www/index.html'), player);
for (const f of ['icon.png']) {
  const src = resolve(root, 'assets', f);
  if (existsSync(src)) copyFileSync(src, resolve(root, 'dist/www', f));
}

const playerJs = JSON.stringify(player).replace(/<\//g, '<\\/');
const editor = inline(resolve(root, 'src/editor/editor.html'),
  `<script>window.SG_PLAYER_HTML = ${playerJs};</script>`);
writeFileSync(resolve(root, 'dist/editor.html'), editor);
// П24 (Т22-2 А): стенд из 10 «телефонов» в Chrome — то же приложение игрока внутри, своё хранилище у каждого
const stand = inline(resolve(root, 'src/stand/stand.html'), `<script>window.SG_PLAYER_HTML = ${playerJs};</script>`);
writeFileSync(resolve(root, 'dist/stand.html'), stand);
console.log('dist/editor.html', (editor.length / 1024).toFixed(0), 'КБ; dist/stand.html', (stand.length / 1024).toFixed(0), 'КБ; dist/www/index.html', (player.length / 1024).toFixed(0), 'КБ; версия', stamp);
