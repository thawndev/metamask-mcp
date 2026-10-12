#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
export MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 MM_ALLOW_LOCAL_RPC=1
TX="$(curl -s -X POST "$MM_RPC_URL" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_sendTransaction","params":[{"from":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","to":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","value":"0xde0b6b3a7640000"}]}' | jq -r '.result')"
sleep 1
out="$(node scripts/mcp-call.mjs wallet_get_transaction_receipt "{\"txHash\":\"$TX\",\"chainId\":\"1337\"}")"
echo "$out" | head -c 300; echo
assert_contains "$out" '"status":"success"' "receipt status success"
