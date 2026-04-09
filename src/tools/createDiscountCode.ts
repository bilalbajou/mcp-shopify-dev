import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const CreateDiscountCodeInputSchema = z.object({
  title: z.string().min(1).describe("Internal title for the discount"),
  code: z.string().min(1).describe("The actual promo code customers will use"),
  startsAt: z.string().optional().describe("ISO datetime. Defaults to now if omitted."),
  endsAt: z.string().optional().describe("ISO datetime."),
  type: z.enum(["percentage", "fixed_amount", "free_shipping"]),
  value: z.number().optional().describe("Percentage (e.g. 0.15 for 15%) or fixed amount (e.g. 10.0 for $10)"),
  minimumRequirementType: z.enum(["none", "subtotal", "quantity"]).default("none"),
  minimumRequirementValue: z.number().optional().describe("Subtotal amount or quantity required"),
  appliesTo: z.enum(["all", "products", "collections"]).default("all"),
  appliesToIds: z.array(z.string()).optional().describe("Product or Collection GIDs if appliesTo is products or collections"),
  usageLimit: z.number().optional().describe("Max number of times this code can be used in total"),
  appliesOncePerCustomer: z.boolean().optional().describe("Limit to 1 use per customer"),
});

type CreateDiscountCodeInput = z.infer<typeof CreateDiscountCodeInputSchema>;

let shopifyClient: GraphQLClient;

export const createDiscountCode = {
  name: "create-discount-code",
  description: "Create a discount code (percentage, fixed amount, or free shipping) with various applicability and minimum requirements.",
  schema: CreateDiscountCodeInputSchema,
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },
  execute: async (input: CreateDiscountCodeInput) => {
    try {
      const startsAt = input.startsAt || new Date().toISOString();

      if (input.type === "free_shipping") {
        return await executeFreeShippingCreate(input, startsAt);
      } else {
        return await executeBasicCreate(input, startsAt);
      }
    } catch (error) {
      handleToolError("create discount code", error);
    }
  },
};

async function executeBasicCreate(input: CreateDiscountCodeInput, startsAt: string) {
  const query = gql`
    #graphql
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
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
    basicCodeDiscount: {
      title: input.title,
      code: input.code,
      startsAt,
      endsAt: input.endsAt,
      usageLimit: input.usageLimit,
      appliesOncePerCustomer: input.appliesOncePerCustomer || false,
      customerSelection: { all: true },
      customerGets,
      minimumRequirement: Object.keys(minimumRequirement).length ? minimumRequirement : null,
    },
  };

  const data = (await shopifyClient.request(query, variables)) as any;
  checkUserErrors(data.discountCodeBasicCreate.userErrors, "create basic discount code");

  return { discount: data.discountCodeBasicCreate.codeDiscountNode };
}

async function executeFreeShippingCreate(input: CreateDiscountCodeInput, startsAt: string) {
  const query = gql`
    #graphql
    mutation discountCodeFreeShippingCreate($freeShippingCodeDiscount: DiscountCodeFreeShippingInput!) {
      discountCodeFreeShippingCreate(freeShippingCodeDiscount: $freeShippingCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeFreeShipping {
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

  let minimumRequirement: any = {};
  if (input.minimumRequirementType === "subtotal") {
    minimumRequirement.subtotal = { greaterThanOrEqualToSubtotal: input.minimumRequirementValue || 0 };
  } else if (input.minimumRequirementType === "quantity") {
    minimumRequirement.quantity = { greaterThanOrEqualToQuantity: input.minimumRequirementValue?.toString() || "1" };
  }

  const variables = {
    freeShippingCodeDiscount: {
      title: input.title,
      code: input.code,
      startsAt,
      endsAt: input.endsAt,
      usageLimit: input.usageLimit,
      appliesOncePerCustomer: input.appliesOncePerCustomer || false,
      customerSelection: { all: true },
      destination: { all: true },
      minimumRequirement: Object.keys(minimumRequirement).length ? minimumRequirement : null,
    },
  };

  const data = (await shopifyClient.request(query, variables)) as any;
  checkUserErrors(data.discountCodeFreeShippingCreate.userErrors, "create free shipping discount code");

  return { discount: data.discountCodeFreeShippingCreate.codeDiscountNode };
}
