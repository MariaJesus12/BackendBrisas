const { query } = require("../config/database");

function toMoney(value) {
  return Number(value || 0);
}

function toProductSalesRow(row) {
  return {
    productoId: row.producto_id,
    productoCodigo: row.producto_codigo,
    productoNombre: row.producto_nombre,
    categoriaId: row.categoria_id,
    categoriaNombre: row.categoria_nombre,
    disponible: row.disponible === 1,
    unidadesVendidas: Number(row.unidades_vendidas || 0),
    totalVendido: toMoney(row.total_vendido),
    pedidosCount: Number(row.pedidos_count || 0),
  };
}

async function listProductSalesStats({ fechaDesde, fechaHasta, onlyAvailable = false } = {}) {
  const filters = [];
  const params = [fechaDesde, fechaHasta];

  if (onlyAvailable) {
    filters.push("pr.disponible = 1");
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await query(
    `
    SELECT
      pr.id AS producto_id,
      pr.codigo AS producto_codigo,
      pr.nombre AS producto_nombre,
      pr.categoria_id,
      c.nombre AS categoria_nombre,
      pr.disponible,
      COALESCE(vs.unidades_vendidas, 0) AS unidades_vendidas,
      COALESCE(vs.total_vendido, 0) AS total_vendido,
      COALESCE(vs.pedidos_count, 0) AS pedidos_count
    FROM productos pr
    INNER JOIN categorias c ON c.id = pr.categoria_id
    LEFT JOIN (
      SELECT
        d.producto_id,
        SUM(d.cantidad) AS unidades_vendidas,
        SUM(d.subtotal) AS total_vendido,
        COUNT(DISTINCT p.id) AS pedidos_count
      FROM detalle_pedido d
      INNER JOIN pedidos p ON p.id = d.pedido_id
      WHERE p.estado IN ('FACTURADO', 'CERRADO')
        AND p.fecha_apertura >= ?
        AND p.fecha_apertura <= ?
      GROUP BY d.producto_id
    ) vs ON vs.producto_id = pr.id
    ${whereClause}
    ORDER BY unidades_vendidas DESC, total_vendido DESC, pr.nombre ASC
    `,
    params,
  );

  return rows.map(toProductSalesRow);
}

async function listProductSalesDailySeries({ fechaDesde, fechaHasta } = {}) {
  const rows = await query(
    `
    SELECT
      DATE(p.fecha_apertura) AS fecha,
      SUM(d.cantidad) AS unidades_vendidas,
      SUM(d.subtotal) AS total_vendido,
      COUNT(DISTINCT p.id) AS pedidos_count
    FROM detalle_pedido d
    INNER JOIN pedidos p ON p.id = d.pedido_id
    WHERE p.estado IN ('FACTURADO', 'CERRADO')
      AND p.fecha_apertura >= ?
      AND p.fecha_apertura <= ?
    GROUP BY DATE(p.fecha_apertura)
    ORDER BY DATE(p.fecha_apertura) ASC
    `,
    [fechaDesde, fechaHasta],
  );

  return rows.map((row) => ({
    fecha: row.fecha,
    unidadesVendidas: Number(row.unidades_vendidas || 0),
    totalVendido: toMoney(row.total_vendido),
    pedidosCount: Number(row.pedidos_count || 0),
  }));
}

async function getSalesPeriodOrderSummary({ fechaDesde, fechaHasta } = {}) {
  const rows = await query(
    `
    SELECT
      COUNT(*) AS pedidos_total_ventas,
      SUM(CASE WHEN p.estado = 'FACTURADO' THEN 1 ELSE 0 END) AS pedidos_facturados,
      SUM(CASE WHEN p.estado = 'CERRADO' THEN 1 ELSE 0 END) AS pedidos_cerrados
    FROM pedidos p
    WHERE p.estado IN ('FACTURADO', 'CERRADO')
      AND p.fecha_apertura >= ?
      AND p.fecha_apertura <= ?
    `,
    [fechaDesde, fechaHasta],
  );

  const row = rows[0] || {};
  return {
    pedidosTotalVentas: Number(row.pedidos_total_ventas || 0),
    pedidosFacturados: Number(row.pedidos_facturados || 0),
    pedidosCerrados: Number(row.pedidos_cerrados || 0),
  };
}

module.exports = {
  listProductSalesStats,
  listProductSalesDailySeries,
  getSalesPeriodOrderSummary,
};
