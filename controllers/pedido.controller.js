const { findMesaById } = require("../models/mesa.model");
const {
  createDetallePedido,
  createPago,
  createPedido,
  deleteDetallePedido,
  deletePago,
  deletePedidoCascade,
  findDetalleByIdAndPedido,
  findMetodoPagoById,
  findPagoByIdAndPedido,
  findPedidoByCode,
  findPedidoById,
  listDetalleByPedidoId,
  listMetodosPago,
  listPagosByPedidoId,
  listPedidos,
  pool,
  sumDetalleSubtotalByPedido,
  sumPagosByPedidoId,
  updateDetallePedido,
  updatePago,
  updatePedido,
  updatePedidoTotals,
} = require("../models/pedido.model");
const { findProductById } = require("../models/product.model");
const { findUserById } = require("../models/user.model");

const PEDIDO_TIPOS = new Set(["MESA", "LLEVAR"]);
const PEDIDO_ESTADOS = new Set(["BORRADOR", "COCINA", "FACTURADO", "CERRADO", "CANCELADO"]);

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function appError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeUpper(value) {
  return String(value || "").trim().toUpperCase();
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

function parsePedidoCreateInput(body, authUser) {
  const mesaRaw = body.mesaId ?? body.mesa_id;
  const usuarioRaw = body.usuarioId ?? body.usuario_id ?? authUser?.id;

  return {
    codigo: body.codigo == null ? "" : String(body.codigo).trim(),
    mesaId: mesaRaw == null || mesaRaw === "" ? null : Number(mesaRaw),
    usuarioId: Number(usuarioRaw),
    tipo: normalizeUpper(body.tipo),
    estado: normalizeUpper(body.estado || "BORRADOR"),
    impuesto: Number(body.impuesto ?? 0),
    fechaApertura: parseDateTime(body.fechaApertura ?? body.fecha_apertura),
    fechaCierre: parseDateTime(body.fechaCierre ?? body.fecha_cierre),
    detalles: Array.isArray(body.detalles) ? body.detalles : [],
  };
}

function parsePedidoUpdateInput(body, existingPedido) {
  const hasMesaId = Object.prototype.hasOwnProperty.call(body, "mesaId");
  const hasMesaIdAlias = Object.prototype.hasOwnProperty.call(body, "mesa_id");
  const hasUsuarioId = Object.prototype.hasOwnProperty.call(body, "usuarioId");
  const hasUsuarioIdAlias = Object.prototype.hasOwnProperty.call(body, "usuario_id");
  const hasFechaApertura = Object.prototype.hasOwnProperty.call(body, "fechaApertura");
  const hasFechaAperturaAlias = Object.prototype.hasOwnProperty.call(body, "fecha_apertura");
  const hasFechaCierre = Object.prototype.hasOwnProperty.call(body, "fechaCierre");
  const hasFechaCierreAlias = Object.prototype.hasOwnProperty.call(body, "fecha_cierre");

  const mesaRaw = hasMesaId ? body.mesaId : hasMesaIdAlias ? body.mesa_id : existingPedido.mesaId;
  const usuarioRaw = hasUsuarioId ? body.usuarioId : hasUsuarioIdAlias ? body.usuario_id : existingPedido.usuarioId;

  return {
    codigo: Object.prototype.hasOwnProperty.call(body, "codigo")
      ? String(body.codigo || "").trim()
      : existingPedido.codigo,
    mesaId: mesaRaw == null || mesaRaw === "" ? null : Number(mesaRaw),
    usuarioId: Number(usuarioRaw),
    tipo: Object.prototype.hasOwnProperty.call(body, "tipo") ? normalizeUpper(body.tipo) : existingPedido.tipo,
    estado: Object.prototype.hasOwnProperty.call(body, "estado")
      ? normalizeUpper(body.estado)
      : existingPedido.estado,
    impuesto: Object.prototype.hasOwnProperty.call(body, "impuesto") ? Number(body.impuesto) : existingPedido.impuesto,
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
  if (!Number.isFinite(input.impuesto) || input.impuesto < 0) missingFields.push("impuesto");

  if (input.tipo === "MESA" && (!Number.isInteger(input.mesaId) || input.mesaId <= 0)) {
    missingFields.push("mesaId");
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

  const montoRaw = Object.prototype.hasOwnProperty.call(body, "monto") ? body.monto : existingPago?.monto;
  const referenciaRaw = Object.prototype.hasOwnProperty.call(body, "referencia")
    ? body.referencia
    : existingPago?.referencia;

  return {
    metodoPagoId: Number(metodoRaw),
    monto: Number(montoRaw),
    referencia: referenciaRaw == null ? null : String(referenciaRaw).trim(),
  };
}

function validatePagoInput(pago) {
  const missingFields = [];

  if (!Number.isInteger(pago.metodoPagoId) || pago.metodoPagoId <= 0) missingFields.push("metodoPagoId");
  if (!Number.isFinite(pago.monto) || pago.monto <= 0) missingFields.push("monto");

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          metodoPagoId: ["metodoPagoId", "metodo_pago_id"],
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

async function generatePedidoCode() {
  for (let i = 0; i < 5; i += 1) {
    const now = new Date();
    const base = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");

    const random = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    const code = `PED-${base}-${random}`;

    const existing = await findPedidoByCode(code);
    if (!existing) {
      return code;
    }
  }

  throw appError(500, "No se pudo generar un codigo de pedido unico");
}

async function hydratePedido(pedidoId) {
  const pedido = await findPedidoById(pedidoId);
  if (!pedido) return null;

  const [detalles, pagos] = await Promise.all([listDetalleByPedidoId(pedidoId), listPagosByPedidoId(pedidoId)]);
  const totalPagado = roundMoney(pagos.reduce((acc, item) => acc + Number(item.monto), 0));

  return {
    ...pedido,
    detalles,
    pagos,
    totalPagado,
    saldoPendiente: roundMoney(pedido.total - totalPagado),
  };
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
  const usuarioId = req.query.usuarioId ? Number(req.query.usuarioId) : undefined;
  const fechaDesde = req.query.fechaDesde ? String(req.query.fechaDesde) : undefined;
  const fechaHasta = req.query.fechaHasta ? String(req.query.fechaHasta) : undefined;

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

  const pedidos = await listPedidos({ estado, tipo, mesaId, usuarioId, fechaDesde, fechaHasta });
  res.json({ pedidos });
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

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  if (input.tipo === "LLEVAR") {
    input.mesaId = null;
  }

  if (input.tipo === "MESA") {
    const mesa = await findMesaById(input.mesaId);
    if (!mesa || !mesa.activa) {
      res.status(400).json({ message: "mesaId invalido o mesa inactiva" });
      return;
    }
  }

  const user = await findUserById(input.usuarioId);
  if (!user || !user.activo) {
    res.status(400).json({ message: "usuarioId invalido o usuario inactivo" });
    return;
  }

  if (input.codigo) {
    const duplicatedByCode = await findPedidoByCode(input.codigo);
    if (duplicatedByCode) {
      res.status(409).json({ message: "Ya existe un pedido con ese codigo" });
      return;
    }
  } else {
    input.codigo = await generatePedidoCode();
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

    normalizedDetalles.push(parsedDetalle);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const pedidoId = await createPedido(
      {
        codigo: input.codigo,
        mesaId: input.mesaId,
        usuarioId: input.usuarioId,
        tipo: input.tipo,
        estado: input.estado,
        subtotal: 0,
        impuesto: roundMoney(input.impuesto),
        total: roundMoney(input.impuesto),
        fechaApertura: input.fechaApertura,
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
    const impuesto = roundMoney(input.impuesto);
    const total = roundMoney(subtotal + impuesto);

    await updatePedidoTotals(
      pedidoId,
      {
        subtotal,
        impuesto,
        total,
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

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  if (input.tipo === "LLEVAR") {
    input.mesaId = null;
  }

  if (input.tipo === "MESA") {
    const mesa = await findMesaById(input.mesaId);
    if (!mesa || !mesa.activa) {
      res.status(400).json({ message: "mesaId invalido o mesa inactiva" });
      return;
    }
  }

  const user = await findUserById(input.usuarioId);
  if (!user || !user.activo) {
    res.status(400).json({ message: "usuarioId invalido o usuario inactivo" });
    return;
  }

  const duplicatedByCode = await findPedidoByCode(input.codigo);
  if (duplicatedByCode && duplicatedByCode.id !== pedidoId) {
    res.status(409).json({ message: "Ya existe otro pedido con ese codigo" });
    return;
  }

  const subtotal = roundMoney(await sumDetalleSubtotalByPedido(pedidoId));
  const impuesto = roundMoney(input.impuesto);
  const total = roundMoney(subtotal + impuesto);

  if (input.estado === "CERRADO") {
    const totalPagado = roundMoney(await sumPagosByPedidoId(pedidoId));
    if (totalPagado + 0.009 < total) {
      res.status(409).json({
        message: "No se puede cerrar el pedido porque aun tiene saldo pendiente",
        total,
        totalPagado,
        saldoPendiente: roundMoney(total - totalPagado),
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
    usuarioId: input.usuarioId,
    tipo: input.tipo,
    estado: input.estado,
    subtotal,
    impuesto,
    total,
    fechaApertura: input.fechaApertura,
    fechaCierre: input.fechaCierre,
  });

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

    const detailId = await createDetallePedido(
      {
        pedidoId,
        productoId: detalleInput.productoId,
        cantidad: detalleInput.cantidad,
        precioUnitario: price,
        subtotal: subtotalDetalle,
        observacion: detalleInput.observacion,
      },
      connection,
    );

    const subtotal = roundMoney(await sumDetalleSubtotalByPedido(pedidoId, connection));
    const impuesto = roundMoney(pedido.impuesto);
    const total = roundMoney(subtotal + impuesto);

    await updatePedidoTotals(
      pedidoId,
      {
        subtotal,
        impuesto,
        total,
      },
      connection,
    );

    await connection.commit();

    const detail = await findDetalleByIdAndPedido(detailId, pedidoId);
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

    await updateDetallePedido(
      detailId,
      {
        productoId: detalleInput.productoId,
        cantidad: detalleInput.cantidad,
        precioUnitario: price,
        subtotal: subtotalDetalle,
        observacion: detalleInput.observacion,
      },
      connection,
    );

    const subtotal = roundMoney(await sumDetalleSubtotalByPedido(pedidoId, connection));
    const impuesto = roundMoney(pedido.impuesto);
    const total = roundMoney(subtotal + impuesto);

    await updatePedidoTotals(
      pedidoId,
      {
        subtotal,
        impuesto,
        total,
      },
      connection,
    );

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

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await deleteDetallePedido(detailId, connection);

    const subtotal = roundMoney(await sumDetalleSubtotalByPedido(pedidoId, connection));
    const impuesto = roundMoney(pedido.impuesto);
    const total = roundMoney(subtotal + impuesto);

    await updatePedidoTotals(
      pedidoId,
      {
        subtotal,
        impuesto,
        total,
      },
      connection,
    );

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

  res.json({
    pedidoId,
    pagos,
    totalPagado,
    saldoPendiente: roundMoney(Number(pedido.total) - totalPagado),
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

  const totalPagadoActual = roundMoney(await sumPagosByPedidoId(pedidoId));
  const nuevoTotalPagado = roundMoney(totalPagadoActual + roundMoney(pagoInput.monto));

  if (nuevoTotalPagado > roundMoney(Number(pedido.total)) + 0.009) {
    res.status(409).json({
      message: "El pago excede el total del pedido",
      totalPedido: roundMoney(Number(pedido.total)),
      totalPagadoActual,
      montoIntentado: roundMoney(pagoInput.monto),
    });
    return;
  }

  const pagoId = await createPago({
    pedidoId,
    metodoPagoId: pagoInput.metodoPagoId,
    monto: roundMoney(pagoInput.monto),
    referencia: pagoInput.referencia,
  });

  const pago = await findPagoByIdAndPedido(pagoId, pedidoId);
  const updatedPedido = await hydratePedido(pedidoId);

  res.status(201).json({
    message: "Pago registrado exitosamente",
    pago,
    pedido: updatedPedido,
  });
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

  const totalPagadoActual = roundMoney(await sumPagosByPedidoId(pedidoId));
  const totalSinEstePago = roundMoney(totalPagadoActual - Number(existingPago.monto));
  const nuevoTotalPagado = roundMoney(totalSinEstePago + roundMoney(pagoInput.monto));

  if (nuevoTotalPagado > roundMoney(Number(pedido.total)) + 0.009) {
    res.status(409).json({
      message: "El pago excede el total del pedido",
      totalPedido: roundMoney(Number(pedido.total)),
      totalPagadoActual,
      montoIntentado: roundMoney(pagoInput.monto),
    });
    return;
  }

  await updatePago(paymentId, {
    metodoPagoId: pagoInput.metodoPagoId,
    monto: roundMoney(pagoInput.monto),
    referencia: pagoInput.referencia,
  });

  const pago = await findPagoByIdAndPedido(paymentId, pedidoId);
  const updatedPedido = await hydratePedido(pedidoId);

  res.json({
    message: "Pago actualizado exitosamente",
    pago,
    pedido: updatedPedido,
  });
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

  await deletePago(paymentId);
  const updatedPedido = await hydratePedido(pedidoId);

  res.json({
    message: "Pago eliminado exitosamente",
    pedido: updatedPedido,
  });
}

async function listPaymentMethodsHandler(_req, res) {
  const methods = await listMetodosPago();
  res.json({ methods });
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
  listPedidoPaymentsHandler,
  createPedidoPaymentHandler,
  updatePedidoPaymentHandler,
  deletePedidoPaymentHandler,
  listPaymentMethodsHandler,
};
