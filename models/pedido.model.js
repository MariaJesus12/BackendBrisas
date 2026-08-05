const { pool, query } = require("../config/database");

let schemaCapabilitiesCache = null;

function toMoney(value) {
  return Number(value || 0);
}

function toPedido(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    mesaId: row.mesa_id,
    mesaNumero: row.mesa_numero,
    usuarioId: row.usuario_id,
    usuarioNombre: row.usuario_nombre,
    tipo: row.tipo,
    estado: row.estado,
    subtotal: toMoney(row.subtotal),
    impuesto: toMoney(row.impuesto),
    total: toMoney(row.total),
    fechaApertura: row.fecha_apertura,
    fechaCierre: row.fecha_cierre,
  };
}

function toDetalle(row) {
  return {
    id: row.id,
    pedidoId: row.pedido_id,
    cuentaPedidoId: row.cuenta_pedido_id,
    productoId: row.producto_id,
    productoCodigo: row.producto_codigo,
    productoNombre: row.producto_nombre,
    cantidad: row.cantidad,
    precioUnitario: toMoney(row.precio_unitario),
    subtotal: toMoney(row.subtotal),
    observacion: row.observacion,
    createdAt: row.created_at,
  };
}

function toPago(row) {
  return {
    id: row.id,
    pedidoId: row.pedido_id,
    metodoPagoId: row.metodo_pago_id,
    metodoPagoNombre: row.metodo_pago_nombre,
    monedaId: row.moneda_id,
    monedaCodigo: row.moneda_codigo,
    monedaSimbolo: row.moneda_simbolo,
    tipoCambioId: row.tipo_cambio_id,
    monto: toMoney(row.monto),
    montoRecibido: toMoney(row.monto_recibido),
    vuelto: toMoney(row.vuelto),
    tipoCambioUtilizado: Number(row.tipo_cambio_utilizado || 0),
    montoMoneda: toMoney(row.monto_moneda),
    referencia: row.referencia,
    fecha: row.fecha,
  };
}

function toMetodoPago(row) {
  return {
    id: row.id,
    nombre: row.nombre,
  };
}

function toCuentaPedido(row) {
  return {
    id: row.id,
    pedidoId: row.pedido_id,
    numeroCuenta: row.numero_cuenta,
    subtotal: toMoney(row.subtotal),
    impuesto: toMoney(row.impuesto),
    descuento: toMoney(row.descuento),
    total: toMoney(row.total),
    estado: row.estado,
    fechaCreacion: row.fecha_creacion,
    fechaActualizacion: row.fecha_actualizacion,
  };
}

async function run(sql, params = [], connection) {
  if (connection) {
    const [rows] = await connection.query(sql, params);
    return rows;
  }

  return query(sql, params);
}

async function getSchemaCapabilities(connection) {
  if (schemaCapabilitiesCache) {
    return schemaCapabilitiesCache;
  }

  const columnRows = await run(
    `
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('detalle_pedido', 'pagos', 'cuentas_pedido')
    `,
    [],
    connection,
  );

  const tableRows = await run(
    `
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('monedas', 'tipo_cambio', 'cuentas_pedido')
    `,
    [],
    connection,
  );

  const hasColumn = (tableName, columnName) =>
    columnRows.some((row) => row.TABLE_NAME === tableName && row.COLUMN_NAME === columnName);
  const hasTable = (tableName) => tableRows.some((row) => row.TABLE_NAME === tableName);

  schemaCapabilitiesCache = {
    hasDetalleCuentaPedidoId: hasColumn("detalle_pedido", "cuenta_pedido_id"),
    hasCuentasPedidoTable: hasTable("cuentas_pedido"),
    hasPagosMonedaColumns:
      hasColumn("pagos", "moneda_id") &&
      hasColumn("pagos", "tipo_cambio_id") &&
      hasColumn("pagos", "monto_recibido") &&
      hasColumn("pagos", "vuelto") &&
      hasColumn("pagos", "tipo_cambio_utilizado") &&
      hasColumn("pagos", "monto_moneda"),
    hasMonedasTable: hasTable("monedas"),
  };

  return schemaCapabilitiesCache;
}

async function listPedidos({ estado, tipo, mesaId, usuarioId, fechaDesde, fechaHasta } = {}) {
  const filters = [];
  const params = [];

  if (estado) {
    filters.push("p.estado = ?");
    params.push(estado);
  }

  if (tipo) {
    filters.push("p.tipo = ?");
    params.push(tipo);
  }

  if (mesaId) {
    filters.push("p.mesa_id = ?");
    params.push(mesaId);
  }

  if (usuarioId) {
    filters.push("p.usuario_id = ?");
    params.push(usuarioId);
  }

  if (fechaDesde) {
    filters.push("DATE(p.fecha_apertura) >= DATE(?)");
    params.push(fechaDesde);
  }

  if (fechaHasta) {
    filters.push("DATE(p.fecha_apertura) <= DATE(?)");
    params.push(fechaHasta);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await query(
    `
    SELECT
      p.id,
      p.codigo,
      p.mesa_id,
      m.numero AS mesa_numero,
      p.usuario_id,
      u.nombre AS usuario_nombre,
      p.tipo,
      p.estado,
      p.subtotal,
      p.impuesto,
      p.total,
      p.fecha_apertura,
      p.fecha_cierre
    FROM pedidos p
    LEFT JOIN mesas m ON m.id = p.mesa_id
    LEFT JOIN usuarios u ON u.id = p.usuario_id
    ${whereClause}
    ORDER BY p.id DESC
    `,
    params,
  );

  return rows.map(toPedido);
}

async function findPedidoById(pedidoId) {
  const rows = await query(
    `
    SELECT
      p.id,
      p.codigo,
      p.mesa_id,
      m.numero AS mesa_numero,
      p.usuario_id,
      u.nombre AS usuario_nombre,
      p.tipo,
      p.estado,
      p.subtotal,
      p.impuesto,
      p.total,
      p.fecha_apertura,
      p.fecha_cierre
    FROM pedidos p
    LEFT JOIN mesas m ON m.id = p.mesa_id
    LEFT JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.id = ?
    LIMIT 1
    `,
    [pedidoId],
  );

  const row = rows[0];
  return row ? toPedido(row) : null;
}

async function findPedidoByCode(codigo) {
  const rows = await query(
    `
    SELECT id, codigo
    FROM pedidos
    WHERE codigo = ?
    LIMIT 1
    `,
    [codigo],
  );

  return rows[0] || null;
}

async function getNextPedidoCodeForDate(fechaApertura, connection) {
  const baseDate = fechaApertura instanceof Date ? fechaApertura : new Date(fechaApertura || Date.now());

  if (Number.isNaN(baseDate.getTime())) {
    throw new Error("fechaApertura invalida para generar codigo de pedido");
  }

  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, "0");
  const day = String(baseDate.getDate()).padStart(2, "0");
  const datePrefix = `${year}${month}${day}`;

  const lockName = `pedido_code_${datePrefix}`;

  const lockRows = await run("SELECT GET_LOCK(?, 5) AS locked", [lockName], connection);
  if (Number(lockRows[0]?.locked || 0) !== 1) {
    throw new Error("No se pudo bloquear la generacion del codigo de pedido");
  }

  try {
    const rows = await run(
      `
      SELECT codigo
      FROM pedidos
      WHERE DATE(fecha_apertura) = DATE(?)
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [baseDate],
      connection,
    );

    const lastCode = String(rows[0]?.codigo || "").trim();
    let nextSequence = 1;

    if (lastCode.startsWith(datePrefix)) {
      const suffix = lastCode.slice(datePrefix.length);
      const parsedSuffix = Number(suffix);

      if (Number.isInteger(parsedSuffix) && parsedSuffix > 0) {
        nextSequence = parsedSuffix + 1;
      }
    }

    return `${datePrefix}${String(nextSequence).padStart(2, "0")}`;
  } finally {
    await run("SELECT RELEASE_LOCK(?)", [lockName], connection);
  }
}

async function createPedido(
  { codigo, mesaId, usuarioId, tipo, estado, subtotal, impuesto, total, fechaApertura, fechaCierre },
  connection,
) {
  const result = await run(
    `
    INSERT INTO pedidos (codigo, mesa_id, usuario_id, tipo, estado, subtotal, impuesto, total, fecha_apertura, fecha_cierre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?)
    `,
    [codigo, mesaId, usuarioId, tipo, estado, subtotal, impuesto, total, fechaApertura, fechaCierre],
    connection,
  );

  return result.insertId;
}

async function updatePedido(
  pedidoId,
  { codigo, mesaId, usuarioId, tipo, estado, subtotal, impuesto, total, fechaApertura, fechaCierre },
  connection,
) {
  const result = await run(
    `
    UPDATE pedidos
    SET
      codigo = ?,
      mesa_id = ?,
      usuario_id = ?,
      tipo = ?,
      estado = ?,
      subtotal = ?,
      impuesto = ?,
      total = ?,
      fecha_apertura = ?,
      fecha_cierre = ?
    WHERE id = ?
    `,
    [codigo, mesaId, usuarioId, tipo, estado, subtotal, impuesto, total, fechaApertura, fechaCierre, pedidoId],
    connection,
  );

  return result.affectedRows;
}

async function deletePedidoCascade(pedidoId, connection) {
  await run(
    `
    DELETE FROM pagos
    WHERE pedido_id = ?
    `,
    [pedidoId],
    connection,
  );

  await run(
    `
    DELETE FROM detalle_pedido
    WHERE pedido_id = ?
    `,
    [pedidoId],
    connection,
  );

  await run(
    `
    DELETE FROM cuentas_pedido
    WHERE pedido_id = ?
    `,
    [pedidoId],
    connection,
  );

  const result = await run(
    `
    DELETE FROM pedidos
    WHERE id = ?
    `,
    [pedidoId],
    connection,
  );

  return result.affectedRows;
}

async function listDetalleByPedidoId(pedidoId) {
  const schema = await getSchemaCapabilities();
  const cuentaPedidoColumn = schema.hasDetalleCuentaPedidoId ? "d.cuenta_pedido_id" : "NULL AS cuenta_pedido_id";

  const rows = await query(
    `
    SELECT
      d.id,
      d.pedido_id,
      ${cuentaPedidoColumn},
      d.producto_id,
      p.codigo AS producto_codigo,
      p.nombre AS producto_nombre,
      d.cantidad,
      d.precio_unitario,
      d.subtotal,
      d.observacion,
      d.created_at
    FROM detalle_pedido d
    LEFT JOIN productos p ON p.id = d.producto_id
    WHERE d.pedido_id = ?
    ORDER BY d.id ASC
    `,
    [pedidoId],
  );

  return rows.map(toDetalle);
}

async function findDetalleByIdAndPedido(detalleId, pedidoId) {
  const schema = await getSchemaCapabilities();
  const cuentaPedidoColumn = schema.hasDetalleCuentaPedidoId ? "d.cuenta_pedido_id" : "NULL AS cuenta_pedido_id";

  const rows = await query(
    `
    SELECT
      d.id,
      d.pedido_id,
      ${cuentaPedidoColumn},
      d.producto_id,
      p.codigo AS producto_codigo,
      p.nombre AS producto_nombre,
      d.cantidad,
      d.precio_unitario,
      d.subtotal,
      d.observacion,
      d.created_at
    FROM detalle_pedido d
    LEFT JOIN productos p ON p.id = d.producto_id
    WHERE d.id = ? AND d.pedido_id = ?
    LIMIT 1
    `,
    [detalleId, pedidoId],
  );

  const row = rows[0];
  return row ? toDetalle(row) : null;
}

async function createDetallePedido(
  { pedidoId, cuentaPedidoId = null, productoId, cantidad, precioUnitario, subtotal, observacion },
  connection,
) {
  const schema = await getSchemaCapabilities(connection);
  if (!schema.hasDetalleCuentaPedidoId) {
    const legacyResult = await run(
      `
      INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal, observacion, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
      `,
      [pedidoId, productoId, cantidad, precioUnitario, subtotal, observacion],
      connection,
    );

    return legacyResult.insertId;
  }

  const result = await run(
    `
    INSERT INTO detalle_pedido (pedido_id, cuenta_pedido_id, producto_id, cantidad, precio_unitario, subtotal, observacion, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [pedidoId, cuentaPedidoId, productoId, cantidad, precioUnitario, subtotal, observacion],
    connection,
  );

  return result.insertId;
}

async function updateDetallePedido(
  detalleId,
  { cuentaPedidoId = null, productoId, cantidad, precioUnitario, subtotal, observacion },
  connection,
) {
  const schema = await getSchemaCapabilities(connection);
  if (!schema.hasDetalleCuentaPedidoId) {
    const legacyResult = await run(
      `
      UPDATE detalle_pedido
      SET
        producto_id = ?,
        cantidad = ?,
        precio_unitario = ?,
        subtotal = ?,
        observacion = ?
      WHERE id = ?
      `,
      [productoId, cantidad, precioUnitario, subtotal, observacion, detalleId],
      connection,
    );

    return legacyResult.affectedRows;
  }

  const result = await run(
    `
    UPDATE detalle_pedido
    SET
      cuenta_pedido_id = ?,
      producto_id = ?,
      cantidad = ?,
      precio_unitario = ?,
      subtotal = ?,
      observacion = ?
    WHERE id = ?
    `,
    [cuentaPedidoId, productoId, cantidad, precioUnitario, subtotal, observacion, detalleId],
    connection,
  );

  return result.affectedRows;
}

async function deleteDetallePedido(detalleId, connection) {
  const result = await run(
    `
    DELETE FROM detalle_pedido
    WHERE id = ?
    `,
    [detalleId],
    connection,
  );

  return result.affectedRows;
}

async function sumDetalleSubtotalByPedido(pedidoId, connection) {
  const rows = await run(
    `
    SELECT COALESCE(SUM(subtotal), 0) AS total
    FROM detalle_pedido
    WHERE pedido_id = ?
    `,
    [pedidoId],
    connection,
  );

  return toMoney(rows[0]?.total || 0);
}

async function updatePedidoTotals(pedidoId, { subtotal, impuesto, total }, connection) {
  const result = await run(
    `
    UPDATE pedidos
    SET subtotal = ?, impuesto = ?, total = ?
    WHERE id = ?
    `,
    [subtotal, impuesto, total, pedidoId],
    connection,
  );

  return result.affectedRows;
}

async function listPagosByPedidoId(pedidoId) {
  const schema = await getSchemaCapabilities();

  if (!schema.hasPagosMonedaColumns || !schema.hasMonedasTable) {
    const legacyRows = await query(
      `
      SELECT
        pg.id,
        pg.pedido_id,
        pg.metodo_pago_id,
        mp.nombre AS metodo_pago_nombre,
        NULL AS moneda_id,
        NULL AS moneda_codigo,
        NULL AS moneda_simbolo,
        NULL AS tipo_cambio_id,
        pg.monto,
        pg.monto AS monto_recibido,
        0 AS vuelto,
        1 AS tipo_cambio_utilizado,
        pg.monto AS monto_moneda,
        pg.referencia,
        pg.fecha
      FROM pagos pg
      INNER JOIN metodos_pago mp ON mp.id = pg.metodo_pago_id
      WHERE pg.pedido_id = ?
      ORDER BY pg.id ASC
      `,
      [pedidoId],
    );

    return legacyRows.map(toPago);
  }

  const rows = await query(
    `
    SELECT
      pg.id,
      pg.pedido_id,
      pg.metodo_pago_id,
      mp.nombre AS metodo_pago_nombre,
      pg.moneda_id,
      mo.codigo AS moneda_codigo,
      mo.simbolo AS moneda_simbolo,
      pg.tipo_cambio_id,
      pg.monto,
      pg.monto_recibido,
      pg.vuelto,
      pg.tipo_cambio_utilizado,
      pg.monto_moneda,
      pg.referencia,
      pg.fecha
    FROM pagos pg
    INNER JOIN metodos_pago mp ON mp.id = pg.metodo_pago_id
    INNER JOIN monedas mo ON mo.id = pg.moneda_id
    WHERE pg.pedido_id = ?
    ORDER BY pg.id ASC
    `,
    [pedidoId],
  );

  return rows.map(toPago);
}

async function findPagoByIdAndPedido(pagoId, pedidoId) {
  const schema = await getSchemaCapabilities();

  if (!schema.hasPagosMonedaColumns || !schema.hasMonedasTable) {
    const legacyRows = await query(
      `
      SELECT
        pg.id,
        pg.pedido_id,
        pg.metodo_pago_id,
        mp.nombre AS metodo_pago_nombre,
        NULL AS moneda_id,
        NULL AS moneda_codigo,
        NULL AS moneda_simbolo,
        NULL AS tipo_cambio_id,
        pg.monto,
        pg.monto AS monto_recibido,
        0 AS vuelto,
        1 AS tipo_cambio_utilizado,
        pg.monto AS monto_moneda,
        pg.referencia,
        pg.fecha
      FROM pagos pg
      INNER JOIN metodos_pago mp ON mp.id = pg.metodo_pago_id
      WHERE pg.id = ? AND pg.pedido_id = ?
      LIMIT 1
      `,
      [pagoId, pedidoId],
    );

    const legacyRow = legacyRows[0];
    return legacyRow ? toPago(legacyRow) : null;
  }

  const rows = await query(
    `
    SELECT
      pg.id,
      pg.pedido_id,
      pg.metodo_pago_id,
      mp.nombre AS metodo_pago_nombre,
      pg.moneda_id,
      mo.codigo AS moneda_codigo,
      mo.simbolo AS moneda_simbolo,
      pg.tipo_cambio_id,
      pg.monto,
      pg.monto_recibido,
      pg.vuelto,
      pg.tipo_cambio_utilizado,
      pg.monto_moneda,
      pg.referencia,
      pg.fecha
    FROM pagos pg
    INNER JOIN metodos_pago mp ON mp.id = pg.metodo_pago_id
    INNER JOIN monedas mo ON mo.id = pg.moneda_id
    WHERE pg.id = ? AND pg.pedido_id = ?
    LIMIT 1
    `,
    [pagoId, pedidoId],
  );

  const row = rows[0];
  return row ? toPago(row) : null;
}

async function createPago(
  {
    pedidoId,
    metodoPagoId,
    monedaId,
    tipoCambioId,
    monto,
    montoRecibido,
    vuelto,
    tipoCambioUtilizado,
    montoMoneda,
    referencia,
  },
  connection,
) {
  const schema = await getSchemaCapabilities(connection);

  if (!schema.hasPagosMonedaColumns) {
    const legacyResult = await run(
      `
      INSERT INTO pagos (pedido_id, metodo_pago_id, monto, referencia, fecha)
      VALUES (?, ?, ?, ?, NOW())
      `,
      [pedidoId, metodoPagoId, monto, referencia],
      connection,
    );

    return legacyResult.insertId;
  }

  const result = await run(
    `
    INSERT INTO pagos (
      pedido_id,
      metodo_pago_id,
      moneda_id,
      tipo_cambio_id,
      monto,
      monto_recibido,
      vuelto,
      tipo_cambio_utilizado,
      monto_moneda,
      referencia,
      fecha
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      pedidoId,
      metodoPagoId,
      monedaId,
      tipoCambioId,
      monto,
      montoRecibido,
      vuelto,
      tipoCambioUtilizado,
      montoMoneda,
      referencia,
    ],
    connection,
  );

  return result.insertId;
}

async function updatePago(
  pagoId,
  { metodoPagoId, monedaId, tipoCambioId, monto, montoRecibido, vuelto, tipoCambioUtilizado, montoMoneda, referencia },
  connection,
) {
  const schema = await getSchemaCapabilities(connection);

  if (!schema.hasPagosMonedaColumns) {
    const legacyResult = await run(
      `
      UPDATE pagos
      SET metodo_pago_id = ?, monto = ?, referencia = ?
      WHERE id = ?
      `,
      [metodoPagoId, monto, referencia, pagoId],
      connection,
    );

    return legacyResult.affectedRows;
  }

  const result = await run(
    `
    UPDATE pagos
    SET
      metodo_pago_id = ?,
      moneda_id = ?,
      tipo_cambio_id = ?,
      monto = ?,
      monto_recibido = ?,
      vuelto = ?,
      tipo_cambio_utilizado = ?,
      monto_moneda = ?,
      referencia = ?
    WHERE id = ?
    `,
    [metodoPagoId, monedaId, tipoCambioId, monto, montoRecibido, vuelto, tipoCambioUtilizado, montoMoneda, referencia, pagoId],
    connection,
  );

  return result.affectedRows;
}

async function deletePago(pagoId, connection) {
  const result = await run(
    `
    DELETE FROM pagos
    WHERE id = ?
    `,
    [pagoId],
    connection,
  );

  return result.affectedRows;
}

async function sumPagosByPedidoId(pedidoId, connection) {
  const rows = await run(
    `
    SELECT COALESCE(SUM(monto), 0) AS total
    FROM pagos
    WHERE pedido_id = ?
    `,
    [pedidoId],
    connection,
  );

  return toMoney(rows[0]?.total || 0);
}

async function listMetodosPago() {
  const rows = await query(
    `
    SELECT id, nombre
    FROM metodos_pago
    ORDER BY nombre ASC
    `,
  );

  return rows.map(toMetodoPago);
}

async function findMetodoPagoById(metodoPagoId) {
  const rows = await query(
    `
    SELECT id, nombre
    FROM metodos_pago
    WHERE id = ?
    LIMIT 1
    `,
    [metodoPagoId],
  );

  const row = rows[0];
  return row ? toMetodoPago(row) : null;
}

async function listCuentasByPedidoId(pedidoId) {
  const schema = await getSchemaCapabilities();
  if (!schema.hasCuentasPedidoTable) {
    return [];
  }

  const rows = await query(
    `
    SELECT
      id,
      pedido_id,
      numero_cuenta,
      subtotal,
      impuesto,
      descuento,
      total,
      estado,
      fecha_creacion,
      fecha_actualizacion
    FROM cuentas_pedido
    WHERE pedido_id = ?
    ORDER BY numero_cuenta ASC, id ASC
    `,
    [pedidoId],
  );

  return rows.map(toCuentaPedido);
}

async function findCuentaByIdAndPedido(cuentaId, pedidoId, connection) {
  const schema = await getSchemaCapabilities(connection);
  if (!schema.hasCuentasPedidoTable) {
    return null;
  }

  const rows = await run(
    `
    SELECT
      id,
      pedido_id,
      numero_cuenta,
      subtotal,
      impuesto,
      descuento,
      total,
      estado,
      fecha_creacion,
      fecha_actualizacion
    FROM cuentas_pedido
    WHERE id = ? AND pedido_id = ?
    LIMIT 1
    `,
    [cuentaId, pedidoId],
    connection,
  );

  const row = rows[0];
  return row ? toCuentaPedido(row) : null;
}

async function countCuentasByPedidoId(pedidoId, connection) {
  const schema = await getSchemaCapabilities(connection);
  if (!schema.hasCuentasPedidoTable) {
    return 0;
  }

  const rows = await run(
    `
    SELECT COUNT(*) AS total
    FROM cuentas_pedido
    WHERE pedido_id = ?
    `,
    [pedidoId],
    connection,
  );

  return Number(rows[0]?.total || 0);
}

async function createCuentaPedido({ pedidoId, numeroCuenta, subtotal, impuesto, descuento, total, estado = "ABIERTA" }, connection) {
  const schema = await getSchemaCapabilities(connection);
  if (!schema.hasCuentasPedidoTable) {
    throw new Error("La tabla cuentas_pedido no existe");
  }

  const result = await run(
    `
    INSERT INTO cuentas_pedido (
      pedido_id,
      numero_cuenta,
      subtotal,
      impuesto,
      descuento,
      total,
      estado,
      fecha_creacion,
      fecha_actualizacion
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [pedidoId, numeroCuenta, subtotal, impuesto, descuento, total, estado],
    connection,
  );

  return result.insertId;
}

async function updateCuentaPedido(cuentaId, { subtotal, impuesto, descuento, total, estado }, connection) {
  const schema = await getSchemaCapabilities(connection);
  if (!schema.hasCuentasPedidoTable) {
    throw new Error("La tabla cuentas_pedido no existe");
  }

  const result = await run(
    `
    UPDATE cuentas_pedido
    SET
      subtotal = ?,
      impuesto = ?,
      descuento = ?,
      total = ?,
      estado = ?,
      fecha_actualizacion = NOW()
    WHERE id = ?
    `,
    [subtotal, impuesto, descuento, total, estado, cuentaId],
    connection,
  );

  return result.affectedRows;
}

async function assignDetalleToCuenta(detalleId, pedidoId, cuentaPedidoId, connection) {
  const schema = await getSchemaCapabilities(connection);
  if (!schema.hasDetalleCuentaPedidoId) {
    throw new Error("La columna cuenta_pedido_id no existe en detalle_pedido");
  }

  const result = await run(
    `
    UPDATE detalle_pedido
    SET cuenta_pedido_id = ?
    WHERE id = ? AND pedido_id = ?
    `,
    [cuentaPedidoId, detalleId, pedidoId],
    connection,
  );

  return result.affectedRows;
}

async function sumDetalleSubtotalByCuenta(cuentaPedidoId, connection) {
  const schema = await getSchemaCapabilities(connection);
  if (!schema.hasDetalleCuentaPedidoId) {
    return 0;
  }

  const rows = await run(
    `
    SELECT COALESCE(SUM(subtotal), 0) AS total
    FROM detalle_pedido
    WHERE cuenta_pedido_id = ?
    `,
    [cuentaPedidoId],
    connection,
  );

  return toMoney(rows[0]?.total || 0);
}

async function listDetalleByCuentaPedidoId(cuentaPedidoId) {
  const schema = await getSchemaCapabilities();
  if (!schema.hasDetalleCuentaPedidoId) {
    return [];
  }

  const rows = await query(
    `
    SELECT
      d.id,
      d.pedido_id,
      d.cuenta_pedido_id,
      d.producto_id,
      p.codigo AS producto_codigo,
      p.nombre AS producto_nombre,
      d.cantidad,
      d.precio_unitario,
      d.subtotal,
      d.observacion,
      d.created_at
    FROM detalle_pedido d
    LEFT JOIN productos p ON p.id = d.producto_id
    WHERE d.cuenta_pedido_id = ?
    ORDER BY d.id ASC
    `,
    [cuentaPedidoId],
  );

  return rows.map(toDetalle);
}

module.exports = {
  pool,
  listPedidos,
  findPedidoById,
  findPedidoByCode,
  getNextPedidoCodeForDate,
  createPedido,
  updatePedido,
  deletePedidoCascade,
  listDetalleByPedidoId,
  findDetalleByIdAndPedido,
  createDetallePedido,
  updateDetallePedido,
  deleteDetallePedido,
  sumDetalleSubtotalByPedido,
  updatePedidoTotals,
  listPagosByPedidoId,
  findPagoByIdAndPedido,
  createPago,
  updatePago,
  deletePago,
  sumPagosByPedidoId,
  listMetodosPago,
  findMetodoPagoById,
  listCuentasByPedidoId,
  findCuentaByIdAndPedido,
  countCuentasByPedidoId,
  createCuentaPedido,
  updateCuentaPedido,
  assignDetalleToCuenta,
  sumDetalleSubtotalByCuenta,
  listDetalleByCuentaPedidoId,
};
