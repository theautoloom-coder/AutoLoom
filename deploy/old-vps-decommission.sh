#!/usr/bin/env bash
#
# Take AutoLoom off the old VPS (38.49.209.165). The app moved to the Oracle
# Cloud Mumbai server on 6 Oct 2026 and DNS points there; nothing here serves
# it any more. Run from the repo root on the laptop:
#
#   ssh -i /d/Gulshan/Keys/ServoRica_TradeOS root@38.49.209.165 'bash -s' < deploy/old-vps-decommission.sh
#
# The box is shared. This removes only AutoLoom's own Caddy block and its own
# directories; every other site is left as it is. The Caddyfile is backed up
# first, and if the edited file does not validate the backup goes straight
# back and nothing is deleted.
set -euo pipefail

CF=/etc/caddy/Caddyfile
BAK="$CF.bak-$(date +%Y%m%d-%H%M)-autoloom-removed"
cp "$CF" "$BAK"
echo "backup: $BAK"

python3 - "$CF" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
start = s.find("app.theautoloom.in {")
if start == -1:
    print("no app.theautoloom.in block — Caddyfile unchanged")
    raise SystemExit
# Start at AutoLoom's own comment header when it sits right above the block.
head = s.rfind("# --- AutoLoom ---", 0, start)
cut_from = head if head != -1 and start - head < 800 else start
# Brace-match the block itself; never trust line numbers on a shared file.
depth, end = 0, None
for j in range(s.index("{", start), len(s)):
    if s[j] == "{":
        depth += 1
    elif s[j] == "}":
        depth -= 1
        if depth == 0:
            end = j + 1
            break
if end is None:
    raise SystemExit("unbalanced braces — Caddyfile left unchanged")
open(p, "w").write(s[:cut_from] + s[end:].lstrip("\n"))
print("removed the app.theautoloom.in block")
PY

if caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then
  systemctl reload caddy
  echo "caddy reloaded"
else
  cp "$BAK" "$CF"
  echo "Caddyfile did not validate — restored the backup, deleted nothing"
  exit 1
fi

rm -rf /var/www/autoloom /var/www/autoloom.old /var/www/autoloom-download \
       /var/www/autoloom-install /var/www/autoloom-manual /opt/theautoloom
echo "AutoLoom files removed from the old VPS"
