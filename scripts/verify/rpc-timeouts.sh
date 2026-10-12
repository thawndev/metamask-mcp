#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
export MM_NETWORK=1 MM_RPC_URL=https://127.0.0.1:9 MM_ALLOW_LOCAL_RPC=1
out="$(node scripts/mcp-call.mjs wallet_call '{"chainId":"1","to":"0x0000000000000000000000000000000000000000","data":"0x"}')"
grep -q '"ok":false' <<<"$out" && echo 'PASS RPC failure returns a bounded error, not a hang'
echo "$out" | head -c 200
