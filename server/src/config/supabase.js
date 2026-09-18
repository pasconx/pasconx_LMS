import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure environment variables are loaded if imported before app.js
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

/**
 * Active data backend selector: 'sqlite' | 'supabase'
 * Defaults strictly to 'sqlite' for zero-regression safety.
 */
export const DATA_BACKEND = process.env.DATA_BACKEND || 'sqlite';

/**
 * Helper boolean indicating if Supabase is the active backend
 */
export const isSupabase = DATA_BACKEND === 'supabase';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || supabaseServiceRoleKey;

/**
 * Helper boolean indicating if Supabase environment variables are configured
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);

/**
 * Server-side Supabase administrative client initialized with service_role key.
 * Used for database queries and token verification without session pollution.
 * Configured with persistSession: false and autoRefreshToken: false for stateless Node.js execution.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Client for user password authentication requests.
 * Using anon key prevents mutating the service_role client session state.
 */
export const supabaseAuth = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Returns a Supabase client scoped to the authenticated user's session token if present.
 * This establishes auth.uid() in PostgreSQL so that RLS and security triggers
 * (like public.guard_profile_updates which evaluates public.is_admin()) execute with
 * the caller's verified identity.
 */
export function getScopedSupabaseClient(req) {
  const token = req?.cookies?.pasconix_token || req?.headers?.authorization?.replace(/^Bearer\s+/i, '');
  if (token && isSupabaseConfigured) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return supabase;
}

export default supabase;

