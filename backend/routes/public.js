const express = require('express');
const { asyncHandler } = require('../utils/async-handler');
const { query } = require('../utils/db');
const { isValidEmail, parseId, parseLimit, parsePage } = require('../utils/validation');
const { sanitizeContent, sanitizeLine } = require('../utils/sanitize');

const PUBLIC_PROGRAM_STATUSES = new Set(['upcoming', 'ongoing', 'completed', 'cancelled']);

function createPublicRouter({ db, rateLimiters }) {
  const router = express.Router();
  const readLimiter = rateLimiters.publicRead;

  router.get('/announcements', readLimiter, asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 10, 50);
    const page = parsePage(req.query.page, 1);
    const offset = (page - 1) * limit;
    // This is an unauthenticated endpoint, so the status is pinned to
    // 'published'. Honouring ?status=draft here would leak unpublished content.
    const status = 'published';
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
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid announcement id' });
      return;
    }
    const results = await query(
      db,
      `SELECT id, title, summary, content, category, image_url, priority, is_new, is_featured, published_at, created_at
       FROM announcements WHERE id = ? AND status = 'published'`,
      [id]
    );
    if (results.length === 0) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    res.json(results[0]);
  }));

  router.get('/programs', readLimiter, asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 10, 50);
    const rawStatus = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : 'upcoming';
    const requested = rawStatus === 'past' ? 'completed' : rawStatus;
    const status = PUBLIC_PROGRAM_STATUSES.has(requested) ? requested : 'upcoming';
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

    // These values are replayed into the admin dashboard and into reply emails,
    // so markup is stripped at the point of entry.
    const safeName = sanitizeLine(name, 100);
    const safeMessage = sanitizeContent(message, { maxLength: 5000 });
    const safeSubject = sanitizeLine(subject, 100);
    const safePhone = sanitizeLine(phone, 20);

    if (safeName.length < 2) {
      res.status(400).json({ message: 'Invalid name' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid email' });
      return;
    }
    if (safeMessage.length < 5) {
      res.status(400).json({ message: 'Invalid message' });
      return;
    }
    if (typeof phone === 'string' && phone.trim().length > 20) {
      res.status(400).json({ message: 'Phone too long' });
      return;
    }

    await query(
      db,
      'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
      [safeName, email.trim().toLowerCase(), safePhone || null, safeSubject || null, safeMessage]
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
