#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
bash "$DIR/no-sla.sh"
grep -qi "Roll back" README.md && echo "PASS rollback documented"
