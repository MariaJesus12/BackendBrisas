const { query } = require("../config/database");

// Fila interna usada para satisfacer la FK NOT NULL de reservas.mesa_id ahora que
// las reservas ya no se vinculan con una mesa real. Nunca se expone a los listados normales.
const RESERVA_PLACEHOLDER_OBSERVACION = "__RESERVA_PLACEHOLDER__";

function toMesa(row) {
  return {
    id: row.id,
    numero: row.numero,
    capacidad: row.capacidad,
    observacion: row.observacion,
    activa: row.activa === 1,
    createdAt: row.created_at,
  };
}

async function listMesas({ onlyActive = false } = {}) {
  const filters = ["COALESCE(observacion, '') <> ?"];
  const params = [RESERVA_PLACEHOLDER_OBSERVACION];

  if (onlyActive) {
    filters.push("activa = 1");
  }

  const rows = await query(
    `
    SELECT id, numero, capacidad, observacion, activa, created_at
    FROM mesas
    WHERE ${filters.join(" AND ")}
    ORDER BY numero ASC
    `,
    params,
  );

  return rows.map(toMesa);
}

async function ensureReservaPlaceholderMesaId() {
  const existingRows = await query(
    `
    SELECT id
    FROM mesas
    WHERE observacion = ?
    LIMIT 1
    `,
    [RESERVA_PLACEHOLDER_OBSERVACION],
  );

  if (existingRows[0]) {
    return existingRows[0].id;
  }

  const maxNumeroRows = await query("SELECT COALESCE(MAX(numero), 0) AS maxNumero FROM mesas");
  const placeholderNumero = Number(maxNumeroRows[0]?.maxNumero || 0) + 1000;

  const result = await query(
    `
    INSERT INTO mesas (numero, capacidad, observacion, activa, created_at)
    VALUES (?, ?, ?, 0, NOW())
    `,
    [placeholderNumero, 1, RESERVA_PLACEHOLDER_OBSERVACION],
  );

  return result.insertId;
}

async function findMesaById(mesaId) {
  const rows = await query(
    `
    SELECT id, numero, capacidad, observacion, activa, created_at
    FROM mesas
    WHERE id = ?
    LIMIT 1
    `,
    [mesaId],
  );

  const row = rows[0];
  return row ? toMesa(row) : null;
}

async function findMesaByNumero(numero) {
  const rows = await query(
    `
    SELECT id, numero, capacidad, observacion, activa, created_at
    FROM mesas
    WHERE numero = ?
    LIMIT 1
    `,
    [numero],
  );

  const row = rows[0];
  return row ? toMesa(row) : null;
}

async function createMesa({ numero, capacidad, observacion, activa }) {
  const result = await query(
    `
    INSERT INTO mesas (numero, capacidad, observacion, activa, created_at)
    VALUES (?, ?, ?, ?, NOW())
    `,
    [numero, capacidad, observacion, activa],
  );

  return result.insertId;
}

async function updateMesa(mesaId, { numero, capacidad, observacion, activa }) {
  const result = await query(
    `
    UPDATE mesas
    SET numero = ?, capacidad = ?, observacion = ?, activa = ?
    WHERE id = ?
    `,
    [numero, capacidad, observacion, activa, mesaId],
  );

  return result.affectedRows;
}

async function softDeleteMesa(mesaId) {
  const result = await query(
    `
    UPDATE mesas
    SET activa = 0
    WHERE id = ?
    `,
    [mesaId],
  );

  return result.affectedRows;
}

module.exports = {
  RESERVA_PLACEHOLDER_OBSERVACION,
  listMesas,
  findMesaById,
  findMesaByNumero,
  createMesa,
  updateMesa,
  softDeleteMesa,
  ensureReservaPlaceholderMesaId,
};
