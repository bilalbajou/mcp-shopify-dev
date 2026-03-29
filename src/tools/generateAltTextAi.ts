import { z } from "zod";
import type { ShopifyTool } from "../lib/types.js";

const GenerateAltTextAiInputSchema = z.object({
  imageUrl: z.string().url().describe("The Shopify CDN image URL or any public image URL to analyze"),
});

type GenerateAltTextAiInput = z.infer<typeof GenerateAltTextAiInputSchema>;

export const generateAltTextAi: ShopifyTool = {
  name: "generate-alt-text-ai",
  description: "Downloads an image securely and passes its raw visual data directly into your LLM context. Once you receive the visual block from this tool, YOU (the LLM) must natively look at the image, generate highly optimized SEO alt text describing it, and optionally call update-product-media to save it.",
  schema: GenerateAltTextAiInputSchema,

  execute: async (input: GenerateAltTextAiInput) => {
    try {
      // Fetch the image dynamically
      const response = await fetch(input.imageUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const base64Data = Buffer.from(buffer).toString("base64");
      const mimeType = response.headers.get("content-type") || "image/jpeg";

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
            mimeType: mimeType,
          }
        ]
      };
    } catch (error: any) {
      throw new Error(`Vision proxy failed: ${error.message}`);
    }
  },
};
