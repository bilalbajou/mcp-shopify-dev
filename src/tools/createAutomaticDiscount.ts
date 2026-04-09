import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const CreateAutomaticDiscountInputSchema = z.object({
  title: z.string().min(1).describe("Internal title for the discount"),
  startsAt: z.string().optional().describe("ISO datetime. Defaults to now if omitted."),
  endsAt: z.string().optional().describe("ISO datetime."),
  type: z.enum(["percentage", "fixed_amount"]),
  value: z.number().optional().describe("Percentage (e.g. 0.15 for 15%) or fixed amount (e.g. 10.0 for $10)"),
  minimumRequirementType: z.enum(["none", "subtotal", "quantity"]).default("none"),
  minimumRequirementValue: z.number().optional().describe("Subtotal amount or quantity required"),
  appliesTo: z.enum(["all", "products", "collections"]).default("all"),
  appliesToIds: z.array(z.string()).optional().describe("Product or Collection GIDs if appliesTo is products or collections"),
});

type CreateAutomaticDiscountInput = z.infer<typeof CreateAutomaticDiscountInputSchema>;

let shopifyClient: GraphQLClient;

export const createAutomaticDiscount = {
  name: "create-automatic-discount",
  description: "Create an automatic discount (percentage or fixed amount) that applies at checkout without a promo code.",
  schema: CreateAutomaticDiscountInputSchema,
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },
  execute: async (input: CreateAutomaticDiscountInput) => {
    try {
      const startsAt = input.startsAt || new Date().toISOString();

      const query = gql`
        #graphql
        mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
          discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
            automaticDiscountNode {
              id
              automaticDiscount {
                ... on DiscountAutomaticBasic {
                  title
                  summary
                  status
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

      let customerGets: any = {};
      if (input.type === "percentage") {
        customerGets.value = { percentage: input.value || 0 };
      } else {
        customerGets.value = { discountAmount: { amount: input.value || 0, appliesOnEachItem: false } };
      }

      if (input.appliesTo === "products") {
        customerGets.items = { products: { productsToAdd: input.appliesToIds || [] } };
      } else if (input.appliesTo === "collections") {
        customerGets.items = { collections: { collectionsToAdd: input.appliesToIds || [] } };
      } else {
        customerGets.items = { all: true };
      }

      let minimumRequirement: any = {};
      if (input.minimumRequirementType === "subtotal") {
        minimumRequirement.subtotal = { greaterThanOrEqualToSubtotal: input.minimumRequirementValue || 0 };
      } else if (input.minimumRequirementType === "quantity") {
        minimumRequirement.quantity = { greaterThanOrEqualToQuantity: input.minimumRequirementValue?.toString() || "1" };
      }

      const variables = {
        automaticBasicDiscount: {
          title: input.title,
          startsAt,
          endsAt: input.endsAt,
          customerGets,
          minimumRequirement: Object.keys(minimumRequirement).length ? minimumRequirement : null,
        },
      };

      const data = (await shopifyClient.request(query, variables)) as any;
      checkUserErrors(data.discountAutomaticBasicCreate.userErrors, "create automatic discount");

      return { discount: data.discountAutomaticBasicCreate.automaticDiscountNode };
    } catch (error) {
      handleToolError("create automatic discount", error);
    }
  },
};
