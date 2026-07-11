const { query } = require("../config/database");

function toCategory(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    activo: row.activo === 1,
    createdAt: row.created_at,
  };
}

async function listCategories({ onlyActive = false } = {}) {
  const whereClause = onlyActive ? "WHERE activo = 1" : "";

  const rows = await query(
    `
    SELECT id, nombre, activo, created_at
    FROM categorias
    ${whereClause}
    ORDER BY nombre ASC
    `,
  );

  return rows.map(toCategory);
}

async function findCategoryById(categoryId) {
  const rows = await query(
    `
    SELECT id, nombre, activo, created_at
    FROM categorias
    WHERE id = ?
    LIMIT 1
    `,
    [categoryId],
  );

  const row = rows[0];
  return row ? toCategory(row) : null;
}

async function findCategoryByName(nombre) {
  const rows = await query(
    `
    SELECT id, nombre, activo, created_at
    FROM categorias
    WHERE LOWER(nombre) = LOWER(?)
    LIMIT 1
    `,
    [nombre],
  );

  const row = rows[0];
  return row ? toCategory(row) : null;
}

async function createCategory({ nombre, activo }) {
  const result = await query(
    `
    INSERT INTO categorias (nombre, activo, created_at)
    VALUES (?, ?, NOW())
    `,
    [nombre, activo],
  );

  return result.insertId;
}

async function updateCategory(categoryId, { nombre, activo }) {
  const result = await query(
    `
    UPDATE categorias
    SET nombre = ?, activo = ?
    WHERE id = ?
    `,
    [nombre, activo, categoryId],
  );

  return result.affectedRows;
}

async function softDeleteCategory(categoryId) {
  const result = await query(
    `
    UPDATE categorias
    SET activo = 0
    WHERE id = ?
    `,
    [categoryId],
  );

  return result.affectedRows;
}

async function countAvailableProductsByCategory(categoryId) {
  const rows = await query(
    `
    SELECT COUNT(*) AS total
    FROM productos
    WHERE categoria_id = ? AND disponible = 1
    `,
    [categoryId],
  );

  return Number(rows[0]?.total || 0);
}

module.exports = {
  listCategories,
  findCategoryById,
  findCategoryByName,
  createCategory,
  updateCategory,
  softDeleteCategory,
  countAvailableProductsByCategory,
};
