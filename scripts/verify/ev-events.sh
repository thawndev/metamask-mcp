#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
bash "$DIR/audit-log.sh" | grep -q "PASS audit.log written" && echo "PASS event trail (audit) present"
