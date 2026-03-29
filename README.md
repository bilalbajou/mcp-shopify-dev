# MCP Shopify Dev

A custom-built Model Context Protocol (MCP) server that connects Claude Code directly to your Shopify store via the GraphQL Admin API.

## Features

### Products
- Full CRUD — create, read, update, delete products
- Fetch filtered products by `productType` and creation date range
- Manage product variants (create, update, delete) and product options

### Collections
- List all collections with pagination
- Fetch a single collection by ID including its products

### Inventory
- Get inventory items and levels by location
- Set inventory quantities at specific locations

### Media (Products)
- Update alt text on product images
- Delete product media
- **Compress product images** — download, compress with sharp, re-upload, and optionally replace the original with file size savings report

### Files (Theme & General Media)
- List and search files from the Shopify Files section (Content → Files)
- **Rename files** and/or update alt text on any uploaded file — theme banners, section images, etc.

### AI Tools
- `generate-alt-text-ai` — streams a product image directly from the Shopify CDN into Claude's vision context and generates SEO alt text, no extra API keys required

---

## Setup

### 1. Configure Authentication

Create a `.env` file at the project root based on `.env.example`.

**Option A — Modern Custom App (recommended)**
```env
SHOPIFY_ADMIN_ACCESS_TOKEN="shpat_..."
SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
```

**Option B — Traditional API Key**
```env
SHOPIFY_API_KEY="your_api_key"
SHOPIFY_SECRET_KEY="your_secret_key"
SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
```

### 2. Required Shopify App Scopes

In Shopify Admin → Settings → Apps → Develop apps → Your App → Configuration:

| Scope | Required for |
|---|---|
| `read_products`, `write_products` | All product, variant, media tools |
| `read_inventory`, `write_inventory` | Inventory tools |
| `read_files`, `write_files` | `get-files`, `update-file` |

### 3. Install & Build

```bash
npm install
npm run build
```

---

## Connecting to Claude Code

Register the server once from this directory:

```bash
claude mcp add shopify-dev node "./dist/index.js"
```

Verify it's registered:

```bash
claude mcp list
```

---

## Testing

**MCP Inspector** (visual UI, no LLM needed):
```bash
npx @modelcontextprotocol/inspector node "./dist/index.js"
```

Opens at `http://localhost:5173` — call any tool directly and inspect raw JSON responses.

**Quick sanity check in Claude Code:**
> "Use shopify-dev to call example-hello-world with name 'test'"

**End-to-end AI media workflow:**
> "Use shopify-dev to get my first product. Grab its first image URL and pass it to generate-alt-text-ai. Then use update-product-media to save the generated alt text back to the store."
