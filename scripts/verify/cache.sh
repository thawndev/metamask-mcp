#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
if ! curl -s -o /dev/null -X POST http://127.0.0.1:8545 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'; then echo "SKIP chain not running"; exit 0; fi
out="$(MM_ALLOW_LOCAL_RPC=1 MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 node scripts/cache.mjs 2>&1)"; echo "$out"
grep -q 'PASS advisory cache' <<<"$out" && echo "PASS cache" || { echo FAIL; exit 1; }
