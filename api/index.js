import app from '../server/src/app.js';

export default function handler(req, res) {
  // If Vercel rewrote the URL to /api/index.js, recover original URL from x-matched-path
  if (req.headers['x-matched-path'] && req.headers['x-matched-path'] !== '/api/index.js') {
    req.url = req.headers['x-matched-path'];
  }

  // Normalize req.url to ensure Express /api routes match on Vercel
  if (!req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  return app(req, res);
}
