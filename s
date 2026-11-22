#!/bin/bash
# OPENEYE home server, one-time setup for remote management. Run on the server:
#   curl -L elimarshak.github.io/tzofia/s | sudo bash
# 1. Firewall: the server accepts connections only from the home network it is on.
# 2. The management page (Cockpit, port 9090) may be opened without encryption, so the
#    Claude app's browser pane can open it. The firewall keeps it reachable from home only.
set -e
if [ "$(id -u)" != 0 ]; then echo "Run with sudo"; exit 1; fi

NET=$(ip -o -4 route show scope link | awk '$1 ~ /^(10|172|192)\./ {print $1; exit}')
if [ -z "$NET" ]; then echo "Home network not found, nothing was changed"; exit 1; fi

echo "[1/3] Firewall: allowing only the home network $NET"
ufw allow from "$NET"
ufw --force enable

echo "[2/3] Management page: allowing it inside the home network"
mkdir -p /etc/cockpit
printf '[WebService]\nAllowUnencrypted = true\n' > /etc/cockpit/cockpit.conf

echo "[3/3] Restarting the management page"
systemctl restart cockpit.socket

echo
ufw status
echo
echo "Done. Management page: http://$(hostname -I | awk '{print $1}'):9090"
