import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";

const GetOrdersInputSchema = z.object({
  limit: z.number().default(10),
  after: z.string().optional().describe("Cursor for forward pagination"),
  before: z.string().optional().describe("Cursor for backward pagination"),
  sortKey: z
    .enum([
      "CREATED_AT",
      "CUSTOMER_NAME",
      "FINANCIAL_STATUS",
      "FULFILLMENT_STATUS",
      "ID",
      "ORDER_NUMBER",
      "PROCESSED_AT",
      "RELEVANCE",
      "TOTAL_PRICE",
      "UPDATED_AT",
    ])
    .optional()
    .describe("Field to sort orders by"),
  reverse: z.boolean().optional().describe("Reverse the sort order"),
  query: z
    .string()
    .optional()
    .describe(
      "Raw Shopify query string for filtering. Examples: 'financial_status:paid', 'fulfillment_status:unfulfilled', 'status:open', 'created_at:>=2024-01-01', 'tag:VIP', 'email:customer@example.com'"
    ),
});

type GetOrdersInput = z.infer<typeof GetOrdersInputSchema>;

let shopifyClient: GraphQLClient;

export const getOrders = {
  name: "get-orders",
  description:
    "List orders with optional filtering and pagination. Use the query field for advanced filtering by status, financial status, fulfillment status, date range, customer email, or tags.",
  schema: GetOrdersInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetOrdersInput) => {
    try {
      const { limit, after, before, sortKey, reverse, query: rawQuery } = input;

      const gqlQuery = gql`
        #graphql
        query GetOrders(
          $first: Int!
          $query: String
          $after: String
          $before: String
          $sortKey: OrderSortKeys
          $reverse: Boolean
        ) {
          orders(
            first: $first
            query: $query
            after: $after
            before: $before
            sortKey: $sortKey
            reverse: $reverse
          ) {
            edges {
              node {
                id
                name
                email
                phone
                createdAt
                processedAt
                cancelledAt
                displayFinancialStatus
                displayFulfillmentStatus
                tags
                note
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                subtotalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalTaxSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                customer {
                  id
                  firstName
                  lastName
                  email
                }
                shippingAddress {
                  firstName
                  lastName
                  address1
                  address2
                  city
                  province
                  country
                  zip
                }
                lineItems(first: 5) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      originalUnitPriceSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                      variant {
                        id
                        sku
                        title
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
          }
        }
      `;

      const variables = {
        first: limit,
        query: rawQuery,
        ...(after && { after }),
        ...(before && { before }),
        ...(sortKey && { sortKey }),
        ...(reverse !== undefined && { reverse }),
      };

      const data = (await shopifyClient.request(gqlQuery, variables)) as {
        orders: any;
      };

      const orders = data.orders.edges.map((edge: any) => {
        const o = edge.node;
        return {
          id: o.id,
          name: o.name,
          email: o.email,
          phone: o.phone,
          createdAt: o.createdAt,
          processedAt: o.processedAt,
          cancelledAt: o.cancelledAt,
          financialStatus: o.displayFinancialStatus,
          fulfillmentStatus: o.displayFulfillmentStatus,
          tags: o.tags,
          note: o.note,
          totalPrice: o.totalPriceSet?.shopMoney ?? null,
          subtotal: o.subtotalPriceSet?.shopMoney ?? null,
          totalTax: o.totalTaxSet?.shopMoney ?? null,
          customer: o.customer,
          shippingAddress: o.shippingAddress,
          lineItems: o.lineItems.edges.map((e: any) => ({
            id: e.node.id,
            title: e.node.title,
            quantity: e.node.quantity,
            unitPrice: e.node.originalUnitPriceSet?.shopMoney ?? null,
            variant: e.node.variant,
          })),
        };
      });

      return {
        orders,
        pageInfo: data.orders.pageInfo,
      };
    } catch (error) {
      handleToolError("fetch orders", error);
    }
  },
};
