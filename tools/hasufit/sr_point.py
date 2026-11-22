# 'חשופית': the clearest single Sentinel-2 pass of each period, sharpened by AI (SEN2SR, ESA OpenSR, model
# SEN2SRLite NonReference_RGBN_x4: RGB+NIR 10 m -> 2.5 m), approved by Ilya on 23.10.2026.
#   python sr_point.py POINT_DIR OUT_DIR
# POINT_DIR is what fetch_point.py wrote (meta.json, places.json, *_wide.png). OUT_DIR gets the same files, with
# before.png / after.png replaced by the sharpened pictures on the point's own north-up grid (2.5 m per pixel),
# *_raw.npy with the sharpened reflectance for the weekly change check, and meta.json marking the method.
# The data steps follow the package's README: cubo data cube (its default catalogue), bands B04 B03 B02 B08,
# values / 10,000, NaN -> 0, the model on the CPU, predict_large for windows larger than 128 pixels.
import json, sys, os, shutil, datetime as dt
import numpy as np, torch, cubo, mlstac, sen2sr
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin, Affine
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(SRC):
    if os.path.isfile(f"{SRC}/{f}"): shutil.copy(f"{SRC}/{f}", f"{OUT}/{f}")
meta = json.load(open(f"{SRC}/meta.json"))
P = meta["point"]
lat, lon = meta["centre"]["lat"], meta["centre"]["lon"]
HALF = meta["grid"]["half_width_m"]
dst_crs = meta["grid"]["crs"]
PX = 2.5
EDGE = int(np.ceil((2 * HALF + 200) / 10 / 32) * 32)     # 10 m pixels, a margin of 100 m on each side, a multiple of 32
# share of hazy pixels allowed in the window. Chosen on 22.11.2026 from all clear passes of the ten points since July
# 2026: clear passes stay at 0.5% to 8% (bright ground at Ramiya, the Beaufort and Markaba), the hazy pass of 12.11.2026
# measured 16% at Labbouneh, 31% to 46% at Jubata and 36% at Majdal Shams-Hader
MAX_HAZE = 0.12
def say(*a): print(*a, flush=True)

mlstac.download(file="https://huggingface.co/tacofoundation/sen2sr/resolve/main/SEN2SRLite/NonReference_RGBN_x4/mlm.json",
                output_dir="model/SEN2SRLite_RGBN")
model = mlstac.load("model/SEN2SRLite_RGBN").compiled_model(device="cpu")

def clearest(frm, to, newest):
    da = cubo.create(lat=lat, lon=lon, collection="sentinel-2-l2a", bands=["B04", "B03", "B02", "B08", "SCL"],
                     start_date=frm, end_date=to, edge_size=EDGE, resolution=10)
    scl = da.sel(band="SCL").compute().to_numpy()
    # a place with no value at all counts as bad: near the edge between two Sentinel-2 tiles the catalogue also
    # returns a tile that covers only a part of the window, and that part alone must not pass as a clear picture
    bad = (np.isin(scl, (0, 3, 8, 9, 10, 11)) | np.isnan(scl)).mean(axis=(1, 2))
    # thin cloud, haze and smoke that the scene classification does not mark (12.11.2026 passed it as clear): the
    # haze test of Fmask (Zhu & Woodcock 2012), blue - 0.5 x red - 0.08 > 0 on a pixel, over the whole window
    rgb = da.sel(band=["B02", "B04"]).compute().to_numpy() / 10_000
    haze = np.nanmean((rgb[:, 0] - 0.5 * rgb[:, 1] - 0.08) > 0, axis=(1, 2))
    times = [str(t) for t in da.time.values]
    tiles = np.atleast_1d(da.coords["s2:mgrs_tile"].values) if "s2:mgrs_tile" in da.coords else np.array([""])
    if tiles.size == 1: tiles = np.repeat(tiles, len(times))
    # the haze test applies to the newest pass only: the 'before' pictures of 2023 stay as they were chosen
    hazy = [i for i in range(len(times)) if newest and haze[i] > MAX_HAZE]
    ok = [i for i in range(len(times)) if bad[i] <= 0.003 and i not in hazy]
    say(" passes", len(times), "clear", [f"{times[i][:10]} {tiles[i]}" for i in ok],
        "hazy", [f"{times[i][:10]} {haze[i]:.3f}" for i in hazy if bad[i] <= 0.003])
    if not ok: raise SystemExit(f"no clear pass {frm}..{to}")
    # one satellite pass can appear under two tiles; the choice between them is fixed, so that weeks stay comparable
    i = max(ok, key=lambda k: (times[k], -bad[k], [-ord(c) for c in str(tiles[k])])) if newest else min(ok, key=lambda k: (bad[k], times[k], str(tiles[k])))
    plat = str(da.coords["platform"].values[i]) if "platform" in da.coords else None
    x = (da.sel(band=["B04", "B03", "B02", "B08"])[i].compute().to_numpy() / 10_000).astype("float32")
    xs, ys = da.x.values, da.y.values
    tr = Affine(10, 0, float(xs[0]) - 5, 0, -10, float(ys[0]) + 5)
    return x, times[i], plat, f"EPSG:{int(da.attrs['epsg'])}", tr, float(bad[i]), float(haze[i])

# AFTER_UNTIL (a date) rebuilds the picture of an earlier week: the newest clear pass up to that day
today = dt.date.fromisoformat(os.environ["AFTER_UNTIL"]) if os.environ.get("AFTER_UNTIL") else dt.date.today()
periods = {"before": (P["before"], False), "after": (P.get("after", [(today - dt.timedelta(days=60)).isoformat(), today.isoformat()]), True)}
sharp = {}
for label, ((frm, to), newest) in periods.items():
    say(label, frm, to)
    x, t, plat, crs, tr, bad, hz = clearest(frm, to, newest)
    X = torch.nan_to_num(torch.from_numpy(x).float(), nan=0.0, posinf=0.0, neginf=0.0)
    with torch.no_grad():
        sup = sen2sr.predict_large(model=model, X=X, overlap=32)
    sup = sup.cpu().numpy() if hasattr(sup, "cpu") else np.asarray(sup)
    # onto the point's own north-up grid, so the north arrow and the scale bar stay exact
    size = int(round(2 * HALF / PX)); dtr = from_origin(-HALF, HALF, PX, PX)
    out = np.zeros((4, size, size), dtype=np.float32)
    for b in range(4):
        reproject(sup[b], out[b], src_transform=tr * Affine.scale(0.25), src_crs=crs, dst_transform=dtr, dst_crs=dst_crs,
                  resampling=Resampling.bilinear, src_nodata=None, dst_nodata=0)
    sharp[label] = out
    if not plat:
        raise SystemExit(f"{label}: the catalogue did not name the satellite of {t}")
    # the catalogue gives UTC time
    meta[label] = {"datetime": t[:23] + "Z", "platforms": [plat.lower()], "cloud_in_window": bad, "haze_in_window": hz,
                   "method": "sen2sr", "passes": [t]}
    say(label, t, plat, "cloud", bad)

# one stretch for both pictures and all three bands, as in the combined pictures (natural colours, comparable periods)
both = np.concatenate([sharp["before"][:3].ravel(), sharp["after"][:3].ravel()])
both = both[both > 0]
lo, hi = np.percentile(both, 0.5), np.percentile(both, 99.7)
for label, a in sharp.items():
    np.save(f"{OUT}/{label}_raw.npy", (a * 10_000).astype(np.uint16))
    v = np.clip((a[:3] - lo) / (hi - lo), 0, 1) ** (1 / 1.15)
    Image.fromarray((np.moveaxis(v, 0, -1) * 255).astype(np.uint8)).save(f"{OUT}/{label}.png")
meta["grid"]["metres_per_pixel"] = PX
meta["method"] = "sen2sr"
json.dump(meta, open(f"{OUT}/meta.json", "w"), ensure_ascii=False, indent=1)
say("sharpened", {k: (meta[k]["datetime"], meta[k]["platforms"]) for k in ("before", "after")})
