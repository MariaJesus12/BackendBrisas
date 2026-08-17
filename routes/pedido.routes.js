const express = require("express");

const {
  assignPedidoAccountDetailsHandler,
  createPedidoAccountHandler,
  createPedidoDetailHandler,
  createPedidoHandler,
  createPedidoPaymentHandler,
  deletePedidoDetailHandler,
  deletePedidoHandler,
  deletePedidoPaymentHandler,
  facturarPedidoHandler,
  getCierreDiarioHandler,
  getPedidoByIdHandler,
  listPaymentMethodsHandler,
  listPedidoAccountsHandler,
  listPedidoDetailsHandler,
  listPedidoPaymentsHandler,
  listPedidosHandler,
  movePedidoAccountDetailHandler,
  removePedidoAccountDetailHandler,
  reprintPedidoFacturaHandler,
  reprintPedidoHandler,
  reprintPedidoKitchenHandler,
  sendPedidoToKitchenHandler,
  updatePedidoDetailHandler,
  updatePedidoHandler,
  updatePedidoPaymentHandler,
} = require("../controllers/pedido.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const pedidoRouter = express.Router();

pedidoRouter.use(requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"));

pedidoRouter.get("/payment-methods", listPaymentMethodsHandler);
pedidoRouter.get("/cierre-diario", getCierreDiarioHandler);

pedidoRouter.get("/", listPedidosHandler);
pedidoRouter.get("/:id", getPedidoByIdHandler);
pedidoRouter.post("/", createPedidoHandler);
pedidoRouter.post("/:id/enviar-cocina", sendPedidoToKitchenHandler);
pedidoRouter.post("/:id/facturar", facturarPedidoHandler);
pedidoRouter.post("/:id/reimprimir", reprintPedidoHandler);
pedidoRouter.post("/:id/reimprimir-cocina", reprintPedidoKitchenHandler);
pedidoRouter.post("/:id/reimprimir-factura", reprintPedidoFacturaHandler);
pedidoRouter.put("/:id", updatePedidoHandler);
pedidoRouter.delete("/:id", deletePedidoHandler);

pedidoRouter.get("/:id/details", listPedidoDetailsHandler);
pedidoRouter.post("/:id/details", createPedidoDetailHandler);
pedidoRouter.put("/:id/details/:detailId", updatePedidoDetailHandler);
pedidoRouter.delete("/:id/details/:detailId", deletePedidoDetailHandler);

pedidoRouter.get("/:id/accounts", listPedidoAccountsHandler);
pedidoRouter.post("/:id/accounts", createPedidoAccountHandler);
pedidoRouter.post("/:id/accounts/:accountId/details", assignPedidoAccountDetailsHandler);
pedidoRouter.post("/:id/accounts/:accountId/details/:detailId/move", movePedidoAccountDetailHandler);
pedidoRouter.delete("/:id/accounts/:accountId/details/:detailId", removePedidoAccountDetailHandler);

pedidoRouter.get("/:id/payments", listPedidoPaymentsHandler);
pedidoRouter.post("/:id/payments", createPedidoPaymentHandler);
pedidoRouter.put("/:id/payments/:paymentId", updatePedidoPaymentHandler);
pedidoRouter.delete("/:id/payments/:paymentId", deletePedidoPaymentHandler);

module.exports = pedidoRouter;
