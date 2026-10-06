#!/usr/bin/env python3
"""Builds the small lookup files the site uses to name airlines and routes.
Source: github.com/vradarserver/standing-data (CC0, public domain). Usage: build_ref.py <standing-data dir> <out dir>"""
import csv, json, os, re, sys

src, out = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out, 'routes'), exist_ok=True)

def rows(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        yield from csv.DictReader(f)

def norm(cs):   # ELY001 and ELY1 are the same flight: drop leading zeros of the number
    m = re.match(r'^([A-Z]{3})0*(\d.*)$', cs)
    return m.group(1) + m.group(2) if m else cs

airlines = {r['ICAO']: r['Name'] for r in rows(os.path.join(src, 'airlines/schema-01/airlines.csv')) if r.get('ICAO') and r.get('Name')}
json.dump(airlines, open(os.path.join(out, 'airlines.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

used, files, total = set(), 0, 0
root = os.path.join(src, 'routes/schema-01')
for d in sorted(os.listdir(root)):
    p = os.path.join(root, d)
    if not os.path.isdir(p): continue
    for fn in sorted(os.listdir(p)):
        if not fn.endswith('.csv'): continue
        prefix = fn.split('-')[0]
        if not re.fullmatch(r'[A-Z0-9]{2,4}', prefix): continue
        table = {}
        for r in rows(os.path.join(p, fn)):
            cs, codes = (r.get('Callsign') or '').strip().upper(), (r.get('AirportCodes') or '').strip()
            if cs and codes:
                table[norm(cs)] = codes
                used.update(codes.split('-'))
        if table:
            json.dump(table, open(os.path.join(out, 'routes', prefix + '.json'), 'w'), separators=(',', ':'))
            files += 1; total += len(table)

airports = {}
aroot = os.path.join(src, 'airports/schema-01')
for d in sorted(os.listdir(aroot)):
    p = os.path.join(aroot, d)
    if not os.path.isdir(p): continue
    for fn in sorted(os.listdir(p)):
        if not fn.endswith('.csv'): continue
        for r in rows(os.path.join(p, fn)):
            code = r.get('ICAO') or r.get('Code')
            if code in used:
                airports[code] = [r.get('Name', ''), r.get('Location', ''), r.get('CountryISO2', '')]
json.dump(airports, open(os.path.join(out, 'airports.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'airlines {len(airlines)}, route files {files}, routes {total}, airports {len(airports)}')
