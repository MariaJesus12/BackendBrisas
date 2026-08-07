const { query } = require("../config/database");

function toConfiguracionRestaurante(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono,
    whatsapp: row.whatsapp,
    instagramUrl: row.instagram_url,
    facebookUrl: row.facebook_url,
    tripadvisorUrl: row.tripadvisor_url,
    googleMapsUrl: row.google_maps_url,
    direccion: row.direccion,
    horario: row.horario,
    createdAt: row.created_at,
  };
}

async function listConfiguracionesRestaurante() {
  const rows = await query(
    `
    SELECT
      id,
      nombre,
      telefono,
      whatsapp,
      instagram_url,
      facebook_url,
      tripadvisor_url,
      google_maps_url,
      direccion,
      horario,
      created_at
    FROM configuracion_restaurante
    ORDER BY id DESC
    `,
  );

  return rows.map(toConfiguracionRestaurante);
}

async function findConfiguracionRestauranteById(configId) {
  const rows = await query(
    `
    SELECT
      id,
      nombre,
      telefono,
      whatsapp,
      instagram_url,
      facebook_url,
      tripadvisor_url,
      google_maps_url,
      direccion,
      horario,
      created_at
    FROM configuracion_restaurante
    WHERE id = ?
    LIMIT 1
    `,
    [configId],
  );

  const row = rows[0];
  return row ? toConfiguracionRestaurante(row) : null;
}

async function findLatestConfiguracionRestaurante() {
  const rows = await query(
    `
    SELECT
      id,
      nombre,
      telefono,
      whatsapp,
      instagram_url,
      facebook_url,
      tripadvisor_url,
      google_maps_url,
      direccion,
      horario,
      created_at
    FROM configuracion_restaurante
    ORDER BY id DESC
    LIMIT 1
    `,
  );

  const row = rows[0];
  return row ? toConfiguracionRestaurante(row) : null;
}

async function createConfiguracionRestaurante({
  nombre,
  telefono,
  whatsapp,
  instagramUrl,
  facebookUrl,
  tripadvisorUrl,
  googleMapsUrl,
  direccion,
  horario,
  createdAt,
}) {
  const createdAtSql = createdAt || null;

  const result = await query(
    `
    INSERT INTO configuracion_restaurante (
      nombre,
      telefono,
      whatsapp,
      instagram_url,
      facebook_url,
      tripadvisor_url,
      google_maps_url,
      direccion,
      horario,
      logo,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, NOW()))
    `,
    [
      nombre,
      telefono,
      whatsapp,
      instagramUrl,
      facebookUrl,
      tripadvisorUrl,
      googleMapsUrl,
      direccion,
      horario,
      createdAtSql,
    ],
  );

  return result.insertId;
}

async function updateConfiguracionRestaurante(
  configId,
  { nombre, telefono, whatsapp, instagramUrl, facebookUrl, tripadvisorUrl, googleMapsUrl, direccion, horario, createdAt },
) {
  const result = await query(
    `
    UPDATE configuracion_restaurante
    SET
      nombre = ?,
      telefono = ?,
      whatsapp = ?,
      instagram_url = ?,
      facebook_url = ?,
      tripadvisor_url = ?,
      google_maps_url = ?,
      direccion = ?,
      horario = ?,
      created_at = ?
    WHERE id = ?
    `,
    [
      nombre,
      telefono,
      whatsapp,
      instagramUrl,
      facebookUrl,
      tripadvisorUrl,
      googleMapsUrl,
      direccion,
      horario,
      createdAt,
      configId,
    ],
  );

  return result.affectedRows;
}

module.exports = {
  listConfiguracionesRestaurante,
  findConfiguracionRestauranteById,
  findLatestConfiguracionRestaurante,
  createConfiguracionRestaurante,
  updateConfiguracionRestaurante,
};
