#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
out="$(run_mcp wallet_get_token_balances '{"chainId":"1","token":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","address":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"}')"
echo "$out"
assert_contains "$out" '"token"' "token balance present"
assert_contains "$out" '"decimals"' "token decimals present"
