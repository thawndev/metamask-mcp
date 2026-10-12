import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSession } from "./wallet/session.js";
import { chainIdHex, chainIdNum, chainName, getNativeBalance, getTokenBalance, ethCall } from "./chains/rpc.js";
import { getGasFees } from "./gas.js";
import { okResult, errorResult, type Screen, type Changed, type NextStep, type ToolResult } from "./result.js";
import { loadConfig } from "./config.js";
import { WalletError } from "./errors.js";
import { confirmations } from "./confirm.js";
import { appendAudit } from "./audit.js";
import { walletCache } from "./cache.js";
import { getReceipt } from "./chains/rpc.js";
import { getSwapQuote, getLifiQuote } from "./swaps.js";
import { formatUnits, createPublicClient, custom, encodeFunctionData, decodeFunctionResult, multicall3Abi, parseAbi, erc20Abi, erc721Abi, erc1155Abi, getAddress } from "viem";
import { mainnet } from "viem/chains";
import { hashTypedData } from "viem";

const lastScreen: { current?: Screen } = {};

/** Simple sliding-window rate limit for signing/sending (FR-096, THR-07). */
const rate = { count: 0, windowStart: Date.now() };
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;
function checkRateLimit(): void {
  const now = Date.now();
  if (now - rate.windowStart > RATE_WINDOW_MS) {
    rate.windowStart = now;
    rate.count = 0;
  }
  rate.count++;
  if (rate.count > RATE_MAX) {
    throw new WalletError("INTERNAL", "Signing rate limit exceeded (max 20 per minute).", {
      hint: "Wait and retry.",
      retryable: true,
    });
  }
}

function diff(prev: Screen | undefined, next: Screen): Changed[] {
  if (!prev) return [];
  const out: Changed[] = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    const a = JSON.stringify(prev[k] ?? null);
    const b = JSON.stringify(next[k] ?? null);
    if (a !== b) out.push({ field: k, from: prev[k], to: next[k] });
  }
  return out;
}

async function currentScreen(): Promise<Screen> {
  const s = getSession();
  const unlocked = await s.isUnlocked();
  const chainIdRaw = (await s.providerRequest("eth_chainId")) as string;
  const id = chainIdNum(chainIdRaw);
  let accounts = unlocked ? ((await s.providerRequest("eth_accounts")) as string[]) : [];
  if (unlocked && accounts.length === 0 && s.mode === "native") {
    accounts = await s.connect().catch(() => []);
  }
  if (unlocked) walletCache.update(accounts, id);
  return { locked: !unlocked, chain: { id: chainIdHex(chainIdRaw), name: chainName(id) }, accounts };
}

function defaultChainId(cfgNetwork?: string): number {
  return cfgNetwork ? chainIdNum(cfgNetwork) : 11155111;
}

/** The configured MM_RPC_URL applies only to the configured network, never to other chains. */
function makeRpcOverride(cfg: { network?: string; rpcUrl?: string }) {
  return (id: number): string | undefined =>
    id === defaultChainId(cfg.network) ? cfg.rpcUrl : undefined;
}

export function registerTools(server: McpServer): void {
  const cfg = loadConfig();
  const rpcOverride = makeRpcOverride(cfg);

  server.registerTool(
    "wallet_get_status",
    {
      title: "Wallet status",
      description:
        "Return whether the wallet is unlocked and the active chain. Use this first to decide if an unlock is needed.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (): Promise<ToolResult> => {
      try {
        const screen = await currentScreen();
        return okResult(screen, {
          next: screen.locked ? [{ tool: "wallet_unlock" }] : [],
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_accounts",
    {
      title: "Get accounts",
      description: "Return the accounts the wallet exposes. Empty when locked or no account is connected.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (): Promise<ToolResult> => {
      try {
        const screen = await currentScreen();
        const next: NextStep[] = screen.locked
          ? [{ tool: "wallet_unlock" }]
          : (screen.accounts?.length ?? 0) === 0
            ? [{ tool: "wallet_describe_screen" }]
            : [{ tool: "wallet_get_balance", args: { address: screen.accounts?.[0] } }];
        return okResult(screen, { next });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_balance",
    {
      title: "Get native balance",
      description:
        "Return the native-token balance for an address (defaults to the first account) on a chain (default Sepolia).",
      inputSchema: {
        address: z.string().optional().describe("0x address; defaults to the first account"),
        chainId: z.string().optional().describe("chain id (decimal or 0x-hex); defaults to the configured network"),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ address, chainId }): Promise<ToolResult> => {
      try {
        const s = getSession();
        const accts = (await s.providerRequest("eth_accounts")) as string[];
        const addr = address ?? accts[0];
        if (!addr) {
          return okResult(
            { accounts: [] },
            { text: "No account available. Unlock the wallet or connect an account.", next: [{ tool: "wallet_unlock" }] },
          );
        }
        const id = chainId ? chainIdNum(chainId) : defaultChainId(cfg.network);
        const bal = await getNativeBalance(id, addr, rpcOverride(id));
        return okResult(
          { chain: { id: chainIdHex(id), name: chainName(id) }, balance: bal },
          { text: bal.display },
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_network",
    {
      title: "Get network",
      description: "Return the active chain id and name.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (): Promise<ToolResult> => {
      try {
        const chainIdRaw = (await getSession().providerRequest("eth_chainId")) as string;
        const id = chainIdNum(chainIdRaw);
        return okResult({ chain: { id: chainIdHex(chainIdRaw), name: chainName(id) } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_gas",
    {
      title: "Get gas fees",
      description: "Return low/medium/high EIP-1559 gas fee suggestions for a chain.",
      inputSchema: { chainId: z.string().optional().describe("chain id; defaults to the configured network") },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ chainId }): Promise<ToolResult> => {
      try {
        const id = chainId ? chainIdNum(chainId) : defaultChainId(cfg.network);
        const gas = await getGasFees(id, rpcOverride(id));
        return okResult(
          { chain: { id: chainIdHex(id), name: chainName(id) } },
          { extra: { gas }, text: `gas via ${gas.source}: medium maxFeePerGas ${gas.medium.maxFeePerGas}` },
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_estimate_gas",
    {
      title: "Estimate gas",
      description: "Estimate gas for a transaction via the native provider (eth_estimateGas).",
      inputSchema: {
        to: z.string(),
        value: z.string().optional().describe("wei (0x-hex or decimal)"),
        data: z.string().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ to, value, data }): Promise<ToolResult> => {
      try {
        const tx: Record<string, unknown> = { to };
        if (value) tx.value = value.startsWith("0x") ? value : "0x" + BigInt(value).toString(16);
        if (data) tx.data = data;
        const gas = (await getSession().providerRequest("eth_estimateGas", [tx])) as string;
        return okResult({}, { extra: { gas }, text: `estimated gas ${BigInt(gas)}` });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_describe_screen",
    {
      title: "Describe wallet screen",
      description:
        "Return the wallet's current state as structured data, including what changed since the last call. Prefer this over screenshots.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (): Promise<ToolResult> => {
      try {
        const screen = await currentScreen();
        const changed = diff(lastScreen.current, screen);
        lastScreen.current = screen;
        return okResult(screen, {
          changed,
          next: screen.locked ? [{ tool: "wallet_unlock" }] : [],
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_token_balances",
    {
      title: "Get ERC-20 balance",
      description: "Return an ERC-20 token balance for an address (read-only, over the allowlisted RPC).",
      inputSchema: {
        token: z.string().describe("ERC-20 contract address"),
        address: z.string().optional().describe("holder; defaults to the first account"),
        chainId: z.string().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ token, address, chainId }): Promise<ToolResult> => {
      try {
        const s = getSession();
        const accts = (await s.providerRequest("eth_accounts")) as string[];
        const addr = address ?? accts[0];
        if (!addr) {
          return okResult({ accounts: [] }, { text: "No account available.", next: [{ tool: "wallet_unlock" }] });
        }
        const id = chainId ? chainIdNum(chainId) : defaultChainId(cfg.network);
        const bal = await getTokenBalance(id, token, addr, rpcOverride(id));
        return okResult({ chain: { id: chainIdHex(id), name: chainName(id) } }, { extra: { token: bal }, text: bal.display });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_call",
    {
      title: "Read a contract",
      description: "Perform a read-only eth_call against any contract over the allowlisted RPC.",
      inputSchema: {
        to: z.string().describe("contract address"),
        data: z.string().regex(/^0x[0-9a-fA-F]*$/).describe("0x-encoded call data"),
        chainId: z.string().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ to, data, chainId }): Promise<ToolResult> => {
      try {
        const id = chainId ? chainIdNum(chainId) : defaultChainId(cfg.network);
        const result = await ethCall(id, to, data, rpcOverride(id));
        return okResult({ chain: { id: chainIdHex(id), name: chainName(id) } }, { extra: { result }, text: String(result) });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ---- S-2 · two-phase gate: inspect returns a preview + confirm_token; execute broadcasts ----
  async function activeAccount(): Promise<string | undefined> {
    const accts = (await getSession().providerRequest("eth_accounts")) as string[];
    return accts[0];
  }

  async function execute(
    tool: string,
    method: string,
    confirm_token: string,
    run: (req: Record<string, unknown>) => Promise<{ result: unknown; txHash?: string }>,
  ): Promise<ToolResult> {
    let c;
    try {
      checkRateLimit();
      c = confirmations.consume(confirm_token);
    } catch (e) {
      appendAudit({ tool, method, params: { confirm_token: "***" }, outcome: "error", errorCode: (e as WalletError).code });
      throw e;
    }
    const req = c.request as Record<string, unknown>;
    let chainHex: string | null = null;
    try {
      chainHex = chainIdHex((await getSession().providerRequest("eth_chainId")) as string);
    } catch {
      /* chain unknown */
    }
    try {
      const { result, txHash } = await run(req);
      appendAudit({ tool, method, params: req, chain: chainHex, outcome: "ok", txHash });
      // advisory cache refresh after a mutation (F-089)
      try {
        const accts = (await getSession().providerRequest("eth_accounts")) as string[];
        const cid = chainIdNum((await getSession().providerRequest("eth_chainId")) as string);
        walletCache.update(accts, cid);
      } catch {
        /* advisory only */
      }
      return okResult({ chain: chainHex ? { id: chainHex } : undefined }, { extra: { result }, text: "Approved and broadcast." });
    } catch (e) {
      appendAudit({ tool, method, params: req, chain: chainHex, outcome: "error", errorCode: (e as WalletError).code });
      throw e;
    }
  }

  server.registerTool(
    "wallet_inspect_signature",
    {
      title: "Inspect a signature",
      description:
        "Preview a message or EIP-712 typed-data signature and return a single-use confirm_token. Nothing is signed. After approval, call wallet_sign_message or wallet_sign_typed_data with the token.",
      inputSchema: {
        kind: z.enum(["message", "typedData"]),
        message: z.string().max(200000).optional().describe("for kind=message"),
        typedData: z.any().optional().describe("for kind=typedData (EIP-712 object)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ kind, message, typedData }): Promise<ToolResult> => {
      try {
        const address = await activeAccount();
        if (!address) {
          return okResult({ accounts: [] }, { text: "No account. Unlock or import a wallet first.", next: [{ tool: "wallet_unlock" }] });
        }
        if (kind === "message") {
          if (!message) throw new WalletError("INVALID_PARAMS", "message is required for kind=message");
          const request = { kind, address, messageHex: "0x" + Buffer.from(message, "utf8").toString("hex") };
          const c = confirmations.issue({ kind, tool: "wallet_sign_message", method: "personal_sign", request });
          return okResult({ accounts: [address] }, {
            extra: { preview: { kind, address, message }, confirm_token: c.token, expires_in: 120 },
            text: "Preview ready. Approve, then call wallet_sign_message with confirm_token.",
            next: [{ tool: "wallet_sign_message", args: { confirm_token: c.token } }],
          });
        }
        if (!typedData) throw new WalletError("INVALID_PARAMS", "typedData is required for kind=typedData");
        const request = { kind, address, typedData };
        const c = confirmations.issue({ kind, tool: "wallet_sign_typed_data", method: "eth_signTypedData_v4", request });
        return okResult({ accounts: [address] }, {
          extra: { preview: { kind, address, typedData }, confirm_token: c.token, expires_in: 120 },
          text: "Preview ready. Approve, then call wallet_sign_typed_data with confirm_token.",
          next: [{ tool: "wallet_sign_typed_data", args: { confirm_token: c.token } }],
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_sign_message",
    {
      title: "Sign a message (gated)",
      description: "personal_sign. Requires a confirm_token from wallet_inspect_signature and approval. Irreversible.",
      inputSchema: { confirm_token: z.string() },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ confirm_token }): Promise<ToolResult> => {
      try {
        return await execute("wallet_sign_message", "personal_sign", confirm_token, async (req) => {
          const { address, messageHex } = req as { address: string; messageHex: string };
          const signature = await getSession().providerRequest("personal_sign", [messageHex, address]);
          return { result: signature };
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_sign_typed_data",
    {
      title: "Sign typed data (gated)",
      description: "eth_signTypedData_v4. Requires a confirm_token from wallet_inspect_signature and approval.",
      inputSchema: { confirm_token: z.string() },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ confirm_token }): Promise<ToolResult> => {
      try {
        return await execute("wallet_sign_typed_data", "eth_signTypedData_v4", confirm_token, async (req) => {
          const { address, typedData } = req as { address: string; typedData: unknown };
          const signature = await getSession().providerRequest("eth_signTypedData_v4", [address, JSON.stringify(typedData)]);
          return { result: signature };
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_inspect_transaction",
    {
      title: "Inspect a transaction",
      description:
        "Preview a transaction (to/value/data/chainId) and return a single-use confirm_token. Nothing is sent. After approval, call wallet_send_transaction with the token.",
      inputSchema: {
        to: z.string(),
        value: z.string().optional().describe("wei (0x-hex or decimal)"),
        data: z.string().max(200000).regex(/^0x[0-9a-fA-F]*$/).optional(),
        chainId: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ to, value, data, chainId }): Promise<ToolResult> => {
      try {
        const address = await activeAccount();
        if (!address) {
          return okResult({ accounts: [] }, { text: "No account. Unlock or import a wallet first.", next: [{ tool: "wallet_unlock" }] });
        }
        const id = chainId ? chainIdNum(chainId) : defaultChainId(cfg.network);
        const tx: Record<string, unknown> = { from: address, to, chainId: chainIdHex(id) };
        if (value) tx.value = value.startsWith("0x") ? value : "0x" + BigInt(value).toString(16);
        if (data) tx.data = data;
        // Pre-flight simulation (native eth_call): surface a would-revert before approval.
        let simulation: { ok: boolean; reason?: string } = { ok: true };
        try {
          await getSession().providerRequest("eth_call", [{ from: address, to, value: tx.value, data: tx.data }]);
        } catch (e) {
          simulation = { ok: false, reason: (e as WalletError).message.slice(0, 160) };
        }
        const c = confirmations.issue({ kind: "tx", tool: "wallet_send_transaction", method: "eth_sendTransaction", request: tx });
        return okResult({ chain: { id: chainIdHex(id), name: chainName(id) }, accounts: [address] }, {
          extra: { preview: tx, simulation, confirm_token: c.token, expires_in: 120 },
          text: "Preview ready. Approve, then call wallet_send_transaction with confirm_token.",
          next: [{ tool: "wallet_send_transaction", args: { confirm_token: c.token } }],
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_send_transaction",
    {
      title: "Send a transaction (gated)",
      description: "eth_sendTransaction. Requires a confirm_token from wallet_inspect_transaction and approval. Irreversible.",
      inputSchema: { confirm_token: z.string() },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ confirm_token }): Promise<ToolResult> => {
      try {
        return await execute("wallet_send_transaction", "eth_sendTransaction", confirm_token, async (req) => {
          const txHash = (await getSession().providerRequest("eth_sendTransaction", [req])) as string;
          return { result: txHash, txHash };
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_add_network",
    {
      title: "Add a network",
      description: "Add an EVM chain (wallet_addEthereumChain).",
      inputSchema: {
        chainId: z.string(),
        chainName: z.string(),
        rpcUrls: z.array(z.string()),
        nativeCurrency: z.object({ name: z.string(), symbol: z.string(), decimals: z.number() }),
        blockExplorerUrls: z.array(z.string()).optional(),
      },
      annotations: { idempotentHint: true },
    },
    async (p): Promise<ToolResult> => {
      try {
        const param = {
          chainId: chainIdHex(p.chainId),
          chainName: p.chainName,
          rpcUrls: p.rpcUrls,
          nativeCurrency: p.nativeCurrency,
          blockExplorerUrls: p.blockExplorerUrls ?? [],
        };
        await getSession().providerRequest("wallet_addEthereumChain", [param]);
        return okResult({ chain: { id: chainIdHex(p.chainId), name: p.chainName } }, { text: `Added ${p.chainName}.` });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_switch_network",
    {
      title: "Switch network",
      description: "Switch the active chain (wallet_switchEthereumChain). If the chain is not added, call wallet_add_network first.",
      inputSchema: { chainId: z.string(), addIfMissing: z.boolean().optional() },
      annotations: { idempotentHint: true },
    },
    async ({ chainId }): Promise<ToolResult> => {
      try {
        const id = chainIdNum(chainId);
        await getSession().providerRequest("wallet_switchEthereumChain", [{ chainId: chainIdHex(id) }]);
        return okResult({ chain: { id: chainIdHex(id), name: chainName(id) } }, { text: `Switched to ${chainName(id)}.` });
      } catch (e) {
        const err = e as WalletError;
        if (err.code === "UNRECOGNIZED_CHAIN") {
          return errorResult(
            new WalletError("UNRECOGNIZED_CHAIN", `Chain ${chainId} is not added to this wallet.`, {
              hint: "Call wallet_add_network with rpcUrls and nativeCurrency, then retry.",
            }),
          );
        }
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_transaction_receipt",
    {
      title: "Get transaction receipt",
      description: "Return the status and block of a transaction (read-only, over the allowlisted RPC).",
      inputSchema: { txHash: z.string(), chainId: z.string().optional() },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ txHash, chainId }): Promise<ToolResult> => {
      try {
        const id = chainId ? chainIdNum(chainId) : defaultChainId(cfg.network);
        const r = await getReceipt(id, txHash, rpcOverride(id));
        return okResult({ chain: { id: chainIdHex(id), name: chainName(id) } }, { extra: { receipt: r }, text: `${r.status} in block ${r.blockNumber}` });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_swap_quote",
    {
      title: "Get a swap quote",
      description: "Return a same-chain swap quote from the keyless MetaMask bridge aggregator.",
      inputSchema: {
        chainId: z.string(),
        sellToken: z.string(),
        buyToken: z.string(),
        amount: z.string(),
        taker: z.string().optional(),
        slippage: z.number().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ chainId, sellToken, buyToken, amount, taker, slippage }): Promise<ToolResult> => {
      try {
        const id = chainIdNum(chainId);
        const who = taker ?? (await activeAccount());
        if (!who) {
          return okResult({ accounts: [] }, { text: "A taker address is required.", next: [{ tool: "wallet_unlock" }] });
        }
        const quote = await getSwapQuote({ chainId: id, sellToken, buyToken, amount, taker: who, slippage });
        return okResult({ chain: { id: chainIdHex(id), name: chainName(id) } }, { extra: { quote }, text: `quote via ${quote.aggregator}: ${quote.dest.amount}` });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_lock",
    {
      title: "Lock the wallet",
      description: "Lock the wallet and report the locked state.",
      inputSchema: {},
      annotations: { idempotentHint: true },
    },
    async (): Promise<ToolResult> => {
      try {
        const locked = await getSession().lock();
        if (!locked) throw new WalletError("UNSUPPORTED_METHOD", "This build exposes no lock method.");
        return okResult({ locked: true }, { text: "Wallet locked." });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ---- Session / asset tools ----
  server.registerTool(
    "wallet_select_account",
    {
      title: "Select account",
      description: "Select the active account (local-signer mode has a single native account).",
      inputSchema: { address: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ address }): Promise<ToolResult> => {
      try {
        const accts = (await getSession().providerRequest("eth_accounts")) as string[];
        const found = accts.find((a) => a.toLowerCase() === address.toLowerCase());
        if (!found) {
          throw new WalletError("INVALID_PARAMS", `Unknown account ${address}.`, {
            hint: "local-signer mode exposes one account (eth_accounts).",
          });
        }
        return okResult({ accounts: [found] }, { text: `Active account ${found}` });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_watch_asset",
    {
      title: "Watch an asset",
      description: "Ask the wallet to track an ERC-20 token (native wallet_watchAsset).",
      inputSchema: { address: z.string(), symbol: z.string().optional(), decimals: z.number().optional() },
      annotations: { idempotentHint: true },
    },
    async ({ address, symbol, decimals }): Promise<ToolResult> => {
      try {
        await getSession().providerRequest("wallet_watchAsset", [{ type: "ERC20", options: { address, symbol, decimals } }]);
        return okResult({}, { text: `Watching asset ${address}` });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_capabilities",
    {
      title: "Get capabilities",
      description: "Return wallet capabilities per chain (native wallet_getCapabilities).",
      inputSchema: { address: z.string().optional(), chainIds: z.array(z.string()).optional() },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ address, chainIds }): Promise<ToolResult> => {
      try {
        const who = address ?? ((await getSession().providerRequest("eth_accounts")) as string[])[0];
        const caps = await getSession().providerRequest("wallet_getCapabilities", [who, chainIds ?? []]);
        return okResult({}, { extra: { capabilities: caps }, text: "capabilities" });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_cache",
    {
      title: "Get advisory cache",
      description: "Return the last-known accounts/chain (advisory, refreshed on every read and after every mutation).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async (): Promise<ToolResult> => {
      const c = walletCache.get();
      return okResult({}, { extra: { cache: c ?? null }, text: c ? `cached ${c.ageMs}ms ago` : "no cache yet" });
    },
  );

  // ---- ERC-20 helpers (eth_call) ----
  const SEL = { symbol: "0x95d89b41", decimals: "0x313ce567", name: "0x06fdde03", balanceOf: "0x70a08231" } as const;
  const pad32 = (addr: string) => addr.slice(2).toLowerCase().padStart(64, "0");
  const decodeAbiString = (hex: string): string => {
    const h = hex.slice(2);
    if (h.length < 128) return "";
    const off = Number(BigInt("0x" + h.slice(0, 64))) * 2;
    const len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2;
    const bytes = h.slice(off + 64, off + 64 + len);
    return Buffer.from(bytes, "hex").toString("utf8").replaceAll("\u0000", "");
  };
  const erc20Call = async (token: string, selector: string, arg?: string): Promise<string> =>
    (await getSession().providerRequest("eth_call", [{ to: token, data: selector + (arg ? pad32(arg) : "") }, "latest"])) as string;

  server.registerTool(
    "wallet_token_info",
    {
      title: "ERC-20 token info",
      description: "Read an ERC-20 token's symbol, decimals and name via eth_call.",
      inputSchema: { token: z.string(), chainId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ token }): Promise<ToolResult> => {
      try {
        const symbol = decodeAbiString(await erc20Call(token, SEL.symbol));
        const decimals = Number(BigInt(await erc20Call(token, SEL.decimals)));
        const name = decodeAbiString(await erc20Call(token, SEL.name).catch(() => "0x"));
        return okResult({}, { extra: { token: { address: token, symbol, decimals, name: name || undefined } } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_token_balance",
    {
      title: "ERC-20 balance",
      description: "Read an ERC-20 balance (defaults to the active account) via native eth_call, decoded with decimals.",
      inputSchema: { token: z.string(), owner: z.string().optional(), chainId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ token, owner }): Promise<ToolResult> => {
      try {
        const who = owner ?? (await activeAccount());
        if (!who) return okResult({ accounts: [] }, { text: "A token owner is required.", next: [{ tool: "wallet_unlock" }] });
        const raw = BigInt(await erc20Call(token, SEL.balanceOf, who));
        const decimals = Number(BigInt(await erc20Call(token, SEL.decimals)));
        const symbol = decodeAbiString(await erc20Call(token, SEL.symbol).catch(() => "0x"));
        return okResult({ accounts: [who] }, {
          extra: { token: { address: token, symbol }, balance: { raw: raw.toString(), decimals, display: formatUnits(raw, decimals) } },
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ---- Native ENS / Multicall / NFT reads (viem over our own transport; no indexer) ----
  const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
  const evmCall = async (to: string, data: string): Promise<string> =>
    (await getSession().providerRequest("eth_call", [{ to, data }, "latest"])) as string;
  const padUint = (v: string): string => BigInt(v).toString(16).padStart(64, "0");
  const wordToAddress = (hex: string): string => "0x" + hex.slice(-40);
  const viemClient = () =>
    createPublicClient({
      chain: mainnet,
      transport: custom({
        request: ({ method, params }) => getSession().providerRequest(method, (params as unknown[]) ?? []) as Promise<never>,
      }),
    });

  server.registerTool(
    "wallet_resolve_name",
    {
      title: "Resolve an ENS name",
      description: "Resolve an ENS name (e.g. vitalik.eth) to an address via the ENS Universal Resolver, natively. No indexer.",
      inputSchema: { name: z.string(), chainId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ name }): Promise<ToolResult> => {
      try {
        const address = await viemClient().getEnsAddress({ name });
        return okResult({}, { extra: { name, address: address ?? null }, text: address ? `${name} -> ${address}` : `${name} did not resolve.` });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_lookup_address",
    {
      title: "Reverse-resolve an address",
      description: "Look up the primary ENS name for an address (forward-confirmed), natively.",
      inputSchema: { address: z.string(), chainId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ address }): Promise<ToolResult> => {
      try {
        const name = await viemClient().getEnsName({ address: address as `0x${string}` });
        return okResult({}, { extra: { address, name: name ?? null }, text: name ? `${address} -> ${name}` : `${address} has no primary name.` });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_call_batch",
    {
      title: "Batch read calls (Multicall3)",
      description: "Execute several read-only eth_calls in ONE RPC round trip via Multicall3.aggregate3. Each call returns {success, returnData}.",
      inputSchema: { calls: z.array(z.object({ to: z.string(), data: z.string() })).min(1).max(50) },
      annotations: { readOnlyHint: true },
    },
    async ({ calls }): Promise<ToolResult> => {
      try {
        const data = encodeFunctionData({
          abi: multicall3Abi,
          functionName: "aggregate3",
          args: [calls.map((c) => ({ target: c.to as `0x${string}`, allowFailure: true, callData: c.data as `0x${string}` }))],
        });
        const res = await evmCall(MULTICALL3, data);
        const decoded = decodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", data: res as `0x${string}` });
        const results = (decoded as readonly { success: boolean; returnData: string }[]).map((r, i) => ({
          to: calls[i]?.to,
          success: r.success,
          returnData: r.returnData,
        }));
        return okResult({}, { extra: { count: results.length, results } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_nft_owner",
    {
      title: "ERC-721 owner",
      description: "Read the owner of an ERC-721 token id via native eth_call ownerOf(uint256).",
      inputSchema: { token: z.string(), tokenId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ token, tokenId }): Promise<ToolResult> => {
      try {
        const raw = await evmCall(token, "0x6352211e" + padUint(tokenId));
        return okResult({}, { extra: { token, tokenId, owner: wordToAddress(raw) } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_nft_uri",
    {
      title: "ERC-721 token URI",
      description: "Read an ERC-721 tokenURI(uint256) via native eth_call (decoded string).",
      inputSchema: { token: z.string(), tokenId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ token, tokenId }): Promise<ToolResult> => {
      try {
        const uri = decodeAbiString(await evmCall(token, "0xc87b56dd" + padUint(tokenId)));
        return okResult({}, { extra: { token, tokenId, uri } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_erc1155_balance",
    {
      title: "ERC-1155 balance",
      description: "Read an ERC-1155 balanceOf(address,uint256) via native eth_call (owner defaults to the active account).",
      inputSchema: { token: z.string(), tokenId: z.string(), owner: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ token, tokenId, owner }): Promise<ToolResult> => {
      try {
        const who = owner ?? (await activeAccount());
        if (!who) return okResult({ accounts: [] }, { text: "A token owner is required.", next: [{ tool: "wallet_unlock" }] });
        const raw = BigInt(await evmCall(token, "0x00fdd58e" + pad32(who) + padUint(tokenId)));
        return okResult({ accounts: [who] }, { extra: { token, tokenId, owner: who, balance: raw.toString() } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ---- Native EIP-712 toolkit + event logs + ENS records ----
  const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const buildTypedData = async (input: {
    template: "permit" | "permit2";
    chainId: number;
    token: string;
    owner?: string;
    spender: string;
    value?: string;
    nonce?: string;
    deadline?: string;
    name?: string;
    amount?: string;
    expiration?: string;
    sigDeadline?: string;
  }): Promise<Record<string, unknown>> => {
    if (input.template === "permit") {
      const tokenName = input.name ?? decodeAbiString(await erc20Call(input.token, SEL.name).catch(() => "0x"));
      return {
        domain: { name: tokenName, version: "1", chainId: input.chainId, verifyingContract: input.token },
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message: {
          owner: input.owner ?? "0x0000000000000000000000000000000000000000",
          spender: input.spender,
          value: BigInt(input.value ?? "0").toString(),
          nonce: BigInt(input.nonce ?? "0").toString(),
          deadline: BigInt(input.deadline ?? "0").toString(),
        },
      };
    }
    return {
      domain: { name: "Permit2", chainId: input.chainId, verifyingContract: PERMIT2 },
      types: {
        PermitSingle: [
          { name: "details", type: "PermitDetails" },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" },
        ],
        PermitDetails: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint160" },
          { name: "expiration", type: "uint48" },
          { name: "nonce", type: "uint48" },
        ],
      },
      primaryType: "PermitSingle",
      message: {
        details: {
          token: input.token,
          amount: BigInt(input.amount ?? input.value ?? "0").toString(),
          expiration: BigInt(input.expiration ?? "0").toString(),
          nonce: BigInt(input.nonce ?? "0").toString(),
        },
        spender: input.spender,
        sigDeadline: BigInt(input.sigDeadline ?? input.deadline ?? "0").toString(),
      },
    };
  };

  server.registerTool(
    "wallet_build_typed_data",
    {
      title: "Build EIP-712 typed data",
      description: "Build a standard EIP-712 payload (ERC-2612 Permit or Permit2 PermitSingle) and its digest, ready to sign with wallet_sign_typed_data. Native, computed locally.",
      inputSchema: {
        template: z.enum(["permit", "permit2"]),
        chainId: z.string(),
        token: z.string(),
        spender: z.string(),
        owner: z.string().optional(),
        value: z.string().optional(),
        amount: z.string().optional(),
        nonce: z.string().optional(),
        expiration: z.string().optional(),
        deadline: z.string().optional(),
        sigDeadline: z.string().optional(),
        name: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (a): Promise<ToolResult> => {
      try {
        const td = await buildTypedData({ ...a, chainId: chainIdNum(a.chainId), owner: a.owner ?? (await activeAccount()) });
        const hash = hashTypedData(td as never);
        return okResult({}, { extra: { typedData: td, hash } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_typed_data_hash",
    {
      title: "EIP-712 typed-data hash",
      description: "Compute the EIP-712 signing digest (hashTypedData) for a typed-data object. Native and offline.",
      inputSchema: { typedData: z.any() },
      annotations: { readOnlyHint: true },
    },
    async ({ typedData }): Promise<ToolResult> => {
      try {
        const td = typeof typedData === "string" ? JSON.parse(typedData) : typedData;
        return okResult({}, { extra: { hash: hashTypedData(td as never) } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_logs",
    {
      title: "Query event logs",
      description: "eth_getLogs with an optional ERC-20 Transfer decode. Filter by address, block range and topics.",
      inputSchema: {
        address: z.string().optional(),
        fromBlock: z.string().optional(),
        toBlock: z.string().optional(),
        topics: z.array(z.union([z.string(), z.null()])).optional(),
        decode: z.literal("erc20-transfer").optional(),
        chunkSize: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ address, fromBlock, toBlock, topics, decode, chunkSize }): Promise<ToolResult> => {
      try {
        const filter: Record<string, unknown> = {};
        if (address) filter.address = address;
        filter.fromBlock = fromBlock ?? "latest";
        filter.toBlock = toBlock ?? fromBlock ?? "latest";
        if (topics) filter.topics = topics;
        const req = () => getSession().providerRequest("eth_getLogs", [filter]) as Promise<{ address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string }[]>;
        const fN = filter.fromBlock as string;
        const tN = filter.toBlock as string;
        let rawLogs: Awaited<ReturnType<typeof req>>;
        if (chunkSize && /^0x[0-9a-f]+$/i.test(fN) && /^0x[0-9a-f]+$/i.test(tN)) {
          const from = Number(BigInt(fN));
          const to = Number(BigInt(tN));
          rawLogs = [];
          for (let b = from; b <= to && b - from < 1_000_000; b += chunkSize) {
            filter.fromBlock = "0x" + b.toString(16);
            filter.toBlock = "0x" + Math.min(b + chunkSize - 1, to).toString(16);
            rawLogs.push(...(await req()));
          }
        } else {
          rawLogs = await req();
        }
        const logs = rawLogs as {
          address: string;
          topics: string[];
          data: string;
          blockNumber: string;
          transactionHash: string;
          logIndex: string;
        }[];
        const out = logs.map((l) => {
          const base = { address: l.address, blockNumber: l.blockNumber, transactionHash: l.transactionHash, logIndex: l.logIndex, topics: l.topics };
          if (decode === "erc20-transfer" && l.topics[0] === TRANSFER_TOPIC && l.topics.length >= 3) {
            return { ...base, transfer: { from: wordToAddress(l.topics[1] ?? ""), to: wordToAddress(l.topics[2] ?? ""), value: BigInt(l.data === "0x" ? "0x0" : l.data).toString() } };
          }
          return base;
        });
        return okResult({}, { extra: { count: out.length, logs: out } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_ens_text",
    {
      title: "Resolve an ENS text record",
      description: "Read an ENS text record (e.g. key='url', 'com.twitter') natively via the resolver.",
      inputSchema: { name: z.string(), key: z.string(), chainId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ name, key }): Promise<ToolResult> => {
      try {
        const value = await viemClient().getEnsText({ name, key });
        return okResult({}, { extra: { name, key, value: value ?? null } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_ens_resolver",
    {
      title: "Resolve an ENS resolver",
      description: "Return the resolver contract address for an ENS name, natively.",
      inputSchema: { name: z.string(), chainId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ name }): Promise<ToolResult> => {
      try {
        const resolver = await viemClient().getEnsResolver({ name });
        return okResult({}, { extra: { name, resolver: resolver ?? null } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ---- Native ERC-4337 / EIP-2612 / EIP-5267 / allowances ----
  const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
  const ERC5267 = parseAbi([
    "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  ]);

  server.registerTool(
    "wallet_erc20_allowance",
    {
      title: "ERC-20 allowance",
      description: "Read allowance(owner,spender) for an ERC-20 token via native eth_call.",
      inputSchema: { token: z.string(), spender: z.string(), owner: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ token, spender, owner }): Promise<ToolResult> => {
      try {
        const who = owner ?? (await activeAccount());
        if (!who) return okResult({ accounts: [] }, { text: "An owner is required.", next: [{ tool: "wallet_unlock" }] });
        const raw = BigInt(await evmCall(token, "0xdd62ed3e" + pad32(who) + pad32(spender)));
        return okResult({ accounts: [who] }, { extra: { token, owner: who, spender, allowance: raw.toString() } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_permit_nonce",
    {
      title: "EIP-2612 permit nonce",
      description: "Read the EIP-2612 nonces(owner) for a token, to build a Permit signature natively.",
      inputSchema: { token: z.string(), owner: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ token, owner }): Promise<ToolResult> => {
      try {
        const who = owner ?? (await activeAccount());
        if (!who) return okResult({ accounts: [] }, { text: "An owner is required.", next: [{ tool: "wallet_unlock" }] });
        const raw = BigInt(await evmCall(token, "0x7ecebe00" + pad32(who)));
        return okResult({ accounts: [who] }, { extra: { token, owner: who, nonce: raw.toString() } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_get_nonce_4337",
    {
      title: "ERC-4337 account nonce",
      description: "Read an account's ERC-4337 nonce from EntryPoint v0.7 getNonce(sender, key) via native eth_call.",
      inputSchema: { owner: z.string().optional(), key: z.string().optional(), entryPoint: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ owner, key, entryPoint }): Promise<ToolResult> => {
      try {
        const who = owner ?? (await activeAccount());
        if (!who) return okResult({ accounts: [] }, { text: "An owner is required.", next: [{ tool: "wallet_unlock" }] });
        const ep = entryPoint ?? ENTRYPOINT_V07;
        const raw = BigInt(await evmCall(ep, "0x35567e1a" + pad32(who) + padUint(key ?? "0")));
        return okResult({ accounts: [who] }, { extra: { entryPoint: ep, owner: who, key: key ?? "0", nonce: raw.toString() } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_eip712_domain",
    {
      title: "EIP-5267 domain (eip712Domain)",
      description: "Read a contract's EIP-5267 eip712Domain() (name, version, chainId, verifyingContract) via native eth_call.",
      inputSchema: { token: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ token }): Promise<ToolResult> => {
      try {
        const data = encodeFunctionData({ abi: ERC5267, functionName: "eip712Domain" });
        const res = (await evmCall(token, data)) as `0x${string}`;
        const [fields, name, version, chainId, verifyingContract] = decodeFunctionResult({
          abi: ERC5267,
          functionName: "eip712Domain",
          data: res,
        }) as unknown as [string, string, string, bigint, string, string, bigint[]];
        return okResult({}, { extra: { token, fields, name, version, chainId: Number(chainId), verifyingContract } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ---- Native calldata builders + EIP-55 address utils ----
  const builder = (
    name: string,
    title: string,
    desc: string,
    abi: readonly unknown[],
    fn: string,
    mapArgs: (a: Record<string, string | undefined>) => unknown[],
    schema: z.ZodRawShape,
  ) => {
    server.registerTool(
      name,
      { title, description: desc, inputSchema: { token: z.string(), ...schema }, annotations: { readOnlyHint: true } },
      async (a: Record<string, string | undefined>): Promise<ToolResult> => {
        try {
          const data = encodeFunctionData({ abi, functionName: fn, args: mapArgs(a) } as never);
          return okResult({}, { extra: { to: a.token, value: "0x0", data }, text: `${title}: ${data.slice(0, 10)}…` });
        } catch (e) {
          return errorResult(e);
        }
      },
    );
  };
  builder("wallet_erc20_transfer", "ERC-20 transfer calldata", "Build ERC-20 transfer(to,amount) calldata to feed wallet_inspect_transaction.", erc20Abi, "transfer", (a) => [a.to, BigInt(a.amount ?? "0")], { to: z.string(), amount: z.string() });
  builder("wallet_erc20_approve", "ERC-20 approve calldata", "Build ERC-20 approve(spender,amount) calldata.", erc20Abi, "approve", (a) => [a.spender, BigInt(a.amount ?? "0")], { spender: z.string(), amount: z.string() });
  builder("wallet_erc721_transfer", "ERC-721 transfer calldata", "Build ERC-721 safeTransferFrom(from,to,tokenId) calldata.", erc721Abi, "safeTransferFrom", (a) => [a.from, a.to, BigInt(a.tokenId ?? "0")], { from: z.string(), to: z.string(), tokenId: z.string() });
  builder("wallet_erc1155_transfer", "ERC-1155 transfer calldata", "Build ERC-1155 safeTransferFrom(from,to,id,amount,data) calldata.", erc1155Abi, "safeTransferFrom", (a) => [a.from, a.to, BigInt(a.tokenId ?? "0"), BigInt(a.amount ?? "0"), "0x"], { from: z.string(), to: z.string(), tokenId: z.string(), amount: z.string() });

  server.registerTool(
    "wallet_checksum_address",
    {
      title: "EIP-55 checksum an address",
      description: "Return the EIP-55 mixed-case checksum form of an address (validates it).",
      inputSchema: { address: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ address }): Promise<ToolResult> => {
      try {
        return okResult({}, { extra: { input: address, checksum: getAddress(address as `0x${string}`) } });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ---- Native swaps (LI.FI keyless aggregator -> executable calldata) ----
  server.registerTool(
    "wallet_inspect_swap",
    {
      title: "Inspect a swap",
      description: "Quote a same-chain swap from the keyless LI.FI aggregator and return an executable preview + single-use confirm_token. Nothing is sent. Then call wallet_execute_swap with the token.",
      inputSchema: {
        chainId: z.string(),
        sellToken: z.string(),
        buyToken: z.string(),
        amount: z.string(),
        taker: z.string().optional(),
        slippage: z.number().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ chainId, sellToken, buyToken, amount, taker, slippage }): Promise<ToolResult> => {
      try {
        const id = chainIdNum(chainId);
        const who = taker ?? (await activeAccount());
        if (!who) return okResult({ accounts: [] }, { text: "A taker address is required.", next: [{ tool: "wallet_unlock" }] });
        const q = await getLifiQuote({ chainId: id, sellToken, buyToken, amount, taker: who, slippage });
        const tx = { from: who, to: q.to, data: q.data, value: q.value };
        const c = confirmations.issue({
          kind: "swap",
          tool: "wallet_execute_swap",
          method: "eth_sendTransaction",
          request: tx,
          ttlMs: Number(process.env.MM_SWAP_TTL_MS ?? 60000),
        });
        return okResult({ chain: { id: chainIdHex(id), name: chainName(id) }, accounts: [who] }, {
          extra: {
            preview: { source: "lifi", sellToken, buyToken, sellAmount: amount, destAmount: q.destAmount, to: q.to, gasLimit: q.gasLimit },
            confirm_token: c.token,
            expires_in: Math.round(Number(process.env.MM_SWAP_TTL_MS ?? 60000) / 1000),
          },
          text: `Swap via LI.FI: ${amount} ${sellToken} -> ~${q.destAmount} ${buyToken}. Approve to execute.`,
          next: [{ tool: "wallet_execute_swap", args: { confirm_token: c.token } }],
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    "wallet_execute_swap",
    {
      title: "Execute a swap (gated)",
      description: "Broadcast a previewed swap via eth_sendTransaction. Requires a confirm_token from wallet_inspect_swap.",
      inputSchema: { confirm_token: z.string() },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ confirm_token }): Promise<ToolResult> => {
      try {
        return await execute("wallet_execute_swap", "eth_sendTransaction", confirm_token, async (req) => {
          const txHash = (await getSession().providerRequest("eth_sendTransaction", [req])) as string;
          return { result: txHash, txHash };
        });
      } catch (e) {
        const err = e as WalletError;
        if (err.code === "CONFIRMATION_EXPIRED") {
          return errorResult(new WalletError("QUOTE_EXPIRED", "The swap quote expired.", { hint: "Re-run wallet_inspect_swap." }));
        }
        return errorResult(e);
      }
    },
  );

  // ---- Native read-only passthrough: every read EIP-1193 method is reachable ----
  const READ_ONLY =
    /^(eth_(accounts|chainId|blockNumber|getBalance|getTransactionCount|getCode|getStorageAt|call|estimateGas|gasPrice|maxPriorityFeePerGas|feeHistory|getBlockByNumber|getBlockByHash|getTransactionByHash|getTransactionReceipt|getLogs|syncing)|net_(version|listening|peerCount)|web3_(clientVersion|sha3)|wallet_(getPermissions|getCapabilities))/;
  server.registerTool(
    "wallet_rpc",
    {
      title: "Native read-only RPC",
      description:
        "Call any read-only EIP-1193/JSON-RPC method natively (eth_*, net_*, web3_*, wallet_get*). Mutating methods are rejected here — use the gated tools for those.",
      inputSchema: { method: z.string(), params: z.array(z.any()).optional() },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ method, params }): Promise<ToolResult> => {
      try {
        if (!READ_ONLY.test(method)) {
          throw new WalletError("UNSUPPORTED_METHOD", `${method} is not a read-only method.`, {
            hint: "Use the gated tools for signing/sending.",
          });
        }
        const result = await getSession().providerRequest(method, (params as unknown[]) ?? []);
        return okResult({}, { extra: { result }, text: `rpc ${method} ok` });
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
