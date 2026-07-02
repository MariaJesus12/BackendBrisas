const express = require("express");

const { login, logout, me } = require("../controllers/auth.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const authRouter = express.Router();

authRouter.post("/login", login);
authRouter.post("/logout", requireAuth, logout);
authRouter.get("/me", requireAuth, me);

module.exports = authRouter;
