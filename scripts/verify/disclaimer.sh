#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
grep -qi 'unofficial' README.md && echo "PASS README disclaimer"
node dist/cli.js --help | grep -qi 'unofficial' && echo "PASS --help disclaimer"
node -e "console.log(require('./package.json').description)" | grep -qi 'unofficial' && echo "PASS package description disclaimer"
if grep -rqiE 'nkbihfbeogaeaoehlefnkodbefgpgknn' README.md package.json 2>/dev/null; then echo "FAIL MetaMask id traded as brand"; exit 1; fi
echo "PASS no MetaMask marks in name"
