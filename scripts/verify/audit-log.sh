#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
rm -f "$MM_HOME/audit.log"
out="$(run_mcp wallet_send_transaction '{"confirm_token":"ck_deadbeef"}')"
echo "$out"
assert_contains "$out" 'CONFIRMATION_EXPIRED' "bad token rejected"
assert_contains "$out" '"request_id":"req_' "error envelope has request_id"
AUDIT="$MM_HOME/audit.log"
test -s "$AUDIT" && echo "PASS audit.log written on a mutating attempt"
node -e "import('./dist/audit.js').then(m=>{const b=m.verifyChain(); console.log(b<0?'PASS audit chain intact':'FAIL audit chain broken at '+b); process.exit(b<0?0:1)})"
