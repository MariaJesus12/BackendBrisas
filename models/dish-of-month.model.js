const { query } = require("../config/database");

function toDishOfMonth(row) {
  return {
    id: row.id,
    productoId: row.producto_id,
    fechaInicio: row.fecha_inicio,
    fechaFin: row.fecha_fin,
    activo: row.activo === 1,
    producto: {
      id: row.producto_id,
      codigo: row.producto_codigo,
      nombre: row.producto_nombre,
      descripcion: row.producto_descripcion,
      precio: Number(row.producto_precio),
      imagen: row.producto_imagen,
      disponible: row.producto_disponible === 1,
      categoriaId: row.categoria_id,
      categoriaNombre: row.categoria_nombre,
    },
  };
}

async function listDishOfMonthHistory() {
  const rows = await query(
    `
    SELECT
      pm.id,
      pm.producto_id,
      pm.fecha_inicio,
      pm.fecha_fin,
      pm.activo,
      p.codigo AS producto_codigo,
      p.nombre AS producto_nombre,
      p.descripcion AS producto_descripcion,
      p.precio AS producto_precio,
      p.imagen AS producto_imagen,
      p.disponible AS producto_disponible,
      c.id AS categoria_id,
      c.nombre AS categoria_nombre
    FROM plato_mes pm
    INNER JOIN productos p ON p.id = pm.producto_id
    INNER JOIN categorias c ON c.id = p.categoria_id
    ORDER BY pm.id DESC
    `,
  );

  return rows.map(toDishOfMonth);
}

async function findDishOfMonthById(dishId) {
  const rows = await query(
    `
    SELECT
      pm.id,
      pm.producto_id,
      pm.fecha_inicio,
      pm.fecha_fin,
      pm.activo,
      p.codigo AS producto_codigo,
      p.nombre AS producto_nombre,
      p.descripcion AS producto_descripcion,
      p.precio AS producto_precio,
      p.imagen AS producto_imagen,
      p.disponible AS producto_disponible,
      c.id AS categoria_id,
      c.nombre AS categoria_nombre
    FROM plato_mes pm
    INNER JOIN productos p ON p.id = pm.producto_id
    INNER JOIN categorias c ON c.id = p.categoria_id
    WHERE pm.id = ?
    LIMIT 1
    `,
    [dishId],
  );

  const row = rows[0];
  return row ? toDishOfMonth(row) : null;
}

async function findLatestActiveDishOfMonth() {
  const rows = await query(
    `
    SELECT
      pm.id,
      pm.producto_id,
      pm.fecha_inicio,
      pm.fecha_fin,
      pm.activo,
      p.codigo AS producto_codigo,
      p.nombre AS producto_nombre,
      p.descripcion AS producto_descripcion,
      p.precio AS producto_precio,
      p.imagen AS producto_imagen,
      p.disponible AS producto_disponible,
      c.id AS categoria_id,
      c.nombre AS categoria_nombre
    FROM plato_mes pm
    INNER JOIN productos p ON p.id = pm.producto_id
    INNER JOIN categorias c ON c.id = p.categoria_id
    WHERE pm.activo = 1
    ORDER BY pm.id DESC
    LIMIT 1
    `,
  );

  const row = rows[0];
  return row ? toDishOfMonth(row) : null;
}

async function deactivateAllDishOfMonth() {
  await query(
    `
    UPDATE plato_mes
    SET activo = 0
    WHERE activo = 1
    `,
  );
}

async function deactivateAllDishOfMonthExcept(dishId) {
  await query(
    `
    UPDATE plato_mes
    SET activo = 0
    WHERE activo = 1 AND id <> ?
    `,
    [dishId],
  );
}

async function createDishOfMonth({ productoId, fechaInicio, fechaFin, activo }) {
  const result = await query(
    `
    INSERT INTO plato_mes (producto_id, fecha_inicio, fecha_fin, activo)
    VALUES (?, ?, ?, ?)
    `,
    [productoId, fechaInicio, fechaFin, activo],
  );

  return result.insertId;
}

async function updateDishOfMonth(dishId, { productoId, fechaInicio, fechaFin, activo }) {
  const result = await query(
    `
    UPDATE plato_mes
    SET producto_id = ?, fecha_inicio = ?, fecha_fin = ?, activo = ?
    WHERE id = ?
    `,
    [productoId, fechaInicio, fechaFin, activo, dishId],
  );

  return result.affectedRows;
}

async function softDeleteDishOfMonth(dishId) {
  const result = await query(
    `
    UPDATE plato_mes
    SET activo = 0
    WHERE id = ?
    `,
    [dishId],
  );

  return result.affectedRows;
}

module.exports = {
  listDishOfMonthHistory,
  findDishOfMonthById,
  findLatestActiveDishOfMonth,
  deactivateAllDishOfMonth,
  deactivateAllDishOfMonthExcept,
  createDishOfMonth,
  updateDishOfMonth,
  softDeleteDishOfMonth,
};
