#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
if ! curl -s -o /dev/null -X POST http://127.0.0.1:8545 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'; then echo "SKIP chain not running"; exit 0; fi
export MM_ALLOW_LOCAL_RPC=1 MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545
grep -q 0xf39F <<<"$(node dist/cli.js accounts 2>/dev/null)" && echo "PASS cli accounts"
grep -q '"0x539"' <<<"$(node dist/cli.js rpc eth_chainId 2>/dev/null)" && echo "PASS cli rpc"
grep -q ' wei' <<<"$(node dist/cli.js balance 2>/dev/null)" && echo "PASS cli balance"
grep -q '^0x' <<<"$(node dist/cli.js send --to 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --value 1 2>/dev/null)" && echo "PASS cli send"
grep -q '^0x' <<<"$(node dist/cli.js sign-message hello 2>/dev/null)" && echo "PASS cli sign-message"
