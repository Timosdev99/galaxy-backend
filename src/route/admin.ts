
import { Router } from 'express';
import AdminController from '../controllers/admin/marketplace';
import { Admin } from '../middlewares/rbac';
import { authToken } from '../middlewares/auth';

const router = Router();

// Marketplace routes
router.get('/marketplaces',  AdminController.getMarketplaces);
router.get('/marketplaces/:id', authToken, Admin, AdminController.getMarketplaceById);
router.post('/marketplaces', AdminController.createMarketplace);
router.put('/marketplaces/:id', authToken, Admin, AdminController.updateMarketplace);
router.delete('/marketplaces/:id', authToken, Admin, AdminController.deleteMarketplace);

// Service routes
router.get('/marketplaces/:marketplaceId/services', authToken, Admin, AdminController.getMarketplaceServices);
router.post('/services', authToken, Admin, AdminController.createService);
router.put('/services/:id', authToken, Admin, AdminController.updateService);
router.delete('/services/:id', authToken, Admin, AdminController.deleteService);

export default router; 