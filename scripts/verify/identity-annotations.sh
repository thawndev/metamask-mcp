#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
out="$(node scripts/mcp-call.mjs --list 2>/dev/null)"
for t in wallet_send_transaction wallet_sign_message wallet_sign_typed_data; do
  jq -e ".result.tools[]|select(.name==\"$t\")|.annotations.destructiveHint==true" <<<"$out" >/dev/null && echo "PASS $t destructiveHint:true" || { echo "FAIL $t"; exit 1; }
done
jq -e '.result.tools[]|select(.name=="wallet_get_accounts")|.annotations.readOnlyHint==true' <<<"$out" >/dev/null && echo "PASS get_accounts readOnlyHint:true"
