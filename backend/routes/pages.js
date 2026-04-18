const express = require('express');
const path = require('path');

function createPagesRouter({ config, rateLimiters }) {
  const router = express.Router();
  const staticLimiter = rateLimiters.staticFiles;
  const { publicDir, srcDir } = config.paths;

  router.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));
  router.get('/', staticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  router.get('/programs', staticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'programs.html')));
  router.get('/gallery', staticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'gallery.html')));
  router.get('/announcements', staticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'announcements.html')));
  router.get('/announcements/:id', staticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'announcement-details.html')));
  router.get('/contact', staticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'contact.html')));
  router.get('/privacy', staticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'privacy.html')));
  router.get('/terms', staticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'terms.html')));
  router.get('/give', staticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'give.html')));
  router.get('/error/empty', staticLimiter, (req, res) => res.status(404).sendFile(path.join(publicDir, 'pages', 'error', 'empty.html')));
  router.get('/error/offline', staticLimiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'error', 'offline.html')));
  router.get('/admin/login', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'login.html')));
  router.get('/admin/forgot-password', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'forgot-password.html')));
  router.get('/admin/verify-otp', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'verify-otp.html')));
  router.get('/admin/reset-password', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'reset-password.html')));
  router.get('/admin/dashboard', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'index.html')));
  router.get('/admin/members', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'members.html')));
  router.get('/admin/members/:id', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'details', 'members-details.html')));
  router.get('/admin/finance', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'finance.html')));
  router.get('/admin/programs', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'programs.html')));
  router.get('/admin/announcements', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'announcements.html')));
  router.get('/admin/gallery', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'gallery.html')));
  router.get('/admin/reports', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'reports.html')));
  router.get('/admin/settings', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'settings.html')));
  router.get('/admin/activity', staticLimiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'reports.html')));
  router.use(staticLimiter, (req, res) => res.status(404).sendFile(path.join(publicDir, 'pages', 'error', 'empty.html')));

  return router;
}

module.exports = { createPagesRouter };
