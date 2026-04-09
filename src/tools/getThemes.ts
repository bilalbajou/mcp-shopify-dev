import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const GetThemesInputSchema = z.object({
  roles: z
    .array(z.enum(["MAIN", "DEVELOPMENT", "UNPUBLISHED", "DEMO", "ARCHIVED"]))
    .optional()
    .describe("Filter by theme roles. Omit to return all themes."),
});

type GetThemesInput = z.infer<typeof GetThemesInputSchema>;

let shopifyClient: GraphQLClient;

export const getThemes: ShopifyTool = {
  name: "get-themes",
  description:
    "List all themes in the store. Returns theme IDs (required for other theme file tools), names, and roles. MAIN is the live published theme; DEVELOPMENT themes are safe for editing.",
  schema: GetThemesInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetThemesInput) => {
    try {
      const query = gql`
        #graphql
        query GetThemes($roles: [ThemeRole!]) {
          themes(first: 20, roles: $roles) {
            nodes {
              id
              name
              role
              createdAt
              updatedAt
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, {
        roles: input.roles ?? null,
      })) as { themes: { nodes: any[] } };

      return {
        themes: data.themes.nodes.map((t) => ({
          id: t.id,
          name: t.name,
          role: t.role,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      };
    } catch (error) {
      handleToolError("get themes", error);
    }
  },
};
