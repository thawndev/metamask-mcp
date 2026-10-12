import { loadConfig, type RuntimeConfig } from "../config.js";
import { WalletError } from "../errors.js";
import { LocalProvider } from "./localProvider.js";
import { chainIdNum, rpcUrlFor } from "../chains/rpc.js";

/**
 * The provider session: a single in-process signer (private key / mnemonic) over a JSON-RPC
 * endpoint. Provider operations are serialised through a single-flight queue so concurrent
 * tool calls never interleave.
 */
export class WalletSession {
  private local?: LocalProvider;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(public cfg: RuntimeConfig = loadConfig()) {}

  get mode(): "native" {
    return "native";
  }

  get signerConfigured(): boolean {
    return !!this.cfg.privateKey;
  }

  /** The signer is built lazily so `tools/list` and the schema work without a key. */
  private provider(): LocalProvider {
    if (!this.local) {
      if (!this.cfg.privateKey) {
        throw new WalletError("NO_SIGNER", "No signer configured.", {
          hint: "Set MM_PRIVATE_KEY or MM_PRIVATE_KEY_FILE. Generate one with: metamask-mcp setup --generate",
        });
      }
      const id = chainIdNum(this.cfg.network ?? "1");
      this.local = new LocalProvider(this.cfg.privateKey, rpcUrlFor(id, this.cfg.rpcUrl), id);
    }
    return this.local;
  }

  get address(): string {
    return this.provider().address;
  }

  async ensure(): Promise<void> {
    /* native provider is always ready */
  }

  /** Single-flight provider request through the native signer. */
  async providerRequest(method: string, params: unknown[] = []): Promise<unknown> {
    return this.enqueue(() => this.provider().request(method, params));
  }

  async isUnlocked(): Promise<boolean> {
    return true;
  }

  async ensureUnlocked(): Promise<void> {
    /* native signer is always available */
  }

  async lock(): Promise<boolean> {
    return true;
  }

  async connect(): Promise<string[]> {
    return (await this.providerRequest("eth_accounts")) as string[];
  }

  async close(): Promise<void> {
    /* nothing to tear down */
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => {});
    return run;
  }
}

let singleton: WalletSession | undefined;

export function getSession(cfg?: RuntimeConfig): WalletSession {
  if (!singleton) singleton = new WalletSession(cfg);
  return singleton;
}

export async function resetSession(): Promise<void> {
  singleton = undefined;
}
