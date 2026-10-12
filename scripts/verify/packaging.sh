#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
out="$(npm pack --dry-run 2>&1)"
grep -q 'dist/cli.js' <<<"$out" && echo "PASS package includes dist/cli.js"
grep -q '"bin"' package.json && echo "PASS bin declared"
node -e "const p=require('./package.json'); if(!p.repository)process.exit(1)" && echo "PASS repository field present"
