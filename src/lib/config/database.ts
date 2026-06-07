/**
 * Database connection pool configuration
 * Applies connection pooling settings based on environment
 */

import { getEnv } from './env';

export function getDatabaseUrl(): string {
  const env = getEnv();
  const url = new URL(env.databaseUrl);

  // Add connection pool parameters for production
  if (env.nodeEnv === 'production') {
    const poolMin = parseInt(process.env.DATABASE_POOL_MIN || '2', 10);
    const poolMax = parseInt(process.env.DATABASE_POOL_MAX || '10', 10);

    url.searchParams.set('min_pool_size', String(poolMin));
    url.searchParams.set('max_pool_size', String(poolMax));
    url.searchParams.set('connect_timeout', '10s');
    url.searchParams.set('statement_timeout', '30s');
  }

  return url.toString();
}

export function getPoolConfig() {
  const env = getEnv();

  if (env.nodeEnv === 'production') {
    return {
      min: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
      max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
    };
  }

  // Development defaults
  return {
    min: 1,
    max: 5,
  };
}
