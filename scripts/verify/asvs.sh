#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
test -f SECURITY.md && grep -q 'ASVS' SECURITY.md && echo "PASS ASVS checklist committed (SECURITY.md)"
grep -q 'level 2' SECURITY.md && echo "PASS ASVS L2 target stated"
