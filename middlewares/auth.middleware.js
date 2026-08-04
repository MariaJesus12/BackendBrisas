const { env } = require("../config/env");
const { findActiveUserById, updateLastActivity } = require("../models/user.model");
const { verifyAccessToken } = require("../utils/jwt");

function getBearerToken(authorizationHeader) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/);
  if (!scheme || !token) {
    return null;
  }

  if (scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

async function requireAuth(req, res, next) {
  try {
    const token =
      getBearerToken(req.headers.authorization) ||
      req.headers["x-access-token"] ||
      req.headers["x-auth-token"];

    if (!token) {
      res.status(401).json({
        message: "Token no proporcionado",
        hint: "Envia Authorization: Bearer <token>",
      });
      return;
    }

    const payload = verifyAccessToken(token);
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) {
      res.status(401).json({ message: "Token invalido" });
      return;
    }

    const user = await findActiveUserById(userId);
    if (!user) {
      res.status(401).json({ message: "Usuario no autorizado" });
      return;
    }

    const lastActivity = user.ultimoLogin ? new Date(user.ultimoLogin).getTime() : 0;
    const inactivityMs = env.inactivityHours * 60 * 60 * 1000;

    if (!lastActivity || Date.now() - lastActivity > inactivityMs) {
      res.status(401).json({ message: "Sesion expirada por inactividad" });
      return;
    }

    await updateLastActivity(user.id);

    req.authUser = {
      id: user.id,
      nombre: user.nombre,
      usuario: user.usuario,
      rolId: user.rolId,
      rolNombre: user.rolNombre,
    };

    next();
  } catch (_error) {
    res.status(401).json({ message: "Token invalido o expirado" });
  }
}

function normalizeRoleName(roleName) {
  const raw = String(roleName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  const cleaned = raw.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const aliases = {
    ADMIN: ["ADMIN", "ADMINISTRADOR", "ADMINISTRACION", "ADMINISTRATIVO"],
    MESERO: ["MESERO", "MESEROS"],
    CAJERO: ["CAJERO", "CAJEROS"],
  };

  for (const [canonical, values] of Object.entries(aliases)) {
    if (values.includes(cleaned)) {
      return canonical;
    }
  }

  return cleaned;
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const normalizedUserRole = normalizeRoleName(req.authUser.rolNombre);
    const normalizedAllowedRoles = allowedRoles.map(normalizeRoleName);

    if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
      res.status(403).json({ message: "No autorizado para este recurso" });
      return;
    }

    req.authUser.rolNombre = normalizedUserRole;
    next();
  };
}

module.exports = {
  requireAuth,
  requireRoles,
};
