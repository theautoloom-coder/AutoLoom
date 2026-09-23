#!/usr/bin/env bash
# Tap the on-screen element whose text or content-description matches.
#
#   scripts/tap.sh "Naya staff"
#   scripts/tap.sh "Email" --find     # print the coordinates without tapping
#
# Guessing pixel coordinates off a screenshot breaks the moment anything moves
# or the status bar changes height; uiautomator reports where the view actually
# is. On Git Bash every local path handed to adb or python has to be a Windows
# path, and every device path has to escape MSYS rewriting — hence the
# cygpath/MSYS_NO_PATHCONV dance.
set -euo pipefail
want="${1:?usage: tap.sh <text> [--find]}"
mode="${2:-tap}"
export MSYS_NO_PATHCONV=1

tmp="$(cygpath -w "${TMPDIR:-/tmp}/ui.xml")"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb pull /sdcard/ui.xml "$tmp" >/dev/null 2>&1
adb shell rm /sdcard/ui.xml >/dev/null 2>&1

read -r x y <<<"$(XML="$tmp" WANT="$want" python "$(cygpath -w "$(dirname "$0")/find-node.py")")"

if [ -z "${x:-}" ]; then
  echo "not found: $want" >&2
  exit 1
fi

if [ "$mode" = "--find" ]; then
  echo "$x $y"
else
  adb shell input tap "$x" "$y"
  echo "tapped '$want' at $x,$y"
fi
