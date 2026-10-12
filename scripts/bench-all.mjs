// Full benchmark: warm latency of every read/inspect tool plus the sign and send execute paths.
import { spawn } from "node:child_process";
import fs from "node:fs";
const TARGET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const NATIVE = "0x0000000000000000000000000000000000000000";

const child = spawn(process.execPath, ["dist/cli.js", "serve"], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
let buf = ""; const pending = new Map();
child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const call = (method, params) => new Promise((res) => { const id = Math.floor(Math.random() * 1e9); pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const tool = async (name, args = {}) => (await call("tools/call", { name, arguments: args })).result?.structuredContent;
const time = async (fn) => { const t = process.hrtime.bigint(); await fn(); return Number(process.hrtime.bigint() - t) / 1e6; };

await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bench", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

const N = 4;
const simple = [
  ["wallet_get_status", {}], ["wallet_get_accounts", {}], ["wallet_get_balance", {}],
  ["wallet_describe_screen", {}], ["wallet_get_network", {}], ["wallet_get_gas", { chainId: "1" }],
  ["wallet_call", { chainId: "1", to: USDC, data: "0x18160ddd" }],
  ["wallet_get_token_balances", { chainId: "1", token: USDC, address: VITALIK }],
  ["wallet_get_swap_quote", { chainId: "1", sellToken: NATIVE, buyToken: USDC, amount: "1000000000000000000", taker: VITALIK }],
  ["wallet_inspect_signature", { kind: "message", message: "bench" }],
  ["wallet_inspect_transaction", { to: TARGET, value: "1" }],
];
const rows = [];
for (const [name, args] of simple) {
  const times = [];
  for (let i = 0; i < N; i++) times.push(await time(() => tool(name, args)));
  const warm = times.slice(1).sort((a, b) => a - b);
  rows.push({ tool: name, cold_ms: +times[0].toFixed(1), warm_p50_ms: +warm[Math.floor(warm.length / 2)].toFixed(1) });
}
// sign execute
{
  const times = [];
  for (let i = 0; i < N; i++) {
    const ins = await tool("wallet_inspect_signature", { kind: "message", message: "bench" });
    times.push(await time(() => tool("wallet_sign_message", { confirm_token: ins.confirm_token })));
  }
  const warm = times.slice(1).sort((a, b) => a - b);
  rows.push({ tool: "wallet_sign_message", cold_ms: +times[0].toFixed(1), warm_p50_ms: +warm[Math.floor(warm.length / 2)].toFixed(1) });
}
// send execute
{
  const times = [];
  for (let i = 0; i < N; i++) {
    const ins = await tool("wallet_inspect_transaction", { to: TARGET, value: "1" });
    times.push(await time(() => tool("wallet_send_transaction", { confirm_token: ins.confirm_token })));
  }
  const warm = times.slice(1).sort((a, b) => a - b);
  rows.push({ tool: "wallet_send_transaction", cold_ms: +times[0].toFixed(1), warm_p50_ms: +warm[Math.floor(warm.length / 2)].toFixed(1) });
}

fs.mkdirSync(".agents/run", { recursive: true });
fs.writeFileSync(".agents/run/bench-all.json", JSON.stringify(rows, null, 2));
for (const r of rows) console.log(`${r.tool.padEnd(30)} cold=${String(r.cold_ms).padStart(6)}ms  warm_p50=${String(r.warm_p50_ms).padStart(6)}ms`);
child.kill("SIGKILL"); process.exit(0);
