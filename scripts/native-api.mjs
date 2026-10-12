// Assert the full native EIP-1193 surface in local-signer mode (real chain, test coins).
import { LocalProvider } from "../dist/wallet/localProvider.js";
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const RPC = process.env.MM_RPC_URL || "http://127.0.0.1:8545";
const p = new LocalProvider(KEY, RPC, 1337);
const addr = (await p.request("eth_accounts"))[0];
const hash0 = (await p.request("eth_sendTransaction", [{ to: addr, value: "0x1" }]));
await new Promise((r)=>setTimeout(r,300));
const TYPED = { types: { Person: [{ name: "n", type: "string" }] }, primaryType: "Person", domain: { name: "mm", version: "1", chainId: 1337 }, message: { n: "x" } };
const iso = (v) => v != null && (typeof v === "string" || typeof v === "object");
const checks = [
  ["eth_accounts", [], (r) => Array.isArray(r) && r.length === 1],
  ["eth_requestAccounts", [], (r) => Array.isArray(r)],
  ["eth_chainId", [], (r) => r === "0x539"],
  ["net_version", [], (r) => r === "1337"],
  ["eth_blockNumber", [], (r) => /^0x[0-9a-f]+$/.test(r)],
  ["eth_getBalance", [addr], (r) => /^0x[0-9a-f]+$/.test(r)],
  ["eth_getTransactionCount", [addr], (r) => /^0x[0-9a-f]+$/.test(r)],
  ["eth_getCode", [addr], (r) => typeof r === "string"],
  ["eth_gasPrice", [], (r) => /^0x[0-9a-f]+$/.test(r)],
  ["eth_estimateGas", [{ to: addr, value: "0x1" }], (r) => /^0x[0-9a-f]+$/.test(r)],
  ["eth_call", [{ to: "0x0000000000000000000000000000000000000000", data: "0x" }], (r) => typeof r === "string"],
  ["personal_sign", ["0x68656c6c6f", addr], (r) => /^0x[0-9a-f]+$/.test(r)],
  ["eth_signTypedData_v4", [addr, TYPED], (r) => /^0x[0-9a-f]+$/.test(r)],
  ["wallet_getPermissions", [], (r) => Array.isArray(r)],
  ["wallet_requestPermissions", [{ eth_accounts: {} }], (r) => Array.isArray(r)],
  ["wallet_switchEthereumChain", [{ chainId: "0x539" }], () => true],
  ["wallet_addEthereumChain", [{ chainId: "0x539" }], () => true],
  ["eth_feeHistory", ["0x2", "latest", [25, 75]], (r) => Array.isArray(r.baseFeePerGas)],
  ["eth_maxPriorityFeePerGas", [], (r) => /^0x[0-9a-f]+$/.test(r)],
  ["eth_getBlockByNumber", ["latest", false], (r) => r && /^0x[0-9a-f]+$/.test(r.number)],
  ["eth_getTransactionByHash", [hash0], (r) => r && r.hash],
  ["wallet_getCapabilities", [], (r) => typeof r === "object"],
  ["wallet_createSession", [], (r) => r && r.chainId && Array.isArray(r.accounts)],
  ["wallet_invokeMethod", [{ request: { method: "eth_chainId" } }], (r) => r === "0x539"],
];
let bad = 0;
for (const [m, args, ok] of checks) {
  try { const r = await p.request(m, args); console.log(`${ok(r) ? "OK " : "BAD"} ${m} -> ${iso(r) ? JSON.stringify(r).slice(0, 46) : r}`); if (!ok(r)) bad++; }
  catch (e) { console.log("ERR " + m + " " + e.message); bad++; }
}
const hash = await p.request("eth_sendTransaction", [{ to: addr, value: "0x2" }]);
await new Promise((r) => setTimeout(r, 500));
const rc = await p.request("eth_getTransactionReceipt", [hash]);
console.log(`${rc && rc.status === "success" ? "OK " : "BAD"} eth_sendTransaction + eth_getTransactionReceipt -> ${JSON.stringify(rc)}`);
if (!rc || rc.status !== "success") bad++;
console.log(bad ? `FAIL ${bad} methods` : `PASS all ${checks.length + 1} native methods`);
process.exit(bad ? 1 : 0);
