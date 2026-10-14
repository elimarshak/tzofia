#!/usr/bin/env python3
"""One-off probe: can the Ministry of Environmental Protection's live air-quality service be read from here,
and what do its answers look like? Writes probe.txt with status codes and the start of each answer."""
import json, sys, urllib.request, uuid

UA = 'tzofia/0.1 (+https://github.com/elimarshak/tzofia)'
BASE = 'https://air-papi.sviva.gov.il/v1/envista/'
out = []
def req(url, data=None, headers=None):
    h = {'User-Agent': UA, 'accept': 'application/json', 'origin': 'https://air.sviva.gov.il', 'referer': 'https://air.sviva.gov.il/',
         'domainname': 'sviva', 'envi-data-source': 'MANA'}
    h.update(headers or {})
    body = None if data is None else json.dumps(data).encode()
    if body is not None: h['content-type'] = 'application/json; charset=UTF-8'
    r = urllib.request.Request(url, data=body, headers=h, method='POST' if body is not None else 'GET')
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            t = resp.read().decode('utf-8', 'replace'); out.append(f'{resp.status} {len(t)} {url}'); return t
    except Exception as e:
        out.append(f'ERR {e} {url}'); return None

vt = str(uuid.uuid4())
api = req('https://air.sviva.gov.il/Account/GetApiToken', {'userName': 'Guest'}, {'x-requestverificationtoken': vt})
jwt = None
if api:
    jwt = req('https://air-papi.sviva.gov.il/v1/GenerateToken', {}, {'authorization': 'ApiToken ' + api.strip().strip('"'), 'x-requestverificationtoken': vt})
if jwt:
    H = {'authorization': 'JwtToken ' + jwt.strip(), 'x-requestverificationtoken': vt}
    for path in ['regions', 'pollutants', 'stations/index/latest?unitConversion=true&regionsIds=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15&hoursBack=3']:
        t = req(BASE + path, None, H)
        if t:
            out.append('--- ' + path)
            try:
                j = json.loads(t)
                out.append(json.dumps(j, ensure_ascii=False)[:6000])
            except Exception:
                out.append(t[:2000])
    # regional latest data for region 1 as a sample
    t = req(BASE + 'regions/data/latest?unitConversion=true&regionsIds=1&hoursBack=2', None, H)
    if t: out.append('--- regions/data/latest'); out.append(t[:8000])
open(sys.argv[1], 'w').write('\n'.join(out))
