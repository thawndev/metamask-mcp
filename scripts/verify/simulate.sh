#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
if ! curl -s -o /dev/null -X POST http://127.0.0.1:8545 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'; then echo "SKIP chain not running"; exit 0; fi
out="$(MM_ALLOW_LOCAL_RPC=1 MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 node scripts/mcp-call.mjs wallet_inspect_transaction '{"to":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","value":"1"}')"
grep -q '"simulation":{"ok":true}' <<<"$out" && echo "PASS inspect returns a native pre-flight simulation" || { echo FAIL; echo "$out" | head -c 300; exit 1; }
