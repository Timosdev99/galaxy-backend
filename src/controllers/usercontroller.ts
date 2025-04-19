import "dotenv/config";
import express, { Request, Response } from "express";
import { usermodel } from "../models/user";
import { sign } from "jsonwebtoken";
import bcrypt from "bcrypt";

const generateToken = (userId: string) => {
  const secretKey = process.env.SECRET_KEY as string;
  return sign({ id: userId }, secretKey, { expiresIn: "1d" });
};

export const SignUp = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;

  try {
    if (!name || !email || !password) {
       res.status(400).json({ message: "Name, email and password are required" });
       return
    }

    const existingUser = await usermodel.findOne({ email });
    if (existingUser) {
      res.status(400).json({ message: "Email already in use" });
      return
    }

    const user = new usermodel({ name, email, password, role });
    await user.save();

    const token = generateToken(user.id);
    
    res.setHeader("Authorization", `Bearer ${token}`);

 res.status(201).json({
      message: "Account created successfully",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token: token
    });
    return
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to create account" });
    return
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return
    }

    const user = await usermodel.findOne({ email }).select("+password");
    if (!user) {
       res.status(400).json({ message: "Invalid email or password" });
       return
    }

    
    if (user.lockUntil && user.lockUntil > new Date()) {
      const secs = Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000);
      const mins = Math.floor(secs / 60);
      const secRem = secs % 60;
       res.status(423).json({ message: `Too many attempts. Try again in ${mins}m ${secRem}s.` });
       return
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      user.loginAttempts++;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save();
      res.status(400).json({
        message: "Invalid email or password",
        attemptsRemaining: Math.max(0, 5 - user.loginAttempts)
      });
      return 
    }

   
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    const token = generateToken(user.id);
    res.setHeader("Authorization", `Bearer ${token}`);

    res.status(200).json({
      status: "success",
      message: "Login successful",
      user: { id: user.id, email: user.email, role: user.role },
      token: token
    });
    return
  } catch (error) {
    console.error("Login error:", error);
     res.status(500).json({ message: "Failed to login" });
     return
  }
};


export const getUser = async (req: Request, res: Response) => {
    try {
        
        const { id } = req.params;

        
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            res.status(400).json({ message: "Invalid user ID format" });
            return;
        }

        
        const user = await usermodel.findById(id);
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        
        res.status(200).json({
            status: "success",
            message: "User retrieved successfully",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
               
            },
        });
    } catch (error) {
        console.error("Error retrieving user:", error);


        res.status(500).json({
            message: "An error occurred while retrieving the user",
        });
    }
};

export const allUser = async (req: Request, res: Response) => {
    try {
        
        const users = await usermodel.find();
        if (!users) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        
        res.status(200).json({
            status: "success",
            message: "all Users retrieved successfully",
           users,
        });
    } catch (error) {
        console.error("Error retrieving user:", error);


        res.status(500).json({
            message: "An error occurred while retrieving the user",
        });
    }
};

export const logout = async (req: Request, res: Response) => {
    
    res.status(200).json({ status: "success", message: "Logout successful" });
    return
  };


  export const validateToken = async (req: Request, res: Response) => {
    try {
      res.status(200).json({
        message: "Token is valid",
        user: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role
        }
      });
      return
    } catch (err) {
      console.error(err);
       res.status(500).json({ message: "Failed to validate token" });
       return
    }
  };
  

