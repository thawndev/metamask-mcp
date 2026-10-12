#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
if ! curl -s -o /dev/null -X POST http://127.0.0.1:8545 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'; then echo "SKIP local chain not running"; exit 0; fi
out="$(node dist/cli.js setup --generate --fund --rpc http://127.0.0.1:8545 --chain 1337 2>&1)"
echo "$out" | head -6
grep -q 'Local-signer account: 0x' <<<"$out" && echo "PASS generated a real account"
grep -q 'Funded with 10 test ETH' <<<"$out" && echo "PASS funded with test coins"
grep -q '"MM_PRIVATE_KEY"' <<<"$out" && echo "PASS ready-to-paste config with env"
