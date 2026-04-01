# mcp-shopify-dev

A Model Context Protocol (MCP) server that connects Claude (or any MCP-compatible client) directly to your Shopify store via the Admin GraphQL API.

Manage your entire store through natural language — products, inventory, collections, media, and files — all from Claude.

---

## Quick Start

```bash
claude mcp add shopify-dev npx mcp-shopify-dev \
  --domain your-store.myshopify.com \
  --api-key YOUR_API_KEY \
  --secret-key YOUR_SECRET_KEY
```

That's it. No install, no build step — just run it with `npx`.

---

## Features

| Category | Tools | Capabilities |
|---|---|---|
| **Products** | 8 | Create, read, update, delete products; manage variants and options |
| **Collections** | 2 | List all collections; fetch a single collection with its products |
| **Inventory** | 3 | Get inventory items and levels by location; set stock quantities |
| **Media** | 3 | Update/delete product media; compress images |
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
| `compress-product-media` | Compress product images, re-upload, and optionally replace the original — returns a file size savings report |

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
- A **Shopify store** with a custom app (any plan)
- **Claude Code** or any MCP-compatible client

---

## Setup

### 1. Create a Shopify Custom App

Go to your Shopify Admin → **Settings → Apps → Develop apps → Create an app**.

Grant the following API scopes under **Configuration**:

| Scope | Used by |
|---|---|
| `read_products`, `write_products` | All product, variant, and media tools |
| `read_inventory`, `write_inventory` | Inventory tools |
| `read_files`, `write_files` | `get-files`, `update-file` |

Install the app and copy your **API key** and **API secret key**.

### 2. Register with Claude Code

```bash
claude mcp add shopify-dev npx mcp-shopify-dev \
  --domain your-store.myshopify.com \
  --api-key YOUR_API_KEY \
  --secret-key YOUR_SECRET_KEY
```

Verify registration:

```bash
claude mcp list
```

### 3. Use it

Once registered, just talk to Claude naturally. Here are example prompts by scope:

**Products**
> "Use shopify-dev to list all my active products"
> "Use shopify-dev to create a new product called 'Summer Tee' with sizes S, M, L at $29.99"
> "Use shopify-dev to update the description and tags of product ID 12345"
> "Use shopify-dev to add a new variant 'XL / Black' at $34.99 to product ID 12345"
> "Use shopify-dev to delete all draft products older than 30 days"

**Collections**
> "Use shopify-dev to list all my collections"
> "Use shopify-dev to get collection ID 67890 and show me all its products"

**Inventory**
> "Use shopify-dev to check stock levels for all products at my main location"
> "Use shopify-dev to set the inventory of product ID 12345 to 50 units at location ID 99"
> "Use shopify-dev to find all products with 0 inventory"

**Media**
> "Use shopify-dev to compress all images on product ID 12345 and replace the originals"
> "Use shopify-dev to delete all media from product ID 12345 except the first image"
> "Use shopify-dev to update the alt text on image ID 67 to 'White cotton summer t-shirt'"

**Files**
> "Use shopify-dev to list all files in my Shopify Files section"
> "Use shopify-dev to rename file ID 88 to 'banner-summer-2026'"
> "Use shopify-dev to update the alt text of file ID 88 to 'Summer 2026 banner'"

**AI — Alt Text Generation**
> "Use shopify-dev to get my first product, grab its first image URL, generate SEO alt text with AI, then save it back to the store"
> "Use shopify-dev to generate alt text for this image URL: https://cdn.shopify.com/..."

---

---

## Development

Clone the repo and install dependencies:

```bash
git clone https://github.com/YOUR_USERNAME/mcp-shopify-dev.git
cd mcp-shopify-dev
npm install
npm run build
```

Run locally from the project directory:

```bash
claude mcp add shopify-dev node "./dist/index.js" \
  --domain your-store.myshopify.com \
  --api-key YOUR_KEY \
  --secret-key YOUR_SECRET
```

### Commands

```bash
npm run dev      # run with ts-node (no build step)
npm run build    # compile TypeScript → dist/
npm start        # run compiled output from dist/
```

### Test with MCP Inspector

A visual UI for calling tools directly — no LLM needed:

```bash
npx @modelcontextprotocol/inspector node "./dist/index.js" \
  --domain your-store.myshopify.com \
  --api-key YOUR_KEY \
  --secret-key YOUR_SECRET
```

Opens at `http://localhost:5173` — select any tool, fill in inputs, and inspect raw JSON responses.

### Adding a New Tool

Each tool is a single file in `src/tools/`. Follow this pattern:

```ts
import { z } from "zod";
import { gql } from "graphql-request";
import type { GraphQLClient } from "graphql-request";
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

Then import and add it to the `tools` array in `src/tools/registry.ts`.

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

**"--api-key and --secret-key are both required"**
Pass them as CLI flags or set `SHOPIFY_API_KEY` / `SHOPIFY_SECRET_KEY` in your environment.

**MCP server connects but tools return nothing**
Run `npm run build` again after making changes — the server runs from `dist/`.

**Image compression fails**
Ensure `sharp` native dependencies installed correctly. On Windows:
```bash
npm rebuild sharp
```

**Debug output appearing in responses**
All debug logging goes to `stderr`. If you see it in tool output, it's likely a misconfigured client.
