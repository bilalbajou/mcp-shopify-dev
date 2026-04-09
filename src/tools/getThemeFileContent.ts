import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const GetThemeFileContentInputSchema = z.object({
  themeId: z
    .string()
    .describe("Theme GID, e.g. gid://shopify/OnlineStoreTheme/123. Use get-themes to find it."),
  filename: z
    .string()
    .describe(
      "Exact file path in the theme, e.g. 'sections/hero-banner.liquid', 'snippets/card-product.liquid', 'config/settings_schema.json'"
    ),
});

type GetThemeFileContentInput = z.infer<typeof GetThemeFileContentInputSchema>;

let shopifyClient: GraphQLClient;

export const getThemeFileContent: ShopifyTool = {
  name: "get-theme-file-content",
  description:
    "Read the full source code of a single theme file (Liquid, JSON, CSS, JS). Use get-theme-files first to discover filenames. Useful for reading an existing section before editing or to understand theme patterns.",
  schema: GetThemeFileContentInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetThemeFileContentInput) => {
    try {
      const query = gql`
        #graphql
        query GetThemeFileContent($themeId: ID!, $filename: String!) {
          theme(id: $themeId) {
            id
            name
            files(filenames: [$filename], first: 1) {
              nodes {
                filename
                size
                contentType
                checksumMd5
                createdAt
                updatedAt
                body {
                  ... on OnlineStoreThemeFileBodyText {
                    content
                  }
                  ... on OnlineStoreThemeFileBodyUrl {
                    url
                  }
                  ... on OnlineStoreThemeFileBodyBase64 {
                    contentBase64
                  }
                }
              }
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, {
        themeId: input.themeId,
        filename: input.filename,
      })) as { theme: any };

      if (!data.theme) {
        throw new Error(`Theme not found: ${input.themeId}`);
      }

      const file = data.theme.files.nodes[0];

      if (!file) {
        throw new Error(
          `File not found: '${input.filename}' in theme ${input.themeId}. Use get-theme-files to list available files.`
        );
      }

      return {
        themeId: data.theme.id,
        themeName: data.theme.name,
        filename: file.filename,
        contentType: file.contentType,
        size: file.size,
        checksumMd5: file.checksumMd5,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        content: file.body?.content ?? null,
        url: file.body?.url ?? null,
        contentBase64: file.body?.contentBase64 ?? null,
      };
    } catch (error) {
      handleToolError("get theme file content", error);
    }
  },
};
