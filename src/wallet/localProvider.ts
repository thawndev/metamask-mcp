import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { WalletError } from "../errors.js";

/**
 * Implements the EIP-1193 request surface the tools use, backed by a private key and an RPC
 * endpoint (e.g. a local Anvil/Ganache chain with test coins).
 *
 * The key is held by this process. Keep it in the environment or a 0600 file.
 */
export class LocalProvider {
  private account;
  private wallet;
  private pub;
  private chainId: number;

  constructor(privateKey: string, rpc: string, chainId: number) {
    const pk = (privateKey.startsWith("0x") ? privateKey : "0x" + privateKey) as Hex;
    this.account = privateKeyToAccount(pk);
    const chain = {
      id: chainId,
      name: `Chain ${chainId}`,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    } as Chain;
    this.wallet = createWalletClient({ account: this.account, chain, transport: http(rpc) });
    this.pub = createPublicClient({ chain, transport: http(rpc) });
    this.chainId = chainId;
  }

  get address(): string {
    return this.account.address;
  }

  async request(method: string, params: unknown[] = []): Promise<unknown> {
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return [this.account.address];
      case "eth_chainId":
        return "0x" + this.chainId.toString(16);
      case "net_version":
        return String(this.chainId);
      case "eth_blockNumber":
        return "0x" + (await this.pub.getBlockNumber()).toString(16);
      case "eth_getBalance": {
        const [addr] = params as [string];
        return "0x" + (await this.pub.getBalance({ address: addr as Hex })).toString(16);
      }
      case "eth_getTransactionCount": {
        const [addr] = params as [string];
        return "0x" + (await this.pub.getTransactionCount({ address: addr as Hex })).toString(16);
      }
      case "eth_getCode": {
        const [addr] = params as [string];
        return (await this.pub.getCode({ address: addr as Hex })) ?? "0x";
      }
      case "eth_estimateGas": {
        const [tx] = params as [{ to?: Hex; value?: string; data?: Hex }];
        const gas = await this.pub.estimateGas({
          account: this.account.address,
          to: tx.to,
          value: tx.value ? BigInt(tx.value) : undefined,
          data: tx.data,
        });
        return "0x" + gas.toString(16);
      }
      case "eth_gasPrice":
        return "0x" + (await this.pub.getGasPrice()).toString(16);
      case "eth_getTransactionReceipt": {
        const [hash] = params as [Hex];
        const r = await this.pub.getTransactionReceipt({ hash }).catch(() => null);
        if (!r) return null;
        return { transactionHash: r.transactionHash, status: r.status, blockNumber: "0x" + (r.blockNumber ?? 0n).toString(16) };
      }
      case "eth_feeHistory": {
        const [blockCount, , percentiles] = params as [string, string, number[]];
        const count = BigInt(blockCount) > 1024n ? 1024n : BigInt(blockCount);
        const h = (await this.pub.getFeeHistory({ blockCount: Number(count), rewardPercentiles: percentiles ?? [] })) as unknown as {
          oldestBlock: bigint;
          baseFeePerGas: bigint[];
          gasUsedRatio: number[];
          reward?: bigint[][];
        };
        return {
          oldestBlock: "0x" + h.oldestBlock.toString(16),
          baseFeePerGas: h.baseFeePerGas.map((b) => "0x" + b.toString(16)),
          gasUsedRatio: h.gasUsedRatio,
          reward: h.reward?.map((r) => r.map((x) => "0x" + x.toString(16))),
        };
      }
      case "eth_maxPriorityFeePerGas":
        return "0x" + (await this.pub.estimateMaxPriorityFeePerGas()).toString(16);
      case "eth_getBlockByNumber": {
        const [bn] = params as [string];
        const block = await this.pub
          .getBlock({ blockNumber: bn === "latest" ? undefined : (BigInt(bn) as bigint) })
          .catch(() => null);
        return block ? { number: "0x" + block.number.toString(16), hash: block.hash, timestamp: "0x" + block.timestamp.toString(16) } : null;
      }
      case "eth_getTransactionByHash": {
        const [hash] = params as [Hex];
        const tx = await this.pub.getTransaction({ hash }).catch(() => null);
        return tx ? { hash: tx.hash, from: tx.from, to: tx.to, value: "0x" + tx.value.toString(16), nonce: "0x" + tx.nonce.toString(16) } : null;
      }
      case "eth_sendRawTransaction": {
        const [raw] = params as [Hex];
        return this.pub.sendRawTransaction({ serializedTransaction: raw });
      }
      case "wallet_getCapabilities":
        return {};
      case "wallet_createSession":
        return { sessionId: "local", chainId: "0x" + this.chainId.toString(16), accounts: [this.account.address] };
      case "wallet_invokeMethod": {
        const [p] = params as [{ sessionId?: string; request: { method: string; params?: unknown[] } }];
        return this.request(p.request.method, p.request.params ?? []);
      }
      case "eth_getLogs":
        return this.pub.request({ method: "eth_getLogs", params } as never);
      case "eth_getStorageAt": {
        const [addr, slot] = params as [Hex, string];
        return this.pub.getStorageAt({ address: addr, slot: slot as Hex });
      }
      case "eth_call": {
        const [tx] = params as [{ to: Hex; data: Hex }];
        const r = await this.pub.call({ to: tx.to, data: tx.data });
        return r.data ?? "0x";
      }
      case "personal_sign":
      case "eth_sign": {
        const [msgHex] = params as [string, string];
        return this.account.signMessage({ message: { raw: msgHex as Hex } });
      }
      case "eth_signTypedData":
      case "eth_signTypedData_v4": {
        const [, data] = params as [string, unknown];
        const td = (typeof data === "string" ? JSON.parse(data) : data) as {
          domain: Record<string, unknown>;
          types: Record<string, unknown>;
          primaryType: string;
          message: Record<string, unknown>;
        };
        const types = { ...td.types };
        delete (types as Record<string, unknown>).EIP712Domain;
        return this.account.signTypedData({
          domain: td.domain,
          types,
          primaryType: td.primaryType,
          message: td.message,
        } as Parameters<typeof this.account.signTypedData>[0]);
      }
      case "eth_sendTransaction": {
        const [tx] = params as [{ to: `0x${string}`; value?: string; data?: `0x${string}` }];
        return this.wallet.sendTransaction({
          account: this.account,
          to: tx.to,
          value: tx.value ? BigInt(tx.value) : undefined,
          data: tx.data,
        } as Parameters<typeof this.wallet.sendTransaction>[0]);
      }
      case "wallet_switchEthereumChain": {
        const [p] = params as [{ chainId: string }];
        this.chainId = parseInt(p.chainId, 16);
        return null;
      }
      case "wallet_addEthereumChain":
      case "wallet_watchAsset":
        return null;
      case "wallet_getPermissions":
      case "wallet_requestPermissions":
        return [{ parentCapability: "eth_accounts" }];
      default:
        throw new WalletError("UNSUPPORTED_METHOD", `${method} is not supported in local-signer mode`);
    }
  }
}
