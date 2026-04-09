import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError, edgesToNodes } from "../lib/toolUtils.js";

const GetDiscountCodesInputSchema = z.object({
  first: z.number().min(1).max(250).default(50).describe("Number of discounts to fetch"),
  query: z.string().optional().describe("Filter query, e.g. 'status:active' or 'title:Summer'"),
});

type GetDiscountCodesInput = z.infer<typeof GetDiscountCodesInputSchema>;

let shopifyClient: GraphQLClient;

export const getDiscountCodes = {
  name: "get-discount-codes",
  description: "List active discount codes with their status, usage limits, and summarized rules.",
  schema: GetDiscountCodesInputSchema,
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },
  execute: async (input: GetDiscountCodesInput) => {
    try {
      const query = gql`
        #graphql
        query getDiscountCodes($first: Int!, $query: String) {
          codeDiscountNodes(first: $first, query: $query) {
            edges {
              node {
                id
                codeDiscount {
                  ... on DiscountCodeBasic {
                    title
                    status
                    summary
                    asyncUsageCount
                    startsAt
                    endsAt
                    codes(first: 5) {
                      edges {
                        node {
                          code
                        }
                      }
                    }
                  }
                  ... on DiscountCodeFreeShipping {
                    title
                    status
                    summary
                    asyncUsageCount
                    startsAt
                    endsAt
                    codes(first: 5) {
                      edges {
                        node {
                          code
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const data = (await shopifyClient.request(query, input)) as any;
      const nodes = edgesToNodes(data.codeDiscountNodes?.edges || []);

      return {
        discounts: nodes.map((n: any) => {
          const discount = n.codeDiscount || {};
          return {
            id: n.id,
            title: discount.title,
            status: discount.status,
            summary: discount.summary,
            usageCount: discount.asyncUsageCount,
            startsAt: discount.startsAt,
            endsAt: discount.endsAt,
            codes: edgesToNodes(discount.codes?.edges || []).map((c: any) => c.code),
          };
        }),
      };
    } catch (error) {
      handleToolError("get discount codes", error);
    }
  },
};
