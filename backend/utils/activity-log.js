const { query } = require('./db');

/**
 * Activity types for logging
 */
const ActivityType = {
  // Auth activities
  LOGIN: 'login',
  LOGOUT: 'logout',
  PASSWORD_CHANGE: 'password_change',
  PASSWORD_RESET: 'password_reset',
  
  // Member activities
  MEMBER_CREATE: 'member_create',
  MEMBER_UPDATE: 'member_update',
  MEMBER_DELETE: 'member_delete',
  
  // Finance activities
  TRANSACTION_CREATE: 'transaction_create',
  TRANSACTION_EXPORT: 'transaction_export',
  
  // Content activities
  PROGRAM_CREATE: 'program_create',
  PROGRAM_UPDATE: 'program_update',
  PROGRAM_DELETE: 'program_delete',
  ANNOUNCEMENT_CREATE: 'announcement_create',
  ANNOUNCEMENT_UPDATE: 'announcement_update',
  ANNOUNCEMENT_DELETE: 'announcement_delete',
  ANNOUNCEMENT_PUBLISH: 'announcement_publish',
  GALLERY_UPLOAD: 'gallery_upload',
  GALLERY_UPDATE: 'gallery_update',
  GALLERY_DELETE: 'gallery_delete',
  
  // Contact activities
  CONTACT_MESSAGE: 'contact_message',
  CONTACT_REPLY: 'contact_reply',
  
  // Settings activities
  SETTINGS_UPDATE: 'settings_update',
  LINKS_UPDATE: 'links_update',
  
  // General
  VIEW: 'view',
  EXPORT: 'export'
};

/**
 * Logs an activity to the activity_log table.
 * @param {Object} options - The activity options
 * @param {Object} options.db - The database connection/pool
 * @param {number} options.userId - The user performing the action
 * @param {string} options.action - The action type (from ActivityType)
 * @param {string} options.entityType - The entity type (e.g., 'member', 'transaction')
 * @param {number} options.entityId - The entity ID
 * @param {string} options.description - Human-readable description
 * @param {string} options.ipAddress - The client IP address
 * @param {string} options.requestId - The request correlation ID
 */
async function logActivity({ db, userId, action, entityType, entityId, description, ipAddress, requestId }) {
  try {
    await query(
      db,
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, description, ip_address, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        action,
        entityType || null,
        entityId || null,
        description || null,
        ipAddress || null,
        requestId || null
      ]
    );
  } catch (error) {
    // Don't let logging failures break the main flow
    console.error('Failed to log activity:', error.message);
  }
}

/**
 * Creates an activity logger middleware that automatically logs requests.
 * @param {Object} db - The database connection/pool
 */
function createActivityLogger(db) {
  return async function activityLogger(req, res, next) {
    // Store the original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to capture response
    res.json = function(data) {
      // Log activity for successful write operations
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const userId = req.userId;
        const action = getActionFromRequest(req);
        const entityType = getEntityTypeFromRequest(req);
        const entityId = req.params?.id ? Number(req.params.id) : null;
        const description = generateDescription(req, data);
        
        logActivity({
          db,
          userId,
          action,
          entityType,
          entityId,
          description,
          ipAddress: req.ip,
          requestId: req.id
        });
      }
      
      return originalJson(data);
    };
    
    next();
  };
}

/**
 * Determines the activity action from the request
 */
function getActionFromRequest(req) {
  const method = req.method;
  const path = req.path;
  
  if (path.includes('/login')) return ActivityType.LOGIN;
  if (path.includes('/logout')) return ActivityType.LOGOUT;
  if (path.includes('/change-password')) return ActivityType.PASSWORD_CHANGE;
  if (path.includes('/reset-password')) return ActivityType.PASSWORD_RESET;
  
  if (path.includes('/members') && method === 'POST') return ActivityType.MEMBER_CREATE;
  if (path.includes('/members') && method === 'PUT') return ActivityType.MEMBER_UPDATE;
  if (path.includes('/members') && method === 'DELETE') return ActivityType.MEMBER_DELETE;
  
  if (path.includes('/transactions') && method === 'POST') return ActivityType.TRANSACTION_CREATE;
  if (path.includes('/export')) return ActivityType.TRANSACTION_EXPORT;
  
  if (path.includes('/programs') && method === 'POST') return ActivityType.PROGRAM_CREATE;
  if (path.includes('/programs') && method === 'PUT') return ActivityType.PROGRAM_UPDATE;
  if (path.includes('/programs') && method === 'DELETE') return ActivityType.PROGRAM_DELETE;
  
  if (path.includes('/announcements') && method === 'POST') return ActivityType.ANNOUNCEMENT_CREATE;
  if (path.includes('/announcements') && method === 'PUT') return ActivityType.ANNOUNCEMENT_UPDATE;
  if (path.includes('/announcements') && method === 'DELETE') return ActivityType.ANNOUNCEMENT_DELETE;
  
  if (path.includes('/gallery') && method === 'POST') return ActivityType.GALLERY_UPLOAD;
  if (path.includes('/gallery') && method === 'PUT') return ActivityType.GALLERY_UPDATE;
  if (path.includes('/gallery') && method === 'DELETE') return ActivityType.GALLERY_DELETE;
  
  if (path.includes('/contact/send')) return ActivityType.CONTACT_MESSAGE;
  if (path.includes('/reply')) return ActivityType.CONTACT_REPLY;
  
  if (path.includes('/settings')) return ActivityType.SETTINGS_UPDATE;
  if (path.includes('/links')) return ActivityType.LINKS_UPDATE;
  
  return ActivityType.VIEW;
}

/**
 * Determines the entity type from the request
 */
function getEntityTypeFromRequest(req) {
  const path = req.path;
  
  if (path.includes('/members')) return 'member';
  if (path.includes('/transactions')) return 'transaction';
  if (path.includes('/programs')) return 'program';
  if (path.includes('/announcements')) return 'announcement';
  if (path.includes('/gallery')) return 'gallery';
  if (path.includes('/contact')) return 'contact_message';
  if (path.includes('/settings') || path.includes('/links')) return 'settings';
  if (path.includes('/users')) return 'user';
  
  return null;
}

/**
 * Generates a human-readable description from the request
 */
function generateDescription(req, data) {
  const method = req.method;
  const entityType = getEntityTypeFromRequest(req);
  const entityId = req.params?.id;
  
  const parts = [];
  parts.push(`${method} ${req.path}`);
  
  if (entityType) {
    parts.push(`on ${entityType}`);
  }
  
  if (entityId) {
    parts.push(`#${entityId}`);
  }
  
  return parts.join(' ');
}

module.exports = {
  ActivityType,
  logActivity,
  createActivityLogger
};
