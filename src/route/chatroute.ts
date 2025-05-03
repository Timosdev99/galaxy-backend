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


router.get("/customer",  getCustomerChats);


router.get("/admin",  getAdminChats);


router.get("/order/:orderId",  getChatByOrder);
router.post("/send",  sendMessage);
router.patch("/read/:orderId",  markMessagesAsRead);
router.get(
  "/:orderId/messages/:messageId/attachments/:attachmentIndex", 
  
  getAttachment
);

export default router;