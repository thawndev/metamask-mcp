#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
export MM_ALLOW_LOCAL_RPC=1 MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545
USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
TO=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
call(){ timeout 60 node scripts/mcp-call.mjs "$1" "$2" 2>/dev/null; }
call wallet_erc20_transfer "{\"token\":\"$USDC\",\"to\":\"$TO\",\"amount\":\"1000000\"}" | grep -q '"data":"0xa9059cbb' && echo "PASS erc20 transfer calldata" || echo "FAIL erc20_transfer"
call wallet_erc20_approve "{\"token\":\"$USDC\",\"spender\":\"$TO\",\"amount\":\"1\"}" | grep -q '"data":"0x095ea7b3' && echo "PASS erc20 approve calldata" || echo "FAIL erc20_approve"
call wallet_erc721_transfer "{\"token\":\"$USDC\",\"from\":\"$TO\",\"to\":\"$TO\",\"tokenId\":\"1\"}" | grep -q '"data":"0x42842e0e' && echo "PASS erc721 transfer calldata" || echo "FAIL erc721_transfer"
call wallet_erc1155_transfer "{\"token\":\"$USDC\",\"from\":\"$TO\",\"to\":\"$TO\",\"tokenId\":\"1\",\"amount\":\"1\"}" | grep -q '"data":"0xf242432a' && echo "PASS erc1155 transfer calldata" || echo "FAIL erc1155_transfer"
call wallet_checksum_address '{"address":"0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"}' | grep -q '"checksum":"0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"' && echo "PASS EIP-55 checksum" || echo "FAIL checksum"
