const { listRoles } = require("../models/role.model");

async function getRoles(_req, res) {
  const roles = await listRoles();
  res.json({ roles });
}

module.exports = {
  getRoles,
};
