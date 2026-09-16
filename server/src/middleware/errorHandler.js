export function errorHandler(err, req, res, next) {
  console.error('[PASCONX ERROR]', err);

  // Avoid leaking raw stack traces or internal SQL syntax in production
  const status = err.status || err.statusCode || 500;
  const message = err.clientMessage || (status === 500 ? 'An unexpected server error occurred. Please try again later.' : err.message);

  res.status(status).json({
    success: false,
    error: message
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl}`
  });
}
