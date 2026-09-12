const express = require('express');
const path = require('path');

function createPagesRouter({ config, rateLimiters }) {
  const router = express.Router();
  const staticLimiter = rateLimiters && rateLimiters.staticFiles;
  if (typeof staticLimiter !== 'function') {
    throw new Error('createPagesRouter requires rateLimiters.staticFiles middleware');
  }
  const { publicDir, srcDir } = config.paths;

  const publicPage = (...segments) => (req, res) => res.sendFile(path.join(publicDir, ...segments));
  const adminPage = (...segments) => (req, res) => res.sendFile(path.join(srcDir, ...segments));

  router.use(staticLimiter);

  router.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

  // Public site
  router.get('/', publicPage('index.html'));
  router.get('/programs', publicPage('pages', 'programs.html'));
  router.get('/gallery', publicPage('pages', 'gallery.html'));
  router.get('/announcements', publicPage('pages', 'announcements.html'));
  router.get('/announcements/:id', publicPage('pages', 'announcement-details.html'));
  router.get('/contact', publicPage('pages', 'contact.html'));
  router.get('/privacy', publicPage('pages', 'privacy.html'));
  router.get('/terms', publicPage('pages', 'terms.html'));
  router.get('/give', publicPage('pages', 'give.html'));

  // Error pages. 404/403/500 previously existed as files but were unreachable.
  const errorPagesRouter = express.Router();
  errorPagesRouter.get('/empty', (req, res) => res.status(404).sendFile(path.join(publicDir, 'pages', 'error', 'empty.html')));
  errorPagesRouter.get('/offline', (req, res) => res.sendFile(path.join(publicDir, 'pages', 'error', 'offline.html')));
  errorPagesRouter.get('/404', (req, res) => res.status(404).sendFile(path.join(publicDir, 'pages', 'error', '404.html')));
  errorPagesRouter.get('/403', (req, res) => res.status(403).sendFile(path.join(publicDir, 'pages', 'error', '403.html')));
  errorPagesRouter.get('/500', (req, res) => res.status(500).sendFile(path.join(publicDir, 'pages', 'error', '500.html')));
  router.use('/error', errorPagesRouter);

  // Admin dashboard. `/admin` is where the login flow lands, so it must exist.
  router.get('/admin', (req, res) => res.redirect(302, '/admin/dashboard'));
  router.get('/admin/login', adminPage('auth', 'login.html'));
  router.get('/admin/forgot-password', adminPage('auth', 'forgot-password.html'));
  router.get('/admin/verify-otp', adminPage('auth', 'verify-otp.html'));
  router.get('/admin/reset-password', adminPage('auth', 'reset-password.html'));
  router.get('/admin/dashboard', adminPage('index.html'));
  router.get('/admin/members', adminPage('pages', 'members.html'));
  router.get('/admin/members/:id', adminPage('pages', 'details', 'members-details.html'));
  router.get('/admin/finance', adminPage('pages', 'finance.html'));
  router.get('/admin/programs', adminPage('pages', 'programs.html'));
  router.get('/admin/announcements', adminPage('pages', 'announcements.html'));
  router.get('/admin/gallery', adminPage('pages', 'gallery.html'));
  router.get('/admin/reports', adminPage('pages', 'reports.html'));
  router.get('/admin/activity', adminPage('pages', 'reports.html'));
  router.get('/admin/users', adminPage('pages', 'users.html'));
  router.get('/admin/settings', adminPage('pages', 'settings.html'));
  // The settings page links to these three sections; they are panels on the
  // settings page itself, so deep links resolve there rather than 404ing.
  router.get('/admin/settings/parish', (req, res) => res.redirect(302, '/admin/settings#parish'));
  router.get('/admin/settings/notifications', (req, res) => res.redirect(302, '/admin/settings#notifications'));
  router.get('/admin/settings/financial', (req, res) => res.redirect(302, '/admin/settings#financial'));

  router.use((req, res) => res.status(404).sendFile(path.join(publicDir, 'pages', 'error', '404.html')));

  return router;
}

module.exports = { createPagesRouter };
