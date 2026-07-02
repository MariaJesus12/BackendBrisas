const express = require("express");

const { createUserHandler, listUsersHandler } = require("../controllers/user.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const userRouter = express.Router();

userRouter.get("/", requireAuth, requireRoles("ADMIN"), listUsersHandler);
userRouter.post("/", requireAuth, requireRoles("ADMIN"), createUserHandler);

module.exports = userRouter;
