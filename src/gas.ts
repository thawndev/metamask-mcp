import { rpcUrlFor, chainIdNum } from "./chains/rpc.js";

export interface GasTiers {
  low: { maxPriorityFeePerGas: string; maxFeePerGas: string; minWait: number; maxWait: number };
  medium: { maxPriorityFeePerGas: string; maxFeePerGas: string; minWait: number; maxWait: number };
  high: { maxPriorityFeePerGas: string; maxFeePerGas: string; minWait: number; maxWait: number };
  source: "metamask-gas-api" | "eth_feeHistory";
}

type ApiTier = {
  suggestedMaxPriorityFeePerGas: string;
  suggestedMaxFeePerGas: string;
  minWaitTimeEstimate: number;
  maxWaitTimeEstimate: number;
};

function mapTier(t: ApiTier) {
  return {
    maxPriorityFeePerGas: t.suggestedMaxPriorityFeePerGas,
    maxFeePerGas: t.suggestedMaxFeePerGas,
    minWait: t.minWaitTimeEstimate,
    maxWait: t.maxWaitTimeEstimate,
  };
}

/** MetaMask Gas API (keyless) with an eth_feeHistory fallback (R-013). */
export async function getGasFees(chainIdRaw: string | number, rpcOverride?: string): Promise<GasTiers> {
  const id = chainIdNum(chainIdRaw);
  try {
    const res = await fetch(
      `https://gas.api.cx.metamask.io/networks/${id}/suggestedGasFees`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const j = (await res.json()) as { low: ApiTier; medium: ApiTier; high: ApiTier };
      return { low: mapTier(j.low), medium: mapTier(j.medium), high: mapTier(j.high), source: "metamask-gas-api" };
    }
  } catch {
    /* fall through to RPC */
  }
  return feeHistoryFallback(id, rpcOverride);
}

async function feeHistoryFallback(chainId: number, rpcOverride?: string): Promise<GasTiers> {
  const rpc = rpcUrlFor(chainId, rpcOverride);
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_feeHistory",
    params: ["0x5", "latest", [10, 50, 90]],
  };
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const j = (await res.json()) as {
    result?: { baseFeePerGas: string[]; reward: string[][] };
    error?: unknown;
  };
  if (!j.result) throw new Error(`eth_feeHistory failed: ${JSON.stringify(j.error)}`);
  const base = BigInt(j.result.baseFeePerGas[j.result.baseFeePerGas.length - 1] ?? "0x0");
  const rewards = j.result.reward.map((r) => BigInt(r[1] ?? r[0] ?? "0x0"));
  const pick = (i: number) => rewards[Math.min(i, rewards.length - 1)] ?? 0n;
  const mk = (tip: bigint) => ({
    maxPriorityFeePerGas: tip.toString(),
    maxFeePerGas: (base * 2n + tip).toString(),
    minWait: 0,
    maxWait: 0,
  });
  return { low: mk(pick(0)), medium: mk(pick(1)), high: mk(pick(2)), source: "eth_feeHistory" };
}
