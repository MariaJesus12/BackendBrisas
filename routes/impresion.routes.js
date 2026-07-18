const express = require("express");

const {
  claimNextPrintQueueJobHandler,
  getPrintQueueJobHandler,
  listImpresorasHandler,
  listPrintQueueHandler,
  updatePrintQueueStatusHandler,
} = require("../controllers/impresion.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const impresionRouter = express.Router();

impresionRouter.use(requireAuth, requireRoles("ADMIN", "MESERO", "CAJERO"));

impresionRouter.get("/impresoras", listImpresorasHandler);
impresionRouter.get("/cola", listPrintQueueHandler);
impresionRouter.post("/cola/next", claimNextPrintQueueJobHandler);
impresionRouter.get("/cola/:id", getPrintQueueJobHandler);
impresionRouter.put("/cola/:id/status", updatePrintQueueStatusHandler);

module.exports = impresionRouter;