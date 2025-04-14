import { Request, Response, NextFunction } from "express";

enum UserRole {
    ADMIN = 'admin',
    MANAGER = 'manager',
    USER = 'user'
}

export const Admin = async (req: Request, res: Response, next: NextFunction) => {
    console.log('Admin middleware - User:', req.user);
    console.log('Admin middleware - Role:', req.user?.role);

    if (!req.user) {
       res.status(401).json({ message: "Unauthorized - No user found" });
       return 
    }

    if (req.user.role !== 'admin') {
        console.log('Access denied - User role is:', req.user.role);
        res.status(403).json({ message: "Access denied only admin can access this feature" });
        return 
    }
    next();
};

export const ManagerandAdmin = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized - No user found" });
     return  
    } 

    if (!req.user.role) {
        res.status(403).json({ message: "No role specified" });
     return  
    } 

    const userRole = req.user.role.toLowerCase();
    if (userRole !== UserRole.MANAGER && userRole !== UserRole.ADMIN) {
        res.status(403).json({ message: "Access denied only manager or admin can access this feature" });
     return  
    } 
    next();
};