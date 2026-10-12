#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
if rg -ni 'while \(|maxRetries|retries\b' src/tools.ts >/dev/null; then echo "FAIL retry loop in tools"; exit 1; fi
echo "PASS no retry loop in tool handlers"
