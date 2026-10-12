# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

### Added

- MCP server (48 tools) over EIP-1193 / JSON-RPC with an in-process signer.
- Reads: accounts, balance, network, gas (EIP-1559 + `eth_feeHistory`), gas estimation, read-only
  `eth_call`, `eth_getLogs` (with ERC-20 Transfer decode + range chunking), token info/balance,
  ERC-20 allowance, ERC-721 `ownerOf`/`tokenURI`, ERC-1155 `balanceOf`, Multicall3 batch.
- ENS: forward resolve, reverse lookup, text records, resolver.
- Signing/writes behind a two-phase confirmation gate: `personal_sign`, `eth_signTypedData_v4`,
  `eth_sendTransaction`.
- EIP-712 toolkit: Permit (ERC-2612) and Permit2 builders, typed-data digest (`hashTypedData`),
  EIP-5267 `eip712Domain`, EIP-2612 `nonces`.
- ERC-4337 EntryPoint v0.7 `getNonce`.
- Keyless swaps via LI.FI (executable calldata) with `wallet_inspect_swap` / `wallet_execute_swap`;
  keyless MetaMask bridge quote.
- Calldata builders: ERC-20 transfer/approve, ERC-721/1155 `safeTransferFrom`; EIP-55 checksum.
- Native CLI: `setup`, `serve`, `describe`, `doctor`, `rpc`, `accounts`, `balance`, `send`,
  `sign-message`.
- Security: RPC allowlist, hash-chained audit log, secret redaction, bounded I/O.
- 60 drive scripts, unit tests, benchmarks, adversarial input suite, CI.

[Unreleased]: https://github.com/thawndev/metamask-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/thawndev/metamask-mcp/releases/tag/v0.1.0
