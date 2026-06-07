/**
 * Input validation utilities
 * Provides type-safe validation for API request payloads
 */

export class ValidationError extends Error {
  constructor(
    public field: string,
    message: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Validate that a string is a valid UUID v4
 */
export function validateUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Validate that a string is a valid email
 */
export function validateEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 255;
}

/**
 * Validate that a string is a valid ISO 8601 date
 */
export function validateDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value);
}

/**
 * Validate that a value is a positive number
 */
export function validatePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && Number.isFinite(value);
}

/**
 * Validate that a value is a non-negative number
 */
export function validateNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value);
}

/**
 * Sanitize a string to prevent XSS
 */
export function sanitizeString(value: unknown, maxLength = 1000): string {
  if (typeof value !== 'string') return '';
  return value
    .slice(0, maxLength)
    .replace(/[<>\"']/g, (char) => ({
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char] || char);
}

/**
 * Validate that a string is a strong password
 * Requirements: 8+ chars, at least one uppercase, one lowercase, one number, one special char
 */
export function validatePassword(value: unknown): { valid: boolean; issues: string[] } {
  if (typeof value !== 'string') {
    return { valid: false, issues: ['Password must be a string'] };
  }

  const issues: string[] = [];

  if (value.length < 8) issues.push('Password must be at least 8 characters');
  if (!/[A-Z]/.test(value)) issues.push('Password must contain an uppercase letter');
  if (!/[a-z]/.test(value)) issues.push('Password must contain a lowercase letter');
  if (!/[0-9]/.test(value)) issues.push('Password must contain a number');
  if (!/[!@#$%^&*()_+=\-\[\]{};:'",.<>?/\\|`~]/.test(value)) {
    issues.push('Password must contain a special character');
  }

  return { valid: issues.length === 0, issues };
}
