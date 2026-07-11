const express = require("express");

const {
  createCategoryHandler,
  deleteCategoryHandler,
  listCategoriesHandler,
  listProductsByCategoryHandler,
  updateCategoryHandler,
} = require("../controllers/category.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const categoryRouter = express.Router();

categoryRouter.get("/", listCategoriesHandler);
categoryRouter.get("/:id/products", listProductsByCategoryHandler);
categoryRouter.post("/", requireAuth, requireRoles("ADMIN"), createCategoryHandler);
categoryRouter.put("/:id", requireAuth, requireRoles("ADMIN"), updateCategoryHandler);
categoryRouter.delete("/:id", requireAuth, requireRoles("ADMIN"), deleteCategoryHandler);

module.exports = categoryRouter;
