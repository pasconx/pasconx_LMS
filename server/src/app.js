import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import drmRoutes from './routes/drmRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { initDatabase } from './config/database.js';

dotenv.config();

// Ensure database tables exist
initDatabase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, '../../client/dist');

const app = express();

// Security headers with relaxed CSP for YouTube player iframes
app.use(helmet({
  contentSecurityPolicy: false, // Relaxed for embedding YouTube iframes in client
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://localhost:5000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow during local testing
    }
  },
  credentials: true
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiter to general API if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.use('/api', apiLimiter);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'PASCONX Video Portal API',
    videoProvider: process.env.VIDEO_PROVIDER || 'youtube'
  });
});

// Lightweight proxy endpoint for Google Drive & external course thumbnails (bypasses browser Referer blocks)
app.get('/api/proxy/thumbnail', async (req, res) => {
  try {
    const { id, url } = req.query;
    let targetUrl = '';
    if (id && typeof id === 'string') {
      targetUrl = `https://lh3.googleusercontent.com/d/${id.trim()}`;
    } else if (url && typeof url === 'string') {
      const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i)
        || url.match(/drive\.google\.com\/(?:uc|open)\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i)
        || url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
      if (driveMatch && driveMatch[1]) {
        targetUrl = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        targetUrl = url;
      }
    }

    if (!targetUrl) {
      return res.status(400).send('Invalid thumbnail target');
    }

    const response = await fetch(targetUrl);
    if (!response.ok) {
      const driveId = id || (targetUrl.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i)?.[1]);
      if (driveId) {
        const fbRes = await fetch(`https://drive.google.com/thumbnail?id=${driveId}&sz=w800`);
        if (fbRes.ok) {
          res.setHeader('Content-Type', fbRes.headers.get('content-type') || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          const arrayBuffer = await fbRes.arrayBuffer();
          return res.send(Buffer.from(arrayBuffer));
        }
      }
      return res.status(response.status).send('Failed to fetch thumbnail');
    }

    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).send('Thumbnail proxy error');
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/drm', drmRoutes);

// Direct playback authorization alias: GET /api/videos/:videoId/play
app.get('/api/videos/:videoId/play', (req, res, next) => {
  req.url = `/videos/${req.params.videoId}/play`;
  return studentRoutes(req, res, next);
});

// Serve client production build if available
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Fallbacks & Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
