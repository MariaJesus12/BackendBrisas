const bcrypt = require("bcrypt");

const { env } = require("../config/env");
const {
  expireSessionByUserId,
  findUserForAuthByUsername,
  updateLastActivity,
} = require("../models/user.model");
const { signAccessToken } = require("../utils/jwt");

function sanitizeUser(user) {
  return {
    id: user.id,
    nombre: user.nombre,
    usuario: user.usuario,
    rolId: user.rolId,
    rolNombre: user.rolNombre,
    activo: user.activo,
  };
}

async function login(req, res) {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    res.status(400).json({ message: "Usuario y password son requeridos" });
    return;
  }

  const user = await findUserForAuthByUsername(usuario);
  if (!user || user.activo !== 1) {
    res.status(401).json({ message: "Credenciales invalidas" });
    return;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    res.status(401).json({ message: "Credenciales invalidas" });
    return;
  }

  await updateLastActivity(user.id);

  const token = signAccessToken({
    sub: user.id,
    usuario: user.usuario,
    rolId: user.rol_id,
    rolNombre: user.rol_nombre,
  });

  res.json({
    message: "Login exitoso",
    token,
    session: {
      inactivityHours: env.inactivityHours,
    },
    user: sanitizeUser({
      id: user.id,
      nombre: user.nombre,
      usuario: user.usuario,
      rolId: user.rol_id,
      rolNombre: user.rol_nombre,
      activo: user.activo === 1,
      ultimoLogin: user.ultimo_login,
    }),
  });
}

async function logout(req, res) {
  const authUser = req.authUser;

  if (!authUser) {
    res.status(401).json({ message: "No autenticado" });
    return;
  }

  await expireSessionByUserId(authUser.id, env.inactivityHours);

  res.json({ message: "Logout exitoso" });
}

function me(req, res) {
  if (!req.authUser) {
    res.status(401).json({ message: "No autenticado" });
    return;
  }

  res.json({ user: req.authUser });
}

module.exports = {
  login,
  logout,
  me,
};
