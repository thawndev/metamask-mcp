#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
a="$(run_mcp --list)"; b="$(run_mcp --list)"
na="$(jq -c '.result.tools|map(.name)' <<<"$a")"; nb="$(jq -c '.result.tools|map(.name)' <<<"$b")"
[ "$na" = "$nb" ] && echo "PASS tool catalog order deterministic" || { echo "FAIL order differs"; exit 1; }
n="$(jq '.result.tools|length' <<<"$a")"
[ "$n" -ge 40 ] && echo "PASS $n tools (>=40; full native API surface)" || { echo "FAIL only $n tools"; exit 1; }
echo "TOOLS: $na"
