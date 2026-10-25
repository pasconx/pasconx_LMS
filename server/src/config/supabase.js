import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Polyfill global WebSocket if missing in Node 20 for Supabase realtime initialization
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class DummyWebSocket {};
}

// Ensure environment variables are loaded if imported before app.js
if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY)) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

// Auto-detect serverless Vercel environment and ensure DATA_BACKEND is supabase
if (process.env.VERCEL && !process.env.DATA_BACKEND) {
  process.env.DATA_BACKEND = 'supabase';
}

/**
 * Active data backend selector: 'sqlite' | 'supabase'
 * Defaults strictly to 'sqlite' for zero-regression safety locally,
 * but defaults to 'supabase' on Vercel since SQLite is non-persistent in serverless lambda.
 */
export const DATA_BACKEND = process.env.DATA_BACKEND || (process.env.VERCEL ? 'supabase' : 'sqlite');

/**
 * Helper boolean indicating if Supabase is the active backend
 */
export const isSupabase = DATA_BACKEND === 'supabase';

const DEFAULT_SUPABASE_URL = 'https://qpmedrprhnavmsetectk.supabase.co';

const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || supabaseServiceRoleKey;

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
      realtime: { disabled: true }
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
      realtime: { disabled: true }
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
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { disabled: true }
    });
  }
  return supabase;
}

export default supabase;
