import { Server, Socket } from "socket.io";

interface UserData {
  userId: string;
  role: "user" | "admin";
  orderId?: string;
}

export default function setupSocketServer(httpServer: any) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.WHITELISTED_DOMAINS?.split(",") || "*",
      methods: ["GET", "POST"]
    }
  });

 
  const connectedUsers = new Map<string, Socket>(); 
  const connectedAdmins = new Set<Socket>(); 

  io.on("connection", (socket: Socket) => {
    console.log("New client connected");

   
    socket.on("authenticate", (data: UserData) => {
      const { userId, role, orderId } = data;

      
      if (role === "admin") {
        connectedAdmins.add(socket);
        console.log(`Admin connected: ${userId}`);
      } else {
        connectedUsers.set(userId, socket);
        console.log(`User connected: ${userId}`);
        
       
        if (orderId) {
          socket.join(`order-${orderId}`);
          console.log(`User ${userId} joined order chat ${orderId}`);
        }
      }

      
      socket.data = { userId, role, orderId };
    });

    
    socket.on("new-message", (data: {
      orderId: string;
      content: string;
      receiverId?: string; 
    }) => {
      const senderData = socket.data as UserData;
      const { orderId, content, receiverId } = data;

      if (!senderData.userId || !senderData.role) {
        return socket.emit("error", "Not authenticated");
      }

      // User sending to admins
      if (senderData.role === "user") {
        // Broadcast to all admins in the order room
        io.to(`order-${orderId}`).emit("new-message", {
          orderId,
          senderId: senderData.userId,
          content,
          timestamp: new Date()
        });
        
        // Also notify specific admin if assigned
        if (receiverId && connectedUsers.has(receiverId)) {
          connectedUsers.get(receiverId)?.emit("new-message", {
            orderId,
            senderId: senderData.userId,
            content,
            timestamp: new Date()
          });
        }
      }
      // Admin sending to user
      else if (senderData.role === "admin" && receiverId) {
        if (connectedUsers.has(receiverId)) {
          connectedUsers.get(receiverId)?.emit("new-message", {
            orderId,
            senderId: senderData.userId,
            content,
            timestamp: new Date()
          });
        }
      }
    });

    
    socket.on("typing", (data: { orderId: string, isTyping: boolean }) => {
      const senderData = socket.data as UserData;
      io.to(`order-${data.orderId}`).emit("typing", {
        userId: senderData.userId,
        isTyping: data.isTyping
      });
    });

    
    socket.on("disconnect", () => {
      const userData = socket.data as UserData;
      if (userData.role === "admin") {
        connectedAdmins.delete(socket);
        console.log(`Admin disconnected: ${userData.userId}`);
      } else {
        connectedUsers.delete(userData.userId);
        console.log(`User disconnected: ${userData.userId}`);
      }
    });
  });

  return io;
}