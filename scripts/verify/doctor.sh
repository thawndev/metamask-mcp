#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
out="$(MM_HOME="$PWD/.agents/run/p/home" MM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 node dist/cli.js doctor 2>&1)"
echo "$out" | head -8
grep -q 'node ' <<<"$out" && echo "PASS doctor reports node"
grep -q 'audit chain' <<<"$out" && echo "PASS doctor checks the audit chain"
