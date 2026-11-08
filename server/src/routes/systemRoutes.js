import { Router } from 'express';
import { getMaintenance } from '../controllers/systemController.js';

const router = Router();

// Public endpoint to check system maintenance status
router.get('/maintenance', getMaintenance);

export default router;
