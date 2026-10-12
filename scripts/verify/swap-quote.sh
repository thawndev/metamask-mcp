#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
q(){ node scripts/mcp-call.mjs wallet_get_swap_quote '{"chainId":"1","sellToken":"0x0000000000000000000000000000000000000000","buyToken":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","amount":"1000000000000000000","taker":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"}'; }
out="$(q)"
for i in 1 2 3 4; do grep -q '429' <<<"$out" || break; sleep 4; out="$(q)"; done
echo "$out" | head -c 300; echo
if grep -q '429' <<<"$out"; then echo "SKIP bridge API rate-limited (HTTP 429) — external"; exit 0; fi
assert_contains "$out" '"source":"metamask-bridge-api"' "quote from keyless bridge"
assert_contains "$out" '"raw"' "raw route present"
