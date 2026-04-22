const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { asyncHandler } = require('../utils/async-handler');
const { query } = require('../utils/db');
const { isStrongEnoughPassword, isValidEmail } = require('../utils/validation');

function createAuthRouter({ db, config, rateLimiters, authenticate, emailService }) {
  const router = express.Router();
  const resetPasswordLimiter =
    rateLimiters.resetPassword ||
    rateLimiters.authWrite ||
    ((req, res, next) => next());

  router.post('/login', rateLimiters.login, asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!isValidEmail(email) || typeof password !== 'string') {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    const results = await query(db, 'SELECT * FROM users WHERE email = ?', [email.trim()]);
    if (results.length === 0) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const user = results[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ id: user.id }, config.jwtSecret, { expiresIn: '7d' });
    await query(db, 'UPDATE users SET last_login = NOW(), last_ip = ? WHERE id = ?', [req.ip, user.id]);

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  }));

  router.get('/me', authenticate, rateLimiters.authRead, asyncHandler(async (req, res) => {
    const results = await query(
      db,
      'SELECT id, name, email, role, avatar, twofa_enabled as twofaEnabled, last_login as lastLogin, last_ip as lastIp FROM users WHERE id = ?',
      [req.userId]
    );

    const user = results[0] || null;
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    user.activeSessions = 1;
    res.json(user);
  }));

  router.post('/forgot-password', rateLimiters.forgotPassword, asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const users = await query(db, 'SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (users.length === 0) {
      res.json({ message: 'If an account exists, an OTP has been sent.' });
      return;
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    await query(
      db,
      'INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
      [normalizedEmail, otp]
    );

    try {
      await emailService.sendOTP(normalizedEmail, otp);
    } catch (error) {
      console.error('Email sending failed:', error);
    }

    res.json({ message: 'If an account exists, an OTP has been sent.' });
  }));

  router.post('/verify-otp', rateLimiters.otpVerify, asyncHandler(async (req, res) => {
    const { email, otp } = req.body || {};
    if (!isValidEmail(email) || typeof otp !== 'string' || otp.trim().length !== 6) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    const rows = await query(
      db,
      'SELECT id FROM password_resets WHERE email = ? AND otp = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email.trim().toLowerCase(), otp.trim()]
    );

    if (rows.length === 0) {
      res.status(400).json({ message: 'Invalid or expired OTP' });
      return;
    }

    const token = jwt.sign({ email: email.trim().toLowerCase() }, config.jwtSecret, { expiresIn: '10m' });
    res.json({ token });
  }));

  router.post('/reset-password', resetPasswordLimiter, asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body || {};
    if (typeof token !== 'string' || !isStrongEnoughPassword(newPassword)) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      const hashed = await bcrypt.hash(newPassword, 10);
      await query(db, 'UPDATE users SET password = ? WHERE email = ?', [hashed, decoded.email]);
      await query(db, 'DELETE FROM password_resets WHERE email = ?', [decoded.email]);
      res.json({ message: 'Password reset successful' });
    } catch (_) {
      res.status(400).json({ message: 'Invalid or expired token' });
    }
  }));

  router.post('/resend-otp', rateLimiters.forgotPassword, asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const users = await query(db, 'SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (users.length === 0) {
      res.json({ message: 'If an account exists, a new OTP has been sent.' });
      return;
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const updateResult = await query(
      db,
      'UPDATE password_resets SET otp = ?, expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE email = ? ORDER BY created_at DESC LIMIT 1',
      [otp, normalizedEmail]
    );

    if (!updateResult || updateResult.affectedRows === 0) {
      await query(
        db,
        'INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
        [normalizedEmail, otp]
      );
    }

    try {
      await emailService.sendOTP(normalizedEmail, otp);
    } catch (error) {
      console.error('Email sending failed:', error);
    }

    res.json({ message: 'If an account exists, a new OTP has been sent.' });
  }));

  router.post('/change-password', authenticate, rateLimiters.authWrite, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !isStrongEnoughPassword(newPassword)) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    const results = await query(db, 'SELECT password FROM users WHERE id = ?', [req.userId]);
    if (!results[0]) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const isValid = await bcrypt.compare(currentPassword, results[0].password);
    if (!isValid) {
      res.status(401).json({ message: 'Current password incorrect' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await query(db, 'UPDATE users SET password = ? WHERE id = ?', [hashed, req.userId]);
    res.json({ message: 'Password changed' });
  }));

  router.put('/profile', authenticate, rateLimiters.authWrite, asyncHandler(async (req, res) => {
    const { name, email } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ message: 'Invalid name' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid email' });
      return;
    }

    await query(db, 'UPDATE users SET name = ?, email = ? WHERE id = ?', [
      name.trim(),
      email.trim().toLowerCase(),
      req.userId
    ]);

    res.json({ message: 'Profile updated' });
  }));

  return router;
}

module.exports = { createAuthRouter };
