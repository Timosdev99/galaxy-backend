import { DefaultEventsMap, Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { usermodel } from "../models/user";
import ChatModel from "../models/chat";

export default function setupSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error: Token required"));
    }

    try {
      const secretKey = process.env.SECRET_KEY as string;
      const decoded: any = jwt.verify(token, secretKey);
      const user = await usermodel.findById(decoded.id);
      
      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }
      
      socket.data.user = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      };
      
      next();
    } catch (error) {
      return next(new Error("Authentication error: Invalid token"));
    }
  });

  // Connection handler
  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.data.user.id}, Role: ${socket.data.user.role}`);
    
    // Auto-join personal user room for direct messages
    socket.join(`user-${socket.data.user.id}`);
    
    // Admin users join the admin room
    if (socket.data.user.role === "admin") {
      socket.join("admin-room");
    }
    
    // Auto-join all relevant chat rooms for the user
    joinUserChatRooms(socket);
    
    // Listen for user-sent messages
    socket.on("send-message", async (data) => {
      try {
        // Validate data
        if (!data.chatId || !data.message || !data.orderId) {
          socket.emit("error", { message: "Invalid message data" });
          return;
        }
        
        // Save message to database
        const chat = await ChatModel.findById(data.chatId);
        if (!chat) {
          socket.emit("error", { message: "Chat not found" });
          return;
        }
        
        // Security check - ensure sender is allowed to send to this chat
        if (
          socket.data.user.role !== "admin" && 
          chat.customerId.toString() !== socket.data.user.id.toString()
        ) {
          socket.emit("error", { message: "Unauthorized to send to this chat" });
          return;
        }
        
        // Add message to database
        chat.messages.push({
          senderId: socket.data.user.id,
          senderRole: socket.data.user.role === "admin" ? "admin" : "user",
          message: data.message,
          timestamp: new Date(),
          read: false
        });
        
        chat.lastMessage = new Date();
        if (!chat.open && socket.data.user.role !== "admin") {
          chat.open = true; // Reopen chat if user responds to a closed chat
        }
        
        await chat.save();
        
        // Broadcast to chat room
        io.to(`order-${data.orderId}`).emit("new-message", {
          chatId: data.chatId,
          message: data.message,
          sender: {
            id: socket.data.user.id,
            name: socket.data.user.name,
            role: socket.data.user.role
          },
          timestamp: new Date()
        });
        
        // Send notifications to appropriate recipients
        if (socket.data.user.role !== "admin") {
          // If sender is user, notify admins
          io.to("admin-room").emit("new-chat-notification", {
            chatId: data.chatId,
            orderId: data.orderId,
            message: data.message,
            sender: {
              id: socket.data.user.id,
              name: socket.data.user.name
            },
            timestamp: new Date()
          });
        } else if (socket.data.user.role === "admin" && data.customerId) {
          // If sender is admin, notify user
          io.to(`user-${data.customerId}`).emit("new-chat-notification", {
            chatId: data.chatId,
            orderId: data.orderId,
            message: data.message,
            sender: {
              role: "admin",
              name: "Admin"
            },
            timestamp: new Date()
          });
        }
        
        socket.emit("message-sent", { 
          success: true,
          messageId: chat.messages[chat.messages.length - 1]._id
        });
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });
    
    // Join a specific order's chat room
    socket.on("join-order-chat", (orderId) => {
      if (!orderId) return;
      
      socket.join(`order-${orderId}`);
      console.log(`User ${socket.data.user.id} joined chat room for order: ${orderId}`);
    });
    
    // Mark messages as read
    socket.on("mark-as-read", async (data) => {
      try {
        if (!data.chatId) {
          socket.emit("error", { message: "Chat ID is required" });
          return;
        }
        
        const chat = await ChatModel.findById(data.chatId);
        if (!chat) {
          socket.emit("error", { message: "Chat not found" });
          return;
        }
        
        // Security check
        if (
          socket.data.user.role !== "admin" && 
          chat.customerId.toString() !== socket.data.user.id.toString()
        ) {
          socket.emit("error", { message: "Unauthorized to access this chat" });
          return;
        }
        
        // Mark messages as read based on role
        const senderRoleToMark = socket.data.user.role === "admin" ? "user" : "admin";
        
        const result = await ChatModel.updateOne(
          { _id: data.chatId },
          { $set: { "messages.$[elem].read": true } },
          { arrayFilters: [{ "elem.senderRole": senderRoleToMark, "elem.read": false }] }
        );
        
        if (result.modifiedCount > 0) {
          // Notify others in the chat that messages were read
          io.to(`order-${chat.orderId}`).emit("messages-read", {
            chatId: data.chatId,
            readBy: socket.data.user.role,
            userId: socket.data.user.id
          });
        }
        
        socket.emit("marked-read", { 
          success: true,
          chatId: data.chatId
        });
      } catch (error) {
        console.error("Error marking messages as read:", error);
        socket.emit("error", { message: "Failed to mark messages as read" });
      }
    });
    
    // Listen for typing status
    socket.on("typing", (data) => {
      if (!data.chatId || !data.orderId) return;
      
      // Broadcast typing status to chat room
      socket.to(`order-${data.orderId}`).emit("user-typing", {
        chatId: data.chatId,
        user: {
          id: socket.data.user.id,
          name: socket.data.user.name,
          role: socket.data.user.role
        },
        isTyping: data.isTyping
      });
    });
    
    // Client requests to get online status of users
    socket.on("get-online-status", (userIds) => {
      if (!Array.isArray(userIds)) return;
      
      const onlineStatus = {};
      userIds.forEach(userId => {
        // Check if any socket connection exists for this user
        const roomSockets = io.sockets.adapter.rooms.get(`user-${userId}`);
        //onlineStatus[userId]  = roomSockets ? roomSockets.size > 0 : false;
      });
      
      socket.emit("online-status", onlineStatus);
    });
    
    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.user.id}`);
      
      // Notify others that user is offline
      if (socket.data.user.role === "admin") {
        io.emit("admin-status-change", { online: false }); 
      }
    });
  });

  // Helper function to automatically join user to all their relevant chat rooms
  async function joinUserChatRooms(socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) {
    try {
      // Define query based on user role
      const query = socket.data.user.role === "admin" 
        ? {} // Admins can access all chats
        : { customerId: socket.data.user.id }; // Users only see their chats
      
      // Find all chats for this user
      const chats = await ChatModel.find(query, { orderId: 1 });
      
      // Join each chat room
      chats.forEach(chat => {
        socket.join(`order-${chat.orderId}`);
      });
      
      console.log(`User ${socket.data.user.id} joined ${chats.length} chat rooms`);
    } catch (error) {
      console.error("Error joining user chat rooms:", error);
    }
  }

  return io;
}