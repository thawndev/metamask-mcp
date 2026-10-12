import { createPublicClient, http, getAddress, formatUnits, parseAbi, type Chain } from "viem";
import { WalletError } from "../errors.js";

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const KNOWN: Record<number, { name: string; symbol: string; decimals: number; rpc: string }> = {
  1: { name: "Ethereum", symbol: "ETH", decimals: 18, rpc: "https://ethereum-rpc.publicnode.com" },
  11155111: {
    name: "Sepolia",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  },
  8453: { name: "Base", symbol: "ETH", decimals: 18, rpc: "https://base-rpc.publicnode.com" },
  137: { name: "Polygon", symbol: "POL", decimals: 18, rpc: "https://polygon-bor-rpc.publicnode.com" },
};

export function chainIdNum(v: string | number): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new WalletError("INVALID_PARAMS", `Invalid chain id: ${v}`);
    return v;
  }
  const s = v.trim().toLowerCase();
  const n = s.startsWith("0x") ? parseInt(s, 16) : parseInt(s, 10);
  if (!Number.isFinite(n)) {
    throw new WalletError("INVALID_PARAMS", `Invalid chain id: ${v}`, {
      hint: "Use a decimal or 0x-hex chain id.",
    });
  }
  return n;
}

export function chainIdHex(v: string | number): `0x${string}` {
  return ("0x" + chainIdNum(v).toString(16)) as `0x${string}`;
}

export function chainName(id: number): string {
  return KNOWN[id]?.name ?? `Chain ${id}`;
}

function assertSafeRpc(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new WalletError("INVALID_PARAMS", `Invalid RPC URL: ${url}`);
  }
  const h = u.hostname;
  const isLocal = h === "127.0.0.1" || h === "localhost" || h === "::1";
  const allowLocal =
    process.env.MM_ALLOW_LOCAL_RPC === "1" || process.env.MM_ALLOW_LOCAL_RPC === "true";
  if (u.protocol !== "https:") {
    if (!(allowLocal && isLocal && u.protocol === "http:")) {
      throw new WalletError("INVALID_PARAMS", `RPC URL must be https: ${url}`, {
        hint: "Only https endpoints are allowed (set MM_ALLOW_LOCAL_RPC=1 for a local dev chain).",
      });
    }
  }
  const priv =
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "localhost" ||
    h === "::1";
  if (priv && !(allowLocal && isLocal)) {
    throw new WalletError("INVALID_PARAMS", `RPC host is a private/loopback address: ${h}`, {
      hint: "Private and loopback RPC hosts are blocked.",
    });
  }
  return url;
}

function chainFor(id: number, rpc: string): Chain {
  const k = KNOWN[id] ?? { name: `Chain ${id}`, symbol: "ETH", decimals: 18, rpc };
  return {
    id,
    name: k.name,
    nativeCurrency: { name: k.symbol, symbol: k.symbol, decimals: k.decimals },
    rpcUrls: { default: { http: [rpc] } },
  } as Chain;
}

export function rpcUrlFor(chainId: number, override?: string): string {
  if (override) return assertSafeRpc(override);
  const k = KNOWN[chainId];
  if (!k) {
    throw new WalletError("UNRECOGNIZED_CHAIN", `No default RPC for chain ${chainId}.`, {
      hint: "Set MM_RPC_URL to an https endpoint for this chain.",
    });
  }
  return k.rpc;
}

function client(chainId: number, rpcOverride?: string) {
  const rpc = rpcUrlFor(chainId, rpcOverride);
  return createPublicClient({ chain: chainFor(chainId, rpc), transport: http(rpc, { timeout: 8000 }) });
}

export function toChecksum(addr: string): string {
  try {
    return getAddress(addr);
  } catch {
    throw new WalletError("INVALID_PARAMS", `Invalid address: ${addr}`);
  }
}

export async function getNativeBalance(
  chainId: number,
  address: string,
  rpcOverride?: string,
): Promise<{ wei: string; display: string }> {
  const a = toChecksum(address);
  const wei = await client(chainId, rpcOverride).getBalance({ address: a as `0x${string}` });
  const dec = KNOWN[chainId]?.decimals ?? 18;
  const sym = KNOWN[chainId]?.symbol ?? "ETH";
  return { wei: wei.toString(), display: `${formatUnits(wei, dec)} ${sym}` };
}

export async function getTokenBalance(
  chainId: number,
  token: string,
  holder: string,
  rpcOverride?: string,
): Promise<{ token: string; raw: string; decimals: number; symbol: string; display: string }> {
  const c = client(chainId, rpcOverride);
  const t = toChecksum(token) as `0x${string}`;
  const h = toChecksum(holder) as `0x${string}`;
  const [raw, decimals, symbol] = await Promise.all([
    c.readContract({ address: t, abi: ERC20_ABI, functionName: "balanceOf", args: [h] }) as Promise<bigint>,
    c.readContract({ address: t, abi: ERC20_ABI, functionName: "decimals" }).catch(() => 18) as Promise<number>,
    c.readContract({ address: t, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "?") as Promise<string>,
  ]);
  const d = Number(decimals);
  return { token: t, raw: raw.toString(), decimals: d, symbol, display: `${formatUnits(raw, d)} ${symbol}` };
}

export async function ethCall(
  chainId: number,
  to: string,
  data: string,
  rpcOverride?: string,
): Promise<string> {
  const c = client(chainId, rpcOverride);
  const res = await c.call({
    to: toChecksum(to) as `0x${string}`,
    data: data as `0x${string}`,
  });
  return res.data ?? "0x";
}

export async function getReceipt(
  chainId: number,
  txHash: string,
  rpcOverride?: string,
): Promise<{ status: string; blockNumber: string | null }> {
  const c = client(chainId, rpcOverride);
  const r = await c
    .getTransactionReceipt({ hash: txHash as `0x${string}` })
    .catch(() => null);
  if (!r) {
    throw new WalletError("NOT_FOUND", "No receipt yet (the transaction may still be pending).", {
      retryable: true,
      hint: "Retry in a few seconds.",
    });
  }
  return {
    status: r.status === "success" ? "success" : "reverted",
    blockNumber: r.blockNumber != null ? r.blockNumber.toString() : null,
  };
}
