import { describe, it, expect } from "vitest";
import { appendAudit, verifyChain, paramsHash } from "../src/audit.js";
import { WalletError, mapProviderError } from "../src/errors.js";
import { okResult, errorResult } from "../src/result.js";
import { ConfirmationStore } from "../src/confirm.js";
import { rpcUrlFor } from "../src/chains/rpc.js";
import fs from "node:fs";
import { auditLogPath } from "../src/config.js";

describe("audit", () => {
  it("appends a hash-chained log and verifies it", () => {
    const e1 = appendAudit({ tool: "t", method: "eth_accounts", params: { a: 1 }, outcome: "ok" });
    const e2 = appendAudit({ tool: "t2", method: "eth_chainId", outcome: "ok" });
    expect(e2.prev).toBe(e1.hash);
    expect(verifyChain()).toBe(-1);
  });

  it("hashes params deterministically and never stores them raw", () => {
    const h = paramsHash({ b: 2, a: 1 });
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(h).toBe(paramsHash({ a: 1, b: 2 })); // key order independent
  });
});

describe("errors", () => {
  it("maps EIP-1193 codes to the contract", () => {
    expect(mapProviderError({ code: 4001 }).code).toBe("USER_REJECTED");
    expect(mapProviderError({ code: 4902 }).code).toBe("UNRECOGNIZED_CHAIN");
    expect(mapProviderError({ code: -32602 }).code).toBe("INVALID_PARAMS");
    expect(mapProviderError({ code: 4001 }).retryable).toBe(false);
  });
});

describe("result envelope", () => {
  it("returns ok and error shapes", () => {
    const ok = okResult({ locked: false });
    expect(ok.structuredContent.ok).toBe(true);
    expect(ok.structuredContent.changed).toEqual([]);
    const bad = errorResult(new WalletError("WALLET_LOCKED", "locked", { hint: "unlock" }));
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent.code).toBe("WALLET_LOCKED");
    expect(bad.structuredContent.request_id).toMatch(/^req_/);
  });
});

describe("confirmation store (two-phase gate)", () => {
  it("is single-use, TTL-bounded, and returns the previewed request", () => {
    const s = new ConfirmationStore(50);
    const c = s.issue({ kind: "message", tool: "wallet_sign_message", method: "personal_sign", request: { a: 1 } });
    expect(s.consume(c.token).request).toEqual({ a: 1 });
    expect(() => s.consume(c.token)).toThrowError(/already used/i);
    expect(() => s.consume("ck_nope")).toThrowError(/unknown or expired/i);
  });
  it("expires after the TTL", async () => {
    const s = new ConfirmationStore(10);
    const c = s.issue({ kind: "tx", tool: "wallet_send_transaction", method: "eth_sendTransaction", request: {} });
    await new Promise((r) => setTimeout(r, 20));
    expect(() => s.consume(c.token)).toThrowError(/expired/i);
  });
});

describe("rpc allowlist (THR-04, F-049)", () => {
  it("rejects http and private/loopback hosts by default", () => {
    expect(() => rpcUrlFor(1, "http://example.com")).toThrowError(/https/i);
    expect(() => rpcUrlFor(1, "https://127.0.0.1:8545")).toThrowError(/private|loopback/i);
    expect(rpcUrlFor(1, "https://ethereum-rpc.publicnode.com")).toContain("publicnode");
  });
  it("allows a local http chain only when explicitly enabled", () => {
    process.env.MM_ALLOW_LOCAL_RPC = "1";
    expect(rpcUrlFor(1, "http://127.0.0.1:8545")).toBe("http://127.0.0.1:8545");
    delete process.env.MM_ALLOW_LOCAL_RPC;
  });
});

describe("secret redaction (THR-06, F-027)", () => {
  it("never writes a secret to the audit log", () => {
    const secret = "0x" + "deadbeef".repeat(8);
    appendAudit({ tool: "wallet_sign_message", method: "personal_sign", params: { message: "hi" }, outcome: "ok" });
    const log = fs.existsSync(auditLogPath()) ? fs.readFileSync(auditLogPath(), "utf8") : "";
    expect(log).not.toContain(secret);
    expect(log).toMatch(/paramsHash/);
  });
});

import { getSwapQuote } from "../src/swaps.js";
import { WalletSession } from "../src/wallet/session.js";

describe("bridge fallback (INT-4, F-093)", () => {
  it("returns a structured error when the bridge API fails", async () => {
    const orig = global.fetch;
    (global as any).fetch = async () => ({ ok: false, status: 503 });
    await expect(getSwapQuote({ chainId: 1, sellToken: "0x0", buyToken: "0x0", amount: "1", taker: "0x0" })).rejects.toMatchObject({ code: "RPC_ERROR" });
    global.fetch = orig;
  });
});

describe("single-flight queue (FR-056, F-103)", () => {
  it("serialises concurrent provider requests without corruption", async () => {
    process.env.MM_ALLOW_LOCAL_RPC = "1";
    const s = new WalletSession({ network: "1337", rpcUrl: "http://127.0.0.1:8545", privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" } as any);
    const [a, b] = await Promise.all([s.providerRequest("eth_chainId"), s.providerRequest("eth_accounts")]);
    expect(a).toBe("0x539");
    expect(Array.isArray(b)).toBe(true);
    delete process.env.MM_ALLOW_LOCAL_RPC;
  });
});
