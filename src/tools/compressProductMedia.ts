import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import sharp from "sharp";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const CompressProductMediaInputSchema = z.object({
  productId: z.string().describe("The product ID (e.g. gid://shopify/Product/123)"),
  mediaId: z.string().describe("The media ID to compress (e.g. gid://shopify/MediaImage/456)"),
  imageUrl: z.string().url().describe("The current CDN URL of the image to download and compress"),
  quality: z.number().int().min(1).max(100).default(80).describe("JPEG compression quality (1-100, default 80)"),
  alt: z.string().optional().describe("Alt text to apply to the new compressed image"),
  replaceOriginal: z.boolean().default(true).describe("Delete the original image after uploading the compressed version (default true)"),
});

type CompressProductMediaInput = z.infer<typeof CompressProductMediaInputSchema>;

let shopifyClient: GraphQLClient;

export const compressProductMedia: ShopifyTool = {
  name: "compress-product-media",
  description: "Downloads a product image from its CDN URL, compresses it with sharp, re-uploads it to Shopify via staged uploads, and optionally deletes the original. Returns file size savings.",
  schema: CompressProductMediaInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: CompressProductMediaInput) => {
    try {
      const productId = input.productId.startsWith("gid://")
        ? input.productId
        : `gid://shopify/Product/${input.productId}`;

      const mediaId = input.mediaId.startsWith("gid://")
        ? input.mediaId
        : `gid://shopify/MediaImage/${input.mediaId}`;

      // 1. Download the original image
      const imageResponse = await fetch(input.imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from CDN: ${imageResponse.statusText}`);
      }
      const originalBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const originalSize = originalBuffer.length;

      // 2. Compress with sharp
      const compressedBuffer = await sharp(originalBuffer)
        .jpeg({ quality: input.quality })
        .toBuffer();
      const compressedSize = compressedBuffer.length;

      // 3. Create a staged upload target on Shopify
      const stagedUploadMutation = gql`
        #graphql
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters {
                name
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const filename = `compressed_${Date.now()}.jpg`;

      const stagedData = (await shopifyClient.request(stagedUploadMutation, {
        input: [
          {
            filename,
            mimeType: "image/jpeg",
            resource: "IMAGE",
            fileSize: String(compressedSize),
            httpMethod: "POST",
          },
        ],
      })) as any;

      checkUserErrors(stagedData.stagedUploadsCreate.userErrors, "create staged upload");

      const target = stagedData.stagedUploadsCreate.stagedTargets[0];

      // 4. POST the compressed image to the staged upload URL
      const formData = new FormData();
      for (const param of target.parameters) {
        formData.append(param.name, param.value);
      }
      formData.append(
        "file",
        new Blob([new Uint8Array(compressedBuffer)], { type: "image/jpeg" }),
        filename
      );

      const uploadResponse = await fetch(target.url, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Staged upload to Shopify CDN failed: ${uploadResponse.statusText}`);
      }

      // 5. Attach the new compressed image as product media
      const createMediaMutation = gql`
        #graphql
        mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
          productCreateMedia(media: $media, productId: $productId) {
            media {
              ... on MediaImage {
                id
                alt
                image {
                  url
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const createData = (await shopifyClient.request(createMediaMutation, {
        productId,
        media: [
          {
            originalSource: target.resourceUrl,
            alt: input.alt ?? "",
            mediaContentType: "IMAGE",
          },
        ],
      })) as any;

      checkUserErrors(createData.productCreateMedia.userErrors, "attach compressed media");

      const newMedia = createData.productCreateMedia.media[0];

      // 6. Optionally delete the original media
      if (input.replaceOriginal) {
        const deleteMutation = gql`
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

        const deleteData = (await shopifyClient.request(deleteMutation, {
          productId,
          mediaIds: [mediaId],
        })) as any;

        checkUserErrors(deleteData.productDeleteMedia.userErrors, "delete original media");
      }

      const savedBytes = originalSize - compressedSize;
      const savedPercent = ((savedBytes / originalSize) * 100).toFixed(1);

      return {
        newMediaId: newMedia?.id ?? null,
        newImageUrl: newMedia?.image?.url ?? null,
        originalSizeKb: (originalSize / 1024).toFixed(1),
        compressedSizeKb: (compressedSize / 1024).toFixed(1),
        savedKb: (savedBytes / 1024).toFixed(1),
        savedPercent: `${savedPercent}%`,
        originalDeleted: input.replaceOriginal,
        status: "success",
      };
    } catch (error) {
      handleToolError("compress product media", error);
    }
  },
};
