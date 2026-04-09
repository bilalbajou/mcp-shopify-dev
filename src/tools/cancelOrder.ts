import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const CancelOrderInputSchema = z.object({
  id: z.string().min(1).describe("Shopify order GID, e.g. gid://shopify/Order/123"),
  reason: z
    .enum(["CUSTOMER", "DECLINED", "FRAUD", "INVENTORY", "OTHER", "STAFF"])
    .describe("Reason for cancellation"),
  refund: z.boolean().describe("Whether to refund the payment. Set false if already refunded or unpaid."),
  restock: z.boolean().describe("Whether to restock the inventory items"),
  notifyCustomer: z.boolean().optional().describe("Send cancellation email to the customer"),
  staffNote: z.string().optional().describe("Internal note for staff about the cancellation"),
});

type CancelOrderInput = z.infer<typeof CancelOrderInputSchema>;

let shopifyClient: GraphQLClient;

export const cancelOrder = {
  name: "cancel-order",
  description:
    "Cancel an order. Requires a reason, and whether to refund payment and restock inventory. Use get-order-by-id first to confirm the order is cancellable (financialStatus and fulfillmentStatus).",
  schema: CancelOrderInputSchema,

  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: CancelOrderInput) => {
    try {
      const { id, reason, refund, restock, notifyCustomer, staffNote } = input;

      const query = gql`
        #graphql
        mutation orderCancel(
          $orderId: ID!
          $reason: OrderCancelReason!
          $refund: Boolean!
          $restock: Boolean!
          $notifyCustomer: Boolean
          $staffNote: String
        ) {
          orderCancel(
            orderId: $orderId
            reason: $reason
            refund: $refund
            restock: $restock
            notifyCustomer: $notifyCustomer
            staffNote: $staffNote
          ) {
            job {
              id
            }
            orderCancelUserErrors {
              field
              message
              code
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, {
        orderId: id,
        reason,
        refund,
        restock,
        notifyCustomer,
        staffNote,
      })) as {
        orderCancel: {
          job: { id: string } | null;
          orderCancelUserErrors: Array<{ field: string; message: string; code: string }>;
          userErrors: Array<{ field: string; message: string }>;
        };
      };

      // Check both error arrays
      const cancelErrors = data.orderCancel.orderCancelUserErrors ?? [];
      if (cancelErrors.length > 0) {
        throw new Error(
          `Failed to cancel order: ${cancelErrors.map((e) => `${e.field}: ${e.message}`).join(", ")}`
        );
      }
      checkUserErrors(data.orderCancel.userErrors ?? [], "cancel order");

      return {
        success: true,
        jobId: data.orderCancel.job?.id ?? null,
        message: `Order ${id} cancellation has been queued${data.orderCancel.job ? ` (job: ${data.orderCancel.job.id})` : ""}.`,
      };
    } catch (error) {
      handleToolError("cancel order", error);
    }
  },
};
