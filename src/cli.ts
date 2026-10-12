#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createServer } from "./mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getSession } from "./wallet/session.js";
import { ensureDir, homeDir, loadConfig, type RuntimeConfig } from "./config.js";
import { chainIdNum, chainName, chainIdHex, rpcUrlFor } from "./chains/rpc.js";
import { verifyChain } from "./audit.js";
import { generatePrivateKey, privateKeyToAccount, mnemonicToAccount } from "viem/accounts";

const DISCLAIMER =
  "Unofficial — not affiliated with, endorsed by, or sponsored by MetaMask or Consensys.";

interface Flags {
  [k: string]: string | boolean;
}

function parseFlags(argv: string[]): { cmd: string; flags: Flags; rest: string[] } {
  const [cmd = "help", ...args] = argv;
  const flags: Flags = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      rest.push(a);
    }
  }
  return { cmd, flags, rest };
}

function cfgFromFlags(flags: Flags): RuntimeConfig {
  return loadConfig({
    network: typeof flags.network === "string" ? flags.network : typeof flags.chain === "string" ? flags.chain : undefined,
    rpcUrl: typeof flags.rpc === "string" ? flags.rpc : undefined,
  });
}

function help(): void {
  process.stdout.write(`metamask-mcp · an Ethereum wallet MCP server

USAGE
  metamask-mcp <command> [options]

COMMANDS
  setup        Configure a signer and print the MCP client JSON
  serve        Run the stdio MCP server (default when spawned by an MCP client)
  describe     One-shot: print chain + accounts (human text; --json for machines)
  doctor       Check node, signer, RPC and the audit chain
  rpc <m> [j]  Call any method on the native provider directly
  accounts     Print the signer's accounts
  balance [a]  Print the native balance for an address (default: the signer)
  send         send --to <addr> [--value <wei>] [--data <hex>]
  sign-message Print a personal_sign signature for a message

OPTIONS
  --network <id>       chain id (env MM_NETWORK)
  --rpc <url>          JSON-RPC endpoint (env MM_RPC_URL)
  --private-key <hex>  setup: use this key, printed config only (env MM_PRIVATE_KEY)
  --generate           setup: generate a fresh account (private key printed once)
  --mnemonic <phrase>  setup: derive account 0 from a recovery phrase (writes a 0600 key file)
  --mnemonic-file <p>  setup: derive account 0 from a 0600 file holding the phrase
  --fund [eth]         setup: send test coins to the account from the RPC's first account
  --json               Machine-readable output

SIGNER
  The private key is read from MM_PRIVATE_KEY or a 0600 file via MM_PRIVATE_KEY_FILE.
  Keys are held in-process; use only test/dev keys unless you accept that risk.

EXIT CODES
  0 success · 1 runtime error · 2 usage error

${DISCLAIMER}.
`);
}

async function rpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const j = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message ?? "rpc error");
  return j.result;
}

function clientJson(env: Record<string, string>): string {
  return JSON.stringify(
    { mcpServers: { metamask: { command: "npx", args: ["-y", "@thawndev/metamask-mcp", "serve"], env } } },
    null,
    2,
  );
}

/** `setup --generate` / `setup --private-key` — inline key (printed once). */
async function cmdLocalSetup(flags: Flags): Promise<number> {
  const generated = flags.generate === true;
  const key = generated ? generatePrivateKey() : String(flags["private-key"]);
  const pk = (key.startsWith("0x") ? key : "0x" + key) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  const rpc = typeof flags.rpc === "string" ? flags.rpc : (process.env.MM_RPC_URL ?? "http://127.0.0.1:8545");
  const network = typeof flags.chain === "string" ? flags.chain : (process.env.MM_NETWORK ?? "1337");

  process.stdout.write(`Signer account: ${account.address}\n`);
  if (generated) process.stdout.write(`Private key (SAVE THIS — shown once): ${key}\n`);

  try {
    const bal = (await rpcCall(rpc, "eth_getBalance", [account.address, "latest"])) as string;
    process.stdout.write(`Chain ${network} @ ${rpc} · balance ${BigInt(bal) / 10n ** 18n} ETH\n`);
    if (flags.fund !== undefined && flags.fund !== false && flags.fund !== "0") {
      const accts = (await rpcCall(rpc, "eth_accounts", [])) as string[];
      const eth = typeof flags.fund === "string" ? Number(flags.fund) : 10;
      const value = "0x" + BigInt(Math.floor(eth * 1e18)).toString(16);
      const tx = await rpcCall(rpc, "eth_sendTransaction", [{ from: accts[0], to: account.address, value }]);
      const after = (await rpcCall(rpc, "eth_getBalance", [account.address, "latest"])) as string;
      process.stdout.write(`Funded with ${eth} test ETH — tx ${tx}; new balance ${BigInt(after) / 10n ** 18n} ETH\n`);
    }
  } catch (e) {
    process.stderr.write(
      `note: RPC ${rpc} not reachable (${(e as Error).message}). Start a chain: npx ganache --wallet.mnemonic "test test test test test test test test test test test junk" --chain.chainId 1337\n`,
    );
  }

  process.stdout.write(
    `\nAdd this to your MCP client config and restart it:\n${clientJson({ MM_PRIVATE_KEY: key, MM_NETWORK: network, MM_RPC_URL: rpc, MM_ALLOW_LOCAL_RPC: "1" })}\n`,
  );
  return 0;
}

/** `setup --mnemonic-file <path>` — derive account 0; write a 0600 key file, never echo it. */
async function cmdMnemonicSetup(phrase: string, flags: Flags, source: string): Promise<number> {
  phrase = phrase.trim();
  if (source !== "file") {
    process.stderr.write(
      "SECURITY: passing a recovery phrase on the command line or via an env var can leak it via the process list / shell history. Prefer --mnemonic-file <0600 file>.\n",
    );
  }
  let account;
  try {
    account = mnemonicToAccount(phrase, { addressIndex: 0 });
  } catch (e) {
    process.stderr.write(`Invalid mnemonic: ${(e as Error).message}\n`);
    return 1;
  }
  const pk = account.getHdKey().privateKey;
  if (!pk) {
    process.stderr.write("Could not derive a private key from that mnemonic.\n");
    return 1;
  }
  const pkHex = "0x" + Buffer.from(pk).toString("hex");
  const keyPath = path.join(homeDir(), "signer.key");
  ensureDir(path.dirname(keyPath));
  fs.writeFileSync(keyPath, pkHex + "\n", { mode: 0o600 });
  process.stdout.write(`Derived account 0: ${account.address}\n`);
  process.stdout.write(`Private key written to ${keyPath} (mode 0600); NOT printed and never sent anywhere.\n`);
  const rpc = typeof flags.rpc === "string" ? flags.rpc : (process.env.MM_RPC_URL ?? "http://127.0.0.1:8545");
  const network = typeof flags.chain === "string" ? flags.chain : (process.env.MM_NETWORK ?? "1337");
  process.stdout.write(
    `\nAdd this to your MCP client config (references the key file, not the key):\n` +
      clientJson({ MM_PRIVATE_KEY_FILE: keyPath, MM_NETWORK: network, MM_RPC_URL: rpc, MM_ALLOW_LOCAL_RPC: "1" }) +
      "\n",
  );
  process.stderr.write(`\nSECURITY: keep the mnemonic file at chmod 600 and delete it after use.\n`);
  return 0;
}

async function cmdSetup(flags: Flags): Promise<number> {
  const phraseFlag =
    typeof flags["mnemonic"] === "string" ? flags["mnemonic"] : typeof flags["phrase"] === "string" ? flags["phrase"] : undefined;
  if (phraseFlag) {
    return cmdMnemonicSetup(phraseFlag, flags, "argv");
  }
  if (typeof flags["mnemonic-file"] === "string") {
    let phrase: string;
    try {
      phrase = fs.readFileSync(flags["mnemonic-file"], "utf8");
    } catch (e) {
      process.stderr.write(`Could not read mnemonic file ${flags["mnemonic-file"]}: ${(e as Error).message}\n`);
      return 1;
    }
    return cmdMnemonicSetup(phrase, flags, "file");
  }
  if (process.env.MM_MNEMONIC && flags.generate !== true && typeof flags["private-key"] !== "string") {
    return cmdMnemonicSetup(process.env.MM_MNEMONIC, flags, "MM_MNEMONIC");
  }
  if (flags.generate === true || typeof flags["private-key"] === "string") {
    return cmdLocalSetup(flags);
  }
  process.stdout.write(
    `${DISCLAIMER}\n\nThis server needs a signer.\n` +
      `Configure one of:\n` +
      `  metamask-mcp setup --generate                     # fresh account, key printed once\n` +
      `  metamask-mcp setup --private-key 0x...            # use an existing key\n` +
      `  metamask-mcp setup --mnemonic-file /path/phrase   # derive account 0 into a 0600 key file\n  metamask-mcp setup --mnemonic "word word ..."     # apply a phrase directly (writes a 0600 key file)\n`,
  );
  return 0;
}

async function cmdServe(flags: Flags): Promise<number> {
  const cfg = cfgFromFlags(flags);
  getSession(cfg);
  const server = createServer();
  await server.connect(new StdioServerTransport());
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => resolve());
    process.on("SIGTERM", () => resolve());
  });
  await getSession().close();
  return 0;
}

async function cmdDescribe(flags: Flags): Promise<number> {
  const cfg = cfgFromFlags(flags);
  const session = getSession(cfg);
  const chainIdRaw = (await session.providerRequest("eth_chainId")) as string;
  const id = chainIdNum(chainIdRaw);
  const accounts = (await session.providerRequest("eth_accounts")) as string[];
  if (flags.json === true) {
    process.stdout.write(
      JSON.stringify({ chain: { id: chainIdHex(chainIdRaw), name: chainName(id) }, accounts }, null, 2) + "\n",
    );
  } else {
    process.stdout.write(`${chainName(id)} (${chainIdHex(chainIdRaw)}) · ${accounts.length} account(s)\n`);
  }
  await session.close();
  return 0;
}

/** Native CLI commands over the same provider engine (use without MCP). */
async function cmdRpc(flags: Flags, rest: string[]): Promise<number> {
  const cfg = cfgFromFlags(flags);
  const method = rest[0];
  if (!method) {
    process.stderr.write("usage: metamask-mcp rpc <method> [jsonParams]\n");
    return 2;
  }
  const params = rest[1] ? (JSON.parse(rest[1]) as unknown[]) : [];
  const result = await getSession(cfg).providerRequest(method, params);
  process.stdout.write(JSON.stringify(result) + "\n");
  await getSession().close();
  return 0;
}

async function cmdAccounts(flags: Flags): Promise<number> {
  const cfg = cfgFromFlags(flags);
  const accounts = (await getSession(cfg).providerRequest("eth_accounts")) as string[];
  process.stdout.write(accounts.join("\n") + "\n");
  await getSession().close();
  return 0;
}

async function cmdBalance(flags: Flags, rest: string[]): Promise<number> {
  const cfg = cfgFromFlags(flags);
  const s = getSession(cfg);
  const addr = rest[0] ?? ((await s.providerRequest("eth_accounts")) as string[])[0];
  const wei = (await s.providerRequest("eth_getBalance", [addr, "latest"])) as string;
  process.stdout.write(`${addr} ${wei} wei\n`);
  await s.close();
  return 0;
}

async function cmdSend(flags: Flags): Promise<number> {
  const cfg = cfgFromFlags(flags);
  const s = getSession(cfg);
  const from = (await s.providerRequest("eth_accounts")) as string[];
  const tx: Record<string, unknown> = { from: from[0], to: flags.to };
  if (typeof flags.value === "string")
    tx.value = flags.value.startsWith("0x") ? flags.value : "0x" + BigInt(flags.value).toString(16);
  if (typeof flags.data === "string") tx.data = flags.data;
  const hash = await s.providerRequest("eth_sendTransaction", [tx]);
  process.stdout.write(String(hash) + "\n");
  await s.close();
  return 0;
}

async function cmdSignMessage(flags: Flags, rest: string[]): Promise<number> {
  const cfg = cfgFromFlags(flags);
  const s = getSession(cfg);
  const addr = ((await s.providerRequest("eth_accounts")) as string[])[0];
  const hex = "0x" + Buffer.from(rest[0] ?? "", "utf8").toString("hex");
  const sig = await s.providerRequest("personal_sign", [hex, addr]);
  process.stdout.write(String(sig) + "\n");
  await s.close();
  return 0;
}

async function cmdDoctor(flags: Flags): Promise<number> {
  const cfg = cfgFromFlags(flags);
  let ok = true;
  const line = (name: string, value: string, good: boolean) => {
    process.stdout.write(`  ${name.padEnd(16)} ${value}${good ? "" : "   <-- FAIL"}\n`);
    if (!good) ok = false;
  };
  process.stdout.write("metamask-mcp doctor\n");
  line("node", process.version, Number(process.versions.node.split(".")[0]) >= 22);
  line("home", homeDir(), true);

  try {
    const s = getSession(cfg);
    line("signer", s.address, true);
  } catch (e) {
    line("signer", (e as Error).message, false);
  }

  try {
    const rpc = rpcUrlFor(chainIdNum(cfg.network ?? "1"), cfg.rpcUrl);
    line("rpc", rpc, true);
  } catch (e) {
    line("rpc", (e as Error).message, false);
  }

  const broken = verifyChain();
  line("audit chain", broken < 0 ? "intact (or empty)" : `BROKEN at line ${broken}`, broken < 0);
  return ok ? 0 : 1;
}

async function main(): Promise<void> {
  const { cmd, flags, rest } = parseFlags(process.argv.slice(2));
  let code = 0;
  try {
    switch (cmd) {
      case "setup":
        code = await cmdSetup(flags);
        break;
      case "serve":
        code = await cmdServe(flags);
        break;
      case "describe":
        code = await cmdDescribe(flags);
        break;
      case "doctor":
        code = await cmdDoctor(flags);
        break;
      case "rpc":
        code = await cmdRpc(flags, rest);
        break;
      case "accounts":
        code = await cmdAccounts(flags);
        break;
      case "balance":
        code = await cmdBalance(flags, rest);
        break;
      case "send":
        code = await cmdSend(flags);
        break;
      case "sign-message":
        code = await cmdSignMessage(flags, rest);
        break;
      case "help":
      case "--help":
      case "-h":
      case undefined:
        help();
        break;
      case "--version":
        process.stdout.write("0.1.0\n");
        break;
      default:
        process.stderr.write(`Unknown command: ${cmd}\n`);
        help();
        code = 2;
    }
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    code = 1;
  }
  process.exit(code);
}

await main();
