# Architecture

`metamask-mcp` is a single Node process that speaks MCP over stdio and talks to an EVM chain over
JSON-RPC. The process is self-contained.

```
MCP client ──stdio──▶ mcp.ts ──▶ tools.ts ──▶ session.ts ──▶ localProvider.ts ──▶ JSON-RPC (https)
                                                   │
                                                   ├─ confirm.ts   two-phase gate
                                                   ├─ audit.ts     hash-chained log
                                                   ├─ cache.ts     advisory last-known state
                                                   ├─ gas.ts       EIP-1559 suggestions
                                                   └─ swaps.ts     keyless aggregators (LI.FI / bridge)
cli.ts ──────────────▶ the same session (native CLI, no MCP client)
```

## Layers

| Module | Responsibility |
| --- | --- |
| `src/config.ts` | Reads the environment into `RuntimeConfig` (`MM_PRIVATE_KEY`/`_FILE`, `MM_NETWORK`, `MM_RPC_URL`). |
| `src/chains/rpc.ts` | Resolves the RPC URL for a chain id and enforces the **allowlist** (https only; local only with `MM_ALLOW_LOCAL_RPC=1`). |
| `src/wallet/localProvider.ts` | Implements the EIP-1193 surface used by the tools, backed by a private key + RPC (`viem`). Signs, sends, and forwards reads (`eth_call`, `eth_getLogs`, …). |
| `src/wallet/session.ts` | Owns one provider and serialises every request through a single-flight queue. Builds the signer lazily so `tools/list` needs no key. |
| `src/tools.ts` | Registers all MCP tools: reads, the two-phase writes, ENS, Multicall, ERC helpers, EIP-712, swaps. |
| `src/confirm.ts` | Issues single-use `confirm_token`s bound to `sha256(preview)` with a TTL; `consume` is atomic and single-use. |
| `src/audit.ts` | Append-only, hash-chained audit log; stores a params hash, never secrets; `verifyChain()` detects tampering. |
| `src/cache.ts` | Advisory last-known accounts/chain, refreshed on every read and after every mutation. |
| `src/gas.ts` | EIP-1559 fee suggestions with `eth_feeHistory` and a fallback. |
| `src/swaps.ts` | Keyless aggregator clients: MetaMask bridge (`getSwapQuote`) and LI.FI (`getLifiQuote`, executable calldata). |
| `src/mcp.ts` | Builds the `McpServer` and registers the tools. |
| `src/cli.ts` | The native CLI (`setup`, `serve`, `describe`, `doctor`, `rpc`, `accounts`, `balance`, `send`, `sign-message`). |

## The two-phase gate

Any tool that signs or broadcasts is split:

1. `wallet_inspect_*` builds the exact request, stores it in `confirm.ts`, and returns a preview plus a
   `confirm_token`.
2. The execute tool (`wallet_sign_message`, `wallet_sign_typed_data`, `wallet_send_transaction`,
   `wallet_execute_swap`) consumes the token atomically and runs **only** the stored request.

A token is single-use, TTL-bounded, and bound to `sha256(preview)` — the executed bytes are always
the previewed bytes. Expired or reused tokens return a structured error.

## Security invariants

- Keys are never logged; the audit log stores only a params hash.
- RPC endpoints must be `https://` unless `MM_ALLOW_LOCAL_RPC=1`.
- Outbound calls are timeout-bounded; oversized responses are rejected.
- Structured errors only — tool handlers never throw raw exceptions to the client.

## Testing

`scripts/verify/*.sh` are committed drive scripts, one behaviour each, run by `pnpm run verify`.
Chain-dependent checks run against Ganache (chain id 1337) or a mainnet fork (Anvil). Unit tests live
in `tests/`, benchmarks in `scripts/bench-*.mjs`.
