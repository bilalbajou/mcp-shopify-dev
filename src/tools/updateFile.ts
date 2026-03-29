import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const UpdateFileInputSchema = z.object({
  id: z.string().describe("The file GID (e.g. gid://shopify/MediaImage/123 or gid://shopify/GenericFile/123)"),
  filename: z.string().optional().describe("New filename to rename the file to (e.g. 'hero-banner-summer.jpg')"),
  alt: z.string().optional().describe("New alt text for the file"),
}).refine(
  (data) => data.filename !== undefined || data.alt !== undefined,
  { message: "At least one of 'filename' or 'alt' must be provided" }
);

type UpdateFileInput = z.infer<typeof UpdateFileInputSchema>;

let shopifyClient: GraphQLClient;

export const updateFile: ShopifyTool = {
  name: "update-file",
  description: "Rename a file and/or update its alt text in the Shopify Files section (Content → Files). Works for theme images, banners, and any general uploaded media.",
  schema: UpdateFileInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: UpdateFileInput) => {
    try {
      const fileId = input.id.startsWith("gid://")
        ? input.id
        : `gid://shopify/MediaImage/${input.id}`;

      const mutation = gql`
        #graphql
        mutation fileUpdate($files: [FileUpdateInput!]!) {
          fileUpdate(files: $files) {
            files {
              ... on MediaImage {
                id
                alt
                image {
                  url
                }
              }
              ... on GenericFile {
                id
                alt
                url
              }
              ... on Video {
                id
                alt
              }
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      const fileInput: Record<string, unknown> = { id: fileId };
      if (input.filename !== undefined) fileInput.filename = input.filename;
      if (input.alt !== undefined) fileInput.alt = input.alt;

      const data = (await shopifyClient.request(mutation, {
        files: [fileInput],
      })) as any;

      checkUserErrors(data.fileUpdate.userErrors, "update file");

      const updatedFile = data.fileUpdate.files[0];

      return {
        file: updatedFile,
        status: "success",
      };
    } catch (error) {
      handleToolError("update file", error);
    }
  },
};
