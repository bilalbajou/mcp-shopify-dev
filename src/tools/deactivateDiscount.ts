import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { checkUserErrors, handleToolError } from "../lib/toolUtils.js";

const DeactivateDiscountInputSchema = z.object({
  id: z.string().min(1).describe("Discount Node GID to deactivate"),
});

type DeactivateDiscountInput = z.infer<typeof DeactivateDiscountInputSchema>;

let shopifyClient: GraphQLClient;

export const deactivateDiscount = {
  name: "deactivate-discount",
  description: "Deactivate an active discount code or automatic discount.",
  schema: DeactivateDiscountInputSchema,
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },
  execute: async (input: DeactivateDiscountInput) => {
    try {
      if (input.id.includes("DiscountAutomaticNode")) {
        return await executeAutomatic(input.id);
      } else {
        return await executeCode(input.id);
      }
    } catch (error) {
      handleToolError("deactivate discount", error);
    }
  },
};

async function executeCode(id: string) {
  const query = gql`
    #graphql
    mutation discountCodeDeactivate($id: ID!) {
      discountCodeDeactivate(id: $id) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic { status }
            ... on DiscountCodeFreeShipping { status }
            ... on DiscountCodeBxgy { status }
          }
        }
        userErrors { field message }
      }
    }
  `;
  const data = (await shopifyClient.request(query, { id })) as any;
  checkUserErrors(data.discountCodeDeactivate.userErrors, "deactivate discount code");
  return { discount: data.discountCodeDeactivate.codeDiscountNode };
}

async function executeAutomatic(id: string) {
  const query = gql`
    #graphql
    mutation discountAutomaticDeactivate($id: ID!) {
      discountAutomaticDeactivate(id: $id) {
        automaticDiscountNode {
          id
          automaticDiscount {
            ... on DiscountAutomaticBasic { status }
            ... on DiscountAutomaticFreeShipping { status }
            ... on DiscountAutomaticBxgy { status }
          }
        }
        userErrors { field message }
      }
    }
  `;
  const data = (await shopifyClient.request(query, { id })) as any;
  checkUserErrors(data.discountAutomaticDeactivate.userErrors, "deactivate automatic discount");
  return { discount: data.discountAutomaticDeactivate.automaticDiscountNode };
}
