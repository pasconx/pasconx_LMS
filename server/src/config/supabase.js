import { createClient } from '@supabase/supabase-js';
import {
  loadEnvironmentFiles,
  validateEnvironment,
  detectEnvironment,
  extractProjectRef,
  DEV_SUPABASE_REF
} from './envValidator.js';

// Polyfill global WebSocket if missing in Node 20/22 for Supabase realtime initialization
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class DummyWebSocket {};
}

// 1. Ensure prioritized environment variables are loaded (.env.local over .env)
loadEnvironmentFiles();

// Auto-detect serverless Vercel environment and ensure DATA_BACKEND is supabase
if (process.env.VERCEL && !process.env.DATA_BACKEND) {
  process.env.DATA_BACKEND = 'supabase';
}

/**
 * Active data backend selector: 'sqlite' | 'supabase'
 */
export const DATA_BACKEND = process.env.DATA_BACKEND || (process.env.VERCEL ? 'supabase' : 'sqlite');

/**
 * Helper boolean indicating if Supabase is the active backend
 */
export const isSupabase = DATA_BACKEND === 'supabase';

/**
 * 2. Validate environment & guard against cross-environment pollution
 */
export const activeEnvironment = detectEnvironment();
let envReport = null;

try {
  envReport = validateEnvironment();
} catch (err) {
  if (isSupabase) {
    console.error('\n' + '='.repeat(60));
    console.error(' [PASCONX FATAL SECURITY / CONFIG ERROR]');
    console.error(' ' + err.message);
    console.error('='.repeat(60) + '\n');
    throw err;
  } else {
    // When SQLite is used locally, log notice without halting
    console.warn('[PASCONX ENV NOTICE]:', err.message);
  }
}

// Supabase Connection Credentials (NO silent fallback to production)
const supabaseUrl = process.env.SUPABASE_URL || null;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || supabaseSecretKey;
export const supabaseJwksUrl = process.env.SUPABASE_JWKS_URL || null;

export const projectRef = extractProjectRef(supabaseUrl);

/**
 * Helper boolean indicating if Supabase environment variables are configured
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseSecretKey);

/**
 * Server-side Supabase administrative client initialized with secret/service_role key.
 * Used for database queries and token verification without session pollution.
 * Configured with persistSession: false and autoRefreshToken: false for stateless Node.js execution.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: { disabled: true }
    })
  : null;

/**
 * Client for user password authentication requests.
 * Using publishable/anon key prevents mutating the service_role client session state.
 */
export const supabaseAuth = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
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
    return createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { disabled: true }
    });
  }
  return supabase;
}

export default supabase;
