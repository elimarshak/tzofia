#!/bin/bash
# OPENEYE home station: installs the sender that passes our receiver's aircraft to the site.
# Run once by Ilya:  sudo bash ~/openeye-home/setup-home-push.sh
# Creates the station key (only if it does not exist yet), installs the sender as a service that starts
# at every boot, and prints the key's fingerprint (a one-way hash, safe to show) for the database.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
echo "[1/4] station key"
mkdir -p /etc/openeye && chmod 700 /etc/openeye
if [ ! -s /etc/openeye/home.key ]; then
  python3 -c "import secrets; print(secrets.token_urlsafe(32))" > /etc/openeye/home.key
fi
chmod 600 /etc/openeye/home.key
echo "[2/4] sender program"
install -d /usr/local/lib/openeye
install -m 644 "$HERE/openeye-home-push.py" /usr/local/lib/openeye/openeye-home-push.py
install -m 644 "$HERE/openeye-home-push.service" /etc/systemd/system/openeye-home-push.service
echo "[3/4] service on, starts at every boot"
systemctl daemon-reload
systemctl enable --now openeye-home-push
echo "[4/4] DONE. fingerprint:"
echo "FP $(tr -d '\n' < /etc/openeye/home.key | sha256sum | cut -c1-64)"
