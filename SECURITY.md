# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Report privately via GitHub's
[Security Advisories](https://github.com/thawndev/metamask-mcp/security/advisories/new) or email the
maintainer. We aim to acknowledge within 72 hours and to ship a fix or mitigation as fast as is
practical.

## Threat model

This server holds a private key **in-process** and can sign and broadcast transactions. Treat the
host it runs on, and the key it is given, as sensitive.

Controls in place:

- **Keys never logged.** The audit log stores a `sha256` hash of request params, never the params,
  and never a key, message body or signature. `SECURITY`-class secrets are redacted from errors.
- **RPC allowlist.** Only `https://` endpoints are accepted by default. Plaintext `http://` and
  private/loopback hosts are refused unless `MM_ALLOW_LOCAL_RPC=1` is explicitly set (intended for
  local dev chains only).
- **Two-phase confirmation.** Every mutating tool splits into `inspect_*` (returns a preview plus a
  single-use `confirm_token` bound to `sha256(preview)`, TTL-bounded) and execute. A token cannot be
  reused, cannot be replayed after expiry, and the executed bytes are exactly the previewed bytes.
- **Bounded I/O.** Outbound RPC calls carry timeouts; oversized responses are rejected.
- **Append-only audit.** The audit log is hash-chained; tampering is detectable via `verifyChain()`.

## Operational guidance

- Use a dedicated, low-value key. Do not run this against a key that controls real funds without
  understanding the risk.
- Prefer `MM_PRIVATE_KEY_FILE` (a `chmod 600` file) over an inline key in client config.
- Run behind a host you control; the server speaks MCP over stdio and makes outbound RPC calls only.
- Rotate the key if you suspect the host was compromised, and review the audit log.

## Supported versions

The latest published minor release receives security fixes.
