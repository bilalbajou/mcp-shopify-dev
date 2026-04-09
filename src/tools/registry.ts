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
import { compressProductMedia } from "./compressProductMedia.js";

// Analytics & Reports
import { getShopInfo } from "./getShopInfo.js";
import { getSalesReport } from "./getSalesReport.js";
import { getTopProducts } from "./getTopProducts.js";
import { getInventoryReport } from "./getInventoryReport.js";
import { getAnalyticsDashboard } from "./getAnalyticsDashboard.js";

// Orders
import { getOrders } from "./getOrders.js";
import { getOrderById } from "./getOrderById.js";
import { updateOrder } from "./updateOrder.js";
import { cancelOrder } from "./cancelOrder.js";
import { createFulfillment } from "./createFulfillment.js";

// Discounts & Price Rules
import { getDiscountCodes } from "./getDiscountCodes.js";
import { createDiscountCode } from "./createDiscountCode.js";
import { updateDiscountCode } from "./updateDiscountCode.js";
import { deactivateDiscount } from "./deactivateDiscount.js";
import { createAutomaticDiscount } from "./createAutomaticDiscount.js";
import { getDiscountUsage } from "./getDiscountUsage.js";

// Theme files & Liquid sections
import { getThemes } from "./getThemes.js";
import { getThemeFiles } from "./getThemeFiles.js";
import { getThemeFileContent } from "./getThemeFileContent.js";
import { upsertThemeFile } from "./upsertThemeFile.js";
import { generateLiquidSection } from "./generateLiquidSection.js";

// Files (theme & general media)
import { getFiles } from "./getFiles.js";
import { updateFile } from "./updateFile.js";

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

  // Analytics & Reports
  getShopInfo,
  getSalesReport,
  getTopProducts,
  getInventoryReport,
  getAnalyticsDashboard,

  // Orders
  getOrders,
  getOrderById,
  updateOrder,
  cancelOrder,
  createFulfillment,
  
  // Discounts & Price Rules
  getDiscountCodes,
  createDiscountCode,
  updateDiscountCode,
  deactivateDiscount,
  createAutomaticDiscount,
  getDiscountUsage,
  
  // Inventory
  setInventoryQuantities,
  getInventoryItems,
  getInventoryLevels,
  
  // Custom Media
  updateProductMedia,
  deleteProductMedia,
  compressProductMedia,

  // Theme files & Liquid sections
  getThemes,
  getThemeFiles,
  getThemeFileContent,
  upsertThemeFile,
  generateLiquidSection,

  // Files (theme & general media)
  getFiles,
  updateFile,
  
  // AI Tools
  generateAltTextAi
];
