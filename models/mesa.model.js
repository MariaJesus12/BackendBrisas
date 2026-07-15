const { query } = require("../config/database");

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
  const whereClause = onlyActive ? "WHERE activa = 1" : "";

  const rows = await query(
    `
    SELECT id, numero, capacidad, observacion, activa, created_at
    FROM mesas
    ${whereClause}
    ORDER BY numero ASC
    `,
  );

  return rows.map(toMesa);
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
  listMesas,
  findMesaById,
  findMesaByNumero,
  createMesa,
  updateMesa,
  softDeleteMesa,
};
