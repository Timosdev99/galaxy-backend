import { model, Schema, Document, Types } from "mongoose";

interface Attachment {
  data: Buffer;
  contentType: string;
  filename: string;
  size: number;
}

interface Message {
  _id?: Types.ObjectId;
  sender: "user" | "admin" | "system";
  content: string;
  timestamp: Date;
  read: boolean;
  attachments?: Attachment[];
}

interface IChat {
  orderId?: string; 
  customerId: string;
  adminId?: string;
  subject?: string; 
  isOrderChat: boolean; 
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatDocument extends IChat, Document {}

const AttachmentSchema = new Schema({
  data: { type: Buffer, required: true },
  contentType: { type: String, required: true },
  filename: { type: String, required: true },
  size: { type: Number, required: true }
});

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
  },
  attachments: [AttachmentSchema]
});

const ChatSchema = new Schema<ChatDocument>(
  {
    orderId: {
      type: String,
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
    subject: {
      type: String,
      trim: true
    },
    isOrderChat: {
      type: Boolean,
      default: false,
      required: true
    },
    messages: [MessageSchema]
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

ChatSchema.virtual('lastMessage').get(function(this: ChatDocument) {
  return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
});

// Index for order chats
ChatSchema.index({ orderId: 1, customerId: 1 });
// Index for ordering by last update
ChatSchema.index({ updatedAt: -1 });
// Index for general chats
ChatSchema.index({ isOrderChat: 1, customerId: 1 });

const ChatModel = model<ChatDocument>('Chat', ChatSchema);
export default ChatModel;