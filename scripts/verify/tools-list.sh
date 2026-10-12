#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
out="$(run_mcp --list)"
for t in wallet_get_status wallet_get_accounts wallet_get_balance wallet_get_network wallet_get_gas wallet_describe_screen wallet_get_token_balances wallet_call; do
  assert_contains "$out" "\"$t\"" "tool $t present"
done
