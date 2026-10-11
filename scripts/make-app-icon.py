"""Regenerate desktop/build/icon.icns and icon.png from desktop/build/icon-source.jpg.

Run by hand after changing the source artwork; needs Pillow (`pip install pillow`) and macOS's
`iconutil`:

    python3 scripts/make-app-icon.py && iconutil -c icns desktop/build/herdr-bot.iconset -o desktop/build/icon.icns

The source is a flat black canvas with the white ram-head glyph placed off-centre inside it and a
wide margin of bare black all around. `L, T, R, B` is a square crop centred on the glyph's own
bounding box (found by scanning for the brightness bbox) with roughly a 12% margin on each side --
the glyph fills the same ~80% of the final badge as the previous artwork did. `RADIUS`/`INSET` are
scaled from that crop's size using the same ratios the previous artwork used; re-measure both the
bbox and the ratios if the source image changes.

A too-thin INSET here previously left a fringe of the photographed backdrop visible once the icon
was actually rendered by Finder/Dock at smaller sizes -- each mip level halves the inset in device
pixels, so a couple of px at 1024 can vanish entirely by 16x16, and the leftover ring survives
resampling as a hard-edged sliver of the wrong colour rather than smoothly disappearing. INSET is
now large enough (~1% of the crop) to hold up at every size, and the mask itself is feathered a
couple of px so what edge remains blends to transparent instead of ending on a hard boundary.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent.parent / "desktop" / "build"
SRC = HERE / "icon-source.jpg"
ISET = HERE / "herdr-bot.iconset"
L, T, R, B = 323, 274, 1179, 1130         # right/bottom exclusive
RADIUS = 134
INSET = 10                                 # eat the anti-aliased rim AND survive downscaling to 16x16
FEATHER = 3                               # px, blur the mask edge so it fades rather than cuts
CANVAS = 1024
BODY = 824                                # Apple's macOS icon grid: 100px margin each side

art = Image.open(SRC).convert("RGB").crop((L, T, R, B))
side = max(art.size)
square = Image.new("RGB", (side, side))
square.paste(art, ((side - art.width) // 2, (side - art.height) // 2))

# Rounded-rect alpha at 4x, feathered, then downsampled -- smoother corners than a 1x draw.
SS = 4
mask = Image.new("L", (side * SS, side * SS), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    (INSET * SS, INSET * SS, (side - INSET) * SS - 1, (side - INSET) * SS - 1),
    radius=RADIUS * SS, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(FEATHER * SS))
mask = mask.resize((side, side), Image.LANCZOS)

body = square.convert("RGBA")
body.putalpha(mask)
body = body.resize((BODY, BODY), Image.LANCZOS)

icon = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
icon.paste(body, ((CANVAS - BODY) // 2, (CANVAS - BODY) // 2), body)
icon.save(HERE / "icon.png")
ISET.mkdir(exist_ok=True)
print("wrote", HERE / "icon.png", icon.size, "body", BODY)

for name, size in [("icon_16x16", 16), ("icon_16x16@2x", 32), ("icon_32x32", 32), ("icon_32x32@2x", 64),
                   ("icon_128x128", 128), ("icon_128x128@2x", 256), ("icon_256x256", 256),
                   ("icon_256x256@2x", 512), ("icon_512x512", 512), ("icon_512x512@2x", 1024)]:
    icon.resize((size, size), Image.LANCZOS).save(ISET / f"{name}.png")
