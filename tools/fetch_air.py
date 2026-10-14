#!/usr/bin/env python3
"""Keeps our own copy of the Ministry of Environmental Protection's open air-quality data on the data branch.
Usage: fetch_air.py <data dir>

Source: the government open-data portal data.gov.il (licence: free use, the source must be credited).
Files written into <data dir> (a file whose download failed keeps its previous copy):
  air_stations.json  the national air-monitoring stations: name, place, operator, what each measures, position
                     (the portal gives Israeli grid coordinates, EPSG:2039; converted here to longitude and latitude)
  air_forecast.json  the Ministry's air-quality forecast: the level for each of 14 regions, the text for today and
                     tomorrow (morning, afternoon to evening, evening) and the Ministry's warning when it is on
Every address is requested once per run; an error only skips that file."""
import json, os, sys, urllib.request
from datetime import datetime, timezone
from pyproj import Transformer

OUT = sys.argv[1]
UA = 'tzofia/0.1 (+https://github.com/elimarshak/tzofia)'
API = 'https://data.gov.il/api/3/action/datastore_search?resource_id={}&limit=1000'
STATIONS = '782cfb94-ebbd-4f41-aba2-80c298457a58'   # dataset 'תחנות ניטור איכות אוויר'
FORECAST = 'a976089d-e8e5-4013-8f3d-777b8551c684'   # dataset 'תחזית חצי-יומית למזהמי אוויר'
NOW = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def records(rid):
    req = urllib.request.Request(API.format(rid), headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.loads(r.read().decode('utf-8'))
            recs = j['result']['records'] if j.get('success') else None
            print(f'{r.status} {len(recs or [])} records  {rid}')
            return recs
    except Exception as e:
        print(f'ERR {e}  {rid}')
        return None

def save(name, obj):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

def clean(v):
    v = '' if v is None else str(v).replace('_x000D_', '').strip()   # '_x000D_' is a line break left over from Excel
    return '' if v.lower() in ('null', 'none', 'nan') else v

# --- stations ---
recs = records(STATIONS)
if recs:
    to_wgs = Transformer.from_crs('EPSG:2039', 'EPSG:4326', always_xy=True)
    out = []
    for r in recs:
        try: x, y = float(r['X']), float(r['Y'])
        except (TypeError, ValueError, KeyError): continue
        lon, lat = to_wgs.transform(x, y)
        if not (29 < lat < 34 and 34 < lon < 36.5): continue   # a row with a broken position is left out
        year = clean(r.get('שנת הקמה')).split('.')[0]
        out.append({
            'id': r['_id'], 'name': clean(r.get('שם התחנה החדש')), 'old': clean(r.get('שם התחנה הישן')),
            'region': clean(r.get('אזור')), 'city': clean(r.get('ישוב')), 'place': clean(r.get('מיקום')), 'address': clean(r.get('כתובת')),
            'operator': clean(r.get('הגוף המנטר')).removesuffix(' iso').strip(),
            'kind': clean(r.get('סוג התחנה')), 'kind_en': clean(r.get('Station type')),
            'area': clean(r.get('סיווג אזור')), 'area_en': clean(r.get('Area type')),
            'year': year, 'pollutants': clean(r.get('מזהמי אוויר')).split(), 'weather': clean(r.get('פרמטרים מטאורולוגיים')).split(),
            'lat': round(lat, 5), 'lon': round(lon, 5)})
    print(f'stations kept: {len(out)} of {len(recs)}')
    if out: save('air_stations.json', {'fetched_at': NOW, 'source': 'data.gov.il', 'stations': out})

# --- forecast ---
recs = records(FORECAST)
if recs:
    regions, days, warning = [], [], None
    for r in recs:
        if r.get('type') == 'Map':
            try: color = json.loads(r.get('fill_color') or 'null')
            except ValueError: color = None
            regions.append({'code': clean(r.get('name')), 'name': clean(r.get('title')), 'level': clean(r.get('air_quality')), 'color': color})
        elif r.get('name') == 'Warning':
            warning = {'show': clean(r.get('show')) == 'true', 'day': clean(r.get('day_of_week')), 'date': clean(r.get('date')), 'text': clean(r.get('content'))}
        elif r.get('name') in ('OneDay', 'TwoDay'):
            parts = [{'label': clean(r.get(k)), 'text': clean(r.get(k + '_content'))} for k in ('morning', 'noon', 'evening')]
            days.append({'day': clean(r.get('day_of_week')), 'date': clean(r.get('date')), 'parts': [p for p in parts if p['label']]})
    if regions:
        save('air_forecast.json', {'fetched_at': NOW, 'source': 'data.gov.il', 'regions': regions, 'days': days, 'warning': warning})
