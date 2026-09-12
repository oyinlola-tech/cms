const crypto = require('crypto');

/**
 * Middleware that generates a unique request ID for each request.
 * The ID is attached to req.id and included in the X-Request-Id response header.
 */
function requestIdMiddleware(req, res, next) {
  // Use existing request ID if provided (e.g., from load balancer)
  const existingId = req.headers['x-request-id'];
  
  if (existingId && typeof existingId === 'string' && existingId.length <= 128) {
    req.id = existingId;
  } else {
    // Generate a new UUID v4
    req.id = crypto.randomUUID();
  }
  
  // Set the response header
  res.setHeader('X-Request-Id', req.id);
  
  next();
}

module.exports = { requestIdMiddleware };
