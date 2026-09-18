import app from '../server/src/app.js';

export default function handler(req, res) {
  // Normalize req.url to ensure Express /api routes match on Vercel
  if (!req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  return app(req, res);
}
