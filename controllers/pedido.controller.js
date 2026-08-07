const { findMesaById } = require("../models/mesa.model");
const {
  countActiveQueueJobsByPedidoAndTipo,
  createColaImpresion,
  findActiveImpresoraByTipo,
  findColaImpresionById,
} = require("../models/impresion.model");
const {
  countCuentasByPedidoId,
  createCuentaPedido,
  createDetallePedido,
  createPago,
  createPedido,
  deleteDetallePedido,
  deletePago,
  deletePedidoCascade,
  findCuentaByIdAndPedido,
  findDetalleByIdAndPedido,
  findMetodoPagoById,
  findPagoByIdAndPedido,
  findPedidoById,
  getNextPedidoCodeForDate,
  listCuentasByPedidoId,
  listDetalleByCuentaPedidoId,
  listDetalleByPedidoId,
  listMetodosPago,
  listPagosByPedidoId,
  listPedidos,
  pool,
  sumDetalleSubtotalByCuenta,
  sumDetalleSubtotalByPedido,
  sumPagosByCuentaPedidoId,
  sumPagosByPedidoId,
  updateCuentaPedido,
  updateDetallePedido,
  updatePago,
  updatePedido,
  updatePedidoTotals,
} = require("../models/pedido.model");
const { findConfiguracionByClave } = require("../models/configuracion.model");
const { findMonedaByCode, findMonedaById, listMonedas } = require("../models/moneda.model");
const { findActiveClienteById } = require("../models/cliente.model");
const { findProductById } = require("../models/product.model");
const { findActiveReservaByMesaAt } = require("../models/reserva.model");
const { findLatestActiveTipoCambio, findTipoCambioById } = require("../models/tipo-cambio.model");
const { findUserById } = require("../models/user.model");

const PEDIDO_TIPOS = new Set(["MESA", "LLEVAR"]);
const PEDIDO_ESTADOS = new Set(["BORRADOR", "COCINA", "FACTURADO", "CERRADO", "CANCELADO"]);
const MONEY_EPSILON = 0.009;
const SETTLEMENT_TOLERANCE = 1;

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function isSettled(total, paid, tolerance = SETTLEMENT_TOLERANCE) {
  return roundMoney(Number(paid || 0)) + tolerance >= roundMoney(Number(total || 0));
}

function normalizeSaldo(value, tolerance = SETTLEMENT_TOLERANCE) {
  const rounded = roundMoney(Number(value || 0));
  return Math.abs(rounded) <= tolerance ? 0 : rounded;
}

function appError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function parseBooleanInput(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "si", "yes"].includes(normalized);
}

async function getServicePercentage() {
  const config = await findConfiguracionByClave("PORCENTAJE_SERVICIO");
  const parsed = Number(config?.valor);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 10;
  }

  return parsed;
}

function resolveApplyService(input, fallback = true) {
  if (input.tipo === "LLEVAR") {
    return false;
  }

  if (input.aplicarServicio !== undefined) {
    return parseBooleanInput(input.aplicarServicio, true);
  }

  if (input.exonerarServicio !== undefined) {
    return !parseBooleanInput(input.exonerarServicio, false);
  }

  return fallback;
}

function computeServiceAmount(subtotal, applyService, servicePercentage) {
  if (!applyService) {
    return 0;
  }

  return roundMoney((roundMoney(subtotal) * Number(servicePercentage || 0)) / 100);
}

function computePedidoTotals(subtotal, applyService, servicePercentage) {
  const roundedSubtotal = roundMoney(subtotal);
  const impuesto = computeServiceAmount(roundedSubtotal, applyService, servicePercentage);

  return {
    subtotal: roundedSubtotal,
    impuesto,
    total: roundMoney(roundedSubtotal + impuesto),
  };
}

function parseDateTime(value) {
  if (value == null || value === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function buildDateRangeFromDay(rawDate) {
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
    fechaDesde: toMySqlDateTime(start),
    fechaHasta: toMySqlDateTime(end),
  };
}

function toMySqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function formatMoney(value) {
  return roundMoney(value).toFixed(2);
}

function getPedidoDestinoLabel(pedido) {
  if (pedido.tipo === "MESA") {
    return `MESA ${pedido.mesaNumero || pedido.mesaId}`;
  }

  if (pedido.clienteNombre) {
    return `PARA LLEVAR - ${pedido.clienteNombre}`;
  }

  if (pedido.clienteId) {
    return `PARA LLEVAR - CLIENTE ${pedido.clienteId}`;
  }

  return "PARA LLEVAR";
}

function buildKitchenTicket(pedido) {
  const lines = [
    "**************",
    "COMANDA COCINA",
    getPedidoDestinoLabel(pedido),
    `Pedido: ${pedido.codigo}`,
    `Atiende: ${pedido.usuarioNombre || `Usuario ${pedido.usuarioId}`}`,
    `Hora: ${formatDateTime(new Date())}`,
    "",
  ];

  for (const detail of pedido.detalles) {
    lines.push(`${detail.cantidad} x ${detail.productoNombre}`);

    if (detail.observacion) {
      lines.push(`OBS: ${detail.observacion}`);
    }
  }

  lines.push("**************");

  return lines.join("\n");
}

function buildInvoiceTicket(pedido) {
  const lines = [
    "**************",
    "FACTURA",
    getPedidoDestinoLabel(pedido),
    `Pedido: ${pedido.codigo}`,
    `Fecha: ${formatDateTime(new Date())}`,
    "",
  ];

  for (const detail of pedido.detalles) {
    lines.push(`${detail.cantidad} x ${detail.productoNombre}`);
    lines.push(`  ${formatMoney(detail.precioUnitario)} = ${formatMoney(detail.subtotal)}`);

    if (detail.observacion) {
      lines.push(`  OBS: ${detail.observacion}`);
    }
  }

  lines.push("");
  lines.push(`Subtotal: ${formatMoney(pedido.subtotal)}`);
  lines.push(`Servicio: ${formatMoney(pedido.impuesto)}`);
  lines.push(`TOTAL: ${formatMoney(pedido.total)}`);
  lines.push("Gracias por su visita");
  lines.push("**************");

  return lines.join("\n");
}

async function queuePedidoPrint({ pedido, tipo, usuarioId, reimpresion = 0, copias = 1 }, connection) {
  const printer = await findActiveImpresoraByTipo(tipo, connection);
  if (!printer) {
    throw appError(409, `No hay una impresora activa configurada para ${tipo}`);
  }

  const activeJobs = await countActiveQueueJobsByPedidoAndTipo(pedido.id, tipo, connection);
  if (activeJobs > 0) {
    throw appError(409, `Ya existe una impresion ${tipo} pendiente o en proceso para este pedido`);
  }

  const contenido = tipo === "COCINA" ? buildKitchenTicket(pedido) : buildInvoiceTicket(pedido);

  const jobId = await createColaImpresion(
    {
      pedidoId: pedido.id,
      impresoraId: printer.id,
      usuarioId,
      tipo,
      contenido,
      estado: "PENDIENTE",
      intentos: 0,
      mensajeError: null,
      reimpresion,
      copias,
      fechaImpresion: null,
    },
    connection,
  );

  return jobId;
}

function parsePedidoCreateInput(body, authUser) {
  const mesaRaw = body.mesaId ?? body.mesa_id;
  const clienteRaw = body.clienteId ?? body.cliente_id;
  const usuarioRaw = body.usuarioId ?? body.usuario_id ?? authUser?.id;

  return {
    codigo: "",
    mesaId: mesaRaw == null || mesaRaw === "" ? null : Number(mesaRaw),
    clienteId: clienteRaw == null || clienteRaw === "" ? null : Number(clienteRaw),
    usuarioId: Number(usuarioRaw),
    tipo: normalizeUpper(body.tipo),
    estado: normalizeUpper(body.estado || "BORRADOR"),
    aplicarServicio: body.aplicarServicio ?? body.aplica_servicio,
    exonerarServicio: body.exonerarServicio ?? body.exonerar_servicio,
    fechaApertura: parseDateTime(body.fechaApertura ?? body.fecha_apertura),
    fechaCierre: parseDateTime(body.fechaCierre ?? body.fecha_cierre),
    detalles: Array.isArray(body.detalles) ? body.detalles : [],
  };
}

function parsePedidoUpdateInput(body, existingPedido) {
  const hasMesaId = Object.prototype.hasOwnProperty.call(body, "mesaId");
  const hasMesaIdAlias = Object.prototype.hasOwnProperty.call(body, "mesa_id");
  const hasClienteId = Object.prototype.hasOwnProperty.call(body, "clienteId");
  const hasClienteIdAlias = Object.prototype.hasOwnProperty.call(body, "cliente_id");
  const hasUsuarioId = Object.prototype.hasOwnProperty.call(body, "usuarioId");
  const hasUsuarioIdAlias = Object.prototype.hasOwnProperty.call(body, "usuario_id");
  const hasFechaApertura = Object.prototype.hasOwnProperty.call(body, "fechaApertura");
  const hasFechaAperturaAlias = Object.prototype.hasOwnProperty.call(body, "fecha_apertura");
  const hasFechaCierre = Object.prototype.hasOwnProperty.call(body, "fechaCierre");
  const hasFechaCierreAlias = Object.prototype.hasOwnProperty.call(body, "fecha_cierre");

  const mesaRaw = hasMesaId ? body.mesaId : hasMesaIdAlias ? body.mesa_id : existingPedido.mesaId;
  const clienteRaw = hasClienteId ? body.clienteId : hasClienteIdAlias ? body.cliente_id : existingPedido.clienteId;
  const usuarioRaw = hasUsuarioId ? body.usuarioId : hasUsuarioIdAlias ? body.usuario_id : existingPedido.usuarioId;

  return {
    codigo: existingPedido.codigo,
    mesaId: mesaRaw == null || mesaRaw === "" ? null : Number(mesaRaw),
    clienteId: clienteRaw == null || clienteRaw === "" ? null : Number(clienteRaw),
    usuarioId: Number(usuarioRaw),
    tipo: Object.prototype.hasOwnProperty.call(body, "tipo") ? normalizeUpper(body.tipo) : existingPedido.tipo,
    estado: Object.prototype.hasOwnProperty.call(body, "estado")
      ? normalizeUpper(body.estado)
      : existingPedido.estado,
    aplicarServicio:
      body.aplicarServicio ??
      body.aplica_servicio ??
      (Object.prototype.hasOwnProperty.call(body, "impuesto") ? Number(body.impuesto) > 0 : undefined),
    exonerarServicio: body.exonerarServicio ?? body.exonerar_servicio,
    fechaApertura: hasFechaApertura
      ? parseDateTime(body.fechaApertura)
      : hasFechaAperturaAlias
        ? parseDateTime(body.fecha_apertura)
        : existingPedido.fechaApertura,
    fechaCierre: hasFechaCierre
      ? parseDateTime(body.fechaCierre)
      : hasFechaCierreAlias
        ? parseDateTime(body.fecha_cierre)
        : existingPedido.fechaCierre,
  };
}

function validatePedidoInput(input) {
  const missingFields = [];

  if (!PEDIDO_TIPOS.has(input.tipo)) missingFields.push("tipo");
  if (!PEDIDO_ESTADOS.has(input.estado)) missingFields.push("estado");
  if (!Number.isInteger(input.usuarioId) || input.usuarioId <= 0) missingFields.push("usuarioId");

  if (input.tipo === "MESA" && (!Number.isInteger(input.mesaId) || input.mesaId <= 0)) {
    missingFields.push("mesaId");
  }

  if (input.tipo === "LLEVAR" && (!Number.isInteger(input.clienteId) || input.clienteId <= 0)) {
    missingFields.push("clienteId");
  }

  if (
    input.tipo === "MESA" &&
    input.clienteId != null &&
    (!Number.isInteger(input.clienteId) || input.clienteId <= 0)
  ) {
    missingFields.push("clienteId");
  }

  if (input.codigo && input.codigo.length > 30) {
    return {
      ok: false,
      status: 400,
      payload: { message: "El codigo no puede exceder 30 caracteres" },
    };
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          mesaId: ["mesaId", "mesa_id"],
          clienteId: ["clienteId", "cliente_id"],
          usuarioId: ["usuarioId", "usuario_id"],
          fechaApertura: ["fechaApertura", "fecha_apertura"],
          fechaCierre: ["fechaCierre", "fecha_cierre"],
        },
      },
    };
  }

  return { ok: true };
}

function parseDetalleInput(body, existingDetalle) {
  const cuentaRaw = Object.prototype.hasOwnProperty.call(body, "cuentaPedidoId")
    ? body.cuentaPedidoId
    : Object.prototype.hasOwnProperty.call(body, "cuenta_pedido_id")
      ? body.cuenta_pedido_id
      : existingDetalle?.cuentaPedidoId;

  const productoRaw = Object.prototype.hasOwnProperty.call(body, "productoId")
    ? body.productoId
    : Object.prototype.hasOwnProperty.call(body, "producto_id")
      ? body.producto_id
      : existingDetalle?.productoId;

  const cantidadRaw = Object.prototype.hasOwnProperty.call(body, "cantidad") ? body.cantidad : existingDetalle?.cantidad;

  const precioRaw = Object.prototype.hasOwnProperty.call(body, "precioUnitario")
    ? body.precioUnitario
    : Object.prototype.hasOwnProperty.call(body, "precio_unitario")
      ? body.precio_unitario
      : existingDetalle?.precioUnitario;

  const observacionRaw = Object.prototype.hasOwnProperty.call(body, "observacion")
    ? body.observacion
    : existingDetalle?.observacion;

  return {
    cuentaPedidoId: cuentaRaw == null || cuentaRaw === "" ? null : Number(cuentaRaw),
    productoId: Number(productoRaw),
    cantidad: Number(cantidadRaw),
    precioUnitario: precioRaw == null || precioRaw === "" ? null : Number(precioRaw),
    observacion: observacionRaw == null ? null : String(observacionRaw).trim(),
  };
}

function validateDetalleInput(detalle) {
  const missingFields = [];

  if (!Number.isInteger(detalle.productoId) || detalle.productoId <= 0) missingFields.push("productoId");
  if (!Number.isInteger(detalle.cantidad) || detalle.cantidad <= 0) missingFields.push("cantidad");

  if (detalle.cuentaPedidoId != null && (!Number.isInteger(detalle.cuentaPedidoId) || detalle.cuentaPedidoId <= 0)) {
    missingFields.push("cuentaPedidoId");
  }

  if (detalle.precioUnitario != null && (!Number.isFinite(detalle.precioUnitario) || detalle.precioUnitario < 0)) {
    missingFields.push("precioUnitario");
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          productoId: ["productoId", "producto_id"],
          precioUnitario: ["precioUnitario", "precio_unitario"],
        },
      },
    };
  }

  if (detalle.observacion && detalle.observacion.length > 65535) {
    return {
      ok: false,
      status: 400,
      payload: { message: "La observacion es demasiado larga" },
    };
  }

  return { ok: true };
}

function parsePagoInput(body, existingPago) {
  const metodoRaw = Object.prototype.hasOwnProperty.call(body, "metodoPagoId")
    ? body.metodoPagoId
    : Object.prototype.hasOwnProperty.call(body, "metodo_pago_id")
      ? body.metodo_pago_id
      : existingPago?.metodoPagoId;

  const monedaRaw = Object.prototype.hasOwnProperty.call(body, "monedaId")
    ? body.monedaId
    : Object.prototype.hasOwnProperty.call(body, "moneda_id")
      ? body.moneda_id
      : existingPago?.monedaId;

  const tipoCambioRaw = Object.prototype.hasOwnProperty.call(body, "tipoCambioId")
    ? body.tipoCambioId
    : Object.prototype.hasOwnProperty.call(body, "tipo_cambio_id")
      ? body.tipo_cambio_id
      : existingPago?.tipoCambioId;

  const cuentaPedidoRaw = Object.prototype.hasOwnProperty.call(body, "cuentaPedidoId")
    ? body.cuentaPedidoId
    : Object.prototype.hasOwnProperty.call(body, "cuenta_pedido_id")
      ? body.cuenta_pedido_id
      : Object.prototype.hasOwnProperty.call(body, "cuentaId")
        ? body.cuentaId
        : Object.prototype.hasOwnProperty.call(body, "cuenta_id")
          ? body.cuenta_id
      : existingPago?.cuentaPedidoId;

  const montoRaw = Object.prototype.hasOwnProperty.call(body, "monto") ? body.monto : existingPago?.monto;
  const montoMonedaRaw = Object.prototype.hasOwnProperty.call(body, "montoMoneda")
    ? body.montoMoneda
    : Object.prototype.hasOwnProperty.call(body, "monto_moneda")
      ? body.monto_moneda
      : existingPago?.montoMoneda;

  const montoRecibidoRaw = Object.prototype.hasOwnProperty.call(body, "montoRecibido")
    ? body.montoRecibido
    : Object.prototype.hasOwnProperty.call(body, "monto_recibido")
      ? body.monto_recibido
      : existingPago?.montoRecibido;

  const montoRecibidoMonedaRaw = Object.prototype.hasOwnProperty.call(body, "montoRecibidoMoneda")
    ? body.montoRecibidoMoneda
    : Object.prototype.hasOwnProperty.call(body, "monto_recibido_moneda")
      ? body.monto_recibido_moneda
      : undefined;

  const referenciaRaw = Object.prototype.hasOwnProperty.call(body, "referencia")
    ? body.referencia
    : existingPago?.referencia;

  return {
    metodoPagoId: Number(metodoRaw),
    cuentaPedidoId: cuentaPedidoRaw == null || cuentaPedidoRaw === "" ? null : Number(cuentaPedidoRaw),
    monedaId: Number(monedaRaw),
    tipoCambioId: tipoCambioRaw == null || tipoCambioRaw === "" ? null : Number(tipoCambioRaw),
    monto: montoRaw == null || montoRaw === "" ? null : Number(montoRaw),
    montoMoneda: montoMonedaRaw == null || montoMonedaRaw === "" ? null : Number(montoMonedaRaw),
    montoRecibido: montoRecibidoRaw == null || montoRecibidoRaw === "" ? null : Number(montoRecibidoRaw),
    montoRecibidoMoneda:
      montoRecibidoMonedaRaw == null || montoRecibidoMonedaRaw === "" ? null : Number(montoRecibidoMonedaRaw),
    referencia: referenciaRaw == null ? null : String(referenciaRaw).trim(),
  };
}

function validatePagoInput(pago) {
  const missingFields = [];

  if (!Number.isInteger(pago.metodoPagoId) || pago.metodoPagoId <= 0) missingFields.push("metodoPagoId");
  if (!Number.isInteger(pago.monedaId) || pago.monedaId <= 0) missingFields.push("monedaId");

  if (pago.cuentaPedidoId != null && (!Number.isInteger(pago.cuentaPedidoId) || pago.cuentaPedidoId <= 0)) {
    missingFields.push("cuentaPedidoId");
  }

  const hasMonto = Number.isFinite(pago.monto) && pago.monto > 0;
  const hasMontoMoneda = Number.isFinite(pago.montoMoneda) && pago.montoMoneda > 0;

  if (!hasMonto && !hasMontoMoneda) {
    missingFields.push("monto|montoMoneda");
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          metodoPagoId: ["metodoPagoId", "metodo_pago_id"],
          cuentaPedidoId: ["cuentaPedidoId", "cuenta_pedido_id", "cuentaId", "cuenta_id"],
          monedaId: ["monedaId", "moneda_id"],
          tipoCambioId: ["tipoCambioId", "tipo_cambio_id"],
          montoMoneda: ["montoMoneda", "monto_moneda"],
          montoRecibido: ["montoRecibido", "monto_recibido"],
          montoRecibidoMoneda: ["montoRecibidoMoneda", "monto_recibido_moneda"],
        },
      },
    };
  }

  if (pago.referencia && pago.referencia.length > 100) {
    return {
      ok: false,
      status: 400,
      payload: { message: "La referencia no puede exceder 100 caracteres" },
    };
  }

  return { ok: true };
}

async function resolvePedidoPayment(pagoInput, { disableReceivedAmount = false } = {}) {
  const moneda = await findMonedaById(pagoInput.monedaId);
  if (!moneda || !moneda.activa) {
    throw appError(400, "monedaId invalido o moneda inactiva");
  }

  const codigoMoneda = normalizeUpper(moneda.codigo);
  const isUsd = codigoMoneda === "USD";
  const isCrc = codigoMoneda === "CRC" || codigoMoneda === "COL";

  if (!isUsd && !isCrc) {
    throw appError(400, "La moneda seleccionada no esta soportada para facturacion");
  }

  let tipoCambio = null;
  let tipoCambioUtilizado = 1;

  if (isUsd) {
    tipoCambio = pagoInput.tipoCambioId
      ? await findTipoCambioById(pagoInput.tipoCambioId)
      : await findLatestActiveTipoCambio();

    if (!tipoCambio || !tipoCambio.activo) {
      throw appError(409, "No hay tipo de cambio activo para pagos en dolares");
    }

    tipoCambioUtilizado = Number(tipoCambio.venta);
    if (!Number.isFinite(tipoCambioUtilizado) || tipoCambioUtilizado <= 0) {
      throw appError(409, "El tipo de cambio activo es invalido");
    }
  }

  const hasMonto = Number.isFinite(pagoInput.monto) && pagoInput.monto > 0;
  const hasMontoMoneda = Number.isFinite(pagoInput.montoMoneda) && pagoInput.montoMoneda > 0;

  let montoColones = 0;
  let montoMoneda = 0;

  if (isUsd) {
    // For USD flows, prefer montoMoneda when present. Many frontends send both
    // fields using the selected currency and monto can otherwise be misread as CRC.
    if (hasMontoMoneda) {
      montoMoneda = roundMoney(pagoInput.montoMoneda);
      montoColones = roundMoney(montoMoneda * tipoCambioUtilizado);
    } else {
      montoColones = roundMoney(pagoInput.monto);
      montoMoneda = roundMoney(montoColones / tipoCambioUtilizado);
    }
  } else {
    montoColones = roundMoney(hasMonto ? pagoInput.monto : pagoInput.montoMoneda);
    montoMoneda = montoColones;
  }

  if (!Number.isFinite(montoColones) || montoColones <= 0) {
    throw appError(400, "El monto calculado es invalido");
  }

  let montoRecibidoColones = montoColones;
  let vuelto = 0;

  if (!disableReceivedAmount) {
    const hasMontoRecibido = Number.isFinite(pagoInput.montoRecibido) && pagoInput.montoRecibido > 0;
    const hasMontoRecibidoMoneda = Number.isFinite(pagoInput.montoRecibidoMoneda) && pagoInput.montoRecibidoMoneda > 0;

    if (isUsd) {
      if (hasMontoRecibidoMoneda) {
        montoRecibidoColones = roundMoney(pagoInput.montoRecibidoMoneda * tipoCambioUtilizado);
      } else if (hasMontoRecibido) {
        montoRecibidoColones = roundMoney(pagoInput.montoRecibido);
      }
    } else if (hasMontoRecibido || hasMontoRecibidoMoneda) {
      montoRecibidoColones = roundMoney(hasMontoRecibido ? pagoInput.montoRecibido : pagoInput.montoRecibidoMoneda);
    }

    if (montoRecibidoColones + MONEY_EPSILON < montoColones) {
      throw appError(409, "El monto recibido es menor al monto a cobrar");
    }

    const vueltoColones = roundMoney(Math.max(0, montoRecibidoColones - montoColones));
    vuelto = isUsd ? roundMoney(vueltoColones / tipoCambioUtilizado) : vueltoColones;
  }

  return {
    moneda,
    tipoCambio,
    monto: montoColones,
    montoMoneda,
    montoRecibido: montoRecibidoColones,
    vuelto,
    tipoCambioUtilizado,
  };
}

function isNoCashReceivedMethod(methodName) {
  const normalized = normalizeUpper(methodName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalized.includes("TARJETA") || normalized.includes("SINPE") || normalized.includes("TRANSFERENCIA");
}

async function syncCuentaEstadoByPayments(cuentaId, pedidoId, connection) {
  if (!cuentaId) {
    return null;
  }

  const cuenta = await findCuentaByIdAndPedido(cuentaId, pedidoId, connection);
  if (!cuenta) {
    return null;
  }

  const totalPagadoCuenta = roundMoney(await sumPagosByCuentaPedidoId(cuentaId, connection));
  const nextEstado = isSettled(cuenta.total, totalPagadoCuenta) ? "PAGADA" : "ABIERTA";

  if (cuenta.estado !== nextEstado) {
    await updateCuentaPedido(
      cuentaId,
      {
        subtotal: roundMoney(Number(cuenta.subtotal)),
        impuesto: roundMoney(Number(cuenta.impuesto)),
        descuento: roundMoney(Number(cuenta.descuento || 0)),
        total: roundMoney(Number(cuenta.total)),
        estado: nextEstado,
      },
      connection,
    );
  }

  return {
    ...cuenta,
    estado: nextEstado,
    totalPagado: totalPagadoCuenta,
    saldoPendiente: normalizeSaldo(roundMoney(Number(cuenta.total)) - totalPagadoCuenta),
  };
}

async function syncAllCuentasEstadoByPayments(pedidoId, connection) {
  const cuentas = await listCuentasByPedidoId(pedidoId);
  if (!cuentas.length) {
    return [];
  }

  const updated = [];
  for (const cuenta of cuentas) {
    const synced = await syncCuentaEstadoByPayments(cuenta.id, pedidoId, connection);
    if (synced) {
      updated.push(synced);
    }
  }

  return updated;
}

async function resolveCuentaForIncomingPayment({ pedidoId, requestedCuentaId, montoPagoColones, connection }) {
  const cuentas = await listCuentasByPedidoId(pedidoId);
  if (!cuentas.length) {
    return { cuenta: null };
  }

  const cuentasAbiertas = cuentas.filter((cuenta) => cuenta.estado !== "PAGADA" && cuenta.estado !== "CANCELADA");

  if (!cuentasAbiertas.length) {
    return { error: { status: 409, message: "Todas las cuentas del pedido ya estan cerradas" } };
  }

  if (requestedCuentaId != null) {
    const cuenta = await findCuentaByIdAndPedido(requestedCuentaId, pedidoId, connection);
    if (!cuenta) {
      return { error: { status: 404, message: "Cuenta no encontrada para este pedido" } };
    }

    if (cuenta.estado === "PAGADA") {
      return { error: { status: 409, message: "La cuenta seleccionada ya fue pagada" } };
    }

    if (cuenta.estado === "CANCELADA") {
      return { error: { status: 409, message: "La cuenta seleccionada esta cancelada" } };
    }

    return { cuenta };
  }

  if (cuentasAbiertas.length === 1) {
    return { cuenta: cuentasAbiertas[0] };
  }

  const candidates = [];
  for (const cuenta of cuentasAbiertas) {
    const totalPagado = roundMoney(await sumPagosByCuentaPedidoId(cuenta.id, connection));
    const saldoPendiente = roundMoney(roundMoney(Number(cuenta.total)) - totalPagado);

    if (Math.abs(saldoPendiente - roundMoney(montoPagoColones)) <= SETTLEMENT_TOLERANCE) {
      candidates.push(cuenta);
    }
  }

  if (candidates.length === 1) {
    return { cuenta: candidates[0] };
  }

  if (candidates.length > 1) {
    return {
      error: {
        status: 409,
        message: "El pago coincide con multiples cuentas. Debes indicar cuentaPedidoId",
      },
    };
  }

  return {
    error: {
      status: 409,
      message: "Debes indicar cuentaPedidoId para evitar cobrar la cuenta equivocada",
    },
  };
}

async function recalculateCuentaTotals(cuentaId, pedido, servicePercentage, connection) {
  const subtotal = roundMoney(await sumDetalleSubtotalByCuenta(cuentaId, connection));
  const aplicarServicio = pedido.tipo === "MESA" && Number(pedido.impuesto) > 0;
  const impuesto = computeServiceAmount(subtotal, aplicarServicio, servicePercentage);
  const descuento = 0;
  const total = roundMoney(subtotal + impuesto - descuento);

  await updateCuentaPedido(
    cuentaId,
    {
      subtotal,
      impuesto,
      descuento,
      total,
      estado: "ABIERTA",
    },
    connection,
  );
}

function parseAccountSplitItems(body) {
  const payload = body || {};
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.detalles)
      ? payload.detalles
      : Array.isArray(payload.productos)
        ? payload.productos
        : Array.isArray(payload.products)
          ? payload.products
      : Array.isArray(payload.detailIds)
        ? payload.detailIds.map((detailId) => ({ detailId }))
        : Array.isArray(payload.detalleIds)
          ? payload.detalleIds.map((detailId) => ({ detailId }))
          : [];

  return rawItems.map((item) => {
    const source = typeof item === "object" && item !== null ? item : { detailId: item };
    const detailRaw = source.detailId ?? source.detalleId ?? source.id;
    const productRaw = source.productoId ?? source.producto_id ?? source.productId ?? source.product_id;
    const qtyRaw = source.cantidad ?? source.quantity ?? source.qty;

    return {
      detailId: detailRaw == null || detailRaw === "" ? null : Number(detailRaw),
      productoId: productRaw == null || productRaw === "" ? null : Number(productRaw),
      cantidad: qtyRaw == null || qtyRaw === "" ? null : Number(qtyRaw),
    };
  });
}

function validateAccountSplitItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      ok: false,
      message: "Debes enviar items con detalle y cantidad opcional",
    };
  }

  for (const item of items) {
    const hasDetailId = Number.isInteger(item.detailId) && item.detailId > 0;
    const hasProductoId = Number.isInteger(item.productoId) && item.productoId > 0;

    if (!hasDetailId && !hasProductoId) {
      return {
        ok: false,
        message: "Cada item debe incluir detailId o productoId valido",
      };
    }

    if (item.cantidad != null && (!Number.isInteger(item.cantidad) || item.cantidad <= 0)) {
      return {
        ok: false,
        message: "La cantidad de cada item debe ser un entero mayor a 0",
      };
    }
  }

  return { ok: true };
}

async function ensureBaseAccountForPedido({ pedidoId, pedido, servicePercentage, connection }) {
  const cuentas = await listCuentasByPedidoId(pedidoId);
  if (cuentas.length > 0) {
    return cuentas[0];
  }

  const details = await listDetalleByPedidoId(pedidoId, connection);
  if (!details.length) {
    return null;
  }

  const baseAccountId = await createCuentaPedido(
    {
      pedidoId,
      numeroCuenta: 1,
      subtotal: 0,
      impuesto: 0,
      descuento: 0,
      total: 0,
      estado: "ABIERTA",
    },
    connection,
  );

  for (const detail of details) {
    if (detail.cuentaPedidoId == null) {
      await updateDetallePedido(
        detail.id,
        {
          cuentaPedidoId: baseAccountId,
          productoId: detail.productoId,
          cantidad: detail.cantidad,
          precioUnitario: detail.precioUnitario,
          subtotal: detail.subtotal,
          observacion: detail.observacion,
        },
        connection,
      );
    }
  }

  await recalculateCuentaTotals(baseAccountId, pedido, servicePercentage, connection);

  return findCuentaByIdAndPedido(baseAccountId, pedidoId, connection);
}

async function resolveSplitItemsToDetails({ pedidoId, targetCuentaId, items, connection }) {
  const details = await listDetalleByPedidoId(pedidoId, connection);
  const detailById = new Map(details.map((detail) => [detail.id, detail]));

  const groupedByProduct = new Map();
  for (const detail of details) {
    const list = groupedByProduct.get(detail.productoId) || [];
    list.push(detail);
    groupedByProduct.set(detail.productoId, list);
  }

  const movements = [];

  for (const item of items) {
    if (Number.isInteger(item.detailId) && item.detailId > 0) {
      const detail = detailById.get(item.detailId);
      if (!detail) {
        throw appError(404, `Detalle ${item.detailId} no encontrado en el pedido`);
      }

      movements.push({ detailId: detail.id, cantidad: item.cantidad });
      continue;
    }

    const productId = item.productoId;
    const requestedQty = item.cantidad == null ? null : Number(item.cantidad);
    const candidates = (groupedByProduct.get(productId) || [])
      .filter((detail) => detail.cuentaPedidoId !== targetCuentaId)
      .sort((a, b) => a.id - b.id);

    if (!candidates.length) {
      throw appError(404, `No hay detalles disponibles del producto ${productId} para mover`);
    }

    let qtyToAllocate = requestedQty;
    if (qtyToAllocate == null) {
      for (const candidate of candidates) {
        movements.push({ detailId: candidate.id, cantidad: Number(candidate.cantidad) });
      }
      continue;
    }

    for (const candidate of candidates) {
      if (qtyToAllocate <= 0) break;

      const availableQty = Number(candidate.cantidad);
      const moveQty = Math.min(availableQty, qtyToAllocate);
      movements.push({ detailId: candidate.id, cantidad: moveQty });
      qtyToAllocate -= moveQty;
    }

    if (qtyToAllocate > 0) {
      throw appError(409, `Cantidad insuficiente del producto ${productId} para mover ${requestedQty}`);
    }
  }

  return movements;
}

async function assignDetailQuantityToCuenta({ pedidoId, cuentaId, detailId, cantidad, connection }) {
  const detail = await findDetalleByIdAndPedido(detailId, pedidoId, connection);
  if (!detail) {
    throw appError(404, `Detalle ${detailId} no encontrado en el pedido`);
  }

  const currentQty = Number(detail.cantidad);
  const moveQty = cantidad == null ? currentQty : Number(cantidad);

  if (!Number.isInteger(moveQty) || moveQty <= 0) {
    throw appError(400, `Cantidad invalida para detalle ${detailId}`);
  }

  if (moveQty > currentQty) {
    throw appError(409, `La cantidad a mover excede la cantidad disponible del detalle ${detailId}`);
  }

  const fromCuentaId = detail.cuentaPedidoId;

  if (moveQty === currentQty) {
    await updateDetallePedido(
      detailId,
      {
        cuentaPedidoId: cuentaId,
        productoId: detail.productoId,
        cantidad: currentQty,
        precioUnitario: detail.precioUnitario,
        subtotal: roundMoney(Number(detail.precioUnitario) * currentQty),
        observacion: detail.observacion,
      },
      connection,
    );

    return { fromCuentaId, toCuentaId: cuentaId, movedQty: moveQty };
  }

  const remainingQty = currentQty - moveQty;
  const unitPrice = Number(detail.precioUnitario);
  const movedSubtotal = roundMoney(unitPrice * moveQty);
  const remainingSubtotal = roundMoney(unitPrice * remainingQty);

  await updateDetallePedido(
    detailId,
    {
      cuentaPedidoId: fromCuentaId,
      productoId: detail.productoId,
      cantidad: remainingQty,
      precioUnitario: unitPrice,
      subtotal: remainingSubtotal,
      observacion: detail.observacion,
    },
    connection,
  );

  await createDetallePedido(
    {
      pedidoId,
      cuentaPedidoId: cuentaId,
      productoId: detail.productoId,
      cantidad: moveQty,
      precioUnitario: unitPrice,
      subtotal: movedSubtotal,
      observacion: detail.observacion,
    },
    connection,
  );

  return { fromCuentaId, toCuentaId: cuentaId, movedQty: moveQty };
}

async function hydratePedido(pedidoId) {
  const pedido = await findPedidoById(pedidoId);
  if (!pedido) return null;

  const [detalles, pagos, cuentas] = await Promise.all([
    listDetalleByPedidoId(pedidoId),
    listPagosByPedidoId(pedidoId),
    listCuentasByPedidoId(pedidoId),
  ]);
  const totalPagado = roundMoney(pagos.reduce((acc, item) => acc + Number(item.monto), 0));
  const totalCobrar = cuentas.length
    ? roundMoney(cuentas.reduce((acc, cuenta) => acc + Number(cuenta.total || 0), 0))
    : roundMoney(Number(pedido.total));

  return {
    ...pedido,
    detalles,
    pagos,
    cuentas,
    totalCobrar,
    totalPagado,
    saldoPendiente: roundMoney(totalCobrar - totalPagado),
  };
}

async function resolvePedidoPayableTotal(pedidoId, pedidoTotal) {
  const cuentas = await listCuentasByPedidoId(pedidoId);
  if (!cuentas.length) {
    return roundMoney(Number(pedidoTotal));
  }

  const totalCuentas = roundMoney(cuentas.reduce((acc, cuenta) => acc + Number(cuenta.total || 0), 0));
  return totalCuentas > 0 ? totalCuentas : roundMoney(Number(pedidoTotal));
}

async function ensurePedidoExists(pedidoId, res) {
  const pedido = await findPedidoById(pedidoId);
  if (!pedido) {
    res.status(404).json({ message: "Pedido no encontrado" });
    return null;
  }

  return pedido;
}

async function listPedidosHandler(req, res) {
  const estado = req.query.estado ? normalizeUpper(req.query.estado) : undefined;
  const tipo = req.query.tipo ? normalizeUpper(req.query.tipo) : undefined;
  const mesaId = req.query.mesaId ? Number(req.query.mesaId) : undefined;
  const clienteIdRaw = req.query.clienteId ?? req.query.cliente_id;
  const clienteId = clienteIdRaw == null || clienteIdRaw === "" ? undefined : Number(clienteIdRaw);
  const usuarioId = req.query.usuarioId ? Number(req.query.usuarioId) : undefined;
  let fechaDesde = req.query.fechaDesde ?? req.query.fecha_desde;
  let fechaHasta = req.query.fechaHasta ?? req.query.fecha_hasta;

  if (req.query.fecha) {
    const range = buildDateRangeFromDay(req.query.fecha);
    if (!range) {
      res.status(400).json({ message: "fecha invalida. Formato esperado: YYYY-MM-DD" });
      return;
    }

    fechaDesde = range.fechaDesde;
    fechaHasta = range.fechaHasta;
  }

  if (estado && !PEDIDO_ESTADOS.has(estado)) {
    res.status(400).json({ message: "estado invalido" });
    return;
  }

  if (tipo && !PEDIDO_TIPOS.has(tipo)) {
    res.status(400).json({ message: "tipo invalido" });
    return;
  }

  if (req.query.mesaId && (!Number.isInteger(mesaId) || mesaId <= 0)) {
    res.status(400).json({ message: "mesaId invalido" });
    return;
  }

  if (req.query.usuarioId && (!Number.isInteger(usuarioId) || usuarioId <= 0)) {
    res.status(400).json({ message: "usuarioId invalido" });
    return;
  }

  if (clienteIdRaw != null && clienteIdRaw !== "" && (!Number.isInteger(clienteId) || clienteId <= 0)) {
    res.status(400).json({ message: "clienteId invalido" });
    return;
  }

  if (fechaDesde && !parseDateTime(fechaDesde)) {
    res.status(400).json({ message: "fechaDesde invalida" });
    return;
  }

  if (fechaHasta && !parseDateTime(fechaHasta)) {
    res.status(400).json({ message: "fechaHasta invalida" });
    return;
  }

  const pedidos = await listPedidos({
    estado,
    tipo,
    mesaId,
    clienteId,
    usuarioId,
    fechaDesde,
    fechaHasta,
  });

  const summary = pedidos.reduce(
    (acc, pedido) => {
      acc.totalPedidos += 1;
      acc.totalCobrar = roundMoney(acc.totalCobrar + Number(pedido.totalCobrar || 0));
      acc.totalPagado = roundMoney(acc.totalPagado + Number(pedido.totalPagado || 0));
      acc.saldoPendiente = roundMoney(acc.saldoPendiente + Number(pedido.saldoPendiente || 0));
      acc.totalCuentas += Number(pedido.cuentasCount || 0);
      return acc;
    },
    {
      totalPedidos: 0,
      totalCobrar: 0,
      totalPagado: 0,
      saldoPendiente: 0,
      totalCuentas: 0,
    },
  );

  res.json({
    filters: {
      estado: estado || null,
      tipo: tipo || null,
      mesaId: mesaId || null,
      clienteId: clienteId || null,
      usuarioId: usuarioId || null,
      fecha: req.query.fecha || null,
      fechaDesde: fechaDesde || null,
      fechaHasta: fechaHasta || null,
    },
    summary,
    pedidos,
  });
}

async function getPedidoByIdHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const pedido = await hydratePedido(pedidoId);
  if (!pedido) {
    res.status(404).json({ message: "Pedido no encontrado" });
    return;
  }

  res.json({ pedido });
}

async function createPedidoHandler(req, res) {
  const input = parsePedidoCreateInput(req.body || {}, req.authUser);
  const validation = validatePedidoInput(input);
  const servicePercentage = await getServicePercentage();

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  if (input.tipo === "LLEVAR") {
    input.mesaId = null;
  }

  if (input.tipo === "MESA" && input.clienteId == null) {
    input.clienteId = null;
  }

  if (input.tipo === "MESA") {
    const mesa = await findMesaById(input.mesaId);
    if (!mesa || !mesa.activa) {
      res.status(400).json({ message: "mesaId invalido o mesa inactiva" });
      return;
    }

    const referenceDateTime = toMySqlDateTime(input.fechaApertura || new Date());
    const activeReserva = await findActiveReservaByMesaAt({
      mesaId: input.mesaId,
      referenceDateTime,
    });

    if (activeReserva) {
      res.status(409).json({
        message: "La mesa esta reservada para el horario solicitado",
        mesaId: input.mesaId,
        reserva: activeReserva,
      });
      return;
    }
  }

  const user = await findUserById(input.usuarioId);
  if (!user || !user.activo) {
    res.status(400).json({ message: "usuarioId invalido o usuario inactivo" });
    return;
  }

  if (input.clienteId != null) {
    const cliente = await findActiveClienteById(input.clienteId);
    if (!cliente) {
      res.status(400).json({ message: "clienteId invalido o cliente inactivo" });
      return;
    }
  }

  const normalizedDetalles = [];
  for (const rawDetalle of input.detalles) {
    const parsedDetalle = parseDetalleInput(rawDetalle || {});
    const detailValidation = validateDetalleInput(parsedDetalle);

    if (!detailValidation.ok) {
      res.status(detailValidation.status).json({
        ...detailValidation.payload,
        message: "Uno de los detalles es invalido",
      });
      return;
    }

    parsedDetalle.cuentaPedidoId = null;
    normalizedDetalles.push(parsedDetalle);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const fechaApertura = input.fechaApertura || new Date();
    const generatedCode = await getNextPedidoCodeForDate(fechaApertura, connection);
    const applyService = resolveApplyService(input, true);

    const pedidoId = await createPedido(
      {
        codigo: generatedCode,
        mesaId: input.mesaId,
        clienteId: input.clienteId,
        usuarioId: input.usuarioId,
        tipo: input.tipo,
        estado: input.estado,
        subtotal: 0,
        impuesto: 0,
        total: 0,
        fechaApertura,
        fechaCierre: input.estado === "CERRADO" ? input.fechaCierre || new Date() : input.fechaCierre,
      },
      connection,
    );

    for (const detalle of normalizedDetalles) {
      const product = await findProductById(detalle.productoId);
      if (!product || !product.disponible) {
        throw appError(400, "productoId invalido o producto no disponible");
      }

      const price = detalle.precioUnitario == null ? Number(product.precio) : Number(detalle.precioUnitario);
      const subtotal = roundMoney(price * detalle.cantidad);

      await createDetallePedido(
        {
          pedidoId,
          cuentaPedidoId: detalle.cuentaPedidoId,
          productoId: detalle.productoId,
          cantidad: detalle.cantidad,
          precioUnitario: price,
          subtotal,
          observacion: detalle.observacion,
        },
        connection,
      );
    }

    const subtotal = roundMoney(await sumDetalleSubtotalByPedido(pedidoId, connection));
    const totals = computePedidoTotals(subtotal, applyService, servicePercentage);

    await updatePedidoTotals(
      pedidoId,
      {
        subtotal: totals.subtotal,
        impuesto: totals.impuesto,
        total: totals.total,
      },
      connection,
    );

    await connection.commit();

    const pedido = await hydratePedido(pedidoId);

    res.status(201).json({
      message: "Pedido creado exitosamente",
      pedido,
    });
  } catch (error) {
    await connection.rollback();

    if (error && error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function updatePedidoHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const existingPedido = await findPedidoById(pedidoId);
  if (!existingPedido) {
    res.status(404).json({ message: "Pedido no encontrado" });
    return;
  }

  const input = parsePedidoUpdateInput(req.body || {}, existingPedido);
  const validation = validatePedidoInput(input);
  const servicePercentage = await getServicePercentage();

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  if (input.tipo === "LLEVAR") {
    input.mesaId = null;
  }

  if (input.tipo === "MESA" && input.clienteId == null) {
    input.clienteId = null;
  }

  if (input.tipo === "MESA") {
    const mesa = await findMesaById(input.mesaId);
    if (!mesa || !mesa.activa) {
      res.status(400).json({ message: "mesaId invalido o mesa inactiva" });
      return;
    }

    const isAssigningMesa = existingPedido.tipo !== "MESA" || existingPedido.mesaId !== input.mesaId;

    if (isAssigningMesa) {
      const referenceDateTime = toMySqlDateTime(input.fechaApertura || existingPedido.fechaApertura || new Date());
      const activeReserva = await findActiveReservaByMesaAt({
        mesaId: input.mesaId,
        referenceDateTime,
      });

      if (activeReserva) {
        res.status(409).json({
          message: "La mesa esta reservada para el horario solicitado",
          mesaId: input.mesaId,
          reserva: activeReserva,
        });
        return;
      }
    }
  }

  const user = await findUserById(input.usuarioId);
  if (!user || !user.activo) {
    res.status(400).json({ message: "usuarioId invalido o usuario inactivo" });
    return;
  }

  if (input.clienteId != null) {
    const cliente = await findActiveClienteById(input.clienteId);
    if (!cliente) {
      res.status(400).json({ message: "clienteId invalido o cliente inactivo" });
      return;
    }
  }

  const subtotal = roundMoney(await sumDetalleSubtotalByPedido(pedidoId));
  const applyService = resolveApplyService(input, existingPedido.tipo === "MESA" && Number(existingPedido.impuesto) > 0);
  const totals = computePedidoTotals(subtotal, applyService, servicePercentage);

  if (input.estado === "CERRADO") {
    const totalPagado = roundMoney(await sumPagosByPedidoId(pedidoId));
    if (!isSettled(totals.total, totalPagado)) {
      res.status(409).json({
        message: "No se puede cerrar el pedido porque aun tiene saldo pendiente",
        total: totals.total,
        totalPagado,
        saldoPendiente: normalizeSaldo(totals.total - totalPagado),
      });
      return;
    }

    if (!input.fechaCierre) {
      input.fechaCierre = new Date();
    }
  }

  await updatePedido(pedidoId, {
    codigo: input.codigo,
    mesaId: input.mesaId,
    clienteId: input.clienteId,
    usuarioId: input.usuarioId,
    tipo: input.tipo,
    estado: input.estado,
    subtotal: totals.subtotal,
    impuesto: totals.impuesto,
    total: totals.total,
    fechaApertura: input.fechaApertura,
    fechaCierre: input.fechaCierre,
  });

  const cuentas = await listCuentasByPedidoId(pedidoId);
  const pedidoForAccounts = {
    ...existingPedido,
    tipo: input.tipo,
    impuesto: totals.impuesto,
  };

  for (const cuenta of cuentas) {
    await recalculateCuentaTotals(cuenta.id, pedidoForAccounts, servicePercentage);
  }

  const updatedPedido = await hydratePedido(pedidoId);

  res.json({
    message: "Pedido actualizado exitosamente",
    pedido: updatedPedido,
  });
}

async function deletePedidoHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const existingPedido = await findPedidoById(pedidoId);
  if (!existingPedido) {
    res.status(404).json({ message: "Pedido no encontrado" });
    return;
  }

  if (!["BORRADOR", "CANCELADO"].includes(existingPedido.estado)) {
    res.status(409).json({ message: "Solo se puede eliminar un pedido en BORRADOR o CANCELADO" });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await deletePedidoCascade(pedidoId, connection);
    await connection.commit();

    res.json({
      message: "Pedido eliminado exitosamente",
      pedidoId,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listPedidoDetailsHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  const detalles = await listDetalleByPedidoId(pedidoId);
  res.json({ pedidoId, detalles });
}

async function createPedidoDetailHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  if (["CERRADO", "CANCELADO"].includes(pedido.estado)) {
    res.status(409).json({ message: "No se pueden agregar detalles a un pedido cerrado o cancelado" });
    return;
  }

  const detalleInput = parseDetalleInput(req.body || {});
  const validation = validateDetalleInput(detalleInput);
  const servicePercentage = await getServicePercentage();

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const product = await findProductById(detalleInput.productoId);
  if (!product || !product.disponible) {
    res.status(400).json({ message: "productoId invalido o producto no disponible" });
    return;
  }

  const price = detalleInput.precioUnitario == null ? Number(product.precio) : Number(detalleInput.precioUnitario);
  const subtotalDetalle = roundMoney(price * detalleInput.cantidad);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (detalleInput.cuentaPedidoId != null) {
      const cuenta = await findCuentaByIdAndPedido(detalleInput.cuentaPedidoId, pedidoId, connection);
      if (!cuenta || cuenta.estado !== "ABIERTA") {
        throw appError(400, "cuentaPedidoId invalida o no disponible");
      }
    }

    const detailId = await createDetallePedido(
      {
        pedidoId,
        cuentaPedidoId: detalleInput.cuentaPedidoId,
        productoId: detalleInput.productoId,
        cantidad: detalleInput.cantidad,
        precioUnitario: price,
        subtotal: subtotalDetalle,
        observacion: detalleInput.observacion,
      },
      connection,
    );

    const subtotal = roundMoney(await sumDetalleSubtotalByPedido(pedidoId, connection));
    const totals = computePedidoTotals(subtotal, pedido.tipo === "MESA" && Number(pedido.impuesto) > 0, servicePercentage);

    await updatePedidoTotals(
      pedidoId,
      {
        subtotal: totals.subtotal,
        impuesto: totals.impuesto,
        total: totals.total,
      },
      connection,
    );

    if (detalleInput.cuentaPedidoId != null) {
      await recalculateCuentaTotals(detalleInput.cuentaPedidoId, pedido, servicePercentage, connection);
    }

    await connection.commit();

    const detail = await findDetalleByIdAndPedido(detailId, pedidoId, connection);
    const updatedPedido = await hydratePedido(pedidoId);

    res.status(201).json({
      message: "Detalle agregado exitosamente",
      detail,
      pedido: updatedPedido,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updatePedidoDetailHandler(req, res) {
  const pedidoId = Number(req.params.id);
  const detailId = Number(req.params.detailId);

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  if (!Number.isInteger(detailId) || detailId <= 0) {
    res.status(400).json({ message: "id de detalle invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  if (["CERRADO", "CANCELADO"].includes(pedido.estado)) {
    res.status(409).json({ message: "No se pueden editar detalles de un pedido cerrado o cancelado" });
    return;
  }

  const existingDetail = await findDetalleByIdAndPedido(detailId, pedidoId);
  if (!existingDetail) {
    res.status(404).json({ message: "Detalle no encontrado" });
    return;
  }

  const detalleInput = parseDetalleInput(req.body || {}, existingDetail);
  const validation = validateDetalleInput(detalleInput);
  const servicePercentage = await getServicePercentage();

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const product = await findProductById(detalleInput.productoId);
  if (!product || !product.disponible) {
    res.status(400).json({ message: "productoId invalido o producto no disponible" });
    return;
  }

  const price = detalleInput.precioUnitario == null ? Number(product.precio) : Number(detalleInput.precioUnitario);
  const subtotalDetalle = roundMoney(price * detalleInput.cantidad);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (detalleInput.cuentaPedidoId != null) {
      const cuenta = await findCuentaByIdAndPedido(detalleInput.cuentaPedidoId, pedidoId, connection);
      if (!cuenta || cuenta.estado !== "ABIERTA") {
        throw appError(400, "cuentaPedidoId invalida o no disponible");
      }
    }

    await updateDetallePedido(
      detailId,
      {
        cuentaPedidoId: detalleInput.cuentaPedidoId,
        productoId: detalleInput.productoId,
        cantidad: detalleInput.cantidad,
        precioUnitario: price,
        subtotal: subtotalDetalle,
        observacion: detalleInput.observacion,
      },
      connection,
    );

    const subtotal = roundMoney(await sumDetalleSubtotalByPedido(pedidoId, connection));
    const totals = computePedidoTotals(subtotal, pedido.tipo === "MESA" && Number(pedido.impuesto) > 0, servicePercentage);

    await updatePedidoTotals(
      pedidoId,
      {
        subtotal: totals.subtotal,
        impuesto: totals.impuesto,
        total: totals.total,
      },
      connection,
    );

    if (existingDetail.cuentaPedidoId != null) {
      await recalculateCuentaTotals(existingDetail.cuentaPedidoId, pedido, servicePercentage, connection);
    }

    if (detalleInput.cuentaPedidoId != null && detalleInput.cuentaPedidoId !== existingDetail.cuentaPedidoId) {
      await recalculateCuentaTotals(detalleInput.cuentaPedidoId, pedido, servicePercentage, connection);
    }

    await connection.commit();

    const detail = await findDetalleByIdAndPedido(detailId, pedidoId);
    const updatedPedido = await hydratePedido(pedidoId);

    res.json({
      message: "Detalle actualizado exitosamente",
      detail,
      pedido: updatedPedido,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deletePedidoDetailHandler(req, res) {
  const pedidoId = Number(req.params.id);
  const detailId = Number(req.params.detailId);

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  if (!Number.isInteger(detailId) || detailId <= 0) {
    res.status(400).json({ message: "id de detalle invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  if (["CERRADO", "CANCELADO"].includes(pedido.estado)) {
    res.status(409).json({ message: "No se pueden eliminar detalles de un pedido cerrado o cancelado" });
    return;
  }

  const existingDetail = await findDetalleByIdAndPedido(detailId, pedidoId);
  if (!existingDetail) {
    res.status(404).json({ message: "Detalle no encontrado" });
    return;
  }

  const servicePercentage = await getServicePercentage();

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await deleteDetallePedido(detailId, connection);

    const subtotal = roundMoney(await sumDetalleSubtotalByPedido(pedidoId, connection));
    const totals = computePedidoTotals(subtotal, pedido.tipo === "MESA" && Number(pedido.impuesto) > 0, servicePercentage);

    await updatePedidoTotals(
      pedidoId,
      {
        subtotal: totals.subtotal,
        impuesto: totals.impuesto,
        total: totals.total,
      },
      connection,
    );

    if (existingDetail.cuentaPedidoId != null) {
      await recalculateCuentaTotals(existingDetail.cuentaPedidoId, pedido, servicePercentage, connection);
    }

    await connection.commit();

    const updatedPedido = await hydratePedido(pedidoId);

    res.json({
      message: "Detalle eliminado exitosamente",
      pedido: updatedPedido,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listPedidoAccountsHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  const cuentas = await listCuentasByPedidoId(pedidoId);
  const cuentasConDetalles = await Promise.all(
    cuentas.map(async (cuenta) => ({
      ...cuenta,
      detalles: await listDetalleByCuentaPedidoId(cuenta.id),
    })),
  );

  const allDetails = await listDetalleByPedidoId(pedidoId);
  const unassignedDetails = allDetails.filter((detail) => detail.cuentaPedidoId == null);
  const unassignedSubtotal = roundMoney(unassignedDetails.reduce((acc, detail) => acc + Number(detail.subtotal || 0), 0));

  res.json({
    pedidoId,
    cuentas: cuentasConDetalles,
    unassigned: {
      detalles: unassignedDetails,
      subtotal: unassignedSubtotal,
    },
  });
}

async function createPedidoAccountHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  if (["CERRADO", "CANCELADO"].includes(pedido.estado)) {
    res.status(409).json({ message: "No se pueden crear cuentas en un pedido cerrado o cancelado" });
    return;
  }

  const splitItems = parseAccountSplitItems(req.body);
  const numeroCuentaRaw = req.body?.numeroCuenta ?? req.body?.numero_cuenta;
  const numeroCuenta = numeroCuentaRaw == null || numeroCuentaRaw === "" ? null : Number(numeroCuentaRaw);

  if (numeroCuenta != null && (!Number.isInteger(numeroCuenta) || numeroCuenta <= 0)) {
    res.status(400).json({ message: "numeroCuenta invalido" });
    return;
  }

  if (splitItems.length > 0) {
    const splitValidation = validateAccountSplitItems(splitItems);
    if (!splitValidation.ok) {
      res.status(400).json({ message: splitValidation.message });
      return;
    }
  }

  const servicePercentage = await getServicePercentage();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const baseAccount = await ensureBaseAccountForPedido({
      pedidoId,
      pedido,
      servicePercentage,
      connection,
    });

    const totalCuentas = await countCuentasByPedidoId(pedidoId, connection);
    const numeroFinal = numeroCuenta || Math.max(2, totalCuentas + 1);

    const cuentaId = await createCuentaPedido(
      {
        pedidoId,
        numeroCuenta: numeroFinal,
        subtotal: 0,
        impuesto: 0,
        descuento: 0,
        total: 0,
        estado: "ABIERTA",
      },
      connection,
    );

    const affectedAccounts = new Set([cuentaId]);
    if (baseAccount?.id) {
      affectedAccounts.add(baseAccount.id);
    }

    if (splitItems.length > 0) {
      const movements = await resolveSplitItemsToDetails({
        pedidoId,
        targetCuentaId: cuentaId,
        items: splitItems,
        connection,
      });

      for (const item of movements) {
        const movement = await assignDetailQuantityToCuenta({
          pedidoId,
          cuentaId,
          detailId: item.detailId,
          cantidad: item.cantidad,
          connection,
        });

        if (movement.fromCuentaId != null) {
          affectedAccounts.add(movement.fromCuentaId);
        }
      }
    }

    for (const affectedCuentaId of affectedAccounts) {
      await recalculateCuentaTotals(affectedCuentaId, pedido, servicePercentage, connection);
    }

    await connection.commit();

    const cuenta = await findCuentaByIdAndPedido(cuentaId, pedidoId);
    const detalles = await listDetalleByCuentaPedidoId(cuentaId);

    res.status(201).json({
      message: "Cuenta dividida creada exitosamente",
      cuenta: {
        ...cuenta,
        detalles,
      },
    });
  } catch (error) {
    await connection.rollback();

    if (error && error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function assignPedidoAccountDetailsHandler(req, res) {
  const pedidoId = Number(req.params.id);
  const cuentaId = Number(req.params.accountId);

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
    res.status(400).json({ message: "id de cuenta invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  const splitItems = parseAccountSplitItems(req.body);
  const splitValidation = validateAccountSplitItems(splitItems);
  if (!splitValidation.ok) {
    res.status(400).json({ message: splitValidation.message });
    return;
  }

  const servicePercentage = await getServicePercentage();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await ensureBaseAccountForPedido({
      pedidoId,
      pedido,
      servicePercentage,
      connection,
    });

    const cuenta = await findCuentaByIdAndPedido(cuentaId, pedidoId, connection);
    if (!cuenta || cuenta.estado !== "ABIERTA") {
      throw appError(404, "Cuenta no encontrada o no disponible");
    }

    const affectedAccounts = new Set([cuentaId]);

    const movements = await resolveSplitItemsToDetails({
      pedidoId,
      targetCuentaId: cuentaId,
      items: splitItems,
      connection,
    });

    for (const item of movements) {
      const movement = await assignDetailQuantityToCuenta({
        pedidoId,
        cuentaId,
        detailId: item.detailId,
        cantidad: item.cantidad,
        connection,
      });

      if (movement.fromCuentaId != null) {
        affectedAccounts.add(movement.fromCuentaId);
      }
    }

    for (const affectedCuentaId of affectedAccounts) {
      await recalculateCuentaTotals(affectedCuentaId, pedido, servicePercentage, connection);
    }

    await connection.commit();

    const updatedCuenta = await findCuentaByIdAndPedido(cuentaId, pedidoId);
    const detalles = await listDetalleByCuentaPedidoId(cuentaId);

    res.json({
      message: "Productos asignados a la cuenta exitosamente",
      cuenta: {
        ...updatedCuenta,
        detalles,
      },
    });
  } catch (error) {
    await connection.rollback();

    if (error && error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function removePedidoAccountDetailHandler(req, res) {
  const pedidoId = Number(req.params.id);
  const cuentaId = Number(req.params.accountId);
  const detailId = Number(req.params.detailId);

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
    res.status(400).json({ message: "id de cuenta invalido" });
    return;
  }

  if (!Number.isInteger(detailId) || detailId <= 0) {
    res.status(400).json({ message: "id de detalle invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  const body = req.body || {};
  const cantidadRaw = body.cantidad ?? body.quantity ?? body.qty;
  const cantidad = cantidadRaw == null || cantidadRaw === "" ? null : Number(cantidadRaw);

  if (cantidad != null && (!Number.isInteger(cantidad) || cantidad <= 0)) {
    res.status(400).json({ message: "cantidad invalida" });
    return;
  }

  const servicePercentage = await getServicePercentage();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const cuenta = await findCuentaByIdAndPedido(cuentaId, pedidoId, connection);
    if (!cuenta || cuenta.estado !== "ABIERTA") {
      throw appError(404, "Cuenta no encontrada o no disponible");
    }

    const detail = await findDetalleByIdAndPedido(detailId, pedidoId, connection);
    if (!detail) {
      throw appError(404, "Detalle no encontrado");
    }

    if (detail.cuentaPedidoId !== cuentaId) {
      throw appError(409, "El detalle no pertenece a esta cuenta");
    }

    const movement = await assignDetailQuantityToCuenta({
      pedidoId,
      cuentaId: null,
      detailId,
      cantidad,
      connection,
    });

    const affectedAccounts = new Set([cuentaId]);
    if (movement.toCuentaId != null) {
      affectedAccounts.add(movement.toCuentaId);
    }

    for (const affectedCuentaId of affectedAccounts) {
      await recalculateCuentaTotals(affectedCuentaId, pedido, servicePercentage, connection);
    }

    await connection.commit();

    const updatedCuenta = await findCuentaByIdAndPedido(cuentaId, pedidoId);
    const detalles = await listDetalleByCuentaPedidoId(cuentaId);

    res.json({
      message:
        movement.movedQty === Number(detail.cantidad)
          ? "Producto removido de la cuenta exitosamente"
          : "Cantidad removida de la cuenta exitosamente",
      cuenta: {
        ...updatedCuenta,
        detalles,
      },
      moved: {
        detailId,
        cantidad: movement.movedQty,
      },
    });
  } catch (error) {
    await connection.rollback();

    if (error && error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function movePedidoAccountDetailHandler(req, res) {
  const pedidoId = Number(req.params.id);
  const cuentaId = Number(req.params.accountId);
  const detailId = Number(req.params.detailId);

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
    res.status(400).json({ message: "id de cuenta origen invalido" });
    return;
  }

  if (!Number.isInteger(detailId) || detailId <= 0) {
    res.status(400).json({ message: "id de detalle invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  const body = req.body || {};
  const cantidadRaw = body.cantidad ?? body.quantity ?? body.qty;
  const cantidad = cantidadRaw == null || cantidadRaw === "" ? null : Number(cantidadRaw);

  if (cantidad != null && (!Number.isInteger(cantidad) || cantidad <= 0)) {
    res.status(400).json({ message: "cantidad invalida" });
    return;
  }

  const cuentaDestinoRaw =
    body.cuentaDestinoId ?? body.cuenta_destino_id ?? body.targetAccountId ?? body.target_account_id;
  const cuentaDestinoId =
    cuentaDestinoRaw == null || cuentaDestinoRaw === "" ? null : Number(cuentaDestinoRaw);

  if (cuentaDestinoId != null && (!Number.isInteger(cuentaDestinoId) || cuentaDestinoId <= 0)) {
    res.status(400).json({ message: "cuentaDestinoId invalida" });
    return;
  }

  if (cuentaDestinoId != null && cuentaDestinoId === cuentaId) {
    res.status(409).json({ message: "La cuenta destino debe ser distinta de la cuenta origen" });
    return;
  }

  const servicePercentage = await getServicePercentage();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const cuentaOrigen = await findCuentaByIdAndPedido(cuentaId, pedidoId, connection);
    if (!cuentaOrigen || cuentaOrigen.estado !== "ABIERTA") {
      throw appError(404, "Cuenta origen no encontrada o no disponible");
    }

    const detail = await findDetalleByIdAndPedido(detailId, pedidoId);
    if (!detail) {
      throw appError(404, "Detalle no encontrado");
    }

    if (detail.cuentaPedidoId !== cuentaId) {
      throw appError(409, "El detalle no pertenece a la cuenta origen");
    }

    if (cuentaDestinoId != null) {
      const cuentaDestino = await findCuentaByIdAndPedido(cuentaDestinoId, pedidoId, connection);
      if (!cuentaDestino || cuentaDestino.estado !== "ABIERTA") {
        throw appError(404, "Cuenta destino no encontrada o no disponible");
      }
    }

    const movement = await assignDetailQuantityToCuenta({
      pedidoId,
      cuentaId: cuentaDestinoId,
      detailId,
      cantidad,
      connection,
    });

    const affectedAccounts = new Set([cuentaId]);
    if (cuentaDestinoId != null) {
      affectedAccounts.add(cuentaDestinoId);
    }

    for (const affectedCuentaId of affectedAccounts) {
      await recalculateCuentaTotals(affectedCuentaId, pedido, servicePercentage, connection);
    }

    await connection.commit();

    const sourceAccount = await findCuentaByIdAndPedido(cuentaId, pedidoId);
    const destinationAccount = cuentaDestinoId == null ? null : await findCuentaByIdAndPedido(cuentaDestinoId, pedidoId);

    res.json({
      message:
        cuentaDestinoId == null
          ? "Cantidad movida a no asignado exitosamente"
          : "Cantidad movida a la cuenta destino exitosamente",
      moved: {
        detailId,
        cantidad: movement.movedQty,
        fromAccountId: cuentaId,
        toAccountId: cuentaDestinoId,
      },
      sourceAccount,
      destinationAccount,
    });
  } catch (error) {
    await connection.rollback();

    if (error && error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function listPedidoPaymentsHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  const pagos = await listPagosByPedidoId(pedidoId);
  const totalPagado = roundMoney(pagos.reduce((acc, item) => acc + Number(item.monto), 0));
  const totalPedido = await resolvePedidoPayableTotal(pedidoId, pedido.total);

  res.json({
    pedidoId,
    pagos,
    totalPedido,
    totalPagado,
    saldoPendiente: roundMoney(totalPedido - totalPagado),
  });
}

async function createPedidoPaymentHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  if (["CANCELADO"].includes(pedido.estado)) {
    res.status(409).json({ message: "No se pueden registrar pagos en un pedido cancelado" });
    return;
  }

  const pagoInput = parsePagoInput(req.body || {});
  const validation = validatePagoInput(pagoInput);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const metodoPago = await findMetodoPagoById(pagoInput.metodoPagoId);
  if (!metodoPago) {
    res.status(400).json({ message: "metodoPagoId invalido" });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const servicePercentage = await getServicePercentage();

    const metodoSinRecibido = isNoCashReceivedMethod(metodoPago.nombre);

    let paymentPayload;
    try {
      paymentPayload = await resolvePedidoPayment(pagoInput, { disableReceivedAmount: metodoSinRecibido });
    } catch (error) {
      if (error && error.status) {
        res.status(error.status).json({ message: error.message });
        await connection.rollback();
        return;
      }

      throw error;
    }

    const cuentaResolution = await resolveCuentaForIncomingPayment({
      pedidoId,
      requestedCuentaId: pagoInput.cuentaPedidoId,
      montoPagoColones: paymentPayload.monto,
      connection,
    });

    if (cuentaResolution.error) {
      res.status(cuentaResolution.error.status).json({ message: cuentaResolution.error.message });
      await connection.rollback();
      return;
    }

    let cuentaPago = cuentaResolution.cuenta;

    if (!cuentaPago) {
      cuentaPago = await ensureBaseAccountForPedido({
        pedidoId,
        pedido,
        servicePercentage,
        connection,
      });
    }

    const cuentaPagoId = cuentaPago?.id ?? null;

    if (cuentaPagoId == null) {
      res.status(409).json({
        message: "No se pudo determinar la cuenta a pagar para este pedido",
      });
      await connection.rollback();
      return;
    }

    if (cuentaPago) {
      const totalPagadoCuentaActual = roundMoney(await sumPagosByCuentaPedidoId(cuentaPago.id, connection));
      const nuevoTotalCuenta = roundMoney(totalPagadoCuentaActual + roundMoney(paymentPayload.monto));

      if (nuevoTotalCuenta > roundMoney(Number(cuentaPago.total)) + MONEY_EPSILON) {
        res.status(409).json({
          message: "El pago excede el total de la cuenta",
          cuentaId: cuentaPago.id,
          totalCuenta: roundMoney(Number(cuentaPago.total)),
          totalPagadoCuentaActual,
          montoIntentado: roundMoney(paymentPayload.monto),
        });
        await connection.rollback();
        return;
      }
    }

    const totalPagadoActual = roundMoney(await sumPagosByPedidoId(pedidoId, connection));
    const nuevoTotalPagado = roundMoney(totalPagadoActual + roundMoney(paymentPayload.monto));
    const totalPedidoCobrar = await resolvePedidoPayableTotal(pedidoId, pedido.total);

    if (nuevoTotalPagado > totalPedidoCobrar + MONEY_EPSILON) {
      res.status(409).json({
        message: "El pago excede el total del pedido",
        totalPedido: totalPedidoCobrar,
        totalPagadoActual,
        montoIntentado: roundMoney(paymentPayload.monto),
        saldoPendienteAntes: roundMoney(totalPedidoCobrar - totalPagadoActual),
      });
      await connection.rollback();
      return;
    }

    const pagoId = await createPago(
      {
        pedidoId,
        cuentaPedidoId: cuentaPagoId,
        metodoPagoId: pagoInput.metodoPagoId,
        monedaId: paymentPayload.moneda.id,
        tipoCambioId: paymentPayload.tipoCambio?.id || null,
        monto: paymentPayload.monto,
        montoRecibido: paymentPayload.montoRecibido,
        vuelto: paymentPayload.vuelto,
        tipoCambioUtilizado: paymentPayload.tipoCambioUtilizado,
        montoMoneda: paymentPayload.montoMoneda,
        referencia: pagoInput.referencia,
      },
      connection,
    );

    const cuentasSync = await syncAllCuentasEstadoByPayments(pedidoId, connection);
    const cuentaActualizada = cuentaPagoId != null
      ? cuentasSync.find((cuenta) => cuenta.id === cuentaPagoId) || null
      : null;

    await connection.commit();

    const pago = await findPagoByIdAndPedido(pagoId, pedidoId);
    const updatedPedido = await hydratePedido(pedidoId);

    res.status(201).json({
      message: "Pago registrado exitosamente",
      pago,
      cuenta: cuentaActualizada,
      pedido: updatedPedido,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updatePedidoPaymentHandler(req, res) {
  const pedidoId = Number(req.params.id);
  const paymentId = Number(req.params.paymentId);

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    res.status(400).json({ message: "id de pago invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  if (["CANCELADO"].includes(pedido.estado)) {
    res.status(409).json({ message: "No se pueden editar pagos de un pedido cancelado" });
    return;
  }

  const existingPago = await findPagoByIdAndPedido(paymentId, pedidoId);
  if (!existingPago) {
    res.status(404).json({ message: "Pago no encontrado" });
    return;
  }

  const pagoInput = parsePagoInput(req.body || {}, existingPago);
  const validation = validatePagoInput(pagoInput);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const metodoPago = await findMetodoPagoById(pagoInput.metodoPagoId);
  if (!metodoPago) {
    res.status(400).json({ message: "metodoPagoId invalido" });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const servicePercentage = await getServicePercentage();

    const metodoSinRecibido = isNoCashReceivedMethod(metodoPago.nombre);
    let cuentaPagoId = pagoInput.cuentaPedidoId;
    const cuentaAnteriorId = existingPago.cuentaPedidoId ?? null;

    let cuentaPago = null;

    let paymentPayload;
    try {
      paymentPayload = await resolvePedidoPayment(pagoInput, { disableReceivedAmount: metodoSinRecibido });
    } catch (error) {
      if (error && error.status) {
        res.status(error.status).json({ message: error.message });
        await connection.rollback();
        return;
      }

      throw error;
    }

    if (cuentaPagoId == null && cuentaAnteriorId == null) {
      const cuentaBase = await ensureBaseAccountForPedido({
        pedidoId,
        pedido,
        servicePercentage,
        connection,
      });

      const cuentaResolution = await resolveCuentaForIncomingPayment({
        pedidoId,
        requestedCuentaId: cuentaBase?.id ?? null,
        montoPagoColones: paymentPayload.monto,
        connection,
      });

      if (cuentaResolution.error) {
        res.status(cuentaResolution.error.status).json({ message: cuentaResolution.error.message });
        await connection.rollback();
        return;
      }

      cuentaPago = cuentaResolution.cuenta;
      cuentaPagoId = cuentaPago?.id ?? null;
    } else if (cuentaPagoId != null) {
      cuentaPago = await findCuentaByIdAndPedido(cuentaPagoId, pedidoId, connection);
      if (!cuentaPago) {
        res.status(404).json({ message: "Cuenta no encontrada para este pedido" });
        await connection.rollback();
        return;
      }

      if (cuentaPago.estado === "PAGADA" && cuentaPagoId !== cuentaAnteriorId) {
        res.status(409).json({ message: "La cuenta destino ya fue pagada" });
        await connection.rollback();
        return;
      }

      if (cuentaPago.estado === "CANCELADA") {
        res.status(409).json({ message: "La cuenta destino esta cancelada" });
        await connection.rollback();
        return;
      }
    }

    if (cuentaPagoId == null) {
      res.status(409).json({
        message: "No se pudo determinar la cuenta a actualizar para este pago",
      });
      await connection.rollback();
      return;
    }

    if (cuentaPago) {
      const totalPagadoCuentaActual = roundMoney(await sumPagosByCuentaPedidoId(cuentaPago.id, connection));
      const totalBaseCuenta =
        cuentaAnteriorId === cuentaPago.id
          ? roundMoney(totalPagadoCuentaActual - Number(existingPago.monto))
          : totalPagadoCuentaActual;
      const nuevoTotalCuenta = roundMoney(totalBaseCuenta + roundMoney(paymentPayload.monto));

      if (nuevoTotalCuenta > roundMoney(Number(cuentaPago.total)) + MONEY_EPSILON) {
        res.status(409).json({
          message: "El pago excede el total de la cuenta",
          cuentaId: cuentaPago.id,
          totalCuenta: roundMoney(Number(cuentaPago.total)),
          totalPagadoCuentaActual: totalBaseCuenta,
          montoIntentado: roundMoney(paymentPayload.monto),
        });
        await connection.rollback();
        return;
      }
    }

    const totalPagadoActual = roundMoney(await sumPagosByPedidoId(pedidoId, connection));
    const totalSinEstePago = roundMoney(totalPagadoActual - Number(existingPago.monto));
    const nuevoTotalPagado = roundMoney(totalSinEstePago + roundMoney(paymentPayload.monto));
    const totalPedidoCobrar = await resolvePedidoPayableTotal(pedidoId, pedido.total);

    if (nuevoTotalPagado > totalPedidoCobrar + MONEY_EPSILON) {
      res.status(409).json({
        message: "El pago excede el total del pedido",
        totalPedido: totalPedidoCobrar,
        totalPagadoActual,
        montoIntentado: roundMoney(paymentPayload.monto),
        saldoPendienteAntes: roundMoney(totalPedidoCobrar - totalSinEstePago),
      });
      await connection.rollback();
      return;
    }

    await updatePago(
      paymentId,
      {
        cuentaPedidoId: cuentaPagoId,
        metodoPagoId: pagoInput.metodoPagoId,
        monedaId: paymentPayload.moneda.id,
        tipoCambioId: paymentPayload.tipoCambio?.id || null,
        monto: paymentPayload.monto,
        montoRecibido: paymentPayload.montoRecibido,
        vuelto: paymentPayload.vuelto,
        tipoCambioUtilizado: paymentPayload.tipoCambioUtilizado,
        montoMoneda: paymentPayload.montoMoneda,
        referencia: pagoInput.referencia,
      },
      connection,
    );

    const cuentasSync = await syncAllCuentasEstadoByPayments(pedidoId, connection);
    const cuentaActualizada = cuentaPagoId != null
      ? cuentasSync.find((cuenta) => cuenta.id === cuentaPagoId) || null
      : null;

    await connection.commit();

    const pago = await findPagoByIdAndPedido(paymentId, pedidoId);
    const updatedPedido = await hydratePedido(pedidoId);

    res.json({
      message: "Pago actualizado exitosamente",
      pago,
      cuenta: cuentaActualizada,
      pedido: updatedPedido,
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deletePedidoPaymentHandler(req, res) {
  const pedidoId = Number(req.params.id);
  const paymentId = Number(req.params.paymentId);

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    res.status(400).json({ message: "id de pago invalido" });
    return;
  }

  const pedido = await ensurePedidoExists(pedidoId, res);
  if (!pedido) return;

  if (["CANCELADO"].includes(pedido.estado)) {
    res.status(409).json({ message: "No se pueden eliminar pagos de un pedido cancelado" });
    return;
  }

  const existingPago = await findPagoByIdAndPedido(paymentId, pedidoId);
  if (!existingPago) {
    res.status(404).json({ message: "Pago no encontrado" });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await deletePago(paymentId, connection);

    await syncAllCuentasEstadoByPayments(pedidoId, connection);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const updatedPedido = await hydratePedido(pedidoId);

  res.json({
    message: "Pago eliminado exitosamente",
    pedido: updatedPedido,
  });
}

async function listPaymentMethodsHandler(_req, res) {
  const [methods, monedas, tipoCambioActivo, servicePercentage, monedaColones, monedaDolares] = await Promise.all([
    listMetodosPago(),
    listMonedas({ onlyActive: true }),
    findLatestActiveTipoCambio(),
    getServicePercentage(),
    findMonedaByCode("CRC"),
    findMonedaByCode("USD"),
  ]);

  res.json({
    methods,
    monedas,
    tipoCambioActivo,
    configuracionFacturacion: {
      porcentajeServicio: servicePercentage,
      monedaLocalId: monedaColones?.id || null,
      monedaDolarId: monedaDolares?.id || null,
    },
  });
}

async function sendPedidoToKitchenHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const existingPedido = await hydratePedido(pedidoId);
  if (!existingPedido) {
    res.status(404).json({ message: "Pedido no encontrado" });
    return;
  }

  if (["CANCELADO", "CERRADO", "FACTURADO"].includes(existingPedido.estado)) {
    res.status(409).json({ message: "El pedido no puede enviarse a cocina en su estado actual" });
    return;
  }

  if (!existingPedido.detalles.length) {
    res.status(409).json({ message: "El pedido no tiene detalles para imprimir en cocina" });
    return;
  }

  const body = req.body || {};
  const copias = body.copias == null ? 1 : Number(body.copias);

  if (!Number.isInteger(copias) || copias <= 0) {
    res.status(400).json({ message: "copias invalido" });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const pedidoState = await findPedidoById(pedidoId);
    const nextState = pedidoState.estado === "BORRADOR" ? "COCINA" : pedidoState.estado;

    if (nextState !== pedidoState.estado) {
      await updatePedido(
        pedidoId,
        {
          codigo: pedidoState.codigo,
          mesaId: pedidoState.mesaId,
          clienteId: pedidoState.clienteId,
          usuarioId: pedidoState.usuarioId,
          tipo: pedidoState.tipo,
          estado: nextState,
          subtotal: pedidoState.subtotal,
          impuesto: pedidoState.impuesto,
          total: pedidoState.total,
          fechaApertura: pedidoState.fechaApertura,
          fechaCierre: pedidoState.fechaCierre,
        },
        connection,
      );
    }

    const jobId = await queuePedidoPrint(
      {
        pedido: {
          ...existingPedido,
          estado: nextState,
        },
        tipo: "COCINA",
        usuarioId: req.authUser.id,
        reimpresion: existingPedido.estado === "COCINA" ? 1 : 0,
        copias,
      },
      connection,
    );

    await connection.commit();

    const pedido = await hydratePedido(pedidoId);
    const printJob = await findColaImpresionById(jobId);

    res.json({
      message: "Pedido enviado a cocina exitosamente",
      pedido,
      printJob,
    });
  } catch (error) {
    await connection.rollback();

    if (error && error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function facturarPedidoHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const existingPedido = await hydratePedido(pedidoId);
  if (!existingPedido) {
    res.status(404).json({ message: "Pedido no encontrado" });
    return;
  }

  if (["CANCELADO", "CERRADO"].includes(existingPedido.estado)) {
    res.status(409).json({ message: "El pedido no puede facturarse en su estado actual" });
    return;
  }

  if (!existingPedido.detalles.length) {
    res.status(409).json({ message: "El pedido no tiene detalles para facturar" });
    return;
  }

  const body = req.body || {};
  const copias = body.copias == null ? 1 : Number(body.copias);

  if (!Number.isInteger(copias) || copias <= 0) {
    res.status(400).json({ message: "copias invalido" });
    return;
  }

  const connection = await pool.getConnection();
  const servicePercentage = await getServicePercentage();

  try {
    await connection.beginTransaction();

    const pedidoState = await findPedidoById(pedidoId);
    const subtotal = roundMoney(await sumDetalleSubtotalByPedido(pedidoId, connection));
    const totals = computePedidoTotals(
      subtotal,
      pedidoState.tipo === "MESA" && Number(pedidoState.impuesto) > 0,
      servicePercentage,
    );

    await updatePedidoTotals(
      pedidoId,
      {
        subtotal: totals.subtotal,
        impuesto: totals.impuesto,
        total: totals.total,
      },
      connection,
    );

    await updatePedido(
      pedidoId,
      {
        codigo: pedidoState.codigo,
        mesaId: pedidoState.mesaId,
        clienteId: pedidoState.clienteId,
        usuarioId: pedidoState.usuarioId,
        tipo: pedidoState.tipo,
        estado: "FACTURADO",
        subtotal: totals.subtotal,
        impuesto: totals.impuesto,
        total: totals.total,
        fechaApertura: pedidoState.fechaApertura,
        fechaCierre: pedidoState.fechaCierre,
      },
      connection,
    );

    const pedidoToPrint = {
      ...existingPedido,
      estado: "FACTURADO",
      subtotal: totals.subtotal,
      impuesto: totals.impuesto,
      total: totals.total,
    };

    const jobId = await queuePedidoPrint(
      {
        pedido: pedidoToPrint,
        tipo: "FACTURA",
        usuarioId: req.authUser.id,
        reimpresion: existingPedido.estado === "FACTURADO" ? 1 : 0,
        copias,
      },
      connection,
    );

    await connection.commit();

    const pedido = await hydratePedido(pedidoId);
    const printJob = await findColaImpresionById(jobId);

    res.json({
      message: "Pedido facturado y enviado a impresion exitosamente",
      pedido,
      printJob,
    });
  } catch (error) {
    await connection.rollback();

    if (error && error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function reprintPedidoKitchenHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const pedido = await hydratePedido(pedidoId);
  if (!pedido) {
    res.status(404).json({ message: "Pedido no encontrado" });
    return;
  }

  if (!pedido.detalles.length) {
    res.status(409).json({ message: "El pedido no tiene detalles para reimprimir" });
    return;
  }

  const body = req.body || {};
  const copias = body.copias == null ? 1 : Number(body.copias);

  if (!Number.isInteger(copias) || copias <= 0) {
    res.status(400).json({ message: "copias invalido" });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const jobId = await queuePedidoPrint(
      {
        pedido,
        tipo: "COCINA",
        usuarioId: req.authUser.id,
        reimpresion: 1,
        copias,
      },
      connection,
    );

    await connection.commit();

    const printJob = await findColaImpresionById(jobId);

    res.status(201).json({
      message: "Reimpresion de cocina encolada exitosamente",
      pedido,
      printJob,
    });
  } catch (error) {
    await connection.rollback();

    if (error && error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function reprintPedidoFacturaHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const pedido = await hydratePedido(pedidoId);
  if (!pedido) {
    res.status(404).json({ message: "Pedido no encontrado" });
    return;
  }

  if (!pedido.detalles.length) {
    res.status(409).json({ message: "El pedido no tiene detalles para reimprimir" });
    return;
  }

  const body = req.body || {};
  const copias = body.copias == null ? 1 : Number(body.copias);

  if (!Number.isInteger(copias) || copias <= 0) {
    res.status(400).json({ message: "copias invalido" });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const jobId = await queuePedidoPrint(
      {
        pedido,
        tipo: "FACTURA",
        usuarioId: req.authUser.id,
        reimpresion: 1,
        copias,
      },
      connection,
    );

    await connection.commit();

    const printJob = await findColaImpresionById(jobId);

    res.status(201).json({
      message: "Reimpresion de factura encolada exitosamente",
      pedido,
      printJob,
    });
  } catch (error) {
    await connection.rollback();

    if (error && error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function reprintPedidoHandler(req, res) {
  const pedidoId = Number(req.params.id);
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    res.status(400).json({ message: "id de pedido invalido" });
    return;
  }

  const pedido = await hydratePedido(pedidoId);
  if (!pedido) {
    res.status(404).json({ message: "Pedido no encontrado" });
    return;
  }

  if (!pedido.detalles.length) {
    res.status(409).json({ message: "El pedido no tiene detalles para reimprimir" });
    return;
  }

  const body = req.body || {};
  const copias = body.copias == null ? 1 : Number(body.copias);
  const tipoRaw = String(body.tipo || "AUTO").trim().toUpperCase();

  if (!Number.isInteger(copias) || copias <= 0) {
    res.status(400).json({ message: "copias invalido" });
    return;
  }

  let tipo = tipoRaw;
  if (tipo === "AUTO") {
    tipo = ["FACTURADO", "CERRADO"].includes(pedido.estado) ? "FACTURA" : "COCINA";
  }

  if (!["COCINA", "FACTURA"].includes(tipo)) {
    res.status(400).json({
      message: "tipo invalido",
      acceptedTipos: ["AUTO", "COCINA", "FACTURA"],
    });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const jobId = await queuePedidoPrint(
      {
        pedido,
        tipo,
        usuarioId: req.authUser.id,
        reimpresion: 1,
        copias,
      },
      connection,
    );

    await connection.commit();

    const printJob = await findColaImpresionById(jobId);

    res.status(201).json({
      message: `Reimpresion ${tipo.toLowerCase()} encolada exitosamente`,
      tipo,
      pedido,
      printJob,
    });
  } catch (error) {
    await connection.rollback();

    if (error && error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listPedidosHandler,
  getPedidoByIdHandler,
  createPedidoHandler,
  updatePedidoHandler,
  deletePedidoHandler,
  listPedidoDetailsHandler,
  createPedidoDetailHandler,
  updatePedidoDetailHandler,
  deletePedidoDetailHandler,
  listPedidoAccountsHandler,
  createPedidoAccountHandler,
  assignPedidoAccountDetailsHandler,
  movePedidoAccountDetailHandler,
  removePedidoAccountDetailHandler,
  listPedidoPaymentsHandler,
  createPedidoPaymentHandler,
  updatePedidoPaymentHandler,
  deletePedidoPaymentHandler,
  listPaymentMethodsHandler,
  sendPedidoToKitchenHandler,
  facturarPedidoHandler,
  reprintPedidoHandler,
  reprintPedidoKitchenHandler,
  reprintPedidoFacturaHandler,
};
