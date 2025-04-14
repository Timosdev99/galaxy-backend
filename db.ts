import "dotenv/config";
import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
    try {
        if (!process.env.MONGO_DB_URI) {
            throw new Error("MONGO_DB_URI is not defined in environment variables");
        }

        await mongoose.connect(process.env.MONGO_DB_URI, {
           

            // socketTimeoutMS: 45000,
            // serverSelectionTimeoutMS: 5000
           // useNewUrlParser: true,
           // useUnifiedTopology: true,
        });

        console.log('Connected to database successfully');
        mongoose.connection.on('error', (error) => {
            console.error('MongoDB connection error:', error);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
        });  

        
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('Database connection error:', error);
        process.exit(1);
    }
};

export default connectDB; 