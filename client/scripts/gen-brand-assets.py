"""
Regenerate every DhanFunded brand asset from one source artwork.

    python client/scripts/gen-brand-assets.py        (run from the repo root)

Source (the only file to replace when the logo changes):
    client/public/brand/source/dhanfunded-logo-v2.png

It holds both pieces side by side: the horizontal lockup (mark + DHAN FUNDED +
"TRADE · LEARN · GROW") on the left, and the square app tile on the right.
Everything else — favicons, PWA icons, the navbar wordmarks, the email header
and the OG card — is cut from it here, so the brand has one source of truth.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "client" / "public"
ASSETS = ROOT / "client" / "src" / "assets"
SRC = PUB / "brand" / "source"

NAVY = (10, 33, 48)          # --pf-card, the site's surface
NAVY_DEEP = (5, 19, 27)      # --pf-bg
SILVER = (234, 245, 239)     # --pf-text

# Measured off the source: the lockup and the app tile, tight to their artwork.
LOCKUP_BOX = (60, 285, 1295, 625)
TILE_BOX = (1339, 260, 1705, 626)

logo = Image.open(SRC / "dhanfunded-logo-v2.png").convert("RGBA")


def _on_white(img):
    """Flatten onto white — the artwork is drawn for a white page."""
    out = Image.new("RGB", img.size, (255, 255, 255))
    out.paste(img, (0, 0), img)
    return out


def dewhite(img, cut=238):
    """White page → transparent, with a soft edge so the art keeps its
    anti-aliasing instead of turning into a jagged cut-out."""
    flat = _on_white(img)
    px = flat.load()
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    op = out.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b = px[x, y]
            m = max(r, g, b)
            if m >= 252 and min(r, g, b) >= 248:
                continue                       # page white
            # How far this pixel is from white drives the alpha, so the edges
            # fade out the way they were drawn.
            a = 255 - int(min(r, g, b) * 255 / 255) if m > cut else 255
            op[x, y] = (r, g, b, 255 if m <= cut else max(a, 0))
    return out


def for_dark(img):
    """The lockup reversed out for dark surfaces: the navy lettering becomes
    the site's silver, the green half and the gold wedge stay as drawn."""
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # Navy ink: dark, and never greener than it is blue.
            if max(r, g, b) < 150 and g <= b + 24:
                k = 1 - max(r, g, b) / 150          # deepest navy → brightest
                px[x, y] = (
                    int(r + (SILVER[0] - r) * k),
                    int(g + (SILVER[1] - g) * k),
                    int(b + (SILVER[2] - b) * k),
                    a,
                )
    return out


def sized(img, h):
    return img.resize((max(1, int(img.width * h / img.height)), h), Image.LANCZOS)


def square(img, size):
    return img.resize((size, size), Image.LANCZOS)


LOCKUP_LIGHT = dewhite(logo.crop(LOCKUP_BOX))       # navy + green, for white
LOCKUP_DARK = for_dark(LOCKUP_LIGHT)                # silver + green, for navy
TILE = logo.crop(TILE_BOX)                          # the app tile, as drawn


def email_banner(w=1200, h=400):
    """Header image for the welcome email — the lockup on white, like a page."""
    card = Image.new("RGB", (w, h), (255, 255, 255))
    art = sized(LOCKUP_LIGHT, int(h * 0.46))
    card.paste(art, ((w - art.width) // 2, (h - art.height) // 2), art)
    return card


def og_card(w=1200, h=630):
    """Social card: the reversed lockup on the site's navy, with its dot grid."""
    card = Image.new("RGB", (w, h), NAVY_DEEP)
    d = ImageDraw.Draw(card)
    for y in range(h):
        k = y / h
        d.line([(0, y), (w, y)], fill=tuple(
            int(NAVY_DEEP[i] + (NAVY[i] - NAVY_DEEP[i]) * k) for i in range(3)))
    for x in range(0, w, 40):
        for y in range(0, h, 40):
            d.point((x, y), fill=(26, 66, 58))
    art = sized(LOCKUP_DARK, 200)
    card.paste(art, ((w - art.width) // 2, (h - art.height) // 2), art)
    return card


TARGETS = [
    # Tabs, home screens and in-page marks all use the tile as drawn: it is
    # self-contained, so it reads on a light or a dark surface.
    (PUB / "favicon-32.png", square(TILE, 32)),
    (PUB / "favicon.png", square(TILE, 512)),
    (PUB / "icon-192.png", square(TILE, 192)),
    (PUB / "icon-512.png", square(TILE, 512)),
    (PUB / "apple-touch-icon.png", square(TILE, 180)),
    (PUB / "brand" / "logo-mark-v2.png", square(TILE, 512)),   # email header mark
    (PUB / "brand" / "email-logo.png", square(TILE, 512)),
    (PUB / "brand" / "dhanfunded-mark.png", square(TILE, 512)),
    (ASSETS / "dhanfunded-mark.png", square(TILE, 512)),
    # Wordmarks: the light cut for white surfaces, the reversed cut for dark.
    (PUB / "brand" / "dhanfunded-wordmark.png", sized(LOCKUP_LIGHT, 320)),
    (PUB / "brand" / "dhanfunded-wordmark-dark.png", sized(LOCKUP_DARK, 320)),
    (ASSETS / "dhanfunded-wordmark.png", sized(LOCKUP_LIGHT, 320)),
    (ASSETS / "dhanfunded-wordmark-onlight.png", sized(LOCKUP_LIGHT, 320)),
    (ASSETS / "dhanfunded-wordmark-dark.png", sized(LOCKUP_DARK, 320)),
    (PUB / "brand" / "email-banner.png", email_banner()),
    (PUB / "landing" / "img" / "dhanfunded-og.png", og_card()),
]

if __name__ == "__main__":
    for path, img in TARGETS:
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        print(f"wrote {path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}")
    square(TILE, 48).save(PUB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote {(PUB / 'favicon.ico').relative_to(ROOT)}")
