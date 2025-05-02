import { Request, Response } from "express";
import OrderModel, { OrderDocument } from "../models/order";
import mongoose from "mongoose";
import sendmail from "../utils/mailer";
import { SendMailOptions } from "nodemailer";
import ChatModel from "../models/chat";

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
  marketplace: "GalaxyService" | "studio43" | "NorthernEats";
  category: string;
  items: OrderItem[];
  paymentMethod: "E-transfer" | "Shake Pay"  | "paypal"
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
      marketplace,
      category,
      items,
      paymentMethod,
      totalAmount,
      //tax = 0,
      shippingCost = 0,
    //  discount = 0,
      shipping,
      notes
    } = req.body;

    if (!customerId || !marketplace || !category || !items || items.length === 0 || !shipping || !paymentMethod || !totalAmount) {
     res.status(400).json({
        message: "Required fields missing: customerId, marketplace, category, items, payment method, totalAmount, and shipping details are required"
      });
      return 
    }

    // validating if the item contains required feild 
    for (const item of items) {
      if (!item.name || !item.price || !item.quantity) {
        res.status(400).json({
          message: "Each item must have  name, price, and quantity"
        });
        return
      }
    }

    // calculating final amount 
    const finalAmount = totalAmount  + shippingCost;

    // creating new orders 
    const order = new OrderModel({
      orderNumber: generateOrderNumber(),
      customerId,
      marketplace,
      category,
      status: "pending",
      items,
      totalAmount,
     // tax,
      shippingCost,
      //discount,
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
      lastUpdatedAt: new Date()
    });

    await order.save();

    const chat = new ChatModel({
      orderId: order.id.toString(),
      customerId: customerId,
      messages: [{
        sender: "system",
        content: `Chat started for order #${order.orderNumber}`,
        timestamp: new Date(),
        read: true
      }]
    });
    
    await chat.save();
    
    // Notify admin via socket.io if you're using it
    const io = req.app.get('io');
    if (io) {
      io.emit('new-chat', { 
        orderId: order._id,
        customerId: customerId,
        orderNumber: order.orderNumber 
      });
    }
    
    
    const orderConfirmationMail = (to: string, orderNumber: string, finalAmount: number): SendMailOptions => ({
      from: `"Ghost Market 👻" <${process.env.EMAIL_USER_NAME}>`,
      to,
      subject: `🎉 Your Ghost Market Order #${orderNumber} is Confirmed!`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
          <h2 style="color: #222;">Thank you for your order! 👻</h2>
          <p>Hello!</p>
          <p>Your order <strong>#${orderNumber}</strong> has been successfully placed on <strong>Ghost Market</strong>.</p>
          <p><strong>Total Amount:</strong> $${finalAmount}</p>
          <p>We’re currently processing your order and will notify you once it’s ready for shipping.</p>
          <p>Thank you for shopping with us!</p>
          <p style="margin-top: 30px;">– The Ghost Market Team 👻</p>
          <hr style="margin: 40px 0;" />
          <small style="color: #888;">You received this email because you placed an order on Ghost Market.</small>
        </div>
      `
    });

    await sendmail(orderConfirmationMail(req.user.email, order.orderNumber, order.finalAmount));

    
 res.status(201).json({
      message: "Order successfully created",
      order
    });
       
    return 
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create order" });
    return
  }
};

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
