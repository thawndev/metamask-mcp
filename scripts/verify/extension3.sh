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
V=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

r=$(timeout 90 node scripts/mcp-call.mjs wallet_eip712_domain "{\"token\":\"0x4c9EDD5852cd905f086C759E8383e09bff1E68B3\"}" 2>/dev/null)
grep -q '"name":"USDe"' <<<"$r" && grep -q '"version":"1"' <<<"$r" && echo "PASS EIP-5267 eip712Domain (USDe name/version)" || { echo "FAIL eip712_domain"; echo "$r" | tail -c 400; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_permit_nonce "{\"token\":\"$USDC\",\"owner\":\"$V\"}" 2>/dev/null)
grep -qE '"nonce":"[0-9]+"' <<<"$r" && echo "PASS EIP-2612 nonces()" || { echo "FAIL permit_nonce"; echo "$r" | tail -c 300; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_erc20_allowance "{\"token\":\"$USDC\",\"owner\":\"$V\",\"spender\":\"$V\"}" 2>/dev/null)
grep -qE '"allowance":"[0-9]+"' <<<"$r" && echo "PASS ERC-20 allowance()" || { echo "FAIL allowance"; echo "$r" | tail -c 300; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_get_nonce_4337 "{\"owner\":\"$V\"}" 2>/dev/null)
grep -qE '"nonce":"[0-9]+"' <<<"$r" && grep -q '0x0000000071727' <<<"$r" && echo "PASS ERC-4337 EntryPoint.getNonce" || { echo "FAIL nonce_4337"; echo "$r" | tail -c 300; }

n=$(curl -s -X POST $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' | python3 -c 'import sys,json;print(int(json.load(sys.stdin)["result"],16))')
from=$(printf '0x%x' $((n-300))); to=$(printf '0x%x' $n)
r=$(timeout 150 node scripts/mcp-call.mjs wallet_get_logs "{\"address\":\"$USDC\",\"fromBlock\":\"$from\",\"toBlock\":\"$to\",\"chunkSize\":100,\"decode\":\"erc20-transfer\"}" 2>/dev/null)
grep -q '"logs":' <<<"$r" && echo "PASS chunked eth_getLogs (300-block range, 100/chunk)" || { echo "FAIL chunked get_logs"; echo "$r" | tail -c 300; }
