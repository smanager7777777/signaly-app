# СИГНАЛЫ — иконка и заставка Android (чёрно-зелёные). python3 tools/make-icons.py
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android/app/src/main/res')
BG = (3, 8, 3)
FG = (51, 255, 102)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'


def signal(size, scale=1.0, bg=True):
    """Сигнал: точка и три дуги, со свечением. scale — доля холста под рисунок."""
    S = size * 4
    im = Image.new('RGBA', (S, S), BG + (255,) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S / 2
    u = S * scale / 2
    cy = c + u * 0.45
    r0 = u * 0.13
    d.ellipse([c - r0, cy - r0, c + r0, cy + r0], fill=FG)
    w = max(4, int(u * 0.11))
    for k in (0.42, 0.68, 0.94):
        R = u * k
        d.arc([c - R, cy - R, c + R, cy + R], 225, 315, fill=FG, width=w)
    glow = im.filter(ImageFilter.GaussianBlur(S * 0.02))
    out = Image.alpha_composite(glow, im)
    return out.resize((size, size), Image.LANCZOS)


def main():
    legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for dens, px in legacy.items():
        icon = signal(px, 0.78)
        icon.convert('RGB').save(f'{RES}/mipmap-{dens}/ic_launcher.png')
        mask = Image.new('L', (px * 4, px * 4), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, px * 4 - 1, px * 4 - 1], fill=255)
        rnd = icon.copy()
        rnd.putalpha(mask.resize((px, px), Image.LANCZOS))
        rnd.save(f'{RES}/mipmap-{dens}/ic_launcher_round.png')
        # адаптивная иконка: 108dp, видимая часть — центральные 66dp
        fg = signal(int(px * 108 / 48), 0.5, bg=False)
        fg.save(f'{RES}/mipmap-{dens}/ic_launcher_foreground.png')
    with open(f'{RES}/values/ic_launcher_background.xml', 'w') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#030803</color>\n</resources>\n')
    # заставки
    for root, dirs, files in os.walk(RES):
        if 'splash.png' not in files:
            continue
        p = os.path.join(root, 'splash.png')
        w, h = Image.open(p).size
        im = Image.new('RGB', (w, h), BG)
        m = min(w, h)
        ic = signal(int(m * 0.35), 0.9)
        im.paste(ic, ((w - ic.width) // 2, int(h / 2 - ic.height * 0.8)))
        d = ImageDraw.Draw(im)
        font = ImageFont.truetype(FONT, max(12, int(m * 0.075)))
        text = 'С И Г Н А Л Ы'
        tw = d.textlength(text, font=font)
        d.text(((w - tw) / 2, h / 2 + m * 0.08), text, font=font, fill=FG)
        im.save(p)
    os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
    signal(512, 0.78).convert('RGB').save(os.path.join(ROOT, 'assets/icon.png'))
    print('иконки и заставки готовы')


main()
