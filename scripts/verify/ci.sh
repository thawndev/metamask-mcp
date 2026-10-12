#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
test -f .github/workflows/ci.yml && echo "PASS CI workflow present"
grep -q 'pnpm run lint' .github/workflows/ci.yml && grep -q 'pnpm run test' .github/workflows/ci.yml && echo "PASS CI runs lint + test"
