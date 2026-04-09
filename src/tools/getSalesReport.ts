import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const GetSalesReportInputSchema = z.object({
  startDate: z
    .string()
    .describe("Start date in ISO format, e.g. '2024-01-01' or '2024-01-01T00:00:00Z'"),
  endDate: z
    .string()
    .describe("End date in ISO format, e.g. '2024-01-31' or '2024-01-31T23:59:59Z'"),
  groupBy: z
    .enum(["day", "week", "month", "none"])
    .default("none")
    .describe("Group results by time period. 'none' returns totals only."),
  financialStatus: z
    .enum(["any", "paid", "pending", "refunded", "partially_refunded", "voided", "authorized"])
    .default("paid")
    .describe("Filter by financial status. Use 'paid' for actual revenue."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(250)
    .default(250)
    .describe("Max orders to fetch. Shopify caps at 250 per request."),
});

type GetSalesReportInput = z.infer<typeof GetSalesReportInputSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPeriodKey(dateStr: string, groupBy: "day" | "week" | "month"): string {
  const d = new Date(dateStr);
  if (groupBy === "day") return d.toISOString().slice(0, 10);
  if (groupBy === "month") return d.toISOString().slice(0, 7);
  // week: ISO Monday
  const dow = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return monday.toISOString().slice(0, 10);
}

function fmt(amount: number, currencyCode: string) {
  return { amount: amount.toFixed(2), currencyCode };
}

// ── Tool ──────────────────────────────────────────────────────────────────────

let shopifyClient: GraphQLClient;

export const getSalesReport: ShopifyTool = {
  name: "get-sales-report",
  description:
    "Generate a sales report for a date range: total revenue, order count, average order value, tax, and shipping. Optionally group results by day, week, or month. Limited to 250 orders per call — use shorter date ranges for high-volume stores.",
  schema: GetSalesReportInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetSalesReportInput) => {
    try {
      const { startDate, endDate, groupBy, financialStatus, limit } = input;

      const queryFilter = [
        `created_at:>='${startDate}'`,
        `created_at:<='${endDate}'`,
        financialStatus !== "any" ? `financial_status:${financialStatus}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      const gqlQuery = gql`
        #graphql
        query GetSalesReport($first: Int!, $query: String!) {
          orders(first: $first, query: $query, sortKey: CREATED_AT) {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                totalPriceSet {
                  shopMoney { amount currencyCode }
                }
                subtotalPriceSet {
                  shopMoney { amount currencyCode }
                }
                totalTaxSet {
                  shopMoney { amount currencyCode }
                }
                totalShippingPriceSet {
                  shopMoney { amount currencyCode }
                }
                totalDiscountsSet {
                  shopMoney { amount currencyCode }
                }
                totalRefundedSet {
                  shopMoney { amount currencyCode }
                }
              }
            }
            pageInfo { hasNextPage }
          }
        }
      `;

      const data = (await shopifyClient.request(gqlQuery, {
        first: limit,
        query: queryFilter,
      })) as { orders: any };

      const orders = data.orders.edges.map((e: any) => e.node);
      const hasMore = data.orders.pageInfo.hasNextPage;

      // Aggregate totals
      let totalRevenue = 0;
      let totalSubtotal = 0;
      let totalTax = 0;
      let totalShipping = 0;
      let totalDiscounts = 0;
      let totalRefunded = 0;
      let currencyCode = "USD";

      const periodMap = new Map<string, { orderCount: number; revenue: number; tax: number; shipping: number }>();

      for (const o of orders) {
        const revenue = parseFloat(o.totalPriceSet?.shopMoney?.amount ?? "0");
        const subtotal = parseFloat(o.subtotalPriceSet?.shopMoney?.amount ?? "0");
        const tax = parseFloat(o.totalTaxSet?.shopMoney?.amount ?? "0");
        const shipping = parseFloat(o.totalShippingPriceSet?.shopMoney?.amount ?? "0");
        const discounts = parseFloat(o.totalDiscountsSet?.shopMoney?.amount ?? "0");
        const refunded = parseFloat(o.totalRefundedSet?.shopMoney?.amount ?? "0");

        totalRevenue += revenue;
        totalSubtotal += subtotal;
        totalTax += tax;
        totalShipping += shipping;
        totalDiscounts += discounts;
        totalRefunded += refunded;

        if (o.totalPriceSet?.shopMoney?.currencyCode) {
          currencyCode = o.totalPriceSet.shopMoney.currencyCode;
        }

        if (groupBy !== "none") {
          const key = getPeriodKey(o.createdAt, groupBy);
          const existing = periodMap.get(key) ?? { orderCount: 0, revenue: 0, tax: 0, shipping: 0 };
          periodMap.set(key, {
            orderCount: existing.orderCount + 1,
            revenue: existing.revenue + revenue,
            tax: existing.tax + tax,
            shipping: existing.shipping + shipping,
          });
        }
      }

      const orderCount = orders.length;
      const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

      const result: Record<string, any> = {
        period: { start: startDate, end: endDate },
        financialStatus,
        summary: {
          orderCount,
          revenue: fmt(totalRevenue, currencyCode),
          subtotal: fmt(totalSubtotal, currencyCode),
          averageOrderValue: fmt(aov, currencyCode),
          totalTax: fmt(totalTax, currencyCode),
          totalShipping: fmt(totalShipping, currencyCode),
          totalDiscounts: fmt(totalDiscounts, currencyCode),
          totalRefunded: fmt(totalRefunded, currencyCode),
          netRevenue: fmt(totalRevenue - totalRefunded, currencyCode),
        },
      };

      if (groupBy !== "none" && periodMap.size > 0) {
        result.byPeriod = Array.from(periodMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([period, data]) => ({
            period,
            orderCount: data.orderCount,
            revenue: fmt(data.revenue, currencyCode),
            tax: fmt(data.tax, currencyCode),
            shipping: fmt(data.shipping, currencyCode),
            averageOrderValue: fmt(data.orderCount > 0 ? data.revenue / data.orderCount : 0, currencyCode),
          }));
      }

      if (hasMore) {
        result.warning = `Results are capped at ${limit} orders. There are more orders in this period — use a shorter date range or increase limit (max 250) for a complete report.`;
      }

      return result;
    } catch (error) {
      handleToolError("get sales report", error);
    }
  },
};
