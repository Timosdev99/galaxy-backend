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
  if (order.customerId.toString() !== userId) {
    throw new Error("Unauthorized access to this order");
  }
  return order;
};

const validateChatAccess = async (chatId: string, userId: string, role: string) => {
  const chat = await ChatModel.findById(chatId);
  if (!chat) throw new Error("Chat not found");
  
  if (role === "admin" || chat.customerId === userId) {
    return chat;
  }
  
  throw new Error("Unauthorized access to this chat");
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

// Create a new general chat (non-order related)
export const createGeneralChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subject, message } = req.body;
    
    if (!message) {
      res.status(400).json({ message: "Initial message is required" });
      return;
    }

    const newChat = new ChatModel({
      customerId: req.user.id,
      subject: subject || "General Inquiry",
      isOrderChat: false,
      messages: [createMessage("user", message)]
    });

    await newChat.save();

    // Notify admins about new chat
    const io = req.app.get('io');
    io?.to('admin-room').emit('new-chat', {
      chatId: newChat._id,
      customerId: newChat.customerId,
      subject: newChat.subject,
      timestamp: new Date()
    });

    res.status(201).json({ 
      message: "Chat created successfully", 
      chat: newChat 
    });
  } catch (error) {
    console.error("Error in createGeneralChat:", error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : "Failed to create chat" 
    });
  }
};

// Get chat by ID (for both order and general chats)
export const getChatById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    if (!chatId) {
      res.status(400).json({ message: "Chat ID is required" });
      return;
    }

    const chat = await validateChatAccess(chatId, req.user.id, req.user.role);
    
    // Paginate messages
    const paginatedChat = await ChatModel.findById(chatId)
      .slice('messages', [-(Number(page) * Number(limit)), Number(limit)]);

    if (!paginatedChat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }

    const responseData: any = { chat: paginatedChat };
    
    // If it's an order chat, include some order info
    if (chat.isOrderChat && chat.orderId) {
      const order = await OrderModel.findById(chat.orderId);
      if (order) {
        responseData.order = {
          orderNumber: order.orderNumber,
          status: order.status
        };
      }
    }

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error in getChatById:", error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : "Failed to get chat" 
    });
  }
};

// Send message to a chat by ID
export const sendMessageToChatById = [
  upload.array('attachments'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { chatId } = req.params;
      const { content } = req.body;
      const files = req.files as Express.Multer.File[];
      
      if (!chatId) {
        res.status(400).json({ message: "Chat ID is required" });
        return;
      }

      if (!content && (!files || files.length === 0)) {
        res.status(400).json({ message: "Message content or attachments are required" });
        return;
      }

      const chat = await validateChatAccess(chatId, req.user.id, req.user.role);

      const attachments = files?.map(file => ({
        data: file.buffer,
        contentType: file.mimetype,
        filename: file.originalname,
        size: file.size
      }));

      const sender = req.user.role === "admin" ? "admin" : "user" as const;
      const newMessage = createMessage(sender, content || "", attachments);

      // If admin is responding to a chat for the first time, assign them
      if (req.user.role === "admin" && !chat.adminId) {
        chat.adminId = req.user.id;
      }

      chat.messages.push(newMessage);
      await chat.save();

      const io = req.app.get('io');
      const roomName = chat.isOrderChat && chat.orderId ? 
        `order-${chat.orderId}` : `chat-${chat._id}`;

      io?.to(roomName).emit('new-message', {
        chatId: chat._id,
        orderId: chat.orderId,
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
      console.error("Error in sendMessageToChatById:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to send message" 
      });
    }
  }
];

// For backward compatibility - Get chat by order ID
export const getChatByOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    if (!orderId) {
      res.status(400).json({ message: "Order ID is required" });
      return;
    }

    const order = await validateOrderAccess(orderId, req.user.id, req.user.role);
    const chat = await ChatModel.findOne({ orderId, isOrderChat: true })
      .slice('messages', [-(Number(page) * Number(limit)), Number(limit)]);

    if (!chat) {
      // Create a new chat for this order if it doesn't exist
      const newChat = new ChatModel({
        orderId,
        customerId: order.customerId,
        isOrderChat: true,
        messages: []
      });
      await newChat.save();
      
      res.status(200).json({
        chat: newChat,
        order: {
          orderNumber: order.orderNumber,
          status: order.status
        }
      });
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

// For backward compatibility - Send message to order chat
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
      let chat = await ChatModel.findOne({ orderId, isOrderChat: true }) || new ChatModel({
        orderId,
        customerId: order.customerId,
        isOrderChat: true,
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
        chatId: chat._id,
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
    const { chatId, messageId, attachmentIndex } = req.params;
    
    const chat = await validateChatAccess(chatId, req.user.id, req.user.role);
    
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

// For backward compatibility
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, content } = req.body;
    if (!orderId || !content) {
      res.status(400).json({ message: "Order ID and message content are required" });
      return;
    }

    const order = await validateOrderAccess(orderId, req.user.id, req.user.role);
    let chat = await ChatModel.findOne({ orderId, isOrderChat: true }) || new ChatModel({
      orderId,
      customerId: order.customerId,
      isOrderChat: true,
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
      chatId: chat._id,
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
    const { chatId } = req.params;
    if (!chatId) {
      res.status(400).json({ message: "Chat ID is required" });
      return;
    }

    const chat = await validateChatAccess(chatId, req.user.id, req.user.role);

    const senderType = req.user.role === "admin" ? "user" : "admin";
    chat.messages.forEach(msg => {
      if (msg.sender === senderType) msg.read = true;
    });

    await chat.save();

    const io = req.app.get('io');
    const roomName = chat.isOrderChat && chat.orderId ? 
      `order-${chat.orderId}` : `chat-${chat._id}`;

    io?.to(roomName).emit('messages-read', {
      chatId: chat._id,
      orderId: chat.orderId,
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