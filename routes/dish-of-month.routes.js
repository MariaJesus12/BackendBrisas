const express = require("express");

const {
  createDishOfMonthHandler,
  deleteDishOfMonthHandler,
  getCurrentDishOfMonthHandler,
  listDishOfMonthHistoryHandler,
  updateDishOfMonthHandler,
} = require("../controllers/dish-of-month.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const dishOfMonthRouter = express.Router();

dishOfMonthRouter.get("/", getCurrentDishOfMonthHandler);
dishOfMonthRouter.get("/history", requireAuth, requireRoles("ADMIN"), listDishOfMonthHistoryHandler);
dishOfMonthRouter.post("/", requireAuth, requireRoles("ADMIN"), createDishOfMonthHandler);
dishOfMonthRouter.put("/:id", requireAuth, requireRoles("ADMIN"), updateDishOfMonthHandler);
dishOfMonthRouter.delete("/:id", requireAuth, requireRoles("ADMIN"), deleteDishOfMonthHandler);

module.exports = dishOfMonthRouter;
