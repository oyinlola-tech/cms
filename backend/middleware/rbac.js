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
    'dashboard:read'
  ],
  editor: [
    'members:read',
    'finance:read',
    'programs:read', 'programs:write',
    'announcements:read', 'announcements:write',
    'gallery:read', 'gallery:write',
    'dashboard:read'
  ],
  viewer: [
    'members:read',
    'finance:read',
    'programs:read',
    'announcements:read',
    'gallery:read',
    'dashboard:read'
  ]
};

/**
 * Creates middleware that checks if the authenticated user has the required role level.
 * Must be used after the authenticate middleware.
 * @param {string} minimumRole - The minimum role required (e.g., 'admin', 'editor')
 */
function requireRole(minimumRole) {
  return async function roleCheckMiddleware(req, res, next) {
    if (!req.userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    try {
      const results = await query(
        'SELECT id, role FROM users WHERE id = ?',
        [req.userId]
      );

      if (results.length === 0) {
        res.status(401).json({ message: 'User not found' });
        return;
      }

      const userRole = results[0].role || 'viewer';
      const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
      const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 0;

      if (userLevel < requiredLevel) {
        res.status(403).json({ message: 'Insufficient permissions' });
        return;
      }

      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('RBAC check failed:', error);
      res.status(500).json({ message: 'Permission check failed' });
    }
  };
}

/**
 * Creates middleware that checks if the authenticated user has a specific permission.
 * Must be used after the authenticate middleware.
 * @param {string} permission - The permission to check (e.g., 'members:write')
 */
function requirePermission(permission) {
  return async function permissionCheckMiddleware(req, res, next) {
    if (!req.userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    try {
      const results = await query(
        'SELECT id, role FROM users WHERE id = ?',
        [req.userId]
      );

      if (results.length === 0) {
        res.status(401).json({ message: 'User not found' });
        return;
      }

      const userRole = results[0].role || 'viewer';
      const userPermissions = PERMISSIONS[userRole] || [];

      if (!userPermissions.includes(permission)) {
        res.status(403).json({ message: 'Insufficient permissions' });
        return;
      }

      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('Permission check failed:', error);
      res.status(500).json({ message: 'Permission check failed' });
    }
  };
}

module.exports = {
  requireRole,
  requirePermission,
  ROLE_HIERARCHY,
  PERMISSIONS
};
