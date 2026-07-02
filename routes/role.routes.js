const express = require("express");

const { getRoles } = require("../controllers/role.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const roleRouter = express.Router();

roleRouter.get("/", requireAuth, getRoles);

module.exports = roleRouter;
