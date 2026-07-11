const { query } = require("../config/database");

function toProduct(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    descripcion: row.descripcion,
    precio: Number(row.precio),
    imagen: row.imagen,
    categoriaId: row.categoria_id,
    categoriaNombre: row.categoria_nombre,
    disponible: row.disponible === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listProducts({ onlyAvailable = false, categoriaId } = {}) {
  const filters = [];
  const params = [];

  if (onlyAvailable) {
    filters.push("p.disponible = 1");
  }

  if (categoriaId) {
    filters.push("p.categoria_id = ?");
    params.push(categoriaId);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await query(
    `
    SELECT
      p.id,
      p.codigo,
      p.nombre,
      p.descripcion,
      p.precio,
      p.imagen,
      p.categoria_id,
      c.nombre AS categoria_nombre,
      p.disponible,
      p.created_at,
      p.updated_at
    FROM productos p
    INNER JOIN categorias c ON c.id = p.categoria_id
    ${whereClause}
    ORDER BY p.id ASC
    `,
    params,
  );

  return rows.map(toProduct);
}

async function findProductById(productId) {
  const rows = await query(
    `
    SELECT
      p.id,
      p.codigo,
      p.nombre,
      p.descripcion,
      p.precio,
      p.imagen,
      p.categoria_id,
      c.nombre AS categoria_nombre,
      p.disponible,
      p.created_at,
      p.updated_at
    FROM productos p
    INNER JOIN categorias c ON c.id = p.categoria_id
    WHERE p.id = ?
    LIMIT 1
    `,
    [productId],
  );

  const row = rows[0];
  return row ? toProduct(row) : null;
}

async function findProductByCode(codigo) {
  const rows = await query(
    `
    SELECT id, codigo
    FROM productos
    WHERE codigo = ?
    LIMIT 1
    `,
    [codigo],
  );

  return rows[0] || null;
}

async function createProduct({ codigo, nombre, descripcion, precio, imagen, categoriaId, disponible }) {
  const result = await query(
    `
    INSERT INTO productos (codigo, nombre, descripcion, precio, imagen, categoria_id, disponible, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [codigo, nombre, descripcion, precio, imagen, categoriaId, disponible],
  );

  return result.insertId;
}

async function updateProduct(productId, { codigo, nombre, descripcion, precio, imagen, categoriaId, disponible }) {
  const result = await query(
    `
    UPDATE productos
    SET
      codigo = ?,
      nombre = ?,
      descripcion = ?,
      precio = ?,
      imagen = ?,
      categoria_id = ?,
      disponible = ?,
      updated_at = NOW()
    WHERE id = ?
    `,
    [codigo, nombre, descripcion, precio, imagen, categoriaId, disponible, productId],
  );

  return result.affectedRows;
}

async function softDeleteProduct(productId) {
  const result = await query(
    `
    UPDATE productos
    SET disponible = 0, updated_at = NOW()
    WHERE id = ?
    `,
    [productId],
  );

  return result.affectedRows;
}

module.exports = {
  listProducts,
  findProductById,
  findProductByCode,
  createProduct,
  updateProduct,
  softDeleteProduct,
};
