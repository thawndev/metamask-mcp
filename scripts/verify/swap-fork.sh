#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
command -v anvil >/dev/null || { echo "SKIP no anvil"; exit 0; }
RPC=http://127.0.0.1:8547
# Isolated fresh fork so no cross-test state drift.
setsid nohup anvil --fork-url https://ethereum-rpc.publicnode.com --chain-id 1 --host 127.0.0.1 --port 8547 --silent > .agents/logs/anvil-swap.log 2>&1 </dev/null & APID=$!
trap 'kill "$APID" 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null -X POST $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' && break; sleep 1; done
curl -s -X POST $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"anvil_setBalance","params":["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","0x21e19e0c9bab2400000"]}' >/dev/null
out="$(MM_RPC_URL=$RPC timeout 150 node scripts/swap-fork-test.mjs 2>&1)"; echo "$out"
grep -q 'PASS native swap executed' <<<"$out" && echo "PASS swap on mainnet fork (test coins)" || { echo FAIL; exit 1; }
