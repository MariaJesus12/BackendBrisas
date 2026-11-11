const { test } = require("node:test");
const assert = require("node:assert/strict");

function stubModule(path, exports) {
  const filename = require.resolve(path);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

const pedido = {
  id: 1, codigo: "P1", tipo: "LLEVAR", estado: "BORRADOR",
  clienteId: 1, usuarioId: 1, subtotal: 0, impuesto: 0, total: 0,
};
const details = [];
const jobs = [];
let lockedDetails = false;
const connection = {
  beginTransaction: async () => {},
  commit: async () => {},
  rollback: async () => {},
  release: () => {},
};

stubModule("../models/pedido.model", {
  pool: { getConnection: async () => connection },
  findPedidoById: async () => ({ ...pedido }),
  listDetalleByPedidoId: async (_id, _connection, options) => {
    if (options?.forUpdate) lockedDetails = true;
    return details.map((detail) => ({ ...detail }));
  },
  listPagosByPedidoId: async () => [],
  listCuentasByPedidoId: async () => [],
  createDetallePedido: async (data) => {
    const id = details.length + 1;
    details.push({ id, ...data, productoNombre: data.productoId === 1 ? "Cafe" : "Pan", cantidadEnviadaCocina: 0 });
    return id;
  },
  findDetalleByIdAndPedido: async (id) => details.find((detail) => detail.id === id),
  sumDetalleSubtotalByPedido: async () => details.reduce((sum, detail) => sum + detail.subtotal, 0),
  updatePedidoTotals: async (_id, totals) => Object.assign(pedido, totals),
  lockPedidoForKitchenDispatch: async () => {},
  updatePedido: async (_id, data) => Object.assign(pedido, data),
  markDetallesAsSentToKitchen: async (ids) => {
    for (const detail of details) {
      if (ids.includes(detail.id)) detail.cantidadEnviadaCocina = detail.cantidad;
    }
  },
});
stubModule("../models/impresion.model", {
  findActiveImpresoraByTipo: async () => ({ id: 1, activa: true }),
  countActiveQueueJobsByPedidoAndTipo: async () => jobs.length,
  createColaImpresion: async (job) => {
    jobs.push(job);
    return jobs.length;
  },
  findColaImpresionById: async (id) => jobs[id - 1],
});
stubModule("../models/configuracion.model", { findConfiguracionByClave: async () => ({ valor: 10 }) });
stubModule("../models/product.model", {
  findProductById: async (id) => ({ id, precio: id === 1 ? 1500 : 800, disponible: true }),
});
for (const name of ["mesa", "moneda", "cliente", "reserva", "tipo-cambio", "user"]) {
  stubModule(`../models/${name}.model`, {});
}

const {
  createPedidoDetailHandler,
  sendPedidoToKitchenHandler,
  updatePedidoDetailHandler,
} = require("../controllers/pedido.controller");

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("pedido para llevar cobra productos nuevos y envia solo cantidades pendientes", async () => {
  const req = { params: { id: "1" }, body: { productoId: 1, cantidad: 2 }, authUser: { id: 1 } };
  let res = response();
  await createPedidoDetailHandler(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.detail.precioUnitario, 1500);
  assert.equal(res.body.pedido.total, 3000);

  res = response();
  await sendPedidoToKitchenHandler({ ...req, body: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(lockedDetails, true);
  assert.match(jobs[0].contenido, /2 x Cafe/);
  assert.equal(details[0].cantidadEnviadaCocina, 2);

  details[0].cantidad = 3;
  details[0].subtotal = 4500;
  req.body = { productoId: 2, cantidad: 2 };
  res = response();
  await createPedidoDetailHandler(req, res);
  assert.equal(res.body.detail.precioUnitario, 800);
  assert.equal(res.body.pedido.total, 6100);

  res = response();
  await sendPedidoToKitchenHandler({ ...req, body: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(jobs[1].contenido, /COMANDA ADICIONAL/);
  assert.match(jobs[1].contenido, /1 x Cafe/);
  assert.match(jobs[1].contenido, /2 x Pan/);
  assert.doesNotMatch(jobs[1].contenido, /3 x Cafe/);
  assert.deepEqual(res.body.detallesEnviados.map((detail) => detail.cantidad), [1, 2]);

  res = response();
  await sendPedidoToKitchenHandler({ ...req, body: {} }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(jobs.length, 2);

  res = response();
  await updatePedidoDetailHandler({ params: { id: "1", detailId: "1" }, body: { productoId: 2 } }, res);
  assert.equal(res.statusCode, 409);
});
