#!/usr/bin/env python3
"""The air-pollution pictures from NASA's GIBS service: which picture to show and its colour key.
Usage: build_air_legends.py <out dir>        (run by .github/workflows/air.yml every 2 hours)

GIBS lists every picture it serves in one capabilities document (Web Mercator, the projection our map uses).
For each kind below, the first listed layer that exists there is kept, with:
  the tile address template, the newest day available, the deepest zoom level,
  and its official colour map reduced to about a dozen colours, lowest value first, with the words at both ends.
Written: <out>/air_layers.json, and <out>/air_layers_log.txt with what was found (for checking)."""
import json, os, re, sys, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

OUT = sys.argv[1]
UA = 'tzofia/0.1 (+https://github.com/elimarshak/tzofia)'
CAPS_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml'
# kind -> layers to try, in order; then any layer whose name matches the pattern (the newest one wins)
KINDS = {
    'no2':  (['TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column', 'OMI_Nitrogen_Dioxide_Tropo_Column'], r'Nitrogen_Dioxide'),
    'so2':  (['TROPOMI_L2_Sulfur_Dioxide_Total_Vertical_Column', 'OMPS_NPP_SO2_PBL', 'OMI_SO2_Planetary_Boundary_Layer'], r'Sulfur_Dioxide|_SO2_'),
    'dust': (['VIIRS_NOAA20_AOD_Deep_Blue_Land_Ocean', 'VIIRS_SNPP_AOD_Deep_Blue_Land_Ocean', 'MODIS_Combined_Value_Added_AOD'], r'AOD|Aerosol_Optical'),
}
NS = {'w': 'http://www.opengis.net/wmts/1.0', 'ows': 'http://www.opengis.net/ows/1.1'}
XL = '{http://www.w3.org/1999/xlink}href'
log = []

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()

def layer_info(L):
    lid = L.findtext('ows:Identifier', namespaces=NS)
    fmt_url = None
    for ru in L.findall('w:ResourceURL', NS):
        if ru.get('resourceType') == 'tile':
            fmt_url = ru.get('template')
            if (ru.get('format') or '').endswith('png'): break
    tms = [t.text for t in L.findall('w:TileMatrixSetLink/w:TileMatrixSet', NS)]
    level = max((int(m.group(1)) for t in tms if (m := re.search(r'Level(\d+)$', t or ''))), default=None)
    day = None
    for d in L.findall('w:Dimension', NS):
        if d.findtext('ows:Identifier', namespaces=NS) == 'Time':
            day = (d.findtext('w:Default', namespaces=NS) or '').strip()[:10] or None
    cmaps = [m.get(XL) for m in L.findall('ows:Metadata', NS) if 'colormap' in (m.get(XL) or '')]
    return {'id': lid, 'template': fmt_url, 'level': level, 'tms': tms, 'day': day, 'colormaps': cmaps}

def colour_key(urls):
    for url in sorted(urls, key=lambda u: ('v1.3' not in u, 'v1.2' not in u)):
        try:
            root = ET.fromstring(get(url))
        except Exception as e:
            log.append(f'  colour map ERR {e} {url}'); continue
        best = None
        for cm in root.iter():
            if not cm.tag.endswith('ColorMap'): continue
            ents = [e for e in cm.iter() if e.tag.endswith('ColorMapEntry')
                    and e.get('transparent', 'false') != 'true' and e.get('nodata', 'false') != 'true']
            if ents and (best is None or len(ents) > len(best[1])): best = (cm, ents)
        if not best: log.append(f'  colour map empty {url}'); continue
        cm, ents = best
        legend = [e for e in cm.iter() if e.tag.endswith('LegendEntry')]
        cols = [[int(v) for v in e.get('rgb').split(',')[:3]] for e in ents]
        step = max(1, len(cols) // 12)
        stops = cols[::step] + ([cols[-1]] if (len(cols) - 1) % step else [])
        words = lambda e: (e.get('tooltip') or e.get('label') or e.get('value') or e.get('sourceValue') or '').strip()
        first = words(legend[0]) if legend else words(ents[0])
        last = words(legend[-1]) if legend else words(ents[-1])
        log.append(f'  colour map ok {len(ents)} entries, {cm.get("units")!r}, {first!r} .. {last!r} {url}')
        return {'stops': stops, 'first': first, 'last': last, 'units': cm.get('units') or ''}
    return None

caps = ET.fromstring(get(CAPS_URL))
layers = {}
for L in caps.iter('{%s}Layer' % NS['w']):
    lid = L.findtext('ows:Identifier', namespaces=NS)
    if lid: layers[lid] = L
log.append(f'capabilities: {len(layers)} layers')

out = {'fetched_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'source': 'NASA GIBS', 'layers': {}}
for kind, (names, pattern) in KINDS.items():
    found = [n for n in names if n in layers]
    similar = sorted(n for n in layers if re.search(pattern, n))
    log.append(f'{kind}: listed {found}; similar names: {similar[:40]}')
    pick = None
    for n in found + similar:
        info = layer_info(layers[n])
        if info['template'] and info['level'] and info['day']:
            if n in found: pick = info; break
            if pick is None or info['day'] > pick['day']: pick = info
    if not pick:
        log.append(f'{kind}: nothing usable'); continue
    key = colour_key(pick['colormaps'])
    log.append(f'{kind}: {pick["id"]} day {pick["day"]} level {pick["level"]} key {"yes" if key else "no"}')
    out['layers'][kind] = {'id': pick['id'], 'day': pick['day'], 'maxzoom': pick['level'],
                           'tiles': pick['template'].replace('{Time}', pick['day']).replace('{TileMatrixSet}', f'GoogleMapsCompatible_Level{pick["level"]}')
                                    .replace('{TileMatrix}', '{z}').replace('{TileRow}', '{y}').replace('{TileCol}', '{x}'),
                           'key': key}

open(os.path.join(OUT, 'air_layers_log.txt'), 'w').write('\n'.join(log) + '\n')
print('\n'.join(log))
if out['layers']:
    json.dump(out, open(os.path.join(OUT, 'air_layers.json'), 'w'), separators=(',', ':'))
