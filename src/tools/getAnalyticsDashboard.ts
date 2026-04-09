import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";
import type { ShopifyTool } from "../lib/types.js";

const GetAnalyticsDashboardInputSchema = z.object({
  periodDays: z
    .number()
    .int()
    .min(1)
    .max(90)
    .default(30)
    .describe("Number of days for the current period (also used for the comparison period). Default: last 30 days vs. prior 30 days."),
  lowStockThreshold: z
    .number()
    .int()
    .min(0)
    .default(5)
    .describe("Inventory threshold for the low stock alert count"),
});

type GetAnalyticsDashboardInput = z.infer<typeof GetAnalyticsDashboardInputSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function buildDateRange(daysAgo: number, daysBack: number): { start: string; end: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - daysAgo);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - daysBack + 1);
  return { start: toISODate(start), end: toISODate(end) };
}

function aggregateOrders(orders: any[]): {
  count: number;
  revenue: number;
  tax: number;
  shipping: number;
  refunded: number;
  currencyCode: string;
} {
  let revenue = 0, tax = 0, shipping = 0, refunded = 0;
  let currencyCode = "USD";
  for (const o of orders) {
    revenue += parseFloat(o.totalPriceSet?.shopMoney?.amount ?? "0");
    tax += parseFloat(o.totalTaxSet?.shopMoney?.amount ?? "0");
    shipping += parseFloat(o.totalShippingPriceSet?.shopMoney?.amount ?? "0");
    refunded += parseFloat(o.totalRefundedSet?.shopMoney?.amount ?? "0");
    if (o.totalPriceSet?.shopMoney?.currencyCode) {
      currencyCode = o.totalPriceSet.shopMoney.currencyCode;
    }
  }
  return { count: orders.length, revenue, tax, shipping, refunded, currencyCode };
}

function growthPct(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+∞%" : "0%";
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function fmt(amount: number, currencyCode: string) {
  return { amount: amount.toFixed(2), currencyCode };
}

// ── GraphQL fragments ─────────────────────────────────────────────────────────

const ORDER_FIELDS = gql`
  fragment OrderMetrics on Order {
    id
    createdAt
    displayFinancialStatus
    totalPriceSet { shopMoney { amount currencyCode } }
    totalTaxSet { shopMoney { amount currencyCode } }
    totalShippingPriceSet { shopMoney { amount currencyCode } }
    totalRefundedSet { shopMoney { amount currencyCode } }
  }
`;

let shopifyClient: GraphQLClient;

export const getAnalyticsDashboard: ShopifyTool = {
  name: "get-analytics-dashboard",
  description:
    "KPI overview dashboard: current period vs. prior period revenue comparison, order counts, AOV, growth percentages, unfulfilled orders alert, and low stock count. Runs multiple queries in parallel. Use get-sales-report for detailed breakdowns.",
  schema: GetAnalyticsDashboardInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetAnalyticsDashboardInput) => {
    try {
      const { periodDays, lowStockThreshold } = input;

      // Build date ranges
      const current = buildDateRange(0, periodDays);
      const previous = buildDateRange(periodDays, periodDays);

      const ordersQuery = (start: string, end: string) => gql`
        ${ORDER_FIELDS}
        query DashboardOrders_${Date.now()} {
          orders(first: 250, query: "created_at:>='${start}' created_at:<='${end}' financial_status:paid", sortKey: CREATED_AT) {
            edges { node { ...OrderMetrics } }
            pageInfo { hasNextPage }
          }
        }
      `;

      const shopQuery = gql`
        #graphql
        query DashboardShop {
          shop {
            name
            currencyCode
            ianaTimezone
            plan { displayName shopifyPlus }
          }
        }
      `;

      const unfulfilledQuery = gql`
        #graphql
        query DashboardUnfulfilled {
          orders(first: 250, query: "fulfillment_status:unfulfilled status:open financial_status:paid") {
            edges { node { id } }
            pageInfo { hasNextPage }
          }
        }
      `;

      const lowStockQuery = gql`
        #graphql
        query DashboardLowStock {
          productVariants(first: 250, query: "inventory_quantity:<=${lowStockThreshold} product_status:ACTIVE") {
            edges { node { inventoryQuantity inventoryItem { tracked } } }
            pageInfo { hasNextPage }
          }
        }
      `;

      // Run all queries in parallel
      const [currentData, previousData, shopData, unfulfilledData, lowStockData] = await Promise.all([
        shopifyClient.request(ordersQuery(current.start, current.end)) as Promise<any>,
        shopifyClient.request(ordersQuery(previous.start, previous.end)) as Promise<any>,
        shopifyClient.request(shopQuery) as Promise<any>,
        shopifyClient.request(unfulfilledQuery) as Promise<any>,
        shopifyClient.request(lowStockQuery) as Promise<any>,
      ]);

      const currentOrders = currentData.orders.edges.map((e: any) => e.node);
      const previousOrders = previousData.orders.edges.map((e: any) => e.node);
      const cur = aggregateOrders(currentOrders);
      const prev = aggregateOrders(previousOrders);
      const curAov = cur.count > 0 ? cur.revenue / cur.count : 0;
      const prevAov = prev.count > 0 ? prev.revenue / prev.count : 0;

      // Low stock split
      const allVariants = lowStockData.productVariants.edges.map((e: any) => e.node);
      const trackedVariants = allVariants.filter((v: any) => v.inventoryItem?.tracked !== false);
      const outOfStockCount = trackedVariants.filter((v: any) => v.inventoryQuantity <= 0).length;
      const lowStockCount = trackedVariants.filter((v: any) => v.inventoryQuantity > 0).length;

      const unfulfilledCount = unfulfilledData.orders.edges.length;

      const currencyCode = cur.currencyCode || prev.currencyCode || shopData.shop.currencyCode;

      // Build warnings
      const warnings: string[] = [];
      if (currentData.orders.pageInfo.hasNextPage || previousData.orders.pageInfo.hasNextPage) {
        warnings.push(`Order sample capped at 250 per period — revenue figures may be underreported for high-volume stores.`);
      }
      if (unfulfilledData.orders.pageInfo.hasNextPage) {
        warnings.push(`Unfulfilled order count is 250+ (shown as minimum).`);
      }
      if (lowStockData.productVariants.pageInfo.hasNextPage) {
        warnings.push(`Low stock count is 250+ (shown as minimum). Run get-inventory-report for the full list.`);
      }

      return {
        generatedAt: new Date().toISOString(),
        shop: {
          name: shopData.shop.name,
          currency: currencyCode,
          timezone: shopData.shop.ianaTimezone,
          plan: shopData.shop.plan?.displayName,
        },
        currentPeriod: {
          label: `Last ${periodDays} days`,
          start: current.start,
          end: current.end,
          orderCount: cur.count,
          revenue: fmt(cur.revenue, currencyCode),
          netRevenue: fmt(cur.revenue - cur.refunded, currencyCode),
          averageOrderValue: fmt(curAov, currencyCode),
          totalTax: fmt(cur.tax, currencyCode),
          totalShipping: fmt(cur.shipping, currencyCode),
          totalRefunded: fmt(cur.refunded, currencyCode),
        },
        previousPeriod: {
          label: `Prior ${periodDays} days`,
          start: previous.start,
          end: previous.end,
          orderCount: prev.count,
          revenue: fmt(prev.revenue, currencyCode),
          netRevenue: fmt(prev.revenue - prev.refunded, currencyCode),
          averageOrderValue: fmt(prevAov, currencyCode),
        },
        growth: {
          revenue: growthPct(cur.revenue, prev.revenue),
          orders: growthPct(cur.count, prev.count),
          averageOrderValue: growthPct(curAov, prevAov),
          netRevenue: growthPct(cur.revenue - cur.refunded, prev.revenue - prev.refunded),
        },
        alerts: {
          unfulfilledOrders: unfulfilledCount,
          outOfStockVariants: outOfStockCount,
          lowStockVariants: lowStockCount,
          lowStockThreshold,
        },
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      handleToolError("get analytics dashboard", error);
    }
  },
};
