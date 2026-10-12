// Benchmark: warm latency of representative tools through one live MCP server.
import { spawn } from "node:child_process";
const TOOLS = [
  ["wallet_get_gas", { chainId: "1" }, 3],
  ["wallet_call", { chainId: "1", to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", data: "0x18160ddd" }, 3],
  ["wallet_get_network", {}, 3],
  ["wallet_get_balance", { chainId: "1", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" }, 3],
  ["wallet_describe_screen", {}, 3],
];
const child = spawn(process.execPath, ["dist/cli.js", "serve"], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
let buf = ""; const pending = new Map();
child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const call = (method, params) => new Promise((res) => { const id = Math.floor(Math.random() * 1e9); pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bench", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
const rows = []; const rowsJson = [];
for (const [name, args, n] of TOOLS) {
  const times = [];
  for (let i = 0; i < n; i++) { const t = process.hrtime.bigint(); await call("tools/call", { name, arguments: args }); times.push(Number(process.hrtime.bigint() - t) / 1e6); }
  const cold = times[0]; const warm = times.slice(1); const med = warm.sort((a, b) => a - b)[Math.floor(warm.length / 2)] ?? cold;
  rows.push(`${name.padEnd(28)} cold=${cold.toFixed(0)}ms  warm_median=${med.toFixed(0)}ms  n=${n}`);
  rowsJson.push({ tool: name, cold_ms: +cold.toFixed(1), warm_median_ms: +med.toFixed(1), n });
}
console.log("TOOL BENCHMARK (ms)\n" + rows.join("\n"));
import fs from "node:fs";
fs.mkdirSync(".agents/run", { recursive: true });
fs.writeFileSync(".agents/run/bench.json", JSON.stringify(rowsJson, null, 2));
child.kill("SIGKILL"); process.exit(0);
