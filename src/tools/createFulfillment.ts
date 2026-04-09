import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const CreateFulfillmentInputSchema = z.object({
  fulfillmentOrderId: z
    .string()
    .min(1)
    .describe(
      "Shopify FulfillmentOrder GID to fulfill, e.g. gid://shopify/FulfillmentOrder/123. Retrieve it from get-order-by-id under fulfillmentOrders[].id."
    ),
  lineItems: z
    .array(
      z.object({
        fulfillmentOrderLineItemId: z
          .string()
          .describe(
            "FulfillmentOrderLineItem GID from get-order-by-id under fulfillmentOrders[].lineItems[].id"
          ),
        quantity: z.number().int().min(1),
      })
    )
    .optional()
    .describe(
      "Specific line items and quantities to fulfill. Omit to fulfill all remaining items in the fulfillment order."
    ),
  notifyCustomer: z.boolean().optional().describe("Send a shipping notification email to the customer"),
  trackingCompany: z.string().optional().describe("Shipping carrier name, e.g. 'UPS', 'FedEx', 'DHL'"),
  trackingNumber: z.string().optional().describe("Tracking number provided by the carrier"),
  trackingUrl: z.string().optional().describe("Full tracking URL, e.g. https://track.carrier.com/123"),
});

type CreateFulfillmentInput = z.infer<typeof CreateFulfillmentInputSchema>;

let shopifyClient: GraphQLClient;

export const createFulfillment = {
  name: "create-fulfillment",
  description:
    "Fulfill an order (or specific line items) by fulfillment order ID. Use get-order-by-id first to retrieve the fulfillmentOrders[].id and fulfillmentOrders[].lineItems[].id values. Optionally provide tracking info and notify the customer.",
  schema: CreateFulfillmentInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: CreateFulfillmentInput) => {
    try {
      const {
        fulfillmentOrderId,
        lineItems,
        notifyCustomer,
        trackingCompany,
        trackingNumber,
        trackingUrl,
      } = input;

      const query = gql`
        #graphql
        mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
          fulfillmentCreateV2(fulfillment: $fulfillment) {
            fulfillment {
              id
              status
              createdAt
              updatedAt
              trackingInfo {
                company
                number
                url
              }
              fulfillmentLineItems(first: 50) {
                edges {
                  node {
                    id
                    quantity
                    lineItem {
                      id
                      title
                      sku
                    }
                  }
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

      const fulfillmentOrderLineItems = lineItems?.map((li) => ({
        id: li.fulfillmentOrderLineItemId,
        quantity: li.quantity,
      }));

      const lineItemsByFulfillmentOrder: Record<string, any> = {
        fulfillmentOrderId,
      };
      if (fulfillmentOrderLineItems) {
        lineItemsByFulfillmentOrder.fulfillmentOrderLineItems = fulfillmentOrderLineItems;
      }

      const hasTracking = trackingCompany || trackingNumber || trackingUrl;
      const trackingInfo = hasTracking
        ? {
            ...(trackingCompany && { company: trackingCompany }),
            ...(trackingNumber && { number: trackingNumber }),
            ...(trackingUrl && { url: trackingUrl }),
          }
        : undefined;

      const fulfillmentInput: Record<string, any> = {
        lineItemsByFulfillmentOrder: [lineItemsByFulfillmentOrder],
        ...(notifyCustomer !== undefined && { notifyCustomer }),
        ...(trackingInfo && { trackingInfo }),
      };

      const data = (await shopifyClient.request(query, {
        fulfillment: fulfillmentInput,
      })) as {
        fulfillmentCreateV2: {
          fulfillment: any;
          userErrors: Array<{ field: string; message: string }>;
        };
      };

      checkUserErrors(data.fulfillmentCreateV2.userErrors, "create fulfillment");

      const f = data.fulfillmentCreateV2.fulfillment;

      return {
        fulfillment: {
          id: f.id,
          status: f.status,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
          trackingInfo: f.trackingInfo,
          lineItems: f.fulfillmentLineItems.edges.map((e: any) => ({
            id: e.node.id,
            quantity: e.node.quantity,
            lineItem: e.node.lineItem,
          })),
        },
      };
    } catch (error) {
      handleToolError("create fulfillment", error);
    }
  },
};
