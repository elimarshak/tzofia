# 'חשופית' weekly step for one point: decides whether the ground changed since the last kept picture, and keeps
# only what is needed.  python weekly_change.py NAME ENH_DIR SUMMARY_DIR STORE_DIR WEEK
#   ENH_DIR      this week's enhanced point (before/after pictures and *_raw.npy from sr_point.py)
#   SUMMARY_DIR  this week's rendered summary.png and summary.gif
#   STORE_DIR    the kept data: points/NAME/last_after_raw.npy, weeks/WEEK/NAME.jpg|.gif (every kept week), log.json
# A week's summary is kept only when the area that changed since the last kept picture passes MIN_AREA_M2 (or on the
# first run of a point). The comparison is always against the last KEPT picture, so slow works add up until they show.
# How the area is measured, on the original 10 m pixels (the sharpened picture is averaged back to them):
#   1. each colour of the old picture is fitted to the new one, which removes differences of light and haze;
#   2. the change of each pixel is the smallest over shifts of up to one pixel, since two passes can be slightly offset;
#   3. a pixel changed when its reflectance moved by more than MIN_CHANGE, and only patches of MIN_PIXELS or more count.
# The values were chosen on 2.11.2026 from all clear passes of the ten points since July 2026 and September 2023.
import json, sys, os, shutil, datetime as dt
import numpy as np
from PIL import Image
from scipy import ndimage

MIN_CHANGE = 300       # reflectance x 10,000, that is 3%
MIN_PIXELS = 6         # 600 square metres of one connected patch
MIN_AREA_M2 = 3000     # in the whole 1.8 x 1.8 km window
MAX_EMPTY = 0.003      # a picture with more empty pixels than this is not a picture of the whole window
BLOCK = 4              # 2.5 m pixels in a 10 m pixel


def tenm(a):
    h, w = (np.array(a.shape[1:]) // BLOCK) * BLOCK
    return a[:, :h, :w].reshape(a.shape[0], h // BLOCK, BLOCK, w // BLOCK, BLOCK).astype("float64").mean((2, 4))


def empty_share(a):
    return float((a[:3] == 0).all(0).mean())


def fit(a, b):
    out = np.empty_like(a)
    for k in range(a.shape[0]):
        x, y = a[k].ravel(), b[k].ravel()
        keep = np.ones(x.size, bool)
        for _ in range(3):
            g, c = np.polyfit(x[keep], y[keep], 1)
            r = y - (g * x + c)
            s = max(1.4826 * np.median(np.abs(r[keep] - np.median(r[keep]))), 5.0)  # two nearly identical pictures have no spread
            keep = np.abs(r) < 2.5 * s
        out[k] = g * a[k] + c
    return out


def changed_m2(prev, now):
    p = fit(prev, now)
    d = None
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            e = np.abs(np.roll(np.roll(p, dy, 1), dx, 2) - now).mean(0)
            d = e if d is None else np.minimum(d, e)
    d[0, :] = d[-1, :] = 0
    d[:, 0] = d[:, -1] = 0
    lab, n = ndimage.label(d > MIN_CHANGE, structure=np.ones((3, 3)))
    if not n:
        return 0
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    return int(sizes[sizes >= MIN_PIXELS].sum()) * 100


def main():
    NAME, ENH, SUM, STORE, WEEK = sys.argv[1:6]
    force = os.environ.get("FORCE_KEEP") == "1"
    os.makedirs(f"{STORE}/points/{NAME}", exist_ok=True)
    log_path = f"{STORE}/log.json"
    log = json.load(open(log_path)) if os.path.exists(log_path) else {}
    raw = np.load(f"{ENH}/after_raw.npy")
    meta = json.load(open(f"{ENH}/meta.json"))
    after_date = meta["after"]["datetime"][:10]
    entry = {"week": WEEK, "run": dt.date.today().isoformat(), "changed_m2": None, "kept": False, "first": False, "after_days": None,
             "after_platforms": meta["after"].get("platforms"), "before_date": meta["before"]["datetime"][:10], "after_date": after_date}
    prev_path = f"{STORE}/points/{NAME}/last_after_raw.npy"
    prev = np.load(prev_path) if os.path.exists(prev_path) else None
    if prev is not None and (prev.shape != raw.shape or empty_share(prev) > MAX_EMPTY):
        prev = None          # the kept picture is of another grid, or it does not cover the window: start a new series
    last_kept = next((r for r in reversed(log.get(NAME, [])) if r.get("kept") and os.path.exists(f"{STORE}/weeks/{r['week']}/{NAME}.jpg")), None)

    if empty_share(raw) > MAX_EMPTY:
        entry["note"] = "the picture does not cover the whole window"
    elif prev is None:
        entry["first"] = entry["kept"] = True
    elif last_kept and last_kept.get("after_date") == after_date:
        entry["note"] = "no new clear pass since the last kept picture"
        entry["changed_m2"] = 0
    else:
        entry["changed_m2"] = changed_m2(tenm(prev[:3]), tenm(raw[:3]))
        entry["kept"] = entry["changed_m2"] >= MIN_AREA_M2
    if force and empty_share(raw) <= MAX_EMPTY:
        entry["kept"] = True

    if entry["kept"]:
        os.makedirs(f"{STORE}/weeks/{WEEK}", exist_ok=True)
        Image.open(f"{SUM}/summary.png").convert("RGB").save(f"{STORE}/weeks/{WEEK}/{NAME}.jpg", quality=88, optimize=True)
        # the moving picture is the reveal (a line moving right to left uncovers 'after'), chosen by Ilya on 23.10.2026
        shutil.copy(f"{SUM}/summary_wipe.gif" if os.path.exists(f"{SUM}/summary_wipe.gif") else f"{SUM}/summary.gif", f"{STORE}/weeks/{WEEK}/{NAME}.gif")
        # the still picture and the moving picture of every kept week stay in the archive (Ilya, 23.10.2026)
        np.save(prev_path, raw)
    log.setdefault(NAME, []).append(entry)
    json.dump(log, open(log_path, "w"), ensure_ascii=False, indent=1)
    print(NAME, "changed m2", entry["changed_m2"], "kept", entry["kept"], entry.get("note", ""))


if __name__ == "__main__":
    main()
