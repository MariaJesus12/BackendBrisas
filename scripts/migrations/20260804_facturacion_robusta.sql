-- Facturacion robusta: cuentas divididas, pagos multimoneda y configuracion de servicio.
-- Ejecutar en MySQL 8+.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS configuracion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clave VARCHAR(100) NOT NULL UNIQUE,
  valor VARCHAR(255) NOT NULL,
  descripcion VARCHAR(255) NULL
);

INSERT INTO configuracion (clave, valor, descripcion)
VALUES ('PORCENTAJE_SERVICIO', '10', 'Porcentaje de servicio aplicado a pedidos en mesa')
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  descripcion = VALUES(descripcion);

CREATE TABLE IF NOT EXISTS cuentas_pedido (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  numero_cuenta INT NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  impuesto DECIMAL(10,2) NOT NULL DEFAULT 0,
  descuento DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado ENUM('ABIERTA','PAGADA','CANCELADA') NOT NULL DEFAULT 'ABIERTA',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cuentas_pedido_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
);

ALTER TABLE detalle_pedido
  ADD COLUMN IF NOT EXISTS cuenta_pedido_id INT NULL AFTER pedido_id;

SET @has_fk_detalle_cuenta := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'detalle_pedido'
    AND CONSTRAINT_NAME = 'fk_detalle_cuenta_pedido'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql_detalle_fk := IF(
  @has_fk_detalle_cuenta = 0,
  'ALTER TABLE detalle_pedido ADD CONSTRAINT fk_detalle_cuenta_pedido FOREIGN KEY (cuenta_pedido_id) REFERENCES cuentas_pedido(id)',
  'SELECT 1'
);
PREPARE stmt_detalle_fk FROM @sql_detalle_fk;
EXECUTE stmt_detalle_fk;
DEALLOCATE PREPARE stmt_detalle_fk;

ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS moneda_id INT NULL AFTER metodo_pago_id,
  ADD COLUMN IF NOT EXISTS tipo_cambio_id INT NULL AFTER moneda_id,
  ADD COLUMN IF NOT EXISTS monto_recibido DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER monto,
  ADD COLUMN IF NOT EXISTS vuelto DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER monto_recibido,
  ADD COLUMN IF NOT EXISTS tipo_cambio_utilizado DECIMAL(10,4) NOT NULL DEFAULT 1 AFTER vuelto,
  ADD COLUMN IF NOT EXISTS monto_moneda DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER tipo_cambio_utilizado;

SET @crc_id := (
  SELECT id
  FROM monedas
  WHERE UPPER(codigo) IN ('CRC', 'COL')
  ORDER BY id
  LIMIT 1
);

UPDATE pagos
SET
  moneda_id = COALESCE(moneda_id, @crc_id),
  monto_recibido = CASE WHEN monto_recibido <= 0 THEN monto ELSE monto_recibido END,
  tipo_cambio_utilizado = CASE WHEN tipo_cambio_utilizado <= 0 THEN 1 ELSE tipo_cambio_utilizado END,
  monto_moneda = CASE WHEN monto_moneda <= 0 THEN monto ELSE monto_moneda END,
  vuelto = CASE WHEN vuelto < 0 THEN 0 ELSE vuelto END;

SET @has_fk_pagos_moneda := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pagos'
    AND CONSTRAINT_NAME = 'fk_pagos_moneda'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql_pagos_moneda_fk := IF(
  @has_fk_pagos_moneda = 0,
  'ALTER TABLE pagos ADD CONSTRAINT fk_pagos_moneda FOREIGN KEY (moneda_id) REFERENCES monedas(id)',
  'SELECT 1'
);
PREPARE stmt_pagos_moneda_fk FROM @sql_pagos_moneda_fk;
EXECUTE stmt_pagos_moneda_fk;
DEALLOCATE PREPARE stmt_pagos_moneda_fk;

SET @has_fk_pagos_tc := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pagos'
    AND CONSTRAINT_NAME = 'fk_pagos_tipo_cambio'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql_pagos_tc_fk := IF(
  @has_fk_pagos_tc = 0,
  'ALTER TABLE pagos ADD CONSTRAINT fk_pagos_tipo_cambio FOREIGN KEY (tipo_cambio_id) REFERENCES tipo_cambio(id)',
  'SELECT 1'
);
PREPARE stmt_pagos_tc_fk FROM @sql_pagos_tc_fk;
EXECUTE stmt_pagos_tc_fk;
DEALLOCATE PREPARE stmt_pagos_tc_fk;

COMMIT;
