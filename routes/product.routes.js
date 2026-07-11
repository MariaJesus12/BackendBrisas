const express = require("express");

const {
  createProductHandler,
  deleteProductHandler,
  listProductsHandler,
  updateProductHandler,
} = require("../controllers/product.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const productRouter = express.Router();

productRouter.get("/", listProductsHandler);
productRouter.post("/", requireAuth, requireRoles("ADMIN"), createProductHandler);
productRouter.put("/:id", requireAuth, requireRoles("ADMIN"), updateProductHandler);
productRouter.delete("/:id", requireAuth, requireRoles("ADMIN"), deleteProductHandler);

module.exports = productRouter;
