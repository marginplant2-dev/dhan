"""
Build the dashboard hero banner.

    python client/scripts/gen-hero-banner.py     (run from the repo root)

Why this exists rather than shipping the pack's banner PNG: that file has the
headline, the nav bar and the logo painted into it. Used behind live text it
showed through as ghost lettering, and it could never wrap or translate. So the
only thing taken from it is the bull; the candle field and the navy are drawn
here, and the words stay in HTML.

Output (WebP, both @2x for retina):
    client/public/brand/hero-desktop.webp   2400x560
    client/public/brand/hero-mobile.webp    1080x620
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "DhanFunded_Modern_UI_Brand_Pack" / "01_dashboard_desktop.png"
OUT = ROOT / "client" / "public" / "brand"

NAVY_DEEP = (4, 16, 38)
NAVY = (6, 47, 103)
TEAL = (22, 199, 154)
RED = (214, 69, 84)

# The bull, clear of every piece of baked-in text in the source render.
BULL_BOX = (880, 74, 1288, 412)


def gradient(size, left, right):
    """Horizontal navy wash."""
    w, h = size
    img = Image.new("RGB", (w, 1))
    px = img.load()
    for x in range(w):
        k = x / max(w - 1, 1)
        px[x, 0] = tuple(int(left[i] + (right[i] - left[i]) * k) for i in range(3))
    return img.resize(size, Image.BILINEAR)


def candles(size, seed=7, count=54, glow=True):
    """A candle field, drawn — never cropped out of someone else's banner."""
    w, h = size
    layer = Image.new("RGB", size, (0, 0, 0))
    d = ImageDraw.Draw(layer)
    rnd = random.Random(seed)

    step = w / count
    mid = h * 0.58
    for i in range(count):
        x = i * step + step * 0.25
        bw = max(3, step * 0.42)
        # a drifting walk, so the field reads as a chart rather than noise
        drift = math.sin(i / 6.5) * h * 0.14 + math.sin(i / 2.1) * h * 0.05
        body = rnd.uniform(h * 0.06, h * 0.26)
        top = mid + drift - body / 2
        up = rnd.random() > 0.34
        colour = TEAL if up else RED
        wick = rnd.uniform(h * 0.04, h * 0.12)
        d.rectangle([x + bw / 2 - 1, top - wick, x + bw / 2 + 1, top + body + wick], fill=colour)
        d.rectangle([x, top, x + bw, top + body], fill=colour)

    if glow:
        layer = layer.filter(ImageFilter.GaussianBlur(1.6))
    return layer


def bull():
    art = Image.open(SRC).convert("RGB").crop(BULL_BOX)
    return art


def feather(size, fade_from=0.0, fade_to=0.45, vertical=False):
    """Alpha that ramps in, so a composited edge has no seam."""
    w, h = size
    n = h if vertical else w
    ramp = Image.new("L", (1, n) if vertical else (n, 1))
    px = ramp.load()
    a, b = int(n * fade_from), int(n * fade_to)
    for i in range(n):
        if i <= a:
            v = 0
        elif i >= b:
            v = 255
        else:
            t = (i - a) / max(b - a, 1)
            v = int(255 * (t * t * (3 - 2 * t)))       # smoothstep
        if vertical:
            px[0, i] = v
        else:
            px[i, 0] = v
    return ramp.resize(size, Image.BILINEAR)


def compose(size, bull_scale, bull_right_pad, text_side_cover):
    w, h = size
    base = gradient(size, NAVY_DEEP, NAVY)

    # candles, dimmed into the navy
    field = candles(size)
    base = Image.blend(base, Image.blend(base, field, 0.55), 0.55)

    # the bull, height-fitted, fading in from its left edge
    art = bull()
    bh = int(h * bull_scale)
    bw = int(art.width * bh / art.height)
    art = art.resize((bw, bh), Image.LANCZOS)
    mask = feather((bw, bh), 0.0, 0.42)
    x = w - bw - bull_right_pad
    y = int((h - bh) / 2)
    base.paste(art, (x, y), mask)

    # darken the side the words sit on so white type always clears contrast
    cover = Image.new("RGB", size, NAVY_DEEP)
    cover_mask = feather(size, text_side_cover[0], text_side_cover[1]).point(lambda v: 255 - v)
    base.paste(cover, (0, 0), cover_mask.point(lambda v: int(v * 0.82)))

    # a soft vignette top and bottom so the band sits into the page
    vign = Image.new("RGB", size, NAVY_DEEP)
    vmask = feather(size, 0.0, 0.12, vertical=True).point(lambda v: 255 - int(v * 0.55))
    base.paste(vign, (0, 0), vmask)
    return base


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)

    desktop = compose((2400, 420), bull_scale=1.18, bull_right_pad=60, text_side_cover=(0.28, 0.62))
    desktop.save(OUT / "hero-desktop.webp", "WEBP", quality=84, method=6)

    mobile = compose((900, 420), bull_scale=1.02, bull_right_pad=-40, text_side_cover=(0.02, 0.66))
    mobile.save(OUT / "hero-mobile.webp", "WEBP", quality=82, method=6)

    for f in ("hero-desktop.webp", "hero-mobile.webp"):
        p = OUT / f
        print(f"{f:22} {Image.open(p).size}  {p.stat().st_size // 1024} KB")
