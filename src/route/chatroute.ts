

// src/routes/chat.ts
import express from "express";
import { 
  startChat, 
  adminReply, 
  getUserChats, 
  getAdminChats,
  getChatById,
  closeChat,
  reopenChat
} from "../controllers/chat";
import { authToken } from "../middlewares/auth";


const router = express.Router();

router.post("/start",authToken,   startChat);
router.post("/reply", authToken, adminReply);
router.get("/user", authToken, getUserChats);
router.get("/admin", authToken, getAdminChats);
router.get("/:chatId", authToken, getChatById);
router.patch("/:chatId/close", authToken, closeChat);
router.patch("/:chatId/reopen", authToken, reopenChat);

export default router;