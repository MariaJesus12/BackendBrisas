const express = require("express");

const {
  createMesaHandler,
  deleteMesaHandler,
  getMesaByIdHandler,
  listMesasHandler,
  updateMesaHandler,
} = require("../controllers/mesa.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const mesaRouter = express.Router();

mesaRouter.use(requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"));

mesaRouter.get("/", listMesasHandler);
mesaRouter.get("/:id", getMesaByIdHandler);
mesaRouter.post("/", createMesaHandler);
mesaRouter.put("/:id", updateMesaHandler);
mesaRouter.delete("/:id", deleteMesaHandler);

module.exports = mesaRouter;
