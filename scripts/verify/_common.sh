#!/usr/bin/env bash
# Shared env for verify scripts. Native signer; isolated from the user's real ~/.metamask-mcp.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export MM_HOME="$ROOT/.agents/run/p/home"
export MM_PRIVATE_KEY="${MM_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
export MM_NETWORK="${MM_NETWORK:-1337}"
export MM_RPC_URL="${MM_RPC_URL:-http://127.0.0.1:8545}"
export MM_ALLOW_LOCAL_RPC="1"
mkdir -p "$MM_HOME"

run_mcp() { node scripts/mcp-call.mjs "$@"; }

# Assert a JSON blob contains a substring; print and exit non-zero on failure.
assert_contains() {
  local hay="$1" needle="$2" label="$3"
  if grep -qF -- "$needle" <<<"$hay"; then
    echo "PASS  $label"
  else
    echo "FAIL  $label (missing: $needle)"
    echo "$hay" | head -c 800
    exit 1
  fi
}
