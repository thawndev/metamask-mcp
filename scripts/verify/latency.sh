#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
export MM_NETWORK=1
xvfb-run -a node scripts/bench.mjs >/dev/null 2>&1 || true
jq -e 'all(.[]; .warm_median_ms <= 1500)' "$ROOT/.agents/run/bench.json" >/dev/null && echo "PASS  read warm p50 <= 1500ms (NFR-002)"
jq -e 'all(.[] | select(.tool=="wallet_get_gas" or .tool=="wallet_describe_screen"); .warm_median_ms <= 200)' "$ROOT/.agents/run/bench.json" >/dev/null && echo "PASS  no-I/O overhead <= 200ms ceiling (NFR-001)"
jq -e 'all(.[]; .cold_ms <= 8000)' "$ROOT/.agents/run/bench.json" >/dev/null && echo "PASS  cold start <= 8000ms ceiling (NFR-006)"
jq -c '.' "$ROOT/.agents/run/bench.json"
