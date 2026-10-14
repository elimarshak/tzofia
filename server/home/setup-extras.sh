#!/bin/bash
# OPENEYE home station, second round (decided by Ilya on 15.10.2026):
#   ships heard at home go to the site, the scanner shows the right place and opens on Ben Gurion approach,
#   recordings get a listening page and are kept for half a year.
# Run once by Ilya:  sudo bash ~/openeye-home/setup-extras.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
step() { echo; echo "[$1/6] $2"; }

step 1 "the sender also sends ships"
install -m 644 "$HERE/openeye-home-push.py" /usr/local/lib/openeye/openeye-home-push.py
systemctl restart openeye-home-push && echo "   sender restarted"

step 2 "scanner: name, place, and Ben Gurion approach first"
docker stop owrxp >/dev/null
docker cp owrxp:/var/lib/openwebrx/settings.json /tmp/owrx-settings.json
cp /tmp/owrx-settings.json /root/owrx-settings.bak-extras.json
python3 - <<'PY'
import json
p = '/tmp/owrx-settings.json'
d = json.load(open(p))
d['receiver_name'] = 'OPENEYE'
d['receiver_location'] = 'תל אביב-יפו'
d['receiver_gps'] = {'lat': 32.05, 'lon': 34.76}
d['receiver_asl'] = 20
prof = d['sdrs']['rtl1']['profiles']
d['sdrs']['rtl1']['profiles'] = {'air2': prof['air2'], **{k: v for k, v in prof.items() if k != 'air2'}}
json.dump(d, open(p, 'w'), indent=4)
print('   first range now:', list(d['sdrs']['rtl1']['profiles'])[0])
PY
docker cp /tmp/owrx-settings.json owrxp:/var/lib/openwebrx/settings.json
docker start owrxp >/dev/null && echo "   scanner started again"

step 3 "recordings sorted into one folder per day"
sed -i 's/split_on_transmission = true;/split_on_transmission = true; dated_subdirectories = true;/' /opt/openeye/airband/rtl_airband.conf
docker restart airband >/dev/null && echo "   recorder restarted"
moved=0
for ch in approach tower; do
  for f in /opt/openeye/recordings/$ch/${ch}_*.mp3; do
    [ -e "$f" ] || continue
    b=$(basename "$f"); d=$(echo "$b" | sed -E 's/^[a-z]+_([0-9]{4})([0-9]{2})([0-9]{2})_.*/\1\/\2\/\3/')
    mkdir -p "/opt/openeye/recordings/$ch/$d" && mv "$f" "/opt/openeye/recordings/$ch/$d/" && moved=$((moved+1))
  done
done
echo "   earlier recordings moved into day folders: $moved"

step 4 "the listening page"
mkdir -p /opt/openeye/recordings-page
install -m 644 "$HERE/recordings/index.html" /opt/openeye/recordings-page/index.html
install -m 644 "$HERE/recordings/nginx.conf" /opt/openeye/recordings-nginx.conf
curl -fsS -m 30 -o /opt/openeye/recordings-page/Heebo.ttf https://openeye.co.il/fonts/Heebo.ttf && echo "   font downloaded" || echo "   font not downloaded (the page still works)"
docker rm -f recordings >/dev/null 2>&1
docker run -d --name recordings --restart unless-stopped -p 8075:80 \
  -v /opt/openeye/recordings:/recordings:ro \
  -v /opt/openeye/recordings-page:/srv/page:ro \
  -v /opt/openeye/recordings-nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine >/dev/null && echo "   page started"

step 5 "recordings older than half a year are deleted once a day (Ilya approved half a year)"
cat > /etc/cron.d/openeye-recordings <<'CRON'
# OPENEYE: keep recordings for half a year (183 days), approved by Ilya on 15.10.2026
17 4 * * * root find /opt/openeye/recordings -type f -name '*.mp3' -mtime +183 -delete; find /opt/openeye/recordings -mindepth 2 -type d -empty -delete
CRON
chmod 644 /etc/cron.d/openeye-recordings && echo "   daily cleanup set"

step 6 "check after 20 seconds"
sleep 20
systemctl is-active openeye-home-push | sed 's/^/   sender: /'
docker ps --format '   {{.Names}}: {{.Status}}' | grep -E 'owrxp|airband|recordings'
echo "DONE-EXTRAS"
