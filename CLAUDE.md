# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript → dist/
npm run dev        # Run directly with ts-node (no build required)
npm start          # Run compiled output from dist/
```

There are no test scripts. Use the MCP registration command to verify a working build:
```bash
claude mcp add shopify-dev "node" "./dist/index.js"
```

## Architecture

This is a **Model Context Protocol (MCP) server** that exposes Shopify Admin GraphQL API operations as tools consumable by Claude or any MCP-compatible LLM client. It uses the `@modelcontextprotocol/sdk` and communicates over **stdio transport** — meaning once the server starts, all `stdout` is owned by the MCP protocol. Use `console.error` for any debug output.

### Request Flow

1. `src/index.ts` — Entry point. Parses CLI flags (taking precedence over env vars), creates a `GraphQLClient` pointed at `https://{SHOPIFY_STORE_DOMAIN}/admin/api/{API_VERSION}/graphql.json`, instantiates `McpServer`, then iterates `tools` from the registry. For each tool it calls `tool.initialize(shopifyClient)` (if defined) and registers the tool handler with `server.registerTool(...)`. Errors returned to the MCP client are sanitized via `sanitizeError()` to strip internal file paths.
2. `src/tools/registry.ts` — Single export `tools: ShopifyTool[]`. Add new tools here.
3. `src/tools/*.ts` — Individual tool modules. Each exports a `ShopifyTool` object. Domains covered include Products, Collections, Orders, Inventory, Themes, Analytics, Files, and Media.
4. `src/lib/types.ts` — The `ShopifyTool` interface and shared Shopify connection/edge types (`ShopifyConnection`, `ShopifyEdge`, `ShopifyMoney`, `ShopifyUserError`). Also re-exports the utility functions.
5. `src/lib/toolUtils.ts` — Shared helpers: `checkUserErrors`, `handleToolError`, `edgesToNodes`, `shopMoney`. Import from here in tool files.

### Adding a New Tool

Follow the pattern in `src/tools/exampleTool.ts` (no Shopify client needed) or `src/tools/createProduct.ts` (requires client):

```ts
import { z } from "zod";
import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import type { ShopifyTool } from "../lib/types.js";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const MySchema = z.object({ /* ... */ });
type MyInput = z.infer<typeof MySchema>;

let shopifyClient: GraphQLClient;

export const myTool: ShopifyTool = {
  name: "my-tool-name",
  description: "...",
  schema: MySchema,
  initialize(client) { shopifyClient = client; },
  execute: async (input: MyInput) => {
    try {
      const data = await shopifyClient.request(gql`...`, { ...input });
      checkUserErrors(data.someMutation.userErrors, "my operation");
      return { ... };
    } catch (error) {
      handleToolError("my operation", error);
    }
  },
};
```

Then import and add to the `tools` array in `src/tools/registry.ts`.

### Key Conventions

- **Error handling**: Always use `checkUserErrors` after mutations (throws on `userErrors`), then `handleToolError` in the catch block. This prevents the double-wrapping bug where errors get prefixed with "Failed to X: Failed to X:".
- **Module imports**: All local imports must use the `.js` extension (NodeNext module resolution).
- **Tool result format**: Return plain objects from `execute`. The server in `index.ts` wraps them in `{ content: [{ type: "text", text: JSON.stringify(result) }] }`. Exception: if your tool returns `{ content: [...] }` directly (e.g. image content blocks for vision tools like `generateAltTextAi`), the server passes it through as-is.
- **`initialize` is optional**: Tools that don't call the Shopify API (e.g. `exampleTool`, `generateAltTextAi`) omit `initialize`. Only include it when you need a `GraphQLClient` reference.
- **Image processing**: `sharp` is available as a dependency (used in `compressProductMedia`) for resizing/compressing images server-side before uploading.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | Yes | e.g. `your-store.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | One of the two auth options | Modern custom app token (`shpat_...`) |
| `SHOPIFY_API_KEY` + `SHOPIFY_SECRET_KEY` | One of the two auth options | Traditional private app Basic Auth |
| `SHOPIFY_API_VERSION` | No | Defaults to `2026-01` |

CLI flags mirror the env vars and take precedence: `--domain`, `--access-token`, `--api-key`, `--secret-key`, `--api-version`.
