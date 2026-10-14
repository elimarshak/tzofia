#!/usr/bin/env python3
"""Colour keys for the air-pollution pictures on the map. Usage: build_air_legends.py <out dir>

For each NASA (GIBS) layer, reads the official colour map and keeps the colours in order from the lowest value
to the highest (transparent entries are skipped), so the site can draw its own key with Hebrew words.
Also saves the CAMS colour key picture as it comes from ECMWF, for checking. Written: <out>/air_legends.json"""
import json, os, sys, urllib.request
import xml.etree.ElementTree as ET

OUT = sys.argv[1]
UA = 'tzofia/0.1 (+https://github.com/elimarshak/tzofia)'
GIBS = ['TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column', 'TROPOMI_L2_Sulfur_Dioxide_Total_Vertical_Column', 'VIIRS_NOAA20_AOD_Deep_Blue_Land_Ocean']
CAMS = 'https://eccharts.ecmwf.int/wms/?token=public&service=WMS&version=1.3.0&request=GetLegendGraphic&layer=composition_europe_pm2p5_forecast_surface&style=sh_pm2p5_web_surface_concentration&format=image/png'

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

out, log = {}, []
def colormap(lid):
    for v in ('v1.3', 'v1.2', 'v1.0'):
        url = f'https://gibs.earthdata.nasa.gov/colormaps/{v}/{lid}.xml'
        try:
            body = get(url); log.append(f'ok {len(body)} {url}'); return body
        except Exception as e:
            log.append(f'ERR {e} {url}')
    raise RuntimeError('no colour map')
for lid in GIBS:
    try:
        root = ET.fromstring(colormap(lid))
        best = None
        for cm in root.iter('ColorMap'):
            ents = [e for e in cm.iter('ColorMapEntry') if e.get('transparent', 'false') != 'true' and e.get('nodata', 'false') != 'true']
            if ents and (best is None or len(ents) > len(best[1])): best = (cm, ents)
        cm, ents = best
        cols = [[int(v) for v in e.get('rgb').split(',')] for e in ents]
        step = max(1, len(cols) // 10)
        stops = cols[::step] + ([cols[-1]] if (len(cols) - 1) % step else [])
        units = cm.get('units') or ''
        out[lid] = {'stops': stops, 'first': ents[0].get('label') or ents[0].get('value'), 'last': ents[-1].get('label') or ents[-1].get('value'), 'units': units, 'entries': len(ents)}
        print('ok', lid, len(ents), units, out[lid]['first'], out[lid]['last'])
    except Exception as e:
        print('ERR', lid, e); log.append(f'ERR parse {lid} {e}')
for name, url in (('legend_cams_pm25.png', CAMS), ('legend_cams_pm25_sld.png', CAMS + '&sld_version=1.1.0')):
    try:
        body = get(url); open(os.path.join(OUT, name), 'wb').write(body); log.append(f'ok {len(body)} {body[:60]!r} {url}')
    except Exception as e:
        log.append(f'ERR {e} {url}')
open(os.path.join(OUT, 'air_legends_log.txt'), 'w').write('\n'.join(log))
json.dump(out, open(os.path.join(OUT, 'air_legends.json'), 'w'), separators=(',', ':'))
