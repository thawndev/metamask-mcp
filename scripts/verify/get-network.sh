#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
out="$(run_mcp wallet_get_network '{}')"
echo "$out"
assert_contains "$out" '"id":"0x' "network chain id is hex"
