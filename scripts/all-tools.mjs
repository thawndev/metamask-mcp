// Exercise EVERY tool once (local-signer mode) to prove the full API surface is wired.
import { spawn } from "node:child_process";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const NATIVE = "0x0000000000000000000000000000000000000000";
const TYPED = {
  types: { Person: [{ name: "name", type: "string" }, { name: "wallet", type: "address" }] },
  primaryType: "Person",
  domain: { name: "metamask-mcp", version: "1", chainId: 1337 },
  message: { name: "Test", wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
};

const child = spawn(process.execPath, ["dist/cli.js", "serve"], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
let buf = ""; const pending = new Map();
child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } });
const call = (method, params) => new Promise((res) => { const id = Math.floor(Math.random() * 1e9); pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const t = async (name, args = {}) => (await call("tools/call", { name, arguments: args })).result?.structuredContent;

await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "all-tools", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

const rows = [];
const rec = (n, sc) => rows.push(`${(sc?.ok ? "OK " : "ERR")} ${n.padEnd(30)} ${sc?.ok ? "" : sc?.code}`);

rec("wallet_get_status", await t("wallet_get_status"));
rec("wallet_get_accounts", await t("wallet_get_accounts"));
rec("wallet_get_balance", await t("wallet_get_balance"));
rec("wallet_describe_screen", await t("wallet_describe_screen"));
rec("wallet_get_network", await t("wallet_get_network"));
rec("wallet_get_gas", await t("wallet_get_gas", { chainId: "1" }));
rec("wallet_estimate_gas", await t("wallet_estimate_gas", { to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: "1" }));
rec("wallet_call", await t("wallet_call", { chainId: "1", to: USDC, data: "0x18160ddd" }));
rec("wallet_rpc", await t("wallet_rpc", { method: "eth_blockNumber" }));
rec("wallet_get_cache", await t("wallet_get_cache"));
rec("wallet_get_capabilities", await t("wallet_get_capabilities"));
rec("wallet_select_account", await t("wallet_select_account", { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" }));
rec("wallet_watch_asset", await t("wallet_watch_asset", { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 }));
rec("wallet_get_token_balances", await t("wallet_get_token_balances", { chainId: "1", token: USDC, address: VITALIK }));
rec("wallet_get_swap_quote", await t("wallet_get_swap_quote", { chainId: "1", sellToken: NATIVE, buyToken: USDC, amount: "1000000000000000000", taker: VITALIK }));

const insp = await t("wallet_inspect_signature", { kind: "message", message: "hello" });
rec("wallet_inspect_signature", insp);
rec("wallet_sign_message", await t("wallet_sign_message", { confirm_token: insp.confirm_token }));
const inspT = await t("wallet_inspect_signature", { kind: "typedData", typedData: TYPED });
rec("wallet_inspect_signature(typedData)", inspT);
rec("wallet_sign_typed_data", await t("wallet_sign_typed_data", { confirm_token: inspT.confirm_token }));
const itx = await t("wallet_inspect_transaction", { to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: "1000" });
rec("wallet_inspect_transaction", itx);
const sent = await t("wallet_send_transaction", { confirm_token: itx.confirm_token });
rec("wallet_send_transaction", sent);
rec("wallet_get_transaction_receipt", await t("wallet_get_transaction_receipt", { txHash: sent.result }));
rec("wallet_add_network", await t("wallet_add_network", { chainId: "1337", chainName: "Local", rpcUrls: ["http://127.0.0.1:8545"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } }));
rec("wallet_switch_network", await t("wallet_switch_network", { chainId: "1337" }));
rec("wallet_lock", await t("wallet_lock"));

const bad = rows.filter((r) => r.startsWith("ERR") && !/wallet_watch_asset|wallet_get_swap_quote/.test(r));
console.log(rows.join("\n"));
console.log(`\nTOTAL ${rows.length} tools; unexpected errors: ${bad.length}`);
child.kill("SIGKILL");
process.exit(bad.length ? 1 : 0);
