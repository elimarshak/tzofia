# 'חשופית' probe: which open satellite archives answer from GitHub's servers without an account,
# how often each one actually photographed our two border areas, and which border lines the open map holds.
import json, sys, urllib.request, urllib.parse, datetime as dt, statistics

AREAS = {"syria": [35.60, 32.60, 36.20, 33.50], "lebanon": [35.08, 32.98, 35.90, 33.45]}
FROM = (dt.datetime.utcnow() - dt.timedelta(days=90)).strftime("%Y-%m-%dT00:00:00Z")
TO = dt.datetime.utcnow().strftime("%Y-%m-%dT23:59:59Z")

def post(url, body):
    r = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=60))

def search(api, coll, bbox):
    items, body = [], {"collections": [coll], "bbox": bbox, "datetime": f"{FROM}/{TO}", "limit": 200}
    url = api + "/search"
    while url:
        j = post(url, body)
        items += j.get("features", [])
        nxt = [l for l in j.get("links", []) if l.get("rel") == "next"]
        if not nxt or len(items) > 2000: break
        url, body = nxt[0]["href"], nxt[0].get("body", body)
    return items

def report(name, items, cloud=True):
    days = sorted({i["properties"]["datetime"][:10] for i in items})
    clear = sorted({i["properties"]["datetime"][:10] for i in items if not cloud or (i["properties"].get("eo:cloud_cover") or 0) <= 20})
    gaps = [(dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days for a, b in zip(days, days[1:])]
    asset = next(iter(items[0]["assets"].values()))["href"] if items else ""
    print(f"  {name}: {len(items)} items, {len(days)} days, clear(<=20%) {len(clear)} days, median gap {statistics.median(gaps) if gaps else '-'} d, max gap {max(gaps) if gaps else '-'} d")
    print(f"    days: {' '.join(d[5:] for d in days)}")
    print(f"    sample asset: {asset[:140]}")

ES = "https://earth-search.aws.element84.com/v1"
PC = "https://planetarycomputer.microsoft.com/api/stac/v1"
for area, bbox in AREAS.items():
    print(f"== {area} {bbox} {FROM[:10]}..{TO[:10]}")
    for api, coll, cloud in [(ES, "sentinel-2-l2a", True), (ES, "sentinel-2-c1-l2a", True), (ES, "sentinel-1-grd", False), (ES, "landsat-c2-l2", True),
                             (PC, "sentinel-2-l2a", True), (PC, "sentinel-1-rtc", False), (PC, "sentinel-1-grd", False), (PC, "landsat-c2-l2", True), (PC, "hls2-s30", True), (PC, "hls2-l30", True)]:
        try: report(f"{api.split('/')[2].split('.')[0]} {coll}", search(api, coll, bbox), cloud)
        except Exception as e: print(f"  {api.split('/')[2]} {coll}: ERROR {str(e)[:160]}")

# can the images themselves be read without an account?
def head(url):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, method="GET", headers={"Range": "bytes=0-15"}), timeout=60)
        return f"{r.status} {r.headers.get('Content-Range')}"
    except Exception as e: return "ERROR " + str(e)[:120]
try:
    it = search(ES, "sentinel-2-l2a", AREAS["syria"])[0]
    print("ES S2 visual:", head(it["assets"]["visual"]["href"]))
except Exception as e: print("ES S2 read", e)
try:
    tok = json.load(urllib.request.urlopen("https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-1-rtc", timeout=60))
    it = search(PC, "sentinel-1-rtc", AREAS["syria"])[0]
    print("PC S1 rtc vv:", head(it["assets"]["vv"]["href"] + "?" + tok["token"]))
    tok = json.load(urllib.request.urlopen("https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2", timeout=60))
    it = search(PC, "landsat-c2-l2", AREAS["syria"])[0]
    print("PC landsat red:", head(it["assets"]["red"]["href"] + "?" + tok["token"]))
except Exception as e: print("PC read", str(e)[:200])

# border lines in the open map (OpenStreetMap through Overpass)
q = """[out:json][timeout:90];
(relation["name"~"UNDOF|Area of Separation|Area of Limitation|Blue Line|Purple Line|Alpha Line|Bravo Line",i](32.5,35.0,33.6,36.3);
 way["name"~"UNDOF|Area of Separation|Area of Limitation|Blue Line|Purple Line|Alpha Line|Bravo Line",i](32.5,35.0,33.6,36.3);
 relation["boundary"~"administrative|disputed"]["admin_level"="2"](32.5,35.0,33.6,36.3);
 way["boundary"~"ceasefire|disputed|demarcation"](32.5,35.0,33.6,36.3);
 relation["boundary"~"ceasefire|disputed|demarcation"](32.5,35.0,33.6,36.3););
out tags;"""
for ep in ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]:
    try:
        j = json.load(urllib.request.urlopen(urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode()), timeout=120))
        print("OSM via", ep)
        for e in j["elements"]:
            t = e.get("tags", {})
            print(f"  {e['type']} {e['id']}: name={t.get('name')} name:en={t.get('name:en')} boundary={t.get('boundary')} admin_level={t.get('admin_level')} border_type={t.get('border_type')}")
        break
    except Exception as e: print("overpass", ep, str(e)[:150])
