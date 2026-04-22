const express = require('express');
const path = require('path');

function createPagesRouter({ config, rateLimiters }) {
  const router = express.Router();
  const staticLimiter = rateLimiters && rateLimiters.staticFiles;
  if (typeof staticLimiter !== 'function') {
    throw new Error('createPagesRouter requires rateLimiters.staticFiles middleware');
  }
  const effectiveStaticLimiter = staticLimiter;
  const { publicDir, srcDir } = config.paths;

  router.use(effectiveStaticLimiter);

  router.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));
  router.get('/', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  router.get('/programs', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'programs.html')));
  router.get('/gallery', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'gallery.html')));
  router.get('/announcements', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'announcements.html')));
  router.get('/announcements/:id', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'announcement-details.html')));
  router.get('/contact', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'contact.html')));
  router.get('/privacy', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'privacy.html')));
  router.get('/terms', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'terms.html')));
  router.get('/give', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'give.html')));
  router.get('/error/empty', effectiveStaticLimiter, (req, res) => res.status(404).sendFile(path.join(publicDir, 'pages', 'error', 'empty.html')));
  router.get('/error/offline', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'error', 'offline.html')));
  router.get('/admin/login', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'login.html')));
  router.get('/admin/forgot-password', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'forgot-password.html')));
  router.get('/admin/verify-otp', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'verify-otp.html')));
  router.get('/admin/reset-password', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'reset-password.html')));
  router.get('/admin/dashboard', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'index.html')));
  router.get('/admin/members', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'members.html')));
  router.get('/admin/members/:id', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'details', 'members-details.html')));
  router.get('/admin/finance', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'finance.html')));
  router.get('/admin/programs', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'programs.html')));
  router.get('/admin/announcements', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'announcements.html')));
  router.get('/admin/gallery', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'gallery.html')));
  router.get('/admin/reports', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'reports.html')));
  router.get('/admin/settings', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'settings.html')));
  router.get('/admin/activity', effectiveStaticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'reports.html')));
  router.use(effectiveStaticLimiter, (req, res) => res.status(404).sendFile(path.join(publicDir, 'pages', 'error', 'empty.html')));

  return router;
}

module.exports = { createPagesRouter };
