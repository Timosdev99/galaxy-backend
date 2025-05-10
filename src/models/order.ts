import { model, Schema, Document } from "mongoose";
import { ObjectId } from "mongodb";

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  discount?: number;
}

interface Payment {
  method: "E-transfer" | "Shake pay" | "paypal";
  transactionId?: string;
  amount: number;
  currency: string;
  status: "pending" | "received" | "completed" | "failed" | "refunded";
  processedAt?: Date;
  confirmedBy?: string; // Admin who confirmed the payment
  confirmationDate?: Date;
}

interface ShippingDetails {
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  contactPhone: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: Date;
}

interface IOrder {
  orderNumber: string;
  customerId: string;
  marketplace: string; // Slug for easy reference
  marketplaceId: Schema.Types.ObjectId; // Reference to Marketplace document
  serviceId?: Schema.Types.ObjectId; // Reference to Service document
  customFormData?: Record<string, string | number | boolean>;
  category: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  items: OrderItem[];
  totalAmount: number;
  tax: number;
  shippingCost: number;
  discount?: number;
  finalAmount: number;
  placedAt: Date;
  payment: Payment;
  shipping: ShippingDetails;
  notes?: string;
  refundReason?: string;
  lastUpdatedAt: Date;
}

export interface OrderDocument extends IOrder, Document {}

const OrderItemSchema = new Schema<OrderItem>({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, min: 1 },
  discount: { type: Number, default: 0 }
});

const PaymentSchema = new Schema<Payment>({
  method: { 
    type: String, 
    enum: ["E-transfer", "Shake pay", "paypal"],
    required: true
  },
  transactionId: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: "USD" },
  status: { 
    type: String, 
    enum: ["pending", "received", "completed", "failed", "refunded"],
   
    default: "pending"
  },
  processedAt: { type: Date },
  confirmedBy: { type: String },
  confirmationDate: { type: Date }
});

const ShippingDetailsSchema = new Schema<ShippingDetails>({
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, default: "Canada" },
  postalCode: { type: String, required: true },
  contactPhone: { type: String, required: true },
  trackingNumber: { type: String },
  carrier: { type: String },
  estimatedDelivery: { type: Date }
});

const OrderSchema = new Schema<OrderDocument>(
  {
    orderNumber: {
      type: String,
     
      unique: true,
      index: true
    },
    customerId: {
      type: String,
     
      index: true
    },
    marketplace: {
      type: String,
     
      index: true
    },
    marketplaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Marketplace',
     
      index: true
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: 'Service',
      index: true
    },
    category: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled", "refunded"],
      default: "pending",
      index: true
    },
    items: [OrderItemSchema],
    totalAmount: {
      type: Number,
    
    },
    tax: {
      type: Number,
     
      default: 0
    },
    customFormData: {
       type: Schema.Types.Mixed
       },
    shippingCost: {
      type: Number,
     
      default: 0
    },
    discount: {
      type: Number,
      default: 0
    },
    finalAmount: {
      type: Number,
      required: true
    },
    placedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    payment: PaymentSchema,
    shipping: ShippingDetailsSchema,
    notes: {
      type: String
    },
    refundReason: {
      type: String
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { 
    timestamps: true,
    toJSON: { 
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.__v;
        delete ret.marketplaceId;
        delete ret.serviceId;
        return ret;
      }
    },
    toObject: { 
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.__v;
        delete ret.marketplaceId;
        delete ret.serviceId;
        return ret;
      }
    }
  }
);

// Virtual population for marketplace details
OrderSchema.virtual('marketplaceDetails', {
  ref: 'Marketplace',
  localField: 'marketplaceId',
  foreignField: '_id',
  justOne: true
});

// Virtual population for service details
OrderSchema.virtual('serviceDetails', {
  ref: 'Service',
  localField: 'serviceId',
  foreignField: '_id',
  justOne: true
});

// Pre-save hooks
// OrderSchema.pre<OrderDocument>('save', function(next) {
//   this.lastUpdatedAt = new Date();
  
//   // Ensure marketplace slug matches the referenced marketplace
//   if (this.isModified('marketplaceId') && this.populated('marketplaceId')) {
//     this.marketplace = this.marketplaceId.slug;
//   }
  
//   next();
// });

OrderSchema.pre<OrderDocument>('save', function(next) {
  this.finalAmount = this.totalAmount + this.tax + this.shippingCost - (this.discount || 0);
  next();
});

// Virtual property for refund eligibility
OrderSchema.virtual('isRefundEligible').get(function(this: OrderDocument) {
  if (this.status !== 'delivered') return false;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return this.lastUpdatedAt > thirtyDaysAgo;
});

// Indexes for better query performance
OrderSchema.index({ customerId: 1, status: 1 });
OrderSchema.index({ marketplaceId: 1, status: 1 });
OrderSchema.index({ 'payment.status': 1 });

const OrderModel = model<OrderDocument>('Order', OrderSchema);
export default OrderModel;