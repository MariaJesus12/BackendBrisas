const {
  createMesa,
  findMesaById,
  findMesaByNumero,
  softDeleteMesa,
  updateMesa,
} = require("../models/mesa.model");
const { listMesasReservationStatus } = require("../models/reserva.model");

function parseDateTimeInput(value) {
  if (value == null || value === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toMySqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

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
  const referenceDateTime = req.query.at ? parseDateTimeInput(req.query.at) : new Date();

  if (!referenceDateTime) {
    res.status(400).json({
      message: "Parametro at invalido",
      hint: "Usa formato ISO, por ejemplo 2026-08-07T15:00:00",
    });
    return;
  }

  const mesas = await listMesasReservationStatus({
    referenceDateTime: toMySqlDateTime(referenceDateTime),
    onlyActiveMesas: onlyActive,
  });

  res.json({
    referenceDateTime: toMySqlDateTime(referenceDateTime),
    mesas,
  });
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

  const referenceDateTime = req.query.at ? parseDateTimeInput(req.query.at) : new Date();
  if (!referenceDateTime) {
    res.status(400).json({
      message: "Parametro at invalido",
      hint: "Usa formato ISO, por ejemplo 2026-08-07T15:00:00",
    });
    return;
  }

  const mesasWithStatus = await listMesasReservationStatus({
    referenceDateTime: toMySqlDateTime(referenceDateTime),
    onlyActiveMesas: false,
  });

  const mesaWithStatus = mesasWithStatus.find((item) => item.id === mesaId) || {
    ...mesa,
    reservada: false,
    reservaActiva: null,
  };

  res.json({
    referenceDateTime: toMySqlDateTime(referenceDateTime),
    mesa: mesaWithStatus,
  });
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
