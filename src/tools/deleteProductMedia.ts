import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const DeleteProductMediaInputSchema = z.object({
  productId: z.string().describe("The product ID (e.g. gid://shopify/Product/123) from which to delete media"),
  mediaIds: z.array(z.string()).min(1).describe("List of exact media IDs to permanently delete from the product (e.g. gid://shopify/MediaImage/456)"),
});

type DeleteProductMediaInput = z.infer<typeof DeleteProductMediaInputSchema>;

let shopifyClient: GraphQLClient;

export const deleteProductMedia: ShopifyTool = {
  name: "delete-product-media",
  description: "Permanently removes unused or old media items from a Shopify product",
  schema: DeleteProductMediaInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: DeleteProductMediaInput) => {
    try {
      const productId = input.productId.startsWith("gid://")
        ? input.productId
        : `gid://shopify/Product/${input.productId}`;
      
      const mediaIds = input.mediaIds.map(id => 
        id.startsWith("gid://") ? id : `gid://shopify/MediaImage/${id}`
      );

      const query = gql`
        #graphql

        mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
          productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
            deletedMediaIds
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        productId,
        mediaIds,
      };

      const data = (await shopifyClient.request(query, variables)) as any;
      
      checkUserErrors(data.productDeleteMedia.userErrors, "delete product media");

      return {
        deletedMediaIds: data.productDeleteMedia.deletedMediaIds,
        status: "success"
      };
    } catch (error) {
      handleToolError("delete product media", error);
    }
  },
};
