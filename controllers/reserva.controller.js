const { ensureReservaPlaceholderMesaId } = require("../models/mesa.model");
const { findActiveClienteById } = require("../models/cliente.model");
const {
  RESERVA_ESTADOS,
  createReserva,
  findReservaById,
  listMesasReservationStatus,
  listReservas,
  updateReserva,
  updateReservaEstado,
} = require("../models/reserva.model");
const { findUserById } = require("../models/user.model");
const {
  buildCostaRicaDateRangeFromDay,
  parseDateTimeInCostaRica,
  toCostaRicaMySqlDateTime,
} = require("../utils/costa-rica-time");

const ESTADOS_SET = new Set(RESERVA_ESTADOS);

function normalizeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function parseReservaCreateInput(body, authUser) {
  const fechaHoraRaw = body.fechaHora ?? body.fecha_hora;

  return {
    clienteId:
      body.clienteId == null || body.clienteId === ""
        ? body.cliente_id == null || body.cliente_id === ""
          ? null
          : Number(body.cliente_id)
        : Number(body.clienteId),
    usuarioId: Number(body.usuarioId ?? body.usuario_id ?? authUser?.id),
    nombreCliente: String(body.nombreCliente ?? body.nombre_cliente ?? body.nombre ?? "").trim(),
    telefono: String(body.telefono ?? "").trim(),
    fechaHora: parseDateTimeInCostaRica(fechaHoraRaw),
    cantidadPersonas: Number(body.cantidadPersonas ?? body.cantidad_personas),
    observaciones:
      body.observaciones == null && body.observacion == null
        ? null
        : String(body.observaciones ?? body.observacion).trim(),
    estado: normalizeUpper(body.estado || "PENDIENTE"),
  };
}

function parseReservaUpdateInput(body, existingReserva) {
  const hasClienteId = Object.prototype.hasOwnProperty.call(body, "clienteId");
  const hasClienteIdAlias = Object.prototype.hasOwnProperty.call(body, "cliente_id");
  const hasUsuarioId = Object.prototype.hasOwnProperty.call(body, "usuarioId");
  const hasUsuarioIdAlias = Object.prototype.hasOwnProperty.call(body, "usuario_id");
  const hasFechaHora = Object.prototype.hasOwnProperty.call(body, "fechaHora");
  const hasFechaHoraAlias = Object.prototype.hasOwnProperty.call(body, "fecha_hora");
  const hasNombreCliente = Object.prototype.hasOwnProperty.call(body, "nombreCliente");
  const hasNombreClienteAlias1 = Object.prototype.hasOwnProperty.call(body, "nombre_cliente");
  const hasNombreClienteAlias2 = Object.prototype.hasOwnProperty.call(body, "nombre");
  const hasTelefono = Object.prototype.hasOwnProperty.call(body, "telefono");

  const clienteRaw = hasClienteId ? body.clienteId : hasClienteIdAlias ? body.cliente_id : existingReserva.clienteId;
  const usuarioRaw = hasUsuarioId ? body.usuarioId : hasUsuarioIdAlias ? body.usuario_id : existingReserva.usuarioId;

  const incomingFechaHora = hasFechaHora ? body.fechaHora : hasFechaHoraAlias ? body.fecha_hora : existingReserva.fechaHora;

  const incomingNombreCliente = hasNombreCliente
    ? body.nombreCliente
    : hasNombreClienteAlias1
      ? body.nombre_cliente
      : hasNombreClienteAlias2
        ? body.nombre
        : existingReserva.nombreCliente;

  const incomingTelefono = hasTelefono ? body.telefono : existingReserva.telefono;

  return {
    clienteId: clienteRaw == null || clienteRaw === "" ? null : Number(clienteRaw),
    usuarioId: Number(usuarioRaw),
    nombreCliente: String(incomingNombreCliente ?? "").trim(),
    telefono: String(incomingTelefono ?? "").trim(),
    fechaHora: parseDateTimeInCostaRica(incomingFechaHora),
    cantidadPersonas: Object.prototype.hasOwnProperty.call(body, "cantidadPersonas")
      ? Number(body.cantidadPersonas)
      : Object.prototype.hasOwnProperty.call(body, "cantidad_personas")
        ? Number(body.cantidad_personas)
        : Number(existingReserva.cantidadPersonas),
    observaciones: Object.prototype.hasOwnProperty.call(body, "observaciones")
      ? body.observaciones == null
        ? null
        : String(body.observaciones).trim()
      : Object.prototype.hasOwnProperty.call(body, "observacion")
        ? body.observacion == null
          ? null
          : String(body.observacion).trim()
        : existingReserva.observaciones,
    estado: Object.prototype.hasOwnProperty.call(body, "estado") ? normalizeUpper(body.estado) : existingReserva.estado,
  };
}

function validateReservaInput(input) {
  const missingFields = [];

  if (!Number.isInteger(input.usuarioId) || input.usuarioId <= 0) missingFields.push("usuarioId");
  if (!input.nombreCliente) missingFields.push("nombreCliente");
  if (!input.telefono) missingFields.push("telefono");
  if (!(input.fechaHora instanceof Date) || Number.isNaN(input.fechaHora.getTime())) missingFields.push("fechaHora");
  if (!Number.isInteger(input.cantidadPersonas) || input.cantidadPersonas <= 0) missingFields.push("cantidadPersonas");
  if (!ESTADOS_SET.has(input.estado)) missingFields.push("estado");

  if (input.clienteId != null && (!Number.isInteger(input.clienteId) || input.clienteId <= 0)) {
    missingFields.push("clienteId");
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          clienteId: ["clienteId", "cliente_id"],
          usuarioId: ["usuarioId", "usuario_id"],
          nombreCliente: ["nombreCliente", "nombre_cliente", "nombre"],
          telefono: ["telefono"],
          fechaHora: ["fechaHora", "fecha_hora"],
          cantidadPersonas: ["cantidadPersonas", "cantidad_personas"],
          observaciones: ["observaciones", "observacion"],
        },
      },
    };
  }

  if (input.nombreCliente.length > 150) {
    return {
      ok: false,
      status: 400,
      payload: { message: "El nombre del cliente es demasiado largo (maximo 150 caracteres)" },
    };
  }

  if (input.telefono.length > 30) {
    return {
      ok: false,
      status: 400,
      payload: { message: "El telefono es demasiado largo (maximo 30 caracteres)" },
    };
  }

  if (input.observaciones && input.observaciones.length > 65535) {
    return {
      ok: false,
      status: 400,
      payload: { message: "Las observaciones son demasiado largas" },
    };
  }

  return { ok: true };
}

async function listReservasHandler(req, res) {
  const estado = req.query.estado ? normalizeUpper(req.query.estado) : undefined;
  const clienteId = req.query.clienteId ?? req.query.cliente_id;
  const usuarioId = req.query.usuarioId ?? req.query.usuario_id;

  let fechaDesde = req.query.fechaDesde ?? req.query.fecha_desde;
  let fechaHasta = req.query.fechaHasta ?? req.query.fecha_hasta;

  if (req.query.fecha) {
    const range = buildCostaRicaDateRangeFromDay(req.query.fecha);
    if (!range) {
      res.status(400).json({ message: "fecha invalida. Formato esperado: YYYY-MM-DD" });
      return;
    }

    fechaDesde = range.from;
    fechaHasta = range.to;
  }

  if (estado && !ESTADOS_SET.has(estado)) {
    res.status(400).json({
      message: "estado invalido",
      acceptedEstados: RESERVA_ESTADOS,
    });
    return;
  }

  if (fechaDesde && !parseDateTimeInCostaRica(fechaDesde)) {
    res.status(400).json({ message: "fechaDesde invalida" });
    return;
  }

  if (fechaHasta && !parseDateTimeInCostaRica(fechaHasta)) {
    res.status(400).json({ message: "fechaHasta invalida" });
    return;
  }

  if (clienteId != null && clienteId !== "" && (!Number.isInteger(Number(clienteId)) || Number(clienteId) <= 0)) {
    res.status(400).json({ message: "clienteId invalido" });
    return;
  }

  if (usuarioId != null && usuarioId !== "" && (!Number.isInteger(Number(usuarioId)) || Number(usuarioId) <= 0)) {
    res.status(400).json({ message: "usuarioId invalido" });
    return;
  }

  const reservas = await listReservas({
    estado,
    clienteId: clienteId == null || clienteId === "" ? undefined : Number(clienteId),
    usuarioId: usuarioId == null || usuarioId === "" ? undefined : Number(usuarioId),
    fechaDesde: fechaDesde ? toCostaRicaMySqlDateTime(parseDateTimeInCostaRica(fechaDesde)) : undefined,
    fechaHasta: fechaHasta ? toCostaRicaMySqlDateTime(parseDateTimeInCostaRica(fechaHasta)) : undefined,
  });

  res.json({ reservas });
}

async function getReservaByIdHandler(req, res) {
  const reservaId = Number(req.params.id);
  if (!Number.isInteger(reservaId) || reservaId <= 0) {
    res.status(400).json({ message: "id de reserva invalido" });
    return;
  }

  const reserva = await findReservaById(reservaId);
  if (!reserva) {
    res.status(404).json({ message: "Reserva no encontrada" });
    return;
  }

  res.json({ reserva });
}

async function createReservaHandler(req, res) {
  const input = parseReservaCreateInput(req.body || {}, req.authUser);
  const validation = validateReservaInput(input);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const usuario = await findUserById(input.usuarioId);
  if (!usuario || !usuario.activo) {
    res.status(409).json({ message: "El usuario no existe o no esta activo" });
    return;
  }

  if (input.clienteId != null) {
    const cliente = await findActiveClienteById(input.clienteId);
    if (!cliente) {
      res.status(409).json({ message: "El cliente no existe o no esta activo" });
      return;
    }
  }

  const mesaId = await ensureReservaPlaceholderMesaId();

  const reservaId = await createReserva({
    ...input,
    mesaId,
    fechaHora: toCostaRicaMySqlDateTime(input.fechaHora),
  });

  const reserva = await findReservaById(reservaId);

  res.status(201).json({
    message: "Reserva creada exitosamente",
    reserva,
  });
}

async function updateReservaHandler(req, res) {
  const reservaId = Number(req.params.id);
  if (!Number.isInteger(reservaId) || reservaId <= 0) {
    res.status(400).json({ message: "id de reserva invalido" });
    return;
  }

  const existingReserva = await findReservaById(reservaId);
  if (!existingReserva) {
    res.status(404).json({ message: "Reserva no encontrada" });
    return;
  }

  const input = parseReservaUpdateInput(req.body || {}, existingReserva);
  const validation = validateReservaInput(input);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const usuario = await findUserById(input.usuarioId);
  if (!usuario || !usuario.activo) {
    res.status(409).json({ message: "El usuario no existe o no esta activo" });
    return;
  }

  if (input.clienteId != null) {
    const cliente = await findActiveClienteById(input.clienteId);
    if (!cliente) {
      res.status(409).json({ message: "El cliente no existe o no esta activo" });
      return;
    }
  }

  await updateReserva(reservaId, {
    ...input,
    fechaHora: toCostaRicaMySqlDateTime(input.fechaHora),
  });

  const reserva = await findReservaById(reservaId);

  res.json({
    message: "Reserva actualizada exitosamente",
    reserva,
  });
}

async function updateReservaEstadoHandler(req, res) {
  const reservaId = Number(req.params.id);
  if (!Number.isInteger(reservaId) || reservaId <= 0) {
    res.status(400).json({ message: "id de reserva invalido" });
    return;
  }

  const estado = normalizeUpper((req.body || {}).estado);
  if (!ESTADOS_SET.has(estado)) {
    res.status(400).json({
      message: "estado invalido",
      acceptedEstados: RESERVA_ESTADOS,
    });
    return;
  }

  const existingReserva = await findReservaById(reservaId);
  if (!existingReserva) {
    res.status(404).json({ message: "Reserva no encontrada" });
    return;
  }

  await updateReservaEstado(reservaId, estado);
  const reserva = await findReservaById(reservaId);

  res.json({
    message: "Estado de reserva actualizado exitosamente",
    reserva,
  });
}

async function listMesasReservationStatusHandler(req, res) {
  const rawAt = req.query.at;
  const referenceDateTime = rawAt ? parseDateTimeInCostaRica(rawAt) : new Date();

  if (!referenceDateTime || Number.isNaN(referenceDateTime.getTime())) {
    res.status(400).json({
      message: "Parametro at invalido",
      hint: "Usa formato ISO, por ejemplo 2026-08-07T15:00:00",
    });
    return;
  }

  const onlyActiveMesas = !(req.query.includeInactive === "1" || req.query.includeInactive === "true");

  const mesas = await listMesasReservationStatus({
    referenceDateTime: toCostaRicaMySqlDateTime(referenceDateTime),
    onlyActiveMesas,
  });

  res.json({
    referenceDateTime: toCostaRicaMySqlDateTime(referenceDateTime),
    mesas,
  });
}

module.exports = {
  listReservasHandler,
  getReservaByIdHandler,
  createReservaHandler,
  updateReservaHandler,
  updateReservaEstadoHandler,
  listMesasReservationStatusHandler,
};
