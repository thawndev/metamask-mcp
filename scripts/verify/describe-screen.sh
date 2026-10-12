#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
out="$(run_mcp wallet_describe_screen '{}')"
echo "$out"
assert_contains "$out" '"locked"' "describe has locked"
assert_contains "$out" '"changed"' "describe has changed delta"
