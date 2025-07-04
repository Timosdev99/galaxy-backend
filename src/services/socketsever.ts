import { Server, Socket } from "socket.io";

interface UserData {
  userId: string;
  role: "user" | "admin";
  orderId?: string;
  chatId?: string;
}

const whitelist = [
  'http://localhost:3001',
  'http://localhost:3002',
  'https://galaxy-gilt-iota.vercel.app',
  'https://galaxy-timosdev99s-projects-vercel.app',
  'https://ghostmarket.net',
  'https://www.ghostmarket.net',
  'https://galaxy-admin-two.vercel.app',
  'https://admin.ghostmarket.net'
];

export default function setupSocketServer(httpServer: any) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin: any, callback: any) => {
        if (!origin || whitelist.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  const userSockets = new Map<string, Socket>();
  const adminSockets = new Set<Socket>();

  io.on("connection", (socket: Socket) => {
    console.log("New client connected");

    socket.on("authenticate", (data: UserData) => {
      const { userId, role, orderId, chatId } = data;
      if (!userId || !role) {
        socket.emit("error", "Missing user data");
        return;
      }

      socket.data = { userId, role, orderId, chatId };

      // Join order room if applicable
      if (orderId) {
        socket.join(`order-${orderId}`);
        console.log(`User ${userId} joined order room ${orderId}`);
      }

      // Join chat room if applicable
      if (chatId) {
        socket.join(`chat-${chatId}`);
        console.log(`User ${userId} joined chat room ${chatId}`);
      }

      if (role === "admin") {
        adminSockets.add(socket);
        // Admin joins a special room to receive notifications about new chats
        socket.join('admin-room');
        console.log(`Admin connected: ${userId}`);
      } else {
        userSockets.set(userId, socket);
        console.log(`User connected: ${userId}`);
      }
    });

    socket.on("join-chat", (data: { chatId: string }) => {
      const userData = socket.data as UserData;
      if (!userData.userId) {
        return socket.emit("error", "Not authenticated");
      }

      socket.join(`chat-${data.chatId}`);
      console.log(`User ${userData.userId} joined chat room ${data.chatId}`);
    });

    socket.on("leave-chat", (data: { chatId: string }) => {
      socket.leave(`chat-${data.chatId}`);
      const userData = socket.data as UserData;
      console.log(`User ${userData?.userId} left chat room ${data.chatId}`);
    });

    socket.on("new-message", (data: {
      chatId?: string;
      orderId?: string;
      content: string;
    }) => {
      const senderData = socket.data as UserData;
      if (!senderData.userId || !senderData.role) {
        return socket.emit("error", "Not authenticated");
      }

      const { chatId, orderId, content } = data;

      // For order chats
      if (orderId) {
        io.to(`order-${orderId}`).emit("new-message", {
          orderId,
          senderId: senderData.userId,
          senderRole: senderData.role,
          content,
          timestamp: new Date()
        });
      }
      // For general chats
      else if (chatId) {
        io.to(`chat-${chatId}`).emit("new-message", {
          chatId,
          senderId: senderData.userId,
          senderRole: senderData.role,
          content,
          timestamp: new Date()
        });
      }
    });

    socket.on("typing", (data: { chatId?: string, orderId?: string, isTyping: boolean }) => {
      const senderData = socket.data as UserData;
      if (!senderData.userId) return;

      // For order chats
      if (data.orderId) {
        io.to(`order-${data.orderId}`).emit("typing", {
          userId: senderData.userId,
          isTyping: data.isTyping
        });
      }
      // For general chats
      else if (data.chatId) {
        io.to(`chat-${data.chatId}`).emit("typing", {
          userId: senderData.userId,
          isTyping: data.isTyping
        });
      }
    });

    socket.on("message-read", (data: {
      chatId?: string;
      orderId?: string;
      messageId: string;
    }) => {
      const senderData = socket.data as UserData;

      // For order chats
      if (data.orderId) {
        io.to(`order-${data.orderId}`).emit("message-read", {
          messageId: data.messageId,
          readBy: senderData.userId,
          readAt: new Date()
        });
      }
      // For general chats
      else if (data.chatId) {
        io.to(`chat-${data.chatId}`).emit("message-read", {
          messageId: data.messageId,
          readBy: senderData.userId,
          readAt: new Date()
        });
      }
    });

    socket.on("disconnect", () => {
      const userData = socket.data as UserData;
      if (!userData?.userId) return;

      if (userData.role === "admin") {
        adminSockets.delete(socket);
        console.log(`Admin disconnected: ${userData.userId}`);
      } else {
        userSockets.delete(userData.userId);
        console.log(`User disconnected: ${userData.userId}`);
      }
    });
  });

  return io;
};
