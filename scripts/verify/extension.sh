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
BAYC=0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D

r=$(timeout 90 node scripts/mcp-call.mjs wallet_resolve_name '{"name":"vitalik.eth"}' 2>/dev/null)
grep -qi '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' <<<"$r" && echo "PASS ENS resolve vitalik.eth -> 0xd8dA…" || { echo "FAIL ens"; echo "$r" | tail -c 400; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_lookup_address '{"address":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"}' 2>/dev/null)
grep -qi 'vitalik\.eth' <<<"$r" && echo "PASS ENS reverse 0xd8dA… -> vitalik.eth" || { echo "FAIL ens-reverse"; echo "$r" | tail -c 300; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_call_batch "{\"calls\":[{\"to\":\"$USDC\",\"data\":\"0x95d89b41\"},{\"to\":\"$USDC\",\"data\":\"0x313ce567\"}]}" 2>/dev/null)
grep -q '"count":2' <<<"$r" && grep -q '"success":true' <<<"$r" && echo "PASS Multicall3 batch -> 2 successful calls in one RPC" || { echo "FAIL multicall"; echo "$r" | tail -c 400; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_nft_owner "{\"token\":\"$BAYC\",\"tokenId\":\"1\"}" 2>/dev/null)
grep -qE '"owner":"0x[1-9a-fA-F]' <<<"$r" && echo "PASS ERC-721 ownerOf (BAYC #1)" || { echo "FAIL erc721"; echo "$r" | tail -c 400; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_erc1155_balance "{\"token\":\"0x495f947276749Ce646f68AC8c248420045cb7b5e\",\"tokenId\":\"1\",\"owner\":\"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045\"}" 2>/dev/null)
grep -q '"balance"' <<<"$r" && echo "PASS ERC-1155 balanceOf via eth_call" || { echo "FAIL erc1155"; echo "$r" | tail -c 400; }

r=$(timeout 90 node scripts/mcp-call.mjs wallet_nft_uri "{\"token\":\"$BAYC\",\"tokenId\":\"1\"}" 2>/dev/null)
grep -q '"uri"' <<<"$r" && echo "PASS ERC-721 tokenURI (BAYC #1)" || { echo "FAIL tokenURI"; echo "$r" | tail -c 300; }
