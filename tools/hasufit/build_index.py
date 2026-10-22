# 'חשופית': writes index.json on the hasufit-data branch for the hidden page: for every point, its Hebrew title,
# the weeks whose summary was kept (newest first), and the date of each weekly run.
#   python build_index.py STORE_DIR POINTS_DIR
import json, os, sys, datetime as dt
STORE, POINTS = sys.argv[1], sys.argv[2]
log = json.load(open(f"{STORE}/log.json")) if os.path.exists(f"{STORE}/log.json") else {}
order = ["majdal-hadar", "jubata", "quneitra", "maariya", "khiam-hamames", "markaba-houla", "aitaroun-jaldeir", "ramiya", "labbouneh", "beaufort"]
names = sorted({*order, *[f[:-5] for f in os.listdir(POINTS) if f.endswith(".json") and not f.endswith(".osm.json")]},
               key=lambda n: order.index(n) if n in order else 99)
out = {"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "points": []}
for n in names:
    P = json.load(open(f"{POINTS}/{n}.json"))
    runs = log.get(n, [])
    weeks = []
    for r in reversed(runs):
        if r.get("kept") and os.path.exists(f"{STORE}/weeks/{r['week']}/{n}.jpg") and r["week"] not in [w["week"] for w in weeks]:
            weeks.append({"week": r["week"], "run": r.get("run"), "after_days": r.get("after_days")})
    out["points"].append({"id": n, "title": P["title_he"], "weeks": weeks, "last_run": runs[-1].get("run") if runs else None})
json.dump(out, open(f"{STORE}/index.json", "w"), ensure_ascii=False, indent=1)
print("index:", [(p["id"], len(p["weeks"])) for p in out["points"]])
