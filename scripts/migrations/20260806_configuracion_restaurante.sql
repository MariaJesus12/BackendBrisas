-- Configuracion del restaurante para datos visibles/administrables desde frontend.
-- Ejecutar en MySQL 8+.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS configuracion_restaurante (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NULL,
  telefono VARCHAR(50) NOT NULL,
  whatsapp VARCHAR(50) NOT NULL,
  instagram_url VARCHAR(255) NULL,
  facebook_url VARCHAR(255) NULL,
  tripadvisor_url VARCHAR(255) NULL,
  google_maps_url VARCHAR(500) NULL,
  direccion TEXT NOT NULL,
  horario TEXT NOT NULL,
  logo VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE configuracion_restaurante
  ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(255) NULL AFTER whatsapp,
  ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(255) NULL AFTER instagram_url,
  ADD COLUMN IF NOT EXISTS tripadvisor_url VARCHAR(255) NULL AFTER facebook_url,
  ADD COLUMN IF NOT EXISTS google_maps_url VARCHAR(500) NULL AFTER tripadvisor_url;

COMMIT;
