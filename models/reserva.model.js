const { query } = require("../config/database");
const { getCurrentCostaRicaDateTimeString } = require("../utils/costa-rica-time");

const RESERVA_ESTADOS = ["PENDIENTE", "CONFIRMADA", "ATENDIDA", "CANCELADA"];
const RESERVA_ESTADOS_ACTIVOS = ["PENDIENTE", "CONFIRMADA"];

// mesa_id ya no representa una mesa real (ver mesa.model.js ensureReservaPlaceholderMesaId),
// por lo que no se expone en la respuesta de la API.
function toReserva(row) {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    clienteNombre: row.nombre_cliente,
    clienteTelefono: row.telefono,
    usuarioId: row.usuario_id,
    usuarioNombre: row.usuario_nombre,
    nombreCliente: row.nombre_cliente,
    telefono: row.telefono,
    fechaHora: row.fecha_hora,
    cantidadPersonas: row.cantidad_personas,
    observaciones: row.observaciones,
    estado: row.estado,
    createdAt: row.created_at,
  };
}

async function listReservas({ estado, mesaId, clienteId, usuarioId, fechaDesde, fechaHasta } = {}) {
  const filters = [];
  const params = [];

  if (estado) {
    filters.push("r.estado = ?");
    params.push(estado);
  }

  if (mesaId) {
    filters.push("r.mesa_id = ?");
    params.push(mesaId);
  }

  if (clienteId) {
    filters.push("r.cliente_id = ?");
    params.push(clienteId);
  }

  if (usuarioId) {
    filters.push("r.usuario_id = ?");
    params.push(usuarioId);
  }

  if (fechaDesde) {
    filters.push("r.fecha_hora >= ?");
    params.push(fechaDesde);
  }

  if (fechaHasta) {
    filters.push("r.fecha_hora <= ?");
    params.push(fechaHasta);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await query(
    `
    SELECT
      r.id,
      r.cliente_id,
      r.usuario_id,
      u.nombre AS usuario_nombre,
      COALESCE(c.nombre, r.nombre_cliente) AS nombre_cliente,
      COALESCE(c.telefono, r.telefono) AS telefono,
      r.fecha_hora,
      r.cantidad_personas,
      r.observaciones,
      r.estado,
      r.created_at
    FROM reservas r
    LEFT JOIN clientes c ON c.id = r.cliente_id
    INNER JOIN usuarios u ON u.id = r.usuario_id
    ${whereClause}
    ORDER BY r.fecha_hora ASC, r.id ASC
    `,
    params,
  );

  return rows.map(toReserva);
}

async function findReservaById(reservaId) {
  const rows = await query(
    `
    SELECT
      r.id,
      r.cliente_id,
      r.usuario_id,
      u.nombre AS usuario_nombre,
      COALESCE(c.nombre, r.nombre_cliente) AS nombre_cliente,
      COALESCE(c.telefono, r.telefono) AS telefono,
      r.fecha_hora,
      r.cantidad_personas,
      r.observaciones,
      r.estado,
      r.created_at
    FROM reservas r
    LEFT JOIN clientes c ON c.id = r.cliente_id
    INNER JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.id = ?
    LIMIT 1
    `,
    [reservaId],
  );

  const row = rows[0];
  return row ? toReserva(row) : null;
}

async function createReserva({
  mesaId,
  clienteId,
  usuarioId,
  nombreCliente,
  telefono,
  fechaHora,
  cantidadPersonas,
  observaciones,
  estado,
  createdAt,
}) {
  const currentCreatedAt = createdAt || getCurrentCostaRicaDateTimeString();
  const result = await query(
    `
    INSERT INTO reservas (
      mesa_id,
      cliente_id,
      usuario_id,
      nombre_cliente,
      telefono,
      fecha_hora,
      cantidad_personas,
      observaciones,
      estado,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [mesaId, clienteId, usuarioId, nombreCliente, telefono, fechaHora, cantidadPersonas, observaciones, estado, currentCreatedAt],
  );

  return result.insertId;
}

async function updateReserva(
  reservaId,
  { mesaId, clienteId, usuarioId, nombreCliente, telefono, fechaHora, cantidadPersonas, observaciones, estado },
) {
  const result = await query(
    `
    UPDATE reservas
    SET
      mesa_id = ?,
      cliente_id = ?,
      usuario_id = ?,
      nombre_cliente = ?,
      telefono = ?,
      fecha_hora = ?,
      cantidad_personas = ?,
      observaciones = ?,
      estado = ?
    WHERE id = ?
    `,
    [mesaId, clienteId, usuarioId, nombreCliente, telefono, fechaHora, cantidadPersonas, observaciones, estado, reservaId],
  );

  return result.affectedRows;
}

async function updateReservaEstado(reservaId, estado) {
  const result = await query(
    `
    UPDATE reservas
    SET estado = ?
    WHERE id = ?
    `,
    [estado, reservaId],
  );

  return result.affectedRows;
}

async function findActiveReservaByMesaAt({ mesaId, referenceDateTime }) {
  const rows = await query(
    `
    SELECT
      r.id,
      r.mesa_id,
      m.numero AS mesa_numero,
      r.cliente_id,
      r.usuario_id,
      u.nombre AS usuario_nombre,
      COALESCE(c.nombre, r.nombre_cliente) AS nombre_cliente,
      COALESCE(c.telefono, r.telefono) AS telefono,
      r.fecha_hora,
      r.cantidad_personas,
      r.observaciones,
      r.estado,
      r.created_at,
      DATE_SUB(r.fecha_hora, INTERVAL 2 HOUR) AS bloqueo_inicio,
      1 AS bloqueo_activo
    FROM reservas r
    INNER JOIN mesas m ON m.id = r.mesa_id
    LEFT JOIN clientes c ON c.id = r.cliente_id
    INNER JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.mesa_id = ?
      AND r.estado IN ('PENDIENTE', 'CONFIRMADA')
      AND ? BETWEEN DATE_SUB(r.fecha_hora, INTERVAL 2 HOUR) AND r.fecha_hora
    ORDER BY r.fecha_hora ASC, r.id ASC
    LIMIT 1
    `,
    [mesaId, referenceDateTime],
  );

  const row = rows[0];
  return row ? toReserva(row) : null;
}

async function listMesasReservationStatus({ referenceDateTime, onlyActiveMesas = true } = {}) {
  // Las reservas ya no se vinculan con mesas reales; se excluye la mesa interna placeholder.
  const filters = ["COALESCE(m.observacion, '') <> '__RESERVA_PLACEHOLDER__'"];
  const params = [referenceDateTime];

  if (onlyActiveMesas) {
    filters.push("m.activa = 1");
  }

  const whereClause = `WHERE ${filters.join(" AND ")}`;

  const rows = await query(
    `
    SELECT
      m.id,
      m.numero,
      m.capacidad,
      m.observacion,
      m.activa,
      m.created_at,
      r.id AS reserva_id,
      r.cliente_id AS reserva_cliente_id,
      COALESCE(c.nombre, r.nombre_cliente) AS reserva_nombre_cliente,
      COALESCE(c.telefono, r.telefono) AS reserva_telefono,
      r.fecha_hora AS reserva_fecha_hora,
      r.cantidad_personas AS reserva_cantidad_personas,
      r.observaciones AS reserva_observaciones,
      r.estado AS reserva_estado,
      DATE_SUB(r.fecha_hora, INTERVAL 2 HOUR) AS reserva_bloqueo_inicio
    FROM mesas m
    LEFT JOIN reservas r ON r.id = (
      SELECT r2.id
      FROM reservas r2
      WHERE r2.mesa_id = m.id
        AND r2.estado IN ('PENDIENTE', 'CONFIRMADA')
        AND ? BETWEEN DATE_SUB(r2.fecha_hora, INTERVAL 2 HOUR) AND r2.fecha_hora
      ORDER BY r2.fecha_hora ASC, r2.id ASC
      LIMIT 1
    )
    LEFT JOIN clientes c ON c.id = r.cliente_id
    ${whereClause}
    ORDER BY m.numero ASC
    `,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    numero: row.numero,
    capacidad: row.capacidad,
    observacion: row.observacion,
    activa: row.activa === 1,
    createdAt: row.created_at,
    reservada: Boolean(row.reserva_id),
    reservaActiva: row.reserva_id
      ? {
          id: row.reserva_id,
          clienteId: row.reserva_cliente_id,
          nombreCliente: row.reserva_nombre_cliente,
          telefono: row.reserva_telefono,
          fechaHora: row.reserva_fecha_hora,
          cantidadPersonas: row.reserva_cantidad_personas,
          observaciones: row.reserva_observaciones,
          estado: row.reserva_estado,
          bloqueoInicio: row.reserva_bloqueo_inicio,
        }
      : null,
  }));
}

module.exports = {
  RESERVA_ESTADOS,
  RESERVA_ESTADOS_ACTIVOS,
  listReservas,
  findReservaById,
  createReserva,
  updateReserva,
  updateReservaEstado,
  findActiveReservaByMesaAt,
  listMesasReservationStatus,
};
