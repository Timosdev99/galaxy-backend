
import { Request, Response } from "express";
import ChatModel from "../models/chat";
import OrderModel from "../models/order";
import { usermodel } from "../models/user";
import multer from "multer";

const storage = multer.memoryStorage()
const upload = multer({storage})

export const sendMessageWithAttachment = [
  upload.array('attachments', 3), // Max 3 files
  async (req: Request, res: Response) => {
    try {
      const { orderId, content } = req.body;
      const files = req.files as Express.Multer.File[];
      
      // Validate inputs
      if (!orderId) {
        return res.status(400).json({ message: "Order ID is required" });
      }

      // Find or create chat
      let chat = await ChatModel.findOne({ orderId });
      if (!chat) {
        chat = new ChatModel({
          orderId,
          customerId: (await OrderModel.findById(orderId))?.customerId,
          messages: []
        });
      }

      // Process attachments
      const attachments = files?.map(file => ({
        data: file.buffer,
        contentType: file.mimetype,
        filename: file.originalname,
        size: file.size
      }));

      // Add message
      chat.messages.push({
        sender: req.user.role === "admin" ? "admin" : "user",
        content,
        timestamp: new Date(),
        read: false,
        attachments: attachments?.length ? attachments : undefined,
        _id: undefined
      });

      await chat.save();

      // Emit socket event
      const io = req.app.get('io');
      if (io) {
        io.to(`order-${orderId}`).emit('new-message', {
          orderId,
          sender: req.user.role === "admin" ? "admin" : "user",
          content,
          attachments: attachments?.map(a => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size
          })),
          timestamp: new Date()
        });
      }

      res.status(200).json({
        message: "Message sent successfully",
        chat
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to send message" });
    }
  }
];

// Add this helper to retrieve file data
export const getAttachment = async (req: Request, res: Response) => {
  try {
    const { orderId, messageId, attachmentIndex } = req.params;
    
    const chat = await ChatModel.findOne({ orderId });
    if (!chat) {
     res.status(404).json({ message: "Chat not found" });
     return
    }

    const message = chat.messages.find(m => m._id.toString() === messageId);
    if (!message || !message.attachments || !message.attachments[Number(attachmentIndex)]) {
      res.status(404).json({ message: "Attachment not found" });
      return
    }

    const attachment = message.attachments[Number(attachmentIndex)];
    
    res.set('Content-Type', attachment.contentType);
    res.set('Content-Disposition', `inline; filename="${attachment.filename}"`);
    res.send(attachment.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to retrieve attachment" });
  }
};


export const getChatByOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      res.status(400).json({ message: "Order ID is required" });
      return;
    }

    // Verify the user has access to this chat
    const order = await OrderModel.findById(orderId);
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    // Check if user is customer or admin
    if ( order.customerId !== req.user.id) {
      res.status(403).json({ message: "Unauthorized to access this chat" });
      return;
    }

    const chat = await ChatModel.findOne({ orderId });
    
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
    console.error(error);
    res.status(500).json({ message: "Failed to get chat" });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { orderId, content } = req.body;
    
    if (!orderId || !content) {
      res.status(400).json({ message: "Order ID and message content are required" });
      return;
    }

    // Verify the user has access to this chat
    const order = await OrderModel.findById(orderId);
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    // Check if user is customer or admin
    if ( order.customerId !== req.user.id) {
      res.status(403).json({ message: "Unauthorized to send message in this chat" });
      return;
    }

    // Find or create chat
    let chat = await ChatModel.findOne({ orderId });
    if (!chat) {
      chat = new ChatModel({
        orderId,
        customerId: order.customerId,
        messages: []
      });
    }

    // Assign admin to chat if it's an admin messaging first
    if (req.user.role === "admin" && !chat.adminId) {
      chat.adminId = req.user._id.toString();
    }

    // Add message
    chat.messages.push({
      sender: req.user.role === "admin" ? "admin" : "user",
      content,
      timestamp: new Date(),
      read: false,
      _id: undefined
    });

    await chat.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`order-${orderId}`).emit('new-message', {
        orderId,
        sender: req.user.role === "admin" ? "admin" : "user",
        content,
        timestamp: new Date()
      });
    }

    res.status(200).json({
      message: "Message sent successfully",
      chat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to send message" });
  }
};

export const getCustomerChats = async (req: Request, res: Response) => {
  try {
    const chats = await ChatModel.find({ customerId: req.user._id })
      .sort({ updatedAt: -1 })
      .populate('adminId', 'name email');

    res.status(200).json({
      chats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to get chats" });
  }
};

export const getAdminChats = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== "admin") {
      res.status(403).json({ message: "Unauthorized" });
      return;
    }

    const chats = await ChatModel.find()
      .sort({ updatedAt: -1 })
      .populate('customerId', 'name email');

    res.status(200).json({
      chats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to get chats" });
  }
};

export const markMessagesAsRead = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      res.status(400).json({ message: "Order ID is required" });
      return;
    }

    const chat = await ChatModel.findOne({ orderId });
    if (!chat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }

    // Mark all messages from the other party as read
    const senderType = req.user.role === "admin" ? "user" : "admin";
    chat.messages.forEach(message => {
      if (message.sender === senderType) {
        message.read = true;
      }
    });

    await chat.save();

    res.status(200).json({
      message: "Messages marked as read",
      chat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to mark messages as read" });
  }
};