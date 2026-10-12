# Contributing

Thanks for helping. This project is intentionally small and heavily tested — please keep it that way.

## Ground rules

- **Plain EIP-1193 / JSON-RPC.** Every capability talks to the chain directly, in-process.
- **One behaviour, one commit.** Every commit builds and passes `pnpm run lint && pnpm run test`.
- **Prove it by operating it.** A new tool ships with a `scripts/verify/*.sh` drive script and, where
  it touches a real chain, a test that runs against a local chain or a mainnet fork.

## Setup

```bash
pnpm install
pnpm run build
pnpm run lint
pnpm run test
```

Run a local chain for the chain-dependent verifies:

```bash
npx -y ganache --wallet.mnemonic "test test test test test test test test test test test junk" --chain.chainId 1337
bash scripts/verify/local-e2e.sh
```

`pnpm run verify` runs every committed drive script.

## Adding a tool

1. Register it in `src/tools.ts` with a `title`, a `description`, an `inputSchema` (zod) and honest
   annotations (`readOnlyHint` for reads; `destructiveHint` for anything that signs or broadcasts).
2. Reads: call `getSession().providerRequest(...)` or the ERC helpers. Writes: use the two-phase gate
   (`wallet_inspect_*` then the execute tool).
3. Add a `scripts/verify/<tool>.sh` that exercises it and prints `PASS ...`.
4. Update `README.md` and add a `CHANGELOG.md` entry.

## Commit style

Short imperative subject, present tense, e.g. `add wallet_eip712_domain (EIP-5267)`.

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
