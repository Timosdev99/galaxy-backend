import mongoose, { Document, Schema } from "mongoose";

export interface ChatMessage {
  [x: string]: any;
  senderId: mongoose.Types.ObjectId;
  senderRole: 'user' | 'admin';
  message: string;
  timestamp: Date;
  read: boolean;
}

export interface ChatDocument extends Document {
  orderId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  messages: ChatMessage[];
  lastMessage: Date;
  open: boolean;
}

const chatSchema = new Schema<ChatDocument>({
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messages: [{
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderRole: {
      type: String,
      enum: ['user', 'admin'],
      required: true
    },
    message: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    read: {
      type: Boolean,
      default: false
    }
  }],
  lastMessage: {
    type: Date,
    default: Date.now
  },
  open: {
    type: Boolean,
    default: true
  }
});


chatSchema.index({ orderId: 1 });
chatSchema.index({ customerId: 1 });
chatSchema.index({ lastMessage: -1 });

export default mongoose.model<ChatDocument>('Chat', chatSchema);