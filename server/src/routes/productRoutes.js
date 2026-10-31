import { Router } from "express";
import {
  bulkUpdateProducts, createProduct, deleteProduct, duplicateProduct, getProduct,
  listProducts, updateProduct, updateProductStatus,
} from "../controllers/productsController.js";

const router = Router();
router.get("/", listProducts);
router.post("/", createProduct);
router.post("/bulk", bulkUpdateProducts);
router.get("/:id", getProduct);
router.put("/:id", updateProduct);
router.patch("/:id/status", updateProductStatus);
router.post("/:id/duplicate", duplicateProduct);
router.delete("/:id", deleteProduct);
export default router;
