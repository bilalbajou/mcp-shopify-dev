import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const GetTopProductsInputSchema = z.object({
  startDate: z
    .string()
    .describe("Start date in ISO format, e.g. '2024-01-01'"),
  endDate: z
    .string()
    .describe("End date in ISO format, e.g. '2024-01-31'"),
  sortBy: z
    .enum(["revenue", "units"])
    .default("revenue")
    .describe("Rank products by total revenue or units sold"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Number of top products to return"),
  orderLimit: z
    .number()
    .int()
    .min(1)
    .max(250)
    .default(100)
    .describe("Max orders to scan. Higher = more accurate but slower. Max 250."),
});

type GetTopProductsInput = z.infer<typeof GetTopProductsInputSchema>;

let shopifyClient: GraphQLClient;

export const getTopProducts: ShopifyTool = {
  name: "get-top-products",
  description:
    "Rank products by revenue or units sold for a given date range. Scans paid orders and aggregates line items by product. Results are based on a sample of orders (up to 250) — use shorter date ranges for accuracy on high-volume stores.",
  schema: GetTopProductsInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetTopProductsInput) => {
    try {
      const { startDate, endDate, sortBy, limit, orderLimit } = input;

      const queryFilter = `created_at:>='${startDate}' created_at:<='${endDate}' financial_status:paid`;

      const gqlQuery = gql`
        #graphql
        query GetTopProducts($first: Int!, $query: String!) {
          orders(first: $first, query: $query, sortKey: CREATED_AT) {
            edges {
              node {
                id
                createdAt
                lineItems(first: 50) {
                  edges {
                    node {
                      quantity
                      originalUnitPriceSet {
                        shopMoney { amount currencyCode }
                      }
                      discountedUnitPriceSet {
                        shopMoney { amount currencyCode }
                      }
                      product {
                        id
                        title
                        handle
                        status
                      }
                      variant {
                        id
                        title
                        sku
                      }
                    }
                  }
                }
              }
            }
            pageInfo { hasNextPage }
          }
        }
      `;

      const data = (await shopifyClient.request(gqlQuery, {
        first: orderLimit,
        query: queryFilter,
      })) as { orders: any };

      const orders = data.orders.edges.map((e: any) => e.node);
      const hasMore = data.orders.pageInfo.hasNextPage;

      // Aggregate by product
      const productMap = new Map<
        string,
        {
          productId: string;
          title: string;
          handle: string;
          unitsSold: number;
          revenue: number;
          currencyCode: string;
          variants: Map<string, { variantId: string; title: string; sku: string; unitsSold: number; revenue: number }>;
        }
      >();

      for (const order of orders) {
        for (const edge of order.lineItems.edges) {
          const li = edge.node;
          if (!li.product) continue; // deleted product

          const productId = li.product.id;
          const qty = li.quantity;
          const unitPrice = parseFloat(li.discountedUnitPriceSet?.shopMoney?.amount ?? li.originalUnitPriceSet?.shopMoney?.amount ?? "0");
          const lineRevenue = qty * unitPrice;
          const currency = li.originalUnitPriceSet?.shopMoney?.currencyCode ?? "USD";

          if (!productMap.has(productId)) {
            productMap.set(productId, {
              productId,
              title: li.product.title,
              handle: li.product.handle,
              unitsSold: 0,
              revenue: 0,
              currencyCode: currency,
              variants: new Map(),
            });
          }

          const p = productMap.get(productId)!;
          p.unitsSold += qty;
          p.revenue += lineRevenue;

          if (li.variant) {
            const vKey = li.variant.id;
            const existing = p.variants.get(vKey) ?? {
              variantId: li.variant.id,
              title: li.variant.title,
              sku: li.variant.sku ?? "",
              unitsSold: 0,
              revenue: 0,
            };
            existing.unitsSold += qty;
            existing.revenue += lineRevenue;
            p.variants.set(vKey, existing);
          }
        }
      }

      // Sort and slice
      const sorted = Array.from(productMap.values()).sort((a, b) =>
        sortBy === "revenue" ? b.revenue - a.revenue : b.unitsSold - a.unitsSold
      );

      const topProducts = sorted.slice(0, limit).map((p, i) => ({
        rank: i + 1,
        productId: p.productId,
        title: p.title,
        handle: p.handle,
        unitsSold: p.unitsSold,
        revenue: { amount: p.revenue.toFixed(2), currencyCode: p.currencyCode },
        averageUnitPrice: {
          amount: p.unitsSold > 0 ? (p.revenue / p.unitsSold).toFixed(2) : "0.00",
          currencyCode: p.currencyCode,
        },
        topVariants: Array.from(p.variants.values())
          .sort((a, b) => (sortBy === "revenue" ? b.revenue - a.revenue : b.unitsSold - a.unitsSold))
          .slice(0, 5)
          .map((v) => ({
            variantId: v.variantId,
            title: v.title,
            sku: v.sku,
            unitsSold: v.unitsSold,
            revenue: { amount: v.revenue.toFixed(2), currencyCode: p.currencyCode },
          })),
      }));

      const result: Record<string, any> = {
        period: { start: startDate, end: endDate },
        sortBy,
        ordersScanned: orders.length,
        uniqueProductsFound: productMap.size,
        topProducts,
      };

      if (hasMore) {
        result.warning = `Only ${orderLimit} orders were scanned. There are more orders in this period — increase orderLimit (max 250) or use a shorter date range for complete results.`;
      }

      return result;
    } catch (error) {
      handleToolError("get top products", error);
    }
  },
};
