
import { model, Schema, Document } from "mongoose";
import { ObjectId } from "mongodb";

interface Attachment {
  data: Buffer; 
  contentType: string;
  filename: string;
  size: number;
}

interface Message {
  _id: any;
  sender: "user" | "admin" | "system";
  content: string;
  timestamp: Date;
  read: boolean;
  attachments?: Attachment[];
}

interface IChat {
  orderId: string;
  customerId: string;
  adminId?: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatDocument extends IChat, Document {}

const MessageSchema = new Schema<Message>({
  sender: { 
    type: String, 
    enum: ["user", "admin", "system"],
    required: true 
  },
  content: { 
    type: String, 
    required: true,
    trim: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  read: { 
    type: Boolean, 
    default: false 
  }
});

const ChatSchema = new Schema<ChatDocument>(
  {
    orderId: {
      type: String,
      required: true,
      index: true
    },
    customerId: {
      type: String,
      required: true,
      index: true
    },
    adminId: {
      type: String,
      index: true
    },
    messages: [MessageSchema]
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual to get the last message
ChatSchema.virtual('lastMessage').get(function(this: ChatDocument) {
  if (this.messages.length === 0) return null;
  return this.messages[this.messages.length - 1];
});

// Index for faster querying
ChatSchema.index({ orderId: 1, customerId: 1 });

const ChatModel = model<ChatDocument>('Chat', ChatSchema);
export default ChatModel;