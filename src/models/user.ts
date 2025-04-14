import { model, Schema, Document } from "mongoose";
import bcrypt from "bcrypt"


interface users {
    name: string,
    email: string,
    password: string,
    role: "Admin" | "user"
    otp: {
        code: string;
        expiresAt: Date;
    },
    lastPasswordReset: Date,
    loginAttempts: number,
    lockUntil: Date | null,
    joinedAt?: Date
}


interface userDoc extends users, Document {}

const userschema = new Schema<userDoc> ({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    
    joinedAt: {
        type: Date,
        default: Date.now
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters long'],
        select: false,
      },
      role: {
        type: String,
        required: true,
        enum: ["admin", "manager", "user"],
        lowercase: true,
        trim: true
    },
      otp: {
        code: String,
        expiresAt: Date,
      },
      lastPasswordReset: Date,
      loginAttempts: {
        type: Number,
        default: 0,
      },
    lockUntil: {
      type: Date
    }
    }, {
      timestamps: true,
    });
    
   
    userschema.pre("save", async function(next) {
        if (!this.isModified('password')) return next();
    
        try {
            const salt = await bcrypt.genSalt(12);
            this.password = await bcrypt.hash(this.password, salt);
            next();
        } catch(error) {
            throw error;
        }
    });



    userschema.methods.isLocked = function() {
        return !!(this.lockUntil && this.lockUntil > Date.now());
      };



export const usermodel = model<userDoc>("users", userschema)