import { readFileSync, writeFileSync } from "node:fs";
import { cachePath } from "./config.js";

export interface CacheEntry {
  accounts: string[];
  chainId: number;
  updatedAt: number;
}

/**
 * Advisory cache of accounts/chain (F-089). The wallet/provider is always the source of
 * truth; this is a last-known snapshot that is refreshed on every read and after every
 * mutation, and persisted so `wallet_get_cache` survives a restart.
 */
class WalletCache {
  private entry?: CacheEntry;

  constructor() {
    try {
      this.entry = JSON.parse(readFileSync(cachePath(), "utf8")) as CacheEntry;
    } catch {
      this.entry = undefined;
    }
  }

  update(accounts: string[], chainId: number): void {
    this.entry = { accounts, chainId, updatedAt: Date.now() };
    try {
      writeFileSync(cachePath(), JSON.stringify(this.entry));
    } catch {
      /* cache is advisory; a write failure is not fatal */
    }
  }

  get(): (CacheEntry & { ageMs: number }) | undefined {
    if (!this.entry) return undefined;
    return { ...this.entry, ageMs: Date.now() - this.entry.updatedAt };
  }
}

export const walletCache = new WalletCache();
