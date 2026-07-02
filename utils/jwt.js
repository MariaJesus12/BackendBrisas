const jwt = require("jsonwebtoken");

const { env } = require("../config/env");

function signAccessToken(payload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, env.jwtSecret);

  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Token invalido");
  }

  const sub = Number(decoded.sub);
  const usuario = decoded.usuario;
  const rolId = Number(decoded.rolId);
  const rolNombre = decoded.rolNombre;

  if (!Number.isFinite(sub) || typeof usuario !== "string" || !Number.isFinite(rolId) || typeof rolNombre !== "string") {
    throw new Error("Token invalido");
  }

  return {
    sub,
    usuario,
    rolId,
    rolNombre,
  };
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
