#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
export MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 MM_ALLOW_LOCAL_RPC=1
if ! curl -s -o /dev/null -X POST "$MM_RPC_URL" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'; then
  echo "SKIP local chain not running"; exit 0; fi
out="$(node scripts/all-tools.mjs 2>&1)"; echo "$out"
grep -q 'unexpected errors: 0' <<<"$out" && echo "PASS all 20 tool calls exercised (0 unexpected errors)" || { echo FAIL; exit 1; }
