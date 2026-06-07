/**
 * Environment validation and configuration
 * Runs on server startup to ensure all required env vars are set
 */

interface EnvConfig {
  databaseUrl: string;
  nodeEnv: 'development' | 'production' | 'test';
  appUrl: string;
  secureCookies: boolean;
  sessionCookieName: string;
  sessionCookieMaxAge: number;
}

function validateEnv(): EnvConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  const nodeEnv = (process.env.NODE_ENV || 'development') as EnvConfig['nodeEnv'];
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}. Must be development, production, or test`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_APP_URL');
  }

  // Validate app URL is a valid URL
  try {
    new URL(appUrl);
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_APP_URL: ${appUrl}. Must be a valid URL`);
  }

  // Production security checks
  if (nodeEnv === 'production') {
    if (!process.env.NEXT_PUBLIC_SECURE_COOKIES || process.env.NEXT_PUBLIC_SECURE_COOKIES === 'false') {
      console.warn('⚠️  WARNING: NEXT_PUBLIC_SECURE_COOKIES is not enabled in production. Cookies will be sent over HTTP.');
    }
    if (appUrl.startsWith('http://')) {
      console.warn('⚠️  WARNING: NEXT_PUBLIC_APP_URL is HTTP in production. Use HTTPS for security.');
    }
  }

  const secureCookies = process.env.NEXT_PUBLIC_SECURE_COOKIES === 'true' || nodeEnv === 'production';
  const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'ffp_session_user';
  const sessionCookieMaxAge = parseInt(process.env.SESSION_COOKIE_MAX_AGE || '604800', 10); // 7 days default

  if (isNaN(sessionCookieMaxAge) || sessionCookieMaxAge <= 0) {
    throw new Error('Invalid SESSION_COOKIE_MAX_AGE: must be a positive number');
  }

  return {
    databaseUrl,
    nodeEnv,
    appUrl,
    secureCookies,
    sessionCookieName,
    sessionCookieMaxAge,
  };
}

// Validate on import (server-side only)
let config: EnvConfig | undefined;
if (typeof window === 'undefined') {
  try {
    config = validateEnv();
  } catch (error) {
    console.error('❌ Environment validation failed:', error);
    process.exit(1);
  }
}

export function getEnv(): EnvConfig {
  if (!config) {
    throw new Error('Environment not initialized. This should not happen.');
  }
  return config;
}
