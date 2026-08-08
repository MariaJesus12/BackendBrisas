const { findMesaById } = require("../models/mesa.model");
const { findActiveClienteById } = require("../models/cliente.model");
const {
  RESERVA_ESTADOS,
  RESERVA_ESTADOS_ACTIVOS,
  countReservaConflicts,
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
const ESTADOS_ACTIVOS_SET = new Set(RESERVA_ESTADOS_ACTIVOS);

function normalizeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function parseReservaCreateInput(body, authUser) {
  const fechaHoraRaw = body.fechaHora ?? body.fecha_hora;

  return {
    mesaId: Number(body.mesaId ?? body.mesa_id),
    clienteId:
      body.clienteId == null || body.clienteId === ""
        ? body.cliente_id == null || body.cliente_id === ""
          ? null
          : Number(body.cliente_id)
        : Number(body.clienteId),
    usuarioId: Number(body.usuarioId ?? body.usuario_id ?? authUser?.id),
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
  const hasMesaId = Object.prototype.hasOwnProperty.call(body, "mesaId");
  const hasMesaIdAlias = Object.prototype.hasOwnProperty.call(body, "mesa_id");
  const hasClienteId = Object.prototype.hasOwnProperty.call(body, "clienteId");
  const hasClienteIdAlias = Object.prototype.hasOwnProperty.call(body, "cliente_id");
  const hasUsuarioId = Object.prototype.hasOwnProperty.call(body, "usuarioId");
  const hasUsuarioIdAlias = Object.prototype.hasOwnProperty.call(body, "usuario_id");
  const hasFechaHora = Object.prototype.hasOwnProperty.call(body, "fechaHora");
  const hasFechaHoraAlias = Object.prototype.hasOwnProperty.call(body, "fecha_hora");

  const mesaRaw = hasMesaId ? body.mesaId : hasMesaIdAlias ? body.mesa_id : existingReserva.mesaId;
  const clienteRaw = hasClienteId ? body.clienteId : hasClienteIdAlias ? body.cliente_id : existingReserva.clienteId;
  const usuarioRaw = hasUsuarioId ? body.usuarioId : hasUsuarioIdAlias ? body.usuario_id : existingReserva.usuarioId;

  const incomingFechaHora = hasFechaHora ? body.fechaHora : hasFechaHoraAlias ? body.fecha_hora : existingReserva.fechaHora;

  return {
    mesaId: Number(mesaRaw),
    clienteId: clienteRaw == null || clienteRaw === "" ? null : Number(clienteRaw),
    usuarioId: Number(usuarioRaw),
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

  if (!Number.isInteger(input.mesaId) || input.mesaId <= 0) missingFields.push("mesaId");
  if (!Number.isInteger(input.clienteId) || input.clienteId <= 0) missingFields.push("clienteId");
  if (!Number.isInteger(input.usuarioId) || input.usuarioId <= 0) missingFields.push("usuarioId");
  if (!(input.fechaHora instanceof Date) || Number.isNaN(input.fechaHora.getTime())) missingFields.push("fechaHora");
  if (!Number.isInteger(input.cantidadPersonas) || input.cantidadPersonas <= 0) missingFields.push("cantidadPersonas");
  if (!ESTADOS_SET.has(input.estado)) missingFields.push("estado");

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          mesaId: ["mesaId", "mesa_id"],
          clienteId: ["clienteId", "cliente_id"],
          usuarioId: ["usuarioId", "usuario_id"],
          fechaHora: ["fechaHora", "fecha_hora"],
          cantidadPersonas: ["cantidadPersonas", "cantidad_personas"],
          observaciones: ["observaciones", "observacion"],
        },
      },
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
  const mesaId = req.query.mesaId ?? req.query.mesa_id;
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

  if (mesaId != null && mesaId !== "" && (!Number.isInteger(Number(mesaId)) || Number(mesaId) <= 0)) {
    res.status(400).json({ message: "mesaId invalido" });
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
    mesaId: mesaId == null || mesaId === "" ? undefined : Number(mesaId),
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

  const mesa = await findMesaById(input.mesaId);
  if (!mesa || !mesa.activa) {
    res.status(409).json({ message: "La mesa no existe o no esta activa" });
    return;
  }

  const usuario = await findUserById(input.usuarioId);
  if (!usuario || !usuario.activo) {
    res.status(409).json({ message: "El usuario no existe o no esta activo" });
    return;
  }

  const cliente = await findActiveClienteById(input.clienteId);
  if (!cliente) {
    res.status(409).json({ message: "El cliente no existe o no esta activo" });
    return;
  }

  if (ESTADOS_ACTIVOS_SET.has(input.estado)) {
    const conflicts = await countReservaConflicts({
      mesaId: input.mesaId,
      fechaHora: toCostaRicaMySqlDateTime(input.fechaHora),
    });

    if (conflicts > 0) {
      res.status(409).json({
        message: "La mesa ya tiene una reserva que se cruza en la ventana de bloqueo",
        businessRule: "Cada reserva bloquea la mesa 2 horas antes de la hora reservada",
      });
      return;
    }
  }

  const reservaId = await createReserva({
    ...input,
    nombreCliente: cliente.nombre,
    telefono: cliente.telefono,
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

  const mesa = await findMesaById(input.mesaId);
  if (!mesa || !mesa.activa) {
    res.status(409).json({ message: "La mesa no existe o no esta activa" });
    return;
  }

  const usuario = await findUserById(input.usuarioId);
  if (!usuario || !usuario.activo) {
    res.status(409).json({ message: "El usuario no existe o no esta activo" });
    return;
  }

  const cliente = await findActiveClienteById(input.clienteId);
  if (!cliente) {
    res.status(409).json({ message: "El cliente no existe o no esta activo" });
    return;
  }

  if (ESTADOS_ACTIVOS_SET.has(input.estado)) {
    const conflicts = await countReservaConflicts({
      mesaId: input.mesaId,
      fechaHora: toCostaRicaMySqlDateTime(input.fechaHora),
      excludeReservaId: reservaId,
    });

    if (conflicts > 0) {
      res.status(409).json({
        message: "La mesa ya tiene una reserva que se cruza en la ventana de bloqueo",
        businessRule: "Cada reserva bloquea la mesa 2 horas antes de la hora reservada",
      });
      return;
    }
  }

  await updateReserva(reservaId, {
    ...input,
    nombreCliente: cliente.nombre,
    telefono: cliente.telefono,
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

  if (ESTADOS_ACTIVOS_SET.has(estado)) {
    const conflicts = await countReservaConflicts({
      mesaId: existingReserva.mesaId,
      fechaHora: toCostaRicaMySqlDateTime(existingReserva.fechaHora),
      excludeReservaId: reservaId,
    });

    if (conflicts > 0) {
      res.status(409).json({
        message: "No se puede activar la reserva porque se cruza con otra reserva activa",
      });
      return;
    }
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
