#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/_common.sh"
if rg -n 'Local Extension Settings|decryptVault|exportPrivateKey|revealSecretRecoveryPhrase|readSeed' src/; then
  echo "FAIL  a vault/key access path exists"; exit 1
fi
echo "PASS  no vault/key read or export path in src/"
