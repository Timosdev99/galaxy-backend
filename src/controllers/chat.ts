import { Request, Response } from "express";
import ChatModel from "../models/chat";
import OrderModel from "../models/order";
import multer from "multer";
import { Types } from "mongoose";

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 3
  }
});

const validateOrderAccess = async (orderId: string, userId: string, role: string) => {
  const order = await OrderModel.findById(orderId);
  if (!order) throw new Error("Order not found");
  if ( order.customerId.toString() !== userId) {
    throw new Error("Unauthorized access to this order");
  }
  return order;
};

const createMessage = (
  sender: "admin" | "user" | "system",
  content: string,
  attachments?: Array<{
    data: Buffer;
    contentType: string;
    filename: string;
    size: number;
  }>
) => ({
  sender,
  content,
  timestamp: new Date(),
  read: false,
  ...(attachments ? { attachments } : {})
});

// Updated to ensure proper Express handler signature
export const sendMessageWithAttachment = [
  upload.array('attachments'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderId, content } = req.body;
      const files = req.files as Express.Multer.File[];
      
      if (!orderId) {
        res.status(400).json({ message: "Order ID is required" });
        return;
      }

      const order = await validateOrderAccess(orderId, req.user.id, req.user.role);
      let chat = await ChatModel.findOne({ orderId }) || new ChatModel({
        orderId,
        customerId: order.customerId,
        messages: []
      });

      const attachments = files?.map(file => ({
        data: file.buffer,
        contentType: file.mimetype,
        filename: file.originalname,
        size: file.size
      }));

      const sender = req.user.role === "admin" ? "admin" : "user" as const;
      const newMessage = createMessage(sender, content || "", attachments);

      chat.messages.push(newMessage);
      await chat.save();

      const io = req.app.get('io');
      io?.to(`order-${orderId}`).emit('new-message', {
        orderId,
        sender: newMessage.sender,
        content: newMessage.content,
        timestamp: newMessage.timestamp,
        messageId: chat.messages[chat.messages.length - 1]._id,
        ...(attachments?.length ? {
          attachments: attachments.map(a => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size
          }))
        } : {})
      });

      res.status(200).json({ message: "Message sent successfully", chat });
    } catch (error) {
      console.error("Error in sendMessageWithAttachment:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to send message" 
      });
    }
  }
];

export const getAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, messageId, attachmentIndex } = req.params;
    
    await validateOrderAccess(orderId, req.user.id, req.user.role);
    const chat = await ChatModel.findOne({ orderId });
    if (!chat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }

    const message = chat.messages.find(m => m._id?.toString() === messageId);
    if (!message?.attachments?.[Number(attachmentIndex)]) {
      res.status(404).json({ message: "Attachment not found" });
      return;
    }

    const attachment = message.attachments[Number(attachmentIndex)];
    res.set({
      'Content-Type': attachment.contentType,
      'Content-Disposition': `inline; filename="${attachment.filename}"`,
      'Content-Length': attachment.size
    }).send(attachment.data);
  } catch (error) {
    console.error("Error in getAttachment:", error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : "Failed to retrieve attachment" 
    });
  }
};

export const getChatByOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    if (!orderId) {
      res.status(400).json({ message: "Order ID is required" });
      return;
    }

    const order = await validateOrderAccess(orderId, req.user.id, req.user.role);
    const chat = await ChatModel.findOne({ orderId })
      .slice('messages', [-(Number(page) * Number(limit)), Number(limit)]);

    if (!chat) {
      res.status(404).json({ message: "Chat not found for this order" });
      return;
    }

    res.status(200).json({
      chat,
      order: {
        orderNumber: order.orderNumber,
        status: order.status
      }
    });
  } catch (error) {
    console.error("Error in getChatByOrder:", error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : "Failed to get chat" 
    });
  }
};

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, content } = req.body;
    if (!orderId || !content) {
      res.status(400).json({ message: "Order ID and message content are required" });
      return;
    }

    const order = await validateOrderAccess(orderId, req.user.id, req.user.role);
    let chat = await ChatModel.findOne({ orderId }) || new ChatModel({
      orderId,
      customerId: order.customerId,
      messages: []
    });

    if (req.user.role === "admin" && !chat.adminId) {
      chat.adminId = req.user.id;
    }

    const sender = req.user.role === "admin" ? "admin" : "user" as const;
    const newMessage = createMessage(sender, content);

    chat.messages.push(newMessage);
    await chat.save();

    const io = req.app.get('io');
    io?.to(`order-${orderId}`).emit('new-message', {
      orderId,
      sender: newMessage.sender,
      content: newMessage.content,
      timestamp: newMessage.timestamp,
      messageId: chat.messages[chat.messages.length - 1]._id
    });

    res.status(200).json({ message: "Message sent successfully", chat });
  } catch (error) {
    console.error("Error in sendMessage:", error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : "Failed to send message" 
    });
  }
};

export const getCustomerChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const chats = await ChatModel.find({ customerId: req.user.id })
      .sort({ updatedAt: -1 })
      .populate('adminId', 'name email');
    res.status(200).json({ chats });
  } catch (error) {
    console.error("Error in getCustomerChats:", error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : "Failed to get chats" 
    });
  }
};

export const getAdminChats = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user.role !== "admin") {
      res.status(403).json({ message: "Unauthorized" });
      return;
    }

    const chats = await ChatModel.find()
      .sort({ updatedAt: -1 })
      .populate('customerId', 'name email');
    res.status(200).json({ chats });
  } catch (error) {
    console.error("Error in getAdminChats:", error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : "Failed to get chats" 
    });
  }
};

export const markMessagesAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      res.status(400).json({ message: "Order ID is required" });
      return;
    }

    await validateOrderAccess(orderId, req.user.id, req.user.role);
    const chat = await ChatModel.findOne({ orderId });
    if (!chat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }

    const senderType = req.user.role === "admin" ? "user" : "admin";
    chat.messages.forEach(msg => {
      if (msg.sender === senderType) msg.read = true;
    });

    await chat.save();

    const io = req.app.get('io');
    io?.to(`order-${orderId}`).emit('messages-read', {
      orderId,
      readerId: req.user.id,
      readerRole: req.user.role
    });

    res.status(200).json({ message: "Messages marked as read", chat });
  } catch (error) {
    console.error("Error in markMessagesAsRead:", error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : "Failed to mark messages as read" 
    });
  }
};