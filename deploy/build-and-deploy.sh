#!/usr/bin/env bash
#
# Build the AutoLoom web app against production and push it to the VPS.
#
#   SSH_KEY="/d/Gulshan/Keys/ServoRica_TradeOS" \
#     ./deploy/build-and-deploy.sh autoloom.aismartscan.in root@38.49.209.165
#
# Run it from the repo root. Nothing here touches the database or any other
# site on that box — it only replaces static files under one directory, so a
# bad deploy is undone by checking out the previous commit and re-running.
set -euo pipefail

DOMAIN="${1:?Usage: build-and-deploy.sh <domain> <ssh-target> [remote-path]}"
SSH_TARGET="${2:?Usage: build-and-deploy.sh <domain> <ssh-target> [remote-path]}"
REMOTE_PATH="${3:-/var/www/autoloom}"

SSH_OPTS=()
[ -n "${SSH_KEY:-}" ] && SSH_OPTS=(-i "$SSH_KEY")

# Production backend. These are public client values — the anon key is meant to
# be in the browser; the service_role key must never appear here.
export EXPO_PUBLIC_SUPABASE_URL="https://nczuxjzkkboetekfhqle.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jenV4anpra2JvZXRla2ZocWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzgzNzUsImV4cCI6MjEwNTA1NDM3NX0.3-L5sJWmbx6NePoIDIj_dxEK3LHEKgcU8DgBrHeOsoQ"
export EXPO_PUBLIC_POWERSYNC_URL="https://6aa94f588453e7cf8337416e.powersync.journeyapps.com"

echo "▸ Building web bundle for ${DOMAIN}"
cd "$(dirname "$0")/../app"
rm -rf dist
# --clear is not optional. Metro inlines EXPO_PUBLIC_* at transform time and
# caches the result per module; src/lib/supabase.ts rarely changes, so without
# this the export happily reuses a cached transform carrying whatever backend
# was set last time. That is how a local `.env` build ended up baked into what
# looked like a production bundle — same content hash and everything.
npx expo export --platform web --clear

# A build without these is a blank white app on the phone, so fail loudly here
# rather than after it is live.
for f in index.html manifest.json sw.js apple-touch-icon.png; do
  [ -f "dist/$f" ] || { echo "✗ dist/$f missing — aborting"; exit 1; }
done

# And prove the bundle really talks to production. Shipping a build that points
# at 127.0.0.1 would look completely fine here and be dead on every phone.
entry_js=$(grep -o '_expo/static/js/web/[A-Za-z0-9._-]*\.js' dist/index.html | sed 's|^|dist/|')
if ! grep -qh "$EXPO_PUBLIC_SUPABASE_URL" $entry_js; then
  echo "✗ bundle does not contain $EXPO_PUBLIC_SUPABASE_URL — aborting"; exit 1
fi
if grep -qh "127\.0\.0\.1:54321" $entry_js; then
  echo "✗ bundle still points at the local Supabase — aborting"; exit 1
fi
echo "▸ Build OK ($(du -sh dist | cut -f1)) → $EXPO_PUBLIC_SUPABASE_URL"

# The remote half is passed as an ssh ARGUMENT, not on stdin, because stdin is
# carrying the tarball. tar over ssh rather than rsync: Git Bash on Windows has
# no rsync, and this needs nothing on the machine that isn't already there.
#
# It unpacks into a staging directory and swaps it in only once every file the
# app cannot boot without is confirmed present. A half-uploaded bundle is the
# one failure that would leave the shop staring at a white screen; this makes
# it impossible — the live directory is replaced in a single mv, or not at all.
# The build it replaces is kept alongside as .old to fall back to.
REMOTE_SCRIPT=$(cat <<EOS
set -e
rm -rf "${REMOTE_PATH}.new"
mkdir -p "${REMOTE_PATH}.new"
tar -xzf - -C "${REMOTE_PATH}.new"
for f in index.html manifest.json sw.js apple-touch-icon.png; do
  if [ ! -f "${REMOTE_PATH}.new/\$f" ]; then
    echo "✗ \$f missing after upload — nothing swapped, site untouched"
    rm -rf "${REMOTE_PATH}.new"
    exit 1
  fi
done
rm -rf "${REMOTE_PATH}.old"
if [ -d "${REMOTE_PATH}" ]; then mv "${REMOTE_PATH}" "${REMOTE_PATH}.old"; fi
mv "${REMOTE_PATH}.new" "${REMOTE_PATH}"
chown -R caddy:caddy "${REMOTE_PATH}"
# Caddy serves this, not nginx. Validate before reloading: if the config is ever
# broken the reload is refused and the sites already running on this box —
# including the payment gateway — carry on untouched.
caddy validate --config /etc/caddy/Caddyfile >/dev/null
systemctl reload caddy
echo "  \$(du -sh "${REMOTE_PATH}" | cut -f1), \$(find "${REMOTE_PATH}" -type f | wc -l) files"
EOS
)

echo "▸ Uploading to ${SSH_TARGET}:${REMOTE_PATH}"
tar -czf - -C dist . | ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$REMOTE_SCRIPT"

# The install page lives in its own directory so a deploy — which wipes and
# replaces the app — cannot take it with it. It is still shipped here so the
# two never drift: regenerate with `node scripts/build-install-page.mjs`.
if [ -f "../deploy/install-page/index.html" ]; then
  echo "▸ Install page"
  scp ${SSH_KEY:+-i "$SSH_KEY"} -q ../deploy/install-page/index.html "${SSH_TARGET}:/var/www/autoloom-install/index.html"
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "chown caddy:caddy /var/www/autoloom-install/index.html"
fi

echo "✓ Live at https://${DOMAIN}"
echo "  Install page: https://${DOMAIN}/install"
