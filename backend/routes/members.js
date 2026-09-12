const express = require('express');
const { asyncHandler } = require('../utils/async-handler');
const { query } = require('../utils/db');
const { buildSafeUpdateSet, isValidDateString, isValidEmail, parseId, parseLimit, parsePage, trimToNull, validateColumns } = require('../utils/validation');

const { sanitizeContent, sanitizeLine } = require('../utils/sanitize');

const ATTENDANCE_STATUSES = new Set(['present', 'absent', 'excused']);
const GENDERS = new Set(['male', 'female', 'other']);
const MEMBER_TYPES = new Set(['adult', 'youth', 'child']);


function createMembersRouter({ db, authenticate, rateLimiters, uploadService, rbac }) {
  const router = express.Router();
  const { requirePermission } = rbac;

  router.get('/members', authenticate, requirePermission('members:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 10, 100);
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    let whereSql = '';
    let params = [];
    if (search) {
      const like = `%${search}%`;
      whereSql = 'WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?';
      params = [like, like, like, like];
    }

    const results = await query(
      db,
      `SELECT id, first_name, last_name, email, phone, department, member_type, joined_date, avatar
       FROM members ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const count = await query(db, `SELECT COUNT(*) as total FROM members ${whereSql}`, params);
    const total = Number(count[0]?.total || 0);
    const items = results.map((member) => ({ ...member, name: `${member.first_name} ${member.last_name}` }));

    res.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      from: total === 0 ? 0 : offset + 1,
      to: Math.min(offset + limit, total)
    });
  }));

  router.get('/members/stats', authenticate, requirePermission('members:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const rows = await query(
      db,
      `SELECT
        (SELECT COUNT(*) FROM members) as total,
        (SELECT COUNT(*) FROM members WHERE joined_date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) as newThisMonth,
        (SELECT COUNT(DISTINCT member_id) FROM transactions WHERE type='income' AND category='Tithe' AND MONTH(transaction_date)=MONTH(CURDATE())) as activeTithers,
        (SELECT COUNT(DISTINCT department) FROM members WHERE department IS NOT NULL) as departments,
        (SELECT COUNT(*) FROM members WHERE baptism_status = FALSE) as upcomingBaptisms`
    );

    const stats = rows[0] || {};
    const total = Number(stats.total || 0);
    stats.tithersPercentage = total > 0 ? Math.round((Number(stats.activeTithers || 0) / total) * 100) : 0;
    res.json(stats);
  }));

  router.get('/members/lookup', authenticate, requirePermission('members:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (!search || search.length < 2) {
      res.json([]);
      return;
    }

    const like = `%${search}%`;
    const rows = await query(
      db,
      `SELECT id, first_name, last_name, email, phone, avatar
       FROM members
       WHERE first_name LIKE ? OR last_name LIKE ? OR CONCAT(first_name,' ',last_name) LIKE ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [like, like, like]
    );

    res.json(rows.map((row) => ({ ...row, name: `${row.first_name} ${row.last_name}` })));
  }));

  router.get('/members/:id', authenticate, requirePermission('members:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }

    const rows = await query(db, 'SELECT * FROM members WHERE id = ?', [id]);
    if (!rows[0]) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    res.json(rows[0]);
  }));

  router.post('/members/:id/avatar', authenticate, requirePermission('members:write'), rateLimiters.upload, uploadService.upload.single('avatar'), asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'Avatar image is required' });
      return;
    }

    const url = `/uploads/${req.file.filename}`;
    const rows = await query(db, 'SELECT avatar FROM members WHERE id = ? LIMIT 1', [id]);
    const oldUrl = rows[0]?.avatar || null;
    const result = await query(db, 'UPDATE members SET avatar = ? WHERE id = ?', [url, id]);

    if (result.affectedRows === 0) {
      uploadService.removeUploadByUrl(url);
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    if (oldUrl && oldUrl !== url) {
      uploadService.removeUploadByUrl(oldUrl);
    }

    res.json({ message: 'Avatar updated', url });
  }));

  router.get('/members/:id/profile', authenticate, requirePermission('members:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }

    const members = await query(db, 'SELECT * FROM members WHERE id = ?', [id]);
    const member = members[0] || null;
    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    const [givingRows, txRows, attendanceRows, recentAttendanceRows] = await Promise.all([
      query(db, `SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE member_id = ? AND type='income' AND YEAR(transaction_date)=YEAR(CURDATE())`, [id]),
      query(db, `SELECT transaction_date as date, category, payment_method as method, amount FROM transactions WHERE member_id = ? ORDER BY transaction_date DESC LIMIT 5`, [id]),
      query(db, `
        SELECT SUM(status='present') as presentCount, COUNT(*) as totalCount
        FROM attendance
        WHERE member_id = ? AND event_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`,
      [id]),
      query(db, `SELECT event_date, service_type, status FROM attendance WHERE member_id = ? ORDER BY event_date DESC LIMIT 12`, [id])
    ]);

    const attendance = attendanceRows[0] || { presentCount: 0, totalCount: 0 };
    const present = Number(attendance.presentCount || 0);
    const total = Number(attendance.totalCount || 0);

    res.json({
      member,
      givingYtd: givingRows[0]?.total || 0,
      recentTransactions: txRows || [],
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : null,
      recentAttendance: recentAttendanceRows || []
    });
  }));

  router.get('/members/:id/transactions', authenticate, requirePermission('finance:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }

    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;

    const items = await query(
      db,
      `SELECT id, reference, type, category, amount, description, payment_method as method,
              status, transaction_date as date, created_at
       FROM transactions
       WHERE member_id = ?
       ORDER BY transaction_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [id, limit, offset]
    );
    const count = await query(db, 'SELECT COUNT(*) as total FROM transactions WHERE member_id = ?', [id]);
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

  router.get('/members/:id/attendance', authenticate, requirePermission('members:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }

    const limit = parseLimit(req.query.limit, 24, 200);
    const rows = await query(
      db,
      `SELECT id, event_date as date, service_type as serviceType, status, notes
       FROM attendance WHERE member_id = ?
       ORDER BY event_date DESC LIMIT ?`,
      [id, limit]
    );

    const summary = await query(
      db,
      `SELECT SUM(status='present') as presentCount, COUNT(*) as totalCount
       FROM attendance
       WHERE member_id = ? AND event_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`,
      [id]
    );
    const present = Number(summary[0]?.presentCount || 0);
    const totalCount = Number(summary[0]?.totalCount || 0);

    res.json({
      items: rows.map((row) => ({ ...row, present: row.status === 'present' })),
      total: rows.length,
      attendanceRate: totalCount > 0 ? Math.round((present / totalCount) * 100) : null
    });
  }));

  router.post('/members/:id/attendance', authenticate, requirePermission('members:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }

    const { event_date, service_type, status, notes } = req.body || {};
    if (!isValidDateString(event_date)) {
      res.status(400).json({ message: 'A valid event date (YYYY-MM-DD) is required' });
      return;
    }
    const finalStatus = status || 'present';
    if (!ATTENDANCE_STATUSES.has(finalStatus)) {
      res.status(400).json({ message: `Status must be one of: ${[...ATTENDANCE_STATUSES].join(', ')}` });
      return;
    }

    const members = await query(db, 'SELECT id FROM members WHERE id = ?', [id]);
    if (members.length === 0) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    const result = await query(
      db,
      'INSERT INTO attendance (member_id, event_date, service_type, status, notes) VALUES (?, ?, ?, ?, ?)',
      [id, event_date, trimToNull(service_type), finalStatus, trimToNull(notes)]
    );
    res.status(201).json({ id: result.insertId, message: 'Attendance recorded' });
  }));

  router.delete('/members/:id/attendance/:attendanceId', authenticate, requirePermission('members:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const attendanceId = parseId(req.params.attendanceId);
    if (!id || !attendanceId) {
      res.status(400).json({ message: 'Invalid id' });
      return;
    }

    const result = await query(db, 'DELETE FROM attendance WHERE id = ? AND member_id = ?', [attendanceId, id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Attendance record not found' });
      return;
    }
    res.json({ message: 'Attendance record removed' });
  }));

  router.get('/members/:id/household', authenticate, requirePermission('members:read'), rateLimiters.adminRead, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }

    const rows = await query(
      db,
      `SELECT
        fm.relationship,
        CASE WHEN fm.member_id = ? THEN m2.id ELSE m1.id END as id,
        CASE WHEN fm.member_id = ? THEN CONCAT(m2.first_name,' ',m2.last_name) ELSE CONCAT(m1.first_name,' ',m1.last_name) END as name,
        CASE WHEN fm.member_id = ? THEN m2.avatar ELSE m1.avatar END as avatar,
        CASE WHEN fm.member_id = ? THEN m2.email ELSE m1.email END as email,
        CASE WHEN fm.member_id = ? THEN m2.phone ELSE m1.phone END as phone,
        fm.member_id as source_member_id,
        fm.related_member_id as target_member_id
       FROM family_members fm
       JOIN members m1 ON fm.member_id = m1.id
       JOIN members m2 ON fm.related_member_id = m2.id
       WHERE fm.member_id = ? OR fm.related_member_id = ?
       ORDER BY name ASC`,
      [id, id, id, id, id, id, id]
    );

    res.json(rows || []);
  }));

  router.post('/members/:id/household', authenticate, requirePermission('members:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const relatedId = parseId(req.body?.related_member_id);
    const relationship = sanitizeLine(req.body?.relationship, 50);

    if (!id || !relatedId) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }
    if (id === relatedId) {
      res.status(400).json({ message: 'Cannot link a member to themselves' });
      return;
    }
    if (!relationship) {
      res.status(400).json({ message: 'Relationship is required' });
      return;
    }

    const memberRows = await query(db, 'SELECT id FROM members WHERE id IN (?, ?)', [id, relatedId]);
    if (memberRows.length < 2) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    const existing = await query(
      db,
      `SELECT id FROM family_members
       WHERE (member_id = ? AND related_member_id = ?) OR (member_id = ? AND related_member_id = ?)
       LIMIT 1`,
      [id, relatedId, relatedId, id]
    );
    if (existing.length > 0) {
      res.status(409).json({ message: 'Already linked' });
      return;
    }

    await query(
      db,
      'INSERT INTO family_members (member_id, related_member_id, relationship) VALUES (?, ?, ?)',
      [id, relatedId, relationship]
    );
    res.status(201).json({ message: 'Household link created' });
  }));

  router.delete('/members/:id/household/:relatedId', authenticate, requirePermission('members:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const relatedId = parseId(req.params.relatedId);
    if (!id || !relatedId) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }

    const result = await query(
      db,
      `DELETE FROM family_members
       WHERE (member_id = ? AND related_member_id = ?) OR (member_id = ? AND related_member_id = ?)`,
      [id, relatedId, relatedId, id]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Link not found' });
      return;
    }

    res.json({ message: 'Link removed' });
  }));

  router.post('/members', authenticate, requirePermission('members:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const {
      first_name,
      last_name,
      email,
      phone,
      address,
      dob,
      gender,
      marital_status,
      occupation,
      member_type,
      department,
      baptism_status,
      joined_date
    } = req.body || {};

    const safeFirst = sanitizeLine(first_name, 50);
    const safeLast = sanitizeLine(last_name, 50);
    if (safeFirst.length < 1) {
      res.status(400).json({ message: 'First name required' });
      return;
    }
    if (safeLast.length < 1) {
      res.status(400).json({ message: 'Last name required' });
      return;
    }
    if (email && !isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid email' });
      return;
    }
    if (gender && !GENDERS.has(gender)) {
      res.status(400).json({ message: `Gender must be one of: ${[...GENDERS].join(', ')}` });
      return;
    }
    if (member_type && !MEMBER_TYPES.has(member_type)) {
      res.status(400).json({ message: `Member type must be one of: ${[...MEMBER_TYPES].join(', ')}` });
      return;
    }
    for (const [label, value] of [['date of birth', dob], ['joined date', joined_date]]) {
      if (value && !isValidDateString(value)) {
        res.status(400).json({ message: `Invalid ${label}` });
        return;
      }
    }

    try {
      const result = await query(
        db,
        `INSERT INTO members
          (first_name, last_name, email, phone, address, dob, gender, marital_status, occupation, member_type, department, baptism_status, joined_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          safeFirst,
          safeLast,
          email ? email.trim().toLowerCase() : null,
          sanitizeLine(phone, 20) || null,
          sanitizeContent(address, { maxLength: 500 }) || null,
          dob || null,
          gender || null,
          sanitizeLine(marital_status, 20) || null,
          sanitizeLine(occupation, 100) || null,
          member_type || 'adult',
          sanitizeLine(department, 50) || null,
          baptism_status ? 1 : 0,
          joined_date || null
        ]
      );
      res.status(201).json({ id: result.insertId, message: 'Member created' });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ message: 'Email already exists' });
        return;
      }
      throw error;
    }
  }));

  router.put('/members/:id', authenticate, requirePermission('members:write'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }

    const allowed = new Set([
      'first_name', 'last_name', 'email', 'phone', 'address', 'dob', 'gender', 'marital_status',
      'occupation', 'member_type', 'department', 'baptism_status', 'joined_date', 'is_active'
    ]);

    const fields = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        fields[key] = req.body[key];
      }
    }

    if (fields.email && !isValidEmail(fields.email)) {
      res.status(400).json({ message: 'Invalid email' });
      return;
    }
    for (const key of ['first_name', 'last_name']) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        fields[key] = sanitizeLine(fields[key], 50);
        if (fields[key].length < 1) {
          res.status(400).json({ message: `Invalid ${key.replace('_', ' ')}` });
          return;
        }
      }
    }
    if (fields.gender && !GENDERS.has(fields.gender)) {
      res.status(400).json({ message: `Gender must be one of: ${[...GENDERS].join(', ')}` });
      return;
    }
    if (fields.member_type && !MEMBER_TYPES.has(fields.member_type)) {
      res.status(400).json({ message: `Member type must be one of: ${[...MEMBER_TYPES].join(', ')}` });
      return;
    }
    for (const key of ['dob', 'joined_date']) {
      if (fields[key] && !isValidDateString(fields[key])) {
        res.status(400).json({ message: `Invalid ${key.replace('_', ' ')}` });
        return;
      }
    }
    for (const [key, max] of [['phone', 20], ['marital_status', 20], ['occupation', 100], ['department', 50]]) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        fields[key] = sanitizeLine(fields[key], max) || null;
      }
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'address')) {
      fields.address = sanitizeContent(fields.address, { maxLength: 500 }) || null;
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'baptism_status')) {
      fields.baptism_status = fields.baptism_status ? 1 : 0;
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'is_active')) {
      fields.is_active = fields.is_active ? 1 : 0;
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
      if (key === 'email' && typeof fields[key] === 'string') return fields[key].trim().toLowerCase();
      return fields[key];
    });
    params.push(id);

    try {
      const { sql: setClause } = buildSafeUpdateSet(validKeys, fields);
      const result = await query(
        db,
        `UPDATE members SET ${setClause} WHERE id = ?`,
        params
      );

      if (result.affectedRows === 0) {
        res.status(404).json({ message: 'Member not found' });
        return;
      }

      res.json({ message: 'Member updated' });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ message: 'Email already exists' });
        return;
      }
      throw error;
    }
  }));

  router.delete('/members/:id', authenticate, requirePermission('members:delete'), rateLimiters.adminWrite, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'Invalid member id' });
      return;
    }

    const result = await query(db, 'DELETE FROM members WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    res.json({ message: 'Member deleted' });
  }));

  return router;
}

module.exports = { createMembersRouter };
