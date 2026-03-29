# 🛍️ MCP Shopify Dev

A robust, custom-built Model Context Protocol (MCP) server that seamlessly connects powerful local LLMs (like Claude Code) directly to your Shopify store via the GraphQL Admin API.

Unlike basic integrations, this server has been architected from scratch to handle everything from advanced product creation to full AI-powered visual SEO generation using isolated data proxies.

## 🚀 Features Supported

- **📦 Products Management:** Full CRUD interface for products. Fetch intelligently filtered products using custom categories (`productType`) and creation date boundaries (`add_date_min`/`max`).
- **📂 Collections:** Iterate through entire catalog collections and automatically paginate through their attached product hierarchies.
- **🖼️ Custom Media Operations:** Create and aggressively prune external images. Dynamically edit the SEO `alt` tags of physical CDN files natively.
- **🤖 AI Visual Proxies:** Equipped with a state-of-the-art vision proxy (`generate-alt-text-ai`) that securely streams real images natively from the Shopify CDN straight into Claude's context without requiring duplicate API keys or paid SDK backends.
- **🏭 Inventory Logic:** Update specific warehouse inventory counts by safely abstracting underlying Inventory ID lookups via Locations and Levels mapping.

---

## 🛠️ Setup Instructions

### 1. Configure Authentication
Create a `.env` file at the root of this project folder based on the included `.env.example`.

You can authenticate in two primary ways depending on your store setup:

**Option A: Modern Custom Apps (Recommended)**
Inside Shopify Admin, go to App Settings > Develop Apps > Add App > give it Read/Write permissions for Products and Inventory, and install it. Use the provided Admin Access Token.
```env
SHOPIFY_ADMIN_ACCESS_TOKEN="shpat_..."
SHOPIFY_STORE_DOMAIN="your-store-name.myshopify.com"
```

**Option B: Traditional API Key Authentication**
If you have a historic Private app or require standard HTTP Basic verification using key pairs:
```env
SHOPIFY_API_KEY="your_api_key_here"
SHOPIFY_SECRET_KEY="your_secret_password_here"
SHOPIFY_STORE_DOMAIN="your-store-name.myshopify.com"
```

### 2. Install & Build
The project uses strict type-safe TypeScript models paired to `zod` parameter schemas.

```bash
npm install
npm run build
```

---

## 🔌 Connecting to Claude Code!

You can natively mount this server into Anthropic's `claude` CLI, permanently boosting your Claude instance with total control over your Shopify interface.

From this directory, run the generic linkage command:
```bash
claude mcp add shopify-dev "node" "./dist/index.js"
```

### Example Verification Prompt
Once Claude Code is running, you can throw advanced, highly-contextual demands into the shell like:
> *"Use the Shopify MCP to grab the first Product you have. Check if it has any Images. If it does, grab the first Image URL and pass it to your `generate-alt-text-ai` tool to physically see it. After you generate a good Alt Text based on what you see in the photo, automatically append it securely back to the store using `update-product-media`!"*
