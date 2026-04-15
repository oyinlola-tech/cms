require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Import database initializer
const { initializeDatabase } = require('./db-init');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Global database connection (set after initialization)
let db;

app.disable('x-powered-by');
app.set('trust proxy', 1);

// ==================== EMAIL TRANSPORTER (production only) ====================
let transporter = null;
if (NODE_ENV === 'production') {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendOTP(email, otp) {
  if (NODE_ENV === 'production' && transporter) {
    const mailOptions = {
      from: process.env.SMTP_FROM || '"Sacred Hearth CMS" <noreply@sacredhearth.org>',
      to: email,
      subject: 'Your OTP for Password Reset',
      text: `Your one-time password is: ${otp}. It expires in 10 minutes.`,
      html: `<p>Your one-time password is: <strong>${otp}</strong></p><p>It expires in 10 minutes.</p>`
    };
    await transporter.sendMail(mailOptions);
    console.log(`[PROD] OTP email sent to ${email}`);
  } else {
    console.log(`\n[DEV] OTP for ${email}: ${otp}\n`);
  }
}

// ==================== MIDDLEWARE ====================
const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (NODE_ENV === 'production' && configuredOrigins.length === 0) {
  console.warn('WARNING: CORS_ORIGIN is not set. CORS will reflect request origin (less secure).');
}

app.use(cors({
  origin: configuredOrigins.length > 0 ? configuredOrigins : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));
app.use(express.json({ limit: '1mb' }));

// Basic security headers (lightweight alternative to helmet)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeOriginal = path.basename(file.originalname).replace(/[^\w.\-]/g, '-');
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${id}-${safeOriginal}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Invalid file type'));
    cb(null, true);
  }
});

// Simple in-memory rate limiter (per-process)
const rateBuckets = new Map();
function rateLimit({ windowMs, max, keyPrefix }) {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const key = `${keyPrefix}:${ip}`;
    const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isStrongEnoughPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

// Authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'login' }), async (req, res) => {
  const { email, password } = req.body;
  if (!isValidEmail(email) || typeof password !== 'string') {
    return res.status(400).json({ message: 'Invalid request' });
  }
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (results.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = results[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    db.query('UPDATE users SET last_login = NOW(), last_ip = ? WHERE id = ?', [req.ip, user.id]);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  db.query('SELECT id, name, email, role, avatar, twofa_enabled as twofaEnabled, last_login as lastLogin, last_ip as lastIp FROM users WHERE id = ?', [req.userId], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    const user = results[0] || null;
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.activeSessions = 1;
    res.json(user);
  });
});

app.post('/api/auth/forgot-password', rateLimit({ windowMs: 10 * 60_000, max: 5, keyPrefix: 'forgot' }), async (req, res) => {
  const { email } = req.body;
  if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid request' });
  db.query('SELECT id FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (results.length === 0) {
      // Don't reveal existence
      return res.json({ message: 'If an account exists, an OTP has been sent.' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    db.query('INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
      [email, otp], async (err2) => {
        if (err2) return res.status(500).json({ message: err2.message });
        try {
          await sendOTP(email, otp);
        } catch (emailErr) {
          console.error('Email sending failed:', emailErr);
        }
        res.json({ message: 'If an account exists, an OTP has been sent.' });
      });
  });
});

app.post('/api/auth/verify-otp', rateLimit({ windowMs: 10 * 60_000, max: 10, keyPrefix: 'verify-otp' }), (req, res) => {
  const { email, otp } = req.body;
  if (!isValidEmail(email) || typeof otp !== 'string' || otp.length !== 6) {
    return res.status(400).json({ message: 'Invalid request' });
  }
  db.query(
    'SELECT * FROM password_resets WHERE email = ? AND otp = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
    [email, otp], (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      if (results.length === 0) return res.status(400).json({ message: 'Invalid or expired OTP' });
      const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '10m' });
      res.json({ token });
    });
});

app.post('/api/auth/reset-password', rateLimit({ windowMs: 10 * 60_000, max: 5, keyPrefix: 'reset-password' }), async (req, res) => {
  const { token, newPassword } = req.body;
  if (typeof token !== 'string' || !isStrongEnoughPassword(newPassword)) {
    return res.status(400).json({ message: 'Invalid request' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const hashed = await bcrypt.hash(newPassword, 10);
    db.query('UPDATE users SET password = ? WHERE email = ?', [hashed, decoded.email], (err) => {
      if (err) return res.status(500).json({ message: err.message });
      db.query('DELETE FROM password_resets WHERE email = ?', [decoded.email]);
      res.json({ message: 'Password reset successful' });
    });
  } catch (err) {
    res.status(400).json({ message: 'Invalid or expired token' });
  }
});

app.post('/api/auth/resend-otp', rateLimit({ windowMs: 10 * 60_000, max: 5, keyPrefix: 'resend-otp' }), (req, res) => {
  const { email } = req.body;
  if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid request' });
  db.query('SELECT id FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (results.length === 0) {
      return res.json({ message: 'If an account exists, a new OTP has been sent.' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    db.query('UPDATE password_resets SET otp = ?, expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE email = ? ORDER BY created_at DESC LIMIT 1',
      [otp, email], async (err2, updateResult) => {
        if (err2) return res.status(500).json({ message: err2.message });
        if (!updateResult || updateResult.affectedRows === 0) {
          db.query(
            'INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
            [email, otp]
          );
        }
        try {
          await sendOTP(email, otp);
        } catch (emailErr) {
          console.error('Email sending failed:', emailErr);
        }
        res.json({ message: 'If an account exists, a new OTP has been sent.' });
      });
  });
});

app.post('/api/auth/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || !isStrongEnoughPassword(newPassword)) {
    return res.status(400).json({ message: 'Invalid request' });
  }
  db.query('SELECT password FROM users WHERE id = ?', [req.userId], async (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!results[0]) return res.status(404).json({ message: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, results[0].password);
    if (!valid) return res.status(401).json({ message: 'Current password incorrect' });
    const hashed = await bcrypt.hash(newPassword, 10);
    db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.userId], (err2) => {
      if (err2) return res.status(500).json({ message: err2.message });
      res.json({ message: 'Password changed' });
    });
  });
});

app.put('/api/auth/profile', authenticate, (req, res) => {
  const { name, email } = req.body;
  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ message: 'Invalid name' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid email' });
  db.query('UPDATE users SET name = ?, email = ? WHERE id = ?',
    [name.trim(), email.trim(), req.userId], (err) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json({ message: 'Profile updated' });
    });
});

// ==================== PUBLIC API ====================
app.get('/api/announcements', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;
  const status = req.query.status || 'published';
  const category = req.query.category && req.query.category !== 'all' ? req.query.category : null;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const whereParts = ['status = ?'];
  const params = [status];
  if (category) {
    whereParts.push('category = ?');
    params.push(category);
  }
  if (search) {
    whereParts.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  db.query(
    `SELECT id, title, summary, category, image_url, is_new, created_at 
     FROM announcements ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      db.query(`SELECT COUNT(*) as total FROM announcements ${whereSql}`, params, (e, count) => {
        const total = count[0].total;
        res.json({
          items: results,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        });
      });
    });
});

app.get('/api/announcements/:id', (req, res) => {
  db.query('SELECT * FROM announcements WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (results.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(results[0]);
  });
});

app.get('/api/programs', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const rawStatus = req.query.status || 'upcoming';
  const status = rawStatus === 'past' ? 'completed' : rawStatus;
  db.query(
    `SELECT * FROM programs WHERE status = ? ORDER BY start_datetime ASC LIMIT ?`,
    [status, limit],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(results);
    });
});

app.get('/api/programs/weekly-schedule', (req, res) => {
  db.query('SELECT * FROM weekly_schedule ORDER BY display_order', (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(results);
  });
});

app.get('/api/gallery', (req, res) => {
  const limit = parseInt(req.query.limit) || 12;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;
  db.query(
    'SELECT * FROM gallery ORDER BY display_order, created_at DESC LIMIT ? OFFSET ?',
    [limit, offset],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      db.query('SELECT COUNT(*) as total FROM gallery', (e, count) => {
        const total = count[0].total;
        res.json({
          items: results,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        });
      });
    });
});

app.get('/api/church/info', (req, res) => {
  db.query('SELECT * FROM church_info LIMIT 1', (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(results[0] || {});
  });
});

app.post('/api/contact/send', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (typeof name !== 'string' || name.trim().length < 2) return res.status(400).json({ message: 'Invalid name' });
  if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid email' });
  if (typeof message !== 'string' || message.trim().length < 5) return res.status(400).json({ message: 'Invalid message' });
  db.query(
    'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
    [name, email, phone, subject, message],
    (err) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json({ message: 'Message sent' });
    });
});

// ==================== ADMIN API (Protected) ====================
app.get('/api/dashboard/stats', authenticate, (req, res) => {
  const queries = {
    totalMembers: 'SELECT COUNT(*) as count FROM members',
    newThisMonth: 'SELECT COUNT(*) as count FROM members WHERE joined_date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)',
    monthlyDonations: `SELECT SUM(amount) as total FROM transactions WHERE type='income' AND MONTH(transaction_date)=MONTH(CURDATE())`,
    monthlyExpenses: `SELECT SUM(amount) as total FROM transactions WHERE type='expense' AND MONTH(transaction_date)=MONTH(CURDATE())`,
    upcomingEvents: `SELECT COUNT(*) as count FROM programs WHERE status='upcoming' AND start_datetime >= NOW()`
  };
  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;
  for (const [key, sql] of Object.entries(queries)) {
    db.query(sql, (err, rows) => {
      if (!err) results[key] = rows[0].count || rows[0].total || 0;
      completed++;
      if (completed === total) {
        res.json({
          totalMembers: results.totalMembers,
          newMembersThisMonth: results.newThisMonth,
          monthlyDonations: results.monthlyDonations,
          monthlyExpenses: results.monthlyExpenses,
          donationsChange: 12, // calculate properly in production
          expensesChange: -2,
          upcomingEvents: results.upcomingEvents
        });
      }
    });
  }
});

app.get('/api/dashboard/donation-trends', authenticate, (req, res) => {
  res.json({
    labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
    values: [2100000, 2800000, 1800000, 3200000, 3800000, 4200000]
  });
});

app.get('/api/dashboard/recent-activity', authenticate, (req, res) => {
  db.query(
    `(SELECT 'member_joined' as type, CONCAT(first_name,' ',last_name) as title, 'Joined the parish' as description, created_at FROM members)
     UNION ALL
     (SELECT 'tithe', CONCAT('₦', FORMAT(amount,0)) as title, COALESCE(description, category) as description, created_at FROM transactions WHERE type='income')
     UNION ALL
     (SELECT 'expense', CONCAT('₦', FORMAT(amount,0)) as title, COALESCE(description, category) as description, created_at FROM transactions WHERE type='expense')
     ORDER BY created_at DESC LIMIT 5`,
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(results);
    });
});

app.get('/api/dashboard/upcoming-event', authenticate, (req, res) => {
  db.query(
    `SELECT id, title, start_datetime FROM programs
     WHERE status = 'upcoming' AND start_datetime >= NOW()
     ORDER BY start_datetime ASC LIMIT 1`,
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      const row = rows[0];
      if (!row) return res.json({ id: null, title: 'No upcoming program', date: null });
      res.json({ id: row.id, title: row.title, date: row.start_datetime });
    }
  );
});

app.get('/api/members', authenticate, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  let where = '';
  let params = [];
  if (search) {
    where = `WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?`;
    params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
  }
  db.query(
    `SELECT id, first_name, last_name, email, phone, department, member_type, joined_date, avatar 
     FROM members ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      const items = results.map(m => ({ ...m, name: `${m.first_name} ${m.last_name}` }));
      db.query(`SELECT COUNT(*) as total FROM members ${where}`, params, (e, count) => {
        const total = count[0].total;
        res.json({
          items,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          from: offset + 1,
          to: Math.min(offset + limit, total)
        });
      });
    });
});

app.get('/api/members/stats', authenticate, (req, res) => {
  db.query(
    `SELECT 
      (SELECT COUNT(*) FROM members) as total,
      (SELECT COUNT(*) FROM members WHERE joined_date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) as newThisMonth,
      (SELECT COUNT(DISTINCT member_id) FROM transactions WHERE type='income' AND category='Tithe' AND MONTH(transaction_date)=MONTH(CURDATE())) as activeTithers,
      (SELECT COUNT(DISTINCT department) FROM members WHERE department IS NOT NULL) as departments,
      (SELECT COUNT(*) FROM members WHERE baptism_status = FALSE) as upcomingBaptisms
    `,
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      const d = rows[0];
      d.tithersPercentage = Math.round((d.activeTithers / d.total) * 100) || 0;
      res.json(d);
    });
});

app.get('/api/members/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid member id' });
  db.query('SELECT * FROM members WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!rows[0]) return res.status(404).json({ message: 'Member not found' });
    res.json(rows[0]);
  });
});

app.get('/api/members/:id/profile', authenticate, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid member id' });

  db.query('SELECT * FROM members WHERE id = ?', [id], (err, members) => {
    if (err) return res.status(500).json({ message: err.message });
    const member = members[0];
    if (!member) return res.status(404).json({ message: 'Member not found' });

    const givingSql = `SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE member_id = ? AND type='income' AND YEAR(transaction_date)=YEAR(CURDATE())`;
    const txSql = `SELECT transaction_date as date, category, payment_method as method, amount FROM transactions WHERE member_id = ? ORDER BY transaction_date DESC LIMIT 5`;
    const attendanceSql = `
      SELECT 
        SUM(status='present') as presentCount,
        COUNT(*) as totalCount
      FROM attendance
      WHERE member_id = ? AND event_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`;
    const attendanceRecentSql = `
      SELECT event_date, service_type, status
      FROM attendance
      WHERE member_id = ?
      ORDER BY event_date DESC LIMIT 12`;

    const response = { member };
    let done = 0;
    const finish = () => {
      done += 1;
      if (done === 4) res.json(response);
    };

    db.query(givingSql, [id], (e1, rows) => {
      response.givingYtd = e1 ? 0 : (rows[0]?.total || 0);
      finish();
    });

    db.query(txSql, [id], (e2, rows) => {
      response.recentTransactions = e2 ? [] : rows;
      finish();
    });

    db.query(attendanceSql, [id], (e3, rows) => {
      const r = rows && rows[0] ? rows[0] : { presentCount: 0, totalCount: 0 };
      const present = Number(r.presentCount || 0);
      const total = Number(r.totalCount || 0);
      response.attendanceRate = total > 0 ? Math.round((present / total) * 100) : null;
      finish();
    });

    db.query(attendanceRecentSql, [id], (e4, rows) => {
      response.recentAttendance = e4 ? [] : rows;
      finish();
    });
  });
});

app.post('/api/members', authenticate, (req, res) => {
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

  if (typeof first_name !== 'string' || first_name.trim().length < 1) return res.status(400).json({ message: 'First name required' });
  if (typeof last_name !== 'string' || last_name.trim().length < 1) return res.status(400).json({ message: 'Last name required' });
  if (email && !isValidEmail(email)) return res.status(400).json({ message: 'Invalid email' });

  const sql = `
    INSERT INTO members
      (first_name, last_name, email, phone, address, dob, gender, marital_status, occupation, member_type, department, baptism_status, joined_date)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      first_name.trim(),
      last_name.trim(),
      email ? email.trim() : null,
      phone || null,
      address || null,
      dob || null,
      gender || null,
      marital_status || null,
      occupation || null,
      member_type || 'adult',
      department || null,
      baptism_status ? 1 : 0,
      joined_date || null
    ],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already exists' });
        return res.status(500).json({ message: err.message });
      }
      res.status(201).json({ id: result.insertId, message: 'Member created' });
    }
  );
});

app.put('/api/members/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid member id' });

  const allowed = [
    'first_name', 'last_name', 'email', 'phone', 'address', 'dob', 'gender', 'marital_status',
    'occupation', 'member_type', 'department', 'baptism_status', 'joined_date', 'is_active'
  ];

  const fields = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      fields[key] = req.body[key];
    }
  }

  if (fields.email && !isValidEmail(fields.email)) return res.status(400).json({ message: 'Invalid email' });
  if (fields.first_name && typeof fields.first_name !== 'string') return res.status(400).json({ message: 'Invalid first name' });
  if (fields.last_name && typeof fields.last_name !== 'string') return res.status(400).json({ message: 'Invalid last name' });

  const sets = Object.keys(fields).map(k => `${k} = ?`);
  if (sets.length === 0) return res.status(400).json({ message: 'No changes provided' });

  const params = Object.keys(fields).map(k => fields[k]);
  params.push(id);

  db.query(`UPDATE members SET ${sets.join(', ')} WHERE id = ?`, params, (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already exists' });
      return res.status(500).json({ message: err.message });
    }
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Member not found' });
    res.json({ message: 'Member updated' });
  });
});

app.delete('/api/members/:id', authenticate, (req, res) => {
  db.query('DELETE FROM members WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ message: 'Member deleted' });
  });
});

app.get('/api/finance/summary', authenticate, (req, res) => {
  db.query(
    `SELECT 
      (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='income') - (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='expense') as balance,
      (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='income' AND MONTH(transaction_date)=MONTH(CURDATE()) AND YEAR(transaction_date)=YEAR(CURDATE())) as monthlyTithes,
      (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='expense' AND MONTH(transaction_date)=MONTH(CURDATE()) AND YEAR(transaction_date)=YEAR(CURDATE())) as monthlyExpenses
    `,
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      const d = rows[0];
      d.trend = 12.4;
      d.tithesProgress = 75;
      d.expenseStatus = 'Within Budget';
      res.json(d);
    });
});

app.get('/api/finance/transactions', authenticate, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  db.query(
    `SELECT id, reference, type, category, amount, description, payment_method, status, transaction_date as date, created_at
     FROM transactions
     ORDER BY transaction_date DESC, id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      db.query('SELECT COUNT(*) as total FROM transactions', (e, count) => {
        const total = count[0].total;
        res.json({
          items: results,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          from: offset + 1,
          to: Math.min(offset + limit, total)
        });
      });
    });
});

app.get('/api/finance/export', authenticate, (req, res) => {
  db.query(
    `SELECT reference, type, category, amount, description, status, payment_method, transaction_date
     FROM transactions
     ORDER BY transaction_date DESC, id DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      const header = ['reference', 'type', 'category', 'amount', 'description', 'status', 'payment_method', 'transaction_date'];
      const escape = (v) => {
        const s = (v ?? '').toString().replace(/\"/g, '\"\"');
        return `"${s}"`;
      };
      const csv = [
        header.join(','),
        ...rows.map(r => header.map(k => escape(r[k])).join(','))
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=\"transactions.csv\"');
      res.send(csv);
    }
  );
});

app.post('/api/finance/transactions', authenticate, (req, res) => {
  const {
    type,
    category,
    amount,
    description,
    member_id,
    payment_method,
    status,
    transaction_date
  } = req.body || {};

  if (type !== 'income' && type !== 'expense') return res.status(400).json({ message: 'Invalid type' });
  if (typeof category !== 'string' || category.trim().length < 2) return res.status(400).json({ message: 'Category required' });
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ message: 'Invalid amount' });
  if (!transaction_date) return res.status(400).json({ message: 'Transaction date required' });

  const reference = `TX-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const sql = `
    INSERT INTO transactions
      (reference, type, category, amount, description, member_id, payment_method, status, transaction_date, recorded_by)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(
    sql,
    [
      reference,
      type,
      category.trim(),
      parsedAmount,
      description || null,
      member_id ? parseInt(member_id, 10) : null,
      payment_method || 'cash',
      status || 'completed',
      transaction_date,
      req.userId
    ],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      res.status(201).json({ id: result.insertId, reference, message: 'Transaction created' });
    }
  );
});

app.post('/api/admin/gallery', authenticate, upload.single('image'), (req, res) => {
  const { caption, description, category } = req.body;
  if (!req.file) return res.status(400).json({ message: 'Image is required' });
  const url = `/uploads/${req.file.filename}`;
  db.query(
    'INSERT INTO gallery (url, caption, description, category, uploaded_by) VALUES (?, ?, ?, ?, ?)',
    [url, caption, description, category, req.userId],
    (err) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json({ message: 'Image uploaded', url });
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/programs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'programs.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'gallery.html')));
app.get('/announcements', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'announcements.html')));
app.get('/announcements/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'announcement-details.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'contact.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'terms.html')));
app.get('/give', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'give.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'src', 'auth', 'login.html')));
app.get('/admin/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'src', 'auth', 'forgot-password.html')));
app.get('/admin/verify-otp', (req, res) => res.sendFile(path.join(__dirname, 'src', 'auth', 'verify-otp.html')));
app.get('/admin/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'src', 'auth', 'reset-password.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'src', 'index.html')));
app.get('/admin/members', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'members.html')));
app.get('/admin/members/:id', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'details', 'members-details.html')));
app.get('/admin/finance', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'finance.html')));
app.get('/admin/programs', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'programs.html')));
app.get('/admin/announcements', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'announcements.html')));
app.get('/admin/gallery', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'gallery.html')));
app.get('/admin/reports', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'reports.html')));
app.get('/admin/settings', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'settings.html')));
app.get('/admin/activity', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'reports.html')));

// API 404
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Fallback
app.get('*', (req, res) => res.redirect('/'));

// Error handler (e.g. multer fileFilter errors)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(400).json({ message: err.message || 'Bad request' });
});

if (!process.env.JWT_SECRET) {
  console.error('Startup failed: JWT_SECRET is not set.');
  process.exit(1);
}
if (NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('Startup failed: JWT_SECRET must be at least 32 characters in production.');
  process.exit(1);
}
initializeDatabase()
  .then((connection) => {
    db = connection; // Assign to global for route handlers
    app.listen(PORT, () => {
      console.log(`\nServer running at http://localhost:${PORT}`);
      console.log(`Environment: ${NODE_ENV}`);
      if (NODE_ENV !== 'production') {
        console.log('OTP codes will be shown in console (no real emails sent).');
      }
      if (NODE_ENV !== 'production') {
        console.log(`Admin login: ${process.env.ADMIN_EMAIL}`);
      }
    });
  })
  .catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
