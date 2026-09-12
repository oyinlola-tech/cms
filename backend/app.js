const express = require('express');
const path = require('path');
const { apiErrorHandler } = require('./middleware/error-handler');
const { apiNotFoundHandler } = require('./middleware/not-found');
const { createAuthenticate } = require('./middleware/auth');
const { createRateLimiters } = require('./middleware/rate-limit');
const { applySecurityMiddleware } = require('./middleware/security');
const { requestIdMiddleware } = require('./middleware/request-id');
const { createRbac } = require('./middleware/rbac');
const { createActivityLogger } = require('./utils/activity-log');
const { createAdminContentRouter } = require('./routes/admin-content');
const { createAdminCoreRouter } = require('./routes/admin-core');
const { createAuthRouter } = require('./routes/auth');
const { createFinanceRouter } = require('./routes/finance');
const { createMembersRouter } = require('./routes/members');
const { createPagesRouter } = require('./routes/pages');
const { createPublicRouter } = require('./routes/public');
const { createUsersRouter } = require('./routes/users');
const { createEmailService } = require('./services/email-service');
const { createUploadService } = require('./services/upload-service');

function createApp({ config, db, rateLimiters = createRateLimiters(), emailService, uploadService }) {
  const app = express();
  const authenticate = createAuthenticate(config, db);
  const rbac = createRbac(db);
  const mailer = emailService || createEmailService(config);
  const uploads = uploadService || createUploadService(config);

  app.disable('x-powered-by');
  // Only trust proxy headers when a reverse proxy is actually in front of us.
  // Trusting them unconditionally lets clients spoof req.ip and defeat rate limiting.
  if (config.trustProxy) {
    app.set('trust proxy', config.trustProxy);
  }

  // Request ID middleware (must be first so every later log can correlate)
  app.use(requestIdMiddleware);

  applySecurityMiddleware(app, config);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(config.paths.publicDir));
  app.use('/js', express.static(config.paths.jsDir));
  app.use('/src/js', express.static(path.join(config.paths.srcDir, 'js')));
  app.use('/src/auth', express.static(path.join(config.paths.srcDir, 'auth')));
  app.use('/uploads', express.static(config.paths.uploadsDir, {
    setHeaders: (res) => {
      // Uploads are replaceable, so they must not be cached as immutable.
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    }
  }));

  // Health check endpoint (no rate limiting)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // One set of router instances, mounted at both the canonical /api/v1 prefix
  // and the legacy /api prefix. Building them once keeps a single multer
  // instance and a single set of handlers per route.
  const apiRouter = express.Router();
  apiRouter.use(rateLimiters.api);
  // The activity logger wraps res.json, so it must run BEFORE the routers that
  // send the response - mounting it afterwards means it never runs at all.
  apiRouter.use(createActivityLogger(db));
  apiRouter.use('/auth', createAuthRouter({ db, config, rateLimiters, authenticate, emailService: mailer }));
  apiRouter.use(createPublicRouter({ db, rateLimiters }));
  apiRouter.use(createAdminCoreRouter({ db, authenticate, rateLimiters, emailService: mailer, rbac }));
  apiRouter.use(createMembersRouter({ db, authenticate, rateLimiters, uploadService: uploads, rbac }));
  apiRouter.use(createFinanceRouter({ db, authenticate, rateLimiters, rbac }));
  apiRouter.use(createAdminContentRouter({ db, authenticate, rateLimiters, uploadService: uploads, rbac }));
  apiRouter.use(createUsersRouter({ db, authenticate, rateLimiters, rbac }));
  apiRouter.use(apiNotFoundHandler);

  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

  app.use(createPagesRouter({ config, rateLimiters }));
  app.use(apiErrorHandler);

  return { app, services: { emailService: mailer, uploadService: uploads }, rateLimiters, rbac };
}

module.exports = { createApp };
