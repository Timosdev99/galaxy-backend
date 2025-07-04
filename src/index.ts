import "dotenv/config";
import connectDB from "../db";
import express, { Application } from "express";
import userroute from "./route/userroute";
import orderroute from "./route/orderroute";
import adminrouter from "./route/admin"
import { createServer } from "http";
import cors from 'cors';
import chatRoutes from "./route/chatroute";
import setupSocketServer from "./services/socketsever";

const PORT = process.env.PORT || 3000;
const app: Application = express();
const httpServer = createServer(app);


const io = setupSocketServer(httpServer);
app.set('io', io);


app.use(express.json());

const whitelist = [
  'http://localhost:3001',
  'http://localhost:3002',
  'https://galaxy-gilt-iota.vercel.app',
  'https://galaxy-timosdev99s-projects.vercel.app',
  'https://ghostmarket.net',
  'https://www.ghostmarket.net',
  'https://galaxy-admin-two.vercel.app',
  'https://admin.ghostmarket.net'
];

const corsOptions = {
  origin: function(origin: any, callback: any) {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ['Authorization']
};

app.use(cors(corsOptions));

// Routes
app.use('/user/v1', userroute);
app.use('/order/v1', orderroute);
app.use("/chats/v1", chatRoutes);
app.use('/admin/v1', adminrouter);
app.use('/', (req, res) => {
  res.status(200).json({
    message: "API is working"
  });
});


connectDB()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  });


process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
