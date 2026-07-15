const {
  createMesa,
  findMesaById,
  findMesaByNumero,
  listMesas,
  softDeleteMesa,
  updateMesa,
} = require("../models/mesa.model");

function parseMesaInput(body) {
  return {
    numero: Number(body.numero),
    capacidad: Number(body.capacidad),
    observacion: body.observacion == null ? null : String(body.observacion).trim(),
    activa: body.activa === 0 || body.activa === false ? 0 : 1,
  };
}

function validateMesaInput(mesa) {
  const missingFields = [];

  if (!Number.isInteger(mesa.numero) || mesa.numero <= 0) missingFields.push("numero");
  if (!Number.isInteger(mesa.capacidad) || mesa.capacidad <= 0) missingFields.push("capacidad");

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
      },
    };
  }

  if (mesa.observacion && mesa.observacion.length > 65535) {
    return {
      ok: false,
      status: 400,
      payload: { message: "La observacion es demasiado larga" },
    };
  }

  return { ok: true };
}

async function listMesasHandler(req, res) {
  const onlyActive = req.query.active === "1" || req.query.active === "true";
  const mesas = await listMesas({ onlyActive });
  res.json({ mesas });
}

async function getMesaByIdHandler(req, res) {
  const mesaId = Number(req.params.id);
  if (!Number.isInteger(mesaId) || mesaId <= 0) {
    res.status(400).json({ message: "id de mesa invalido" });
    return;
  }

  const mesa = await findMesaById(mesaId);
  if (!mesa) {
    res.status(404).json({ message: "Mesa no encontrada" });
    return;
  }

  res.json({ mesa });
}

async function createMesaHandler(req, res) {
  const mesaInput = parseMesaInput(req.body || {});
  const validation = validateMesaInput(mesaInput);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const existingMesa = await findMesaByNumero(mesaInput.numero);
  if (existingMesa) {
    res.status(409).json({ message: "Ya existe una mesa con ese numero" });
    return;
  }

  const mesaId = await createMesa(mesaInput);
  const mesa = await findMesaById(mesaId);

  res.status(201).json({
    message: "Mesa creada exitosamente",
    mesa,
  });
}

async function updateMesaHandler(req, res) {
  const mesaId = Number(req.params.id);
  if (!Number.isInteger(mesaId) || mesaId <= 0) {
    res.status(400).json({ message: "id de mesa invalido" });
    return;
  }

  const existingMesa = await findMesaById(mesaId);
  if (!existingMesa) {
    res.status(404).json({ message: "Mesa no encontrada" });
    return;
  }

  const mesaInput = parseMesaInput(req.body || {});
  const validation = validateMesaInput(mesaInput);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const duplicatedByNumero = await findMesaByNumero(mesaInput.numero);
  if (duplicatedByNumero && duplicatedByNumero.id !== mesaId) {
    res.status(409).json({ message: "Ya existe otra mesa con ese numero" });
    return;
  }

  await updateMesa(mesaId, mesaInput);
  const updatedMesa = await findMesaById(mesaId);

  res.json({
    message: "Mesa actualizada exitosamente",
    mesa: updatedMesa,
  });
}

async function deleteMesaHandler(req, res) {
  const mesaId = Number(req.params.id);
  if (!Number.isInteger(mesaId) || mesaId <= 0) {
    res.status(400).json({ message: "id de mesa invalido" });
    return;
  }

  const existingMesa = await findMesaById(mesaId);
  if (!existingMesa) {
    res.status(404).json({ message: "Mesa no encontrada" });
    return;
  }

  await softDeleteMesa(mesaId);
  const updatedMesa = await findMesaById(mesaId);

  res.json({
    message: "Mesa desactivada exitosamente",
    mesa: updatedMesa,
  });
}

module.exports = {
  listMesasHandler,
  getMesaByIdHandler,
  createMesaHandler,
  updateMesaHandler,
  deleteMesaHandler,
};
