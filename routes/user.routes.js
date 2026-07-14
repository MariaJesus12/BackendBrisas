const express = require("express");

const {
	createUserHandler,
	deleteUserHandler,
	listUsersHandler,
	updateUserHandler,
} = require("../controllers/user.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const userRouter = express.Router();

userRouter.get("/", requireAuth, requireRoles("ADMIN"), listUsersHandler);
userRouter.post("/", requireAuth, requireRoles("ADMIN"), createUserHandler);
userRouter.put("/:id", requireAuth, requireRoles("ADMIN"), updateUserHandler);
userRouter.delete("/:id", requireAuth, requireRoles("ADMIN"), deleteUserHandler);

module.exports = userRouter;
