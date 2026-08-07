const express = require("express");

const {
  createConfiguracionRestauranteHandler,
  getConfiguracionRestauranteByIdHandler,
  getCurrentConfiguracionRestauranteHandler,
  listConfiguracionesRestauranteHandler,
  updateConfiguracionRestauranteHandler,
} = require("../controllers/configuracion-restaurante.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const configuracionRestauranteRouter = express.Router();

configuracionRestauranteRouter.get("/", getCurrentConfiguracionRestauranteHandler);

configuracionRestauranteRouter.get("/all", listConfiguracionesRestauranteHandler);

configuracionRestauranteRouter.get("/:id", getConfiguracionRestauranteByIdHandler);

configuracionRestauranteRouter.post(
  "/",
  requireAuth,
  requireRoles("ADMIN"),
  createConfiguracionRestauranteHandler,
);

configuracionRestauranteRouter.put(
  "/:id",
  requireAuth,
  requireRoles("ADMIN"),
  updateConfiguracionRestauranteHandler,
);

module.exports = configuracionRestauranteRouter;
