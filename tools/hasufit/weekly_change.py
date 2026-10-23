# 'חשופית' weekly step for one point: decides whether the ground changed since last week's picture, and keeps
# only what is needed.  python weekly_change.py NAME ENH_DIR SUMMARY_DIR STORE_DIR WEEK
#   ENH_DIR      this week's enhanced point (before/after pictures and *_raw.npy from enhance_point.py)
#   SUMMARY_DIR  this week's rendered summary.png and summary.gif
#   STORE_DIR    the kept data: points/NAME/last_after_raw.npy, weeks/WEEK/NAME.jpg|.gif (every kept week), log.json
# A week's summary is kept only when the change against last week passes the threshold (or on the first run of a point).
# The score is the share of the picture where the colour changed by more than 4 robust standard deviations,
# after dropping isolated specks; it is logged every week so the threshold can be checked against what is seen.
import json, sys, os, shutil
import numpy as np
from PIL import Image
from scipy import ndimage

NAME, ENH, SUM, STORE, WEEK = sys.argv[1:6]
THRESHOLD = 0.004   # 0.4% of the 1.8 x 1.8 km window, about 13,000 square metres
os.makedirs(f"{STORE}/points/{NAME}", exist_ok=True)
log_path = f"{STORE}/log.json"
log = json.load(open(log_path)) if os.path.exists(log_path) else {}

now = np.load(f"{ENH}/after_raw.npy").astype(float)[:3]
prev_path = f"{STORE}/points/{NAME}/last_after_raw.npy"

def norm(x): return (x - np.median(x, axis=(1, 2), keepdims=True)) / (np.std(x, axis=(1, 2), keepdims=True) + 1e-6)
prev = np.load(prev_path).astype(float)[:3] if os.path.exists(prev_path) else None
if prev is not None and prev.shape != now.shape:
    prev = None          # last week's picture was made another way (another grid); this week starts a new series
if prev is not None:
    d = np.sqrt(((norm(now) - norm(prev)) ** 2).sum(0))
    m = np.median(d); s = 1.4826 * np.median(np.abs(d - m)) + 1e-9
    mask = ndimage.binary_opening((d - m) / s > 4, iterations=1)
    score = float(mask.mean()); first = False
else:
    score, first = None, True

keep = first or score >= THRESHOLD or os.environ.get("FORCE_KEEP") == "1"
meta = json.load(open(f"{ENH}/meta.json"))
import datetime as dt
log.setdefault(NAME, []).append({"week": WEEK, "run": dt.date.today().isoformat(), "score": score, "kept": keep, "first": first,
                                 "after_days": meta["after"].get("composite_days"), "after_platforms": meta["after"].get("platforms"),
                                 "before_date": meta["before"]["datetime"][:10], "after_date": meta["after"]["datetime"][:10]})
if keep:
    os.makedirs(f"{STORE}/weeks/{WEEK}", exist_ok=True)
    Image.open(f"{SUM}/summary.png").convert("RGB").save(f"{STORE}/weeks/{WEEK}/{NAME}.jpg", quality=88, optimize=True)
    # the moving picture is the reveal (a line moving right to left uncovers 'after'), chosen by Ilya on 23.10.2026
    shutil.copy(f"{SUM}/summary_wipe.gif" if os.path.exists(f"{SUM}/summary_wipe.gif") else f"{SUM}/summary.gif", f"{STORE}/weeks/{WEEK}/{NAME}.gif")
    # the still picture and the moving picture of every kept week stay in the archive (Ilya, 23.10.2026)
np.save(prev_path, np.load(f"{ENH}/after_raw.npy"))
json.dump(log, open(log_path, "w"), ensure_ascii=False, indent=1)
print(NAME, "score", score, "kept", keep)
