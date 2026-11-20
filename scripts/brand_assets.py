"""Derive brand assets from brand/vtl-logo.png.

- vtl-logo-white.png: navy wordmark recoloured to white, orange kept (for navy backgrounds)
- vtl-mark.png: the "VTL" mark only (cropped at the gap before the wordmark)
- favicon-32.png, favicon-16.png, apple-touch-icon.png (180), icon-192.png, icon-512.png, favicon.ico
"""
from PIL import Image
import colorsys, os, sys

SRC = 'brand/vtl-logo.png'
OUT = 'brand'
im = Image.open(SRC).convert('RGBA')
w, h = im.size

def is_orange(r, g, b):
    hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return s > 0.45 and v > 0.45 and (hh < 0.1 or hh > 0.95)

white = Image.new('RGBA', im.size)
px = im.load(); wp = white.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a == 0:
            wp[x, y] = (0, 0, 0, 0)
        elif is_orange(r, g, b):
            wp[x, y] = (r, g, b, a)
        else:
            wp[x, y] = (255, 255, 255, a)
white.save(f'{OUT}/vtl-logo-white.png', optimize=True)

# Mark: find first fully transparent column gap after x>100
cols = [any(px[x, y][3] > 40 for y in range(h)) for x in range(w)]
cut = next(x for x in range(100, w) if not cols[x])
mark = im.crop((0, 0, cut, h))
bbox = mark.getbbox(); mark = mark.crop(bbox)
mark.save(f'{OUT}/vtl-mark.png', optimize=True)

def square(img, size, pad_ratio=0.12, bg=(255, 255, 255, 255)):
    canvas = Image.new('RGBA', (size, size), bg)
    inner = int(size * (1 - 2 * pad_ratio))
    ratio = min(inner / img.width, inner / img.height)
    r = img.resize((max(1, int(img.width * ratio)), max(1, int(img.height * ratio))), Image.LANCZOS)
    canvas.paste(r, ((size - r.width) // 2, (size - r.height) // 2), r)
    return canvas

for size, name in [(16, 'favicon-16.png'), (32, 'favicon-32.png'), (180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    square(mark, size, 0.06 if size <= 32 else 0.12).save(f'{OUT}/{name}', optimize=True)
square(mark, 64, 0.06).save(f'{OUT}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print('brand assets written; mark width', cut)
