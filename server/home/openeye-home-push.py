#!/usr/bin/env python3
# OPENEYE home station: sends what our own aircraft receiver hears (readsb) to the site's database.
# Every 5 seconds it reads /run/readsb/aircraft.json and calls the database function public.home_ingest
# (db/migrations/0013_home_station.sql) with the station key. Only outgoing connections, nothing listens.
# The key is read from the file systemd hands over (LoadCredential); it is never printed.
import json, os, sys, time, urllib.request

API = 'https://wpnbzpulkyogdeuuqffh.supabase.co/rest/v1/rpc/home_ingest'
PUBLIC_KEY = 'sb_publishable_iz4Bq-MFx4C0gY38cDtGYw_PPRumPqT'   # the site's public key, the same as in web/config.js
SRC = '/run/readsb/aircraft.json'
EVERY = 5.0
KEEP = ('hex', 'flight', 'category', 'lat', 'lon', 'alt_baro', 'alt_geom', 'gs', 'track', 'baro_rate', 'geom_rate',
        'squawk', 'emergency', 'nic', 'nac_p', 'type', 'seen', 'seen_pos')


def station_key():
    path = os.path.join(os.environ.get('CREDENTIALS_DIRECTORY', '/etc/openeye'), 'homekey')
    if not os.path.exists(path):
        path = '/etc/openeye/home.key'
    with open(path) as f:
        return f.read().strip()


def payload():
    with open(SRC) as f:
        d = json.load(f)
    ac = [{k: a[k] for k in KEEP if k in a} for a in d.get('aircraft', [])
          if a.get('hex') and not a['hex'].startswith('~') and a.get('seen', 99) < 30]
    return {'now': d.get('now'), 'messages': d.get('messages'), 'aircraft': ac}


def send(key, data):
    body = json.dumps({'p_key': key, 'p_data': data}).encode()
    req = urllib.request.Request(API, data=body, method='POST', headers={
        'apikey': PUBLIC_KEY, 'Authorization': 'Bearer ' + PUBLIC_KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=8) as r:
        return r.read().decode()[:200]


def main():
    key = station_key()
    last_err, last_ok_log, sent = 0.0, 0.0, 0
    while True:
        t0 = time.time()
        try:
            res = send(key, payload())
            sent += 1
            if t0 - last_ok_log > 600:          # one line every 10 minutes, so the log shows it is alive
                print(f'ok: {sent} sends so far, last answer {res}', flush=True)
                last_ok_log = t0
        except Exception as e:                   # never stop; report at most once a minute
            if t0 - last_err > 60:
                print(f'send failed: {str(e)[:200]}', file=sys.stderr, flush=True)
                last_err = t0
        time.sleep(max(0.5, EVERY - (time.time() - t0)))


if __name__ == '__main__':
    main()
