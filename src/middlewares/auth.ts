import express, { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { usermodel } from "../models/user";

declare global {
    namespace Express {
        interface Request {
            user?: any; 
        }
    }
}

export const authToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      
        const token: string | undefined = req.cookies?.token;
        if (!token) {
            res.status(401).json({ message: "No token found for authorization" });
            return;
        }

        
        const decoded: any = jwt.verify(token, process.env.SECRET_KEY as string);
        if (!decoded || !decoded.id) {
            res.status(401).json({ message: "Invalid token" });
            return;
        }

       
        const user = await usermodel.findById(decoded.id);
        if (!user) {
            res.status(401).json({ message: "No user found" });
            return;
        }

        
        req.user = user;
        next();
    } catch (error) {
        console.error("Auth error:", error);
        res.status(500).json({ message: "Authentication failure" });
    }
};