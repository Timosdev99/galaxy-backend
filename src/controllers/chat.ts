import { Request, Response } from "express";
import ChatModel from "../models/chat";
import OrderModel from "../models/order";
import mongoose from "mongoose";

// start a new chat for an order 
export const startChat = async (req: Request, res: Response) => {
  try {
    const { orderId, message } = req.body;
    
    if (!orderId || !message) {
      res.status(400).json({ message: "Order ID and message are required" });
      return;
    }
    
    // check if order exist and belong to user 
    const order = await OrderModel.findById(orderId);
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }
    
    if (order.customerId != req.user._id) {
      res.status(403).json({ message: "Unauthorized: This order doesn't belong to you" });
      return;
    }
    
    // checking if chat already exiist 
    let chat = await ChatModel.findOne({ orderId });
    
    if (chat) {
      // add message to existing chat
      chat.messages.push({
        senderId: req.user._id,
        senderRole: 'user',
        message,
        timestamp: new Date(),
        read: false
      });
      
      chat.lastMessage = new Date();
      chat.open = true;
      
      await chat.save();
    } else {
      // create new chat
      chat = new ChatModel({
        orderId,
        customerId: req.user._id,
        messages: [{
          senderId: req.user._id,
          senderRole: 'user',
          message,
          timestamp: new Date(),
          read: false
        }],
        lastMessage: new Date(),
        open: true
      });
      
      await chat.save();
    }
    
    res.status(200).json({
      message: "Message sent successfully",
      chat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to send message" });
  }
};

// admin reply to chat 
export const adminReply = async (req: Request, res: Response) => {
  try {
    // verify admin role 
    if (req.user.role !== "admin") {
      res.status(403).json({ message: "Unauthorized: Admin access required" });
      return;
    }
    
    const { chatId, message } = req.body;
    
    if (!chatId || !message) {
      res.status(400).json({ message: "Chat ID and message are required" });
      return;
    }
    
    const chat = await ChatModel.findById(chatId);
    
    if (!chat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }
    
    // and add admin message
    chat.messages.push({
      senderId: req.user._id,
      senderRole: 'admin',
      message,
      timestamp: new Date(),
      read: false
    });
    
    chat.lastMessage = new Date();
    await chat.save();
    
    res.status(200).json({
      message: "Reply sent successfully",
      chat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to send reply" });
  }
};

// get all chats for a user
export const getUserChats = async (req: Request, res: Response) => {
  try {
    const chats = await ChatModel.find({ customerId: req.user._id })
      .sort({ lastMessage: -1 });
      
    res.status(200).json({
      chats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch chats" });
  }
};

// get all chats for admin
export const getAdminChats = async (req: Request, res: Response) => {
  try {
    // verify admin role
    if (req.user.role !== "admin") {
      res.status(403).json({ message: "Unauthorized: Admin access required" });
      return;
    }
    
    const { open } = req.query;
    const filter: any = {};
    
    if (open === 'true') filter.open = true;
    else if (open === 'false') filter.open = false;
    
    const chats = await ChatModel.find(filter)
      .sort({ lastMessage: -1 })
      .populate('customerId', 'name email')
      .populate('orderId', 'orderNumber');
      
    res.status(200).json({
      chats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch chats" });
  }
};

// get a specific chat by ID
export const getChatById = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    
    const chat = await ChatModel.findById(chatId)
      .populate('customerId', 'name email')
      .populate('orderId');
      
    if (!chat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }
    
    // Check if user is authorized to access this chat
    if (req.user.role !== "admin" && !chat.customerId.equals(req.user._id)) {
      res.status(403).json({ message: "Unauthorized: You don't have access to this chat" });
      return;
    }
    
    // Mark all messages as read if user is the recipient
    if (req.user.role === "admin") {
      await ChatModel.updateOne(
        { _id: chatId },
        { $set: { "messages.$[elem].read": true } },
        { arrayFilters: [{ "elem.senderRole": "user", "elem.read": false }] }
      );
    } else {
      await ChatModel.updateOne(
        { _id: chatId },
        { $set: { "messages.$[elem].read": true } },
        { arrayFilters: [{ "elem.senderRole": "admin", "elem.read": false }] }
      );
    }
    
    // Fetch updated chat
    const updatedChat = await ChatModel.findById(chatId)
      .populate('customerId', 'name email')
      .populate('orderId');
    
    res.status(200).json({
      chat: updatedChat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch chat" });
  }
};

// Close a chat (Admin only)
export const closeChat = async (req: Request, res: Response) => {
  try {
    // Verify admin role
    if (req.user.role !== "admin") {
      res.status(403).json({ message: "Unauthorized: Admin access required" });
      return;
    }
    
    const { chatId } = req.params;
    
    const chat = await ChatModel.findByIdAndUpdate(
      chatId,
      { open: false },
      { new: true }
    );
    
    if (!chat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }
    
    res.status(200).json({
      message: "Chat closed successfully",
      chat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to close chat" });
  }
};

// Reopen a chat (Admin only)
export const reopenChat = async (req: Request, res: Response) => {
  try {
    // Verify admin role
    if (req.user.role !== "admin") {
      res.status(403).json({ message: "Unauthorized: Admin access required" });
      return;
    }
    
    const { chatId } = req.params;
    
    const chat = await ChatModel.findByIdAndUpdate(
      chatId,
      { open: true },
      { new: true }
    );
    
    if (!chat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }
    
    res.status(200).json({
      message: "Chat reopened successfully",
      chat
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to reopen chat" });
  }
};