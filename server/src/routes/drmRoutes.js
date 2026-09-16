import { Router } from 'express';
import express from 'express';
import { handleWidevineLicense } from '../controllers/drmController.js';

const router = Router();

// License request endpoint accepts binary DRM EME challenges
router.post(
  '/license',
  express.raw({ type: ['application/octet-stream', '*/*'], limit: '2mb' }),
  handleWidevineLicense
);

export default router;
