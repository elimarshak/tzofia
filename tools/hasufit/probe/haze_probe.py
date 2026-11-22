# One-off check (22.11.2026): haze measures of every clear pass since July 2026 for one point, with a small picture of
# each pass, to choose a haze limit for sr_point.py.   python haze_probe.py META_JSON OUT_DIR
import json, sys, os
import numpy as np, cubo
from PIL import Image

meta = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
lat, lon = meta["centre"]["lat"], meta["centre"]["lon"]
HALF = meta["grid"]["half_width_m"]
EDGE = int(np.ceil((2 * HALF + 200) / 10 / 32) * 32)
name = os.path.basename(os.path.dirname(os.path.abspath(sys.argv[1])))
bands = ["B04", "B03", "B02", "B08", "SCL", "AOT"]
da = cubo.create(lat=lat, lon=lon, collection="sentinel-2-l2a", bands=bands, start_date="2026-07-01",
                 end_date="2026-11-22", edge_size=EDGE, resolution=10)
rows = []
for i, t in enumerate(da.time.values):
    a = da[i].compute().to_numpy().astype("float64")
    scl = a[4]
    bad = float((np.isin(scl, (0, 3, 8, 9, 10, 11)) | np.isnan(scl)).mean())
    if bad > 0.003:
        continue
    r, g, b, n = a[0] / 1e4, a[1] / 1e4, a[2] / 1e4, a[3] / 1e4
    hot = b - 0.5 * r
    tile = str(np.atleast_1d(da.coords["s2:mgrs_tile"].values)[i]) if "s2:mgrs_tile" in da.coords and np.atleast_1d(da.coords["s2:mgrs_tile"].values).size > 1 else ""
    row = {"point": name, "time": str(t)[:16], "tile": tile, "scl_bad": round(bad, 4),
           "hot_frac": round(float((hot - 0.08 > 0).mean()), 4), "hot_p50": round(float(np.nanmedian(hot)), 4),
           "hot_p10": round(float(np.nanpercentile(hot, 10)), 4), "b02_p10": round(float(np.nanpercentile(b, 10)), 4),
           "b02_p50": round(float(np.nanmedian(b)), 4), "aot_p50": round(float(np.nanmedian(a[5])), 1),
           "ndvi_p50": round(float(np.nanmedian((n - r) / (n + r + 1e-6))), 3)}
    rows.append(row)
    v = np.clip(np.stack([r, g, b], -1) / 0.25, 0, 1) ** (1 / 1.4)
    Image.fromarray((np.nan_to_num(v) * 255).astype(np.uint8)).save(f"{OUT}/{name}_{row['time'][:10]}_{tile}.png")
    print(json.dumps(row), flush=True)
json.dump(rows, open(f"{OUT}/{name}.json", "w"), indent=1)
