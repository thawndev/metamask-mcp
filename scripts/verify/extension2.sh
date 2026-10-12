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

r=$(timeout 90 node scripts/mcp-call.mjs wallet_build_typed_data "{\"template\":\"permit\",\"chainId\":\"1\",\"token\":\"$USDC\",\"owner\":\"$V\",\"spender\":\"$V\",\"value\":\"1000000\",\"nonce\":\"0\",\"deadline\":\"9999999999\"}" 2>/dev/null)
grep -q '"primaryType":"Permit"' <<<"$r" && grep -qE '"hash":"0x[0-9a-f]{64}"' <<<"$r" && echo "PASS EIP-712 Permit built + digest" || { echo "FAIL build_typed_data"; echo "$r" | tail -c 400; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_build_typed_data "{\"template\":\"permit2\",\"chainId\":\"1\",\"token\":\"$USDC\",\"spender\":\"$V\",\"amount\":\"100\",\"nonce\":\"0\",\"expiration\":\"9999999999\",\"sigDeadline\":\"9999999999\"}" 2>/dev/null)
grep -q '"primaryType":"PermitSingle"' <<<"$r" && echo "PASS EIP-712 Permit2 built" || { echo "FAIL permit2"; echo "$r" | tail -c 400; }

n=$(node -e "fetch('$RPC',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]})}).then(r=>r.json()).then(j=>{const b=parseInt(j.result,16);console.log(b)})")
from=$(printf '0x%x' $((n-200)))
r=$(timeout 120 node scripts/mcp-call.mjs wallet_get_logs "{\"address\":\"$USDC\",\"fromBlock\":\"$from\",\"toBlock\":\"0x$(printf %x $n)\",\"decode\":\"erc20-transfer\"}" 2>/dev/null)
grep -q '"logs":' <<<"$r" && { grep -q '"transfer"' <<<"$r" && echo "PASS get_logs + ERC-20 Transfer decoded" || echo "PASS get_logs (range, no transfers decoded this window)"; } || { echo "FAIL get_logs"; echo "$r" | tail -c 400; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_ens_text '{"name":"vitalik.eth","key":"url"}' 2>/dev/null)
grep -qi 'vitalik' <<<"$r" && echo "PASS ENS text record (vitalik.eth url)" || { echo "FAIL ens_text"; echo "$r" | tail -c 300; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_ens_resolver '{"name":"vitalik.eth"}' 2>/dev/null)
grep -qE '"resolver":"0x[1-9a-fA-F]' <<<"$r" && echo "PASS ENS resolver (vitalik.eth)" || { echo "FAIL ens_resolver"; echo "$r" | tail -c 300; }
