const express = require("express");

const {
  createTipoCambioHandler,
  getTipoCambioByIdHandler,
  listTipoCambioHandler,
  updateTipoCambioHandler,
} = require("../controllers/tipo-cambio.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const tipoCambioRouter = express.Router();

tipoCambioRouter.get("/", requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"), listTipoCambioHandler);
tipoCambioRouter.get("/:id", requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"), getTipoCambioByIdHandler);
tipoCambioRouter.post("/", requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"), createTipoCambioHandler);
tipoCambioRouter.put("/:id", requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"), updateTipoCambioHandler);

module.exports = tipoCambioRouter;
