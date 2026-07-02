const bcrypt = require("bcrypt");

const { env } = require("../config/env");
const { findRoleById } = require("../models/role.model");
const { createUser, findUserById, findUserByUsername, listUsersWithRoles } = require("../models/user.model");

async function listUsersHandler(_req, res) {
  const users = await listUsersWithRoles();
  res.json({ users });
}

async function createUserHandler(req, res) {
  const body = req.body || {};
  const nombre = body.nombre;
  const usuario = body.usuario ?? body.username;
  const password = body.password ?? body.contrasena ?? body.clave;
  const rolId = body.rolId ?? body.rol_id ?? body.roleId;
  const activo = body.activo ?? body.estado;

  const missingFields = [];
  if (!nombre) missingFields.push("nombre");
  if (!usuario) missingFields.push("usuario");
  if (!password) missingFields.push("password");
  if (!rolId) missingFields.push("rolId");

  if (missingFields.length > 0) {
    res.status(400).json({
      message: "Faltan campos requeridos",
      missingFields,
      acceptedAliases: {
        usuario: ["usuario", "username"],
        password: ["password", "contrasena", "clave"],
        rolId: ["rolId", "rol_id", "roleId"],
        activo: ["activo", "estado"],
      },
    });
    return;
  }

  const normalizedUsuario = String(usuario).trim();
  if (normalizedUsuario.length < 3) {
    res.status(400).json({ message: "El usuario debe tener al menos 3 caracteres" });
    return;
  }

  if (String(password).length < 6) {
    res.status(400).json({ message: "La password debe tener al menos 6 caracteres" });
    return;
  }

  const existingUser = await findUserByUsername(normalizedUsuario);
  if (existingUser) {
    res.status(409).json({ message: "El usuario ya existe" });
    return;
  }

  const role = await findRoleById(Number(rolId));
  if (!role) {
    res.status(400).json({ message: "rolId invalido", received: rolId });
    return;
  }

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const userId = await createUser({
    nombre: String(nombre).trim(),
    usuario: normalizedUsuario,
    passwordHash,
    rolId: Number(rolId),
    activo: activo === 0 || activo === false ? 0 : 1,
  });

  const createdUser = await findUserById(userId);

  if (!createdUser) {
    res.status(500).json({ message: "Usuario creado, pero no se pudo recuperar" });
    return;
  }

  res.status(201).json({
    message: "Usuario creado exitosamente",
    user: {
      id: createdUser.id,
      nombre: createdUser.nombre,
      usuario: createdUser.usuario,
      rolId: createdUser.rolId,
      rolNombre: createdUser.rolNombre,
      activo: createdUser.activo,
    },
    session: {
      inactivityHours: env.inactivityHours,
    },
  });
}

module.exports = {
  listUsersHandler,
  createUserHandler,
};
