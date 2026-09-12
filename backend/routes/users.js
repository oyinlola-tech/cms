const express = require('express');
const bcrypt = require('bcrypt');
const { asyncHandler } = require('../utils/async-handler');
const { query } = require('../utils/db');
const { getPasswordStrengthErrors, isValidEmail, parseId, parseLimit, parsePage } = require('../utils/validation');
const { ROLES, ROLE_HIERARCHY } = require('../middleware/rbac');

const BCRYPT_ROUNDS = 12;

function createUsersRouter({ db, authenticate, rateLimiters, rbac }) {
  const router = express.Router();
  const { requirePermission } = rbac;

  router.get('/admin/users', authenticate, requirePermission('users:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;

    const items = await query(
      db,
      `SELECT id, name, email, role, is_active as isActive, last_login as lastLogin, created_at as createdAt
       FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const count = await query(db, 'SELECT COUNT(*) as total FROM users');
    const total = Number(count[0]?.total || 0);

    res.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      from: total === 0 ? 0 : offset + 1,
      to: Math.min(offset + limit, total)
    });
  }));

  router.post('/admin/users', authenticate, requirePermission('users:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body || {};

    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      res.status(400).json({ message: 'Name must be between 2 and 100 characters' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid email' });
      return;
    }
    if (!ROLES.includes(role)) {
      res.status(400).json({ message: `Role must be one of: ${ROLES.join(', ')}` });
      return;
    }
    // Never let a user mint an account more powerful than their own.
    if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[req.userRole]) {
      res.status(403).json({ message: 'You cannot create a user at or above your own role' });
      return;
    }

    const strength = getPasswordStrengthErrors(password);
    if (!strength.valid) {
      res.status(400).json({ message: strength.errors[0], errors: strength.errors });
      return;
    }

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
      const result = await query(
        db,
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [name.trim(), email.trim().toLowerCase(), hashed, role]
      );
      res.status(201).json({ id: result.insertId, message: 'User created' });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ message: 'A user with that email already exists' });
        return;
      }
      throw error;
    }
  }));

  router.put('/admin/users/:id', authenticate, requirePermission('users:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid user id' });
      return;
    }

    const targets = await query(db, 'SELECT id, role FROM users WHERE id = ?', [id]);
    const target = targets[0];
    if (!target) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[req.userRole] && target.id !== req.userId) {
      res.status(403).json({ message: 'You cannot modify a user at or above your own role' });
      return;
    }

    const updates = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'role')) {
      const { role } = req.body;
      if (!ROLES.includes(role)) {
        res.status(400).json({ message: `Role must be one of: ${ROLES.join(', ')}` });
        return;
      }
      if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[req.userRole]) {
        res.status(403).json({ message: 'You cannot assign a role at or above your own' });
        return;
      }
      if (target.id === req.userId) {
        res.status(400).json({ message: 'You cannot change your own role' });
        return;
      }
      updates.push('role = ?');
      params.push(role);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isActive')) {
      if (target.id === req.userId) {
        res.status(400).json({ message: 'You cannot deactivate your own account' });
        return;
      }
      const isActive = req.body.isActive ? 1 : 0;
      updates.push('is_active = ?');
      params.push(isActive);
      if (!isActive) {
        // Deactivation must also drop any live session.
        updates.push('token_version = token_version + 1');
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      const { name } = req.body;
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
        res.status(400).json({ message: 'Name must be between 2 and 100 characters' });
        return;
      }
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (updates.length === 0) {
      res.status(400).json({ message: 'No changes provided' });
      return;
    }

    params.push(id);
    await query(db, `UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'User updated' });
  }));

  router.delete('/admin/users/:id', authenticate, requirePermission('users:delete'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid user id' });
      return;
    }
    if (id === req.userId) {
      res.status(400).json({ message: 'You cannot delete your own account' });
      return;
    }

    const targets = await query(db, 'SELECT id, role FROM users WHERE id = ?', [id]);
    const target = targets[0];
    if (!target) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY[req.userRole]) {
      res.status(403).json({ message: 'You cannot delete a user at or above your own role' });
      return;
    }

    // Refuse to remove the last account that can still administer the system.
    const admins = await query(
      db,
      "SELECT COUNT(*) as total FROM users WHERE role IN ('admin', 'super_admin') AND is_active = 1"
    );
    if (Number(admins[0]?.total || 0) <= 1 && ROLE_HIERARCHY[target.role] >= ROLE_HIERARCHY.admin) {
      res.status(409).json({ message: 'Cannot delete the last administrator' });
      return;
    }

    await query(db, 'DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted' });
  }));

  return router;
}

module.exports = { createUsersRouter };
