const { pool, query } = require("../config/database");

function toPrinter(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    nombreSistema: row.nombre_sistema,
    tipoImpresoraId: row.tipo_impresora_id,
    tipo: row.tipo_nombre,
    activa: row.activa === 1,
    createdAt: row.created_at,
  };
}

function toPrintJob(row) {
  return {
    id: row.id,
    pedidoId: row.pedido_id,
    impresoraId: row.impresora_id,
    impresoraNombre: row.impresora_nombre,
    impresoraSistema: row.impresora_sistema,
    usuarioId: row.usuario_id,
    usuarioNombre: row.usuario_nombre,
    tipo: row.tipo,
    contenido: row.contenido,
    estado: row.estado,
    intentos: row.intentos,
    mensajeError: row.mensaje_error,
    reimpresion: row.reimpresion === 1,
    copias: row.copias,
    fechaCreacion: row.fecha_creacion,
    fechaImpresion: row.fecha_impresion,
  };
}

async function run(sql, params = [], connection) {
  if (connection) {
    const [rows] = await connection.query(sql, params);
    return rows;
  }

  return query(sql, params);
}

async function listImpresoras({ onlyActive = false, tipo } = {}) {
  const filters = [];
  const params = [];

  if (onlyActive) {
    filters.push("i.activa = 1");
  }

  if (tipo) {
    filters.push("UPPER(ti.nombre) = ?");
    params.push(tipo);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await query(
    `
    SELECT
      i.id,
      i.nombre,
      i.nombre_sistema,
      i.tipo_impresora_id,
      ti.nombre AS tipo_nombre,
      i.activa,
      i.created_at
    FROM impresoras i
    INNER JOIN tipos_impresora ti ON ti.id = i.tipo_impresora_id
    ${whereClause}
    ORDER BY i.id ASC
    `,
    params,
  );

  return rows.map(toPrinter);
}

async function findImpresoraById(impresoraId, connection) {
  const rows = await run(
    `
    SELECT
      i.id,
      i.nombre,
      i.nombre_sistema,
      i.tipo_impresora_id,
      ti.nombre AS tipo_nombre,
      i.activa,
      i.created_at
    FROM impresoras i
    INNER JOIN tipos_impresora ti ON ti.id = i.tipo_impresora_id
    WHERE i.id = ?
    LIMIT 1
    `,
    [impresoraId],
    connection,
  );

  const row = rows[0];
  return row ? toPrinter(row) : null;
}

async function findActiveImpresoraByTipo(tipo, connection) {
  const rows = await run(
    `
    SELECT
      i.id,
      i.nombre,
      i.nombre_sistema,
      i.tipo_impresora_id,
      ti.nombre AS tipo_nombre,
      i.activa,
      i.created_at
    FROM impresoras i
    INNER JOIN tipos_impresora ti ON ti.id = i.tipo_impresora_id
    WHERE UPPER(ti.nombre) = ? AND i.activa = 1
    ORDER BY i.id ASC
    LIMIT 1
    `,
    [tipo],
    connection,
  );

  const row = rows[0];
  return row ? toPrinter(row) : null;
}

async function createColaImpresion(
  { pedidoId, impresoraId, usuarioId, tipo, contenido, estado, intentos, mensajeError, reimpresion, copias, fechaImpresion },
  connection,
) {
  const result = await run(
    `
    INSERT INTO cola_impresion (
      pedido_id,
      impresora_id,
      usuario_id,
      tipo,
      contenido,
      estado,
      intentos,
      mensaje_error,
      reimpresion,
      copias,
      fecha_creacion,
      fecha_impresion
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
    `,
    [
      pedidoId,
      impresoraId,
      usuarioId,
      tipo,
      contenido,
      estado,
      intentos,
      mensajeError,
      reimpresion,
      copias,
      fechaImpresion,
    ],
    connection,
  );

  return result.insertId;
}

async function listColaImpresion({ estado, tipo, pedidoId, impresoraId } = {}) {
  const filters = [];
  const params = [];

  if (estado) {
    filters.push("c.estado = ?");
    params.push(estado);
  }

  if (tipo) {
    filters.push("c.tipo = ?");
    params.push(tipo);
  }

  if (pedidoId) {
    filters.push("c.pedido_id = ?");
    params.push(pedidoId);
  }

  if (impresoraId) {
    filters.push("c.impresora_id = ?");
    params.push(impresoraId);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await query(
    `
    SELECT
      c.id,
      c.pedido_id,
      c.impresora_id,
      i.nombre AS impresora_nombre,
      i.nombre_sistema AS impresora_sistema,
      c.usuario_id,
      u.nombre AS usuario_nombre,
      c.tipo,
      c.contenido,
      c.estado,
      c.intentos,
      c.mensaje_error,
      c.reimpresion,
      c.copias,
      c.fecha_creacion,
      c.fecha_impresion
    FROM cola_impresion c
    INNER JOIN impresoras i ON i.id = c.impresora_id
    LEFT JOIN usuarios u ON u.id = c.usuario_id
    ${whereClause}
    ORDER BY c.fecha_creacion ASC, c.id ASC
    `,
    params,
  );

  return rows.map(toPrintJob);
}

async function findColaImpresionById(jobId, connection) {
  const rows = await run(
    `
    SELECT
      c.id,
      c.pedido_id,
      c.impresora_id,
      i.nombre AS impresora_nombre,
      i.nombre_sistema AS impresora_sistema,
      c.usuario_id,
      u.nombre AS usuario_nombre,
      c.tipo,
      c.contenido,
      c.estado,
      c.intentos,
      c.mensaje_error,
      c.reimpresion,
      c.copias,
      c.fecha_creacion,
      c.fecha_impresion
    FROM cola_impresion c
    INNER JOIN impresoras i ON i.id = c.impresora_id
    LEFT JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [jobId],
    connection,
  );

  const row = rows[0];
  return row ? toPrintJob(row) : null;
}

async function countActiveQueueJobsByPedidoAndTipo(pedidoId, tipo, connection) {
  const rows = await run(
    `
    SELECT COUNT(*) AS total
    FROM cola_impresion
    WHERE pedido_id = ? AND tipo = ? AND estado IN ('PENDIENTE', 'IMPRIMIENDO')
    `,
    [pedidoId, tipo],
    connection,
  );

  return Number(rows[0]?.total || 0);
}

async function claimNextColaImpresion({ tipo, impresoraId } = {}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const filters = ["c.estado = 'PENDIENTE'", "i.activa = 1", "UPPER(ti.nombre) = UPPER(c.tipo)"];
    const params = [];

    if (tipo) {
      filters.push("c.tipo = ?");
      params.push(tipo);
    }

    if (impresoraId) {
      filters.push("c.impresora_id = ?");
      params.push(impresoraId);
    }

    const [rows] = await connection.query(
      `
      SELECT c.id
      FROM cola_impresion c
      INNER JOIN impresoras i ON i.id = c.impresora_id
      INNER JOIN tipos_impresora ti ON ti.id = i.tipo_impresora_id
      WHERE ${filters.join(" AND ")}
      ORDER BY c.fecha_creacion ASC, c.id ASC
      LIMIT 1
      FOR UPDATE
      `,
      params,
    );

    const row = rows[0];

    if (!row) {
      await connection.commit();
      return null;
    }

    await connection.query(
      `
      UPDATE cola_impresion
      SET estado = 'IMPRIMIENDO', intentos = intentos + 1, mensaje_error = NULL
      WHERE id = ?
      `,
      [row.id],
    );

    const job = await findColaImpresionById(row.id, connection);
    await connection.commit();

    return job;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateColaImpresionStatus(jobId, { estado, mensajeError, fechaImpresion }) {
  const setClauses = ["estado = ?", "mensaje_error = ?"];
  const params = [estado, mensajeError || null];

  if (estado === "IMPRESO") {
    setClauses.push("fecha_impresion = COALESCE(?, NOW())");
    params.push(fechaImpresion || null);
  } else if (Object.prototype.hasOwnProperty.call(arguments[1], "fechaImpresion")) {
    setClauses.push("fecha_impresion = ?");
    params.push(fechaImpresion);
  }

  params.push(jobId);

  const result = await query(
    `
    UPDATE cola_impresion
    SET ${setClauses.join(", ")}
    WHERE id = ?
    `,
    params,
  );

  return result.affectedRows;
}

module.exports = {
  listImpresoras,
  findImpresoraById,
  findActiveImpresoraByTipo,
  createColaImpresion,
  listColaImpresion,
  findColaImpresionById,
  countActiveQueueJobsByPedidoAndTipo,
  claimNextColaImpresion,
  updateColaImpresionStatus,
};