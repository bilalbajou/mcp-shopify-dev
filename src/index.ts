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

const SHOPIFY_STORE_DOMAIN = args["domain"]      || process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_SHOP;
const SHOPIFY_API_KEY      = args["api-key"]     || process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_SECRET_KEY   = args["secret-key"]  || process.env.SHOPIFY_SECRET_KEY || process.env.SHOPIFY_CLIENT_SECRET;
const SHOPIFY_ACCESS_TOKEN = args["access-token"] || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_STORE_DOMAIN) {
  console.error("Error: --domain is required (e.g. --domain your-store.myshopify.com)");
  console.error("       or set SHOPIFY_STORE_DOMAIN as an environment variable.");
  process.exit(1);
}

const hasClientIdSecret = SHOPIFY_API_KEY && SHOPIFY_SECRET_KEY;
const hasAccessToken = !!SHOPIFY_ACCESS_TOKEN;

if (!hasClientIdSecret && !hasAccessToken) {
  console.error("Error: You must provide either an Access Token (--access-token) OR both an API Key and Secret Key (--api-key and --secret-key).");
  console.error("       Alternatively, set SHOPIFY_ACCESS_TOKEN or SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET as environment variables.");
  process.exit(1);
}

// Ensure the domain has no protocol (e.g., store.myshopify.com)
const cleanDomain = SHOPIFY_STORE_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');

// 1. Initialize GraphQL Client
const API_VERSION = args["api-version"] || process.env.SHOPIFY_API_VERSION || "2026-01";

let cachedToken: string | null = hasAccessToken ? SHOPIFY_ACCESS_TOKEN : null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  // If we have a static token, or a dynamically fetched token that is still valid
  if (cachedToken && (hasAccessToken || Date.now() < tokenExpiresAt - 60_000)) {
    return cachedToken;
  }

  // Fetch token using client credentials grant
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: SHOPIFY_API_KEY as string,
    client_secret: SHOPIFY_SECRET_KEY as string,
  });

  const response = await fetch(
    `https://${cleanDomain}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify Auth: Token request failed with status ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedToken as string;
}

const shopifyClient = new GraphQLClient(
  `https://${cleanDomain}/admin/api/${API_VERSION}/graphql.json`,
  { 
    // We override fetch to dynamically resolve the access token before sending the request
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      headers.set("Content-Type", "application/json");
      headers.set("X-Shopify-Access-Token", token);
      
      return fetch(input, { ...init, headers });
    }
  }
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
