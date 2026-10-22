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
CACHE = os.path.splitext(sys.argv[1])[0] + ".osm.json"     # OpenStreetMap answers saved with the point (ids kept, so anyone can check them)
osm_cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
PX = 10
ES = "https://earth-search.aws.element84.com/v1"
OVERPASS = "https://overpass-api.de/api/interpreter"
log = open(f"{OUT}/log.txt", "a")
def say(*a): print(*a, flush=True); print(*a, file=log); log.flush()

def get(url, data=None, headers=None, timeout=180):
    h = {"User-Agent": "openeye.co.il hasufit (non-commercial)"}; h.update(headers or {})
    return urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h), timeout=timeout).read()

MIRRORS = [OVERPASS, "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
def overpass(q):
    if q in osm_cache: return osm_cache[q]
    r = _overpass(q); osm_cache[q] = r
    json.dump(osm_cache, open(f"{OUT}/osm.json", "w"), ensure_ascii=False)
    return r

def _overpass(q):
    import time
    for attempt, wait in enumerate((0, 20, 40, 60, 90, 120)):
        time.sleep(wait)
        url = MIRRORS[attempt % len(MIRRORS)]
        try: return json.loads(get(url, urllib.parse.urlencode({"data": "[out:json][timeout:90];" + q}).encode()))["elements"]
        except Exception as e:
            say("overpass did not answer, trying again", url, str(e)[:80])
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
HALF = P["half_m"]
# a close-up inside the point: the pictures are centred on it, the OpenStreetMap queries keep the point's own centre
qlat, qlon = lat, lon
if "zoom" in P:
    ze, zn = P["zoom"]["offset_m"]
    lat, lon = lat + zn / 110574, lon + ze / (111320 * math.cos(math.radians(lat)))
    HALF = P["zoom"]["half_m"]
itm = Transformer.from_crs("EPSG:4326", "EPSG:2039", always_xy=True).transform(lon, lat)
dst_crs = f"+proj=tmerc +lat_0={lat} +lon_0={lon} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"

# 2. pictures
def items(frm, to, r=.02):
    poly = [[lon + dx, lat + dy] for dx, dy in ((-r, -r), (r, -r), (r, r), (-r, r), (-r, -r))]
    body = {"collections": ["sentinel-2-l2a"], "intersects": {"type": "Polygon", "coordinates": [poly]},
            "datetime": f"{frm}T00:00:00Z/{to}T23:59:59Z", "limit": 300}
    return json.loads(get(ES + "/search", json.dumps(body).encode(), {"Content-Type": "application/json"}))["features"]

def window(day, half, px, overview=None, asset="visual"):
    size = int(round(2 * half / px)); tr = from_origin(-half, half, px, px)
    nb = 3 if asset == "visual" else 1
    out = np.zeros((nb, size, size), dtype=np.uint8)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        for item in day:
            kw = {"overview_level": overview} if overview is not None else {}
            with rasterio.open(item["assets"][asset]["href"], **kw) as src:
                part = np.zeros((nb, size, size), dtype=np.uint8)
                for b in range(nb):
                    reproject(src.read(b + 1), part[b], src_transform=src.transform, src_crs=src.crs,
                              dst_transform=tr, dst_crs=dst_crs, resampling=Resampling.bilinear if asset == "visual" else Resampling.nearest,
                              src_nodata=0, dst_nodata=0)
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
        scl = window(day, HALF, 20, asset="scl")[0]
        cloud = float(np.isin(scl, (3, 8, 9, 10)).mean()); empty = float((scl == 0).mean())
        say(" try", d, [i["id"] for i in day], "empty", round(empty, 4), "cloud", round(cloud, 4))
        if empty < 0.005 and cloud < P.get("max_cloud", 0.003):
            return day, window(day, HALF, PX), cloud
    raise SystemExit(f"no clear picture for {label}")

today = dt.date.today()
meta = {"point": P, "centre": {"lat": lat, "lon": lon, "itm_e": round(itm[0]), "itm_n": round(itm[1])}, "anchors": anchors}
OV_HALF, OV_PX = P.get("wide_half_m", 20000), 40
for label, (frm, to), newest in [("before", P["before"], False), ("after", P.get("after", [(today - dt.timedelta(days=60)).isoformat(), today.isoformat()]), True)]:
    day, a, cloud = best(frm, to, label, newest)
    Image.fromarray(np.moveaxis(a, 0, -1)).save(f"{OUT}/{label}.png")
    d0 = day[0]["properties"]["datetime"][:10]
    wide_day = sorted([i for i in items(d0, d0, r=.3) if i["properties"].get("platform") == day[0]["properties"].get("platform")],
                      key=lambda i: i["properties"].get("eo:cloud_cover", 100))
    Image.fromarray(np.moveaxis(window(wide_day, OV_HALF, OV_PX, overview=1), 0, -1)).save(f"{OUT}/{label}_wide.png")
    meta[label] = {"passes": [{"id": i["id"], "datetime": i["properties"]["datetime"], "platform": i["properties"].get("platform"),
                               "cloud_cover_tile": i["properties"].get("eo:cloud_cover"),
                               "self": next((l["href"] for l in i["links"] if l["rel"] == "self"), None)} for i in day]}
    meta[label]["datetime"] = day[0]["properties"]["datetime"]
    meta[label]["cloud_in_window"] = cloud
    meta[label]["wide_passes"] = [i["id"] for i in wide_day]
    meta[label]["platforms"] = sorted({i["properties"].get("platform") for i in day})
meta["grid"] = {"crs": dst_crs, "metres_per_pixel": PX, "half_width_m": HALF, "wide_half_width_m": OV_HALF, "wide_metres_per_pixel": OV_PX}

# a change map: where the ground changed between the two pictures (for checking, not for publishing)
b = np.asarray(Image.open(f"{OUT}/before.png")).astype(float); a = np.asarray(Image.open(f"{OUT}/after.png")).astype(float)
bn = (b - b.mean((0, 1))) / (b.std((0, 1)) + 1e-6); an = (a - a.mean((0, 1))) / (a.std((0, 1)) + 1e-6)
ch = np.sqrt(((an - bn) ** 2).sum(2)); ch = np.clip(ch / np.percentile(ch, 99.5) * 255, 0, 255).astype(np.uint8)
Image.fromarray(ch).save(f"{OUT}/change.png")

# towns and villages in the wide view, from OpenStreetMap, for the corner square
dlat, dlon = OV_HALF / 110574, OV_HALF / (111320 * math.cos(math.radians(qlat)))
pl = overpass(f'node["place"~"^(city|town|village)$"]({qlat-dlat},{qlon-dlon},{qlat+dlat},{qlon+dlon});out;')
json.dump([{"id": e["id"], "lat": e["lat"], "lon": e["lon"], "tags": {k: v for k, v in e["tags"].items() if k.startswith("name") or k in ("place", "population", "wikidata")}} for e in pl],
          open(f"{OUT}/places.json", "w"), ensure_ascii=False, indent=1)
json.dump(meta, open(f"{OUT}/meta.json", "w"), ensure_ascii=False, indent=1)
say("centre", lat, lon, "ITM", round(itm[0]), round(itm[1]), "places", len(pl))
say(json.dumps({k: (v.get("datetime"), v.get("platforms")) for k, v in meta.items() if k in ("before", "after")}))
