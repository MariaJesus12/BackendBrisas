const {
  createConfiguracionRestaurante,
  findConfiguracionRestauranteById,
  findLatestConfiguracionRestaurante,
  listConfiguracionesRestaurante,
  updateConfiguracionRestaurante,
} = require("../models/configuracion-restaurante.model");

const WHATSAPP_BASE_URL = "https://wa.me/";

function parseDateTimeInput(value) {
  if (value == null || value === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toMySqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function normalizeUrlValue(value) {
  if (value == null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeWhatsappValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  return `${WHATSAPP_BASE_URL}${digits}`;
}

function parseConfigInput(body, existing = null) {
  const hasNombre = Object.prototype.hasOwnProperty.call(body, "nombre");
  const hasTelefono = Object.prototype.hasOwnProperty.call(body, "telefono");
  const hasWhatsapp = Object.prototype.hasOwnProperty.call(body, "whatsapp");
  const hasInstagramUrl =
    Object.prototype.hasOwnProperty.call(body, "instagramUrl") ||
    Object.prototype.hasOwnProperty.call(body, "instagram_url");
  const hasFacebookUrl =
    Object.prototype.hasOwnProperty.call(body, "facebookUrl") ||
    Object.prototype.hasOwnProperty.call(body, "facebook_url");
  const hasTripadvisorUrl =
    Object.prototype.hasOwnProperty.call(body, "tripadvisorUrl") ||
    Object.prototype.hasOwnProperty.call(body, "tripadvisor_url");
  const hasGoogleMapsUrl =
    Object.prototype.hasOwnProperty.call(body, "googleMapsUrl") ||
    Object.prototype.hasOwnProperty.call(body, "google_maps_url");
  const hasDireccion = Object.prototype.hasOwnProperty.call(body, "direccion");
  const hasHorario = Object.prototype.hasOwnProperty.call(body, "horario");
  const hasCreatedAt =
    Object.prototype.hasOwnProperty.call(body, "createdAt") ||
    Object.prototype.hasOwnProperty.call(body, "created_at");

  const createdRaw = Object.prototype.hasOwnProperty.call(body, "createdAt") ? body.createdAt : body.created_at;

  return {
    nombre: hasNombre
      ? String(body.nombre || "").trim()
      : existing
        ? String(existing.nombre || "").trim()
        : "",
    telefono: hasTelefono
      ? String(body.telefono || "").trim()
      : existing
        ? String(existing.telefono || "").trim()
        : "",
    whatsapp: hasWhatsapp
      ? normalizeWhatsappValue(body.whatsapp)
      : existing
        ? normalizeWhatsappValue(existing.whatsapp)
        : "",
    instagramUrl: hasInstagramUrl
      ? normalizeUrlValue(Object.prototype.hasOwnProperty.call(body, "instagramUrl") ? body.instagramUrl : body.instagram_url)
      : existing
        ? normalizeUrlValue(existing.instagramUrl)
        : null,
    facebookUrl: hasFacebookUrl
      ? normalizeUrlValue(Object.prototype.hasOwnProperty.call(body, "facebookUrl") ? body.facebookUrl : body.facebook_url)
      : existing
        ? normalizeUrlValue(existing.facebookUrl)
        : null,
    tripadvisorUrl: hasTripadvisorUrl
      ? normalizeUrlValue(
          Object.prototype.hasOwnProperty.call(body, "tripadvisorUrl") ? body.tripadvisorUrl : body.tripadvisor_url,
        )
      : existing
        ? normalizeUrlValue(existing.tripadvisorUrl)
        : null,
    googleMapsUrl: hasGoogleMapsUrl
      ? normalizeUrlValue(Object.prototype.hasOwnProperty.call(body, "googleMapsUrl") ? body.googleMapsUrl : body.google_maps_url)
      : existing
        ? normalizeUrlValue(existing.googleMapsUrl)
        : null,
    direccion: hasDireccion
      ? String(body.direccion || "").trim()
      : existing
        ? String(existing.direccion || "").trim()
        : "",
    horario: hasHorario
      ? String(body.horario || "").trim()
      : existing
        ? String(existing.horario || "").trim()
        : "",
    createdAt: hasCreatedAt
      ? parseDateTimeInput(createdRaw)
      : existing
        ? parseDateTimeInput(existing.createdAt)
        : new Date(),
  };
}

function validateConfigInput(input, { forCreate = false } = {}) {
  const missingFields = [];

  if (!input.telefono) missingFields.push("telefono");
  if (!input.whatsapp) missingFields.push("whatsapp");
  if (!input.direccion) missingFields.push("direccion");
  if (!input.horario) missingFields.push("horario");

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      payload: {
        message: "Faltan campos requeridos o son invalidos",
        missingFields,
        acceptedAliases: {
          createdAt: ["createdAt", "created_at"],
          instagramUrl: ["instagramUrl", "instagram_url"],
          facebookUrl: ["facebookUrl", "facebook_url"],
          tripadvisorUrl: ["tripadvisorUrl", "tripadvisor_url"],
          googleMapsUrl: ["googleMapsUrl", "google_maps_url"],
        },
      },
    };
  }

  if (input.nombre && input.nombre.length > 150) {
    return { ok: false, status: 400, payload: { message: "El nombre no puede exceder 150 caracteres" } };
  }

  if (input.telefono.length > 50) {
    return { ok: false, status: 400, payload: { message: "El telefono no puede exceder 50 caracteres" } };
  }

  if (input.whatsapp.length > 50) {
    return { ok: false, status: 400, payload: { message: "El whatsapp no puede exceder 50 caracteres" } };
  }

  if (input.instagramUrl && input.instagramUrl.length > 255) {
    return { ok: false, status: 400, payload: { message: "El enlace de Instagram no puede exceder 255 caracteres" } };
  }

  if (input.facebookUrl && input.facebookUrl.length > 255) {
    return { ok: false, status: 400, payload: { message: "El enlace de Facebook no puede exceder 255 caracteres" } };
  }

  if (input.tripadvisorUrl && input.tripadvisorUrl.length > 255) {
    return { ok: false, status: 400, payload: { message: "El enlace de TripAdvisor no puede exceder 255 caracteres" } };
  }

  if (input.googleMapsUrl && input.googleMapsUrl.length > 500) {
    return { ok: false, status: 400, payload: { message: "El enlace de Google Maps no puede exceder 500 caracteres" } };
  }

  if (input.direccion.length > 65535) {
    return { ok: false, status: 400, payload: { message: "La direccion es demasiado larga" } };
  }

  if (input.horario.length > 65535) {
    return { ok: false, status: 400, payload: { message: "El horario es demasiado largo" } };
  }

  if (!input.createdAt || Number.isNaN(input.createdAt.getTime())) {
    return { ok: false, status: 400, payload: { message: "createdAt invalido" } };
  }

  return { ok: true };
}

async function listConfiguracionesRestauranteHandler(_req, res) {
  const configuraciones = await listConfiguracionesRestaurante();
  res.json({ configuraciones });
}

async function getCurrentConfiguracionRestauranteHandler(_req, res) {
  const configuracion = await findLatestConfiguracionRestaurante();
  if (!configuracion) {
    res.status(404).json({ message: "Configuracion de restaurante no encontrada" });
    return;
  }

  res.json({ configuracion });
}

async function getConfiguracionRestauranteByIdHandler(req, res) {
  const configId = Number(req.params.id);
  if (!Number.isInteger(configId) || configId <= 0) {
    res.status(400).json({ message: "id de configuracion invalido" });
    return;
  }

  const configuracion = await findConfiguracionRestauranteById(configId);
  if (!configuracion) {
    res.status(404).json({ message: "Configuracion de restaurante no encontrada" });
    return;
  }

  res.json({ configuracion });
}

async function createConfiguracionRestauranteHandler(req, res) {
  const input = parseConfigInput(req.body || {});
  const validation = validateConfigInput(input, { forCreate: true });

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  const configId = await createConfiguracionRestaurante({
    ...input,
    createdAt: toMySqlDateTime(input.createdAt),
  });

  const configuracion = await findConfiguracionRestauranteById(configId);

  res.status(201).json({
    message: "Configuracion de restaurante creada exitosamente",
    configuracion,
  });
}

async function updateConfiguracionRestauranteHandler(req, res) {
  const configId = Number(req.params.id);
  if (!Number.isInteger(configId) || configId <= 0) {
    res.status(400).json({ message: "id de configuracion invalido" });
    return;
  }

  const existing = await findConfiguracionRestauranteById(configId);
  if (!existing) {
    res.status(404).json({ message: "Configuracion de restaurante no encontrada" });
    return;
  }

  const input = parseConfigInput(req.body || {}, existing);
  const validation = validateConfigInput(input, { forCreate: false });

  if (!validation.ok) {
    res.status(validation.status).json(validation.payload);
    return;
  }

  await updateConfiguracionRestaurante(configId, {
    ...input,
    createdAt: toMySqlDateTime(input.createdAt),
  });

  const configuracion = await findConfiguracionRestauranteById(configId);

  res.json({
    message: "Configuracion de restaurante actualizada exitosamente",
    configuracion,
  });
}

module.exports = {
  listConfiguracionesRestauranteHandler,
  getCurrentConfiguracionRestauranteHandler,
  getConfiguracionRestauranteByIdHandler,
  createConfiguracionRestauranteHandler,
  updateConfiguracionRestauranteHandler,
};
