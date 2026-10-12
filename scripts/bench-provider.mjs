// Native EIP-1193 provider surface benchmark (local-signer mode, real chain, test coins).
import { LocalProvider } from "../dist/wallet/localProvider.js";
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const RPC = process.env.MM_RPC_URL || "http://127.0.0.1:8545";
const p = new LocalProvider(KEY, RPC, 1337);
const addr = (await p.request("eth_accounts"))[0];
const TYPED = { types:{Person:[{name:"name",type:"string"}]}, primaryType:"Person", domain:{name:"mm",version:"1",chainId:1337}, message:{name:"x"} };
const calls = [
  ["eth_accounts", []], ["eth_chainId", []], ["net_version", []], ["eth_blockNumber", []],
  ["eth_getBalance", [addr]], ["eth_getTransactionCount", [addr]], ["eth_getCode", [addr]],
  ["eth_gasPrice", []], ["eth_estimateGas", [{ to: addr, value: "0x1" }]],
  ["eth_call", [{ to: "0x0000000000000000000000000000000000000000", data: "0x" }]],
  ["personal_sign", ["0x68656c6c6f", addr]], ["eth_signTypedData_v4", [addr, TYPED]],
  ["wallet_getPermissions", []],
];
const rows = [];
for (const [m, args] of calls) {
  const times = [];
  for (let i = 0; i < 4; i++) { const t = process.hrtime.bigint(); await p.request(m, args); times.push(Number(process.hrtime.bigint() - t) / 1e6); }
  const warm = times.slice(1).sort((a, b) => a - b);
  rows.push({ method: m, cold_ms: +times[0].toFixed(2), warm_p50_ms: +warm[Math.floor(warm.length / 2)].toFixed(2) });
}
// write path
{
  const t = process.hrtime.bigint();
  const hash = await p.request("eth_sendTransaction", [{ to: addr, value: "0x1" }]);
  await new Promise((r) => setTimeout(r, 400));
  const rc = await p.request("eth_getTransactionReceipt", [hash]);
  if (!rc || rc.status !== "success") throw new Error("write path receipt not success");
  rows.push({ method: "eth_sendTransaction+receipt", cold_ms: +(Number(process.hrtime.bigint() - t) / 1e6).toFixed(1), warm_p50_ms: 0 });
}
import fs from "node:fs";
fs.mkdirSync(".agents/run", { recursive: true });
fs.writeFileSync(".agents/run/bench-provider.json", JSON.stringify(rows, null, 2));
for (const r of rows) console.log(`${r.method.padEnd(34)} cold=${String(r.cold_ms).padStart(7)}ms warm_p50=${String(r.warm_p50_ms).padStart(6)}ms`);
