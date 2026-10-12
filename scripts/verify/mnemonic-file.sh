#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
export MM_HOME="$PWD/.agents/run/mnv"
rm -rf .agents/run/mnv; mkdir -p .agents/run/mnv
printf 'test test test test test test test test test test test junk\n' > /tmp/mm.phrase; chmod 600 /tmp/mm.phrase
out="$(node dist/cli.js setup --mnemonic-file /tmp/mm.phrase --rpc http://127.0.0.1:8545 --chain 1337 2>&1)"
KEY="$(echo "$out" | grep -oE 'signer.key' | head -1)"
acc="$(MM_PRIVATE_KEY_FILE="$PWD/.agents/run/mnv/signer.key" MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 MM_ALLOW_LOCAL_RPC=1 node scripts/mcp-call.mjs wallet_get_accounts '{}' 2>/dev/null | jq -r '.result.structuredContent.screen.accounts[0]')"
rm -f /tmp/mm.phrase
grep -q 'Derived account 0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' <<<"$out" && echo "PASS mnemonic derived to the correct account 0"
test -f .agents/run/mnv/signer.key && echo "PASS key written to a file"
if grep -qE '0x[0-9a-f]{64}' <<<"$out"; then echo "FAIL key/secret leaked to stdout"; exit 1; fi
echo "PASS no secret printed"
[ "$acc" = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" ] && echo "PASS server uses MM_PRIVATE_KEY_FILE"
rm -rf .agents/run/mnv
