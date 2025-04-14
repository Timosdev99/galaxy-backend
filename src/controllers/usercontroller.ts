import "dotenv/config"
import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { usermodel } from "../models/user";

import { Jwt, sign } from "jsonwebtoken";
import bcrypt from "bcrypt"


const app = express()

app.use(cookieParser())
app.use(express.json())


export const SignUp = async (req: Request, res: Response) => {
    const {name, email, password, role} = req.body;
    
    try {
        if(!email || !password || !name) {
            res.status(400).json({message: "required feild missing"});
            return
        }
    
        const existinguser = await usermodel.findOne({email});
       if(existinguser) {
          res.status(400).json({message: "this is email as already been used"})
          return 
       }
     
       const user = new usermodel({
        name,
        email,
        password,
        role
       })
    
       await user.save();
       res.status(201).json({message: "account created succesfully",
        user
       })
   
       return
    } catch (error) {
        console.log(error)
          res.status(500).json({message: "unable to create account"})
    }

}

const generateCookies = (userId: string) => {
    const secretKey = process.env.SECRET_KEY as string;
    const token = sign({id: userId}, secretKey, {
        expiresIn: "1d"
    })
    return token;
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ message: "Email and password are required" });
            return;
        }

       
        const user = await usermodel.findOne({ email }).select("+password");
        if (!user) {
            res.status(400).json({ message: "Invalid email or password" });
            return;
        }

        
        if (user.lockUntil && user.lockUntil > new Date()) {
            const timeRemaining = Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000);
            const minutes = Math.floor(timeRemaining / 60);
            const seconds = timeRemaining % 60;
            res.status(423).json({
                message: `Too many attempts, try again later in ${minutes} minutes and ${seconds} seconds.`,
            });
            return;
        }

       
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            user.loginAttempts += 1;

            if (user.loginAttempts >= 5) {
                user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); 
                await user.save();
                res.status(423).json({
                    message: "Too many attempts, try again later.",
                });
                return;
            }

            await user.save();
            res.status(400).json({
                message: "Invalid email or password",
                attemptsRemaining: 5 - user.loginAttempts,
            });
            return;
        }

       
        user.loginAttempts = 0;
        user.lockUntil = null;
        await user.save();

        
        const token = generateCookies(user.id);
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production", 
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000,
        });

        res.status(200).json({
            status: "success",
            message: "Login successful",
            user: {
                id: user._id,
                email: user.email,
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Failed to login" });
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