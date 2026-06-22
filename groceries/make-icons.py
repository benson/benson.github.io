# regenerates the PWA icons from the same design as icon.svg
# run:  python make-icons.py
from PIL import Image, ImageDraw

S = 4               # supersample factor for antialiasing
N = 512 * S
ACCENT = (63, 125, 92, 255)
CREAM = (250, 250, 248, 255)
W = 24 * S          # stroke width
R = W // 2          # round-cap radius

img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def sc(*pts):
    return [c * S for c in pts]

def cap(x, y):
    d.ellipse(sc(x - R / S, y - R / S, x + R / S, y + R / S), fill=CREAM)

# background
d.rounded_rectangle(sc(0, 0, 512, 512), radius=116 * S, fill=ACCENT)

# bag handle (top arch + two short verticals)
d.arc(sc(198, 144, 314, 260), 180, 360, fill=CREAM, width=W)
d.line(sc(198, 216, 198, 202), fill=CREAM, width=W)
d.line(sc(314, 216, 314, 202), fill=CREAM, width=W)

# bag body
d.rounded_rectangle(sc(158, 216, 354, 404), radius=24 * S, outline=CREAM, width=W)

# check mark
d.line(sc(212, 308, 240, 338, 300, 272), fill=CREAM, width=W, joint="curve")
cap(212, 308)
cap(240, 338)
cap(300, 272)

for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "icon-180.png")]:
    img.resize((size, size), Image.LANCZOS).save(name)
    print("wrote", name)
