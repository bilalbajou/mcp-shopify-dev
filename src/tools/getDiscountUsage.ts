import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";

const GetDiscountUsageInputSchema = z.object({
  id: z.string().min(1).describe("Discount Node GID to check usage constraint"),
});

type GetDiscountUsageInput = z.infer<typeof GetDiscountUsageInputSchema>;

let shopifyClient: GraphQLClient;

export const getDiscountUsage = {
  name: "get-discount-usage",
  description: "Check how many times a particular code/discount has been used via asyncUsageCount.",
  schema: GetDiscountUsageInputSchema,
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },
  execute: async (input: GetDiscountUsageInput) => {
    try {
      if (input.id.includes("DiscountAutomaticNode")) {
        return await executeAutomatic(input.id);
      } else {
        return await executeCode(input.id);
      }
    } catch (error) {
      handleToolError("get discount usage", error);
    }
  },
};

async function executeCode(id: string) {
  const query = gql`
    #graphql
    query getCodeUsage($id: ID!) {
      discountNode(id: $id) {
        id
        discount {
          ... on DiscountCodeBasic { asyncUsageCount usageLimit }
          ... on DiscountCodeFreeShipping { asyncUsageCount usageLimit }
          ... on DiscountCodeBxgy { asyncUsageCount usageLimit }
        }
      }
    }
  `;
  const data = (await shopifyClient.request(query, { id })) as any;
  return { usage: data.discountNode?.discount };
}

async function executeAutomatic(id: string) {
  const query = gql`
    #graphql
    query getAutomaticUsage($id: ID!) {
      discountNode(id: $id) {
        id
        discount {
          ... on DiscountAutomaticBasic { asyncUsageCount }
          ... on DiscountAutomaticFreeShipping { asyncUsageCount }
          ... on DiscountAutomaticBxgy { asyncUsageCount }
        }
      }
    }
  `;
  const data = (await shopifyClient.request(query, { id })) as any;
  return { usage: data.discountNode?.discount };
}
