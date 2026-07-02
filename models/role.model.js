const { query } = require("../config/database");

async function listRoles() {
  return query(
    `
    SELECT id, nombre
    FROM roles
    ORDER BY nombre ASC
    `,
  );
}

async function findRoleById(roleId) {
  const rows = await query(
    `
    SELECT id, nombre
    FROM roles
    WHERE id = ?
    LIMIT 1
    `,
    [roleId],
  );

  return rows[0] || null;
}

module.exports = {
  listRoles,
  findRoleById,
};
