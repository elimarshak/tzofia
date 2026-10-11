#!/usr/bin/env python3
"""Keeps our own copy of public space data from CelesTrak on the data branch. Usage: fetch_space.py <data dir>

Files written into <data dir> (a file whose download failed keeps its previous copy):
  celestrak_active.csv  active satellites (orbital elements, CSV)
  celestrak_debris.csv  debris of the four big breakups CelesTrak publishes as groups
  socrates.csv          the closest predicted approaches between two objects in the next 7 days (CelesTrak SOCRATES)
  socrates_gp.csv       orbital elements of objects in those approaches that are in neither file above
  fetched_at.txt        time of this run

CelesTrak asks for at most one download of the same data per update and no retries after an error,
so every address is requested once per run and an error only skips that file."""
import csv, io, os, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

OUT = sys.argv[1]
UA = 'tzofia/0.1 (+https://github.com/elimarshak/tzofia)'
GP = 'https://celestrak.org/NORAD/elements/gp.php?{}&FORMAT=csv'
DEBRIS = ['cosmos-1408-debris', 'fengyun-1c-debris', 'iridium-33-debris', 'cosmos-2251-debris']
SOC = 'https://celestrak.org/SOCRATES/sort-minRange.csv'
TOP = 40          # approaches kept
MAX_SINGLE = 30   # at most this many one-object element requests per run

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read().decode('utf-8', 'replace')
            print(f'{r.status} {len(body):>9} bytes  {url}')
            return body
    except Exception as e:   # no retry, by CelesTrak's request
        print(f'ERR {e}  {url}')
        return None

def gp_ok(text):
    return bool(text) and text.lstrip('﻿').startswith('OBJECT_NAME')

def save(name, text):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='') as f:
        f.write(text)

def ids(text):
    return {r['NORAD_CAT_ID'] for r in csv.DictReader(io.StringIO(text.lstrip('﻿')))}

def read(name):
    p = os.path.join(OUT, name)
    return open(p, encoding='utf-8').read() if os.path.exists(p) else ''

# 1. active satellites (the site cannot work without them: stop if this fails)
active = get(GP.format('GROUP=active'))
if not gp_ok(active):
    print('active catalogue missing; stopping'); sys.exit(1)
save('celestrak_active.csv', active)

# 2. debris: one file with a single header line
parts = []
for g in DEBRIS:
    t = get(GP.format('GROUP=' + g)); time.sleep(1)
    if gp_ok(t): parts.append(t.lstrip('﻿').rstrip('\n').split('\n'))
    else: print('  skipped', g, (t or '')[:120].replace('\n', ' '))
if len(parts) == len(DEBRIS):
    save('celestrak_debris.csv', '\n'.join(parts[0][:1] + [ln for p in parts for ln in p[1:]]) + '\n')
else:
    print('debris incomplete; keeping the previous copy')

# 3. closest approaches in the next 7 days
soc = get(SOC)
if soc and soc.lstrip('﻿').startswith('NORAD_CAT_ID_1'):
    rows = list(csv.DictReader(io.StringIO(soc.lstrip('﻿'))))
    print('SOCRATES columns:', list(rows[0].keys()) if rows else None, ' rows:', len(rows))
    now = datetime.now(timezone.utc)
    def tca(r):
        try: return datetime.strptime(r['TCA'][:19], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
        except Exception: return None
    keep = [r for r in rows if tca(r) and now <= tca(r) <= now + timedelta(days=7)]
    keep.sort(key=lambda r: float(r['TCA_RANGE']))
    keep = keep[:TOP]
    for r in keep[:5]: print('  ', r)
    buf = io.StringIO(); w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()), lineterminator='\n')
    w.writeheader(); w.writerows(keep)
    save('socrates.csv', buf.getvalue())
    # 4. elements for objects we do not already have (one request each, capped)
    known = ids(active) | (ids(read('celestrak_debris.csv')) if read('celestrak_debris.csv') else set())
    need = []
    for r in keep:
        for k in ('NORAD_CAT_ID_1', 'NORAD_CAT_ID_2'):
            if r[k] not in known and r[k] not in need: need.append(r[k])
    print('objects without elements:', len(need))
    lines = []
    for n in need[:MAX_SINGLE]:
        t = get(GP.format('CATNR=' + n)); time.sleep(1)
        if gp_ok(t):
            ls = t.lstrip('﻿').rstrip('\n').split('\n')
            if not lines: lines.append(ls[0])
            lines.extend(ls[1:])
    save('socrates_gp.csv', '\n'.join(lines) + '\n' if lines else '')
else:
    print('SOCRATES not available; keeping the previous copy.', (soc or '')[:200].replace('\n', ' '))

save('fetched_at.txt', datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ') + '\n')
