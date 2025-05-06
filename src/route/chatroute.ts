import express from "express";
import { 
  getChatByOrder,
  getChatById, 
  sendMessage, 
  sendMessageWithAttachment,
  sendMessageToChatById,
  getCustomerChats, 
  getAdminChats,
  markMessagesAsRead, 
  getAttachment,
  createGeneralChat
} from "../controllers/chat"; 
import { authToken } from "../middlewares/auth";
import { Admin } from '../middlewares/rbac';

const router = express.Router();


// User and admin chat listing
router.get("/list", authToken, getCustomerChats);
router.get("/admin", authToken, Admin, getAdminChats);

// General chat routes (independent of orders)
router.post("/create", authToken, createGeneralChat);
router.get("/:chatId", authToken, getChatById);
router.post("/:chatId/message", authToken, sendMessageToChatById);
router.patch("/:chatId/read", authToken, markMessagesAsRead);
router.get("/:chatId/messages/:messageId/attachments/:attachmentIndex", authToken, getAttachment);



// Legacy order-based chat routes
router.get("/order/:orderId", authToken, getChatByOrder);
router.post("/send", authToken, sendMessage);
router.post("/send-with-attachment", authToken, sendMessageWithAttachment);
router.patch("/read/:orderId", authToken, markMessagesAsRead);
router.get(
  "/:orderId/messages/:messageId/attachments/:attachmentIndex", 
  authToken, 
  getAttachment
);

export default router;