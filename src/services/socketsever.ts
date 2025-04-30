
  import { Server } from "socket.io";
  import { Server as HttpServer } from "http";
  import jwt from "jsonwebtoken";
  import { usermodel } from "../models/user";

  export default function setupSocketServer(httpServer: HttpServer) {
    const io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });


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

  
    io.on("connection", (socket) => {
      console.log(`User connected: ${socket.data.user.id}`);
      
      
      socket.join(`user-${socket.data.user.id}`);
      
      
      if (socket.data.user.role === "admin") {
        socket.join("admin-room");
      }
      
      
      socket.on("send-message", async (data) => {
        
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
        
        
        if (socket.data.user.role !== "admin") {
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
        }
        
        // Notify user if message is from admin
        if (socket.data.user.role === "admin") {
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
      });
      
      
      socket.on("join-order-chat", (orderId) => {
        socket.join(`order-${orderId}`);
      });
      
      
      socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.data.user.id}`);
      });
    });

    return io;
  }