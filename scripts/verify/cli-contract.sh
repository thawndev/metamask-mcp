#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
node dist/cli.js --help >/dev/null && echo "PASS --help exit 0"
node dist/cli.js --version | grep -qE '^[0-9]+\.' && echo "PASS --version prints a version"
node dist/cli.js bogus-command >/dev/null 2>&1; [ $? -eq 2 ] && echo "PASS usage error exit 2" || echo "FAIL usage exit"
node dist/cli.js setup --mnemonic-file /nonexistent-mnemonic >/dev/null 2>&1; [ $? -ne 0 ] && echo "PASS runtime error non-zero exit" || echo "FAIL runtime exit"
