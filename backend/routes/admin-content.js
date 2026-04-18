const fs = require('fs');
const path = require('path');
const express = require('express');
const { asyncHandler } = require('../utils/async-handler');
const { query } = require('../utils/db');
const { parseId, parseLimit, parsePage } = require('../utils/validation');

function createAdminContentRouter({ db, authenticate, rateLimiters, uploadService }) {
  const router = express.Router();

  router.get('/admin/programs', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 10, 100);
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : null;
    const category = typeof req.query.category === 'string' && req.query.category !== 'all' ? req.query.category.trim() : null;

    const whereParts = [];
    const params = [];
    if (status) {
      whereParts.push('status = ?');
      params.push(status);
    }
    if (category) {
      whereParts.push('category = ?');
      params.push(category);
    }
    if (search) {
      const like = `%${search}%`;
      whereParts.push('(title LIKE ? OR description LIKE ? OR location LIKE ?)');
      params.push(like, like, like);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const items = await query(
      db,
      `SELECT id, title, type, category, location, start_datetime, end_datetime, status, is_main_service, is_featured, display_order, created_at
       FROM programs
       ${whereSql}
       ORDER BY start_datetime DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const count = await query(db, `SELECT COUNT(*) as total FROM programs ${whereSql}`, params);
    const total = Number(count[0]?.total || 0);

    res.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      from: total === 0 ? 0 : offset + 1,
      to: Math.min(offset + limit, total)
    });
  }));

  router.get('/admin/programs/stats', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const rows = await query(
      db,
      `SELECT
        SUM(status='upcoming') as upcoming,
        SUM(status='ongoing') as ongoing,
        SUM(status='completed') as completed,
        SUM(status='cancelled') as cancelled,
        COUNT(*) as total
       FROM programs`
    );
    res.json(rows[0] || {});
  }));

  router.get('/admin/programs/:id', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid program id' });
      return;
    }

    const rows = await query(db, 'SELECT * FROM programs WHERE id = ?', [id]);
    if (!rows[0]) {
      res.status(404).json({ message: 'Program not found' });
      return;
    }
    res.json(rows[0]);
  }));

  router.post('/admin/programs', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const {
      title,
      description,
      type,
      category,
      location,
      start_datetime,
      end_datetime,
      recurring,
      recurring_until,
      schedule,
      is_main_service,
      is_featured,
      status,
      display_order
    } = req.body || {};

    if (typeof title !== 'string' || title.trim().length < 3) {
      res.status(400).json({ message: 'Title is required' });
      return;
    }
    if (!start_datetime) {
      res.status(400).json({ message: 'Start date/time is required' });
      return;
    }

    const result = await query(
      db,
      `INSERT INTO programs
        (title, description, type, category, location, start_datetime, end_datetime, recurring, recurring_until, schedule, is_main_service, is_featured, status, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        description || null,
        type || 'service',
        category || null,
        location || null,
        start_datetime,
        end_datetime || null,
        recurring || 'none',
        recurring_until || null,
        schedule || null,
        is_main_service ? 1 : 0,
        is_featured ? 1 : 0,
        status || 'upcoming',
        Number.isFinite(Number(display_order)) ? Number(display_order) : 0
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Program created' });
  }));

  router.put('/admin/programs/:id', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid program id' });
      return;
    }

    const allowed = [
      'title', 'description', 'type', 'category', 'location', 'start_datetime', 'end_datetime',
      'recurring', 'recurring_until', 'schedule', 'is_main_service', 'is_featured', 'status', 'display_order'
    ];
    const fields = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        fields[key] = req.body[key];
      }
    }

    if (fields.title && (typeof fields.title !== 'string' || fields.title.trim().length < 3)) {
      res.status(400).json({ message: 'Invalid title' });
      return;
    }

    const keys = Object.keys(fields);
    if (keys.length === 0) {
      res.status(400).json({ message: 'No changes provided' });
      return;
    }

    const params = keys.map((key) => {
      if (key === 'is_main_service' || key === 'is_featured') return fields[key] ? 1 : 0;
      if (key === 'display_order') return Number.isFinite(Number(fields[key])) ? Number(fields[key]) : 0;
      if (typeof fields[key] === 'string') return fields[key].trim();
      return fields[key];
    });
    params.push(id);

    const result = await query(db, `UPDATE programs SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Program not found' });
      return;
    }
    res.json({ message: 'Program updated' });
  }));

  router.delete('/admin/programs/:id', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid program id' });
      return;
    }

    const result = await query(db, 'DELETE FROM programs WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Program not found' });
      return;
    }
    res.json({ message: 'Program deleted' });
  }));

  router.get('/admin/announcements', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 10, 100);
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : null;

    const whereParts = [];
    const params = [];
    if (status) {
      whereParts.push('status = ?');
      params.push(status);
    }
    if (search) {
      const like = `%${search}%`;
      whereParts.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
      params.push(like, like, like);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const items = await query(
      db,
      `SELECT id, title, summary, category, priority, status, image_url, created_at, published_at, scheduled_for
       FROM announcements
       ${whereSql}
       ORDER BY created_at DESC, id DESC
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
      from: total === 0 ? 0 : offset + 1,
      to: Math.min(offset + limit, total)
    });
  }));

  router.get('/admin/announcements/stats', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const statsRows = await query(
      db,
      `SELECT
        SUM(status='published') as published,
        SUM(status='draft') as draft,
        SUM(status='scheduled') as scheduled,
        SUM(status='archived') as archived,
        COUNT(*) as total
       FROM announcements`
    );
    const memberRows = await query(db, 'SELECT COUNT(*) as members FROM members');
    const stats = statsRows[0] || {};
    stats.totalReach = Number(memberRows[0]?.members || 0);
    res.json(stats);
  }));

  router.get('/admin/announcements/:id', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid announcement id' });
      return;
    }
    const rows = await query(db, 'SELECT * FROM announcements WHERE id = ?', [id]);
    if (!rows[0]) {
      res.status(404).json({ message: 'Announcement not found' });
      return;
    }
    res.json(rows[0]);
  }));

  router.post('/admin/announcements', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const {
      title,
      summary,
      content,
      category,
      image_url,
      priority,
      status,
      scheduled_for,
      is_new,
      is_featured
    } = req.body || {};

    if (typeof title !== 'string' || title.trim().length < 3) {
      res.status(400).json({ message: 'Title is required' });
      return;
    }

    const bodyText = typeof content === 'string' ? content.trim() : '';
    const computedSummary = typeof summary === 'string' && summary.trim()
      ? summary.trim()
      : (bodyText ? bodyText.slice(0, 160) : title.trim().slice(0, 160));
    const finalStatus = status || 'draft';
    const publishedAt = finalStatus === 'published' ? new Date() : null;

    const result = await query(
      db,
      `INSERT INTO announcements
        (title, summary, content, category, image_url, priority, status, scheduled_for, published_at, is_new, is_featured, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        computedSummary,
        bodyText || null,
        category || 'General',
        image_url || null,
        priority || 'normal',
        finalStatus,
        finalStatus === 'scheduled' ? (scheduled_for || null) : null,
        publishedAt,
        is_new ? 1 : 0,
        is_featured ? 1 : 0,
        req.userId
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Announcement created' });
  }));

  router.put('/admin/announcements/:id', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid announcement id' });
      return;
    }

    const allowed = ['title', 'summary', 'content', 'category', 'image_url', 'priority', 'status', 'scheduled_for', 'is_new', 'is_featured'];
    const fields = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        fields[key] = req.body[key];
      }
    }

    if (fields.title && (typeof fields.title !== 'string' || fields.title.trim().length < 3)) {
      res.status(400).json({ message: 'Invalid title' });
      return;
    }

    if (fields.content && !fields.summary) {
      const contentText = typeof fields.content === 'string' ? fields.content.trim() : '';
      if (contentText) {
        fields.summary = contentText.slice(0, 160);
      }
    }

    if (fields.status === 'published') {
      fields.published_at = new Date();
      fields.scheduled_for = null;
    } else if (fields.status === 'scheduled') {
      fields.published_at = null;
    }

    const keys = Object.keys(fields);
    if (keys.length === 0) {
      res.status(400).json({ message: 'No changes provided' });
      return;
    }

    const params = keys.map((key) => {
      if (key === 'is_new' || key === 'is_featured') return fields[key] ? 1 : 0;
      if (typeof fields[key] === 'string') return fields[key].trim();
      return fields[key];
    });
    params.push(id);

    const result = await query(db, `UPDATE announcements SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Announcement not found' });
      return;
    }

    res.json({ message: 'Announcement updated' });
  }));

  router.delete('/admin/announcements/:id', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid announcement id' });
      return;
    }

    const result = await query(db, 'DELETE FROM announcements WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Announcement not found' });
      return;
    }
    res.json({ message: 'Announcement deleted' });
  }));

  router.get('/admin/gallery', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 12, 100);
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' && req.query.category !== 'all' ? req.query.category.trim() : null;

    const whereParts = [];
    const params = [];
    if (category) {
      whereParts.push('category = ?');
      params.push(category);
    }
    if (search) {
      const like = `%${search}%`;
      whereParts.push('(caption LIKE ? OR description LIKE ? OR category LIKE ?)');
      params.push(like, like, like);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const items = await query(
      db,
      `SELECT id, url, caption, description, category, is_featured, display_order, created_at
       FROM gallery
       ${whereSql}
       ORDER BY display_order ASC, created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const count = await query(db, `SELECT COUNT(*) as total FROM gallery ${whereSql}`, params);
    const total = Number(count[0]?.total || 0);

    res.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      from: total === 0 ? 0 : offset + 1,
      to: Math.min(offset + limit, total)
    });
  }));

  router.get('/admin/gallery/stats', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const entries = await fs.promises.readdir(uploadService.uploadsDir, { withFileTypes: true });
    let totalBytes = 0;

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        const stats = await fs.promises.stat(path.join(uploadService.uploadsDir, entry.name));
        totalBytes += stats.size;
      } catch (_) {
        // Ignore files that disappear during the scan.
      }
    }

    const rows = await query(db, 'SELECT COUNT(*) as total FROM gallery');
    res.json({ totalImages: Number(rows[0]?.total || 0), storageBytes: totalBytes });
  }));

  router.get('/admin/gallery/:id', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid image id' });
      return;
    }

    const rows = await query(db, 'SELECT * FROM gallery WHERE id = ?', [id]);
    if (!rows[0]) {
      res.status(404).json({ message: 'Image not found' });
      return;
    }
    res.json(rows[0]);
  }));

  router.put('/admin/gallery/:id', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid image id' });
      return;
    }

    const { caption, description, category, is_featured, display_order } = req.body || {};
    const result = await query(
      db,
      `UPDATE gallery SET caption = ?, description = ?, category = ?, is_featured = ?, display_order = ? WHERE id = ?`,
      [
        caption || null,
        description || null,
        category || null,
        is_featured ? 1 : 0,
        Number.isFinite(Number(display_order)) ? Number(display_order) : 0,
        id
      ]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Image not found' });
      return;
    }
    res.json({ message: 'Image updated' });
  }));

  router.delete('/admin/gallery/:id', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid image id' });
      return;
    }

    const rows = await query(db, 'SELECT url FROM gallery WHERE id = ?', [id]);
    const existing = rows[0] || null;
    if (!existing) {
      res.status(404).json({ message: 'Image not found' });
      return;
    }

    await query(db, 'DELETE FROM gallery WHERE id = ?', [id]);
    uploadService.removeUploadByUrl(existing.url);
    res.json({ message: 'Image deleted' });
  }));

  router.post('/admin/gallery', authenticate, rateLimiters.upload, uploadService.upload.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: 'Image is required' });
      return;
    }

    const { caption, description, category } = req.body || {};
    const url = `/uploads/${req.file.filename}`;

    try {
      await query(
        db,
        'INSERT INTO gallery (url, caption, description, category, uploaded_by) VALUES (?, ?, ?, ?, ?)',
        [url, caption || null, description || null, category || null, req.userId]
      );
    } catch (error) {
      uploadService.removeUploadByUrl(url);
      throw error;
    }

    res.json({ message: 'Image uploaded', url });
  }));

  return router;
}

module.exports = { createAdminContentRouter };
