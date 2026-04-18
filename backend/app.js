const express = require('express');
const path = require('path');
const { apiErrorHandler } = require('./middleware/error-handler');
const { apiNotFoundHandler } = require('./middleware/not-found');
const { createAuthenticate } = require('./middleware/auth');
const { createRateLimiters } = require('./middleware/rate-limit');
const { applySecurityMiddleware } = require('./middleware/security');
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

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  applySecurityMiddleware(app, config);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(config.paths.publicDir));
  app.use('/js', express.static(config.paths.jsDir));
  app.use('/uploads', express.static(config.paths.uploadsDir, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  }));

  app.use('/api', rateLimiters.api);
  app.use('/api/auth', createAuthRouter({ db, config, rateLimiters, authenticate, emailService: mailer }));
  app.use('/api', createPublicRouter({ db, rateLimiters }));
  app.use('/api', createAdminCoreRouter({ db, authenticate, rateLimiters, emailService: mailer }));
  app.use('/api', createMembersRouter({ db, authenticate, rateLimiters, uploadService: uploads }));
  app.use('/api', createFinanceRouter({ db, authenticate, rateLimiters }));
  app.use('/api', createAdminContentRouter({ db, authenticate, rateLimiters, uploadService: uploads }));

  app.use('/api', apiNotFoundHandler);
  app.use(createPagesRouter({ config, rateLimiters }));
  app.use(apiErrorHandler);

  return { app, services: { emailService: mailer, uploadService: uploads }, rateLimiters };
}

module.exports = { createApp };
