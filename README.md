# MCP Shopify Dev

A Model Context Protocol (MCP) server that connects Claude (or any MCP-compatible LLM) directly to your Shopify store via the Admin GraphQL API.

Once running, you can manage your entire store through natural language — products, inventory, collections, media, and files — all from Claude.

---

## Features

| Category | Tools | Capabilities |
|---|---|---|
| **Products** | 8 | Create, read, update, delete products; manage variants and options |
| **Collections** | 2 | List all collections; fetch a single collection with its products |
| **Inventory** | 3 | Get inventory items and levels by location; set stock quantities |
| **Media** | 3 | Update/delete product media; compress images with sharp |
| **Files** | 2 | Browse Shopify Files section; rename files or update alt text |
| **AI** | 1 | Generate SEO alt text for product images using Claude's vision |

---

## Tool Reference

### Products

| Tool | Description |
|---|---|
| `create-product` | Create a new product with variants and options |
| `get-products` | List or search products by title, type, or date range |
| `get-product-by-id` | Fetch a single product by ID with full details |
| `update-product` | Update product fields (title, description, status, tags, etc.) |
| `delete-product` | Permanently delete a product |
| `manage-product-variants` | Create or update product variants and prices |
| `delete-product-variants` | Remove one or more variants from a product |
| `manage-product-options` | Add, update, reorder, or remove product options (Size, Color, etc.) |

### Collections

| Tool | Description |
|---|---|
| `get-collections` | List all collections with pagination |
| `get-collection-by-id` | Fetch a single collection and its products |

### Inventory

| Tool | Description |
|---|---|
| `get-inventory-items` | List inventory items for products |
| `get-inventory-levels` | Get stock levels per location |
| `inventory-set-quantities` | Set available or on-hand quantities at specific locations |

### Media

| Tool | Description |
|---|---|
| `update-product-media` | Update alt text on a product image |
| `delete-product-media` | Remove unused or old media from a product |
| `compress-product-media` | Compress product images with sharp, re-upload, and optionally replace the original with a file size savings report |

### Files

| Tool | Description |
|---|---|
| `get-files` | Browse and search files in Content → Files |
| `update-file` | Rename files and/or update alt text on any uploaded file |

### AI

| Tool | Description |
|---|---|
| `generate-alt-text-ai` | Streams a product image into Claude's vision context to generate SEO alt text — no extra API keys needed |

### Utility

| Tool | Description |
|---|---|
| `example-hello-world` | Test tool to verify MCP connectivity |

---

## Prerequisites

- **Node.js** 18+
- A **Shopify store** (any plan)
- **Claude Code** or any MCP-compatible client

---

## Setup

### 1. Install & Build

```bash
npm install
npm run build
```

### 2. Configure Authentication

Create a `.env` file at the project root (see `.env.example`):

**Option A — Custom App token (recommended)**

```env
SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
SHOPIFY_ADMIN_ACCESS_TOKEN="shpat_..."
```

**Option B — Traditional API Key / Secret**

```env
SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
SHOPIFY_API_KEY="your_api_key"
SHOPIFY_SECRET_KEY="your_secret_key"
```

You can also optionally override the API version:

```env
SHOPIFY_API_VERSION="2024-01"  # defaults to 2024-01 if omitted
```

### 3. Shopify App Scopes

Your custom app needs these scopes (Shopify Admin → Settings → Apps → Develop apps → Your App → Configuration):

| Scope | Used by |
|---|---|
| `read_products`, `write_products` | All product, variant, and media tools |
| `read_inventory`, `write_inventory` | Inventory tools |
| `read_files`, `write_files` | `get-files`, `update-file` |

---

## Connecting to Claude Code

Register the server from this project directory:

```bash
claude mcp add shopify-dev node "./dist/index.js"
```

Verify registration:

```bash
claude mcp list
```

Now in Claude Code you can say things like:

> "Use shopify-dev to list all my products"
> "Use shopify-dev to create a new product called 'Summer Tee' for $29.99"

---

## Development

```bash
npm run dev      # run with ts-node (no build step)
npm run build    # compile TypeScript → dist/
npm start        # run compiled output from dist/
```

### Testing with MCP Inspector

A visual UI for calling tools directly — no LLM needed:

```bash
npx @modelcontextprotocol/inspector node "./dist/index.js"
```

Opens at `http://localhost:5173` — select any tool, fill in inputs, and inspect raw JSON responses.

### End-to-end AI media workflow

In Claude Code:

> "Use shopify-dev to get my first product. Grab its first image URL and pass it to generate-alt-text-ai. Then use update-product-media to save the generated alt text back to the store."

---

## Adding a New Tool

Each tool is a single file in `src/tools/`. Follow this pattern:

```ts
import { z } from "zod";
import { gql } from "graphql-request";
import type { ShopifyTool } from "../lib/types.js";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const MySchema = z.object({
  // define inputs here
});

let shopifyClient: GraphQLClient;

export const myTool: ShopifyTool = {
  name: "my-tool",
  description: "What this tool does",
  schema: MySchema,
  initialize(client) { shopifyClient = client; },
  execute: async (input) => {
    try {
      const data = await shopifyClient.request(gql`...`, { ...input });
      checkUserErrors(data.someMutation.userErrors, "my operation");
      return { /* result */ };
    } catch (error) {
      handleToolError("my operation", error);
    }
  },
};
```

Then add it to the `tools` array in `src/tools/registry.ts`.

---

## Tech Stack

| Dependency | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | MCP server framework |
| `graphql-request` | GraphQL client for Shopify Admin API |
| `zod` | Input validation and schema generation |
| `sharp` | Image compression |
| `dotenv` | Environment variable loading |

---

## Troubleshooting

**"Store domain or API credentials are required"**
Make sure your `.env` file has the correct values and is in the project root.

**MCP server connects but tools return nothing**
Run `npm run build` again after making changes — the server runs from `dist/`.

**Image compression fails**
Ensure `sharp` native dependencies installed correctly. On Windows, try:
```bash
npm rebuild sharp
```

**Debug output appearing in responses**
All debug logging goes to `stderr`. If you see it in tool output, it's likely a misconfigured client.
