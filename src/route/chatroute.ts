import express from "express";
import { 
  getChatByOrder, 
  sendMessage, 
  getCustomerChats, 
  getAdminChats,
  markMessagesAsRead, 
  getAttachment
} from "../controllers/chat";
import { authToken } from "../middlewares/auth";

const router = express.Router();


router.get("/customer", authToken, getCustomerChats);


router.get("/admin", authToken, getAdminChats);


router.get("/order/:orderId", authToken, getChatByOrder);
router.post("/send", authToken, sendMessage);
router.patch("/read/:orderId", authToken, markMessagesAsRead);
router.get(
  "/:orderId/messages/:messageId/attachments/:attachmentIndex", 
  authToken, 
  getAttachment
);

export default router;