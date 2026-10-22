# 'חשופית': a clearer picture of a point, without inventing anything.
#   python enhance_point.py POINT_DIR OUT_DIR
# POINT_DIR is what fetch_point.py wrote (meta.json, places.json, *_wide.png). OUT_DIR gets the same files with
# before.png and after.png replaced by:
#   1. the satellite's raw red, green and blue measurements (not its ready-made picture), from every clear pass
#      in the period (up to MAX_DAYS), with clouds and cloud shadows removed pixel by pixel by the satellite's own
#      scene classification (SCL);
#   2. the median of those passes, pixel by pixel, which removes haze, noise and stray pixels;
#   3. one colour stretch computed on 'before' and 'after' together, so the two stay comparable;
#   4. resampled to a 5-metre grid with cubic interpolation and a mild unsharp mask on the edges.
# Nothing is added that the satellite did not measure; the steps only change contrast, noise and edge clarity.
import json, sys, os, shutil, math, urllib.request, datetime as dt
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from PIL import Image, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(SRC):
    if os.path.isfile(f"{SRC}/{f}"): shutil.copy(f"{SRC}/{f}", f"{OUT}/{f}")
meta = json.load(open(f"{SRC}/meta.json"))
P = meta["point"]
lat, lon = meta["centre"]["lat"], meta["centre"]["lon"]
HALF = meta["grid"]["half_width_m"]
dst_crs = meta["grid"]["crs"]
ES = "https://earth-search.aws.element84.com/v1"
MAX_DAYS, PX = 5, 5
def say(*a): print(*a, flush=True)

def items(frm, to):
    r = .02
    poly = [[lon + dx, lat + dy] for dx, dy in ((-r, -r), (r, -r), (r, r), (-r, r), (-r, -r))]
    body = {"collections": ["sentinel-2-l2a"], "intersects": {"type": "Polygon", "coordinates": [poly]},
            "datetime": f"{frm}T00:00:00Z/{to}T23:59:59Z", "limit": 300}
    req = urllib.request.Request(ES + "/search", json.dumps(body).encode(), {"Content-Type": "application/json", "User-Agent": "openeye.co.il hasufit"})
    return json.load(urllib.request.urlopen(req, timeout=180))["features"]

def warp(day, asset, px, nearest=False, dtype=np.float32):
    size = int(round(2 * HALF / px)); tr = from_origin(-HALF, HALF, px, px)
    out = np.zeros((size, size), dtype=dtype)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        for item in day:
            with rasterio.open(item["assets"][asset]["href"]) as src:
                part = np.zeros((size, size), dtype=dtype)
                reproject(src.read(1).astype(dtype), part, src_transform=src.transform, src_crs=src.crs, dst_transform=tr, dst_crs=dst_crs,
                          resampling=Resampling.nearest if nearest else Resampling.cubic, src_nodata=0, dst_nodata=0)
                hole = out == 0; out[hole] = part[hole]
    return out

def stack(frm, to, newest):
    allit = items(frm, to)
    days = {}
    for i in allit: days.setdefault(i["properties"]["datetime"][:10], []).append(i)
    order = sorted(days, reverse=True) if newest else sorted(days)
    used, layers = [], []
    for d in order:
        day = days[d]
        scl = warp(day, "scl", PX, nearest=True, dtype=np.uint8)
        bad = np.isin(scl, (0, 3, 8, 9, 10, 11))
        if bad.mean() > 0.05: say(" skip", d, round(float(bad.mean()), 3)); continue
        rgb = np.stack([warp(day, b, PX) for b in ("red", "green", "blue")])
        rgb[:, bad] = np.nan
        layers.append(rgb); used.append(day)
        say(" use", d, [i["id"] for i in day], "masked", round(float(bad.mean()), 4))
        if len(used) == MAX_DAYS: break
    if not layers: raise SystemExit(f"no clear passes {frm}..{to}")
    return np.nanmedian(np.stack(layers), axis=0), used

today = dt.date.today()
periods = {"before": (P["before"], False), "after": (P.get("after", [(today - dt.timedelta(days=60)).isoformat(), today.isoformat()]), True)}
raw, info = {}, {}
for label, ((frm, to), newest) in periods.items():
    raw[label], used = stack(frm, to, newest)
    passes = [i for day in used for i in day]
    info[label] = {"composite_days": sorted(day[0]["properties"]["datetime"][:10] for day in used),
                   "platforms": sorted({i["properties"].get("platform") for i in passes}),
                   "passes": [i["id"] for i in passes], "datetime": used[0][0]["properties"]["datetime"]}

# keep the measurements themselves next to the pictures, so the stretch can be checked or redone
for label, a in raw.items(): np.save(f"{OUT}/{label}_raw.npy", np.nan_to_num(a).astype(np.uint16))
# one stretch for both periods and all three bands together (a per-band stretch shifts the colours),
# from the 0.5th and 99.7th percentiles of all valid measurements
both = np.concatenate([raw["before"].ravel(), raw["after"].ravel()])
lo = np.nanpercentile(both, 0.5); hi = np.nanpercentile(both, 99.7)
for label, a in raw.items():
    a = np.where(np.isnan(a), np.nanmedian(a), a)
    v = np.clip((a - lo) / (hi - lo), 0, 1) ** (1 / 1.15)
    img = Image.fromarray((np.moveaxis(v, 0, -1) * 255).astype(np.uint8))
    img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
    img.save(f"{OUT}/{label}.png")
    meta[label].update(info[label]); meta[label]["method"] = "median composite of raw bands, joint stretch, 5 m cubic, unsharp mask"
meta["grid"]["metres_per_pixel"] = PX
json.dump(meta, open(f"{OUT}/meta.json", "w"), ensure_ascii=False, indent=1)
say("enhanced", {k: (v["composite_days"], v["platforms"]) for k, v in info.items()})
