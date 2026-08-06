const express = require("express");

const {
  createReservaHandler,
  getReservaByIdHandler,
  listMesasReservationStatusHandler,
  listReservasHandler,
  updateReservaEstadoHandler,
  updateReservaHandler,
} = require("../controllers/reserva.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const reservaRouter = express.Router();

reservaRouter.use(requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"));

reservaRouter.get("/mesas/estado", listMesasReservationStatusHandler);
reservaRouter.get("/", listReservasHandler);
reservaRouter.get("/:id", getReservaByIdHandler);
reservaRouter.post("/", createReservaHandler);
reservaRouter.put("/:id", updateReservaHandler);
reservaRouter.patch("/:id/estado", updateReservaEstadoHandler);

module.exports = reservaRouter;
