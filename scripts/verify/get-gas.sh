#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
out="$(node scripts/mcp-call.mjs wallet_get_gas '{"chainId":"1"}')"
echo "$out"
assert_contains "$out" '"gas"' "gas tiers present"
assert_contains "$out" '"source"' "gas source present"
