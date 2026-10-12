#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
out="$(MM_SWAP_TTL_MS=1500 MM_ALLOW_LOCAL_RPC=1 MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 node scripts/swap-test.mjs 2>&1)"; echo "$out"
grep -q 'PASS swap inspect' <<<"$out" && echo "PASS swap tools" || { echo FAIL; exit 1; }
