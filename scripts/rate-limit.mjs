import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["dist/cli.js", "serve"], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
let buf = ""; const pending = new Map();
child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const call = (method, params) => new Promise((res) => { const id = Math.floor(Math.random() * 1e9); pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "rl", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
let rate = 0;
for (let i = 0; i < 25; i++) {
  const r = (await call("tools/call", { name: "wallet_send_transaction", arguments: { confirm_token: "ck_x" } })).result?.structuredContent;
  if (r?.message?.includes("rate limit")) rate++;
}
console.log(rate > 0 ? `PASS rate limit enforced (${rate} of 25 blocked)` : "FAIL no rate limit");
child.kill("SIGKILL");
process.exit(rate > 0 ? 0 : 1);
