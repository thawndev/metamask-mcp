// Minimal MCP stdio client used by the verify scripts.
// Usage: node scripts/mcp-call.mjs <tool|--list> [jsonArgs]
import { spawn } from "node:child_process";

const [, , tool, argsJson] = process.argv;
const args = argsJson ? JSON.parse(argsJson) : {};
const child = spawn(process.execPath, ["dist/cli.js", "serve"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env,
});

let buf = "";
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});
function send(m) {
  child.stdin.write(JSON.stringify(m) + "\n");
}
function call(method, params) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((res) => {
    pending.set(id, res);
    send({ jsonrpc: "2.0", id, method, params });
  });
}
function notify(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

const hard = setTimeout(() => {
  process.stderr.write("mcp-call: timeout\n");
  child.kill("SIGKILL");
  process.exit(3);
}, 150000);

await call("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "verify", version: "0" },
});
notify("notifications/initialized", {});

const res =
  tool === "--list"
    ? await call("tools/list", {})
    : await call("tools/call", { name: tool, arguments: args });

process.stdout.write(JSON.stringify(res) + "\n");
clearTimeout(hard);
child.stdin.end();
child.kill("SIGTERM");
setTimeout(() => process.exit(0), 300);
