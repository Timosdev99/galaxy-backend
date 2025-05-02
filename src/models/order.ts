import { model, Schema, Document } from "mongoose";
import { ObjectId } from "mongodb";

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  discount?: number;
}

interface Payment {
  method: "E-transfer" | "Shake Pay"  | "paypal";
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
  marketplace: "GalaxyService" | "studio43" | "NorthernEats";
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
  quantity: { type: Number, required: true, min: 1 },
  discount: { type: Number, default: 0 }
});

const PaymentSchema = new Schema<Payment>({
  method: { 
    type: String, 
    enum: ["E-transfer", "Shake Pay", "paypal"],
    required: true 
  },
  transactionId: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, default: "USD" },
  status: { 
    type: String, 
    enum: ["pending", "received", "completed", "failed", "refunded"],
    required: true,
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
  country: { type: String, required: true, default: "USA" },
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
      required: true,
      unique: true,
      index: true
    },

    customerId: {
      type: String,
      required: true,
      index: true
    },
    marketplace: {
      type: String,
      enum: ["GalaxyService", "studio43", "NorthernEats"],
      required: true,
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
      required: true
    },
    tax: {
      type: Number,
      required: true,
      default: 0
    },
    shippingCost: {
      type: Number,
      required: true,
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Pre-save middleware to update lastUpdatedAt
OrderSchema.pre<OrderDocument>('save', function(next) {
  this.lastUpdatedAt = new Date();
  next();
});

// Calculate final amount before saving
OrderSchema.pre<OrderDocument>('save', function(next) {
  this.finalAmount = this.totalAmount + this.tax + this.shippingCost - (this.discount || 0);
  next();
});

// Virtual property to check if order is eligible for refund
OrderSchema.virtual('isRefundEligible').get(function(this: OrderDocument) {
  // Orders can be refunded within 30 days of delivery
  if (this.status !== 'delivered') return false;
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  return this.lastUpdatedAt > thirtyDaysAgo;
});

// Market-specific virtual properties
OrderSchema.virtual('isDigitalService').get(function(this: OrderDocument) {
  return this.marketplace === "GalaxyService";
});

OrderSchema.virtual('isPhysicalProduct').get(function(this: OrderDocument) {
  return this.marketplace === "studio43";
});

OrderSchema.virtual('isFood').get(function(this: OrderDocument) {
  return this.marketplace === "NorthernEats";
});

const OrderModel = model<OrderDocument>('Order', OrderSchema);
export default OrderModel;