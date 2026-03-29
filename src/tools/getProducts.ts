import type { GraphQLClient } from "graphql-request";
import { gql } from "graphql-request";
import { z } from "zod";
import { handleToolError } from "../lib/toolUtils.js";

// Input schema for getProducts
const GetProductsInputSchema = z.object({
  searchTitle: z.string().optional().describe("Search by title (convenience filter, wraps in title:*...*). Use 'query' for advanced filtering."),
  category: z.string().optional().describe("Filter by product category (product_type). e.g., 'Shoes'"),
  add_date_min: z.string().optional().describe("Filter by minimum added date (ISO 8601 format, e.g. '2023-01-01')"),
  add_date_max: z.string().optional().describe("Filter by maximum added date (ISO 8601 format, e.g. '2023-12-31')"),
  limit: z.number().default(10),
  after: z.string().optional().describe("Cursor for forward pagination"),
  before: z.string().optional().describe("Cursor for backward pagination"),
  sortKey: z.enum([
    "CREATED_AT", "ID", "INVENTORY_TOTAL", "PRODUCT_TYPE",
    "PUBLISHED_AT", "RELEVANCE", "TITLE", "UPDATED_AT", "VENDOR"
  ]).optional().describe("Sort key for products"),
  reverse: z.boolean().optional().describe("Reverse the sort order"),
  query: z.string().optional().describe("Raw query string for advanced filtering (e.g. 'status:active vendor:Nike tag:sale')")
});

type GetProductsInput = z.infer<typeof GetProductsInputSchema>;

// Will be initialized in index.ts
let shopifyClient: GraphQLClient;

const getProducts = {
  name: "get-products",
  description: "Get all products or search by title",
  schema: GetProductsInputSchema,

  // Add initialize method to set up the GraphQL client
  initialize(client: GraphQLClient) {
    shopifyClient = client;
  },

  execute: async (input: GetProductsInput) => {
    try {
      const { searchTitle, category, add_date_min, add_date_max, limit, after, before, sortKey, reverse, query: rawQuery } = input;

      // Build query string from convenience filters and raw query
      const queryParts: string[] = [];
      if (searchTitle) {
        queryParts.push(`title:*${searchTitle}*`);
      }
      if (category) {
        queryParts.push(`product_type:'${category}'`);
      }
      if (add_date_min) {
        queryParts.push(`created_at:>=${add_date_min}`);
      }
      if (add_date_max) {
        queryParts.push(`created_at:<=${add_date_max}`);
      }
      if (rawQuery) {
        queryParts.push(rawQuery);
      }
      const queryFilter = queryParts.join(" ") || undefined;

      const query = gql`
        #graphql

        query GetProducts($first: Int!, $query: String, $after: String, $before: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
          products(first: $first, query: $query, after: $after, before: $before, sortKey: $sortKey, reverse: $reverse) {
            edges {
              node {
                id
                title
                description
                handle
                status
                createdAt
                updatedAt
                totalInventory
                priceRangeV2 {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                  maxVariantPrice {
                    amount
                    currencyCode
                  }
                }
                media(first: 1) {
                  edges {
                    node {
                      ... on MediaImage {
                        id
                        image {
                          url
                          altText
                        }
                      }
                    }
                  }
                }
                variants(first: 5) {
                  edges {
                    node {
                      id
                      title
                      price
                      inventoryQuantity
                      sku
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
        query: queryFilter,
        ...(after && { after }),
        ...(before && { before }),
        ...(sortKey && { sortKey }),
        ...(reverse !== undefined && { reverse })
      };

      const data = (await shopifyClient.request(query, variables)) as {
        products: any;
      };

      // Extract and format product data
      const products = data.products.edges.map((edge: any) => {
        const product = edge.node;

        // Format variants
        const variants = product.variants.edges.map((variantEdge: any) => ({
          id: variantEdge.node.id,
          title: variantEdge.node.title,
          price: variantEdge.node.price,
          inventoryQuantity: variantEdge.node.inventoryQuantity,
          sku: variantEdge.node.sku
        }));

        // Get first image if it exists
        const firstMedia = product.media.edges.find((e: any) => e.node.image);
        const imageUrl = firstMedia?.node.image?.url || null;

        return {
          id: product.id,
          title: product.title,
          description: product.description,
          handle: product.handle,
          status: product.status,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          totalInventory: product.totalInventory,
          priceRange: {
            minPrice: {
              amount: product.priceRangeV2.minVariantPrice.amount,
              currencyCode: product.priceRangeV2.minVariantPrice.currencyCode
            },
            maxPrice: {
              amount: product.priceRangeV2.maxVariantPrice.amount,
              currencyCode: product.priceRangeV2.maxVariantPrice.currencyCode
            }
          },
          imageUrl,
          variants
        };
      });

      return {
        products,
        pageInfo: data.products.pageInfo
      };
    } catch (error) {
      handleToolError("fetch products", error);
    }
  }
};

export { getProducts };
