# 'חשופית': draws the before/after summary of one point from the files fetch_example.py wrote.
# Output: summary.png (before on the right, after on the left) and summary.gif (the two pictures in turn).
# Every fact printed on the picture comes from those files: the place and its coordinates (OpenStreetMap),
# the satellites, dates and times (the Sentinel-2 catalogue entries), the scale (the 10-metre grid we warped to).
import json, sys, os, datetime as dt
from PIL import Image, ImageDraw, ImageFont, ImageOps

IN, OUT = sys.argv[1], sys.argv[2]
FONT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), "../../web/fonts/Heebo.ttf")
LOGO = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(__file__), "civilpress-logo.webp")   # the site's current header logo
os.makedirs(OUT, exist_ok=True)

meta = json.load(open(f"{IN}/meta.json"))
place = {"lat": meta["centre"]["lat"], "lon": meta["centre"]["lon"], "itm_e": meta["centre"]["itm_e"], "itm_n": meta["centre"]["itm_n"],
         "tags": {"name:he": meta["point"]["title_he"]}}
towns = json.load(open(f"{IN}/places.json")) if os.path.exists(f"{IN}/places.json") else []
G = meta["grid"]

PANEL = 800                                   # each close-up is drawn 800 x 800
M_PER_PX = 2 * G["half_width_m"] / PANEL      # metres per drawn pixel
INSET = 260                                   # the corner square with the wide view
INK, SUB, LINE, PAPER, MARK = "#16222E", "#4A5866", "#D9DEE2", "#FFFFFF", "#D7263D"

def font(size, weight="Regular"):
    f = ImageFont.truetype(FONT, size, layout_engine=ImageFont.Layout.RAQM)
    try: f.set_variation_by_name(weight)
    except Exception: pass
    return f

def rtl(d, xy, text, f, fill=INK, anchor="ra"):
    d.text(xy, text, font=f, fill=fill, anchor=anchor, direction="rtl", language="he")

def ltr(d, xy, text, f, fill=INK, anchor="ra"):
    d.text(xy, text, font=f, fill=fill, anchor=anchor, direction="ltr", language="en")

MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"]
def israel_time(iso):
    t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    try:
        from zoneinfo import ZoneInfo
        t = t.astimezone(ZoneInfo("Asia/Jerusalem"))
    except Exception:
        raise SystemExit("no time-zone data")
    return f"{t.day} ב{MONTHS[t.month - 1]} {t.year}, בשעה {t:%H:%M} לפי שעון ישראל"

SAT_NAME = {"sentinel-2a": "Sentinel-2A", "sentinel-2b": "Sentinel-2B", "sentinel-2c": "Sentinel-2C"}

# the watermark: the CIVILPRESS logo, small, in the centre, at 3 percent opacity
logo = Image.open(LOGO).convert("RGBA")
lw = int(PANEL * 0.22)
logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
alpha = logo.getchannel("A").point(lambda a: round(a * 0.03))
logo.putalpha(alpha)

def north_and_scale(img):
    d = ImageDraw.Draw(img, "RGBA")
    W = img.width
    # plate in the bottom-left corner
    x0, y0, x1, y1 = 16, PANEL - 92, 16 + 250, PANEL - 16
    d.rounded_rectangle((x0, y0, x1, y1), 8, fill=(255, 255, 255, 225))
    # scale bar: 1 kilometre
    # the longest round length that fits in the plate
    metres = next(m for m in (1000, 500, 400, 300, 200, 100, 50) if m / M_PER_PX <= 170)
    km = round(metres / M_PER_PX)
    bx, by = x0 + 16, y1 - 26
    d.rectangle((bx, by, bx + km // 2, by + 8), fill=INK)
    d.rectangle((bx + km // 2, by, bx + km, by + 8), fill=PAPER, outline=INK)
    f = font(17)
    unit = lambda m: "1 ק״מ" if m == 1000 else f"{m:g} מ׳"
    d.text((bx, by - 6), "0", font=f, fill=INK, anchor="mb")
    d.text((bx + km // 2, by - 6), unit(metres / 2), font=f, fill=INK, anchor="mb", direction="rtl", language="he")
    d.text((bx + km, by - 6), unit(metres), font=f, fill=INK, anchor="mb", direction="rtl", language="he")
    # north arrow
    ax, ay = x1 - 34, y0 + 14
    d.polygon([(ax, ay), (ax - 13, ay + 36), (ax, ay + 28), (ax + 13, ay + 36)], fill=INK)
    d.text((ax, ay + 40), "צפון", font=font(16, "Bold"), fill=INK, anchor="ma", direction="rtl", language="he")

def inset(label):
    # the wide view is the same picture in both panels (the 'before' day), so clouds of one day do not hide the map
    wide = Image.open(f"{IN}/before_wide.png").convert("RGB")
    s = INSET / wide.width
    sq = wide.resize((INSET, INSET), Image.LANCZOS)
    d = ImageDraw.Draw(sq, "RGBA")
    # the close-up frame, to scale
    half = G["half_width_m"] / G["wide_metres_per_pixel"] * s
    c = INSET / 2
    d.rectangle((c - half, c - half, c + half, c + half), outline=MARK, width=3)
    # place names from OpenStreetMap, the nearest ones that do not sit on the frame
    import math
    lat0, lon0 = place["lat"], place["lon"]
    def xy(t):
        dx = (t["lon"] - lon0) * 111320 * math.cos(math.radians(lat0)); dy = (t["lat"] - lat0) * 110574
        return c + dx / G["wide_metres_per_pixel"] * s, c - dy / G["wide_metres_per_pixel"] * s
    named = [t for t in towns if t["tags"].get("name:he")]
    key_ids = {int(a["osm"].split("/")[1]) for a in meta.get("anchors", {}).values() if a["osm"].startswith("node/")}
    labels = {int(a["osm"].split("/")[1]): meta["point"]["anchors"][k].get("label_he") for k, a in meta.get("anchors", {}).items()}
    named.sort(key=lambda t: (t["id"] not in key_ids, t["tags"].get("place") not in ("city", "town"), math.dist(xy(t), (c, c))))
    shown = []
    f = font(14, "Bold")
    for t in named:
        x, y = xy(t)
        if not (14 < x < INSET - 14 and 14 < y < INSET - 14): continue
        if t["id"] not in key_ids and math.dist((x, y), (c, c)) < half + 18: continue
        if t["id"] not in key_ids and any(math.dist((x, y), p) < 46 for p in shown): continue
        below = any(math.dist((x, y), p) < 46 for p in shown)
        d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=PAPER, outline=INK)
        d.text((x, y + 6) if below else (x, y - 6), (labels.get(t["id"]) or t["tags"]["name:he"]).replace("'", "׳"), font=f, fill=PAPER, anchor="ma" if below else "mb",
               direction="rtl", language="he", stroke_width=3, stroke_fill=INK)
        shown.append((x, y))
        if len(shown) == 5: break
    km10 = 10000 / G["wide_metres_per_pixel"] * s
    d.rectangle((8, INSET - 30, 8 + 118, INSET - 8), fill=(255, 255, 255, 215))
    d.rectangle((14, INSET - 16, 14 + km10, INSET - 12), fill=INK)
    d.text((14 + km10 + 6, INSET - 19), "10 ק״מ", font=font(13), fill=INK, anchor="lm", direction="rtl", language="he")
    framed = ImageOps.expand(sq, border=3, fill=PAPER)
    return framed

def panel(label):
    img = Image.open(f"{IN}/{label}.png").convert("RGB").resize((PANEL, PANEL), Image.LANCZOS).convert("RGBA")
    img.alpha_composite(logo, ((PANEL - logo.width) // 2, (PANEL - logo.height) // 2))
    north_and_scale(img)
    ins = inset(label).convert("RGBA")
    img.alpha_composite(ins, (16, 16))
    return img.convert("RGB")

def caption(d, x_right, y, label, width):
    m = meta[label]
    f_big, f, f_small = font(34, "Bold"), font(21), font(19)
    rtl(d, (x_right, y), "לפני" if label == "before" else "אחרי", f_big)
    if len(m.get("composite_days", [])) > 1:
        ds = [dt.date.fromisoformat(x) for x in m["composite_days"]]
        day = lambda t: f"{t.day} ב{MONTHS[t.month - 1]} {t.year}"
        rtl(d, (x_right, y + 50), f"שילוב של {len(ds)} צילומים נקיים, מ-{day(ds[0])} עד {day(ds[-1])}", f)
    else:
        rtl(d, (x_right, y + 50), israel_time(m["datetime"]), f)
    rtl(d, (x_right, y + 84), "הלוויין שצילם את התמונה:" if len(m["platforms"]) == 1 else "הלוויינים שצילמו את התמונה:", f, fill=SUB)
    ltr(d, (x_right, y + 114), ", ".join(SAT_NAME.get(p, p) for p in m["platforms"]), font(21, "Bold"))
    rtl(d, (x_right, y + 146), ("לוויין" if len(m["platforms"]) == 1 else "לוויינים") + " של סוכנות החלל האירופית, במסגרת תוכנית קופרניקוס של האיחוד האירופי", f_small, fill=SUB)

name = place["tags"].get("name:he") or place["tags"].get("name")
ele = place["tags"].get("ele")
lat, lon = place["lat"], place["lon"]
km = f'{2 * G["half_width_m"] / 1000:g}'.replace(".", ".")

def legend(d, x_right, y, width):
    f, fb = font(21), font(21, "Bold")
    lines = [
        (f"המקום המצולם: {name}", fb),
        (f"נקודת הציון של מרכז התמונה: {lat:.5f} מעלות צפון, {lon:.5f} מעלות מזרח", f),
        (f"נקודת הציון של מרכז התמונה ברשת ישראל החדשה: {place['itm_e']} מזרח, {place['itm_n']} צפון", f),
        (f"כל תמונה מראה שטח של {km} על {km} קילומטרים. הצפון נמצא בראש התמונה.", f),
        ("הריבוע הקטן מראה שטח של 40 על 40 קילומטרים, והמסגרת האדומה שבתוכו מסמנת את השטח שבתמונה הגדולה. בשני הצדדים הריבוע הקטן לקוח מצילום ה'לפני'.", f),
        ("מקור התמונות: הארכיון הפתוח של לווייני Sentinel-2. מקור השמות: OpenStreetMap.", f),
    ]
    for i, (t, ff) in enumerate(lines):
        rtl(d, (x_right, y + i * 34), t, ff, fill=INK if i < 4 else SUB)
    yy = y + len(lines) * 34 + 6
    ltr(d, (x_right, yy), f"Contains modified Copernicus Sentinel data {meta['before']['datetime'][:4]}, {meta['after']['datetime'][:4]}. Names: © OpenStreetMap contributors.", font(16), fill=SUB)
    return yy + 26

# 1. side by side: before on the right, after on the left
GAP, PAD = 24, 32
W = PAD * 2 + PANEL * 2 + GAP
H = 2000
sheet = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(sheet)
rtl(d, (W - PAD, PAD), name, font(40, "Bold"))
rtl(d, (W - PAD, PAD + 62), f"צילומי לוויין של אותו מקום, לפני ואחרי. כל תמונה מראה שטח של {km} על {km} קילומטרים.", font(24), fill=SUB)
top = PAD + 118
right_x = W - PAD - PANEL
sheet.paste(panel("before"), (right_x, top))
sheet.paste(panel("after"), (PAD, top))
caption(d, W - PAD, top + PANEL + 18, "before", PANEL)
caption(d, PAD + PANEL, top + PANEL + 18, "after", PANEL)
d.line((PAD, top + PANEL + 196, W - PAD, top + PANEL + 196), fill=LINE, width=2)
end = legend(d, W - PAD, top + PANEL + 214, W - 2 * PAD)
sheet = sheet.crop((0, 0, W, end + PAD))
sheet.save(f"{OUT}/summary.png", optimize=True)

# 2. the moving picture: one panel, before and after in turn, with the same legend
def frame(label):
    fw = PANEL + PAD * 2
    fr = Image.new("RGB", (fw, 2000), PAPER)
    dd = ImageDraw.Draw(fr)
    rtl(dd, (fw - PAD, PAD), name, font(30, "Bold"))
    fr.paste(panel(label), (PAD, PAD + 64))
    caption(dd, fw - PAD, PAD + 64 + PANEL + 16, label, PANEL)
    dd.line((PAD, PAD + 64 + PANEL + 192, fw - PAD, PAD + 64 + PANEL + 192), fill=LINE, width=2)
    f, fs = font(19), font(15)
    ys = PAD + 64 + PANEL + 206
    for i, t in enumerate([f"נקודת הציון של מרכז התמונה: {lat:.5f} מעלות צפון, {lon:.5f} מעלות מזרח",
                           f"נקודת הציון של מרכז התמונה ברשת ישראל החדשה: {place['itm_e']} מזרח, {place['itm_n']} צפון",
                           f"התמונה מראה שטח של {km} על {km} קילומטרים. הצפון נמצא בראש התמונה."]):
        rtl(dd, (fw - PAD, ys + i * 28), t, f)
    ltr(dd, (fw - PAD, ys + 4 * 28 + 4), f"Contains modified Copernicus Sentinel data {meta['before']['datetime'][:4]}, {meta['after']['datetime'][:4]}. © OpenStreetMap contributors.", fs, fill=SUB)
    return fr.crop((0, 0, fw, ys + 4 * 28 + 34))

fb, fa = frame("before"), frame("after")
fa = fa.resize(fb.size) if fa.size != fb.size else fa
# one shared palette for both frames, with the exact red of the frame mark and the exact ink colour kept
both = Image.new("RGB", (fb.width, fb.height * 2)); both.paste(fb, (0, 0)); both.paste(fa, (0, fb.height))
q = both.quantize(colors=250, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
keep = [(215, 38, 61), (22, 34, 46), (255, 255, 255), (74, 88, 102), (217, 222, 226), (0, 0, 0)]
palette = q.getpalette()[:250 * 3] + [v for c in keep for v in c]
palimg = Image.new("P", (1, 1)); palimg.putpalette(palette)
pal = [f.quantize(palette=palimg, dither=Image.Dither.NONE) for f in (fb, fa)]
pal[0].save(f"{OUT}/summary.gif", save_all=True, append_images=pal[1:], duration=[1600, 1600], loop=0, optimize=True)
print("done", sheet.size, fb.size)
