const fs = require('fs');
const path = require('path');
const express = require('express');
const { asyncHandler } = require('../utils/async-handler');
const { query } = require('../utils/db');
const { buildSafeUpdateSet, isValidDateTimeString, parseId, parseLimit, parsePage, trimToNull, validateColumns } = require('../utils/validation');
const { sanitizeContent, sanitizeImageUrl, sanitizeLine } = require('../utils/sanitize');

const PROGRAM_TYPES = new Set(['devotion', 'service', 'fellowship', 'bible_study', 'outreach', 'youth', 'other']);
const PROGRAM_STATUSES = new Set(['upcoming', 'ongoing', 'completed', 'cancelled']);
const RECURRENCES = new Set(['none', 'daily', 'weekly', 'monthly']);
const ANNOUNCEMENT_STATUSES = new Set(['draft', 'published', 'scheduled', 'archived']);
const ANNOUNCEMENT_PRIORITIES = new Set(['normal', 'high', 'urgent']);

/**
 * Rejects values that would not fit the programs table ENUM columns.
 * MySQL would otherwise either error out or silently coerce them.
 * @param {Object} values - Partial program fields
 * @returns {string|null} - An error message, or null when everything is valid
 */
function checkEnums({ type, status, recurring }) {
  if (type !== undefined && type !== null && !PROGRAM_TYPES.has(type)) {
    return `Type must be one of: ${[...PROGRAM_TYPES].join(', ')}`;
  }
  if (status !== undefined && status !== null && !PROGRAM_STATUSES.has(status)) {
    return `Status must be one of: ${[...PROGRAM_STATUSES].join(', ')}`;
  }
  if (recurring !== undefined && recurring !== null && !RECURRENCES.has(recurring)) {
    return `Recurring must be one of: ${[...RECURRENCES].join(', ')}`;
  }
  return null;
}

function createAdminContentRouter({ db, authenticate, rateLimiters, uploadService, rbac }) {
  const router = express.Router();
  const { requirePermission } = rbac;

  router.get('/admin/programs', authenticate, requirePermission('programs:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
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

  router.get('/admin/programs/stats', authenticate, requirePermission('programs:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
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

  router.get('/admin/programs/:id', authenticate, requirePermission('programs:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
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

  router.post('/admin/programs', authenticate, requirePermission('programs:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
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

    const safeTitle = sanitizeLine(title, 200);
    if (safeTitle.length < 3) {
      res.status(400).json({ message: 'Title must be at least 3 characters' });
      return;
    }
    if (!isValidDateTimeString(start_datetime)) {
      res.status(400).json({ message: 'A valid start date/time is required' });
      return;
    }
    if (end_datetime && !isValidDateTimeString(end_datetime)) {
      res.status(400).json({ message: 'Invalid end date/time' });
      return;
    }
    if (recurring_until && !isValidDateTimeString(recurring_until)) {
      res.status(400).json({ message: 'Invalid recurring-until date' });
      return;
    }

    const enumError = checkEnums({ type, status, recurring });
    if (enumError) {
      res.status(400).json({ message: enumError });
      return;
    }

    const result = await query(
      db,
      `INSERT INTO programs
        (title, description, type, category, location, start_datetime, end_datetime, recurring, recurring_until, schedule, is_main_service, is_featured, status, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        safeTitle,
        sanitizeContent(description, { maxLength: 10000 }) || null,
        type || 'service',
        sanitizeLine(category, 50) || null,
        sanitizeLine(location, 200) || null,
        start_datetime,
        end_datetime || null,
        recurring || 'none',
        recurring_until || null,
        sanitizeLine(schedule, 100) || null,
        is_main_service ? 1 : 0,
        is_featured ? 1 : 0,
        status || 'upcoming',
        Number.isFinite(Number(display_order)) ? Number(display_order) : 0
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Program created' });
  }));

  router.put('/admin/programs/:id', authenticate, requirePermission('programs:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid program id' });
      return;
    }

    const allowed = new Set([
      'title', 'description', 'type', 'category', 'location', 'start_datetime', 'end_datetime',
      'recurring', 'recurring_until', 'schedule', 'is_main_service', 'is_featured', 'status', 'display_order'
    ]);
    const fields = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        fields[key] = req.body[key];
      }
    }

    if (Object.prototype.hasOwnProperty.call(fields, 'title')) {
      fields.title = sanitizeLine(fields.title, 200);
      if (fields.title.length < 3) {
        res.status(400).json({ message: 'Title must be at least 3 characters' });
        return;
      }
    }

    for (const key of ['start_datetime', 'end_datetime', 'recurring_until']) {
      if (fields[key] && !isValidDateTimeString(fields[key])) {
        res.status(400).json({ message: `Invalid ${key.replace(/_/g, ' ')}` });
        return;
      }
    }

    const enumError = checkEnums(fields);
    if (enumError) {
      res.status(400).json({ message: enumError });
      return;
    }

    const keys = Object.keys(fields);
    if (keys.length === 0) {
      res.status(400).json({ message: 'No changes provided' });
      return;
    }

    const validKeys = validateColumns(keys, allowed);
    if (!validKeys) {
      res.status(400).json({ message: 'Invalid field' });
      return;
    }

    const params = validKeys.map((key) => {
      if (key === 'is_main_service' || key === 'is_featured') return fields[key] ? 1 : 0;
      if (key === 'display_order') return Number.isFinite(Number(fields[key])) ? Number(fields[key]) : 0;
      if (key === 'description') return sanitizeContent(fields[key], { maxLength: 10000 }) || null;
      if (key === 'category') return sanitizeLine(fields[key], 50) || null;
      if (key === 'location') return sanitizeLine(fields[key], 200) || null;
      if (key === 'schedule') return sanitizeLine(fields[key], 100) || null;
      if (typeof fields[key] === 'string') return fields[key].trim();
      return fields[key];
    });
    params.push(id);

    const { sql: setClause } = buildSafeUpdateSet(validKeys, fields);
    const result = await query(db, `UPDATE programs SET ${setClause} WHERE id = ?`, params);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Program not found' });
      return;
    }
    res.json({ message: 'Program updated' });
  }));

  router.delete('/admin/programs/:id', authenticate, requirePermission('programs:delete'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
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

  router.get('/admin/announcements', authenticate, requirePermission('announcements:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
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

  router.get('/admin/announcements/stats', authenticate, requirePermission('announcements:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
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

  router.get('/admin/announcements/:id', authenticate, requirePermission('announcements:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
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

  router.post('/admin/announcements', authenticate, requirePermission('announcements:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
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

    const safeTitle = sanitizeLine(title, 200);
    if (safeTitle.length < 3) {
      res.status(400).json({ message: 'Title must be at least 3 characters' });
      return;
    }

    const finalStatus = status || 'draft';
    if (!ANNOUNCEMENT_STATUSES.has(finalStatus)) {
      res.status(400).json({ message: `Status must be one of: ${[...ANNOUNCEMENT_STATUSES].join(', ')}` });
      return;
    }
    const finalPriority = priority || 'normal';
    if (!ANNOUNCEMENT_PRIORITIES.has(finalPriority)) {
      res.status(400).json({ message: `Priority must be one of: ${[...ANNOUNCEMENT_PRIORITIES].join(', ')}` });
      return;
    }
    if (finalStatus === 'scheduled' && !isValidDateTimeString(scheduled_for)) {
      res.status(400).json({ message: 'A scheduled announcement needs a valid scheduled_for date/time' });
      return;
    }

    // Announcement content is rendered on a public page, so it is stored as
    // plain text - no markup survives, which removes the stored-XSS vector.
    const bodyText = sanitizeContent(content, { maxLength: 20000 });
    const safeSummary = sanitizeLine(summary, 300);
    const computedSummary = safeSummary || (bodyText ? bodyText.slice(0, 160) : safeTitle.slice(0, 160));
    const publishedAt = finalStatus === 'published' ? new Date() : null;

    const result = await query(
      db,
      `INSERT INTO announcements
        (title, summary, content, category, image_url, priority, status, scheduled_for, published_at, is_new, is_featured, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        safeTitle,
        computedSummary,
        bodyText || null,
        sanitizeLine(category, 50) || 'General',
        sanitizeImageUrl(image_url),
        finalPriority,
        finalStatus,
        finalStatus === 'scheduled' ? scheduled_for : null,
        publishedAt,
        is_new ? 1 : 0,
        is_featured ? 1 : 0,
        req.userId
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Announcement created' });
  }));

  router.put('/admin/announcements/:id', authenticate, requirePermission('announcements:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid announcement id' });
      return;
    }

    const allowed = new Set(['title', 'summary', 'content', 'category', 'image_url', 'priority', 'status', 'scheduled_for', 'is_new', 'is_featured']);
    const fields = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        fields[key] = req.body[key];
      }
    }

    if (Object.prototype.hasOwnProperty.call(fields, 'title')) {
      fields.title = sanitizeLine(fields.title, 200);
      if (fields.title.length < 3) {
        res.status(400).json({ message: 'Title must be at least 3 characters' });
        return;
      }
    }

    if (fields.status !== undefined && !ANNOUNCEMENT_STATUSES.has(fields.status)) {
      res.status(400).json({ message: `Status must be one of: ${[...ANNOUNCEMENT_STATUSES].join(', ')}` });
      return;
    }
    if (fields.priority !== undefined && !ANNOUNCEMENT_PRIORITIES.has(fields.priority)) {
      res.status(400).json({ message: `Priority must be one of: ${[...ANNOUNCEMENT_PRIORITIES].join(', ')}` });
      return;
    }
    if (fields.status === 'scheduled' && !isValidDateTimeString(fields.scheduled_for)) {
      res.status(400).json({ message: 'A scheduled announcement needs a valid scheduled_for date/time' });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(fields, 'content')) {
      fields.content = sanitizeContent(fields.content, { maxLength: 20000 });
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'summary')) {
      fields.summary = sanitizeLine(fields.summary, 300);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'image_url')) {
      fields.image_url = sanitizeImageUrl(fields.image_url);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'category')) {
      fields.category = sanitizeLine(fields.category, 50) || 'General';
    }

    if (fields.content && !fields.summary) {
      fields.summary = fields.content.slice(0, 160);
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

    const validKeys = validateColumns(keys, allowed);
    if (!validKeys) {
      res.status(400).json({ message: 'Invalid field' });
      return;
    }

    const params = validKeys.map((key) => {
      if (key === 'is_new' || key === 'is_featured') return fields[key] ? 1 : 0;
      if (typeof fields[key] === 'string') return fields[key].trim();
      return fields[key];
    });
    params.push(id);

    const { sql: setClause } = buildSafeUpdateSet(validKeys, fields);
    const result = await query(db, `UPDATE announcements SET ${setClause} WHERE id = ?`, params);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Announcement not found' });
      return;
    }

    res.json({ message: 'Announcement updated' });
  }));

  router.delete('/admin/announcements/:id', authenticate, requirePermission('announcements:delete'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
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

  router.get('/admin/gallery', authenticate, requirePermission('gallery:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
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

  router.get('/admin/gallery/stats', authenticate, requirePermission('gallery:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
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

  router.get('/admin/gallery/:id', authenticate, requirePermission('gallery:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
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

  router.put('/admin/gallery/:id', authenticate, requirePermission('gallery:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
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
        sanitizeLine(caption, 255) || null,
        sanitizeContent(description, { maxLength: 2000 }) || null,
        sanitizeLine(category, 50) || null,
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

  router.delete('/admin/gallery/:id', authenticate, requirePermission('gallery:delete'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
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

  router.post('/admin/gallery', authenticate, requirePermission('gallery:write'), rateLimiters.upload, uploadService.upload.single('image'), asyncHandler(async (req, res) => {
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
        [url, sanitizeLine(caption, 255) || null, sanitizeContent(description, { maxLength: 2000 }) || null, sanitizeLine(category, 50) || null, req.userId]
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
