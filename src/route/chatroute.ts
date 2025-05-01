import express from "express";
import { 
  startChat, 
  adminReply, 
  getUserChats, 
  getAdminChats,
  getChatById,
  closeChat,
  reopenChat,
  getUnreadCounts
} from "../controllers/chat";
import { authToken } from "../middlewares/auth";

const router = express.Router();

// Message operations
router.post("/start", authToken, startChat);
router.post("/reply", authToken, adminReply);

// Chat retrieval
router.get("/user", authToken, getUserChats);
router.get("/admin", authToken, getAdminChats);
router.get("/unread", authToken, getUnreadCounts);
router.get("/:chatId", authToken, getChatById);

// Chat status management
router.patch("/:chatId/close", authToken, closeChat);
router.patch("/:chatId/reopen", authToken, reopenChat);

export default router;