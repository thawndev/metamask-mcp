#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
out="$(run_mcp wallet_get_balance '{"address":"not-an-address"}')"
echo "$out"
assert_contains "$out" '"INVALID_PARAMS"' "invalid address -> INVALID_PARAMS"
assert_contains "$out" '"isError":true' "error flagged"
