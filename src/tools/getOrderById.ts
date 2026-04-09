import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";

const GetOrderByIdInputSchema = z.object({
  id: z.string().min(1).describe("Shopify order GID, e.g. gid://shopify/Order/123"),
});

type GetOrderByIdInput = z.infer<typeof GetOrderByIdInputSchema>;

let shopifyClient: GraphQLClient;

export const getOrderById = {
  name: "get-order-by-id",
  description:
    "Get full details for a single order by its GID, including line items, fulfillments, and fulfillment orders. The fulfillmentOrders[].id field is required when calling create-fulfillment.",
  schema: GetOrderByIdInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetOrderByIdInput) => {
    try {
      const query = gql`
        #graphql
        query GetOrderById($id: ID!) {
          order(id: $id) {
            id
            name
            email
            phone
            createdAt
            processedAt
            cancelledAt
            cancelReason
            displayFinancialStatus
            displayFulfillmentStatus
            tags
            note
            poNumber
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
            customer {
              id
              firstName
              lastName
              email
              phone
            }
            shippingAddress {
              firstName
              lastName
              company
              address1
              address2
              city
              province
              provinceCode
              country
              countryCodeV2
              zip
              phone
            }
            billingAddress {
              firstName
              lastName
              company
              address1
              address2
              city
              province
              country
              zip
            }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  title
                  quantity
                  fulfillableQuantity
                  fulfillmentStatus
                  sku
                  originalUnitPriceSet {
                    shopMoney { amount currencyCode }
                  }
                  discountedUnitPriceSet {
                    shopMoney { amount currencyCode }
                  }
                  variant {
                    id
                    title
                    sku
                    selectedOptions { name value }
                  }
                  product {
                    id
                    title
                    handle
                  }
                }
              }
            }
            fulfillments(first: 10) {
              id
              status
              createdAt
              updatedAt
              trackingInfo { company number url }
              fulfillmentLineItems(first: 50) {
                edges {
                  node {
                    id
                    quantity
                    lineItem { id title }
                  }
                }
              }
            }
            fulfillmentOrders(first: 10) {
              edges {
                node {
                  id
                  status
                  requestStatus
                  fulfillAt
                  assignedLocation {
                    name
                    address { address1 city country zip }
                  }
                  lineItems(first: 50) {
                    edges {
                      node {
                        id
                        remainingQuantity
                        totalQuantity
                        lineItem { id title sku }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, { id: input.id })) as {
        order: any;
      };

      if (!data.order) {
        throw new Error(`Order not found: ${input.id}`);
      }

      const o = data.order;

      return {
        order: {
          id: o.id,
          name: o.name,
          email: o.email,
          phone: o.phone,
          createdAt: o.createdAt,
          processedAt: o.processedAt,
          cancelledAt: o.cancelledAt,
          cancelReason: o.cancelReason,
          financialStatus: o.displayFinancialStatus,
          fulfillmentStatus: o.displayFulfillmentStatus,
          tags: o.tags,
          note: o.note,
          poNumber: o.poNumber,
          totalPrice: o.totalPriceSet?.shopMoney ?? null,
          subtotal: o.subtotalPriceSet?.shopMoney ?? null,
          totalTax: o.totalTaxSet?.shopMoney ?? null,
          totalShipping: o.totalShippingPriceSet?.shopMoney ?? null,
          totalDiscounts: o.totalDiscountsSet?.shopMoney ?? null,
          customer: o.customer,
          shippingAddress: o.shippingAddress,
          billingAddress: o.billingAddress,
          lineItems: o.lineItems.edges.map((e: any) => ({
            id: e.node.id,
            title: e.node.title,
            quantity: e.node.quantity,
            fulfillableQuantity: e.node.fulfillableQuantity,
            fulfillmentStatus: e.node.fulfillmentStatus,
            sku: e.node.sku,
            unitPrice: e.node.originalUnitPriceSet?.shopMoney ?? null,
            discountedUnitPrice: e.node.discountedUnitPriceSet?.shopMoney ?? null,
            variant: e.node.variant,
            product: e.node.product,
          })),
          fulfillments: o.fulfillments.map((f: any) => ({
            id: f.id,
            status: f.status,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
            trackingInfo: f.trackingInfo,
            lineItems: f.fulfillmentLineItems.edges.map((e: any) => e.node),
          })),
          fulfillmentOrders: o.fulfillmentOrders.edges.map((e: any) => ({
            id: e.node.id,
            status: e.node.status,
            requestStatus: e.node.requestStatus,
            fulfillAt: e.node.fulfillAt,
            assignedLocation: e.node.assignedLocation,
            lineItems: e.node.lineItems.edges.map((li: any) => li.node),
          })),
        },
      };
    } catch (error) {
      handleToolError("fetch order", error);
    }
  },
};
