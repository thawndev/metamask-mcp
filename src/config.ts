import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/** Data dir for the audit log, cache and the optional key file (~/.metamask-mcp unless MM_HOME is set). */
export function homeDir(): string {
  return process.env.MM_HOME || path.join(os.homedir(), ".metamask-mcp");
}

export function auditLogPath(): string {
  return path.join(homeDir(), "audit.log");
}

export function cachePath(): string {
  return path.join(homeDir(), "cache.json");
}

export interface RuntimeConfig {
  network?: string;
  rpcUrl?: string;
  privateKey?: string;
}

function bool(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

export function loadConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    network: overrides.network ?? process.env.MM_NETWORK ?? undefined,
    rpcUrl: overrides.rpcUrl ?? process.env.MM_RPC_URL ?? undefined,
    privateKey:
      overrides.privateKey ??
      process.env.MM_PRIVATE_KEY ??
      readKeyFile(process.env.MM_PRIVATE_KEY_FILE) ??
      undefined,
  };
}

/** Read a private key from a file path (used by MM_PRIVATE_KEY_FILE / `--mnemonic-file`). */
function readKeyFile(p?: string): string | undefined {
  if (!p) return undefined;
  try {
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    return undefined;
  }
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export const allowLocalRpc = (): boolean => bool(process.env.MM_ALLOW_LOCAL_RPC);
