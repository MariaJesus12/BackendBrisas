const {
  claimNextColaImpresion,
  findColaImpresionById,
  listColaImpresion,
  listImpresoras,
  updateColaImpresionStatus,
} = require("../models/impresion.model");

const PRINT_TYPES = new Set(["COCINA", "FACTURA"]);
const PRINT_STATES = new Set(["PENDIENTE", "IMPRIMIENDO", "IMPRESO", "ERROR", "CANCELADO"]);

function normalizeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function parseDateTime(value) {
  if (value == null || value === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

async function listImpresorasHandler(req, res) {
  const onlyActive = req.query.active === "1" || req.query.active === "true";
  const tipo = req.query.tipo ? normalizeUpper(req.query.tipo) : undefined;

  if (tipo && !PRINT_TYPES.has(tipo)) {
    res.status(400).json({ message: "tipo invalido" });
    return;
  }

  const printers = await listImpresoras({ onlyActive, tipo });
  res.json({ printers });
}

async function listPrintQueueHandler(req, res) {
  const estado = req.query.estado ? normalizeUpper(req.query.estado) : undefined;
  const tipo = req.query.tipo ? normalizeUpper(req.query.tipo) : undefined;
  const pedidoId = req.query.pedidoId ? Number(req.query.pedidoId) : undefined;
  const impresoraId = req.query.impresoraId ? Number(req.query.impresoraId) : undefined;

  if (estado && !PRINT_STATES.has(estado)) {
    res.status(400).json({ message: "estado invalido" });
    return;
  }

  if (tipo && !PRINT_TYPES.has(tipo)) {
    res.status(400).json({ message: "tipo invalido" });
    return;
  }

  if (req.query.pedidoId && (!Number.isInteger(pedidoId) || pedidoId <= 0)) {
    res.status(400).json({ message: "pedidoId invalido" });
    return;
  }

  if (req.query.impresoraId && (!Number.isInteger(impresoraId) || impresoraId <= 0)) {
    res.status(400).json({ message: "impresoraId invalido" });
    return;
  }

  const jobs = await listColaImpresion({ estado, tipo, pedidoId, impresoraId });
  res.json({ jobs });
}

async function getPrintQueueJobHandler(req, res) {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    res.status(400).json({ message: "id de impresion invalido" });
    return;
  }

  const job = await findColaImpresionById(jobId);
  if (!job) {
    res.status(404).json({ message: "Trabajo de impresion no encontrado" });
    return;
  }

  res.json({ job });
}

async function claimNextPrintQueueJobHandler(req, res) {
  const body = req.body || {};
  const tipo = body.tipo ? normalizeUpper(body.tipo) : undefined;
  const impresoraId = body.impresoraId == null ? undefined : Number(body.impresoraId);

  if (tipo && !PRINT_TYPES.has(tipo)) {
    res.status(400).json({ message: "tipo invalido" });
    return;
  }

  if (body.impresoraId != null && (!Number.isInteger(impresoraId) || impresoraId <= 0)) {
    res.status(400).json({ message: "impresoraId invalido" });
    return;
  }

  const job = await claimNextColaImpresion({ tipo, impresoraId });

  if (!job) {
    res.status(404).json({ message: "No hay impresiones pendientes" });
    return;
  }

  res.json({
    message: "Trabajo de impresion reservado exitosamente",
    job,
  });
}

async function updatePrintQueueStatusHandler(req, res) {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    res.status(400).json({ message: "id de impresion invalido" });
    return;
  }

  const existingJob = await findColaImpresionById(jobId);
  if (!existingJob) {
    res.status(404).json({ message: "Trabajo de impresion no encontrado" });
    return;
  }

  const body = req.body || {};
  const estado = normalizeUpper(body.estado);
  const mensajeError = body.mensajeError == null ? body.mensaje_error : body.mensajeError;
  const fechaImpresion = parseDateTime(body.fechaImpresion ?? body.fecha_impresion);

  if (!PRINT_STATES.has(estado)) {
    res.status(400).json({ message: "estado invalido" });
    return;
  }

  if (estado === "ERROR" && !String(mensajeError || "").trim()) {
    res.status(400).json({ message: "mensajeError es requerido cuando el estado es ERROR" });
    return;
  }

  await updateColaImpresionStatus(jobId, {
    estado,
    mensajeError: mensajeError == null ? null : String(mensajeError).trim(),
    fechaImpresion,
  });

  const job = await findColaImpresionById(jobId);

  res.json({
    message: "Estado de impresion actualizado exitosamente",
    job,
  });
}

module.exports = {
  listImpresorasHandler,
  listPrintQueueHandler,
  getPrintQueueJobHandler,
  claimNextPrintQueueJobHandler,
  updatePrintQueueStatusHandler,
};