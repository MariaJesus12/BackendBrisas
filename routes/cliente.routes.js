const express = require("express");

const {
  createClienteHandler,
  deleteClienteHandler,
  getClienteByIdHandler,
  listClientesHandler,
  updateClienteHandler,
} = require("../controllers/cliente.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const clienteRouter = express.Router();

clienteRouter.use(requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"));

clienteRouter.get("/", listClientesHandler);
clienteRouter.get("/:id", getClienteByIdHandler);
clienteRouter.post("/", createClienteHandler);
clienteRouter.put("/:id", updateClienteHandler);
clienteRouter.delete("/:id", deleteClienteHandler);

module.exports = clienteRouter;
