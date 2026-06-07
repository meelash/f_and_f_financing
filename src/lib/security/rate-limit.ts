/**
 * Rate limiting utility for API endpoints
 * Implements sliding window rate limiting based on IP/identifier
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

// In-memory store for rate limits (use Redis for production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > 1000 * 60 * 60) {
      // Remove if window is older than 1 hour
      rateLimitStore.delete(key);
    }
  }
}, 1000 * 60 * 5); // Every 5 minutes

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  blockSeconds?: number; // Blocking duration after exceeding limit
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (IP, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const key = `rate_limit:${identifier}`;

  let entry = rateLimitStore.get(key);

  // Check if blocked
  if (entry?.blockedUntil && now < entry.blockedUntil) {
    const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.blockedUntil),
      retryAfter,
    };
  }

  // Initialize or reset window if expired
  const windowMs = config.windowSeconds * 1000;
  if (!entry || now - entry.windowStart > windowMs) {
    entry = {
      count: 0,
      windowStart: now,
    };
    rateLimitStore.set(key, entry);
  }

  // Increment counter
  entry.count++;

  // Check if limit exceeded
  const exceeded = entry.count > config.maxRequests;
  if (exceeded && config.blockSeconds) {
    entry.blockedUntil = now + config.blockSeconds * 1000;
  }

  const resetAt = new Date(entry.windowStart + windowMs);

  return {
    allowed: !exceeded,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetAt,
    retryAfter: exceeded ? config.blockSeconds : undefined,
  };
}

/**
 * Clear rate limit for an identifier (e.g., after successful verification)
 */
export function clearRateLimit(identifier: string): void {
  rateLimitStore.delete(`rate_limit:${identifier}`);
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(identifier: string): RateLimitEntry | null {
  return rateLimitStore.get(`rate_limit:${identifier}`) || null;
}
