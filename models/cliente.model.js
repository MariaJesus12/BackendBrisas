const { query } = require("../config/database");

function toCliente(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono,
    observaciones: row.observaciones,
    activo: row.activo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function phoneComparableSql(columnName) {
  return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${columnName}, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')`;
}

async function listClientes({ onlyActive = false, q, nombre, telefono } = {}) {
  const filters = [];
  const params = [];

  if (onlyActive) {
    filters.push("c.activo = 1");
  }

  if (q) {
    const phoneExpr = phoneComparableSql("c.telefono");
    const qPhoneExpr = phoneComparableSql("?");
    filters.push(`(LOWER(c.nombre) LIKE LOWER(?) OR ${phoneExpr} LIKE CONCAT('%', ${qPhoneExpr}, '%'))`);
    params.push(`%${q}%`, q);
  }

  if (nombre) {
    filters.push("LOWER(c.nombre) LIKE LOWER(?)");
    params.push(`%${nombre}%`);
  }

  if (telefono) {
    const phoneExpr = phoneComparableSql("c.telefono");
    const qPhoneExpr = phoneComparableSql("?");
    filters.push(`${phoneExpr} LIKE CONCAT('%', ${qPhoneExpr}, '%')`);
    params.push(telefono);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await query(
    `
    SELECT
      c.id,
      c.nombre,
      c.telefono,
      c.observaciones,
      c.activo,
      c.created_at,
      c.updated_at
    FROM clientes c
    ${whereClause}
    ORDER BY c.nombre ASC, c.id ASC
    `,
    params,
  );

  return rows.map(toCliente);
}

async function findClienteById(clienteId) {
  const rows = await query(
    `
    SELECT
      c.id,
      c.nombre,
      c.telefono,
      c.observaciones,
      c.activo,
      c.created_at,
      c.updated_at
    FROM clientes c
    WHERE c.id = ?
    LIMIT 1
    `,
    [clienteId],
  );

  const row = rows[0];
  return row ? toCliente(row) : null;
}

async function findActiveClienteById(clienteId) {
  const rows = await query(
    `
    SELECT
      c.id,
      c.nombre,
      c.telefono,
      c.observaciones,
      c.activo,
      c.created_at,
      c.updated_at
    FROM clientes c
    WHERE c.id = ? AND c.activo = 1
    LIMIT 1
    `,
    [clienteId],
  );

  const row = rows[0];
  return row ? toCliente(row) : null;
}

async function findClienteDuplicateByNombreTelefono({ nombre, telefono, excludeClienteId = null }) {
  const normalizedNombre = String(nombre || "").trim().toLowerCase();
  const normalizedTelefono = String(telefono || "").replace(/[\s\-()+]/g, "");

  if (!normalizedNombre || !normalizedTelefono) {
    return null;
  }

  const params = [normalizedNombre, normalizedTelefono];
  let excludeClause = "";

  if (excludeClienteId) {
    excludeClause = "AND c.id <> ?";
    params.push(excludeClienteId);
  }

  const rows = await query(
    `
    SELECT
      c.id,
      c.nombre,
      c.telefono,
      c.observaciones,
      c.activo,
      c.created_at,
      c.updated_at
    FROM clientes c
    WHERE LOWER(TRIM(c.nombre)) = ?
      AND ${phoneComparableSql("c.telefono")} = ?
      ${excludeClause}
    ORDER BY c.id ASC
    LIMIT 1
    `,
    params,
  );

  const row = rows[0];
  return row ? toCliente(row) : null;
}

async function createCliente({ nombre, telefono, observaciones, activo }) {
  const result = await query(
    `
    INSERT INTO clientes (nombre, telefono, observaciones, activo, created_at, updated_at)
    VALUES (?, ?, ?, ?, NOW(), NOW())
    `,
    [nombre, telefono, observaciones, activo],
  );

  return result.insertId;
}

async function updateCliente(clienteId, { nombre, telefono, observaciones, activo }) {
  const result = await query(
    `
    UPDATE clientes
    SET
      nombre = ?,
      telefono = ?,
      observaciones = ?,
      activo = ?,
      updated_at = NOW()
    WHERE id = ?
    `,
    [nombre, telefono, observaciones, activo, clienteId],
  );

  return result.affectedRows;
}

async function softDeleteCliente(clienteId) {
  const result = await query(
    `
    UPDATE clientes
    SET activo = 0, updated_at = NOW()
    WHERE id = ?
    `,
    [clienteId],
  );

  return result.affectedRows;
}

module.exports = {
  listClientes,
  findClienteById,
  findActiveClienteById,
  findClienteDuplicateByNombreTelefono,
  createCliente,
  updateCliente,
  softDeleteCliente,
};
