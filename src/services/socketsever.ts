import { Server, Socket } from "socket.io";

interface UserData {
  userId: string;
  role: "user" | "admin";
  orderId?: string;
}

const whitelist = [
  'http://localhost:3001',
  'http://localhost:3002',  
  'https://galaxy-gilt-iota.vercel.app',
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
      const { userId, role, orderId } = data;
      if (!userId || !role) {
        socket.emit("error", "Missing user data");
        return;
      }

      socket.data = { userId, role, orderId };

      if (orderId) {
        socket.join(`order-${orderId}`);
        console.log(`User ${userId} joined order room ${orderId}`);
      }

      if (role === "admin") {
        adminSockets.add(socket);
        console.log(`Admin connected: ${userId}`);
      } else {
        userSockets.set(userId, socket);
        console.log(`User connected: ${userId}`);
      }
    });

    socket.on("new-message", (data: { orderId: string; content: string }) => {
      const senderData = socket.data as UserData;
      if (!senderData.userId || !senderData.role) {
        return socket.emit("error", "Not authenticated");
      }

      const { orderId, content } = data;
      io.to(`order-${orderId}`).emit("new-message", {
        orderId,
        senderId: senderData.userId,
        senderRole: senderData.role,
        content,
        timestamp: new Date()
      });
    });

    socket.on("typing", (data: { orderId: string, isTyping: boolean }) => {
      const senderData = socket.data as UserData;
      if (!senderData.userId) return;

      io.to(`order-${data.orderId}`).emit("typing", {
        userId: senderData.userId,
        isTyping: data.isTyping
      });
    });

    socket.on("message-read", (data: { orderId: string; messageId: string }) => {
      const senderData = socket.data as UserData;
      io.to(`order-${data.orderId}`).emit("message-read", {
        messageId: data.messageId,
        readBy: senderData.userId,
        readAt: new Date()
      });
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
}