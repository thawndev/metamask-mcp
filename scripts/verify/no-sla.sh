#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
grep -qi 'No SLA' README.md && echo "PASS no-SLA stated"
grep -qi 'End-of-life' README.md && grep -qi 'deletion' README.md && echo "PASS EOL export/delete documented"
