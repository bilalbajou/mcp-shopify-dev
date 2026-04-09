import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const GetThemeFilesInputSchema = z.object({
  themeId: z
    .string()
    .describe("Theme GID, e.g. gid://shopify/OnlineStoreTheme/123. Use get-themes to find it."),
  prefix: z
    .string()
    .optional()
    .describe(
      "Filter files by path prefix (client-side). e.g. 'sections/', 'snippets/', 'templates/', 'assets/', 'layout/'"
    ),
  first: z.number().int().min(1).max(250).default(100),
  after: z.string().optional().describe("Cursor for pagination"),
});

type GetThemeFilesInput = z.infer<typeof GetThemeFilesInputSchema>;

let shopifyClient: GraphQLClient;

export const getThemeFiles: ShopifyTool = {
  name: "get-theme-files",
  description:
    "List files in a Shopify theme. Use the prefix filter to scope results (e.g. 'sections/' to see all liquid sections). Returns filenames needed to read or update specific files.",
  schema: GetThemeFilesInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetThemeFilesInput) => {
    try {
      const query = gql`
        #graphql
        query GetThemeFiles($themeId: ID!, $first: Int!, $after: String) {
          theme(id: $themeId) {
            id
            name
            role
            files(first: $first, after: $after) {
              nodes {
                filename
                size
                contentType
                updatedAt
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, {
        themeId: input.themeId,
        first: input.first,
        after: input.after ?? null,
      })) as { theme: any };

      if (!data.theme) {
        throw new Error(`Theme not found: ${input.themeId}`);
      }

      let files: any[] = data.theme.files.nodes;

      if (input.prefix) {
        files = files.filter((f: any) => f.filename.startsWith(input.prefix!));
      }

      return {
        themeId: data.theme.id,
        themeName: data.theme.name,
        themeRole: data.theme.role,
        files: files.map((f: any) => ({
          filename: f.filename,
          size: f.size,
          contentType: f.contentType,
          updatedAt: f.updatedAt,
        })),
        count: files.length,
        pageInfo: data.theme.files.pageInfo,
      };
    } catch (error) {
      handleToolError("get theme files", error);
    }
  },
};
