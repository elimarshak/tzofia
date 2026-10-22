# 'חשופית': fetch one point (before and after) from open sources only.
#   python fetch_point.py POINT.json OUT
# POINT.json says which OpenStreetMap places anchor the point (searched by name, never typed coordinates),
# how the window sits relative to them, and the 'before' and 'after' date ranges.
# - Coordinates and names: OpenStreetMap (Overpass).
# - Pictures: the open Sentinel-2 archive on AWS (Earth Search catalogue, no account), true colour, 10 m.
# - Every picture is warped to a north-up grid of exact metres per pixel around the centre, so the north arrow
#   and the scale bar are exact.
import json, sys, os, re, math, urllib.request, urllib.parse, datetime as dt
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from PIL import Image
from pyproj import Transformer

P = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
PX = 10
ES = "https://earth-search.aws.element84.com/v1"
OVERPASS = "https://overpass-api.de/api/interpreter"
log = open(f"{OUT}/log.txt", "a")
def say(*a): print(*a, flush=True); print(*a, file=log); log.flush()

def get(url, data=None, headers=None, timeout=180):
    h = {"User-Agent": "openeye.co.il hasufit (non-commercial)"}; h.update(headers or {})
    return urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h), timeout=timeout).read()

def overpass(q):
    import time
    for wait in (0, 30, 60, 120):
        time.sleep(wait)
        try: return json.loads(get(OVERPASS, urllib.parse.urlencode({"data": "[out:json][timeout:90];" + q}).encode()))["elements"]
        except urllib.error.HTTPError as e:
            if e.code not in (429, 504): raise
            say("overpass busy, waiting", e.code)
    raise SystemExit("overpass kept refusing")

# 1. anchors from OpenStreetMap
anchors = {}
for key, a in P["anchors"].items():
    s, w, n, e = a["bbox"]
    els = overpass(f'(nwr["place"]["name:en"~"{a["name_en"]}",i]({s},{w},{n},{e});nwr["place"]["name"~"{a["name_en"]}",i]({s},{w},{n},{e}););out center;')
    els = list({(x["type"], x["id"]): x for x in els}.values())
    # one place mapped twice (a node and an area with the same wikidata): keep the node
    by = {}
    for x in sorted(els, key=lambda x: x["type"] != "node"):
        by.setdefault(x["tags"].get("wikidata") or f'{x["type"]}{x["id"]}', x)
    els = list(by.values())
    for x in els:
        say("OSM", key, x["type"], x["id"], x.get("lat") or x["center"]["lat"], x.get("lon") or x["center"]["lon"],
            {k: v for k, v in x["tags"].items() if k.startswith("name") or k in ("place", "wikidata")})
    if len(els) != 1: raise SystemExit(f"anchor {key}: {len(els)} matches, need exactly one")
    x = els[0]
    anchors[key] = {"osm": f'{x["type"]}/{x["id"]}', "lat": x.get("lat") or x["center"]["lat"], "lon": x.get("lon") or x["center"]["lon"], "tags": x["tags"]}

# the centre: the mean of the anchors, moved by the stated offset in metres (east, north)
lat0 = sum(a["lat"] for a in anchors.values()) / len(anchors)
lon0 = sum(a["lon"] for a in anchors.values()) / len(anchors)
de, dn = P.get("offset_m", [0, 0])
lat = lat0 + dn / 110574
lon = lon0 + de / (111320 * math.cos(math.radians(lat0)))
itm = Transformer.from_crs("EPSG:4326", "EPSG:2039", always_xy=True).transform(lon, lat)
HALF = P["half_m"]
dst_crs = f"+proj=tmerc +lat_0={lat} +lon_0={lon} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"

# 2. pictures
def items(frm, to):
    poly = [[lon + dx, lat + dy] for dx, dy in ((-.02, -.02), (.02, -.02), (.02, .02), (-.02, .02), (-.02, -.02))]
    body = {"collections": ["sentinel-2-l2a"], "intersects": {"type": "Polygon", "coordinates": [poly]},
            "datetime": f"{frm}T00:00:00Z/{to}T23:59:59Z", "limit": 300}
    return json.loads(get(ES + "/search", json.dumps(body).encode(), {"Content-Type": "application/json"}))["features"]

def window(day, half, px, overview=None):
    size = int(round(2 * half / px)); tr = from_origin(-half, half, px, px)
    out = np.zeros((3, size, size), dtype=np.uint8)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        for item in day:
            kw = {"overview_level": overview} if overview is not None else {}
            with rasterio.open(item["assets"]["visual"]["href"], **kw) as src:
                part = np.zeros((3, size, size), dtype=np.uint8)
                for b in range(3):
                    reproject(src.read(b + 1), part[b], src_transform=src.transform, src_crs=src.crs,
                              dst_transform=tr, dst_crs=dst_crs, resampling=Resampling.bilinear, src_nodata=0, dst_nodata=0)
                hole = out.sum(0) == 0
                out[:, hole] = part[:, hole]
    return out

def best(frm, to, label, newest):
    allit = items(frm, to)
    days = {}
    for i in allit: days.setdefault(i["properties"]["datetime"][:10], []).append(i)
    order = sorted(days, reverse=newest) if newest else sorted(days, key=lambda d: min(i["properties"].get("eo:cloud_cover", 100) for i in days[d]))
    say(label, frm, to, "days", len(days))
    for d in order[:25]:
        day = sorted(days[d], key=lambda i: i["properties"].get("eo:cloud_cover", 100))
        a = window(day, HALF, PX)
        empty = float((a.sum(0) == 0).mean()); white = float((a.min(0) > 200).mean())
        say(" try", d, [i["id"] for i in day], "empty", round(empty, 3), "white", round(white, 3))
        if empty < 0.005 and white < P.get("max_white", 0.01):
            return day, a
    raise SystemExit(f"no clear picture for {label}")

today = dt.date.today()
meta = {"point": P, "centre": {"lat": lat, "lon": lon, "itm_e": round(itm[0]), "itm_n": round(itm[1])}, "anchors": anchors}
OV_HALF, OV_PX = P.get("wide_half_m", 20000), 40
for label, (frm, to), newest in [("before", P["before"], False), ("after", P.get("after", [(today - dt.timedelta(days=60)).isoformat(), today.isoformat()]), True)]:
    day, a = best(frm, to, label, newest)
    Image.fromarray(np.moveaxis(a, 0, -1)).save(f"{OUT}/{label}.png")
    Image.fromarray(np.moveaxis(window(day, OV_HALF, OV_PX, overview=1), 0, -1)).save(f"{OUT}/{label}_wide.png")
    meta[label] = {"passes": [{"id": i["id"], "datetime": i["properties"]["datetime"], "platform": i["properties"].get("platform"),
                               "cloud_cover_tile": i["properties"].get("eo:cloud_cover"),
                               "self": next((l["href"] for l in i["links"] if l["rel"] == "self"), None)} for i in day]}
    meta[label]["datetime"] = day[0]["properties"]["datetime"]
    meta[label]["platforms"] = sorted({i["properties"].get("platform") for i in day})
meta["grid"] = {"crs": dst_crs, "metres_per_pixel": PX, "half_width_m": HALF, "wide_half_width_m": OV_HALF, "wide_metres_per_pixel": OV_PX}

# a change map: where the ground changed between the two pictures (for checking, not for publishing)
b = np.asarray(Image.open(f"{OUT}/before.png")).astype(float); a = np.asarray(Image.open(f"{OUT}/after.png")).astype(float)
bn = (b - b.mean((0, 1))) / (b.std((0, 1)) + 1e-6); an = (a - a.mean((0, 1))) / (a.std((0, 1)) + 1e-6)
ch = np.sqrt(((an - bn) ** 2).sum(2)); ch = np.clip(ch / np.percentile(ch, 99.5) * 255, 0, 255).astype(np.uint8)
Image.fromarray(ch).save(f"{OUT}/change.png")

# towns and villages in the wide view, from OpenStreetMap, for the corner square
dlat, dlon = OV_HALF / 110574, OV_HALF / (111320 * math.cos(math.radians(lat)))
pl = overpass(f'node["place"~"^(city|town|village)$"]({lat-dlat},{lon-dlon},{lat+dlat},{lon+dlon});out;')
json.dump([{"id": e["id"], "lat": e["lat"], "lon": e["lon"], "tags": {k: v for k, v in e["tags"].items() if k.startswith("name") or k in ("place", "population", "wikidata")}} for e in pl],
          open(f"{OUT}/places.json", "w"), ensure_ascii=False, indent=1)
json.dump(meta, open(f"{OUT}/meta.json", "w"), ensure_ascii=False, indent=1)
say("centre", lat, lon, "ITM", round(itm[0]), round(itm[1]), "places", len(pl))
say(json.dumps({k: (v.get("datetime"), v.get("platforms")) for k, v in meta.items() if k in ("before", "after")}))
