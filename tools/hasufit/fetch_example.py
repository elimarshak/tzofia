# 'חשופית': fetch one example point (before and after) from open sources only.
# - The place and its coordinates come from OpenStreetMap (Overpass), never typed by hand.
# - The pictures come from the open Sentinel-2 archive on AWS (Earth Search catalogue, no account).
# - Each picture is warped to a local north-up grid of exactly 10 metres per pixel, centred on the place,
#   so "north is up" and the scale bar are exact.
# Writes into OUT: place.json, before.png, after.png, meta.json, logo.* and probe.txt.
import json, sys, os, io, re, subprocess, urllib.request, urllib.parse, datetime as dt
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from PIL import Image

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
HALF = 2000          # metres from the centre to each edge: a 4 x 4 km window
PX = 10              # metres per pixel (Sentinel-2 true-colour band resolution)
ES = "https://earth-search.aws.element84.com/v1"
log = open(f"{OUT}/probe.txt", "a")
def say(*a): print(*a); print(*a, file=log); log.flush()

def get(url, data=None, headers=None, timeout=120):
    r = urllib.request.Request(url, data=data, headers=headers or {"User-Agent": "openeye.co.il hasufit"})
    return urllib.request.urlopen(r, timeout=timeout).read()

# 1. the place, from OpenStreetMap: the highest summit named Hermon
q = """[out:json][timeout:60];
node["natural"="peak"](33.30,35.70,33.50,35.95);
out;"""
els = json.loads(get("https://overpass-api.de/api/interpreter", urllib.parse.urlencode({"data": q}).encode()))["elements"]
herm = [e for e in els if re.search("hermon|חרמון|الشيخ", " ".join(str(v) for k, v in e.get("tags", {}).items() if k.startswith("name")), re.I)]
for e in sorted(els, key=lambda e: -float(re.sub("[^0-9.]", "", e["tags"].get("ele", "0")) or 0))[:12]:
    say("OSM peak", e["id"], e["lat"], e["lon"], {k: v for k, v in e["tags"].items() if k.startswith("name") or k in ("ele", "wikidata")})
place = max(herm, key=lambda e: float(re.sub("[^0-9.]", "", e["tags"].get("ele", "0")) or 0))
from pyproj import Transformer
itm = Transformer.from_crs("EPSG:4326", "EPSG:2039", always_xy=True).transform(place["lon"], place["lat"])
json.dump({"osm_node": place["id"], "lat": place["lat"], "lon": place["lon"], "itm_e": round(itm[0]), "itm_n": round(itm[1]), "tags": place["tags"]}, open(f"{OUT}/place.json", "w"), ensure_ascii=False, indent=1)
lat, lon = place["lat"], place["lon"]
say("chosen place", place["id"], lat, lon, place["tags"].get("name"), place["tags"].get("name:he"), place["tags"].get("ele"))

# 2. the pictures: least cloudy Sentinel-2 pass in each window
def items(frm, to):
    body = {"collections": ["sentinel-2-l2a"], "intersects": {"type": "Point", "coordinates": [lon, lat]},
            "datetime": f"{frm}T00:00:00Z/{to}T23:59:59Z", "limit": 200}
    j = json.loads(get(ES + "/search", json.dumps(body).encode(), {"Content-Type": "application/json"}))
    return j["features"]

dst_crs = f"+proj=tmerc +lat_0={lat} +lon_0={lon} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
n = 2 * HALF // PX
dst_tr = from_origin(-HALF, HALF, PX, PX)

def window(items_of_day, half=HALF, px=PX, overview=None):
    size = int(2 * half // px)
    tr = from_origin(-half, half, px, px)
    out = np.zeros((3, size, size), dtype=np.uint8)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        for item in items_of_day:
            kw = {"overview_level": overview} if overview is not None else {}
            with rasterio.open(item["assets"]["visual"]["href"], **kw) as src:
                part = np.zeros((3, size, size), dtype=np.uint8)
                for b in range(3):
                    reproject(src.read(b + 1), part[b], src_transform=src.transform, src_crs=src.crs,
                              dst_transform=tr, dst_crs=dst_crs, resampling=Resampling.bilinear, src_nodata=0, dst_nodata=0)
                hole = out.sum(0) == 0
                out[:, hole] = part[:, hole]
    return out

def same_day(all_items, it):
    d = it["properties"]["datetime"][:10]
    return sorted([i for i in all_items if i["properties"]["datetime"][:10] == d], key=lambda i: i["properties"].get("eo:cloud_cover", 100))

def best(frm, to, label, newest):
    allit = items(frm, to)
    cand = [i for i in allit if i["properties"].get("eo:cloud_cover", 100) <= 10]
    cand.sort(key=(lambda i: i["properties"]["datetime"]) if newest else (lambda i: i["properties"].get("eo:cloud_cover", 100)), reverse=newest)
    say(label, "candidates", len(cand), [(i["id"], i["properties"]["datetime"][:16], i["properties"].get("eo:cloud_cover")) for i in cand[:8]])
    for it in cand[:10]:
        day = same_day(allit, it)
        a = window(day)
        empty = float((a.sum(0) == 0).mean())
        bright = float((a.min(0) > 200).mean())   # white: cloud or snow
        say(" try", it["id"], "empty", round(empty, 3), "white", round(bright, 3))
        if empty < 0.01 and bright < 0.02:
            return day, a, allit
    raise SystemExit(f"no clear picture for {label}")

meta = {}
OV_HALF, OV_PX = 20000, 40   # the wide view for the corner square: 40 x 40 km, 40 metres per pixel
for label, frm, to, newest in [("before", "2024-10-01", "2024-12-07", False), ("after", (dt.date.today() - dt.timedelta(days=45)).isoformat(), dt.date.today().isoformat(), True)]:
    day, a, allit = best(frm, to, label, newest)
    Image.fromarray(np.moveaxis(a, 0, -1)).save(f"{OUT}/{label}.png")
    wide = window(day, OV_HALF, OV_PX, overview=1)
    Image.fromarray(np.moveaxis(wide, 0, -1)).save(f"{OUT}/{label}_wide.png")
    it = day[0]
    p = it["properties"]
    meta[label] = {"passes_used": [i["id"] for i in day], "platforms": sorted({i["properties"].get("platform") for i in day}), "id": it["id"], "datetime": p["datetime"], "platform": p.get("platform"), "constellation": p.get("constellation"),
                   "instruments": p.get("instruments"), "cloud_cover_tile": p.get("eo:cloud_cover"), "mgrs_tile": p.get("s2:mgrs_tile") or p.get("grid:code"),
                   "processing_baseline": p.get("s2:processing_baseline"), "gsd": p.get("gsd"), "visual_href": it["assets"]["visual"]["href"],
                   "self": next((l["href"] for l in it["links"] if l["rel"] == "self"), None)}
meta["grid"] = {"crs": dst_crs, "metres_per_pixel": PX, "half_width_m": HALF, "wide_half_width_m": OV_HALF, "wide_metres_per_pixel": OV_PX}

# towns and villages inside the wide view, from OpenStreetMap, to name the area in the corner square
dlat, dlon = OV_HALF / 111320, OV_HALF / (111320 * np.cos(np.radians(lat)))
q = f"""[out:json][timeout:60];
node["place"~"^(city|town|village)$"]({lat-dlat},{lon-dlon},{lat+dlat},{lon+dlon});
out;"""
pl = json.loads(get("https://overpass-api.de/api/interpreter", urllib.parse.urlencode({"data": q}).encode()))["elements"]
json.dump([{"id": e["id"], "lat": e["lat"], "lon": e["lon"], "tags": {k: v for k, v in e["tags"].items() if k.startswith("name") or k in ("place", "population", "wikidata")}} for e in pl], open(f"{OUT}/places.json", "w"), ensure_ascii=False, indent=1)
say("places in wide view", len(pl))
json.dump(meta, open(f"{OUT}/meta.json", "w"), indent=1)
say(json.dumps(meta, indent=1))

# 3. the CIVILPRESS logo, as the site itself publishes it
html = get("https://civilpress.co.il/").decode("utf-8", "replace")
cands = re.findall(r'<img[^>]+class="[^"]*custom-logo[^"]*"[^>]*>', html) + re.findall(r'<img[^>]+(?:logo)[^>]*>', html, re.I)
say("logo tags", cands[:6])
icons = re.findall(r'<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"', html)
say("site icons", icons)
srcs = []
for c in cands:
    m = re.search(r'src="([^"]+)"', c)
    if m: srcs.append(m.group(1))
    m = re.search(r'srcset="([^"]+)"', c)
    if m: srcs += [s.strip().split(" ")[0] for s in m.group(1).split(",")]
for i, s in enumerate(dict.fromkeys(["https://civilpress.co.il/wp-content/uploads/2020/06/logo_itonut.png"] + srcs + icons)):
    try:
        b = get(s if s.startswith("http") else "https://civilpress.co.il" + s)
        ext = os.path.splitext(urllib.parse.urlparse(s).path)[1] or ".bin"
        open(f"{OUT}/logo{i}{ext}", "wb").write(b); say("saved logo", i, s, len(b))
    except Exception as e: say("logo fail", s, e)
