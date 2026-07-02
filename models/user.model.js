const { query } = require("../config/database");

function toSafeUser(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    usuario: row.usuario,
    rolId: row.rol_id,
    rolNombre: row.rol_nombre,
    activo: row.activo === 1,
    ultimoLogin: row.ultimo_login,
  };
}

async function findUserForAuthByUsername(username) {
  const rows = await query(
    `
    SELECT
      u.id,
      u.nombre,
      u.usuario,
      u.password,
      u.rol_id,
      u.activo,
      r.nombre AS rol_nombre,
      u.ultimo_login
    FROM usuarios u
    INNER JOIN roles r ON r.id = u.rol_id
    WHERE u.usuario = ?
    LIMIT 1
    `,
    [username],
  );

  return rows[0] || null;
}

async function findUserByUsername(username) {
  const rows = await query(
    `
    SELECT
      id,
      usuario
    FROM usuarios
    WHERE usuario = ?
    LIMIT 1
    `,
    [username],
  );

  return rows[0] || null;
}

async function findActiveUserById(userId) {
  const rows = await query(
    `
    SELECT
      u.id,
      u.nombre,
      u.usuario,
      u.password,
      u.rol_id,
      u.activo,
      r.nombre AS rol_nombre,
      u.ultimo_login
    FROM usuarios u
    INNER JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ? AND u.activo = 1
    LIMIT 1
    `,
    [userId],
  );

  const row = rows[0];
  return row ? toSafeUser(row) : null;
}

async function updateLastActivity(userId) {
  await query(
    `
    UPDATE usuarios
    SET ultimo_login = NOW()
    WHERE id = ?
    `,
    [userId],
  );
}

async function expireSessionByUserId(userId, inactivityHours) {
  const expiredDate = new Date(Date.now() - (inactivityHours + 1) * 60 * 60 * 1000);

  await query(
    `
    UPDATE usuarios
    SET ultimo_login = ?
    WHERE id = ?
    `,
    [expiredDate, userId],
  );
}

async function createUser({ nombre, usuario, passwordHash, rolId, activo }) {
  const result = await query(
    `
    INSERT INTO usuarios (nombre, usuario, password, rol_id, activo, ultimo_login, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, NOW(), NOW())
    `,
    [nombre, usuario, passwordHash, rolId, activo],
  );

  return result.insertId;
}

async function findUserById(userId) {
  const rows = await query(
    `
    SELECT
      u.id,
      u.nombre,
      u.usuario,
      u.rol_id,
      u.activo,
      r.nombre AS rol_nombre,
      u.ultimo_login
    FROM usuarios u
    INNER JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId],
  );

  const row = rows[0];
  return row ? toSafeUser(row) : null;
}

async function listUsersWithRoles() {
  const rows = await query(
    `
    SELECT
      u.id,
      u.nombre,
      u.usuario,
      u.rol_id,
      r.nombre AS rol_nombre,
      u.activo,
      u.ultimo_login,
      u.created_at,
      u.updated_at
    FROM usuarios u
    INNER JOIN roles r ON r.id = u.rol_id
    ORDER BY u.id ASC
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    usuario: row.usuario,
    rolId: row.rol_id,
    rolNombre: row.rol_nombre,
    activo: row.activo === 1,
    ultimoLogin: row.ultimo_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

module.exports = {
  findUserForAuthByUsername,
  findUserByUsername,
  findActiveUserById,
  findUserById,
  listUsersWithRoles,
  updateLastActivity,
  expireSessionByUserId,
  createUser,
};
