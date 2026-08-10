-- Comandas incrementales: conserva cuantas unidades de cada detalle ya fueron enviadas a cocina.
-- Ejecutar una vez en MySQL 8+ antes de desplegar esta version.

ALTER TABLE detalle_pedido
  ADD COLUMN IF NOT EXISTS cantidad_enviada_cocina INT NOT NULL DEFAULT 0 AFTER cantidad;

-- Los detalles de pedidos que ya estaban en cocina se consideran previamente enviados,
-- para evitar que una nueva comanda reimprima el pedido historico completo.
UPDATE detalle_pedido d
INNER JOIN pedidos p ON p.id = d.pedido_id
SET d.cantidad_enviada_cocina = d.cantidad
WHERE p.estado IN ('COCINA', 'FACTURADO', 'CERRADO')
  AND d.cantidad_enviada_cocina = 0;
