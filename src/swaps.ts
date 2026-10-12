import { WalletError } from "./errors.js";

export interface LifiSwap {
  source: "lifi";
  quoteId: string;
  to: string;
  data: string;
  value: string;
  gasLimit?: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  destAmount: string;
}

/** LI.FI keyless aggregator — returns an EXECUTABLE transaction request (calldata). */
export async function getLifiQuote(input: {
  chainId: number;
  sellToken: string;
  buyToken: string;
  amount: string;
  taker: string;
  slippage?: number;
}): Promise<LifiSwap> {
  const url = new URL("https://li.quest/v1/quote");
  url.searchParams.set("fromChain", String(input.chainId));
  url.searchParams.set("toChain", String(input.chainId));
  url.searchParams.set("fromToken", input.sellToken);
  url.searchParams.set("toToken", input.buyToken);
  url.searchParams.set("fromAmount", input.amount);
  url.searchParams.set("fromAddress", input.taker);
  if (input.slippage) url.searchParams.set("slippage", String(input.slippage));

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw new WalletError("RPC_ERROR", `LI.FI unreachable: ${(e as Error).message}`, { retryable: true });
  }
  if (!res.ok) throw new WalletError("RPC_ERROR", `LI.FI returned HTTP ${res.status}`, { retryable: true });
  const j = (await res.json()) as {
    id?: string;
    estimate?: { toAmount?: string };
    transactionRequest?: { to?: string; data?: string; value?: string; gasLimit?: string };
  };
  const tr = j.transactionRequest;
  if (!tr?.to || !tr?.data) {
    throw new WalletError("NOT_FOUND", "LI.FI returned no executable transaction for this pair/amount.", {
      hint: "Try a larger amount or a different pair.",
    });
  }
  return {
    source: "lifi",
    quoteId: j.id ?? "",
    to: tr.to,
    data: tr.data,
    value: tr.value && tr.value !== "0x" ? tr.value : "0x0",
    gasLimit: tr.gasLimit,
    sellToken: input.sellToken,
    buyToken: input.buyToken,
    sellAmount: input.amount,
    destAmount: j.estimate?.toAmount ?? "",
  };
}

export interface SwapQuote {
  source: "metamask-bridge-api";
  quoteId: string;
  aggregator: string;
  src: { chainId: number; token: string; amount: string };
  dest: { chainId: number; token: string; amount: string };
  raw: unknown;
}

/** MetaMask bridge/swap aggregator (keyless). Same-chain swaps for v1 (R-013, R-018). */
export async function getSwapQuote(input: {
  chainId: number;
  sellToken: string;
  buyToken: string;
  amount: string;
  taker: string;
  slippage?: number;
}): Promise<SwapQuote> {
  const url = new URL("https://bridge.api.cx.metamask.io/getQuote");
  url.searchParams.set("srcChainId", String(input.chainId));
  url.searchParams.set("destChainId", String(input.chainId));
  url.searchParams.set("srcTokenAddress", input.sellToken);
  url.searchParams.set("destTokenAddress", input.buyToken);
  url.searchParams.set("srcTokenAmount", input.amount);
  url.searchParams.set("walletAddress", input.taker);
  url.searchParams.set("slippage", String(input.slippage ?? 0.5));

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch (e) {
    throw new WalletError("RPC_ERROR", `Bridge API unreachable: ${(e as Error).message}`, {
      retryable: true,
    });
  }
  if (!res.ok) {
    throw new WalletError("RPC_ERROR", `Bridge API returned HTTP ${res.status}`, { retryable: true });
  }
  const arr = (await res.json()) as Array<{
    quote?: {
      requestId?: string;
      aggregator?: string;
      srcAsset?: { amount?: string };
      destAsset?: { amount?: string };
      destTokenAmount?: string;
    };
  }>;
  const q = Array.isArray(arr) ? arr[0]?.quote : undefined;
  if (!q) {
    throw new WalletError("NOT_FOUND", "No swap route found for this pair/amount.", {
      hint: "Try a larger amount or a different pair.",
    });
  }
  return {
    source: "metamask-bridge-api",
    quoteId: q.requestId ?? "",
    aggregator: q.aggregator ?? "",
    src: { chainId: input.chainId, token: input.sellToken, amount: q.srcAsset?.amount ?? input.amount },
    dest: {
      chainId: input.chainId,
      token: input.buyToken,
      amount: q.destAsset?.amount ?? q.destTokenAmount ?? "",
    },
    raw: q,
  };
}
