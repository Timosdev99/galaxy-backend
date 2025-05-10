import { Request, Response } from "express";
import OrderModel, { OrderDocument } from "../models/order";
import mongoose from "mongoose";
import sendmail from "../utils/mailer";
import { SendMailOptions } from "nodemailer";
import ChatModel from "../models/chat";
import MarketplaceModel, { MarketplaceDocument } from "../models/marketplace";
import ServiceModel from "../models/service";

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  discount?: number;
}

interface CreateOrderRequest {
  customerId: string;
  username: string;
  email: string;
  marketplace: string;
  customFormData?: Record<string, string | number | boolean>;
  category: string;
  items: OrderItem[];
  paymentMethod: "E-transfer" | "Shake pay"  | "paypal"
  totalAmount: number;
  tax?: number;
  shippingCost?: number;
  discount?: number;
  shipping: {
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    contactPhone: string;
  };
  notes?: string;
}

interface UpdateOrderRequest {
  orderId: string;
  status?: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  paymentStatus?: "pending" | "received" | "completed" | "failed" | "refunded";
  confirmedBy?: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: Date;
  notes?: string;
  refundReason?: string;
}

interface OrderFilters {
  //limit: string;
  status?: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  marketplace?: string;
  customerId?: string;
  fromDate?: Date;
  toDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

// generating unique id for orders
function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,"");
  const randomStr = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ORD-${dateStr}-${randomStr}`;
}

export const createOrder = async (req: Request<{}, {}, CreateOrderRequest>, res: Response) => {
  try {
    const {
      customerId,
      marketplace: marketplaceSlug,
      category,
      items,
      paymentMethod,
      totalAmount,
      shippingCost = 0,
      shipping,
      notes
    } = req.body;

    // Validate required fields
    if (!customerId  || !items || items.length === 0 ||  !paymentMethod || totalAmount === undefined) {
      res.status(400).json({
        message: "Required fields missing: customerId, category, items, payment method, totalAmount, and shipping details are required"
      });
      return
    }

    // Validate items
    for (const item of items) {
      if (!item.name || item.price === undefined || item.quantity === undefined) {
      res.status(400).json({
          message: "Each item must have name, price, and quantity"
        });
        return 
      }
    }

    // Get marketplace with active check
    const marketplace = await MarketplaceModel.findOne({ 
      slug: marketplaceSlug,
      active: true 
    });
    
    if (!marketplace) {
      res.status(400).json({ 
        message: "Invalid marketplace or marketplace is not active" 
      });
      return
    }

    // Validate service/category exists and is valid for this marketplace
    const service = await ServiceModel.findOne({ 
      marketplace: marketplace._id,
      name: category,
      active: true
    });
    
    if (!service) {
      res.status(400).json({ 
        message: "Invalid category for this marketplace or category is not active" 
      });
      return
    }

    // Calculate final amount with service discount if applicable
    const discountedTotal = applyServiceDiscount(items, service.discountPercentage);
    const finalAmount = discountedTotal + (shippingCost || 0);

    // Create new order
    const order = new OrderModel({
      orderNumber: generateOrderNumber(),
      customerId,
      marketplace: marketplace.slug, // Store the slug for easy reference
      marketplaceId: marketplace._id, // Store reference to marketplace document
      category,
      status: "pending",
      items: items.map(item => ({
        ...item,
        discount: (item.price * item.quantity) * (service.discountPercentage / 100)
      })),
      totalAmount: discountedTotal,
      shippingCost,
      finalAmount,
      placedAt: new Date(),
      payment: {
        method: paymentMethod,
        amount: finalAmount,
        currency: "USD",
        status: "pending"
      },
      shipping,
      notes,
      lastUpdatedAt: new Date(),
      serviceId: service._id ,// Store reference to service document
      customFormData: req.body.customFormData,
    });

    // Save order and create chat in transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const savedOrder = await order.save({ session });
      
      const chat = new ChatModel({
        orderId: savedOrder._id,
        customerId,
        messages: [{
          sender: "system",
          content: `Chat started for order #${savedOrder.orderNumber}`,
          timestamp: new Date(),
          read: true
        }]
      });
      
      await chat.save({ session });
      await session.commitTransaction();
      
      // Notify via socket.io if available
      const io = req.app.get('io');
      if (io) {
        io.emit('new-chat', { 
          orderId: savedOrder._id,
          customerId,
          orderNumber: savedOrder.orderNumber,
          marketplace: marketplace.slug
        });
      }
      
      // Send confirmation email
      await sendOrderConfirmationEmail(req.user.email, savedOrder.orderNumber, finalAmount, marketplace);

      res.status(201).json({
        message: "Order successfully created",
        order: savedOrder
      });
      return 
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

  } catch (error: any) {
    console.error("Order creation failed:", error);
  res.status(500).json({ 
      message: "Failed to create order",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
    return 
  }
};

// Helper function to apply service discount
function applyServiceDiscount(items: OrderItem[], discountPercentage: number): number {
  return items.reduce((sum, item) => {
    const itemTotal = item.price * item.quantity;
    const discountAmount = itemTotal * (discountPercentage / 100);
    return sum + (itemTotal - discountAmount);
  }, 0);
}

// Helper function for sending confirmation email
async function sendOrderConfirmationEmail(
  to: string, 
  orderNumber: string, 
  amount: number,
  marketplace: MarketplaceDocument
): Promise<void> {
  const mailOptions: SendMailOptions = {
    from: `"${marketplace.name} 👻" <${process.env.EMAIL_USER_NAME}>`,
    to,
    subject: `🎉 Your ${marketplace.name} Order #${orderNumber} is Confirmed!`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
        <h2 style="color: ${marketplace.colorScheme.primary};">Thank you for your order! 👻</h2>
        <p>Hello!</p>
        <p>Your order <strong>#${orderNumber}</strong> has been successfully placed on <strong>${marketplace.name}</strong>.</p>
        <p><strong>Total Amount:</strong> $${amount.toFixed(2)}</p>
        <p>We're currently processing your order and will notify you once it's ready.</p>
        <p>Thank you for shopping with us!</p>
        <p style="margin-top: 30px;">– The ${marketplace.name} Team 👻</p>
        <hr style="margin: 40px 0;" />
        <small style="color: #888;">You received this email because you placed an order on ${marketplace.name}.</small>
      </div>
    `
  };

  await sendmail(mailOptions);
}

export const getAllOrders = async(req: Request, res: Response) => {
  try {
    const allOrders = await OrderModel.find()
                   .sort({ placedAt: -1 });

     res.status(200).json({
      allOrders,
      count: allOrders.length
    });
    return
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch orders" });
    return 
  }
};

export const getOrders = async (req: Request<{}, {}, {}, OrderFilters>, res: Response) => {
  try {
    const {
      status,
      marketplace,
      customerId,
      fromDate,
      toDate,
      minAmount,
      maxAmount
    } = req.query;
   
    const filter: any = {};

    if (status) filter.status = status;
    if (marketplace) filter.marketplace = marketplace;
    if (customerId) filter.customerId = customerId;
    
    if (fromDate || toDate) {
      filter.placedAt = {};
      if (fromDate) filter.placedAt.$gte = new Date(fromDate);
      if (toDate) filter.placedAt.$lte = new Date(toDate);
    }
    
    if (minAmount || maxAmount) {
      filter.finalAmount = {};
      if (minAmount) filter.finalAmount.$gte = parseFloat(minAmount as unknown as string);
      if (maxAmount) filter.finalAmount.$lte = parseFloat(maxAmount as unknown as string);
    }

    const orders = await OrderModel
      .find(filter)
      .sort({ placedAt: -1 })
      .limit(parseInt(50 as unknown as string));

     res.status(200).json({
      orders,
      count: orders.length
    });
    return
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch orders" });
    return
  }
};

export const updateOrder = async (req: Request<{}, {}, UpdateOrderRequest>, res: Response) => {
  try {
    const { 
      orderId, 
      status, 
      paymentStatus, 
      confirmedBy,
      trackingNumber, 
      carrier, 
      estimatedDelivery, 
      notes, 
      //refundReason 
    } = req.body;

    if (!orderId) {
       res.status(400).json({ message: "Order ID is required" });
       return
    }

    const previousOrder = await OrderModel.findById(orderId);
    if (!previousOrder) {
      res.status(404).json({ message: "Order not found" });
      return 
    }
    
    // Prepare update data
    const updateData: any = { lastUpdatedAt: new Date() };
    
    // Handle status update
    if (status) {
      // Prevent invalid status transitions
      const validTransitions: Record<string, string[]> = {
        "pending": ["processing", "cancelled"],
        "processing": ["shipped", "cancelled"],
        "shipped": ["delivered", "cancelled"],
        "delivered": ["refunded"],
        "cancelled": [],
        "refunded": []
      };
      
      if (!validTransitions[previousOrder.status].includes(status)) {
         res.status(400).json({ 
          message: `Invalid status transition from ${previousOrder.status} to ${status}` 
        });
        return
      }
      
      updateData.status = status;
      
      // If status is changing to refunded, require a reason
    //   if (status === "refunded" && !refundReason) {
    //     res.status(400).json({ message: "Refund reason is required when status is set to refunded" });
    //     return 
    //   }
      
    //   if (refundReason) {
    //     updateData.refundReason = refundReason;
    //   }
    }
    
    // Handle payment status update
    if (paymentStatus) {
      updateData['payment.status'] = paymentStatus;
      
      // If payment is confirmed by admin
      if (paymentStatus === "received" && confirmedBy) {
        updateData['payment.confirmedBy'] = confirmedBy;
        updateData['payment.confirmationDate'] = new Date();
      }
    }
    
    // Handle shipping updates
    if (trackingNumber || carrier || estimatedDelivery) {
      if (trackingNumber) updateData['shipping.trackingNumber'] = trackingNumber;
      if (carrier) updateData['shipping.carrier'] = carrier;
      if (estimatedDelivery) updateData['shipping.estimatedDelivery'] = new Date(estimatedDelivery);
    }
    
    // Handle notes
    if (notes) {
      updateData.notes = notes;
    }

    const updatedOrder = await OrderModel.findByIdAndUpdate(
      orderId,
      updateData,
      { new: true, runValidators: true }
    );

   
    
     res.status(200).json({
      message: "Order updated successfully",
      order: updatedOrder
    });
    return
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update order" });
     return
  }
};

export const confirmPayment = async (req: Request, res: Response) => {
    try {
      const { orderId,  transactionId } = req.body;
      const adminId = req.user?.id
      
      if (!orderId) {
         res.status(400).json({ message: "Order ID aare required" });
         return
      } 
      
      const order = await OrderModel.findById(orderId);
      
      if (!order) {
        res.status(404).json({ message: "Order not found" });
        return
      }
      
      if (order.payment.status !== "pending") {
        res.status(400).json({ 
          message: `Invalid payment confirmation: payment status is already ${order.payment.status}` 
        });
        return
      }
      
      // Create the update object with proper MongoDB dot notation
      const updateData: any = {
        "payment.status": "received",
        "payment.confirmedBy": adminId,
        "payment.confirmationDate": new Date(),
        lastUpdatedAt: new Date()
      };
      
      if (transactionId) {
        updateData["payment.transactionId"] = transactionId;
      }
      
      // Update order status to processing if it's pending
      if (order.status === "pending") {
        updateData.status = "processing";
      }
      
      const updatedOrder = await OrderModel.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true, runValidators: true }
      );
      
      res.status(200).json({
        message: "Payment confirmed successfully",
        order: updatedOrder
      });
      return 
    } catch (error) {
      console.error(error);
       res.status(500).json({ message: "Failed to confirm payment" });
       return
    }
  };

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
     res.status(404).json({ message: "Order ID is required" });
     return  
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid order ID format" });
      return 
    }

    const order = await OrderModel.findById(id);
    
    if (!order) {
     res.status(404).json({ message: "Order not found" });
     return 
    }

    res.status(200).json({
      message: "Order successfully retrieved",
      order
    });
    return
  } catch (error) {
    console.error(error);
   res.status(500).json({ message: "Failed to get order by id" });
   
  }
};



export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      res.status(400).json({ message: "Order ID is required" });
      return
    }

    const order = await OrderModel.findById(orderId);
    
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return 
    }
    
    // Only allow deletion of pending orders
    if (order.status !== "pending") {
     res.status(400).json({ 
        message: "Only pending orders can be deleted. Please cancel the order instead." 
      });
      return 
    }

    const deletedOrder = await OrderModel.findByIdAndDelete(orderId);

    if (!deletedOrder) {
       res.status(404).json({ message: "Order not found" });
       return
    }

     res.status(200).json({
      message: `Order with ID: ${orderId} deleted successfully`,
    });
    return
  } catch (error) {
    console.error(error);
   res.status(500).json({ message: "Failed to delete order" });
   return 
  }
};

// Function to process refund
// export const processRefund = async (req: Request, res: Response) => {
//   try {
//     const { orderId, reason } = req.body;

//     if (!orderId || !reason) {
//       return res.status(400).json({ message: "Order ID and refund reason are required" });
//     }

//     const order = await OrderModel.findById(orderId);
    
//     if (!order) {
//       return res.status(404).json({ message: "Order not found" });
//     }
    
//     // Only delivered orders can be refunded
//     if (order.status !== "delivered") {
//       return res.status(400).json({ 
//         message: "Only delivered orders can be refunded" 
//       });
//     }
    
//     // Check if order is eligible for refund (within 30 days)
//     if (!order.isRefundEligible) {
//       return res.status(400).json({ 
//         message: "Order is not eligible for refund. Refund period has expired." 
//       });
//     }

//     // Update order status and payment status
//     order.status = "refunded";
//     order.refundReason = reason;
//     order.payment.status = "refunded";
//     order.lastUpdatedAt = new Date();
    
//     await order.save();
    
//     // Notify via socket if applicable
//     // socketServer.notifyOrderRefunded(order);

//     return res.status(200).json({
//       message: "Refund processed successfully",
//       order
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ message: "Failed to process refund" });
//   }
// };

export const getMarketplaceOrders = async (req: Request, res: Response) => {
  try {
    const { marketplace } = req.params;
    
    if (!marketplace || !["GalaxyService", "studio43", "NorthernEats"].includes(marketplace)) {
      res.status(400).json({ message: "Valid marketplace is required" });
      return
    }
    
    const orders = await OrderModel.find({ marketplace })
                   .sort({ placedAt: -1 });
    
     res.status(200).json({
      marketplace,
      orders,
      count: orders.length
    });
    return
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch marketplace orders" });
    return
  }
};


export const getOrderAnalytics = async (req: Request, res: Response) => {
  try {
    // Overall metrics
    const totalOrders = await OrderModel.countDocuments();
    const completedOrders = await OrderModel.countDocuments({ status: 'delivered' });
    const cancelledOrders = await OrderModel.countDocuments({ status: 'cancelled' });
    const refundedOrders = await OrderModel.countDocuments({ status: 'refunded' });

    // Total revenue from completed orders
    const revenueResult = await OrderModel.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, totalRevenue: { $sum: "$finalAmount" } } }
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

    // Orders by status
    const ordersByStatus = await OrderModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Orders by payment method
    const ordersByPaymentMethod = await OrderModel.aggregate([
      { $group: { _id: '$payment.method', count: { $sum: 1 } } }
    ]);
    
    // Orders by marketplace
    const ordersByMarketplace = await OrderModel.aggregate([
      { $group: { _id: '$marketplace', count: { $sum: 1 } } }
    ]);
    
    // Revenue by marketplace
    const revenueByMarketplace = await OrderModel.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: '$marketplace', revenue: { $sum: "$finalAmount" } } }
    ]);

     res.status(200).json({
      analytics: {
        totalOrders,
        completedOrders,
        cancelledOrders,
        refundedOrders,
        totalRevenue,
        ordersByStatus: Object.fromEntries(
          ordersByStatus.map(item => [item._id, item.count])
        ),
        ordersByPaymentMethod: Object.fromEntries(
          ordersByPaymentMethod.map(item => [item._id, item.count])
        ),
        ordersByMarketplace: Object.fromEntries(
          ordersByMarketplace.map(item => [item._id, item.count])
        ),
        revenueByMarketplace: Object.fromEntries(
          revenueByMarketplace.map(item => [item._id, item.revenue])
        )
      }
    });
    return
  } catch (error) {
    console.error(error);
     res.status(500).json({ message: "Failed to fetch order analytics" });
     return
  }
};


export const getOrdersByCustomerId = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    
    if (!customerId) {
      res.status(400).json({ message: "Customer ID is required" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      res.status(400).json({ message: "Invalid customer ID format" });
      return;
    }

    const orders = await OrderModel.find({ customerId });
    
    if (!orders || orders.length === 0) {
      res.status(404).json({ message: "No orders found for this customer" });
      return;
    }

    res.status(200).json({
      message: "Orders successfully retrieved",
      orders
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to get orders by customer ID" });
  }
};


export const getMarketplaceData = async (req: Request, res: Response) => {
  try {
    const marketplaces = await MarketplaceModel.find({ active: true });
    const services = await ServiceModel.find({ active: true }).populate<{ marketplace: MarketplaceDocument }>('marketplace');
    
    const marketplaceData = marketplaces.map((mp: MarketplaceDocument) => ({
      id: mp._id,
      name: mp.name,
      slug: mp.slug,
      description: mp.description,
      icon: mp.icon,
      colorScheme: mp.colorScheme,
      services: services
        .filter(s => s.marketplace._id.equals(mp._id))
        .map(s => ({
          name: s.name,
          description: s.description,
          discountPercentage: s.discountPercentage,
          orderFormFields: s.orderFormFields
        }))
    }));

    res.status(200).json({
      marketplaces: marketplaceData
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch marketplace data" });
  }
};