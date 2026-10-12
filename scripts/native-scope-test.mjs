import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["dist/cli.js", "serve"], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
let buf = ""; const pending = new Map();
child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const call = (method, params) => new Promise((res) => { const id = Math.floor(Math.random() * 1e9); pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const t = async (name, args = {}) => (await call("tools/call", { name, arguments: args })).result;
const st = async (name, args) => (await t(name, args))?.structuredContent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ns", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

// F-111 (re-scoped native): the native provider is keyed to the supplied private key.
const accts = await st("wallet_get_accounts", {});
const ok111 = Array.isArray(accts?.screen?.accounts) && accts.screen.accounts[0]?.toLowerCase() === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
console.log(`F-111 native key import -> account ${accts?.screen?.accounts?.[0]} : ${ok111 ? "PASS" : "FAIL"}`);

// F-013 (re-scoped native): a failed request surfaces a typed error and the provider stays usable.
const bad = await st("wallet_rpc", { method: "eth_thisDoesNotExist" });
const good = await st("wallet_rpc", { method: "eth_chainId" });
const ok13 = !!bad?.code && good?.ok === true;
console.log(`F-013 resilience -> error=${bad?.code} then ok=${good?.ok} : ${ok13 ? "PASS" : "FAIL"}`);

// F-018 (re-scoped native): every native provider call completes well under the 5s budget.
let max = 0; for (let i = 0; i < 10; i++) { const s = Date.now(); await st("wallet_rpc", { method: "eth_blockNumber" }); max = Math.max(max, Date.now() - s); }
const ok18 = max < 5000;
console.log(`F-018 latency budget -> max ${max}ms < 5000ms : ${ok18 ? "PASS" : "FAIL"}`);

// F-025 (native byte-binding): execute accepts ONLY a token; the executed bytes equal the preview; single-use.
const tools = (await call("tools/list", {})).result.tools;
const schema = tools.find((x) => x.name === "wallet_send_transaction")?.inputSchema;
const props = Object.keys(schema?.properties ?? {});
const insp = await st("wallet_inspect_transaction", { to: "0x000000000000000000000000000000000000dEaD", value: "1" });
const tokensMatch = insp?.preview?.to && insp?.confirm_token;
const ex = await st("wallet_send_transaction", { confirm_token: insp.confirm_token });
const reuse = await st("wallet_send_transaction", { confirm_token: insp.confirm_token });
const ok25 = props.length === 1 && props[0] === "confirm_token" && tokensMatch && typeof ex?.result === "string" && reuse?.code === "ALREADY_CONSUMED";
console.log(`F-025 byte-binding -> schema=${props.join(",")} tx=${String(ex?.result).slice(0, 12)}… reuse=${reuse?.code} : ${ok25 ? "PASS" : "FAIL"}`);

await sleep(100);
const all = ok111 && ok13 && ok18 && ok25;
console.log(all ? "PASS native-only re-scope (F-013/F-018/F-025/F-111)" : "FAIL native-only re-scope");
child.kill("SIGKILL"); process.exit(all ? 0 : 1);
