/**
 * Input sanitization utilities for user-supplied content.
 *
 * The CMS has no rich-text editor, and hand-rolled HTML allowlisting is a
 * reliable source of XSS bugs, so long-form fields are stored as plain text.
 * Rendering escapes the text and converts newlines to <br>, which is safe by
 * construction.
 */

const { escapeHtml } = require('./format');

// Control characters are stripped everywhere: they serve no purpose in user
// content and break both terminal output and CSV/email rendering.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const CONTROL_CHARS_KEEP_BREAKS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Strips HTML tags from a string, returning plain text.
 * Applied repeatedly so that nested constructs such as "<<b>script>" cannot
 * reassemble into a tag after a single pass.
 * @param {string} input
 * @returns {string}
 */
function stripHtmlTags(input) {
  if (typeof input !== 'string') return '';

  let previous;
  let current = input;
  do {
    previous = current;
    current = current.replace(/<[^>]*>/g, '');
  } while (current !== previous);

  // Remove any leftover angle brackets so nothing can be reconstructed later.
  return current.replace(/[<>]/g, '');
}

/**
 * Escapes HTML entities to prevent XSS when interpolating into markup.
 * @param {string} input
 * @returns {string}
 */
function escapeHtmlEntities(input) {
  if (typeof input !== 'string') return '';
  return escapeHtml(input);
}

/**
 * Sanitizes content for safe storage: strips markup and control characters.
 * @param {string} input
 * @param {Object} [options]
 * @param {boolean} [options.allowLineBreaks=true] - Keep newlines
 * @param {boolean} [options.trim=true] - Trim surrounding whitespace
 * @param {number} [options.maxLength] - Truncate to at most this many characters
 * @returns {string}
 */
function sanitizeContent(input, options = {}) {
  if (typeof input !== 'string') return '';

  const { allowLineBreaks = true, trim = true, maxLength } = options;

  let sanitized = stripHtmlTags(input);
  sanitized = sanitized.replace(allowLineBreaks ? CONTROL_CHARS_KEEP_BREAKS : CONTROL_CHARS, '');

  if (!allowLineBreaks) {
    sanitized = sanitized.replace(/[\r\n]+/g, ' ');
  } else {
    // Normalise line endings and collapse runs of blank lines.
    sanitized = sanitized.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
  }

  if (trim) {
    sanitized = sanitized.trim();
  }

  if (Number.isInteger(maxLength) && maxLength > 0 && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitizes a single-line field (no markup, no line breaks).
 * @param {string} input
 * @param {number} [maxLength]
 * @returns {string}
 */
function sanitizeLine(input, maxLength) {
  return sanitizeContent(input, { allowLineBreaks: false, trim: true, maxLength });
}

/**
 * Validates and normalises a URL, allowing only http(s).
 * @param {string} url
 * @returns {string|null}
 */
function sanitizeUrl(url) {
  if (typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

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
 * Validates and normalises a relative upload path or an absolute http(s) URL.
 * Used for image fields, which may point at /uploads/... or an external host.
 * @param {string} url
 * @returns {string|null}
 */
function sanitizeImageUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Relative upload paths, with no traversal or protocol trickery.
  if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(trimmed) && !trimmed.includes('..')) {
    return trimmed;
  }
  if (/^\/images\/[A-Za-z0-9._-]+$/.test(trimmed) && !trimmed.includes('..')) {
    return trimmed;
  }

  return sanitizeUrl(trimmed);
}

/**
 * Validates and sanitizes a name field.
 * @param {string} name
 * @param {Object} [options]
 * @param {number} [options.minLength=1]
 * @param {number} [options.maxLength=100]
 * @returns {{ valid: boolean, value: string, error: string|null }}
 */
function sanitizeName(name, options = {}) {
  const { minLength = 1, maxLength = 100 } = options;

  if (typeof name !== 'string') {
    return { valid: false, value: '', error: 'Name is required' };
  }

  const sanitized = sanitizeLine(name);

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
  sanitizeContent,
  sanitizeImageUrl,
  sanitizeLine,
  sanitizeName,
  sanitizeUrl,
  stripHtmlTags
};
