const { query } = require("../config/database");

function toAnnouncement(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    imagen: row.imagen,
    fechaInicio: row.fecha_inicio,
    fechaFin: row.fecha_fin,
    horaInicio: row.hora_inicio,
    horaFin: row.hora_fin,
    prioridad: row.prioridad,
    activo: row.activo === 1,
    usuarioId: row.usuario_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tipo: row.tipo,
    usuarioNombre: row.usuario_nombre,
  };
}

async function listCurrentAnnouncements() {
  const rows = await query(
    `
    SELECT
      a.id,
      a.titulo,
      a.descripcion,
      a.imagen,
      a.fecha_inicio,
      a.fecha_fin,
      a.hora_inicio,
      a.hora_fin,
      a.prioridad,
      a.activo,
      a.usuario_id,
      a.created_at,
      a.updated_at,
      a.tipo,
      u.nombre AS usuario_nombre
    FROM anuncios a
    INNER JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.activo = 1
    ORDER BY a.prioridad DESC, a.created_at DESC, a.id DESC
    `,
  );

  return rows.map(toAnnouncement);
}

async function listAnnouncementsHistory() {
  const rows = await query(
    `
    SELECT
      a.id,
      a.titulo,
      a.descripcion,
      a.imagen,
      a.fecha_inicio,
      a.fecha_fin,
      a.hora_inicio,
      a.hora_fin,
      a.prioridad,
      a.activo,
      a.usuario_id,
      a.created_at,
      a.updated_at,
      a.tipo,
      u.nombre AS usuario_nombre
    FROM anuncios a
    INNER JOIN usuarios u ON u.id = a.usuario_id
    ORDER BY a.created_at DESC, a.id DESC
    `,
  );

  return rows.map(toAnnouncement);
}

async function findAnnouncementById(announcementId) {
  const rows = await query(
    `
    SELECT
      a.id,
      a.titulo,
      a.descripcion,
      a.imagen,
      a.fecha_inicio,
      a.fecha_fin,
      a.hora_inicio,
      a.hora_fin,
      a.prioridad,
      a.activo,
      a.usuario_id,
      a.created_at,
      a.updated_at,
      a.tipo,
      u.nombre AS usuario_nombre
    FROM anuncios a
    INNER JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.id = ?
    LIMIT 1
    `,
    [announcementId],
  );

  const row = rows[0];
  return row ? toAnnouncement(row) : null;
}

async function createAnnouncement({
  titulo,
  descripcion,
  imagen,
  fechaInicio,
  fechaFin,
  horaInicio,
  horaFin,
  prioridad,
  activo,
  usuarioId,
  tipo,
}) {
  const result = await query(
    `
    INSERT INTO anuncios (
      titulo,
      descripcion,
      imagen,
      fecha_inicio,
      fecha_fin,
      hora_inicio,
      hora_fin,
      prioridad,
      activo,
      usuario_id,
      tipo,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [titulo, descripcion, imagen, fechaInicio, fechaFin, horaInicio, horaFin, prioridad, activo, usuarioId, tipo],
  );

  return result.insertId;
}

async function updateAnnouncement(
  announcementId,
  {
    titulo,
    descripcion,
    imagen,
    fechaInicio,
    fechaFin,
    horaInicio,
    horaFin,
    prioridad,
    activo,
    usuarioId,
    tipo,
  },
) {
  const result = await query(
    `
    UPDATE anuncios
    SET
      titulo = ?,
      descripcion = ?,
      imagen = ?,
      fecha_inicio = ?,
      fecha_fin = ?,
      hora_inicio = ?,
      hora_fin = ?,
      prioridad = ?,
      activo = ?,
      usuario_id = ?,
      tipo = ?,
      updated_at = NOW()
    WHERE id = ?
    `,
    [
      titulo,
      descripcion,
      imagen,
      fechaInicio,
      fechaFin,
      horaInicio,
      horaFin,
      prioridad,
      activo,
      usuarioId,
      tipo,
      announcementId,
    ],
  );

  return result.affectedRows;
}

async function softDeleteAnnouncement(announcementId, usuarioId) {
  const result = await query(
    `
    UPDATE anuncios
    SET activo = 0, usuario_id = ?, updated_at = NOW()
    WHERE id = ?
    `,
    [usuarioId, announcementId],
  );

  return result.affectedRows;
}

module.exports = {
  listCurrentAnnouncements,
  listAnnouncementsHistory,
  findAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  softDeleteAnnouncement,
};
