from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path('/app/frontend/assets/images')
names = ['mascot_welcome', 'mascot_box', 'mascot_happy', 'mascot_sad']

for name in names:
    p = OUT / f'{name}.png'
    img = Image.open(p).convert('RGB')
    w, h = img.size
    fill = (255, 0, 255)
    ImageDraw.floodfill(img, (1, 1), fill, thresh=60)
    ImageDraw.floodfill(img, (w - 2, 1), fill, thresh=60)
    ImageDraw.floodfill(img, (1, h - 2), fill, thresh=60)
    ImageDraw.floodfill(img, (w - 2, h - 2), fill, thresh=60)
    rgba = img.convert('RGBA')
    px = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if (r, g, b) == fill:
                px[x, y] = (0, 0, 0, 0)
    rgba.save(p)
    print('done', name)
