import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const UpsertThemeFileInputSchema = z.object({
  themeId: z
    .string()
    .describe("Theme GID, e.g. gid://shopify/OnlineStoreTheme/123. Use get-themes to find it. Prefer a DEVELOPMENT theme to avoid affecting the live store."),
  filename: z
    .string()
    .describe(
      "File path in the theme. e.g. 'sections/custom-hero.liquid', 'snippets/my-card.liquid', 'assets/custom.css'. File is created if it doesn't exist, or overwritten if it does."
    ),
  content: z
    .string()
    .describe("Full file content to write. For Liquid sections, include the complete {% schema %} block."),
});

type UpsertThemeFileInput = z.infer<typeof UpsertThemeFileInputSchema>;

let shopifyClient: GraphQLClient;

export const upsertThemeFile: ShopifyTool = {
  name: "upsert-theme-file",
  description:
    "Create or overwrite a file in a Shopify theme. Use this to deploy a generated Liquid section, snippet, CSS, or JSON template. Always prefer a DEVELOPMENT theme. Use generate-liquid-section to build the content first, then call this tool to upload it.",
  schema: UpsertThemeFileInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: UpsertThemeFileInput) => {
    try {
      const mutation = gql`
        #graphql
        mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
          themeFilesUpsert(themeId: $themeId, files: $files) {
            upsertedThemeFiles {
              filename
              size
              updatedAt
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      const data = (await shopifyClient.request(mutation, {
        themeId: input.themeId,
        files: [
          {
            filename: input.filename,
            body: {
              type: "TEXT",
              value: input.content,
            },
          },
        ],
      })) as {
        themeFilesUpsert: {
          upsertedThemeFiles: any[];
          userErrors: Array<{ field: string; message: string; code: string }>;
        };
      };

      checkUserErrors(data.themeFilesUpsert.userErrors, "upsert theme file");

      const upserted = data.themeFilesUpsert.upsertedThemeFiles[0];

      return {
        success: true,
        file: upserted
          ? {
            filename: upserted.filename,
            size: upserted.size,
            updatedAt: upserted.updatedAt,
          }
          : null,
        message: `File '${input.filename}' successfully written to theme ${input.themeId}.`,
      };
    } catch (error) {
      handleToolError("upsert theme file", error);
    }
  },
};
