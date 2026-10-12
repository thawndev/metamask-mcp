import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// dev: start the stdio MCP server detached, recording pid + log.
const runDir = ".agents/run";
fs.mkdirSync(runDir, { recursive: true });
const log = path.join(runDir, "dev.log");
const out = fs.openSync(log, "a");
const child = spawn(process.execPath, ["dist/cli.js", "serve"], {
  detached: true,
  stdio: ["ignore", out, out],
  env: process.env,
});
child.unref();
fs.writeFileSync(path.join(runDir, "dev.pid"), String(child.pid));
console.log(`metamask-mcp dev: pid ${child.pid}, log ${log}`);
