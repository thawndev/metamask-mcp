import { WalletError, requestId } from "./errors.js";

export interface NextStep {
  tool: string;
  args?: Record<string, unknown>;
}

export interface Screen {
  locked?: boolean;
  chain?: { id: string; name?: string };
  accounts?: string[];
  balance?: { wei: string; display: string };
  [k: string]: unknown;
}

export interface Changed {
  field: string;
  from?: unknown;
  to?: unknown;
}

export interface StructuredResult {
  ok: boolean;
  screen?: Screen;
  changed?: Changed[];
  next?: NextStep[];
  code?: string;
  message?: string;
  hint?: string;
  retryable?: boolean;
  request_id?: string;
  [k: string]: unknown;
}

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent: StructuredResult;
  isError?: boolean;
};

export function okResult(
  screen: Screen,
  opts: { changed?: Changed[]; next?: NextStep[]; text?: string; extra?: Record<string, unknown> } = {},
): ToolResult {
  const structured: StructuredResult = {
    ok: true,
    screen,
    changed: opts.changed ?? [],
    next: opts.next ?? [],
    ...(opts.extra ?? {}),
  };
  const text = opts.text ?? summarize(screen, opts.changed);
  return { content: [{ type: "text", text }], structuredContent: structured };
}

export function errorResult(err: unknown): ToolResult {
  const w =
    err instanceof WalletError
      ? err
      : new WalletError("INTERNAL", (err as Error)?.message ?? String(err));
  const rid = requestId();
  const structured: StructuredResult = {
    ok: false,
    code: w.code,
    message: w.message,
    hint: w.hint,
    retryable: w.retryable,
    request_id: rid,
  };
  const text = `${w.code}: ${w.message}${w.hint ? " — " + w.hint : ""}`;
  return { content: [{ type: "text", text }], structuredContent: structured, isError: true };
}

function summarize(screen: Screen, changed?: Changed[]): string {
  const parts: string[] = [];
  if (screen.locked !== undefined) parts.push(screen.locked ? "locked" : "unlocked");
  if (screen.chain?.name) parts.push(screen.chain.name);
  if (screen.accounts) parts.push(`${screen.accounts.length} account(s)`);
  if (screen.balance) parts.push(screen.balance.display);
  if (changed && changed.length) parts.push(`changed: ${changed.map((c) => c.field).join(", ")}`);
  return parts.join(" · ") || "ok";
}
