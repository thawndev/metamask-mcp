# metamask-mcp

**An Ethereum wallet MCP server.** 48 tools over EIP-1193 / JSON-RPC, backed by an in-process signer.

[![npm](https://img.shields.io/npm/v/@thawndev/metamask-mcp)](https://www.npmjs.com/package/@thawndev/metamask-mcp)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![node](https://img.shields.io/badge/node-%3E%3D22.14-brightgreen)

> Unofficial. Not affiliated with, endorsed by, or sponsored by MetaMask or Consensys.

## What it is

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives an agent a real Ethereum account: read chain state, build and sign transactions and EIP-712 payloads, execute swaps, resolve ENS, batch calls, query logs. All of it is plain EIP-1193 / JSON-RPC over your RPC endpoint.

## Features

- **48 MCP tools** — reads, gated writes, ENS, Multicall3, ERC-20/721/1155, EIP-712 (Permit/Permit2), EIP-5267, EIP-2612, ERC-4337 nonces, keyless swaps, `eth_getLogs`.
- **Two-phase safety gate** — every write/sign returns a preview + single-use `confirm_token` bound to the previewed bytes; nothing is signed without a fresh token.
- **Native CLI** — the same engine without MCP: `accounts`, `balance`, `rpc`, `send`, `sign-message`.
- **Append-only audit log** — hash-chained, stores only a params hash, never secrets.
- **RPC allowlist** — https only by default; a local chain needs `MM_ALLOW_LOCAL_RPC=1`.
- **Deterministic, tested** — 60 drive scripts, unit tests, benchmarks, adversarial input suite.

## Requirements

- Node **>= 22.14**
- A JSON-RPC endpoint (a public https RPC, or a local dev chain such as Ganache/Anvil)

## Install

```bash
npm install -g @thawndev/metamask-mcp
# or run without installing
npx -y @thawndev/metamask-mcp setup --generate
```

## Quick start

```bash
# 1. configure a signer (nothing visual happens)
metamask-mcp setup --generate

# 2. point at a chain (example: local Ganache with test coins)
npx -y ganache --wallet.mnemonic "test test test test test test test test test test test junk" --chain.chainId 1337

# 3. use the native CLI
export MM_PRIVATE_KEY=0x... MM_NETWORK=1337 MM_RPC_URL=http://127.0.0.1:8545 MM_ALLOW_LOCAL_RPC=1
metamask-mcp accounts
metamask-mcp balance
metamask-mcp rpc eth_blockNumber
metamask-mcp sign-message "hello"
```

### MCP client config

```json
{
  "mcpServers": {
    "metamask": {
      "command": "npx",
      "args": ["-y", "@thawndev/metamask-mcp", "serve"],
      "env": { "MM_PRIVATE_KEY": "0x...", "MM_NETWORK": "1", "MM_RPC_URL": "https://ethereum-rpc.publicnode.com" }
    }
  }
}
```

Environment: `MM_PRIVATE_KEY` **or** `MM_PRIVATE_KEY_FILE` (a 0600 file), `MM_NETWORK`, `MM_RPC_URL`, `MM_ALLOW_LOCAL_RPC`, `MM_HOME`.

## CLI

```
metamask-mcp setup --generate | --private-key 0x... | --mnemonic-file <path>
metamask-mcp serve
metamask-mcp describe [--json]
metamask-mcp doctor
metamask-mcp rpc <method> [jsonParams]
metamask-mcp accounts | balance [addr] | send --to <a> [--value <wei>] [--data <hex>] | sign-message <msg>
```

## Tools

| Tool | What it does |
| --- | --- |
| `wallet_get_status` | Return whether the wallet is unlocked and the active chain |
| `wallet_get_accounts` | Return the accounts the wallet exposes |
| `wallet_get_balance` | Return the native-token balance for an address (defaults to the first account) on a chain (default Sepolia). |
| `wallet_get_network` | Return the active chain id and name. |
| `wallet_get_gas` | Return low/medium/high EIP-1559 gas fee suggestions for a chain. |
| `wallet_estimate_gas` | Estimate gas for a transaction via the native provider (eth_estimateGas). |
| `wallet_describe_screen` | Return the wallet's current state as structured data, including what changed since the last call |
| `wallet_get_token_balances` | Return an ERC-20 token balance for an address (read-only, over the allowlisted RPC). |
| `wallet_call` | Perform a read-only eth_call against any contract over the allowlisted RPC. |
| `wallet_inspect_signature` | Preview a message or EIP-712 typed-data signature and return a single-use confirm_token |
| `wallet_sign_message` | personal_sign |
| `wallet_sign_typed_data` | eth_signTypedData_v4 |
| `wallet_inspect_transaction` | Preview a transaction (to/value/data/chainId) and return a single-use confirm_token |
| `wallet_send_transaction` | eth_sendTransaction |
| `wallet_add_network` | Add an EVM chain (wallet_addEthereumChain). |
| `wallet_switch_network` | Switch the active chain (wallet_switchEthereumChain) |
| `wallet_get_transaction_receipt` | Return the status and block of a transaction (read-only, over the allowlisted RPC). |
| `wallet_get_swap_quote` | Return a same-chain swap quote from the keyless MetaMask bridge aggregator. |
| `wallet_lock` | Lock the wallet and report the locked state. |
| `wallet_select_account` | Select the active account (local-signer mode has a single native account). |
| `wallet_watch_asset` | Ask the wallet to track an ERC-20 token (native wallet_watchAsset). |
| `wallet_get_capabilities` | Return wallet capabilities per chain (native wallet_getCapabilities). |
| `wallet_get_cache` | Return the last-known accounts/chain (advisory, refreshed on every read and after every mutation). |
| `wallet_token_info` | Read an ERC-20 token's symbol, decimals and name via eth_call. |
| `wallet_token_balance` | Read an ERC-20 balance (defaults to the active account) via native eth_call, decoded with decimals. |
| `wallet_resolve_name` | Resolve an ENS name (e.g |
| `wallet_lookup_address` | Look up the primary ENS name for an address (forward-confirmed), natively. |
| `wallet_call_batch` | Execute several read-only eth_calls in ONE RPC round trip via Multicall3.aggregate3 |
| `wallet_nft_owner` | Read the owner of an ERC-721 token id via native eth_call ownerOf(uint256). |
| `wallet_nft_uri` | Read an ERC-721 tokenURI(uint256) via native eth_call (decoded string). |
| `wallet_erc1155_balance` | Read an ERC-1155 balanceOf(address,uint256) via native eth_call (owner defaults to the active account). |
| `wallet_build_typed_data` | Build a standard EIP-712 payload (ERC-2612 Permit or Permit2 PermitSingle) and its digest, ready to sign with wallet_sign_typed_data |
| `wallet_typed_data_hash` | Compute the EIP-712 signing digest (hashTypedData) for a typed-data object |
| `wallet_get_logs` | eth_getLogs with an optional ERC-20 Transfer decode |
| `wallet_ens_text` | Read an ENS text record (e.g |
| `wallet_ens_resolver` | Return the resolver contract address for an ENS name, natively. |
| `wallet_erc20_allowance` | Read allowance(owner,spender) for an ERC-20 token via native eth_call. |
| `wallet_permit_nonce` | Read the EIP-2612 nonces(owner) for a token, to build a Permit signature natively. |
| `wallet_get_nonce_4337` | Read an account's ERC-4337 nonce from EntryPoint v0.7 getNonce(sender, key) via native eth_call. |
| `wallet_eip712_domain` | Read a contract's EIP-5267 eip712Domain() (name, version, chainId, verifyingContract) via native eth_call. |
| `wallet_erc20_transfer` | Build ERC-20 transfer(to,amount) calldata to feed wallet_inspect_transaction. |
| `wallet_erc20_approve` | Build ERC-20 approve(spender,amount) calldata. |
| `wallet_erc721_transfer` | Build ERC-721 safeTransferFrom(from,to,tokenId) calldata. |
| `wallet_erc1155_transfer` | Build ERC-1155 safeTransferFrom(from,to,id,amount,data) calldata. |
| `wallet_checksum_address` | Return the EIP-55 mixed-case checksum form of an address (validates it). |
| `wallet_inspect_swap` | Quote a same-chain swap from the keyless LI.FI aggregator and return an executable preview + single-use confirm_token |
| `wallet_execute_swap` | Broadcast a previewed swap via eth_sendTransaction |
| `wallet_rpc` | Call any read-only EIP-1193/JSON-RPC method natively (eth_*, net_*, web3_*, wallet_get*) |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security

See [SECURITY.md](SECURITY.md). The signer's key is held in-process; use a dedicated test key unless you accept the risk. Never commit `MM_PRIVATE_KEY`.

## Development

```bash
pnpm install
pnpm run build        # tsc
pnpm run lint
pnpm run test         # vitest
pnpm run verify       # every committed drive script
pnpm run bench
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
