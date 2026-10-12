#!/usr/bin/env bash
# Run every committed verify script; print a summary; non-zero if any FAIL.
set -uo pipefail
cd "$(dirname "$0")/.."
pass=0; fail=0; skip=0
for f in scripts/verify/*.sh; do
  n="$(basename "$f")"; [ "$n" = "_common.sh" ] && continue
  out="$(timeout 280 bash "$f" 2>&1)"
  if grep -q '^FAIL' <<<"$out"; then echo "FAIL  $n"; fail=$((fail+1));
  elif grep -qE '^PASS' <<<"$out"; then echo "PASS  $n"; pass=$((pass+1));
  elif grep -q '^SKIP' <<<"$out"; then echo "SKIP  $n"; skip=$((skip+1));
  else echo "?     $n"; fail=$((fail+1)); fi
done
echo "----"; echo "PASS=$pass SKIP=$skip FAIL=$fail"
[ "$fail" -eq 0 ]
