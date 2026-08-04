const {
  createTipoCambio,
  findTipoCambioById,
  listTipoCambio,
  updateTipoCambio,
} = require("../models/tipo-cambio.model");

function parseDateInput(value) {
  if (typeof value !== "string") {
    return null;
  }

  const fecha = value.trim();
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return null;
  }

  return fecha;
}

function parseDecimalInput(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function listTipoCambioHandler(req, res) {
  const onlyActive = req.query.active === "1" || req.query.active === "true";
  const tipoCambio = await listTipoCambio({ onlyActive });

  res.json({ tipoCambio });
}

async function getTipoCambioByIdHandler(req, res) {
  const tipoCambioId = Number(req.params.id);
  if (!Number.isInteger(tipoCambioId) || tipoCambioId <= 0) {
    res.status(400).json({ message: "id de tipo de cambio invalido" });
    return;
  }

  const tipoCambio = await findTipoCambioById(tipoCambioId);
  if (!tipoCambio) {
    res.status(404).json({ message: "Tipo de cambio no encontrado" });
    return;
  }

  res.json({ tipoCambio });
}

async function createTipoCambioHandler(req, res) {
  const body = req.body || {};
  const fecha = parseDateInput(body.fecha);
  const compra = parseDecimalInput(body.compra);
  const venta = parseDecimalInput(body.venta);

  if (!fecha || compra === null || venta === null) {
    res.status(400).json({ message: "Los campos fecha, compra y venta son obligatorios y deben ser válidos" });
    return;
  }

  const activo = body.activo === 0 || body.activo === false ? 0 : 1;
  const usuarioId = req.authUser?.id;

  if (!usuarioId) {
    res.status(401).json({ message: "No autenticado" });
    return;
  }

  const tipoCambioId = await createTipoCambio({ fecha, compra, venta, activo, usuarioId });
  const tipoCambio = await findTipoCambioById(tipoCambioId);

  res.status(201).json({
    message: "Tipo de cambio creado exitosamente",
    tipoCambio,
  });
}

async function updateTipoCambioHandler(req, res) {
  const tipoCambioId = Number(req.params.id);
  if (!Number.isInteger(tipoCambioId) || tipoCambioId <= 0) {
    res.status(400).json({ message: "id de tipo de cambio invalido" });
    return;
  }

  const existingTipoCambio = await findTipoCambioById(tipoCambioId);
  if (!existingTipoCambio) {
    res.status(404).json({ message: "Tipo de cambio no encontrado" });
    return;
  }

  const body = req.body || {};
  const fecha = body.fecha === undefined ? existingTipoCambio.fecha : parseDateInput(body.fecha);
  if (body.fecha !== undefined && !fecha) {
    res.status(400).json({ message: "La fecha debe tener el formato yyyy-mm-dd" });
    return;
  }

  const compra = body.compra === undefined ? existingTipoCambio.compra : parseDecimalInput(body.compra);
  if (body.compra !== undefined && compra === null) {
    res.status(400).json({ message: "El valor de compra debe ser un número mayor a 0" });
    return;
  }

  const venta = body.venta === undefined ? existingTipoCambio.venta : parseDecimalInput(body.venta);
  if (body.venta !== undefined && venta === null) {
    res.status(400).json({ message: "El valor de venta debe ser un número mayor a 0" });
    return;
  }

  const activo = body.activo === undefined ? (existingTipoCambio.activo ? 1 : 0) : body.activo === 0 || body.activo === false ? 0 : 1;
  const usuarioId = req.authUser?.id || existingTipoCambio.usuarioId;

  await updateTipoCambio(tipoCambioId, { fecha, compra, venta, activo, usuarioId });
  const updatedTipoCambio = await findTipoCambioById(tipoCambioId);

  res.json({
    message: "Tipo de cambio actualizado exitosamente",
    tipoCambio: updatedTipoCambio,
  });
}

module.exports = {
  listTipoCambioHandler,
  getTipoCambioByIdHandler,
  createTipoCambioHandler,
  updateTipoCambioHandler,
};
