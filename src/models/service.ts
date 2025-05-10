import { model, Schema, Document } from "mongoose";

interface IService {
  marketplace: Schema.Types.ObjectId;
  name: string;
  description: string;
  discountPercentage: number;
  active: boolean;
  orderFormFields: {
    label: string;
    type: 'text' | 'number' | 'select' | 'textarea';
    required: boolean;
    options?: string[];
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceDocument extends IService, Document {}

const ServiceSchema = new Schema<ServiceDocument>(
  {
    marketplace: { type: Schema.Types.ObjectId, ref: 'Marketplace', required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    discountPercentage: { type: Number, required: true, min: 0, max: 100 },
    active: { type: Boolean, default: true },
    orderFormFields: [
      {
        label: { type: String, required: true },
        type: { type: String, required: true, enum: ['text', 'number', 'select', 'textarea'] },
        required: { type: Boolean, default: false },
        options: [{ type: String }]
      }
    ]
  },
  { timestamps: true }
);

export default model<ServiceDocument>('Service', ServiceSchema);