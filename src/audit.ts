import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { auditLogPath, ensureDir } from "./config.js";

export interface AuditEntry {
  id: string;
  ts: string;
  tool: string;
  method: string;
  chain: string | null;
  paramsHash: string;
  outcome: string;
  errorCode?: string;
  txHash?: string;
  prev: string;
  hash: string;
}

const GENESIS = "sha256:" + "0".repeat(64);

function canonical(e: Omit<AuditEntry, "hash">): string {
  return JSON.stringify({
    id: e.id,
    ts: e.ts,
    tool: e.tool,
    method: e.method,
    chain: e.chain,
    paramsHash: e.paramsHash,
    outcome: e.outcome,
    errorCode: e.errorCode ?? null,
    txHash: e.txHash ?? null,
    prev: e.prev,
  });
}

function hashOf(prev: string, body: string): string {
  return "sha256:" + createHash("sha256").update(prev + "|" + body).digest("hex");
}

export function paramsHash(params: unknown): string {
  return "sha256:" + createHash("sha256").update(stable(params)).digest("hex");
}

function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  const o = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(o)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stable(o[k]))
      .join(",") +
    "}"
  );
}

function lastHash(): string {
  const p = auditLogPath();
  if (!fs.existsSync(p)) return GENESIS;
  const lines = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return GENESIS;
  try {
    return (JSON.parse(last) as AuditEntry).hash;
  } catch {
    return GENESIS;
  }
}

let seq = 0;

/** Append an entry to the append-only, hash-chained audit log. Never stores raw params. */
export function appendAudit(input: {
  tool: string;
  method: string;
  params?: unknown;
  chain?: string | null;
  outcome: string;
  errorCode?: string;
  txHash?: string;
}): AuditEntry {
  ensureDir(path.dirname(auditLogPath()));
  const prev = lastHash();
  const body = {
    id: `au_${Date.now().toString(36)}_${(seq++).toString(36)}`,
    ts: new Date().toISOString(),
    tool: input.tool,
    method: input.method,
    chain: input.chain ?? null,
    paramsHash: paramsHash(input.params ?? null),
    outcome: input.outcome,
    errorCode: input.errorCode,
    txHash: input.txHash,
    prev,
  };
  const hash = hashOf(prev, canonical(body));
  const entry: AuditEntry = { ...body, hash };
  fs.appendFileSync(auditLogPath(), JSON.stringify(entry) + "\n", { encoding: "utf8" });
  return entry;
}

/** Verify the chain integrity. Returns the index of the first broken entry, or -1. */
export function verifyChain(): number {
  const p = auditLogPath();
  if (!fs.existsSync(p)) return -1;
  const lines = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    const e = JSON.parse(lines[i]!) as AuditEntry;
    const { hash: _hash, ...rest } = e;
    if (e.prev !== prev || hashOf(prev, canonical(rest)) !== e.hash) return i;
    prev = e.hash;
  }
  return -1;
}
