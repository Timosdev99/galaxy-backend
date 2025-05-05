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

const router = express.Router();

// General chat routes (independent of orders)
router.post("/create",  createGeneralChat);
router.get("/:chatId",  getChatById);
router.post("/:chatId/message",  sendMessageToChatById);
router.patch("/:chatId/read",  markMessagesAsRead);
router.get("/:chatId/messages/:messageId/attachments/:attachmentIndex",  getAttachment);

// User and admin chat listing
router.get("/customer",  getCustomerChats);
router.get("/admin",  getAdminChats);

// Legacy order-based chat routes
router.get("/order/:orderId",  getChatByOrder);
router.post("/send",  sendMessage);
router.post("/send-with-attachment",  sendMessageWithAttachment);
router.patch("/read/:orderId",  markMessagesAsRead);
router.get(
  "/:orderId/messages/:messageId/attachments/:attachmentIndex", 
   
  getAttachment
);

export default router;