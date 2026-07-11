const express = require("express");

const {
  createAnnouncementHandler,
  deleteAnnouncementHandler,
  listAnnouncementsHistoryHandler,
  listCurrentAnnouncementsHandler,
  updateAnnouncementHandler,
} = require("../controllers/announcement.controller");
const { requireAuth, requireRoles } = require("../middlewares/auth.middleware");

const announcementRouter = express.Router();

announcementRouter.get("/", listCurrentAnnouncementsHandler);
announcementRouter.get("/history", requireAuth, requireRoles("ADMIN"), listAnnouncementsHistoryHandler);
announcementRouter.post("/", requireAuth, requireRoles("ADMIN"), createAnnouncementHandler);
announcementRouter.put("/:id", requireAuth, requireRoles("ADMIN"), updateAnnouncementHandler);
announcementRouter.delete("/:id", requireAuth, requireRoles("ADMIN"), deleteAnnouncementHandler);

module.exports = announcementRouter;
