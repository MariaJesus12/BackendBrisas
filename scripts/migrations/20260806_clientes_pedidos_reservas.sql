-- Clientes + relacion con pedidos y reservas.
-- Ejecutar en MySQL 8+.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  observaciones VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_clientes_nombre ON clientes (nombre);
CREATE INDEX idx_clientes_telefono ON clientes (telefono);
CREATE INDEX idx_clientes_activo_nombre ON clientes (activo, nombre);

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS cliente_id INT NULL AFTER tipo;

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS cliente_id INT NULL AFTER mesa_id;

CREATE INDEX idx_pedidos_cliente ON pedidos (cliente_id);
CREATE INDEX idx_reservas_cliente ON reservas (cliente_id);

SET @has_fk_pedidos_cliente := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pedidos'
    AND CONSTRAINT_NAME = 'fk_pedidos_cliente'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql_pedidos_cliente_fk := IF(
  @has_fk_pedidos_cliente = 0,
  'ALTER TABLE pedidos ADD CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)',
  'SELECT 1'
);
PREPARE stmt_pedidos_cliente_fk FROM @sql_pedidos_cliente_fk;
EXECUTE stmt_pedidos_cliente_fk;
DEALLOCATE PREPARE stmt_pedidos_cliente_fk;

SET @has_fk_reservas_cliente := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservas'
    AND CONSTRAINT_NAME = 'fk_reservas_cliente'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql_reservas_cliente_fk := IF(
  @has_fk_reservas_cliente = 0,
  'ALTER TABLE reservas ADD CONSTRAINT fk_reservas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)',
  'SELECT 1'
);
PREPARE stmt_reservas_cliente_fk FROM @sql_reservas_cliente_fk;
EXECUTE stmt_reservas_cliente_fk;
DEALLOCATE PREPARE stmt_reservas_cliente_fk;

-- Backfill basico desde reservas historicas para no perder trazabilidad.
INSERT INTO clientes (nombre, telefono, observaciones, activo, created_at, updated_at)
SELECT DISTINCT
  TRIM(r.nombre_cliente) AS nombre,
  TRIM(r.telefono) AS telefono,
  'Migrado desde reservas',
  1,
  NOW(),
  NOW()
FROM reservas r
LEFT JOIN clientes c
  ON LOWER(TRIM(c.nombre)) = LOWER(TRIM(r.nombre_cliente))
  AND REPLACE(TRIM(c.telefono), ' ', '') = REPLACE(TRIM(r.telefono), ' ', '')
WHERE r.cliente_id IS NULL
  AND r.nombre_cliente IS NOT NULL
  AND TRIM(r.nombre_cliente) <> ''
  AND r.telefono IS NOT NULL
  AND TRIM(r.telefono) <> ''
  AND c.id IS NULL;

UPDATE reservas r
INNER JOIN clientes c
  ON LOWER(TRIM(c.nombre)) = LOWER(TRIM(r.nombre_cliente))
  AND REPLACE(TRIM(c.telefono), ' ', '') = REPLACE(TRIM(r.telefono), ' ', '')
SET r.cliente_id = c.id
WHERE r.cliente_id IS NULL
  AND r.nombre_cliente IS NOT NULL
  AND TRIM(r.nombre_cliente) <> ''
  AND r.telefono IS NOT NULL
  AND TRIM(r.telefono) <> '';

COMMIT;
