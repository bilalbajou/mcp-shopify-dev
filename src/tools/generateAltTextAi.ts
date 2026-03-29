import { z } from "zod";
import type { ShopifyTool } from "../lib/types.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const GenerateAltTextAiInputSchema = z.object({
  imageUrl: z.url().describe("A cdn.shopify.com image URL to analyze"),
});

type GenerateAltTextAiInput = z.infer<typeof GenerateAltTextAiInputSchema>;

export const generateAltTextAi: ShopifyTool = {
  name: "generate-alt-text-ai",
  description: "Downloads an image securely from the Shopify CDN and passes its raw visual data directly into your LLM context. Once you receive the visual block from this tool, YOU (the LLM) must natively look at the image, generate highly optimized SEO alt text describing it, and optionally call update-product-media to save it.",
  schema: GenerateAltTextAiInputSchema,

  execute: async (input: GenerateAltTextAiInput) => {
    try {
      // 1. Enforce cdn.shopify.com strictly
      const parsed = new URL(input.imageUrl);
      if (parsed.hostname !== "cdn.shopify.com") {
        throw new Error(`Blocked: imageUrl must be hosted on cdn.shopify.com (got '${parsed.hostname}')`);
      }

      // 2. HEAD request to validate Content-Length and Content-Type before downloading
      const head = await fetch(input.imageUrl, { method: "HEAD" });

      const contentLength = head.headers.get("content-length");
      if (contentLength !== null && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
        throw new Error(`Blocked: image exceeds the 5 MB size limit (reported ${contentLength} bytes)`);
      }

      const contentType = head.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) {
        throw new Error(`Blocked: expected an image/* content type, got '${contentType}'`);
      }

      // 3. Fetch the image body
      const response = await fetch(input.imageUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch image from CDN: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();

      if (buffer.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(`Blocked: image body exceeds the 5 MB size limit (${buffer.byteLength} bytes)`);
      }

      const base64Data = Buffer.from(buffer).toString("base64");
      const mimeType = contentType.split(";")[0].trim();

      // Return raw natively formatted MCP content blocks containing the base64 vision data
      return {
        content: [
          {
            type: "text",
            text: "Image successfully downloaded and attached to your visual context below. Please analyze it natively and generate the optimized alt text for the user now.",
          },
          {
            type: "image",
            data: base64Data,
            mimeType,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Vision proxy failed: ${error.message}`);
    }
  },
};
