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

router.post("/start", startChat);
router.post("/reply", adminReply);
router.get("/user",  getUserChats);
router.get("/admin",  getAdminChats);
router.get("/:chatId",  getChatById);
router.patch("/:chatId/close",  closeChat);
router.patch("/:chatId/reopen",  reopenChat);

export default router;