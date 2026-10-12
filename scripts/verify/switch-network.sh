#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
export MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 MM_ALLOW_LOCAL_RPC=1
node scripts/all-tools.mjs >/tmp/at.out 2>/dev/null || true
grep -q 'OK  wallet_switch_network' /tmp/at.out && echo 'PASS wallet_switch_network'
