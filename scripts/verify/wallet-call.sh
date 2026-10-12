#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
out="$(node scripts/mcp-call.mjs wallet_call '{"chainId":"1","to":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","data":"0x18160ddd"}')"
echo "$out"
assert_contains "$out" '"result":"0x' "eth_call returned hex result"
