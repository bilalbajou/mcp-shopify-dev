#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { GraphQLClient } from "graphql-request";

import { tools } from "./tools/registry.js";

// Load environment variables from .env if present
dotenv.config();

// Authentication Keys (Shopify Custom App API Key and Secret Key, and Store Domain)
// NOTE: For Shopify Admin API via custom apps, you usually use the Admin API access token (shpat_...). 
// If your authentication specifically requires sending the API key and secret, you would handle the auth flow here.
// For standard GraphQL access, an Admin Access Token is passed in headers. 
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // e.g., your-store.myshopify.com

// Allow modern Admin Access Tokens, OR traditional API Key + Secret Key combos
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_SECRET_KEY = process.env.SHOPIFY_SECRET_KEY;

if (!SHOPIFY_STORE_DOMAIN) {
  console.error("Critical Error: SHOPIFY_STORE_DOMAIN must be provided via environment variables.");
  process.exit(1);
}

if (!SHOPIFY_ADMIN_ACCESS_TOKEN && (!SHOPIFY_API_KEY || !SHOPIFY_SECRET_KEY)) {
  console.error("Critical Error: You must provide either SHOPIFY_ADMIN_ACCESS_TOKEN, or both SHOPIFY_API_KEY and SHOPIFY_SECRET_KEY.");
  process.exit(1);
}

// 1. Initialize GraphQL Client
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";

// Safely generate the correct headers based on what keys the user provided
const headers: Record<string, string> = {
  "Content-Type": "application/json",
};

if (SHOPIFY_API_KEY && SHOPIFY_SECRET_KEY) {
  // Use Basic Auth for traditional Private Apps
  const credentials = Buffer.from(`${SHOPIFY_API_KEY}:${SHOPIFY_SECRET_KEY}`).toString("base64");
  headers["Authorization"] = `Basic ${credentials}`;
} else if (SHOPIFY_ADMIN_ACCESS_TOKEN) {
  // Use X-Shopify-Access-Token for Custom Apps
  headers["X-Shopify-Access-Token"] = SHOPIFY_ADMIN_ACCESS_TOKEN;
}

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
