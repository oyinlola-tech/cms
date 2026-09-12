const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

const SESSION_TOKEN_PURPOSE = 'session';

/**
 * Builds the authentication middleware.
 *
 * Verifies a Bearer JWT, then confirms the token still matches the user's
 * current token_version. Bumping token_version (on password change or reset)
 * therefore invalidates every token issued before it.
 *
 * @param {Object} config - App config (supplies jwtSecret)
 * @param {Object} db - Database connection/pool
 */
function createAuthenticate(config, db) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('createAuthenticate requires a database connection or pool');
  }

  return async function authenticate(req, res, next) {
    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ message: 'No token provided' });
      return;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (_) {
      res.status(401).json({ message: 'Invalid token' });
      return;
    }

    // A password-reset token must never be usable as a session token.
    if (decoded.purpose !== SESSION_TOKEN_PURPOSE) {
      res.status(401).json({ message: 'Invalid token' });
      return;
    }

    try {
      const rows = await query(db, 'SELECT id, role, token_version FROM users WHERE id = ?', [decoded.id]);
      const user = rows[0];
      if (!user) {
        res.status(401).json({ message: 'Invalid token' });
        return;
      }

      if (Number(user.token_version || 0) !== Number(decoded.tv || 0)) {
        res.status(401).json({ message: 'Session expired. Please sign in again.' });
        return;
      }

      req.userId = user.id;
      // Cache the role so the RBAC middleware does not re-query for it.
      req.userRole = user.role || 'viewer';
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { createAuthenticate, SESSION_TOKEN_PURPOSE };
