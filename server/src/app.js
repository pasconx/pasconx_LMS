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
import { verifyCloudflareOrigin } from './middleware/originShield.js';
import { initDatabase } from './config/database.js';
import { logger } from './utils/logger.js';

dotenv.config();

// Ensure database tables exist
initDatabase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, '../../client/dist');

const app = express();

// Trust reverse proxy (Vercel / Cloudflare edge) so req.ip and req.protocol are accurate
app.set('trust proxy', 1);

// Security headers with relaxed CSP for YouTube player iframes
app.use(helmet({
  contentSecurityPolicy: false, // Relaxed for embedding YouTube iframes in client
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Auto-detect serverless Vercel environment and ensure DATA_BACKEND is supabase
if (process.env.VERCEL && !process.env.DATA_BACKEND) {
  process.env.DATA_BACKEND = 'supabase';
}

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'https://pasconx.vercel.app',
  'https://pasconx-lms.vercel.app'
].filter(Boolean);

if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach((o) => {
    const trimmed = o.trim();
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

function isOriginAllowed(origin, req) {
  // Allow requests with no origin (e.g. same-origin, curl, server-to-server)
  if (!origin) return true;

  // Check explicit whitelist
  if (allowedOrigins.includes(origin)) return true;

  try {
    const parsed = new URL(origin);

    // Allow ALL Vercel deployment domains (*.vercel.app)
    if (parsed.hostname.endsWith('.vercel.app')) {
      return true;
    }

    // Allow localhost / 127.0.0.1 on any port in dev/testing
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }

    // Allow requests matching host header (same-host origin)
    const host = req?.headers?.host;
    if (host && (parsed.host === host || parsed.hostname === host.split(':')[0])) {
      return true;
    }
  } catch (e) {
    // Malformed origin URL
  }

  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isOriginAllowed(origin, req)) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, cf-turnstile-response, X-Pasconx-Origin-Secret');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  }

  // Untrusted origin in production
  if (process.env.NODE_ENV === 'production') {
    logger.warn(`CORS: blocked untrusted origin in production: ${origin}`);
    return res.status(403).json({
      success: false,
      error: `CORS policy violation: origin ${origin} is not allowed.`
    });
  }

  // Allow in dev mode with warning
  logger.warn(`CORS: request from non-whitelisted origin in dev mode: ${origin}`);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Cloudflare edge tracking and dynamic API cache protection
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const cfRay = req.headers['cf-ray'];
  if (cfRay) {
    res.setHeader('CF-Ray', cfRay);
  }
  next();
});

// Protect API routes from direct origin bypass if origin secret is configured
app.use('/api', verifyCloudflareOrigin);

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
