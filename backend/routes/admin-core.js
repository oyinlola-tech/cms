const express = require('express');
const { asyncHandler } = require('../utils/async-handler');
const { query } = require('../utils/db');
const { escapeHtml, isSafeHttpUrl, percentChange } = require('../utils/format');
const { parseId, parseLimit, parsePage } = require('../utils/validation');

function nl2br(value) {
  return escapeHtml(value || '').replace(/\n/g, '<br>');
}

function createAdminCoreRouter({ db, authenticate, rateLimiters, emailService }) {
  const router = express.Router();

  router.get('/dashboard/stats', authenticate, rateLimiters.dashboard, asyncHandler(async (req, res) => {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM members) as totalMembers,
        (SELECT COUNT(*) FROM members WHERE joined_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) as newMembersThisMonth,
        (SELECT COALESCE(SUM(amount),0) FROM transactions
          WHERE type='income' AND status='completed'
            AND transaction_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
            AND transaction_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
        ) as monthlyDonations,
        (SELECT COALESCE(SUM(amount),0) FROM transactions
          WHERE type='income' AND status='completed'
            AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
            AND transaction_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')
        ) as prevMonthlyDonations,
        (SELECT COALESCE(SUM(amount),0) FROM transactions
          WHERE type='expense' AND status='completed'
            AND transaction_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
            AND transaction_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
        ) as monthlyExpenses,
        (SELECT COALESCE(SUM(amount),0) FROM transactions
          WHERE type='expense' AND status='completed'
            AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
            AND transaction_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')
        ) as prevMonthlyExpenses,
        (SELECT COUNT(*) FROM programs WHERE status='upcoming' AND start_datetime >= NOW()) as upcomingEvents
    `;

    const rows = await query(db, sql);
    const data = rows[0] || {};

    res.json({
      totalMembers: Number(data.totalMembers || 0),
      newMembersThisMonth: Number(data.newMembersThisMonth || 0),
      monthlyDonations: Number(data.monthlyDonations || 0),
      monthlyExpenses: Number(data.monthlyExpenses || 0),
      donationsChange: percentChange(data.monthlyDonations, data.prevMonthlyDonations),
      expensesChange: percentChange(data.monthlyExpenses, data.prevMonthlyExpenses),
      upcomingEvents: Number(data.upcomingEvents || 0)
    });
  }));

  router.get('/dashboard/donation-trends', authenticate, rateLimiters.dashboard, asyncHandler(async (req, res) => {
    const months = 6;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
    const rows = await query(
      db,
      `SELECT DATE_FORMAT(transaction_date, '%Y-%m-01') as monthStart, COALESCE(SUM(amount),0) as total
       FROM transactions
       WHERE type='income' AND status='completed' AND transaction_date >= ?
       GROUP BY monthStart
       ORDER BY monthStart ASC`,
      [startStr]
    );

    const byMonth = new Map();
    for (const row of rows || []) {
      if (row && row.monthStart) {
        byMonth.set(String(row.monthStart).slice(0, 10), Number(row.total || 0));
      }
    }

    const labels = [];
    const values = [];
    for (let index = 0; index < months; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
      labels.push(date.toLocaleString('en-US', { month: 'short' }));
      values.push(byMonth.get(key) || 0);
    }

    res.json({ labels, values });
  }));

  router.get('/admin/settings/links', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const rows = await query(
      db,
      'SELECT link_key as `key`, label, url, updated_at as updatedAt FROM external_links ORDER BY id ASC'
    );
    res.json(rows || []);
  }));

  router.put('/admin/settings/links', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const links = Array.isArray(req.body?.links) ? req.body.links : null;
    if (!links) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }

    const updates = [];
    for (const item of links) {
      const key = typeof item?.key === 'string' ? item.key.trim() : '';
      const url = typeof item?.url === 'string' ? item.url.trim() : '';
      if (!key) continue;
      if (url && !isSafeHttpUrl(url)) {
        res.status(400).json({ message: `Invalid URL for ${key}` });
        return;
      }
      updates.push({ key, url: url || null });
    }

    if (updates.length === 0) {
      res.status(400).json({ message: 'No changes provided' });
      return;
    }

    for (const update of updates) {
      await query(db, 'UPDATE external_links SET url = ? WHERE link_key = ?', [update.url, update.key]);
    }

    res.json({ message: 'Links updated' });
  }));

  router.get('/admin/contact/messages', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 10, 50);
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';

    const whereParts = [];
    const params = [];
    if (unreadOnly) {
      whereParts.push('is_read = 0');
    }
    if (search) {
      const like = `%${search}%`;
      whereParts.push('(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)');
      params.push(like, like, like, like);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const rows = await query(
      db,
      `SELECT id, name, email, phone, subject, message, is_read as isRead, created_at as createdAt
       FROM contact_messages
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const count = await query(db, `SELECT COUNT(*) as total FROM contact_messages ${whereSql}`, params);
    const total = Number(count[0]?.total || 0);

    res.json({
      items: rows || [],
      total,
      page,
      totalPages: Math.ceil(total / limit),
      from: total === 0 ? 0 : offset + 1,
      to: Math.min(offset + limit, total)
    });
  }));

  router.put('/admin/contact/messages/:id/read', authenticate, rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid message id' });
      return;
    }

    const result = await query(db, 'UPDATE contact_messages SET is_read = 1 WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }

    res.json({ message: 'Marked as read' });
  }));

  router.post('/admin/contact/messages/:id/reply', authenticate, rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!id) {
      res.status(400).json({ message: 'Invalid message id' });
      return;
    }
    if (subject.length < 3 || subject.length > 150) {
      res.status(400).json({ message: 'Invalid subject' });
      return;
    }
    if (message.length < 2 || message.length > 10000) {
      res.status(400).json({ message: 'Invalid message' });
      return;
    }

    const messages = await query(db, 'SELECT * FROM contact_messages WHERE id = ? LIMIT 1', [id]);
    const original = messages[0] || null;
    if (!original) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }

    const infoRows = await query(db, 'SELECT * FROM church_info LIMIT 1');
    const church = infoRows[0] || {};
    const html = emailService.renderBrandedEmail({
      title: subject,
      preheader: `Reply from ${church.name || 'Sacred Hearth'}`,
      bodyHtml: `
        <p style="margin:0 0 14px 0;font-size:14px;line-height:1.7;">Hello ${escapeHtml(original.name)},</p>
        <p style="margin:0 0 16px 0;font-size:14px;line-height:1.7;">${nl2br(message)}</p>
        <div style="margin:18px 0 0 0;padding:14px 14px;border-radius:14px;background:#f5f3ef;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#735c00;margin-bottom:8px;">Your original message</div>
          <div style="font-size:13px;line-height:1.7;color:#1b1c1a;">
            <div><strong>Subject:</strong> ${escapeHtml(original.subject || '(no subject)')}</div>
            <div style="margin-top:8px;">${nl2br(original.message || '')}</div>
          </div>
        </div>
        <div style="margin-top:18px;font-size:12px;line-height:1.7;color:#414844;">
          <div><strong>${escapeHtml(church.name || 'Sacred Hearth')}</strong></div>
          ${church.address ? `<div>${nl2br(church.address)}</div>` : ''}
          ${church.phone ? `<div>Phone: ${escapeHtml(church.phone)}</div>` : ''}
          ${church.email ? `<div>Email: ${escapeHtml(church.email)}</div>` : ''}
        </div>
      `,
      footerNote: `If you did not request this or need more help, reply to this email or contact ${church.email || 'the church office'}.`
    });

    try {
      await emailService.sendAppEmail({
        to: original.email,
        subject,
        text: `Hello ${original.name},\n\n${message}\n\n---\nOriginal message:\n${original.subject || '(no subject)'}\n${original.message || ''}\n`,
        html
      });
    } catch (error) {
      console.error('Failed to send contact reply:', error);
      res.status(500).json({ message: 'Email sending failed. Check SMTP settings.' });
      return;
    }

    await query(
      db,
      'INSERT INTO contact_replies (contact_message_id, replied_by, to_email, subject, message) VALUES (?, ?, ?, ?, ?)',
      [id, req.userId, original.email, subject, message]
    );
    await query(db, 'UPDATE contact_messages SET is_read = 1 WHERE id = ?', [id]);

    res.json({ message: 'Reply sent' });
  }));

  router.get('/dashboard/recent-activity', authenticate, rateLimiters.dashboard, asyncHandler(async (req, res) => {
    const rows = await query(
      db,
      `(SELECT 'member_joined' as type, CONCAT(first_name,' ',last_name) as title, 'Joined the parish' as description, created_at FROM members)
       UNION ALL
       (SELECT 'tithe' as type, CONCAT('NGN ', FORMAT(amount,0)) as title, COALESCE(description, category) as description, created_at FROM transactions WHERE type='income')
       UNION ALL
       (SELECT 'expense' as type, CONCAT('NGN ', FORMAT(amount,0)) as title, COALESCE(description, category) as description, created_at FROM transactions WHERE type='expense')
       ORDER BY created_at DESC LIMIT 5`
    );
    res.json(rows);
  }));

  router.get('/dashboard/upcoming-event', authenticate, rateLimiters.dashboard, asyncHandler(async (req, res) => {
    const rows = await query(
      db,
      `SELECT id, title, start_datetime FROM programs
       WHERE status = 'upcoming' AND start_datetime >= NOW()
       ORDER BY start_datetime ASC LIMIT 1`
    );

    const row = rows[0];
    if (!row) {
      res.json({ id: null, title: 'No upcoming program', date: null });
      return;
    }

    res.json({ id: row.id, title: row.title, date: row.start_datetime });
  }));

  return router;
}

module.exports = { createAdminCoreRouter };
