const {
  createCliente,
  findClienteById,
  findClienteDuplicateByNombreTelefono,
  listClientes,
  softDeleteCliente,
  updateCliente,
} = require("../models/cliente.model");

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizePhone(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function parseClienteInput(body, existingCliente = null) {
  const hasNombre = Object.prototype.hasOwnProperty.call(body, "nombre");
  const hasTelefono = Object.prototype.hasOwnProperty.call(body, "telefono");
  const hasObservaciones = Object.prototype.hasOwnProperty.call(body, "observaciones");
  const hasObservacion = Object.prototype.hasOwnProperty.call(body, "observacion");
  const hasActivo = Object.prototype.hasOwnProperty.call(body, "activo");

  return {
    nombre: hasNombre ? normalizeName(body.nombre) : normalizeName(existingCliente?.nombre),
    telefono: hasTelefono ? normalizePhone(body.telefono) : normalizePhone(existingCliente?.telefono),
    observaciones: hasObservaciones
      ? body.observaciones == null
        ? null
        : String(body.observaciones).trim()
      : hasObservacion
        ? body.observacion == null
          ? null
          : String(body.observacion).trim()
        : existingCliente?.observaciones ?? null,
    activo: hasActivo ? (body.activo === 0 || body.activo === false ? 0 : 1) : existingCliente ? (existingCliente.activo ? 1 : 0) : 1,
  };
}

function validateClienteInput(input) {
  const missingFields = [];

  if (!input.nombre) missingFields.push("nombre");
  if (!input.telefono) missingFields.push("telefono");

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          observaciones: ["observaciones", "observacion"],
        },
      },
    };
  }

  if (input.nombre.length > 150) {
    return {
      ok: false,
      status: 400,
      payload: { message: "El nombre no puede exceder 150 caracteres" },
    };
  }

  if (input.telefono.length > 20) {
    return {
      ok: false,
      status: 400,
      payload: { message: "El telefono no puede exceder 20 caracteres" },
    };
  }

  if (input.observaciones && input.observaciones.length > 255) {
    return {
      ok: false,
      status: 400,
      payload: { message: "Las observaciones no pueden exceder 255 caracteres" },
    };
  }

  return { ok: true };
}

async function listClientesHandler(req, res) {
  const onlyActive = req.query.active === "1" || req.query.active === "true";
  const q = req.query.q ? String(req.query.q).trim() : undefined;
  const nombre = req.query.nombre ? String(req.query.nombre).trim() : undefined;
  const telefono = req.query.telefono ? String(req.query.telefono).trim() : undefined;

  const clientes = await listClientes({ onlyActive, q, nombre, telefono });
  res.json({ clientes });
}

async function getClienteByIdHandler(req, res) {
  const clienteId = Number(req.params.id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    res.status(400).json({ message: "id de cliente invalido" });
    return;
  }

  const cliente = await findClienteById(clienteId);
  if (!cliente) {
    res.status(404).json({ message: "Cliente no encontrado" });
    return;
  }

  res.json({ cliente });
}

async function createClienteHandler(req, res) {
  const input = parseClienteInput(req.body || {});
  const validation = validateClienteInput(input);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const duplicatedCliente = await findClienteDuplicateByNombreTelefono({
    nombre: input.nombre,
    telefono: input.telefono,
  });

  if (duplicatedCliente) {
    res.status(409).json({
      message: "Ya existe un cliente con ese nombre y telefono",
      existingCliente: duplicatedCliente,
    });
    return;
  }

  const clienteId = await createCliente(input);
  const cliente = await findClienteById(clienteId);

  res.status(201).json({
    message: "Cliente creado exitosamente",
    cliente,
  });
}

async function updateClienteHandler(req, res) {
  const clienteId = Number(req.params.id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    res.status(400).json({ message: "id de cliente invalido" });
    return;
  }

  const existingCliente = await findClienteById(clienteId);
  if (!existingCliente) {
    res.status(404).json({ message: "Cliente no encontrado" });
    return;
  }

  const input = parseClienteInput(req.body || {}, existingCliente);
  const validation = validateClienteInput(input);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const duplicatedCliente = await findClienteDuplicateByNombreTelefono({
    nombre: input.nombre,
    telefono: input.telefono,
    excludeClienteId: clienteId,
  });

  if (duplicatedCliente) {
    res.status(409).json({
      message: "Ya existe otro cliente con ese nombre y telefono",
      existingCliente: duplicatedCliente,
    });
    return;
  }

  await updateCliente(clienteId, input);
  const cliente = await findClienteById(clienteId);

  res.json({
    message: "Cliente actualizado exitosamente",
    cliente,
  });
}

async function deleteClienteHandler(req, res) {
  const clienteId = Number(req.params.id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    res.status(400).json({ message: "id de cliente invalido" });
    return;
  }

  const existingCliente = await findClienteById(clienteId);
  if (!existingCliente) {
    res.status(404).json({ message: "Cliente no encontrado" });
    return;
  }

  await softDeleteCliente(clienteId);
  const cliente = await findClienteById(clienteId);

  res.json({
    message: "Cliente desactivado exitosamente",
    cliente,
  });
}

module.exports = {
  listClientesHandler,
  getClienteByIdHandler,
  createClienteHandler,
  updateClienteHandler,
  deleteClienteHandler,
};
