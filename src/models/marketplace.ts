
import mongoose, { model, Schema, Document } from "mongoose";

interface IMarketplace {
  name: string;
  slug: string; 
  description: string;
  icon?: string; 
  colorScheme: {
    primary: string;
    secondary: string;
  };
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketplaceDocument extends IMarketplace, Document {
    _id: mongoose.Types.ObjectId;
}

const MarketplaceSchema = new Schema<MarketplaceDocument>(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    icon: { type: String,  },
    colorScheme: {
      primary: { type: String, required: true, default: "#4f46e5" }, 
      secondary: { type: String, required: true, default: "#6366f1" }
    },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default model<MarketplaceDocument>('Marketplace', MarketplaceSchema);