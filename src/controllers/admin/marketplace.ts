
import { Request, Response } from "express";
import MarketplaceModel from "../../models/marketplace";
import ServiceModel from "../../models/service";

// Get all marketplaces
export const getMarketplaces = async (req: Request, res: Response) => {
  try {
    const marketplaces = await MarketplaceModel.find();
    
    res.status(200).json({
      marketplaces,
      count: marketplaces.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch marketplaces" });  
  }
};

// Get single marketplace by ID
export const getMarketplaceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const marketplace = await MarketplaceModel.findById(id);
    
    if (!marketplace) {
      res.status(404).json({ message: "Marketplace not found" });
       return
    }

    res.status(200).json({
      marketplace
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch marketplace" });
  }
};

// Create new marketplace
export const createMarketplace = async (req: Request, res: Response) => {
  try {
    const { name, description, icon, colorScheme } = req.body;
    
    if (!name || !description ) {
      res.status(400).json({ message: "Name, description and icon are required" });
      return
    }

    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    
    const marketplace = new MarketplaceModel({
      name,
      slug,
      description,
      icon,
      colorScheme: colorScheme || {
        primary: "#4f46e5",
        secondary: "#6366f1"
      }
    });

    await marketplace.save();

    res.status(201).json({
      message: "Marketplace created successfully",
      marketplace
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create marketplace" });
  }
};

// Update marketplace
export const updateMarketplace = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Prevent slug updates
    if (updateData.slug) {
      delete updateData.slug;
    }

    const marketplace = await MarketplaceModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!marketplace) {
      res.status(404).json({ message: "Marketplace not found" });
      return
    }

    res.status(200).json({
      message: "Marketplace updated successfully",
      marketplace
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update marketplace" });
  }
};

// Delete marketplace
export const deleteMarketplace = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if marketplace has services
    const servicesCount = await ServiceModel.countDocuments({ marketplace: id });
    if (servicesCount > 0) {
     res.status(400).json({ 
        message: "Cannot delete marketplace with active services. Delete services first."
      });
      return
    }

    const marketplace = await MarketplaceModel.findByIdAndDelete(id);

    if (!marketplace) {
     res.status(404).json({ message: "Marketplace not found" });
     return
    }


    res.status(200).json({
      message: "Marketplace deleted successfully"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete marketplace" });
  }
};

// Get services for marketplace
export const getMarketplaceServices = async (req: Request, res: Response) => {
  try {
    const { marketplaceId } = req.params;
    
    const services = await ServiceModel.find({ marketplace: marketplaceId });
    
    res.status(200).json({
      services,
      count: services.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch services" });
  }
};

// Create service for marketplace
export const createService = async (req: Request, res: Response) => {
  try {
    const { marketplaceId, name, description, discountPercentage, orderFormFields } = req.body;
    
    if (!marketplaceId || !name || !description || discountPercentage === undefined) {
      res.status(400).json({ message: "Required fields missing" });
      return 
    }

    const service = new ServiceModel({
      marketplace: marketplaceId,
      name,
      description,
      discountPercentage,
      orderFormFields: orderFormFields || []
    });

    await service.save();

    res.status(201).json({
      message: "Service created successfully",
      service
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create service" });
  }
};

// Update service
export const updateService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const service = await ServiceModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!service) {
      res.status(404).json({ message: "Service not found" });
      return
    }

    res.status(200).json({
      message: "Service updated successfully",
      service
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update service" });
  }
};

// Delete service
export const deleteService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const service = await ServiceModel.findByIdAndDelete(id);

    if (!service) {
    res.status(404).json({ message: "Service not found" });
    return
    }

    res.status(200).json({
      message: "Service deleted successfully"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete service" });
  }
};

export default {
  getMarketplaces,
  getMarketplaceById,
  createMarketplace,
  updateMarketplace,
  deleteMarketplace,
  getMarketplaceServices,
  createService,
  updateService,
  deleteService
};