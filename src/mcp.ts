import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

export const VERSION = "0.1.0";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "metamask-mcp", version: VERSION },
    {
      instructions:
        "Unofficial Ethereum wallet MCP server. Talks to an EVM chain over JSON-RPC with an in-process signer. " +
        "Reads are safe; signing and sending are two-phase (wallet_inspect_* then the matching execute). " +
        "Not affiliated with or endorsed by MetaMask or Consensys.",
    },
  );
  registerTools(server);
  return server;
}

export async function serveStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
