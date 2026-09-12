/**
 * Input sanitization utilities for HTML content fields.
 * These functions strip potentially dangerous content while preserving safe text.
 */

/**
 * Strips HTML tags from a string, returning plain text.
 * @param {string} input - The input string
 * @returns {string} - The sanitized plain text
 */
function stripHtmlTags(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Escapes HTML entities to prevent XSS attacks.
 * @param {string} input - The input string
 * @returns {string} - The escaped string safe for HTML insertion
 */
function escapeHtmlEntities(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes content for safe storage in the database.
 * Removes potentially dangerous characters while preserving readable text.
 * @param {string} input - The input string
 * @param {Object} options - Sanitization options
 * @param {boolean} options.allowLineBreaks - Allow newlines (default: true)
 * @param {boolean} options.trim - Trim whitespace (default: true)
 * @returns {string} - The sanitized string
 */
function sanitizeContent(input, options = {}) {
  if (typeof input !== 'string') return '';
  
  const { allowLineBreaks = true, trim = true } = options;
  
  let sanitized = input;
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  // Remove control characters except newlines and tabs
  if (!allowLineBreaks) {
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
  
  // Trim whitespace if requested
  if (trim) {
    sanitized = sanitized.trim();
  }
  
  return sanitized;
}

/**
 * Validates and sanitizes a URL to prevent XSS and other attacks.
 * @param {string} url - The URL to validate
 * @returns {string|null} - The sanitized URL or null if invalid
 */
function sanitizeUrl(url) {
  if (typeof url !== 'string') return null;
  
  const trimmed = url.trim();
  if (!trimmed) return null;
  
  // Only allow http and https protocols
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitizes user input for display in the admin dashboard.
 * Preserves basic formatting but removes dangerous content.
 * @param {string} input - The input string
 * @returns {string} - The sanitized string safe for display
 */
function sanitizeForDisplay(input) {
  if (typeof input !== 'string') return '';
  
  return sanitizeContent(input, { allowLineBreaks: true, trim: false });
}

/**
 * Validates and sanitizes a name field.
 * @param {string} name - The name to validate
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum length (default: 1)
 * @param {number} options.maxLength - Maximum length (default: 100)
 * @returns {{ valid: boolean, value: string, error: string|null }} - Validation result
 */
function sanitizeName(name, options = {}) {
  const { minLength = 1, maxLength = 100 } = options;
  
  if (typeof name !== 'string') {
    return { valid: false, value: '', error: 'Name is required' };
  }
  
  const sanitized = sanitizeContent(name, { allowLineBreaks: false });
  
  if (sanitized.length < minLength) {
    return { valid: false, value: sanitized, error: `Name must be at least ${minLength} characters` };
  }
  
  if (sanitized.length > maxLength) {
    return { valid: false, value: sanitized, error: `Name must be at most ${maxLength} characters` };
  }
  
  return { valid: true, value: sanitized, error: null };
}

module.exports = {
  escapeHtmlEntities,
  getPasswordStrengthErrors,
  sanitizeContent,
  sanitizeForDisplay,
  sanitizeName,
  sanitizeUrl,
  stripHtmlTags
};
