// End-to-end exercise of the full tool surface in local-signer mode against a test-coin chain.
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["dist/cli.js", "serve"], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
let buf = ""; const pending = new Map();
child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const call = (method, params) => new Promise((res) => { const id = Math.floor(Math.random() * 1e9); pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const tool = async (name, args = {}) => (await call("tools/call", { name, arguments: args })).result?.structuredContent;

await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

const line = (label, v) => console.log(`OK  ${label}: ${typeof v === "string" ? v : JSON.stringify(v)}`);

const accounts = await tool("wallet_get_accounts");
line("get_accounts", accounts.screen?.accounts);
const bal = await tool("wallet_get_balance");
line("get_balance", bal.screen?.balance?.display);
const desc = await tool("wallet_describe_screen");
line("describe_screen", { locked: desc.screen?.locked, chain: desc.screen?.chain?.name });
const net = await tool("wallet_get_network");
line("get_network", net.screen?.chain);

const insp = await tool("wallet_inspect_signature", { kind: "message", message: "hello from metamask-mcp" });
line("inspect_signature", { token: String(insp.confirm_token).slice(0, 12) + "…" });
const signed = await tool("wallet_sign_message", { confirm_token: insp.confirm_token });
line("sign_message", String(signed.result).slice(0, 26) + "…");

const itx = await tool("wallet_inspect_transaction", { to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: "1000000000000000" });
line("inspect_transaction", { token: String(itx.confirm_token).slice(0, 12) + "…" });
const sent = await tool("wallet_send_transaction", { confirm_token: itx.confirm_token });
line("send_transaction", String(sent.result));
const txHash = sent.result;
const rc = await tool("wallet_get_transaction_receipt", { txHash });
line("get_transaction_receipt", rc.receipt);

// negative: reused token
const reused = await tool("wallet_sign_message", { confirm_token: insp.confirm_token });
line("reused_token_error", { code: reused.code, retryable: reused.retryable });

child.kill("SIGKILL"); process.exit(0);
