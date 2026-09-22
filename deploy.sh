#!/usr/bin/env bash
# DhanFunded — one-shot deploy on fresh Ubuntu. Idempotent: safe to re-run.
set -euo pipefail

DOMAIN=dhanfunded.com
APP=/var/www/dhanfunded
REPO=git@github.com:marginplant2-dev/dhan.git
# Let's Encrypt contact — only used for expiry-warning mail when a certificate
# is first issued. Override per-run with:  LE_EMAIL=you@domain bash deploy.sh
LE_EMAIL=${LE_EMAIL:-support@dhanfunded.com}
# Google Sign-In. This is a public value (it ships in the JS bundle) — the
# OAuth client secret is NOT used by this flow and must not live here.
# Must match GOOGLE_CLIENT_ID in server/.env or the server rejects the token.
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-45317476590-hqsv09torvh994eedajfg9gda8euj0cr.apps.googleusercontent.com}

echo "== 1/9 base packages =="
export DEBIAN_FRONTEND=noninteractive
# A package-index refresh has nothing to do with shipping app code, yet under
# `set -e` a flaky Ubuntu mirror ("Hash Sum mismatch" mid-sync) aborted the
# whole deploy here, before git pull. Stale indexes are fine for packages that
# are already installed; a genuinely missing one still fails the install below.
apt-get update -qq || echo "   apt-get update failed — continuing with cached package indexes"
apt-get install -y -qq curl git nginx redis-server ufw gnupg openssl

# Headless Chromium needs these to launch — the client build runs prerender.mjs
# after vite so crawlers get real HTML instead of an empty #root. Missing libs
# would make prerendering silently skip, so install them up front.
# (libasound2 was renamed libasound2t64 on Ubuntu 24.04; try both.)
apt-get install -y -qq \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 \
  libpango-1.0-0 libcairo2 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libxkbcommon0 fonts-liberation 2>/dev/null || true
apt-get install -y -qq libasound2t64 2>/dev/null || apt-get install -y -qq libasound2 2>/dev/null || true

echo "== 2/9 node 20 + pm2 =="
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; apt-get install -y -qq nodejs; }
command -v pm2  >/dev/null || npm install -g pm2 --silent

echo "== 3/9 mongodb =="
if ! command -v mongod >/dev/null; then
  . /etc/os-release
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg -o /usr/share/keyrings/mongodb.gpg --dearmor --yes
  # MongoDB publishes per Ubuntu LTS and lags new releases by months — 26.04
  # ("resolute") has no packages at all, and the deploy used to die here with
  # "Unable to locate package mongodb-org". The noble (24.04) build installs
  # and runs fine on it, so fall back to that rather than failing.
  mongo_repo() {
    echo "deb [signed-by=/usr/share/keyrings/mongodb.gpg] https://repo.mongodb.org/apt/ubuntu $1/mongodb-org/8.0 multiverse"       > /etc/apt/sources.list.d/mongodb-org-8.0.list
    apt-get update -qq && apt-get install -y -qq mongodb-org
  }
  mongo_repo "${VERSION_CODENAME}" || mongo_repo noble
fi
# MongoDB's packaged unit runs mongod with rseq switched off
# (GLIBC_TUNABLES=glibc.pthread.rseq=0), and 8.0.32 then refuses to start at
# all on kernel 6.19+ ("known incompatibility", SERVER-121912) — which is every
# Ubuntu 26.04 box. Clearing the tunable brings it straight up; mongod only
# loses a tcmalloc per-CPU cache optimisation.
if [ ! -f /etc/systemd/system/mongod.service.d/rseq.conf ]; then
  mkdir -p /etc/systemd/system/mongod.service.d
  printf '[Service]
Environment="GLIBC_TUNABLES="
' > /etc/systemd/system/mongod.service.d/rseq.conf
  systemctl daemon-reload
fi
systemctl enable --now mongod redis-server

echo "== 4/9 swap (vite build needs ~2G) =="
if [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 3000 ] && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 5/9 code =="
mkdir -p "$APP"
if [ -d "$APP/.git" ]; then
  # npm install rewrites the lockfiles on this box, which then blocks the next
  # pull with "Please commit your changes". They are regenerated every build, so
  # discarding them is safe — and it keeps deploys from wedging.
  git -C "$APP" checkout -- client/package-lock.json server/package-lock.json 2>/dev/null || true
  git -C "$APP" pull --ff-only
else
  git clone "$REPO" "$APP"
fi

echo "== 6/9 env =="
if [ ! -f "$APP/server/.env" ]; then
  ADMIN_PW=$(openssl rand -base64 12)
  cat > "$APP/server/.env" <<EOF
PORT=3001
NODE_ENV=production
MONGODB_URI=mongodb://127.0.0.1:27017/dhanfunded
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://$DOMAIN,https://www.$DOMAIN,https://admin.$DOMAIN
ADMIN_DEFAULT_PASSWORD=$ADMIN_PW
# ── fill these in later, features stay off till then ──
# GOOGLE_CLIENT_ID=
# SMTP_HOST=smtp.hostinger.com
# SMTP_PORT=465
# SMTP_SECURE=true
# SMTP_USER=
# SMTP_PASS=
# METAAPI_ACCOUNT_ID=
# METAAPI_AUTH_TOKEN=
# RAZORPAY_KEY_ID=
# RAZORPAY_KEY_SECRET=
# RAZORPAY_WEBHOOK_SECRET=
# CASHFREE_APP_ID=
# CASHFREE_SECRET_KEY=
# CASHFREE_ENV=production
EOF
  echo "!!! ADMIN PASSWORD: $ADMIN_PW  (server/.env में भी है) !!!"
fi
# Same-origin on purpose. Pointing the browser at api.$DOMAIN meant a SECOND
# DNS + TCP + TLS handshake (measured: 0.3s TCP, up to 1.9s TLS) and a CORS
# preflight before every single call. Served from the same origin, the API
# rides the connection the page already has and the browser sends no preflight
# at all. nginx proxies /api, /socket.io and /uploads to the same node process.
cat > "$APP/client/.env.production" <<EOF
VITE_API_URL=https://$DOMAIN
VITE_API_BASE_URL=https://$DOMAIN/api
VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
EOF

echo "== 7/9 build =="
cd "$APP/server" && npm install --omit=dev --no-audit --no-fund
cd "$APP/client" && npm install --no-audit --no-fund && NODE_OPTIONS=--max-old-space-size=2048 npm run build
chown -R www-data:www-data "$APP/client/dist"

echo "== 8/9 nginx =="
# Certbot rewrites this file in place to add the 443 blocks. Re-writing it here
# would wipe the SSL config and take the origin down behind Cloudflare
# Full(strict). Only lay down the HTTP config on a host that has no cert yet.
if grep -q 'listen 443' /etc/nginx/sites-available/dhanfunded 2>/dev/null; then
  echo "   SSL config already present — leaving nginx untouched"
  nginx -t && systemctl reload nginx
else
cat > /etc/nginx/sites-available/dhanfunded <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN admin.$DOMAIN;
    root $APP/client/dist;
    index index.html;
    client_max_body_size 20m;
    # \$uri.html serves the prerendered pages (dist/pricing.html) WITHOUT the
    # trailing-slash 301 a directory would trigger.
    # Fall back to the bare shell, NOT index.html: index.html is the
    # prerendered homepage, so using it served a 200 copy of the front page for
    # every unknown URL. The shell boots React, which renders a noindexed 404.
    location / { try_files \$uri \$uri.html \$uri/ /spa-shell.html; }

    # Must come before the regex rule below — an exact-match location outranks
    # it. Without this, /sw.js is served immutable for a year and no service
    # worker update ever reaches a returning user or the Cloudflare edge.
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        expires -1;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot|mp4)$ {
        expires 1y; add_header Cache-Control "public, immutable";
    }

    # Same-origin API — no second TLS handshake, no CORS preflight.
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
    }
}
server {
    listen 80;
    server_name api.$DOMAIN;
    client_max_body_size 20m;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
EOF
ln -sf /etc/nginx/sites-available/dhanfunded /etc/nginx/sites-enabled/dhanfunded
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
fi
ufw allow 22 >/dev/null; ufw allow 80 >/dev/null; ufw allow 443 >/dev/null; ufw --force enable >/dev/null

echo "== 9/9 pm2 =="
cd "$APP/server"
pm2 delete dhanfunded-api 2>/dev/null || true
pm2 start index.js --name dhanfunded-api --time
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo
# Only nag about SSL on a host that hasn't got a cert yet — otherwise every
# routine deploy printed a "now set up SSL" banner for a site already on HTTPS.
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "HTTP is live. Point DNS at this box, then issue the certificate:"
  echo "  certbot --nginx -d $DOMAIN -d www.$DOMAIN -d api.$DOMAIN -d admin.$DOMAIN --agree-tos -m $LE_EMAIL --redirect -n"
fi

# pm2 has only just forked the process, so give it a moment before deciding the
# API is down — the old one-shot curl reported a false failure on every run.
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -m 3 http://127.0.0.1:3001/api/health >/dev/null; then
    echo "API healthy: $(curl -s http://127.0.0.1:3001/api/health)"
    break
  fi
  [ "$i" = 10 ] && echo "API not responding after 10s — check: pm2 logs dhanfunded-api"
  sleep 1
done
