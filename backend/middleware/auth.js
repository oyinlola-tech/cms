const jwt = require('jsonwebtoken');

function createAuthenticate(config) {
  return function authenticate(req, res, next) {
    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ message: 'No token provided' });
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.userId = decoded.id;
      next();
    } catch (_) {
      res.status(401).json({ message: 'Invalid token' });
    }
  };
}

module.exports = { createAuthenticate };
