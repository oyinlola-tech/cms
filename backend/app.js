const express = require('express');
const path = require('path');
const { apiErrorHandler } = require('./middleware/error-handler');
const { apiNotFoundHandler } = require('./middleware/not-found');
const { createAuthenticate } = require('./middleware/auth');
const { createRateLimiters } = require('./middleware/rate-limit');
const { applySecurityMiddleware } = require('./middleware/security');
const { requestIdMiddleware } = require('./middleware/request-id');
const { createActivityLogger } = require('./utils/activity-log');
const { createAdminContentRouter } = require('./routes/admin-content');
const { createAdminCoreRouter } = require('./routes/admin-core');
const { createAuthRouter } = require('./routes/auth');
const { createFinanceRouter } = require('./routes/finance');
const { createMembersRouter } = require('./routes/members');
const { createPagesRouter } = require('./routes/pages');
const { createPublicRouter } = require('./routes/public');
const { createEmailService } = require('./services/email-service');
const { createUploadService } = require('./services/upload-service');

function createApp({ config, db, rateLimiters = createRateLimiters(), emailService, uploadService }) {
  const app = express();
  const authenticate = createAuthenticate(config);
  const mailer = emailService || createEmailService(config);
  const uploads = uploadService || createUploadService(config);
  const activityLogger = createActivityLogger(db);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Request ID middleware (must be first)
  app.use(requestIdMiddleware);
  
  applySecurityMiddleware(app, config);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(config.paths.publicDir));
  app.use('/js', express.static(config.paths.jsDir));
  app.use('/src/js', express.static(path.join(config.paths.srcDir, 'js')));
  app.use('/src/auth', express.static(path.join(config.paths.srcDir, 'auth')));
  app.use('/uploads', express.static(config.paths.uploadsDir, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  }));

  // Health check endpoint (no rate limiting)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API v1 routes (canonical version)
  app.use('/api/v1', rateLimiters.api);
  app.use('/api/v1/auth', createAuthRouter({ db, config, rateLimiters, authenticate, emailService: mailer }));
  app.use('/api/v1', createPublicRouter({ db, rateLimiters }));
  app.use('/api/v1', createAdminCoreRouter({ db, authenticate, rateLimiters, emailService: mailer }));
  app.use('/api/v1', createMembersRouter({ db, authenticate, rateLimiters, uploadService: uploads }));
  app.use('/api/v1', createFinanceRouter({ db, authenticate, rateLimiters }));
  app.use('/api/v1', createAdminContentRouter({ db, authenticate, rateLimiters, uploadService: uploads }));
  app.use('/api/v1', activityLogger);
  app.use('/api/v1', apiNotFoundHandler);

  // Backward compatibility: /api/* routes (delegates to v1 handlers)
  app.use('/api', rateLimiters.api);
  app.use('/api/auth', createAuthRouter({ db, config, rateLimiters, authenticate, emailService: mailer }));
  app.use('/api', createPublicRouter({ db, rateLimiters }));
  app.use('/api', createAdminCoreRouter({ db, authenticate, rateLimiters, emailService: mailer }));
  app.use('/api', createMembersRouter({ db, authenticate, rateLimiters, uploadService: uploads }));
  app.use('/api', createFinanceRouter({ db, authenticate, rateLimiters }));
  app.use('/api', createAdminContentRouter({ db, authenticate, rateLimiters, uploadService: uploads }));
  app.use('/api', activityLogger);
  app.use('/api', apiNotFoundHandler);

  app.use(createPagesRouter({ config, rateLimiters }));
  app.use(apiErrorHandler);

  return { app, services: { emailService: mailer, uploadService: uploads }, rateLimiters };
}

module.exports = { createApp };
