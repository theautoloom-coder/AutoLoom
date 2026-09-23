#!/usr/bin/env bash
# One device screenshot, pulled and scaled small enough to look at.
#
#   scripts/shot.sh <name>
#
# Three Windows/Git-Bash traps, all avoided here:
#   · `adb exec-out screencap` corrupts the PNG (CRLF translation)
#   · an unquoted /sdcard path is rewritten into a Windows path by MSYS, so
#     MSYS_NO_PATHCONV is set — which then means every LOCAL path handed to adb
#     or python must be converted by hand, because both are Windows binaries
#     and cannot read /d/... at all.
set -euo pipefail
name="${1:-shot}"
dir="$(cd "$(dirname "$0")/.." && pwd)/test/screens"
mkdir -p "$dir"
full_win="$(cygpath -w "$dir/$name-full.png")"
small_win="$(cygpath -w "$dir/$name.png")"

MSYS_NO_PATHCONV=1 adb shell screencap -p /sdcard/_shot.png
MSYS_NO_PATHCONV=1 adb pull /sdcard/_shot.png "$full_win" >/dev/null
MSYS_NO_PATHCONV=1 adb shell rm /sdcard/_shot.png

FULL="$full_win" SMALL="$small_win" python -c "
import os
from PIL import Image
im = Image.open(os.environ['FULL'])
im.thumbnail((760, 1600))
im.save(os.environ['SMALL'])
print('  ' + os.environ['SMALL'], im.size)
"
