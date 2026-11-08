import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Known Supabase project references
export const DEV_SUPABASE_REF = 'xorwviktjzftdfkciknj';

/**
 * Loads .env.local with priority over .env if present.
 */
export function loadEnvironmentFiles() {
  const envLocalPath = path.resolve(__dirname, '../../.env.local');
  const envPath = path.resolve(__dirname, '../../.env');
  const rootEnvLocalPath = path.resolve(__dirname, '../../../.env.local');

  // Load root or server .env.local first (takes precedence over .env, but respects existing process.env)
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: false });
  } else if (fs.existsSync(rootEnvLocalPath)) {
    dotenv.config({ path: rootEnvLocalPath, override: false });
  }

  // Then load .env for standard fallback defaults
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

/**
 * Extracts the project reference ID from a Supabase URL.
 * e.g. "https://xorwviktjzftdfkciknj.supabase.co" -> "xorwviktjzftdfkciknj"
 */
export function extractProjectRef(supabaseUrl) {
  if (!supabaseUrl) return null;
  const match = supabaseUrl.match(/https:\/\/([a-z0-9_-]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

/**
 * Detects the active deployment environment ('development' | 'production').
 */
export function detectEnvironment() {
  // Explicit override take highest priority
  if (process.env.APP_ENV) {
    return process.env.APP_ENV.toLowerCase();
  }

  // Native Vercel branch detection
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    const gitRef = process.env.VERCEL_GIT_COMMIT_REF;
    if (gitRef === 'main') {
      return 'production';
    }
    if (gitRef === 'dev') {
      return 'development';
    }
    if (process.env.VERCEL_ENV === 'production') {
      return 'production';
    }
    return 'development';
  }

  // Local development fallback
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }
  return 'development';
}

/**
 * Validates the runtime environment and prevents cross-environment pollution.
 * Throws a fatal Error if safety constraints are violated.
 */
export function validateEnvironment() {
  loadEnvironmentFiles();

  const env = detectEnvironment();
  const dataBackend = process.env.DATA_BACKEND || (process.env.VERCEL ? 'supabase' : 'sqlite');
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const projectRef = extractProjectRef(supabaseUrl);

  const report = {
    environment: env,
    dataBackend,
    projectRef,
    supabaseConfigured: Boolean(supabaseUrl && secretKey),
    status: 'VALID'
  };

  // 1. Secret Key Exposure Guard
  // Service role/secret keys must NEVER be prefixed with client-exposed prefixes
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITE_') || key.startsWith('NEXT_PUBLIC_')) {
      const val = process.env[key];
      if (val && secretKey && val === secretKey) {
        throw new Error(
          `[CRITICAL SECURITY ALERT]: Secret key detected in frontend variable "${key}". Never expose service-role or secret keys to client builds!`
        );
      }
    }
  }

  // If using Supabase as the backend, enforce strict credentials & reference checks
  if (dataBackend === 'supabase') {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!secretKey) missing.push('SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
    if (!publicKey) missing.push('SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)');

    if (missing.length > 0) {
      throw new Error(
        `[CONFIG ERROR]: DATA_BACKEND is set to "supabase", but required variables are missing: ${missing.join(', ')}.\n` +
        `Ensure .env.local (locally) or Vercel Environment Variables are configured.`
      );
    }

    if (!projectRef) {
      throw new Error(
        `[CONFIG ERROR]: Malformed SUPABASE_URL: "${supabaseUrl}". Expected format: "https://<project-ref>.supabase.co".`
      );
    }

    // 2. Strict Development Guard
    // When running in development, ONLY allow connection to the dedicated DEV Supabase project
    if (env === 'development') {
      if (projectRef !== DEV_SUPABASE_REF) {
        throw new Error(
          `[SECURITY GUARD BLOCKED STARTUP]:\n` +
          `Active Environment is "DEVELOPMENT" (Branch: dev), but SUPABASE_URL points to "${projectRef}" instead of DEV project "${DEV_SUPABASE_REF}".\n` +
          `Execution was halted immediately to prevent accidental modification of production data.\n` +
          `Please check .env.local and ensure SUPABASE_URL points to https://${DEV_SUPABASE_REF}.supabase.co`
        );
      }
    }

    // 3. Strict Production Guard
    // When running in production, NEVER allow connection to the DEV Supabase project
    if (env === 'production') {
      if (projectRef === DEV_SUPABASE_REF) {
        throw new Error(
          `[SECURITY GUARD BLOCKED STARTUP]:\n` +
          `Active Environment is "PRODUCTION" (Branch: main), but SUPABASE_URL points to the DEV project "${DEV_SUPABASE_REF}".\n` +
          `Execution was halted immediately to prevent using development database in production.\n` +
          `Please configure your production Supabase credentials in Vercel project settings.`
        );
      }
    }
  }

  return report;
}

// CLI runner for `npm run verify:env`
if (process.argv[1] && process.argv[1].endsWith('envValidator.js')) {
  try {
    const res = validateEnvironment();
    console.log('====================================================');
    console.log('   PASCONX ENVIRONMENT VALIDATION: SUCCESS         ');
    console.log(`   Active Environment : PASCONX-${res.environment.toUpperCase()}`);
    console.log(`   Data Backend       : ${res.dataBackend}`);
    console.log(`   Supabase Ref       : ${res.projectRef || 'N/A'}`);
    console.log(`   Credentials Status : ${res.supabaseConfigured ? 'CONFIGURED' : 'UNCONFIGURED'}`);
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('====================================================');
    console.error('   PASCONX ENVIRONMENT VALIDATION: FAILED          ');
    console.error('====================================================');
    console.error(err.message);
    process.exit(1);
  }
}
