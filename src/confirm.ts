import { randomBytes, createHash } from "node:crypto";
import { WalletError } from "./errors.js";

export interface Confirmation {
  token: string;
  kind: string;
  tool: string;
  method: string;
  request: unknown;
  requestHash: string;
  expiresAt: number;
  used: boolean;
}

export function hashRequest(obj: unknown): string {
  return "sha256:" + createHash("sha256").update(stable(obj)).digest("hex");
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

/**
 * Single-use, TTL-bounded confirmations that bind the bytes signed to the bytes previewed
 * (FR-025, THR-02). In-memory only; a restart invalidates every outstanding token.
 */
export class ConfirmationStore {
  private map = new Map<string, Confirmation>();
  private used = new Set<string>();

  constructor(private ttlMs = 120_000) {}

  issue(input: { kind: string; tool: string; method: string; request: unknown; ttlMs?: number }): Confirmation {
    const token = "ck_" + randomBytes(12).toString("hex");
    const c: Confirmation = {
      token,
      kind: input.kind,
      tool: input.tool,
      method: input.method,
      request: input.request,
      requestHash: hashRequest(input.request),
      expiresAt: Date.now() + (input.ttlMs ?? this.ttlMs),
      used: false,
    };
    this.map.set(token, c);
    return c;
  }

  consume(token: string): Confirmation {
    if (!token || typeof token !== "string") {
      throw new WalletError("INVALID_PARAMS", "confirm_token is required.", {
        hint: "Call the matching wallet_inspect_* tool first.",
      });
    }
    const c = this.map.get(token);
    if (!c) {
      if (this.used.has(token)) {
        throw new WalletError("ALREADY_CONSUMED", "This confirm_token was already used.", {
          hint: "Inspect again to get a fresh token.",
        });
      }
      throw new WalletError("CONFIRMATION_EXPIRED", "This confirm_token is unknown or expired.", {
        hint: "Inspect again to get a fresh token.",
      });
    }
    if (c.used) {
      throw new WalletError("ALREADY_CONSUMED", "This confirm_token was already used.");
    }
    if (Date.now() > c.expiresAt) {
      this.used.add(token);
      throw new WalletError("CONFIRMATION_EXPIRED", "This confirm_token has expired.", {
        hint: "Inspect again to get a fresh token.",
      });
    }
    c.used = true;
    this.used.add(token);
    return c;
  }

  size(): number {
    return this.map.size;
  }
}

export const confirmations = new ConfirmationStore();
