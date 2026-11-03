import { db } from '../config/database.js';
import { supabase, isSupabase } from '../config/supabase.js';
import { logSecurityEvent } from '../utils/auditLogger.js';

const DEFAULT_MAINTENANCE_CONFIG = {
  enabled: false,
  title: "We're Under Maintenance",
  message: "Our platform is currently undergoing scheduled maintenance to improve performance, security and your learning experience."
};

// In-memory cache for fast lookups with 5s TTL
let cachedMaintenance = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 1000;

export function invalidateMaintenanceCache() {
  cachedMaintenance = null;
  cacheExpiresAt = 0;
}

/**
 * Helper to fetch raw maintenance object from active backend
 */
export async function getMaintenanceConfig() {
  const now = Date.now();
  if (cachedMaintenance && now < cacheExpiresAt) {
    return cachedMaintenance;
  }

  let result = { ...DEFAULT_MAINTENANCE_CONFIG };

  try {
    if (isSupabase && supabase) {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value, updated_at')
        .eq('key', 'maintenance_mode')
        .single();

      if (!error && data?.value) {
        const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        result = {
          enabled: Boolean(val.enabled),
          title: val.title || DEFAULT_MAINTENANCE_CONFIG.title,
          message: val.message || DEFAULT_MAINTENANCE_CONFIG.message,
          updated_at: data.updated_at || val.updated_at || new Date().toISOString()
        };
      }
    } else if (db && typeof db.prepare === 'function') {
      const row = db.prepare("SELECT value, updated_at FROM system_settings WHERE key = 'maintenance_mode'").get();
      if (row?.value) {
        const val = JSON.parse(row.value);
        result = {
          enabled: Boolean(val.enabled),
          title: val.title || DEFAULT_MAINTENANCE_CONFIG.title,
          message: val.message || DEFAULT_MAINTENANCE_CONFIG.message,
          updated_at: row.updated_at || val.updated_at || new Date().toISOString()
        };
      }
    }
  } catch (err) {
    console.warn('Notice: Error reading maintenance config, falling back to default:', err.message);
  }

  cachedMaintenance = result;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return result;
}

/**
 * Returns true if maintenance mode is currently active
 */
export async function isMaintenanceActive() {
  const config = await getMaintenanceConfig();
  return Boolean(config.enabled);
}

/**
 * Public controller: GET /api/system/maintenance
 */
export async function getMaintenance(req, res, next) {
  try {
    const config = await getMaintenanceConfig();
    return res.json({
      success: true,
      maintenance: config
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin controller: POST /api/admin/maintenance
 */
export async function updateMaintenance(req, res, next) {
  try {
    const { enabled, title, message } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'The "enabled" field (boolean) is required.'
      });
    }

    const current = await getMaintenanceConfig();
    const updatedValue = {
      enabled,
      title: (title !== undefined && title !== null) ? String(title).trim() : current.title,
      message: (message !== undefined && message !== null) ? String(message).trim() : current.message,
      updated_at: new Date().toISOString()
    };

    if (isSupabase && supabase) {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key: 'maintenance_mode',
          value: updatedValue,
          description: 'Controls whether student access is suspended during system maintenance',
          updated_at: updatedValue.updated_at
        });

      if (error) {
        return res.status(500).json({
          success: false,
          error: `Failed to update maintenance settings in Supabase: ${error.message}`
        });
      }
    } else if (db && typeof db.prepare === 'function') {
      db.prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('maintenance_mode', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET 
          value = excluded.value,
          updated_at = excluded.updated_at
      `).run(JSON.stringify(updatedValue));
    }

    invalidateMaintenanceCache();

    logSecurityEvent({
      userId: req.user?.id,
      eventType: enabled ? 'MAINTENANCE_MODE_ENABLED' : 'MAINTENANCE_MODE_DISABLED',
      resourceType: 'system_setting',
      resourceId: 'maintenance_mode',
      req,
      status: 'SUCCESS',
      details: `Admin ${req.user?.email || req.user?.id} set maintenance mode to ${enabled ? 'ACTIVE' : 'INACTIVE'}`
    });

    return res.json({
      success: true,
      message: enabled 
        ? 'Maintenance mode has been successfully enabled. Student access is now suspended.'
        : 'Maintenance mode has been deactivated. Platform operations are restored.',
      maintenance: updatedValue
    });
  } catch (error) {
    next(error);
  }
}
