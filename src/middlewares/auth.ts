import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { usermodel } from "../models/user";

declare global {
  namespace Express {
    interface Request { user?: any }
  }
}

export const authToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers["authorization"] as string;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
       res.status(401).json({ message: "No token provided" });
       return
    }

    const token = authHeader.split(" ")[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY as string);
    } catch (err: any) {
      if (err.name === "TokenExpiredError") {
        res.status(401).json({ message: "Token expired" });
        return
      }
      res.status(401).json({ message: "Invalid token" });
      return
    }

    const user = await usermodel.findById(decoded.id);
    if (!user) {
      res.status(401).json({ message: "User not found" });
      return
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth error:", error);
   res.status(500).json({ message: "Authentication failure" });
   return
  }
};
