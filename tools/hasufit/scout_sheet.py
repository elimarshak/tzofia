# For checking only: puts a scouting window's before, after and change side by side with a 500-metre grid,
# so the place of the works can be read off as an offset from the centre.
#   python scout_sheet.py DIR OUT.png
import sys, json
from PIL import Image, ImageDraw
D, OUT = sys.argv[1], sys.argv[2]
m = json.load(open(f"{D}/meta.json")); half = m["grid"]["half_width_m"]; px = m["grid"]["metres_per_pixel"]
S = 2  # each picture pixel drawn 2 x 2
ims = []
for n in ("before", "after", "change"):
    im = Image.open(f"{D}/{n}.png").convert("RGB")
    im = im.resize((im.width * S, im.height * S), Image.NEAREST)
    d = ImageDraw.Draw(im)
    step = int(500 / px * S); c = im.width // 2
    for k in range(-20, 21):
        x = c + k * step
        if 0 <= x < im.width:
            col = (255, 0, 0) if k == 0 else (0, 255, 255)
            d.line((x, 0, x, im.height), fill=col, width=1); d.line((0, x, im.width, x), fill=col, width=1)
            if k % 2 == 0: d.text((x + 2, 2), f"{k*500}", fill=(255, 255, 0)); d.text((2, x + 2), f"{-k*500}", fill=(255, 255, 0))
    d.text((10, im.height - 20), n + " " + (m.get(n, {}).get("datetime", "") or ""), fill=(255, 255, 0))
    ims.append(im)
W = sum(i.width for i in ims) + 20
sheet = Image.new("RGB", (W, ims[0].height), (0, 0, 0)); x = 0
for i in ims: sheet.paste(i, (x, 0)); x += i.width + 10
sheet.save(OUT)
print(OUT, sheet.size)
