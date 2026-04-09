import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const UpdateOrderInputSchema = z.object({
  id: z.string().min(1).describe("Shopify order GID, e.g. gid://shopify/Order/123"),
  tags: z.array(z.string()).optional().describe("Replaces all existing tags on the order"),
  note: z.string().optional().describe("Internal note visible to staff only"),
  email: z.string().optional().describe("Customer email address for the order"),
  shippingAddress: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      company: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      province: z.string().optional(),
      provinceCode: z.string().optional(),
      country: z.string().optional(),
      countryCode: z.string().optional(),
      zip: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional()
    .describe("Update the shipping address"),
  metafields: z
    .array(
      z.object({
        id: z.string().optional(),
        namespace: z.string().optional(),
        key: z.string().optional(),
        value: z.string(),
        type: z.string().optional(),
      })
    )
    .optional(),
  customAttributes: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      })
    )
    .optional()
    .describe("Key-value attributes on the order"),
});

type UpdateOrderInput = z.infer<typeof UpdateOrderInputSchema>;

let shopifyClient: GraphQLClient;

export const updateOrder = {
  name: "update-order",
  description:
    "Update an order's tags, internal note, customer email, shipping address, metafields, or custom attributes.",
  schema: UpdateOrderInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: UpdateOrderInput) => {
    try {
      const { id, ...fields } = input;

      const query = gql`
        #graphql
        mutation orderUpdate($input: OrderInput!) {
          orderUpdate(input: $input) {
            order {
              id
              name
              email
              tags
              note
              displayFinancialStatus
              displayFulfillmentStatus
              shippingAddress {
                firstName
                lastName
                address1
                city
                country
                zip
              }
              metafields(first: 10) {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
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

      const data = (await shopifyClient.request(query, {
        input: { id, ...fields },
      })) as {
        orderUpdate: {
          order: any;
          userErrors: Array<{ field: string; message: string }>;
        };
      };

      checkUserErrors(data.orderUpdate.userErrors, "update order");

      const o = data.orderUpdate.order;

      return {
        order: {
          id: o.id,
          name: o.name,
          email: o.email,
          tags: o.tags,
          note: o.note,
          financialStatus: o.displayFinancialStatus,
          fulfillmentStatus: o.displayFulfillmentStatus,
          shippingAddress: o.shippingAddress,
          metafields: o.metafields?.edges.map((e: any) => e.node) ?? [],
        },
      };
    } catch (error) {
      handleToolError("update order", error);
    }
  },
};
