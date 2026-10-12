import { randomBytes } from "node:crypto";

/** Stable machine error codes (contract); messages are not. */
export type ErrorCode =
  | "USER_REJECTED"
  | "UNAUTHORIZED"
  | "UNSUPPORTED_METHOD"
  | "DISCONNECTED"
  | "CHAIN_DISCONNECTED"
  | "UNRECOGNIZED_CHAIN"
  | "INVALID_PARAMS"
  | "INTERNAL"
  | "WALLET_LOCKED"
  | "NO_SIGNER"
  | "AUTH_FAILED"
  | "CONFIRMATION_EXPIRED"
  | "QUOTE_EXPIRED"
  | "ALREADY_CONSUMED"
  | "INSUFFICIENT_FUNDS"
  | "NOT_FOUND"
  | "REVERT"
  | "RPC_ERROR";

export class WalletError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { hint?: string; retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "WalletError";
    this.code = code;
    this.hint = opts.hint ?? "";
    this.retryable = opts.retryable ?? false;
    this.status = opts.status ?? 0;
  }
}

/** EIP-1193 error code → our contract. */
export function mapProviderError(e: unknown): WalletError {
  const anyE = e as { code?: number | string; message?: string; data?: unknown };
  const raw = typeof anyE?.code === "string" ? Number(anyE.code) : anyE?.code;
  const msg = anyE?.message ?? String(e);
  switch (raw) {
    case 4001:
      return new WalletError("USER_REJECTED", "The request was rejected.", {
        hint: "No retry — this was your decision.",
        retryable: false,
      });
    case 4100:
      return new WalletError("UNAUTHORIZED", "The request was not authorised.", {
        hint: "Call wallet_get_accounts or request permissions first.",
        retryable: false,
      });
    case 4200:
      return new WalletError("UNSUPPORTED_METHOD", `Unsupported method: ${msg}`);
    case 4900:
      return new WalletError("DISCONNECTED", "The provider is not connected.", {
        hint: "Check MM_RPC_URL and the network.",
        retryable: true,
      });
    case 4901:
      return new WalletError("CHAIN_DISCONNECTED", "The wallet is disconnected from this chain.");
    case 4902:
      return new WalletError("UNRECOGNIZED_CHAIN", `Chain is not added to this wallet.`, {
        hint: "Call wallet_add_network (or switch with addIfMissing:true) then retry.",
        retryable: false,
      });
    case -32602:
      return new WalletError("INVALID_PARAMS", `Invalid params: ${msg}`);
    case -32603:
      return new WalletError("INTERNAL", `Wallet internal error: ${msg}`);
    default:
      return new WalletError("INTERNAL", msg || "Wallet error");
  }
}

export function requestId(): string {
  return "req_" + randomBytes(5).toString("hex");
}
