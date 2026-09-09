"""Regenerate desktop/build/icon.icns and icon.png from desktop/build/icon-source.jpg.

Run by hand after changing the source artwork; needs Pillow (`pip install pillow`) and macOS's
`iconutil`:

    python3 scripts/make-app-icon.py && iconutil -c icns desktop/build/herdr-bot.iconset -o desktop/build/icon.icns


The source is the artwork's rounded square sitting on a backdrop with a wide outer margin.
The constants below are the square's measured edges and corner radius -- found by scanning
in from all four sides for the strongest luminance step. Re-measure if the source changes.
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent.parent / "desktop" / "build"
SRC = HERE / "icon-source.jpg"
ISET = HERE / "herdr-bot.iconset"
L, T, R, B = 79, 51, 1343, 1317          # right/bottom exclusive
RADIUS = 198
INSET = 2                                 # eat the anti-aliased rim so no backdrop survives
CANVAS = 1024
BODY = 824                                # Apple's macOS icon grid: 100px margin each side

art = Image.open(SRC).convert("RGB").crop((L, T, R, B))
side = max(art.size)
square = Image.new("RGB", (side, side))
square.paste(art, ((side - art.width) // 2, (side - art.height) // 2))

# Rounded-rect alpha at 4x, then downsampled -- smoother corners than a 1x draw.
SS = 4
mask = Image.new("L", (side * SS, side * SS), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    (INSET * SS, INSET * SS, (side - INSET) * SS - 1, (side - INSET) * SS - 1),
    radius=RADIUS * SS, fill=255)
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
