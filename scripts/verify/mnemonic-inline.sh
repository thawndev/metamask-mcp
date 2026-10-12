#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
PHRASE="test test test test test test test test test test test junk"
ACC=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
rm -rf .agents/run/mni .agents/run/mne; mkdir -p .agents/run/mni

out="$(MM_HOME="$PWD/.agents/run/mni" node dist/cli.js setup --mnemonic "$PHRASE" --rpc http://127.0.0.1:8545 --chain 1337 2>&1)"
grep -q "Derived account 0: $ACC" <<<"$out" && echo "PASS inline phrase derives account 0"
test -f .agents/run/mni/signer.key && echo "PASS key written to a file"
[ "$(stat -c %a .agents/run/mni/signer.key)" = "600" ] && echo "PASS key file is 0600"
if grep -qE '0x[0-9a-f]{64}' <<<"$out"; then echo "FAIL key leaked to stdout"; exit 1; fi
echo "PASS no key printed"
acc="$(MM_HOME="$PWD/.agents/run/mni" MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 MM_ALLOW_LOCAL_RPC=1 MM_PRIVATE_KEY_FILE="$PWD/.agents/run/mni/signer.key" node scripts/mcp-call.mjs wallet_get_accounts '{}' 2>/dev/null | jq -r '.result.structuredContent.screen.accounts[0]')"
[ "$acc" = "$ACC" ] && echo "PASS server uses the derived key"

mkdir -p .agents/run/mne
out2="$(MM_HOME="$PWD/.agents/run/mne" MM_MNEMONIC="$PHRASE" node dist/cli.js setup --rpc http://127.0.0.1:8545 --chain 1337 2>&1)"
grep -q "Derived account 0: $ACC" <<<"$out2" && echo "PASS MM_MNEMONIC env derives account 0"
rm -rf .agents/run/mni .agents/run/mne
