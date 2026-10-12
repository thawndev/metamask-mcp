#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
export MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 MM_ALLOW_LOCAL_RPC=1
node scripts/bench-all.mjs >/dev/null 2>&1
jq -e 'all(.[]|select(.tool=="wallet_sign_message" or .tool=="wallet_send_transaction"); .warm_p50_ms < 5000)' .agents/run/bench-all.json >/dev/null && echo 'PASS gate latency < 5s (NFR-003/004)'
