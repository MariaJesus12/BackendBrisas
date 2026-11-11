const { test } = require("node:test");
const assert = require("node:assert/strict");

const databasePath = require.resolve("../config/database");
require.cache[databasePath] = {
  id: databasePath, filename: databasePath, loaded: true,
  exports: { pool: {}, query: async () => { throw new Error("Se esperaba usar la conexion de la transaccion"); } },
};
const { listDetalleByPedidoId, updateDetallePedido } = require("../models/pedido.model");

test("bloquea detalles durante el envio y conserva cantidades enviadas sin cuentas", async () => {
  const statements = [];
  const connection = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.includes("INFORMATION_SCHEMA.COLUMNS")) {
        return [[{ TABLE_NAME: "detalle_pedido", COLUMN_NAME: "cantidad_enviada_cocina" }]];
      }
      if (sql.includes("INFORMATION_SCHEMA.TABLES")) return [[]];
      if (sql.includes("SELECT") && sql.includes("FROM detalle_pedido")) return [[]];
      return [{ affectedRows: 1 }];
    },
  };

  await listDetalleByPedidoId(1, connection, { forUpdate: true });
  assert.match(statements.find((entry) => entry.sql.includes("FROM detalle_pedido")).sql, /FOR UPDATE/);

  await updateDetallePedido(5, {
    productoId: 2, cantidad: 1, precioUnitario: 100, subtotal: 100, observacion: null,
  }, connection);
  const update = statements.find((entry) => entry.sql.includes("UPDATE detalle_pedido"));
  assert.match(update.sql, /cantidad_enviada_cocina = LEAST\(cantidad_enviada_cocina, \?\)/);
  assert.deepEqual(update.params, [2, 1, 100, 100, null, 1, 5]);
});
