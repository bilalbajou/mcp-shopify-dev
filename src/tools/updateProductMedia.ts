import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const UpdateProductMediaInputSchema = z.object({
  productId: z.string().describe("The product ID (e.g. gid://shopify/Product/123)"),
  mediaId: z.string().describe("The specific media ID to update (e.g. gid://shopify/MediaImage/456)"),
  alt: z.string().describe("The new alt text to apply to this media"),
});

type UpdateProductMediaInput = z.infer<typeof UpdateProductMediaInputSchema>;

let shopifyClient: GraphQLClient;

export const updateProductMedia: ShopifyTool = {
  name: "update-product-media",
  description: "Updates the alt text of an existing media item on a Shopify product",
  schema: UpdateProductMediaInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: UpdateProductMediaInput) => {
    try {
      const productId = input.productId.startsWith("gid://")
        ? input.productId
        : `gid://shopify/Product/${input.productId}`;
      
      const mediaId = input.mediaId.startsWith("gid://")
        ? input.mediaId
        : `gid://shopify/MediaImage/${input.mediaId}`;

      const query = gql`
        #graphql

        mutation productUpdateMedia($media: [UpdateMediaInput!]!, $productId: ID!) {
          productUpdateMedia(media: $media, productId: $productId) {
            media {
              ... on MediaImage {
                id
                alt
                image {
                  url
                }
              }
              ... on Video {
                id
                alt
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        productId,
        media: [
          {
            id: mediaId,
            alt: input.alt,
          }
        ]
      };

      const data = (await shopifyClient.request(query, variables)) as any;
      
      checkUserErrors(data.productUpdateMedia.userErrors, "update product media");

      const successMedia = data.productUpdateMedia?.media?.[0];

      return {
        updatedMedia: successMedia,
        status: "success"
      };
    } catch (error) {
      handleToolError("update product media", error);
    }
  },
};
