const {
  getSalesPeriodOrderSummary,
  listProductSalesDailySeries,
  listProductSalesStats,
} = require("../models/estadistica.model");

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toMySqlDateTime(date) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function parseDateInput(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  return null;
}

function buildRangeFromMonth(rawMonth) {
  const match = String(rawMonth || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const start = new Date(year, month - 1, 1, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59);

  return {
    mode: "month",
    fechaDesde: toMySqlDateTime(start),
    fechaHasta: toMySqlDateTime(end),
    label: `${year}-${pad2(month)}`,
  };
}

function buildRangeFromDate(rawDate) {
  const match = String(rawDate || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const start = new Date(year, month - 1, day, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return {
    mode: "date",
    fechaDesde: toMySqlDateTime(start),
    fechaHasta: toMySqlDateTime(end),
    label: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

function buildRangeFromExplicitDates(rawFrom, rawTo) {
  const from = parseDateInput(rawFrom);
  const to = parseDateInput(rawTo);

  if (!from || !to) {
    return null;
  }

  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const end = new Date(to);
  end.setHours(23, 59, 59, 0);

  if (end.getTime() < start.getTime()) {
    return null;
  }

  return {
    mode: "range",
    fechaDesde: toMySqlDateTime(start),
    fechaHasta: toMySqlDateTime(end),
    label: `${toMySqlDateTime(start)} -> ${toMySqlDateTime(end)}`,
  };
}

function resolveStatsRange(query) {
  const monthValue = query.month ?? query.mes;
  if (monthValue) {
    return buildRangeFromMonth(monthValue);
  }

  const dateValue = query.date ?? query.fecha;
  if (dateValue) {
    return buildRangeFromDate(dateValue);
  }

  const rawFrom = query.fechaDesde ?? query.fecha_desde ?? query.from ?? query.desde;
  const rawTo = query.fechaHasta ?? query.fecha_hasta ?? query.to ?? query.hasta;
  if (rawFrom || rawTo) {
    return buildRangeFromExplicitDates(rawFrom, rawTo);
  }

  const now = new Date();
  return buildRangeFromMonth(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
}

function buildChartPayload(ranking, dailySeries) {
  const topTen = ranking.slice(0, 10);

  return {
    productsByUnits: {
      labels: topTen.map((item) => item.productoNombre),
      datasets: [
        {
          label: "Unidades vendidas",
          data: topTen.map((item) => item.unidadesVendidas),
        },
      ],
    },
    productsByRevenue: {
      labels: topTen.map((item) => item.productoNombre),
      datasets: [
        {
          label: "Total vendido",
          data: topTen.map((item) => item.totalVendido),
        },
      ],
    },
    dailySales: {
      labels: dailySeries.map((item) => item.fecha),
      datasets: [
        {
          label: "Unidades vendidas por dia",
          data: dailySeries.map((item) => item.unidadesVendidas),
        },
        {
          label: "Monto vendido por dia",
          data: dailySeries.map((item) => item.totalVendido),
        },
      ],
    },
  };
}

async function getProductSalesStatsHandler(req, res) {
  const range = resolveStatsRange(req.query || {});
  if (!range) {
    res.status(400).json({
      message: "Rango de fechas invalido",
      acceptedFormats: {
        month: "YYYY-MM",
        mes: "YYYY-MM",
        date: "YYYY-MM-DD",
        fecha: "YYYY-MM-DD",
        fechaDesde: "YYYY-MM-DD o ISO",
        fechaHasta: "YYYY-MM-DD o ISO",
        from: "YYYY-MM-DD o ISO",
        to: "YYYY-MM-DD o ISO",
      },
    });
    return;
  }

  const onlyAvailable = req.query.available === "1" || req.query.available === "true";
  const ranking = await listProductSalesStats({
    fechaDesde: range.fechaDesde,
    fechaHasta: range.fechaHasta,
    onlyAvailable,
  });

  const dailySeries = await listProductSalesDailySeries({
    fechaDesde: range.fechaDesde,
    fechaHasta: range.fechaHasta,
  });

  const orderSummary = await getSalesPeriodOrderSummary({
    fechaDesde: range.fechaDesde,
    fechaHasta: range.fechaHasta,
  });

  const topProduct = ranking.length > 0 ? ranking[0] : null;
  const bottomProduct = ranking.length > 0 ? ranking[ranking.length - 1] : null;
  const soldProducts = ranking.filter((item) => item.unidadesVendidas > 0);
  const leastSoldWithSales = soldProducts.length > 0 ? soldProducts[soldProducts.length - 1] : null;
  const totalUnits = soldProducts.reduce((acc, item) => acc + item.unidadesVendidas, 0);
  const totalRevenue = soldProducts.reduce((acc, item) => acc + item.totalVendido, 0);
  const topProductsByUnits = soldProducts.slice(0, 10);
  const topProductsByRevenue = [...soldProducts]
    .sort((a, b) => b.totalVendido - a.totalVendido || b.unidadesVendidas - a.unidadesVendidas)
    .slice(0, 10);

  const charts = buildChartPayload(ranking, dailySeries);

  const summary = {
    totalProducts: ranking.length,
    soldProducts: soldProducts.length,
    unsoldProducts: ranking.length - soldProducts.length,
    totalUnits,
    totalRevenue,
    pedidosFacturados: orderSummary.pedidosFacturados,
    pedidosCerrados: orderSummary.pedidosCerrados,
    pedidosTotalVentas: orderSummary.pedidosTotalVentas,
  };

  res.json({
    period: {
      mode: range.mode,
      label: range.label,
      fechaDesde: range.fechaDesde,
      fechaHasta: range.fechaHasta,
    },
    summary,
    resumenRapido: summary,
    topProduct,
    productoMasVendido: topProduct,
    bottomProduct,
    productoMenosVendido: bottomProduct,
    productoMenosVendidoConVentas: leastSoldWithSales,
    ranking,
    rankingProductos: ranking,
    topProductsByUnits,
    topProductosPorUnidades: topProductsByUnits,
    topProductsByRevenue,
    topProductosPorIngresos: topProductsByRevenue,
    charts,
    graficas: charts,
    dailySeries,
    ventasDiarias: dailySeries,
    pedidosFacturados: orderSummary.pedidosFacturados,
    pedidosCerrados: orderSummary.pedidosCerrados,
    pedidosTotalVentas: orderSummary.pedidosTotalVentas,
  });
}

module.exports = {
  getProductSalesStatsHandler,
};
