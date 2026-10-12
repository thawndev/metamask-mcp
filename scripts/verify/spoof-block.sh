#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR/../.."
a="$(bash "$DIR/schema-validate.sh" 2>&1)"; b="$(bash "$DIR/param-validation.sh" 2>&1)"
if grep -q PASS <<<"$a" && grep -q PASS <<<"$b"; then echo "PASS spoofed/hostile params blocked (schema + value validation)"; else echo "FAIL"; echo "$a" | tail -2; echo "$b" | tail -2; exit 1; fi
