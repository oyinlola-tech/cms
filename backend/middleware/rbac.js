const { query } = require('../utils/db');

/**
 * Role hierarchy - higher roles inherit permissions of lower roles
 */
const ROLE_HIERARCHY = {
  super_admin: 3,
  admin: 2,
  editor: 1,
  viewer: 0
};

const ROLES = Object.keys(ROLE_HIERARCHY);

/**
 * Permission definitions for each role
 */
const PERMISSIONS = {
  super_admin: [
    'members:read', 'members:write', 'members:delete',
    'finance:read', 'finance:write', 'finance:export',
    'programs:read', 'programs:write', 'programs:delete',
    'announcements:read', 'announcements:write', 'announcements:delete',
    'gallery:read', 'gallery:write', 'gallery:delete',
    'settings:read', 'settings:write',
    'contact:read', 'contact:write',
    'users:read', 'users:write', 'users:delete',
    'dashboard:read'
  ],
  admin: [
    'members:read', 'members:write', 'members:delete',
    'finance:read', 'finance:write', 'finance:export',
    'programs:read', 'programs:write', 'programs:delete',
    'announcements:read', 'announcements:write', 'announcements:delete',
    'gallery:read', 'gallery:write', 'gallery:delete',
    'settings:read', 'settings:write',
    'contact:read', 'contact:write',
    'users:read',
    'dashboard:read'
  ],
  editor: [
    'members:read',
    'finance:read',
    'programs:read', 'programs:write',
    'announcements:read', 'announcements:write',
    'gallery:read', 'gallery:write',
    'contact:read',
    'dashboard:read'
  ],
  viewer: [
    'members:read',
    'finance:read',
    'programs:read',
    'announcements:read',
    'gallery:read',
    'contact:read',
    'dashboard:read'
  ]
};

/**
 * Loads the authenticated user's role once per request and caches it on req.
 * @param {Object} db - The database connection/pool
 * @param {Object} req - The request
 * @returns {Promise<string|null>} - The role, or null when the user no longer exists
 */
async function loadUserRole(db, req) {
  if (typeof req.userRole === 'string') return req.userRole;

  const results = await query(db, 'SELECT id, role FROM users WHERE id = ?', [req.userId]);
  if (results.length === 0) return null;

  const role = ROLE_HIERARCHY[results[0].role] === undefined ? 'viewer' : results[0].role;
  req.userRole = role;
  return role;
}

/**
 * Builds the RBAC middleware pair bound to a database handle.
 * Both returned factories must be used after the authenticate middleware.
 * @param {Object} db - The database connection/pool
 */
function createRbac(db) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('createRbac requires a database connection or pool');
  }

  function guard(check) {
    return async function rbacMiddleware(req, res, next) {
      if (!req.userId) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }

      try {
        const role = await loadUserRole(db, req);
        if (role === null) {
          res.status(401).json({ message: 'User not found' });
          return;
        }

        if (!check(role)) {
          res.status(403).json({ message: 'Insufficient permissions' });
          return;
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  return {
    /**
     * Requires the user's role to sit at or above `minimumRole` in the hierarchy.
     * @param {string} minimumRole - e.g. 'admin', 'editor'
     */
    requireRole(minimumRole) {
      if (ROLE_HIERARCHY[minimumRole] === undefined) {
        throw new Error(`Unknown role: ${minimumRole}`);
      }
      const requiredLevel = ROLE_HIERARCHY[minimumRole];
      return guard((role) => ROLE_HIERARCHY[role] >= requiredLevel);
    },

    /**
     * Requires the user's role to hold a specific permission.
     * @param {string} permission - e.g. 'members:write'
     */
    requirePermission(permission) {
      const known = Object.values(PERMISSIONS).some((list) => list.includes(permission));
      if (!known) {
        throw new Error(`Unknown permission: ${permission}`);
      }
      return guard((role) => (PERMISSIONS[role] || []).includes(permission));
    }
  };
}

module.exports = {
  createRbac,
  loadUserRole,
  ROLES,
  ROLE_HIERARCHY,
  PERMISSIONS
};
