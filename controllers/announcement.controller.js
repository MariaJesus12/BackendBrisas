const {
  createAnnouncement,
  findAnnouncementById,
  listAnnouncementsHistory,
  listCurrentAnnouncements,
  softDeleteAnnouncement,
  updateAnnouncement,
} = require("../models/announcement.model");

const VALID_TYPES = new Set(["PROMOCION", "EVENTO", "INFORMATIVO", "PLATO_DEL_DIA"]);

function normalizeType(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function parseAnnouncementInput(body, usuarioId) {
  const rawHoraInicio = String(body.horaInicio ?? body.hora_inicio ?? "").trim();
  const rawHoraFin = String(body.horaFin ?? body.hora_fin ?? "").trim();

  return {
    titulo: String(body.titulo || "").trim(),
    descripcion: body.descripcion == null ? null : String(body.descripcion).trim(),
    imagen: body.imagen == null ? null : String(body.imagen).trim(),
    fechaInicio: String(body.fechaInicio ?? body.fecha_inicio ?? "").trim(),
    fechaFin: String(body.fechaFin ?? body.fecha_fin ?? "").trim(),
    horaInicio: rawHoraInicio || "00:00:00",
    horaFin: rawHoraFin || "23:59:59",
    prioridad: Number(body.prioridad),
    activo: body.activo === 0 || body.activo === false ? 0 : 1,
    usuarioId,
    tipo: normalizeType(body.tipo ?? body.tipoenum),
  };
}

function isValidDateString(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function isValidTimeString(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(value);
}

function normalizeTime(value) {
  return value.length === 5 ? `${value}:00` : value;
}

function validateAnnouncementInput(input) {
  const missingFields = [];

  if (!input.titulo) missingFields.push("titulo");
  if (!isValidDateString(input.fechaInicio)) missingFields.push("fechaInicio");
  if (!isValidDateString(input.fechaFin)) missingFields.push("fechaFin");
  if (!isValidTimeString(input.horaInicio)) missingFields.push("horaInicio");
  if (!isValidTimeString(input.horaFin)) missingFields.push("horaFin");
  if (!Number.isInteger(input.prioridad)) missingFields.push("prioridad");
  if (!VALID_TYPES.has(input.tipo)) missingFields.push("tipo");

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          fechaInicio: ["fechaInicio", "fecha_inicio"],
          fechaFin: ["fechaFin", "fecha_fin"],
          horaInicio: ["horaInicio", "hora_inicio"],
          horaFin: ["horaFin", "hora_fin"],
          tipo: ["tipo", "tipoenum"],
        },
        allowedTypes: Array.from(VALID_TYPES),
      },
    };
  }

  if (input.titulo.length > 200) {
    return {
      ok: false,
      status: 400,
      payload: { message: "El titulo no puede exceder 200 caracteres" },
    };
  }

  if (input.imagen && input.imagen.length > 255) {
    return {
      ok: false,
      status: 400,
      payload: { message: "La URL de imagen no puede exceder 255 caracteres" },
    };
  }

  if (input.prioridad < 0) {
    return {
      ok: false,
      status: 400,
      payload: { message: "La prioridad no puede ser negativa" },
    };
  }

  const fechaInicio = normalizeDate(input.fechaInicio);
  const fechaFin = normalizeDate(input.fechaFin);
  const horaInicio = normalizeTime(input.horaInicio);
  const horaFin = normalizeTime(input.horaFin);

  if (fechaFin < fechaInicio) {
    return {
      ok: false,
      status: 400,
      payload: { message: "fechaFin no puede ser menor que fechaInicio" },
    };
  }

  if (fechaInicio === fechaFin && horaFin < horaInicio) {
    return {
      ok: false,
      status: 400,
      payload: { message: "horaFin no puede ser menor que horaInicio cuando la fecha es la misma" },
    };
  }

  return {
    ok: true,
    value: {
      ...input,
      fechaInicio,
      fechaFin,
      horaInicio,
      horaFin,
    },
  };
}

async function listCurrentAnnouncementsHandler(_req, res) {
  const announcements = await listCurrentAnnouncements();
  res.json({ announcements });
}

async function listAnnouncementsHistoryHandler(_req, res) {
  const announcements = await listAnnouncementsHistory();
  res.json({ announcements });
}

async function createAnnouncementHandler(req, res) {
  const input = parseAnnouncementInput(req.body || {}, req.authUser.id);
  const validation = validateAnnouncementInput(input);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const announcementId = await createAnnouncement(validation.value);
  const announcement = await findAnnouncementById(announcementId);

  res.status(201).json({
    message: "Anuncio creado exitosamente",
    announcement,
  });
}

async function updateAnnouncementHandler(req, res) {
  const announcementId = Number(req.params.id);
  if (!Number.isInteger(announcementId) || announcementId <= 0) {
    res.status(400).json({ message: "id de anuncio invalido" });
    return;
  }

  const existingAnnouncement = await findAnnouncementById(announcementId);
  if (!existingAnnouncement) {
    res.status(404).json({ message: "Anuncio no encontrado" });
    return;
  }

  const input = parseAnnouncementInput(req.body || {}, req.authUser.id);
  const validation = validateAnnouncementInput(input);

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  await updateAnnouncement(announcementId, validation.value);
  const announcement = await findAnnouncementById(announcementId);

  res.json({
    message: "Anuncio actualizado exitosamente",
    announcement,
  });
}

async function deleteAnnouncementHandler(req, res) {
  const announcementId = Number(req.params.id);
  if (!Number.isInteger(announcementId) || announcementId <= 0) {
    res.status(400).json({ message: "id de anuncio invalido" });
    return;
  }

  const existingAnnouncement = await findAnnouncementById(announcementId);
  if (!existingAnnouncement) {
    res.status(404).json({ message: "Anuncio no encontrado" });
    return;
  }

  await softDeleteAnnouncement(announcementId, req.authUser.id);
  const announcement = await findAnnouncementById(announcementId);

  res.json({
    message: "Anuncio desactivado exitosamente",
    announcement,
  });
}

module.exports = {
  listCurrentAnnouncementsHandler,
  listAnnouncementsHistoryHandler,
  createAnnouncementHandler,
  updateAnnouncementHandler,
  deleteAnnouncementHandler,
};
