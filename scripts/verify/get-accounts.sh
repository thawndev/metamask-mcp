#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
out="$(run_mcp wallet_get_accounts '{}')"
echo "$out"
assert_contains "$out" '"accounts"' "accounts array present"
assert_contains "$out" '"next"' "next step present"
