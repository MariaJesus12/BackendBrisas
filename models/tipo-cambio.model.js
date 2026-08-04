const { query } = require("../config/database");

function toTipoCambio(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    compra: Number(row.compra),
    venta: Number(row.venta),
    activo: row.activo === 1,
    usuarioId: row.usuario_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listTipoCambio({ onlyActive = false } = {}) {
  const whereClause = onlyActive ? "WHERE activo = 1" : "";

  const rows = await query(
    `
    SELECT id, fecha, compra, venta, activo, usuario_id, created_at, updated_at
    FROM tipo_cambio
    ${whereClause}
    ORDER BY fecha DESC, id DESC
    `,
  );

  return rows.map(toTipoCambio);
}

async function findTipoCambioById(tipoCambioId) {
  const rows = await query(
    `
    SELECT id, fecha, compra, venta, activo, usuario_id, created_at, updated_at
    FROM tipo_cambio
    WHERE id = ?
    LIMIT 1
    `,
    [tipoCambioId],
  );

  const row = rows[0];
  return row ? toTipoCambio(row) : null;
}

async function createTipoCambio({ fecha, compra, venta, activo, usuarioId }) {
  const result = await query(
    `
    INSERT INTO tipo_cambio (fecha, compra, venta, activo, usuario_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [fecha, compra, venta, activo, usuarioId],
  );

  return result.insertId;
}

async function updateTipoCambio(tipoCambioId, { fecha, compra, venta, activo, usuarioId }) {
  const result = await query(
    `
    UPDATE tipo_cambio
    SET fecha = ?, compra = ?, venta = ?, activo = ?, usuario_id = ?, updated_at = NOW()
    WHERE id = ?
    `,
    [fecha, compra, venta, activo, usuarioId, tipoCambioId],
  );

  return result.affectedRows;
}

module.exports = {
  listTipoCambio,
  findTipoCambioById,
  createTipoCambio,
  updateTipoCambio,
};
