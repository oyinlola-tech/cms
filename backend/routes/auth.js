const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { asyncHandler } = require('../utils/async-handler');
const { query, transaction } = require('../utils/db');
const { getPasswordStrengthErrors, isStrongEnoughPassword, isValidEmail } = require('../utils/validation');
const { SESSION_TOKEN_PURPOSE } = require('../middleware/auth');

const RESET_TOKEN_PURPOSE = 'password-reset';
const BCRYPT_ROUNDS = 12;

// A fixed bcrypt hash compared against when the account does not exist, so a
// failed login costs the same time whether or not the email is registered.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO3Zo1nPGvJt.Ye0lGrpLSHsMfAPQbHgi';

function signSessionToken(user, secret) {
  return jwt.sign(
    { id: user.id, tv: Number(user.token_version || 0), purpose: SESSION_TOKEN_PURPOSE },
    secret,
    { expiresIn: '7d' }
  );
}

function createAuthRouter({ db, config, rateLimiters, authenticate, emailService }) {
  const router = express.Router();

  router.post('/login', rateLimiters.login, asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!isValidEmail(email) || typeof password !== 'string') {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    const results = await query(db, 'SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    const user = results[0] || null;

    // Always run a bcrypt comparison so response time does not reveal whether
    // the account exists.
    const isValid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !isValid) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    if (user.is_active === 0) {
      res.status(403).json({ message: 'This account has been disabled.' });
      return;
    }

    const token = signSessionToken(user, config.jwtSecret);
    await query(db, 'UPDATE users SET last_login = NOW(), last_ip = ? WHERE id = ?', [req.ip, user.id]);

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  }));

  router.post('/logout', authenticate, rateLimiters.logout, asyncHandler(async (req, res) => {
    // Revoke every token issued for this user, not just the one presented.
    await query(db, 'UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.userId]);
    res.json({ message: 'Logged out' });
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
    // Supersede any outstanding OTP so only the newest one is usable.
    await query(db, 'DELETE FROM password_resets WHERE email = ?', [normalizedEmail]);
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
    await query(db, 'DELETE FROM password_resets WHERE email = ?', [normalizedEmail]);
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

    res.json({ message: 'If an account exists, a new OTP has been sent.' });
  }));

  router.post('/verify-otp', rateLimiters.otpVerify, asyncHandler(async (req, res) => {
    const { email, otp } = req.body || {};
    if (!isValidEmail(email) || typeof otp !== 'string' || otp.trim().length !== 6) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const rows = await query(
      db,
      'SELECT id FROM password_resets WHERE email = ? AND otp = ? AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [normalizedEmail, otp.trim()]
    );

    if (rows.length === 0) {
      res.status(400).json({ message: 'Invalid or expired OTP' });
      return;
    }

    // Bind the reset token to this specific OTP row and mark the OTP consumed,
    // so a replayed OTP cannot mint a second token.
    const resetId = rows[0].id;
    const consumed = await query(
      db,
      'UPDATE password_resets SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
      [resetId]
    );
    if (!consumed || consumed.affectedRows === 0) {
      res.status(400).json({ message: 'Invalid or expired OTP' });
      return;
    }

    const token = jwt.sign(
      { email: normalizedEmail, rid: resetId, purpose: RESET_TOKEN_PURPOSE },
      config.jwtSecret,
      { expiresIn: '10m' }
    );
    res.json({ token });
  }));

  router.post('/reset-password', rateLimiters.resetPassword, asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body || {};
    if (typeof token !== 'string') {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    const strength = getPasswordStrengthErrors(newPassword);
    if (!strength.valid) {
      res.status(400).json({ message: strength.errors[0], errors: strength.errors });
      return;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (_) {
      res.status(400).json({ message: 'Invalid or expired token' });
      return;
    }

    // Reject any token that was not minted specifically for a password reset -
    // a session token must never be usable here.
    if (decoded.purpose !== RESET_TOKEN_PURPOSE || typeof decoded.email !== 'string' || !decoded.rid) {
      res.status(400).json({ message: 'Invalid or expired token' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    const applied = await transaction(db, async (txQuery) => {
      // The reset row is deleted as part of the same transaction, so the token
      // is single-use even if two requests arrive concurrently.
      const cleared = await txQuery('DELETE FROM password_resets WHERE id = ? AND email = ?', [decoded.rid, decoded.email]);
      if (!cleared || cleared.affectedRows === 0) {
        return false;
      }

      // Bumping token_version signs out every existing session.
      const updated = await txQuery(
        'UPDATE users SET password = ?, token_version = token_version + 1 WHERE email = ?',
        [hashed, decoded.email]
      );
      return Boolean(updated && updated.affectedRows > 0);
    });

    if (!applied) {
      res.status(400).json({ message: 'Invalid or expired token' });
      return;
    }

    res.json({ message: 'Password reset successful' });
  }));

  router.post('/change-password', authenticate, rateLimiters.authWrite, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string') {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    const strength = getPasswordStrengthErrors(newPassword);
    if (!strength.valid) {
      res.status(400).json({ message: strength.errors[0], errors: strength.errors });
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

    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await query(
      db,
      'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
      [hashed, req.userId]
    );

    // The caller's own token was just revoked, so hand back a fresh one to keep
    // them signed in while every other session is dropped.
    const refreshed = await query(db, 'SELECT id, token_version FROM users WHERE id = ?', [req.userId]);
    const token = signSessionToken(refreshed[0], config.jwtSecret);

    res.json({ message: 'Password changed', token });
  }));

  router.put('/profile', authenticate, rateLimiters.authWrite, asyncHandler(async (req, res) => {
    const { name, email } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      res.status(400).json({ message: 'Invalid name' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid email' });
      return;
    }

    try {
      await query(db, 'UPDATE users SET name = ?, email = ? WHERE id = ?', [
        name.trim(),
        email.trim().toLowerCase(),
        req.userId
      ]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ message: 'That email is already in use' });
        return;
      }
      throw error;
    }

    res.json({ message: 'Profile updated' });
  }));

  return router;
}

module.exports = { createAuthRouter, RESET_TOKEN_PURPOSE, isStrongEnoughPassword };
