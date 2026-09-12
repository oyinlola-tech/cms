function isValidEmail(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  if (!email || email.length > 254) return false;
  if (email.includes(' ')) return false;

  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex !== email.lastIndexOf('@')) return false;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (!local || !domain) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (!domain.includes('.')) return false;

  const domainParts = domain.split('.');
  if (domainParts.some((part) => part.length === 0)) return false;

  return true;
}

function isStrongEnoughPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8 || password.length > 128) return false;
  
  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) return false;
  
  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) return false;
  
  // Check for at least one digit
  if (!/[0-9]/.test(password)) return false;
  
  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return false;
  
  return true;
}

/**
 * Returns detailed password strength feedback
 * @param {string} password - The password to check
 * @returns {{ valid: boolean, errors: string[] }} - Validation result with error messages
 */
function getPasswordStrengthErrors(password) {
  const errors = [];
  if (typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] };
  }
  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (password.length > 128) errors.push('Password must be at most 128 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('Password must contain at least one special character');
  return { valid: errors.length === 0, errors };
}

function parseId(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePage(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseLimit(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseBooleanFlag(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return Boolean(value);
}

function trimToNull(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Validates that all keys exist in the allowed set. Returns the valid keys or null if any key is invalid.
 * @param {string[]} keys - The keys to validate
 * @param {Set<string>} allowedColumns - The set of allowed column names
 * @returns {string[]|null} - Valid keys or null if validation fails
 */
function validateColumns(keys, allowedColumns) {
  for (const key of keys) {
    if (!allowedColumns.has(key)) {
      return null;
    }
  }
  return keys;
}

/**
 * Builds a safe SET clause for UPDATE queries using only whitelisted columns.
 * @param {string[]} keys - Column names to update
 * @param {Record<string, any>} fields - The field values
 * @param {any[]} extraParams - Additional params to append after the SET values
 * @returns {{ sql: string, params: any[] }|null} - The SQL fragment and params, or null if invalid
 */
function buildSafeUpdateSet(keys, fields, extraParams = []) {
  const safeParts = [];
  const params = [];
  for (const key of keys) {
    safeParts.push(`\`${key}\` = ?`);
    params.push(fields[key]);
  }
  params.push(...extraParams);
  return { sql: safeParts.join(', '), params };
}

function ensureString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function stripFileExtension(filename) {
  if (typeof filename !== 'string') return '';
  const trimmed = filename.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0) return trimmed;
  return trimmed.slice(0, lastDot);
}

module.exports = {
  buildSafeUpdateSet,
  ensureString,
  getPasswordStrengthErrors,
  isStrongEnoughPassword,
  isValidEmail,
  parseBooleanFlag,
  parseId,
  parseLimit,
  parsePage,
  stripFileExtension,
  trimToNull,
  validateColumns
};
