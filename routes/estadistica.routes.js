const express = require("express");

const { getProductSalesStatsHandler } = require("../controllers/estadistica.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const estadisticaRouter = express.Router();

estadisticaRouter.use(requireAuth, requireRoles("ADMIN"));

estadisticaRouter.get("/productos/ventas", getProductSalesStatsHandler);

module.exports = estadisticaRouter;
