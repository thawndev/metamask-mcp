#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
out="$(run_mcp wallet_get_balance '{"chainId":"1","address":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"}')"
echo "$out"
assert_contains "$out" '"wei"' "balance wei present"
assert_contains "$out" '"display"' "balance display present"
