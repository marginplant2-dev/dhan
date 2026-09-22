"""
Regenerate every DhanFunded brand asset from the two source artworks.

    python client/scripts/gen-brand-assets.py        (run from the repo root)

Sources (the only files to replace when the logo changes):
    client/public/brand/source/dhanfunded-wordmark.png  wide "DHAN FUNDED" lockup
    client/public/brand/source/dhanfunded-icon.png      rounded app icon

Everything else — favicons, PWA icons, the navbar wordmarks, the email mark and
the OG card — is derived here, so the brand only ever has one source of truth.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "client" / "public"
ASSETS = ROOT / "client" / "src" / "assets"
SRC = PUB / "brand" / "source"

NAVY = (10, 23, 40)          # --df-surface — the logo's own backdrop
NAVY_DEEP = (5, 13, 26)      # --df-bg

# Bright art vs. dark backdrop: luminance drives the alpha, so the wordmark
# lifts off its JPEG background without a manual mask.
def cutout(img, lo=70, hi=120):
    a = img.convert("L").point(
        lambda v: 0 if v < lo else (255 if v > hi else int((v - lo) * 255 / (hi - lo)))
    )
    out = img.convert("RGBA")
    out.putalpha(a)
    return out


def rounded(img, ratio=0.22):
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, img.width - 1, img.height - 1], radius=int(min(img.size) * ratio), fill=255
    )
    img.putalpha(mask)
    return img


def tinted(cut, rgb):
    """Same shape, flat colour — the wordmark cut for light surfaces."""
    solid = Image.new("RGBA", cut.size, rgb + (255,))
    solid.putalpha(cut.getchannel("A"))
    return solid


icon = rounded(Image.open(SRC / "dhanfunded-icon.png").convert("RGB").crop((116, 120, 1136, 1117)))

# The wordmark artwork, cropped tight to the lettering + swoosh + arrow (the
# bounds were measured off the source: bright content runs x 157-1255,
# y 166-518). A tight crop matters — the logo is nearly always sized by height,
# so every row of empty backdrop shrinks the lettering.
WORDMARK = Image.open(SRC / "dhanfunded-wordmark.png").convert("RGB").crop((145, 158, 1268, 528))


def lockup(h=320, on_light=False):
    """The wide wordmark.

    Dark surfaces get the art cut out of its navy backdrop, so it drops onto any
    dark background with no plate behind it. On a white card that cut falls
    apart — the metallic letters are dark inside and the silver disappears — so
    there the artwork keeps its own navy, padded into a rounded badge.
    """
    if on_light:
        pad = int(WORDMARK.height * 0.14)
        card = Image.new("RGB", (WORDMARK.width + pad * 2, WORDMARK.height + pad * 2), NAVY)
        card.paste(WORDMARK, (pad, pad))
        art = rounded(card, 0.14)
    else:
        art = cutout(WORDMARK, 120, 180)
    return art.resize((int(art.width * h / art.height), h), Image.LANCZOS)


def email_banner(w=1200, h=400):
    """Wide header image for the welcome email — plaque on the brand navy."""
    card = Image.new("RGBA", (w, h), NAVY + (255,))
    art = lockup(int(h * 0.62))
    card.alpha_composite(art, ((w - art.width) // 2, (h - art.height) // 2))
    return card.convert("RGB")


# The mark is a "Dh" lettermark in the logo's arrow gradient, on nothing — no
# tile, no plate. Any heavy sans works; these are the ones Windows ships.
FONTS = ["C:/Windows/Fonts/seguibl.ttf", "C:/Windows/Fonts/arialbd.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]


def _font(px):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, px)
    raise SystemExit("No heavy sans font found — add one to FONTS.")


def lettermark(size=512, text="Dh", bg=None):
    """Brand gradient poured through the letters. bg fills the square behind
    them — only for home-screen icons, which cannot be transparent."""
    grad = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(grad)
    for i in range(size):                      # green low-left → cyan top-right
        k = i / max(size - 1, 1)
        d.line([(0, size - i), (i, size)],
               fill=(int(31 + (34 - 31) * k), int(216 + (217 - 216) * k), int(122 + (232 - 122) * k)))
    for i in range(size):
        k = i / max(size - 1, 1)
        d.line([(i, 0), (size, size - i)],
               fill=(int(31 + (34 - 31) * k), int(216 + (217 - 216) * k), int(122 + (232 - 122) * k)))

    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    font = _font(int(size * 0.58))
    box = md.textbbox((0, 0), text, font=font)
    md.text(((size - (box[2] - box[0])) / 2 - box[0], (size - (box[3] - box[1])) / 2 - box[1]),
            text, font=font, fill=255)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if bg:
        ImageDraw.Draw(out).rounded_rectangle([0, 0, size - 1, size - 1],
                                              radius=int(size * 0.22), fill=bg + (255,))
    letters = grad.convert("RGBA")
    letters.putalpha(mask)
    out.alpha_composite(letters)
    return out


def square(size):
    return icon.resize((size, size), Image.LANCZOS)


def og_card():
    """1200x630 social card: brand gradient, lockup, one line of copy."""
    w, h = 1200, 630
    card = Image.new("RGB", (w, h), NAVY_DEEP)
    d = ImageDraw.Draw(card)
    for y in range(h):                                   # vertical navy wash
        k = y / h
        d.line([(0, y), (w, y)], fill=(
            int(NAVY_DEEP[0] + (NAVY[0] - NAVY_DEEP[0]) * k),
            int(NAVY_DEEP[1] + (NAVY[1] - NAVY_DEEP[1]) * k),
            int(NAVY_DEEP[2] + (NAVY[2] - NAVY_DEEP[2]) * k),
        ))
    for x in range(0, w, 40):                            # the logo's dot grid
        for y in range(0, h, 40):
            d.point((x, y), fill=(28, 58, 86))
    lock = lockup(230)
    card.paste(lock, ((w - lock.width) // 2, (h - lock.height) // 2), lock)
    return card


TARGETS = [
    # Browser tabs and in-page marks: letters only, transparent.
    (PUB / "favicon-32.png", lettermark(32)),
    (PUB / "favicon.png", lettermark(512)),
    (PUB / "brand" / "logo-mark-v2.png", lettermark(512)),     # email header mark
    (PUB / "brand" / "email-logo.png", lettermark(512)),
    (PUB / "brand" / "dhanfunded-mark.png", lettermark(512)),
    (ASSETS / "dhanfunded-mark.png", lettermark(512)),
    # Home-screen icons: a transparent PNG renders on black (iOS) or gets a
    # generated plate (Android maskable), so these keep the brand navy.
    (PUB / "icon-192.png", lettermark(192, bg=NAVY)),
    (PUB / "icon-512.png", lettermark(512, bg=NAVY)),
    (PUB / "apple-touch-icon.png", lettermark(180, bg=NAVY)),
    (PUB / "brand" / "dhanfunded-wordmark.png", lockup()),
    (PUB / "brand" / "dhanfunded-wordmark-dark.png", lockup()),
    (PUB / "brand" / "email-banner.png", email_banner()),
    (ASSETS / "dhanfunded-wordmark.png", lockup()),
    (ASSETS / "dhanfunded-wordmark-dark.png", lockup()),
    (ASSETS / "dhanfunded-wordmark-onlight.png", lockup(on_light=True)),
    (PUB / "landing" / "img" / "dhanfunded-og.png", og_card()),
]

if __name__ == "__main__":
    for path, img in TARGETS:
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        print(f"wrote {path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}")
    lettermark(48).save(PUB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote {(PUB / 'favicon.ico').relative_to(ROOT)}")
