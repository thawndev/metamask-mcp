#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
# chainId must be a string; a number should be rejected by the SDK's schema validation
out="$(run_mcp wallet_get_gas '{"chainId":12345}')"
echo "$out"
if grep -qE 'isError":true|error' <<<"$out"; then echo "PASS schema validation rejected wrong-typed params"; else echo "FAIL wrong-typed params accepted"; exit 1; fi
