const express = require('express');
const path = require('path');

function createPagesRouter({ config, rateLimiters }) {
  const router = express.Router();
  const limiter = rateLimiters.staticFiles;
  const { publicDir, srcDir } = config.paths;

  router.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));
  router.get('/', limiter, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  router.get('/programs', limiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'programs.html')));
  router.get('/gallery', limiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'gallery.html')));
  router.get('/announcements', limiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'announcements.html')));
  router.get('/announcements/:id', limiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'announcement-details.html')));
  router.get('/contact', limiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'contact.html')));
  router.get('/privacy', limiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'privacy.html')));
  router.get('/terms', limiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'terms.html')));
  router.get('/give', limiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'give.html')));
  router.get('/error/empty', limiter, (req, res) => res.status(404).sendFile(path.join(publicDir, 'pages', 'error', 'empty.html')));
  router.get('/error/offline', limiter, (req, res) => res.sendFile(path.join(publicDir, 'pages', 'error', 'offline.html')));
  router.get('/admin/login', limiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'login.html')));
  router.get('/admin/forgot-password', limiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'forgot-password.html')));
  router.get('/admin/verify-otp', limiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'verify-otp.html')));
  router.get('/admin/reset-password', limiter, (req, res) => res.sendFile(path.join(srcDir, 'auth', 'reset-password.html')));
  router.get('/admin/dashboard', limiter, (req, res) => res.sendFile(path.join(srcDir, 'index.html')));
  router.get('/admin/members', limiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'members.html')));
  router.get('/admin/members/:id', limiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'details', 'members-details.html')));
  router.get('/admin/finance', limiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'finance.html')));
  router.get('/admin/programs', limiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'programs.html')));
  router.get('/admin/announcements', limiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'announcements.html')));
  router.get('/admin/gallery', limiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'gallery.html')));
  router.get('/admin/reports', limiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'reports.html')));
  router.get('/admin/settings', limiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'settings.html')));
  router.get('/admin/activity', limiter, (req, res) => res.sendFile(path.join(srcDir, 'pages', 'reports.html')));
  router.get('*', limiter, (req, res) => res.status(404).sendFile(path.join(publicDir, 'pages', 'error', 'empty.html')));

  return router;
}

module.exports = { createPagesRouter };
