import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["dist/cli.js", "serve"], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
let buf = ""; const pending = new Map();
child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const call = (method, params) => new Promise((res) => { const id = Math.floor(Math.random() * 1e9); pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const t = async (name, args = {}) => (await call("tools/call", { name, arguments: args })).result?.structuredContent;
await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cache", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await t("wallet_describe_screen"); // populates cache
const c1 = (await t("wallet_get_cache")).cache;
await sleep(1200);
const c2 = (await t("wallet_get_cache")).cache;
const insp = await t("wallet_inspect_transaction", { to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: "1" });
await t("wallet_send_transaction", { confirm_token: insp.confirm_token });
const c3 = (await t("wallet_get_cache")).cache;
const ok = c1 && c1.accounts.length === 1 && c2.ageMs > c1.ageMs && c3.ageMs < 50;
console.log(`cache1 accounts=${c1?.accounts?.length} age=${c1?.ageMs}ms; after1.2s age=${c2?.ageMs}ms; after mutation age=${c3?.ageMs}ms`);
console.log(ok ? "PASS advisory cache populated on read and refreshed on mutation" : "FAIL cache");
child.kill("SIGKILL"); process.exit(ok ? 0 : 1);
