const { query } = require("../config/database");

function toMoneda(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    simbolo: row.simbolo,
    activa: row.activa === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listMonedas({ onlyActive = false } = {}) {
  const whereClause = onlyActive ? "WHERE activa = 1" : "";

  const rows = await query(
    `
    SELECT id, codigo, nombre, simbolo, activa, created_at, updated_at
    FROM monedas
    ${whereClause}
    ORDER BY nombre ASC
    `,
  );

  return rows.map(toMoneda);
}

async function findMonedaById(monedaId) {
  const rows = await query(
    `
    SELECT id, codigo, nombre, simbolo, activa, created_at, updated_at
    FROM monedas
    WHERE id = ?
    LIMIT 1
    `,
    [monedaId],
  );

  const row = rows[0];
  return row ? toMoneda(row) : null;
}

async function findMonedaByCode(codigo) {
  const rows = await query(
    `
    SELECT id, codigo, nombre, simbolo, activa, created_at, updated_at
    FROM monedas
    WHERE UPPER(codigo) = UPPER(?)
    LIMIT 1
    `,
    [codigo],
  );

  const row = rows[0];
  return row ? toMoneda(row) : null;
}

module.exports = {
  listMonedas,
  findMonedaById,
  findMonedaByCode,
};
