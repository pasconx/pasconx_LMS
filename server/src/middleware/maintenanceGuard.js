import { isMaintenanceActive, getMaintenanceConfig } from '../controllers/systemController.js';

/**
 * Middleware that blocks non-admin traffic when platform maintenance mode is enabled.
 */
export async function checkMaintenanceMode(req, res, next) {
  try {
    const active = await isMaintenanceActive();
    if (!active) {
      return next();
    }

    // Admins are always allowed through to maintain, manage, and toggle settings
    if (req.user && req.user.role === 'ADMIN') {
      return next();
    }

    const config = await getMaintenanceConfig();
    return res.status(503).json({
      success: false,
      code: 'MAINTENANCE_MODE',
      error: config.message || 'The PASCONX platform is currently undergoing scheduled maintenance.',
      maintenance: {
        enabled: true,
        title: config.title,
        message: config.message
      }
    });
  } catch (error) {
    // If check fails unexpectedly, do not break application flow
    console.error('Maintenance guard error:', error);
    next();
  }
}
