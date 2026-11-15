// Делает видео .y4m с QR-кодом для поддельной камеры Chromium:
// node tests/make-qr-video.mjs <код> <выход.y4m>
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');
const [code, out] = process.argv.slice(2);
const q = qrcode(0, 'M');
q.addData(code);
q.make();
const n = q.getModuleCount(), cell = 8, margin = 4, size = (n + margin * 2) * cell;
// PGM (серый) → ffmpeg → y4m 640×480
let pix = Buffer.alloc(size * size, 255);
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c))
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++)
    pix[((r + margin) * cell + y) * size + (c + margin) * cell + x] = 0;
const pgm = out.replace(/\.y4m$/, '.pgm');
writeFileSync(pgm, Buffer.concat([Buffer.from(`P5 ${size} ${size} 255\n`), pix]));
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', pgm, '-t', '4', '-r', '10',
  '-vf', 'scale=360:360,pad=640:480:140:60:white', '-pix_fmt', 'yuv420p', out]);
console.log('готово', out);
