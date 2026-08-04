const express = require("express");

const {
  getMonedaByIdHandler,
  listMonedasHandler,
} = require("../controllers/moneda.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const monedaRouter = express.Router();

monedaRouter.get("/", requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"), listMonedasHandler);
monedaRouter.get("/:id", requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"), getMonedaByIdHandler);

module.exports = monedaRouter;
