#!/bin/bash
# OPENEYE home station: gives the three new receivers their jobs (decided by Ilya on 15.10.2026).
# Run once by Ilya:  sudo bash ~/openeye-home/setup-receivers.sh
#   receiver 00000004 -> renamed SCAN0004, the web scanner (OpenWebRX+). The new name has letters, so no program
#                        can mistake it for a receiver's position number now that five receivers are connected.
#   receiver 00000002 -> records Ben Gurion approach, 120.500 (rtl_airband)
#   receiver 00000003 -> records Ben Gurion tower, 134.600 (rtl_airband)
#   receiver 00000005 -> ships (AIS-catcher), its map on port 8100
#   receiver 00001090 -> aircraft (readsb), untouched
# Recordings: /opt/openeye/recordings, listed on port 8075 (home network and the private Tailscale link only).
set -u
step() { echo; echo "[$1/7] $2"; }

step 1 "stopping the scanner for a moment"
docker stop owrxp >/dev/null && echo "   scanner stopped"

step 2 "finding the scanner's receiver"
N=""
for i in 0 1 2 3 4 5; do
  if rtl_eeprom -d $i 2>&1 | grep -q "Serial number:.*00000004"; then N=$i; fi
done
if [ -z "$N" ]; then
  if rtl_eeprom -d 0 2>&1 | grep -q SCAN0004 || ls /sys/bus/usb/devices/*/serial | xargs cat 2>/dev/null | grep -q SCAN0004; then
    echo "   already named SCAN0004"
  else
    echo "STOP: the scanner's receiver was not found. Nothing was changed."; docker start owrxp >/dev/null; exit 1
  fi
else
  echo "   found (position $N), writing the name SCAN0004"
  echo y | rtl_eeprom -d $N -s SCAN0004 >/tmp/eeprom.log 2>&1 || { cat /tmp/eeprom.log; docker start owrxp >/dev/null; exit 1; }
fi

step 3 "the scanner uses the new name"
docker cp owrxp:/var/lib/openwebrx/settings.json /tmp/owrx-settings.json
cp /tmp/owrx-settings.json /root/owrx-settings.bak-receivers.json
python3 - <<'PY'
import json
p = '/tmp/owrx-settings.json'
d = json.load(open(p))
d['sdrs']['rtl1']['device'] = 'SCAN0004'
json.dump(d, open(p, 'w'), indent=4)
print('   scanner -> SCAN0004')
PY
docker cp /tmp/owrx-settings.json owrxp:/var/lib/openwebrx/settings.json

echo
echo ">>> NOW: unplug the SCANNER receiver from the computer (the one with the brown RF1 cable),"
echo ">>> wait 3 seconds, plug it back in, then press Enter here."
read -r _
for t in $(seq 1 20); do
  grep -qs SCAN0004 /sys/bus/usb/devices/*/serial && break
  sleep 1
done
if grep -qs SCAN0004 /sys/bus/usb/devices/*/serial; then echo "   scanner receiver seen as SCAN0004"; else echo "   NOTE: SCAN0004 not seen yet, check the plug"; fi
docker start owrxp >/dev/null && echo "   scanner started again"

step 4 "recorder settings"
mkdir -p /opt/openeye/airband /opt/openeye/recordings/approach /opt/openeye/recordings/tower
cat > /opt/openeye/airband/rtl_airband.conf <<'CONF'
# OPENEYE: record Ben Gurion approach and tower, one file per transmission
devices:
(
  {
    type = "rtlsdr";
    serial = "00000002";
    gain = 30.0;
    centerfreq = 120.0;
    correction = 0;
    channels:
    (
      {
        freq = 120.5;
        outputs: ( { type = "file"; directory = "/recordings/approach"; filename_template = "approach"; split_on_transmission = true; include_freq = false; } );
      }
    );
  },
  {
    type = "rtlsdr";
    serial = "00000003";
    gain = 30.0;
    centerfreq = 134.2;
    correction = 0;
    channels:
    (
      {
        freq = 134.6;
        outputs: ( { type = "file"; directory = "/recordings/tower"; filename_template = "tower"; split_on_transmission = true; include_freq = false; } );
      }
    );
  }
);
CONF
cat > /opt/openeye/recordings-nginx.conf <<'CONF'
server {
  listen 80;
  root /usr/share/nginx/html;
  charset utf-8;
  location / { autoindex on; autoindex_localtime on; }
}
CONF
echo "   done"

step 5 "downloading the recorder, the ship receiver and the recordings page (about 2 minutes)"
for img in ghcr.io/sdr-enthusiasts/docker-rtlsdrairband:latest ghcr.io/jvde-github/ais-catcher:latest nginx:alpine; do
  echo "   downloading $img ..."
  docker pull -q "$img" >/dev/null && echo "   ok" || echo "   FAILED: $img"
done

step 6 "starting them, each starts again at every boot"
docker rm -f airband aiscatcher recordings >/dev/null 2>&1
docker run -d --name airband --restart unless-stopped \
  --device-cgroup-rule 'c 189:* rwm' -v /dev/bus/usb:/dev/bus/usb:ro \
  -v /opt/openeye/airband:/run/rtlsdr-airband -v /opt/openeye/recordings:/recordings \
  -e RTLSDRAIRBAND_CUSTOMCONFIG=1 -e ICECAST_DISABLE=true \
  ghcr.io/sdr-enthusiasts/docker-rtlsdrairband:latest >/dev/null && echo "   recorder started"
docker run -d --name aiscatcher --restart unless-stopped \
  --device-cgroup-rule 'c 189:* rwm' -v /dev/bus/usb:/dev/bus/usb:ro -p 8100:8100 \
  ghcr.io/jvde-github/ais-catcher:latest -d 00000005 -gr TUNER auto -N 8100 >/dev/null && echo "   ship receiver started"
docker run -d --name recordings --restart unless-stopped -p 8075:80 \
  -v /opt/openeye/recordings:/usr/share/nginx/html:ro \
  -v /opt/openeye/recordings-nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine >/dev/null && echo "   recordings page started"

step 7 "check after 20 seconds"
sleep 20
docker ps --format '   {{.Names}}: {{.Status}}' | grep -E 'owrxp|airband|aiscatcher|recordings'
echo "DONE-RECEIVERS"
