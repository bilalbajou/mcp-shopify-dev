import { z } from "zod";
import type { ShopifyTool } from "../lib/types.js";

const ExampleInputSchema = z.object({
  greetingName: z.string().describe("The name of the user to greet. E.g., 'Alice' or 'Team'."),
});

type ExampleInput = z.infer<typeof ExampleInputSchema>;

export const exampleTool: ShopifyTool = {
  name: "example-hello-world",
  description: "A simple tool that returns a greeting string. Useful to test if the MCP is working and routing correctly.",
  schema: ExampleInputSchema,

  execute: async (input: ExampleInput) => {
    // In a real tool, you would execute an API call to Shopify here.
    return {
      message: `Hello ${input.greetingName}! Your custom MCP server is securely connected and executing tools.`,
      status: "success",
    };
  },
};
