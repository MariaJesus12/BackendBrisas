-- Modulo de reservas de mesas.
-- Ejecutar en MySQL 8+.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS reservas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mesa_id INT NOT NULL,
  usuario_id INT NOT NULL,
  nombre_cliente VARCHAR(150) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  fecha_hora DATETIME NOT NULL,
  cantidad_personas INT NOT NULL,
  observaciones TEXT NULL,
  estado ENUM('PENDIENTE','CONFIRMADA','ATENDIDA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservas_mesa FOREIGN KEY (mesa_id) REFERENCES mesas(id),
  CONSTRAINT fk_reservas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX idx_reservas_mesa_fecha ON reservas (mesa_id, fecha_hora);
CREATE INDEX idx_reservas_estado_fecha ON reservas (estado, fecha_hora);
CREATE INDEX idx_reservas_usuario_fecha ON reservas (usuario_id, fecha_hora);

COMMIT;
