#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
node_modules/.bin/vitest run tests/unit.test.ts -t 'allowlist' >/dev/null 2>&1 && echo 'PASS rpc allowlist unit'
