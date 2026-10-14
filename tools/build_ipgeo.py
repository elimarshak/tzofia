#!/usr/bin/env python3
"""Our own table for telling a visitor's country (and, in Israel, city) from the network address, without asking any
outside service at visit time. Usage: build_ipgeo.py <out dir>        (run monthly by .github/workflows/ipgeo.yml)

Source: DB-IP "IP to City Lite" (licence CC BY 4.0, credit "IP Geolocation by DB-IP"), downloaded once a month.
Only what the visit counter needs is kept: the country of every address range, and the city for ranges in Israel.
Neighbouring ranges with the same answer are merged. IPv6 ranges are cut to their first 64 bits, which is the
smallest block a home or phone connection gets.
Written: <out>/ipgeo.json = { labels: ["IL|Tel Aviv", "US", ...], v4: { d: [start deltas], l: [label index] },
                              v6: { s: ["2a0d0000...", 16 hex digits], l: [label index] }, month }"""
import csv, gzip, io, ipaddress, json, os, sys, urllib.request
from datetime import date, timedelta

OUT = sys.argv[1]
UA = 'tzofia/0.1 (+https://github.com/elimarshak/tzofia)'

def fetch():
    m = date.today().replace(day=1)
    for _ in range(3):   # the new month's file appears a few days into the month, so earlier months are tried too
        url = f'https://download.db-ip.com/free/dbip-city-lite-{m:%Y-%m}.csv.gz'
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=300)
            print('downloading', url, flush=True)
            return f'{m:%Y-%m}', r.read()
        except Exception as e:
            print('not available', url, e, flush=True)
        m = (m - timedelta(days=1)).replace(day=1)
    raise SystemExit('no DB-IP file found')

month, raw = fetch()
print(f'{len(raw) / 1e6:.0f} MB compressed', flush=True)
labels, index = [], {}
def lab(x):
    if x not in index: index[x] = len(labels); labels.append(x)
    return index[x]

v4s, v4l, v6s, v6l = [], [], [], []
rows = 0
with gzip.open(io.BytesIO(raw), 'rt', encoding='utf-8', newline='') as f:
    for row in csv.reader(f):
        rows += 1
        if rows % 1_000_000 == 0: print(f'{rows:,} rows read', flush=True)
        start, country, city = row[0], row[3], row[5]
        name = f'IL|{city}' if country == 'IL' and city else country
        li = lab(name)
        if ':' in start:
            key = f'{int(ipaddress.IPv6Address(start)) >> 64:016x}'
            if v6s and v6s[-1] == key: continue          # several ranges inside one /64: the first one stands
            if v6l and v6l[-1] == li: continue           # same answer as the range before it: merged
            v6s.append(key); v6l.append(li)
        else:
            n = int(ipaddress.IPv4Address(start))
            if v4l and v4l[-1] == li: continue
            v4s.append(n); v4l.append(li)

deltas = [v4s[0]] + [b - a for a, b in zip(v4s, v4s[1:])] if v4s else []
out = {'month': month, 'source': 'DB-IP IP to City Lite (CC BY 4.0)', 'labels': labels,
       'v4': {'d': deltas, 'l': v4l}, 'v6': {'s': v6s, 'l': v6l}}
path = os.path.join(OUT, 'ipgeo.json')
with open(path, 'w') as f: json.dump(out, f, separators=(',', ':'))
print(f'{rows:,} rows -> {len(v4s):,} IPv4 ranges, {len(v6s):,} IPv6 ranges, {len(labels):,} labels, '
      f'{os.path.getsize(path) / 1e6:.1f} MB', flush=True)
