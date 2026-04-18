const express = require('express');
const { asyncHandler } = require('../utils/async-handler');
const { query } = require('../utils/db');
const { isValidEmail, parseLimit, parsePage } = require('../utils/validation');

function createPublicRouter({ db, rateLimiters }) {
  const router = express.Router();
  const readLimiter = rateLimiters.publicRead;

  router.get('/announcements', readLimiter, asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 10, 50);
    const page = parsePage(req.query.page, 1);
    const offset = (page - 1) * limit;
    const status = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : 'published';
    const category = typeof req.query.category === 'string' && req.query.category !== 'all' ? req.query.category.trim() : null;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const whereParts = ['status = ?'];
    const params = [status];

    if (category) {
      whereParts.push('category = ?');
      params.push(category);
    }

    if (search) {
      const like = `%${search}%`;
      whereParts.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
      params.push(like, like, like);
    }

    const whereSql = `WHERE ${whereParts.join(' AND ')}`;
    const items = await query(
      db,
      `SELECT id, title, summary, category, image_url, is_new, created_at
       FROM announcements ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const count = await query(db, `SELECT COUNT(*) as total FROM announcements ${whereSql}`, params);
    const total = Number(count[0]?.total || 0);

    res.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit)
    });
  }));

  router.get('/announcements/:id', readLimiter, asyncHandler(async (req, res) => {
    const results = await query(db, 'SELECT * FROM announcements WHERE id = ?', [req.params.id]);
    if (results.length === 0) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    res.json(results[0]);
  }));

  router.get('/programs', readLimiter, asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 10, 50);
    const rawStatus = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : 'upcoming';
    const status = rawStatus === 'past' ? 'completed' : rawStatus;
    const results = await query(
      db,
      'SELECT * FROM programs WHERE status = ? ORDER BY start_datetime ASC LIMIT ?',
      [status, limit]
    );
    res.json(results);
  }));

  router.get('/programs/weekly-schedule', readLimiter, asyncHandler(async (req, res) => {
    const rows = await query(db, 'SELECT * FROM weekly_schedule ORDER BY display_order');
    res.json(rows);
  }));

  router.get('/gallery', readLimiter, asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 12, 50);
    const page = parsePage(req.query.page, 1);
    const offset = (page - 1) * limit;

    const items = await query(
      db,
      'SELECT * FROM gallery ORDER BY display_order, created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    const count = await query(db, 'SELECT COUNT(*) as total FROM gallery');
    const total = Number(count[0]?.total || 0);

    res.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit)
    });
  }));

  router.get('/church/info', readLimiter, asyncHandler(async (req, res) => {
    const rows = await query(db, 'SELECT * FROM church_info LIMIT 1');
    res.json(rows[0] || {});
  }));

  router.post('/contact/send', rateLimiters.publicWrite, asyncHandler(async (req, res) => {
    const { name, email, phone, subject, message } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ message: 'Invalid name' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid email' });
      return;
    }
    if (typeof message !== 'string' || message.trim().length < 5 || message.length > 5000) {
      res.status(400).json({ message: 'Invalid message' });
      return;
    }
    if (typeof subject === 'string' && subject.length > 100) {
      res.status(400).json({ message: 'Subject too long' });
      return;
    }
    if (typeof phone === 'string' && phone.length > 30) {
      res.status(400).json({ message: 'Phone too long' });
      return;
    }

    await query(
      db,
      'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), phone || null, subject || null, message.trim()]
    );
    res.json({ message: 'Message sent' });
  }));

  router.get('/public/links', readLimiter, asyncHandler(async (req, res) => {
    const rows = await query(db, 'SELECT link_key, url FROM external_links');
    const out = {};
    for (const row of rows || []) {
      if (row && row.link_key && typeof row.url === 'string' && row.url.trim()) {
        out[row.link_key] = row.url.trim();
      }
    }
    res.json(out);
  }));

  return router;
}

module.exports = { createPublicRouter };
