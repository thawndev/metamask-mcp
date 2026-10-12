#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
out="$(run_mcp wallet_get_status '{}')"
echo "$out"
assert_contains "$out" '"locked"' "status has locked"
assert_contains "$out" '"chain"' "status has chain"
