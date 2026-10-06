#!/bin/bash
# Runs as root on the OPENEYE server every minute, straight from the repository (see cloud-init.yaml).
# Must be safe to run again and again. Prints only short, non-secret status lines: the output is public on port 8080.
set -u
export DEBIAN_FRONTEND=noninteractive
export GIT_SSH_COMMAND="ssh -i /root/.ssh/openeye_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
REPO=git@github.com:elimarshak/tzofia.git
SITE=/var/www/openeye
DOMAIN=openeye.co.il
cd /opt/openeye
echo "code: $(git rev-parse --short HEAD)"

# 1. Web server (Caddy, from Ubuntu's own packages) and firewall, once.
if ! command -v caddy >/dev/null; then
  apt-get update -qq && apt-get install -y -qq caddy ufw >/dev/null 2>&1
  echo "caddy installed: $(command -v caddy >/dev/null && echo yes || echo NO)"
fi
if command -v ufw >/dev/null && ! ufw status | grep -q "Status: active"; then
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 8080/tcp >/dev/null
  ufw --force enable >/dev/null
  echo "firewall: $(ufw status | head -1)"
fi

# 2. The built site: the site-build branch of the same repository.
if [ ! -d "$SITE/.git" ]; then
  mkdir -p "$SITE" && git clone -q --depth 1 -b site-build "$REPO" "$SITE" 2>&1 | tail -1
else
  git -C "$SITE" fetch -q --depth 1 origin site-build 2>&1 | tail -1
  git -C "$SITE" reset -q --hard origin/site-build 2>&1 | tail -1
fi
echo "site: $(git -C "$SITE" log -1 --format=%s 2>/dev/null | cut -c1-60)"

# 3. Web server configuration. The domain block is added only once the domain really points here,
#    so certificate requests are never sent for a name that is not ours yet.
MYIP=$(curl -4 -s --max-time 5 https://ifconfig.me || hostname -I | awk '{print $1}')
DNSIP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')
SITEBLOCK='
	root * /var/www/openeye
	encode zstd gzip
	@hidden path /.git* /package-lock.json
	respond @hidden 404
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy no-referrer
		X-Frame-Options DENY
	}
	@assets path /vendor/* /assets/* /fonts/* /basemap.pmtiles
	header @assets Cache-Control "public, max-age=3600"
	file_server
'
{
  echo ":80 {$SITEBLOCK}"
  if [ -n "$DNSIP" ] && [ "$DNSIP" = "$MYIP" ]; then
    echo "$DOMAIN, www.$DOMAIN {$SITEBLOCK}"
  fi
} > /etc/caddy/Caddyfile.new
if ! cmp -s /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile; then
  if caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null 2>&1; then
    mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile && systemctl reload caddy 2>/dev/null || systemctl restart caddy
    echo "web config updated"
  else
    echo "web config INVALID, kept the old one"
  fi
fi
echo "ip: $MYIP  domain points to: ${DNSIP:-nothing}"
echo "web: $(systemctl is-active caddy)  http: $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1/)"
