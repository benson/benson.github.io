#!/usr/bin/env python3
"""build a sampled contact sheet from a folder of frames, for quick review.
  python3 contact_sheet.py <folder> <out.jpg> <cols> <n_thumbs>
"""
import sys, os, glob
from PIL import Image, ImageDraw

folder, out, cols, n = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
files = sorted(glob.glob(os.path.join(folder, "*.jpg")))
total = len(files)
if total > n:
    step = total / n
    files = [files[int(i * step)] for i in range(n)]
tw, th = 300, 186
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * th), "white")
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((tw, th))
    x, y = (i % cols) * tw, (i // cols) * th
    sheet.paste(im, (x, y))
    lbl = os.path.basename(f).replace(".jpg", "").lstrip("0")
    d.rectangle([x, y, x + 42, y + 14], fill="black")
    d.text((x + 2, y + 2), lbl, fill="yellow")
sheet.save(out)
print(f"wrote {out}: {len(files)} of {total} frames")
