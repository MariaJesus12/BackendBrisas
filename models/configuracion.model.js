const { query } = require("../config/database");

async function findConfiguracionByClave(clave) {
  const rows = await query(
    `
    SELECT id, clave, valor, descripcion
    FROM configuracion
    WHERE clave = ?
    LIMIT 1
    `,
    [clave],
  );

  return rows[0] || null;
}

module.exports = {
  findConfiguracionByClave,
};
