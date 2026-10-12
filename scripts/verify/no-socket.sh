#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
export MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 MM_ALLOW_LOCAL_RPC=1
node dist/cli.js serve </dev/null >/dev/null 2>&1 & pid=$!
sleep 1.5
listeners="$( { lsof -Pan -p "$pid" -i 2>/dev/null || true; } | grep -v COMMAND | wc -l )"
kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
if [ "$listeners" -eq 0 ]; then echo "PASS no listening socket (stdio only)"; else echo "FAIL $listeners listeners"; exit 1; fi
