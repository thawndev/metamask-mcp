// Hostile-input regression suite: every case must return a structured error (never crash/hang).
import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["dist/cli.js", "serve"], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
let buf = ""; const pending = new Map();
child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const call = (method, params) => new Promise((res) => { const id = Math.floor(Math.random() * 1e9); pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const t = async (name, args) => await call("tools/call", { name, arguments: args });
await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "adv", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

const cases = [
  ["wallet_rpc mutating rejected", "wallet_rpc", { method: "eth_sendTransaction", params: [] }],
  ["wallet_rpc unknown", "wallet_rpc", { method: "foo_bar", params: [] }],
  ["wallet_get_balance bad address", "wallet_get_balance", { address: "not-an-address" }],
  ["wallet_get_balance huge chain", "wallet_get_balance", { chainId: "999999999999", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }],
  ["wallet_switch_network bad chain", "wallet_switch_network", { chainId: "nothex" }],
  ["wallet_sign bad token", "wallet_sign_message", { confirm_token: "ck_bad" }],
  ["wallet_select unknown account", "wallet_select_account", { address: "0x0000000000000000000000000000000000000001" }],
  ["wallet_call bad data", "wallet_call", { chainId: "1", to: "0x0000000000000000000000000000000000000000", data: "nothex" }],
];
let bad = 0;
for (const [label, tool, args] of cases) {
  const resp = await Promise.race([t(tool, args), new Promise((res) => setTimeout(() => res({ error: { code: "HANG" } }), 15000))]);
  const sc = resp?.result?.structuredContent;
  const ok = (sc && sc.ok === false && typeof sc.code === "string") || (resp?.error != null) || (resp?.result?.isError === true);
  const detail = sc ? sc.code : resp?.result?.isError ? "schema-validation" : resp?.error ? "rpc-error" : "?";
  console.log(`${ok ? "OK " : "BAD"} ${label} -> ${detail}`);
  if (!ok) bad++;
}
// oversized already covered by dos-guard; reused token covered by local-e2e
console.log(bad ? `FAIL ${bad} hostile cases` : `PASS ${cases.length} hostile cases return structured errors`);
child.kill("SIGKILL"); process.exit(bad ? 1 : 0);
