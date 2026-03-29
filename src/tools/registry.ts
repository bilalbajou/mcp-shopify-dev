import type { ShopifyTool } from "../lib/types.js";
import { exampleTool } from "./exampleTool.js";

// Products
import { getProducts } from "./getProducts.js";
import { getProductById } from "./getProductById.js";
import { createProduct } from "./createProduct.js";
import { updateProduct } from "./updateProduct.js";
import { deleteProduct } from "./deleteProduct.js";
import { manageProductVariants } from "./manageProductVariants.js";
import { deleteProductVariants } from "./deleteProductVariants.js";
import { manageProductOptions } from "./manageProductOptions.js";

// Collections
import { getCollections } from "./getCollections.js";
import { getCollectionById } from "./getCollectionById.js";

// Inventory
import { setInventoryQuantities } from "./setInventoryQuantities.js";
import { getInventoryItems } from "./getInventoryItems.js";
import { getInventoryLevels } from "./getInventoryLevels.js";

// Custom Media
import { updateProductMedia } from "./updateProductMedia.js";
import { deleteProductMedia } from "./deleteProductMedia.js";

// AI Generative Tools
import { generateAltTextAi } from "./generateAltTextAi.js";

// Export the array of all available tools
// To register a new tool, import it above and add it to this array.
export const tools: ShopifyTool[] = [
  exampleTool,
  
  // Products
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  manageProductVariants,
  deleteProductVariants,
  manageProductOptions,
  
  // Collections
  getCollections,
  getCollectionById,
  
  // Inventory
  setInventoryQuantities,
  getInventoryItems,
  getInventoryLevels,
  
  // Custom Media
  updateProductMedia,
  deleteProductMedia,
  
  // AI Tools
  generateAltTextAi
];
