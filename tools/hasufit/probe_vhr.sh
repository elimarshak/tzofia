#!/bin/bash
# Which free very-sharp image collections (under one metre) have anything over the northern border area
# (box 32.6-33.6 N, 35.0-36.3 E).
set +e
pip install -q pystac-client==0.8.5 pystac==1.10.1 > /dev/null 2>&1
echo "== Umbra: task folder names matching the region"
aws s3 ls --no-sign-request s3://umbra-open-data-catalog/sar-data/tasks/ > umbra.txt; wc -l < umbra.txt
grep -i -E "israel|syria|leban|golan|hermon|quneitra|beirut|damascus|haifa|aviv|jerusalem|gaza|jordan|amman|cyprus|middle" umbra.txt
python - <<'PY'
import json, urllib.request, sys
B = (35.0, 32.6, 36.3, 33.6)
def inside(bb): return not (bb[2] < B[0] or bb[0] > B[2] or bb[3] < B[1] or bb[1] > B[3])
def walk(url, depth=0, seen=set(), hits=[]):
    if url in seen or depth > 6: return hits
    seen.add(url)
    try: j = json.load(urllib.request.urlopen(url, timeout=60))
    except Exception as e: return hits
    if j.get("type") == "Feature":
        if inside(j["bbox"]): hits.append((url, j["properties"].get("datetime"), j["properties"].get("sar:resolution_range")))
        return hits
    for l in j.get("links", []):
        if l["rel"] in ("child", "item"):
            walk(urllib.parse.urljoin(url, l["href"]), depth + 1, seen, hits)
    return hits
import urllib.parse
print("== Capella: catalogue by capital city")
j = json.load(urllib.request.urlopen("https://capella-open-data.s3.us-west-2.amazonaws.com/stac/capella-open-data-by-capital/catalog.json"))
print([l.get("title") for l in j["links"] if l["rel"] == "child"])
print("== Capella: every item whose box touches the region")
h = walk("https://capella-open-data.s3.us-west-2.amazonaws.com/stac/capella-open-data-by-capital/catalog.json")
print(len(h), h[:20])
PY
echo "== Satellogic EarthView: catalogue"
aws s3 ls --no-sign-request s3://satellogic-earthview/stac/ 2>&1 | head
aws s3 ls --no-sign-request s3://satellogic-earthview/data/ 2>&1 | head
