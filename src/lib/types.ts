import { z } from "zod";
import type { GraphQLClient } from "graphql-request";

export interface ShopifyTool {
  name: string;
  description: string;
  schema: z.ZodObject<any, any>;
  initialize?: (client: GraphQLClient) => void;
  execute: (input: any) => Promise<any>;
}
