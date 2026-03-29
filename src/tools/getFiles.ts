import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const GetFilesInputSchema = z.object({
  first: z.number().int().min(1).max(250).default(50).describe("Number of files to fetch (max 250)"),
  query: z.string().optional().describe("Filter files by filename or tag, e.g. 'banner' or 'filename:hero*'"),
  after: z.string().optional().describe("Cursor for pagination (endCursor from a previous response)"),
});

type GetFilesInput = z.infer<typeof GetFilesInputSchema>;

let shopifyClient: GraphQLClient;

export const getFiles: ShopifyTool = {
  name: "get-files",
  description: "List files from the Shopify Files section (Content → Files). Includes images used in themes, banners, and section assets. Supports filtering by filename.",
  schema: GetFilesInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetFilesInput) => {
    try {
      const query = gql`
        #graphql
        query getFiles($first: Int!, $query: String, $after: String) {
          files(first: $first, query: $query, after: $after) {
            edges {
              node {
                ... on MediaImage {
                  id
                  alt
                  createdAt
                  image {
                    url
                    width
                    height
                  }
                }
                ... on GenericFile {
                  id
                  alt
                  url
                  createdAt
                }
                ... on Video {
                  id
                  alt
                  createdAt
                  sources {
                    url
                    mimeType
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, {
        first: input.first,
        query: input.query ?? null,
        after: input.after ?? null,
      })) as any;

      const files = data.files.edges.map((edge: any) => edge.node);

      return {
        files,
        pageInfo: data.files.pageInfo,
        count: files.length,
      };
    } catch (error) {
      handleToolError("get files", error);
    }
  },
};
