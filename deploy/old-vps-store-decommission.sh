#!/usr/bin/env bash
#
# Take the old TheAutoLoom store off the old VPS (38.49.209.165). The store
# runs on the Oracle Cloud Mumbai server since 6 Oct 2026 and Cloudflare sends
# theautoloom.in there, so this copy serves nobody. Owner's call, 6 Oct 2026:
# "Poora store hatao". Run from the repo root:
#
#   tr -d '\r' < deploy/old-vps-store-decommission.sh | ssh -i /d/Gulshan/Keys/ServoRica_TradeOS root@38.49.209.165 'DRY_RUN=1 bash -s'
#   tr -d '\r' < deploy/old-vps-store-decommission.sh | ssh -i /d/Gulshan/Keys/ServoRica_TradeOS root@38.49.209.165 'bash -s'
#
# The box is shared: only the store's own Caddy blocks and snippet, systemd
# units, database container and volume, folder and user go. The database is
# dumped to /root first, and if the edited Caddyfile does not validate the
# backup stays in place and nothing else is touched.
set -euo pipefail
DRY_RUN=${DRY_RUN:-}
CF=/etc/caddy/Caddyfile
STAMP=$(date +%Y%m%d-%H%M)

python3 - "$CF" "$DRY_RUN" > /tmp/store-caddy.new <<'PY'
import sys
p, dry = sys.argv[1], sys.argv[2]
s = open(p).read()

def block(s, head):
    """(start, end) of a top-level block whose first line is exactly `head`,
    with the comment lines directly above it."""
    if s.startswith(head):
        at = 0
    else:
        i = s.find("\n" + head)
        if i == -1:
            return None
        at = i + 1
    depth = 0
    for j in range(s.index("{", at), len(s)):
        depth += s[j] == "{"
        depth -= s[j] == "}"
        if depth == 0:
            start = at
            while start > 0:
                prev = s.rfind("\n", 0, start - 1)
                line = s[prev + 1:start - 1]
                if line.lstrip().startswith("#"):
                    start = prev + 1
                else:
                    break
            return start, j + 1
    raise SystemExit("unbalanced braces at " + head)

cuts = []
for head in ("www.theautoloom.in {", "theautoloom.in {", "(theautoloomstore-cloudflare-only) {"):
    b = block(s, head)
    if b:
        cuts.append(b)
        if dry:
            print(f"--- would cut:\n{s[b[0]:b[1]]}\n", file=sys.stderr)
    else:
        print(f"(no {head} block)", file=sys.stderr)

for a, b in sorted(cuts, reverse=True):
    s = s[:a] + s[b:].lstrip("\n")
if "theautoloomstore-cloudflare-only" in s or "theautoloom.in" in s:
    raise SystemExit("something still refers to the store — Caddyfile left unchanged")
sys.stdout.write(s)
PY

caddy validate --config /tmp/store-caddy.new --adapter caddyfile >/dev/null 2>&1 \
  || { echo "edited Caddyfile does not validate — nothing changed"; exit 1; }
echo "edited Caddyfile validates"

if [ -n "$DRY_RUN" ]; then
  echo "DRY RUN: would dump theautoloomstore-db to /root, reload Caddy, then remove the units, container, volume, /opt/TheAutoLoomStore and user autoloomstore"
  exit 0
fi

# 1. Final dump of the store database, checked before anything is removed.
DUMP=/root/theautoloomstore-final-$STAMP.sql.gz
docker exec theautoloomstore-db sh -c 'pg_dumpall -U "${POSTGRES_USER:-postgres}"' | gzip > "$DUMP"
gzip -t "$DUMP" && [ "$(zcat "$DUMP" | grep -c 'CREATE TABLE')" -gt 0 ] \
  || { echo "dump looks wrong — stopping before any removal"; exit 1; }
chmod 600 "$DUMP"
echo "dump: $DUMP ($(du -h "$DUMP" | cut -f1))"

# 2. Caddy.
cp "$CF" "$CF.bak-$STAMP-store-removed"
cp /tmp/store-caddy.new "$CF"
if caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then
  systemctl reload caddy
  echo "caddy reloaded without the store blocks"
else
  cp "$CF.bak-$STAMP-store-removed" "$CF"
  echo "Caddyfile did not validate — restored the backup, removed nothing else"
  exit 1
fi

# 3. Services and timers.
for u in theautoloomstore.service theautoloomstore-backup.timer theautoloomstore-backup.service \
         theautoloomstore-cron.timer theautoloomstore-cron.service; do
  systemctl disable --now "$u" 2>/dev/null || true
  rm -f "/etc/systemd/system/$u"
done
systemctl daemon-reload
echo "store services stopped and removed"

# 4. Database container and its volume (the dump above is the copy).
docker rm -f theautoloomstore-db >/dev/null
docker volume rm theautoloomstore-pgdata >/dev/null
echo "store database container and volume removed"

# 5. Folder and service user.
rm -rf /opt/TheAutoLoomStore
userdel autoloomstore 2>/dev/null || true
echo "old store removed from this VPS"
