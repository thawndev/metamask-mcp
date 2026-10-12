#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
RPC=http://127.0.0.1:8546
if ! curl -s -o /dev/null -X POST $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'; then
  command -v anvil >/dev/null || { echo "SKIP no anvil"; exit 0; }
  setsid nohup anvil --fork-url https://ethereum-rpc.publicnode.com --chain-id 1 --host 127.0.0.1 --port 8546 --silent > .agents/logs/anvil-fork.log 2>&1 </dev/null & echo $! > .agents/run/anvil-fork.pid
  for i in $(seq 1 30); do curl -s -o /dev/null -X POST $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' && break; sleep 1; done
fi
export MM_ALLOW_LOCAL_RPC=1 MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 MM_NETWORK=1 MM_RPC_URL=$RPC
USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
info="$(timeout 90 node scripts/mcp-call.mjs wallet_token_info "{\"token\":\"$USDC\"}" 2>/dev/null)"
grep -q '"symbol":"USDC"' <<<"$info" && grep -q '"decimals":6' <<<"$info" && echo "PASS wallet_token_info -> USDC/6 via native eth_call" || { echo "FAIL token_info"; echo "$info" | tail -c 300; exit 1; }
bal="$(timeout 90 node scripts/mcp-call.mjs wallet_token_balance "{\"token\":\"$USDC\"}" 2>/dev/null)"
grep -q '"display"' <<<"$bal" && echo "PASS wallet_token_balance -> decoded display" || { echo "FAIL token_balance"; echo "$bal" | tail -c 300; exit 1; }
