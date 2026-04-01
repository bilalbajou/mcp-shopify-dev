#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { GraphQLClient } from "graphql-request";

import { tools } from "./tools/registry.js";

// Load .env file if present (local development fallback)
dotenv.config();

// Parse CLI flags: --domain, --api-key, --secret-key, --api-version
// CLI args take priority over environment variables.
function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1];
      if (!value.startsWith("--")) {
        result[key] = value;
        i++;
      }
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));

const SHOPIFY_STORE_DOMAIN = args["domain"]      || process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_API_KEY      = args["api-key"]     || process.env.SHOPIFY_API_KEY;
const SHOPIFY_SECRET_KEY   = args["secret-key"]  || process.env.SHOPIFY_SECRET_KEY;

if (!SHOPIFY_STORE_DOMAIN) {
  console.error("Error: --domain is required (e.g. --domain your-store.myshopify.com)");
  console.error("       or set SHOPIFY_STORE_DOMAIN as an environment variable.");
  process.exit(1);
}

if (!SHOPIFY_API_KEY || !SHOPIFY_SECRET_KEY) {
  console.error("Error: --api-key and --secret-key are both required.");
  console.error("       or set SHOPIFY_API_KEY and SHOPIFY_SECRET_KEY as environment variables.");
  process.exit(1);
}

// 1. Initialize GraphQL Client
const API_VERSION = args["api-version"] || process.env.SHOPIFY_API_VERSION || "2026-01";

const credentials = Buffer.from(`${SHOPIFY_API_KEY}:${SHOPIFY_SECRET_KEY}`).toString("base64");
const headers: Record<string, string> = {
  "Content-Type": "application/json",
  "Authorization": `Basic ${credentials}`,
};

const shopifyClient = new GraphQLClient(
  `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
  { headers }
);

// 2. Set up the core MCP server
const server = new McpServer({
  name: "mcp-shopify-dev",
  version: "1.0.0",
  description: "Custom Shopify MCP Server",
});

// Strips absolute file paths and Node internals from error messages before
// returning them to the MCP client, so internal project structure is not leaked.
function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Za-z]:[/\\][^\s,)]+/g, "<path>")       // Windows absolute paths
    .replace(/\/(?:[\w.-]+\/)+[^\s,)]*/g, "<path>")      // Unix absolute paths
    .replace(/file:\/\/[^\s,)]*/g, "<path>")              // file:// URLs
    .replace(/node:[^\s,)]*/g, "<node_internal>");        // Node.js internal refs
}

// 3. Dynamically register all tools from the registry
for (const tool of tools) {
  if (tool.initialize) {
    tool.initialize(shopifyClient);
  }

  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.schema.shape },
    async (args: any) => {
      try {
        const result = await tool.execute(args);

        // If the tool natively formats its own MCP complex content block (like images!), pass it directly.
        if (result && Array.isArray(result.content)) {
          return { content: result.content };
        }

        // Standard stringified text block fallback
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Tool Execution Failed: ${sanitizeError(error)}` }],
          isError: true,
        };
      }
    }
  );
}

// 4. Start the Stdio Transport Server
// IMPORTANT: Once StdioServerTransport is active, all stdout (console.log) is capturing by the MCP protocol.
// Do not use `console.log` for debugging. Use `console.error` to print to stderr.
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-shopify-dev Server connected successfully to Stdio.");
}

main().catch((error) => {
  console.error("Failed to start MCP Server:", error);
});
