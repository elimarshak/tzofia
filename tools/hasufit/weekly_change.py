# 'חשופית' weekly step for one point: decides whether the ground changed since last week's picture, and keeps
# only what is needed.  python weekly_change.py NAME ENH_DIR SUMMARY_DIR STORE_DIR WEEK
#   ENH_DIR      this week's enhanced point (before/after pictures and *_raw.npy from enhance_point.py)
#   SUMMARY_DIR  this week's rendered summary.png and summary.gif
#   STORE_DIR    the kept data: points/NAME/last_after_raw.npy, weeks/WEEK/NAME.jpg|.gif, log.json
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
if os.path.exists(prev_path):
    prev = np.load(prev_path).astype(float)[:3]
    d = np.sqrt(((norm(now) - norm(prev)) ** 2).sum(0))
    m = np.median(d); s = 1.4826 * np.median(np.abs(d - m)) + 1e-9
    mask = ndimage.binary_opening((d - m) / s > 4, iterations=1)
    score = float(mask.mean()); first = False
else:
    score, first = None, True

keep = first or score >= THRESHOLD
meta = json.load(open(f"{ENH}/meta.json"))
log.setdefault(NAME, []).append({"week": WEEK, "score": score, "kept": keep, "first": first,
                                 "after_days": meta["after"].get("composite_days"), "after_platforms": meta["after"].get("platforms")})
if keep:
    os.makedirs(f"{STORE}/weeks/{WEEK}", exist_ok=True)
    Image.open(f"{SUM}/summary.png").convert("RGB").save(f"{STORE}/weeks/{WEEK}/{NAME}.jpg", quality=88, optimize=True)
    shutil.copy(f"{SUM}/summary.gif", f"{STORE}/weeks/{WEEK}/{NAME}.gif")
np.save(prev_path, np.load(f"{ENH}/after_raw.npy"))
json.dump(log, open(log_path, "w"), ensure_ascii=False, indent=1)
print(NAME, "score", score, "kept", keep)
