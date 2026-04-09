import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const GetInventoryReportInputSchema = z.object({
  threshold: z
    .number()
    .int()
    .min(0)
    .default(5)
    .describe("Report variants with inventory at or below this quantity. Use 0 to show only out-of-stock."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(250)
    .default(100)
    .describe("Max variants to return"),
  productStatus: z
    .enum(["ACTIVE", "DRAFT", "ARCHIVED", "any"])
    .default("ACTIVE")
    .describe("Filter by product status. Use 'ACTIVE' to focus on live products."),
  includeUntracked: z
    .boolean()
    .default(false)
    .describe("Include variants where inventory tracking is disabled"),
});

type GetInventoryReportInput = z.infer<typeof GetInventoryReportInputSchema>;

let shopifyClient: GraphQLClient;

export const getInventoryReport: ShopifyTool = {
  name: "get-inventory-report",
  description:
    "Store-wide low stock and out-of-stock report. Scans all product variants and returns those at or below the threshold quantity, grouped by severity. Complements get-inventory-items (which is per-product). Only tracked variants are included by default.",
  schema: GetInventoryReportInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetInventoryReportInput) => {
    try {
      const { threshold, limit, productStatus, includeUntracked } = input;

      // Build query string: inventory_quantity filter + optional product_status
      const queryParts = [`inventory_quantity:<=${threshold}`];
      if (productStatus !== "any") {
        queryParts.push(`product_status:${productStatus}`);
      }
      const queryFilter = queryParts.join(" ");

      const gqlQuery = gql`
        #graphql
        query GetInventoryReport($first: Int!, $query: String!) {
          productVariants(first: $first, query: $query) {
            edges {
              node {
                id
                title
                sku
                inventoryQuantity
                price
                product {
                  id
                  title
                  handle
                  status
                  vendor
                }
                inventoryItem {
                  id
                  tracked
                  unitCost {
                    amount
                    currencyCode
                  }
                }
                selectedOptions {
                  name
                  value
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

      const data = (await shopifyClient.request(gqlQuery, {
        first: limit,
        query: queryFilter,
      })) as { productVariants: any };

      let variants = data.productVariants.edges.map((e: any) => e.node);
      const hasMore = data.productVariants.pageInfo.hasNextPage;

      // Filter untracked unless requested
      if (!includeUntracked) {
        variants = variants.filter((v: any) => v.inventoryItem?.tracked !== false);
      }

      const outOfStock = variants.filter((v: any) => v.inventoryQuantity <= 0);
      const lowStock = variants.filter((v: any) => v.inventoryQuantity > 0 && v.inventoryQuantity <= threshold);

      const formatVariant = (v: any) => ({
        variantId: v.id,
        sku: v.sku,
        variantTitle: v.title,
        inventoryQuantity: v.inventoryQuantity,
        price: v.price,
        options: v.selectedOptions,
        tracked: v.inventoryItem?.tracked,
        unitCost: v.inventoryItem?.unitCost ?? null,
        product: {
          id: v.product.id,
          title: v.product.title,
          handle: v.product.handle,
          status: v.product.status,
          vendor: v.product.vendor,
        },
      });

      const result: Record<string, any> = {
        threshold,
        productStatus,
        summary: {
          outOfStockCount: outOfStock.length,
          lowStockCount: lowStock.length,
          totalAlerts: variants.length,
        },
        outOfStock: outOfStock.map(formatVariant),
        lowStock: lowStock.map(formatVariant),
      };

      if (hasMore) {
        result.warning = `Results are capped at ${limit} variants. Increase limit (max 250) to see more.`;
      }

      return result;
    } catch (error) {
      handleToolError("get inventory report", error);
    }
  },
};
