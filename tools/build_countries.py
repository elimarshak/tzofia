#!/usr/bin/env python3
"""Label point of every country, keyed by its two-letter code: {"IR": [lon, lat], ...}.
Source: Natural Earth 1:50m admin-0 countries (public domain). Used only to place a mark on the country name."""
import json, sys
src, dst = sys.argv[1], sys.argv[2]
out = {}
for f in json.load(open(src, encoding="utf-8"))["features"]:
    p = f["properties"]
    code = p.get("ISO_A2_EH") or p.get("ISO_A2")
    if not code or len(code) != 2 or code == "-99" or p.get("LABEL_X") is None:
        continue
    out[code] = [round(p["LABEL_X"], 2), round(p["LABEL_Y"], 2)]
json.dump(out, open(dst, "w"), separators=(",", ":"), sort_keys=True)
print("countries:", len(out))
