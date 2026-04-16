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
const { escapeHtml, percentChange, isSafeHttpUrl } = require('./lib/utils');

// Import database initializer
const { initializeDatabase } = require('./db-init');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Global database connection (set after initialization)
let db;

app.disable('x-powered-by');
app.set('trust proxy', 1);


//Email transporter for production
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

async function sendAppEmail({ to, subject, text, html }) {
  if (NODE_ENV === 'production') {
    if (!transporter) throw new Error('SMTP is not configured');
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Sacred Hearth CMS" <noreply@sacredhearth.org>',
      to,
      subject,
      text,
      html
    });
    return;
  }
  console.log('\n[DEV EMAIL]');
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log(text || '(no text)');
  console.log('[/DEV EMAIL]\n');
}

function renderBrandedEmail({ title, preheader, bodyHtml, footerNote }) {
  const brand = {
    primary: '#002d1c',
    secondary: '#735c00',
    surface: '#fbf9f5',
    text: '#1b1c1a'
  };
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader || '');
  const safeFooter = escapeHtml(footerNote || '');

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${safeTitle}</title>
    </head>
    <body style="margin:0;padding:0;background:${brand.surface};color:${brand.text};font-family:Arial,Helvetica,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${brand.surface};padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
              <tr>
                <td style="padding:22px 24px;background:${brand.primary};color:#ffffff;">
                  <div style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.9;">Sacred Hearth</div>
                  <div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.2;">${safeTitle}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 24px;">
                  ${bodyHtml}
                </td>
              </tr>
              <tr>
                <td style="padding:18px 24px;background:#f5f3ef;color:#414844;font-size:12px;line-height:1.6;">
                  <div style="font-weight:700;color:${brand.secondary};margin-bottom:6px;">Need help?</div>
                  <div>${safeFooter}</div>
                </td>
              </tr>
            </table>
            <div style="font-size:11px;opacity:0.6;margin-top:14px;">© ${new Date().getFullYear()} Sacred Hearth CMS</div>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (NODE_ENV === 'production' && configuredOrigins.length === 0) {
  console.warn('WARNING: CORS_ORIGIN is not set. CORS will reflect request origin (less secure).');
}

app.use(cors({
  origin: configuredOrigins.length > 0 ? configuredOrigins : false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));
app.use(express.json({ limit: '1mb' }));

//Helmet
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self'"
  ].join('; '));
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// Multer 
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

//Auth middleware
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

app.get('/api/auth/me', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'auth-me' }), (req, res) => {
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
      // Don't reveal existence for basic secrurity
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

app.post('/api/auth/change-password', authenticate, rateLimit({ windowMs: 5 * 60_000, max: 5, keyPrefix: 'change-password' }), async (req, res) => {
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

app.put('/api/auth/profile', authenticate, rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'profile-update' }), (req, res) => {
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

//Public
app.get('/api/announcements', rateLimit({ windowMs: 60_000, max: 200, keyPrefix: 'public-announcements' }), (req, res) => {
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

app.get('/api/announcements/:id', rateLimit({ windowMs: 60_000, max: 200, keyPrefix: 'public-announcement' }), (req, res) => {
  db.query('SELECT * FROM announcements WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (results.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(results[0]);
  });
});

app.get('/api/programs', rateLimit({ windowMs: 60_000, max: 200, keyPrefix: 'public-programs' }), (req, res) => {
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

app.get('/api/programs/weekly-schedule', rateLimit({ windowMs: 60_000, max: 200, keyPrefix: 'public-schedule' }), (req, res) => {
  db.query('SELECT * FROM weekly_schedule ORDER BY display_order', (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(results);
  });
});

app.get('/api/gallery', rateLimit({ windowMs: 60_000, max: 200, keyPrefix: 'public-gallery' }), (req, res) => {
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

app.get('/api/church/info', rateLimit({ windowMs: 60_000, max: 200, keyPrefix: 'public-church' }), (req, res) => {
  db.query('SELECT * FROM church_info LIMIT 1', (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(results[0] || {});
  });
});

app.post('/api/contact/send', rateLimit({ windowMs: 10 * 60_000, max: 10, keyPrefix: 'contact' }), (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (typeof name !== 'string' || name.trim().length < 2) return res.status(400).json({ message: 'Invalid name' });
  if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid email' });
  if (typeof message !== 'string' || message.trim().length < 5) return res.status(400).json({ message: 'Invalid message' });
  if (typeof subject === 'string' && subject.length > 100) return res.status(400).json({ message: 'Subject too long' });
  if (typeof phone === 'string' && phone.length > 30) return res.status(400).json({ message: 'Phone too long' });
  if (message.length > 5000) return res.status(400).json({ message: 'Message too long' });
  db.query(
    'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
    [name, email, phone, subject, message],
    (err) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json({ message: 'Message sent' });
    });
});

// Public: external links (wired from admin settings)
app.get('/api/public/links', rateLimit({ windowMs: 60_000, max: 200, keyPrefix: 'public-links' }), (req, res) => {
  db.query('SELECT link_key, url FROM external_links', (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    const out = {};
    for (const r of rows || []) {
      if (r && r.link_key && typeof r.url === 'string' && r.url.trim()) {
        out[r.link_key] = r.url.trim();
      }
    }
    res.json(out);
  });
});

// Admin routes
app.get('/api/dashboard/stats', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'dashboard-stats' }), (req, res) => {
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
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    const r = rows && rows[0] ? rows[0] : {};
    res.json({
      totalMembers: Number(r.totalMembers || 0),
      newMembersThisMonth: Number(r.newMembersThisMonth || 0),
      monthlyDonations: Number(r.monthlyDonations || 0),
      monthlyExpenses: Number(r.monthlyExpenses || 0),
      donationsChange: percentChange(r.monthlyDonations, r.prevMonthlyDonations),
      expensesChange: percentChange(r.monthlyExpenses, r.prevMonthlyExpenses),
      upcomingEvents: Number(r.upcomingEvents || 0)
    });
  });
});

app.get('/api/dashboard/donation-trends', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'donation-trends' }), (req, res) => {
  const months = 6;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;

  const sql = `
    SELECT DATE_FORMAT(transaction_date, '%Y-%m-01') as monthStart, COALESCE(SUM(amount),0) as total
    FROM transactions
    WHERE type='income' AND status='completed' AND transaction_date >= ?
    GROUP BY monthStart
    ORDER BY monthStart ASC
  `;

  db.query(sql, [startStr], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    const byMonth = new Map();
    for (const r of rows || []) {
      if (r && r.monthStart) byMonth.set(String(r.monthStart).slice(0, 10), Number(r.total || 0));
    }
    const labels = [];
    const values = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      labels.push(d.toLocaleString('en-US', { month: 'short' }));
      values.push(byMonth.get(key) || 0);
    }
    res.json({ labels, values });
  });
});

// Admin settings: external links (used by public "Watch Online", "Join Our Service", etc.)
app.get('/api/admin/settings/links', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'settings-links' }), (req, res) => {
  db.query(
    'SELECT link_key as `key`, label, url, updated_at as updatedAt FROM external_links ORDER BY id ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(rows || []);
    }
  );
});

app.put('/api/admin/settings/links', authenticate, rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'settings-links-update' }), (req, res) => {
  const links = Array.isArray(req.body?.links) ? req.body.links : null;
  if (!links) return res.status(400).json({ message: 'Invalid request' });

  const updates = [];
  for (const l of links) {
    const key = typeof l?.key === 'string' ? l.key.trim() : '';
    const url = typeof l?.url === 'string' ? l.url.trim() : '';
    if (!key) continue;
    if (url && !isSafeHttpUrl(url)) return res.status(400).json({ message: `Invalid URL for ${key}` });
    updates.push({ key, url: url || null });
  }
  if (updates.length === 0) return res.status(400).json({ message: 'No changes provided' });

  let done = 0;
  for (const u of updates) {
    db.query('UPDATE external_links SET url = ? WHERE link_key = ?', [u.url, u.key], (err) => {
      if (err) return res.status(500).json({ message: err.message });
      done += 1;
      if (done === updates.length) res.json({ message: 'Links updated' });
    });
  }
});

// Admin: contact inbox + replies
app.get('/api/admin/contact/messages', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'contact-messages' }), (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);
  const offset = (page - 1) * limit;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';

  const whereParts = [];
  const params = [];
  if (unreadOnly) whereParts.push('is_read = 0');
  if (search) {
    whereParts.push('(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  db.query(
    `SELECT id, name, email, phone, subject, message, is_read as isRead, created_at as createdAt
     FROM contact_messages
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      db.query(`SELECT COUNT(*) as total FROM contact_messages ${whereSql}`, params, (e, count) => {
        if (e) return res.status(500).json({ message: e.message });
        const total = Number(count?.[0]?.total || 0);
        res.json({
          items: rows || [],
          total,
          page,
          totalPages: Math.ceil(total / limit),
          from: total === 0 ? 0 : offset + 1,
          to: Math.min(offset + limit, total)
        });
      });
    }
  );
});

app.put('/api/admin/contact/messages/:id/read', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'contact-mark-read' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid message id' });
  db.query('UPDATE contact_messages SET is_read = 1 WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Message not found' });
    res.json({ message: 'Marked as read' });
  });
});

app.post('/api/admin/contact/messages/:id/reply', authenticate, rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'contact-reply' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid message id' });
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (subject.length < 3 || subject.length > 150) return res.status(400).json({ message: 'Invalid subject' });
  if (message.length < 2 || message.length > 10000) return res.status(400).json({ message: 'Invalid message' });

  db.query('SELECT * FROM contact_messages WHERE id = ? LIMIT 1', [id], async (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    const msg = rows && rows[0] ? rows[0] : null;
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    db.query('SELECT * FROM church_info LIMIT 1', async (e2, infoRows) => {
      if (e2) return res.status(500).json({ message: e2.message });
      const church = infoRows && infoRows[0] ? infoRows[0] : {};
      const title = subject;
      const bodyHtml = `
        <p style="margin:0 0 14px 0;font-size:14px;line-height:1.7;">Hello ${escapeHtml(msg.name)},</p>
        <p style="margin:0 0 16px 0;font-size:14px;line-height:1.7;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        <div style="margin:18px 0 0 0;padding:14px 14px;border-radius:14px;background:#f5f3ef;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#735c00;margin-bottom:8px;">Your original message</div>
          <div style="font-size:13px;line-height:1.7;color:#1b1c1a;">
            <div><strong>Subject:</strong> ${escapeHtml(msg.subject || '(no subject)')}</div>
            <div style="margin-top:8px;">${escapeHtml(msg.message || '').replace(/\n/g, '<br>')}</div>
          </div>
        </div>
        <div style="margin-top:18px;font-size:12px;line-height:1.7;color:#414844;">
          <div><strong>${escapeHtml(church.name || 'Sacred Hearth')}</strong></div>
          ${church.address ? `<div>${escapeHtml(church.address).replace(/\n/g, '<br>')}</div>` : ''}
          ${church.phone ? `<div>Phone: ${escapeHtml(church.phone)}</div>` : ''}
          ${church.email ? `<div>Email: ${escapeHtml(church.email)}</div>` : ''}
        </div>
      `;

      const html = renderBrandedEmail({
        title,
        preheader: `Reply from ${church.name || 'Sacred Hearth'}`,
        bodyHtml,
        footerNote: `If you didn’t request this or need more help, reply to this email or contact ${church.email || 'the church office'}.`
      });

      try {
        await sendAppEmail({
          to: msg.email,
          subject,
          text: `Hello ${msg.name},\n\n${message}\n\n---\nOriginal message:\n${msg.subject || '(no subject)'}\n${msg.message || ''}\n`,
          html
        });
      } catch (sendErr) {
        console.error('Failed to send contact reply:', sendErr);
        return res.status(500).json({ message: 'Email sending failed. Check SMTP settings.' });
      }

      db.query(
        'INSERT INTO contact_replies (contact_message_id, replied_by, to_email, subject, message) VALUES (?, ?, ?, ?, ?)',
        [id, req.userId, msg.email, subject, message],
        (e3) => {
          if (e3) return res.status(500).json({ message: e3.message });
          db.query('UPDATE contact_messages SET is_read = 1 WHERE id = ?', [id], () => {
            res.json({ message: 'Reply sent' });
          });
        }
      );
    });
  });
});

app.get('/api/dashboard/recent-activity', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'recent-activity' }), (req, res) => {
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

app.get('/api/dashboard/upcoming-event', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'upcoming-event' }), (req, res) => {
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

app.get('/api/members', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'members-list' }), (req, res) => {
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

app.get('/api/members/lookup', authenticate, rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'members-lookup' }), (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (!search || search.length < 2) return res.json([]);
  const like = `%${search}%`;
  db.query(
    `SELECT id, first_name, last_name, email, phone, avatar
     FROM members
     WHERE first_name LIKE ? OR last_name LIKE ? OR CONCAT(first_name,' ',last_name) LIKE ?
     ORDER BY created_at DESC
     LIMIT 10`,
    [like, like, like],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(rows.map(r => ({ ...r, name: `${r.first_name} ${r.last_name}` })));
    }
  );
});

app.get('/api/members/:id', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'member-get' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid member id' });
  db.query('SELECT * FROM members WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!rows[0]) return res.status(404).json({ message: 'Member not found' });
    res.json(rows[0]);
  });
});

app.post('/api/members/:id/avatar', authenticate, rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'avatar-upload' }), upload.single('avatar'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid member id' });
  if (!req.file) return res.status(400).json({ message: 'Avatar image is required' });
  const url = `/uploads/${req.file.filename}`;
  db.query('SELECT avatar FROM members WHERE id = ? LIMIT 1', [id], (e0, rows) => {
    if (e0) return res.status(500).json({ message: e0.message });
    const oldUrl = rows && rows[0] ? rows[0].avatar : null;
    db.query('UPDATE members SET avatar = ? WHERE id = ?', [url, id], (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Member not found' });

      if (typeof oldUrl === 'string' && oldUrl.startsWith('/uploads/') && oldUrl !== url) {
        const filename = path.basename(oldUrl);
        const filePath = path.join(uploadsDir, filename);
        fs.unlink(filePath, () => {});
      }

      res.json({ message: 'Avatar updated', url });
    });
  });
});

app.get('/api/members/:id/profile', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'member-profile' }), (req, res) => {
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

app.get('/api/members/:id/household', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'member-household' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid member id' });

  db.query(
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
    [id, id, id, id, id, id, id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(rows || []);
    }
  );
});

app.post('/api/members/:id/household', authenticate, rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'household-create' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const relatedId = parseInt(req.body?.related_member_id, 10);
  const relationship = typeof req.body?.relationship === 'string' ? req.body.relationship.trim() : '';
  if (!Number.isFinite(id) || !Number.isFinite(relatedId)) return res.status(400).json({ message: 'Invalid member id' });
  if (id === relatedId) return res.status(400).json({ message: 'Cannot link a member to themselves' });
  if (!relationship) return res.status(400).json({ message: 'Relationship is required' });

  db.query('SELECT id FROM members WHERE id IN (?, ?)', [id, relatedId], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!rows || rows.length < 2) return res.status(404).json({ message: 'Member not found' });

    db.query(
      `SELECT id FROM family_members
       WHERE (member_id = ? AND related_member_id = ?) OR (member_id = ? AND related_member_id = ?)
       LIMIT 1`,
      [id, relatedId, relatedId, id],
      (err2, existing) => {
        if (err2) return res.status(500).json({ message: err2.message });
        if (existing && existing.length > 0) return res.status(409).json({ message: 'Already linked' });

        db.query(
          'INSERT INTO family_members (member_id, related_member_id, relationship) VALUES (?, ?, ?)',
          [id, relatedId, relationship],
          (err3) => {
            if (err3) return res.status(500).json({ message: err3.message });
            res.status(201).json({ message: 'Household link created' });
          }
        );
      }
    );
  });
});

app.delete('/api/members/:id/household/:relatedId', authenticate, rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'household-delete' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const relatedId = parseInt(req.params.relatedId, 10);
  if (!Number.isFinite(id) || !Number.isFinite(relatedId)) return res.status(400).json({ message: 'Invalid member id' });

  db.query(
    `DELETE FROM family_members
     WHERE (member_id = ? AND related_member_id = ?) OR (member_id = ? AND related_member_id = ?)`,
    [id, relatedId, relatedId, id],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Link not found' });
      res.json({ message: 'Link removed' });
    }
  );
});

app.post('/api/members', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 10, keyPrefix: 'member-create' }), (req, res) => {
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

app.put('/api/members/:id', authenticate, rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'member-update' }), (req, res) => {
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

app.delete('/api/members/:id', authenticate, rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'member-delete' }), (req, res) => {
  db.query('DELETE FROM members WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ message: 'Member deleted' });
  });
});

app.get('/api/finance/summary', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'finance-summary' }), (req, res) => {
  db.query(
    `SELECT 
      (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='income' AND status='completed')
        - (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='expense' AND status='completed') as balance,
      (SELECT COALESCE(SUM(amount),0) FROM transactions
        WHERE type='income' AND status='completed'
          AND transaction_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
          AND transaction_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
      ) as monthlyTithes,
      (SELECT COALESCE(SUM(amount),0) FROM transactions
        WHERE type='expense' AND status='completed'
          AND transaction_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
          AND transaction_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
      ) as monthlyExpenses,
      (SELECT COALESCE(SUM(amount),0) FROM transactions
        WHERE type='income' AND status='completed'
          AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
          AND transaction_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')
      ) as prevMonthlyTithes,
      (SELECT COALESCE(AVG(month_total),0) FROM (
        SELECT SUM(amount) as month_total
        FROM transactions
        WHERE type='income' AND status='completed'
          AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 6 MONTH)
        GROUP BY YEAR(transaction_date), MONTH(transaction_date)
      ) t) as avgIncome6m,
      (SELECT COALESCE(AVG(month_total),0) FROM (
        SELECT SUM(amount) as month_total
        FROM transactions
        WHERE type='expense' AND status='completed'
          AND transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 6 MONTH)
        GROUP BY YEAR(transaction_date), MONTH(transaction_date)
      ) e) as avgExpense6m
    `,
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      const d = rows && rows[0] ? rows[0] : {};
      const monthlyTithes = Number(d.monthlyTithes || 0);
      const monthlyExpenses = Number(d.monthlyExpenses || 0);
      const avgIncome6m = Number(d.avgIncome6m || 0);
      const avgExpense6m = Number(d.avgExpense6m || 0);
      const progressBase = avgIncome6m > 0 ? avgIncome6m : Math.max(monthlyTithes, 1);
      const tithesProgress = Math.max(0, Math.min(100, Math.round((monthlyTithes / progressBase) * 100)));
      const expenseStatus = avgExpense6m > 0
        ? (monthlyExpenses <= avgExpense6m ? 'Within Budget' : 'Above Budget')
        : (monthlyExpenses === 0 ? 'Within Budget' : 'Above Budget');

      res.json({
        balance: Number(d.balance || 0),
        monthlyTithes,
        monthlyExpenses,
        trend: percentChange(monthlyTithes, d.prevMonthlyTithes),
        tithesProgress,
        expenseStatus
      });
    });
});

app.get('/api/finance/transactions', authenticate, rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'transactions-list' }), (req, res) => {
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

// Admin program crud
app.get('/api/admin/programs', authenticate, rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'admin-programs' }), (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
  const category = typeof req.query.category === 'string' && req.query.category && req.query.category !== 'all' ? req.query.category : null;

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
    whereParts.push('(title LIKE ? OR description LIKE ? OR location LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  db.query(
    `SELECT id, title, type, category, location, start_datetime, end_datetime, status, is_main_service, is_featured, display_order, created_at
     FROM programs
     ${whereSql}
     ORDER BY start_datetime DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      db.query(`SELECT COUNT(*) as total FROM programs ${whereSql}`, params, (e, count) => {
        if (e) return res.status(500).json({ message: e.message });
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
    }
  );
});

app.get('/api/admin/programs/stats', authenticate, (req, res) => {
  db.query(
    `SELECT 
      SUM(status='upcoming') as upcoming,
      SUM(status='ongoing') as ongoing,
      SUM(status='completed') as completed,
      SUM(status='cancelled') as cancelled,
      COUNT(*) as total
    FROM programs`,
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(rows[0] || {});
    }
  );
});

app.get('/api/admin/programs/:id', authenticate, rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'admin-program' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid program id' });
  db.query('SELECT * FROM programs WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!rows[0]) return res.status(404).json({ message: 'Program not found' });
    res.json(rows[0]);
  });
});

app.post('/api/admin/programs', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 10, keyPrefix: 'program-create' }), (req, res) => {
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

  if (typeof title !== 'string' || title.trim().length < 3) return res.status(400).json({ message: 'Title is required' });
  if (!start_datetime) return res.status(400).json({ message: 'Start date/time is required' });

  db.query(
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
    ],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      res.status(201).json({ id: result.insertId, message: 'Program created' });
    }
  );
});

app.put('/api/admin/programs/:id', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 20, keyPrefix: 'program-update' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid program id' });

  const allowed = [
    'title', 'description', 'type', 'category', 'location', 'start_datetime', 'end_datetime',
    'recurring', 'recurring_until', 'schedule', 'is_main_service', 'is_featured', 'status', 'display_order'
  ];
  const fields = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) fields[key] = req.body[key];
  }
  if (fields.title && (typeof fields.title !== 'string' || fields.title.trim().length < 3)) {
    return res.status(400).json({ message: 'Invalid title' });
  }

  const sets = Object.keys(fields).map(k => `${k} = ?`);
  if (sets.length === 0) return res.status(400).json({ message: 'No changes provided' });
  const params = Object.keys(fields).map(k => {
    if (k === 'is_main_service' || k === 'is_featured') return fields[k] ? 1 : 0;
    if (k === 'display_order') return Number.isFinite(Number(fields[k])) ? Number(fields[k]) : 0;
    if (typeof fields[k] === 'string') return fields[k].trim();
    return fields[k];
  });
  params.push(id);

  db.query(`UPDATE programs SET ${sets.join(', ')} WHERE id = ?`, params, (err, result) => {
    if (err) return res.status(500).json({ message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Program not found' });
    res.json({ message: 'Program updated' });
  });
});

app.delete('/api/admin/programs/:id', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 20, keyPrefix: 'program-delete' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid program id' });
  db.query('DELETE FROM programs WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Program not found' });
    res.json({ message: 'Program deleted' });
  });
});

// ADMIN ANNOUNCEMENTS CRUD 
app.get('/api/admin/announcements', authenticate, rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'admin-announcements' }), (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;

  const whereParts = [];
  const params = [];
  if (status) {
    whereParts.push('status = ?');
    params.push(status);
  }
  if (search) {
    whereParts.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  db.query(
    `SELECT id, title, summary, category, priority, status, image_url, created_at, published_at, scheduled_for
     FROM announcements
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      db.query(`SELECT COUNT(*) as total FROM announcements ${whereSql}`, params, (e, count) => {
        if (e) return res.status(500).json({ message: e.message });
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
    }
  );
});

app.get('/api/admin/announcements/stats', authenticate, (req, res) => {
  db.query(
    `SELECT
      SUM(status='published') as published,
      SUM(status='draft') as draft,
      SUM(status='scheduled') as scheduled,
      SUM(status='archived') as archived,
      COUNT(*) as total
    FROM announcements`,
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      const stats = rows[0] || {};
      db.query('SELECT COUNT(*) as members FROM members', (e, m) => {
        if (e) return res.status(500).json({ message: e.message });
        stats.totalReach = m[0]?.members || 0;
        res.json(stats);
      });
    }
  );
});

app.get('/api/admin/announcements/:id', authenticate, rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'admin-announcement' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid announcement id' });
  db.query('SELECT * FROM announcements WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!rows[0]) return res.status(404).json({ message: 'Announcement not found' });
    res.json(rows[0]);
  });
});

app.post('/api/admin/announcements', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 10, keyPrefix: 'announcement-create' }), (req, res) => {
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

  if (typeof title !== 'string' || title.trim().length < 3) return res.status(400).json({ message: 'Title is required' });
  const bodyText = typeof content === 'string' ? content.trim() : '';
  const computedSummary = typeof summary === 'string' && summary.trim()
    ? summary.trim()
    : (bodyText ? bodyText.substring(0, 160) : title.trim().substring(0, 160));

  const finalStatus = status || 'draft';
  const publishedAt = finalStatus === 'published' ? new Date() : null;

  db.query(
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
    ],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      res.status(201).json({ id: result.insertId, message: 'Announcement created' });
    }
  );
});

app.put('/api/admin/announcements/:id', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 20, keyPrefix: 'announcement-update' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid announcement id' });

  const allowed = [
    'title', 'summary', 'content', 'category', 'image_url', 'priority', 'status', 'scheduled_for', 'is_new', 'is_featured'
  ];
  const fields = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) fields[key] = req.body[key];
  }
  if (fields.title && (typeof fields.title !== 'string' || fields.title.trim().length < 3)) {
    return res.status(400).json({ message: 'Invalid title' });
  }

  if (fields.content && !fields.summary) {
    const t = typeof fields.content === 'string' ? fields.content.trim() : '';
    if (t) fields.summary = t.substring(0, 160);
  }

  if (fields.status === 'published') {
    fields.published_at = new Date();
    fields.scheduled_for = null;
  } else if (fields.status === 'scheduled') {
    fields.published_at = null;
  }

  const sets = Object.keys(fields).map(k => `${k} = ?`);
  if (sets.length === 0) return res.status(400).json({ message: 'No changes provided' });

  const params = Object.keys(fields).map(k => {
    if (k === 'is_new' || k === 'is_featured') return fields[k] ? 1 : 0;
    if (typeof fields[k] === 'string') return fields[k].trim();
    return fields[k];
  });
  params.push(id);

  db.query(`UPDATE announcements SET ${sets.join(', ')} WHERE id = ?`, params, (err, result) => {
    if (err) return res.status(500).json({ message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ message: 'Announcement updated' });
  });
});

app.delete('/api/admin/announcements/:id', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 20, keyPrefix: 'announcement-delete' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid announcement id' });
  db.query('DELETE FROM announcements WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ message: 'Announcement deleted' });
  });
});

//  ADMIN GALLERY CRUD 
app.get('/api/admin/gallery', authenticate, rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'admin-gallery' }), (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const offset = (page - 1) * limit;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const category = typeof req.query.category === 'string' && req.query.category && req.query.category !== 'all' ? req.query.category : null;

  const whereParts = [];
  const params = [];
  if (category) {
    whereParts.push('category = ?');
    params.push(category);
  }
  if (search) {
    whereParts.push('(caption LIKE ? OR description LIKE ? OR category LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  db.query(
    `SELECT id, url, caption, description, category, is_featured, display_order, created_at
     FROM gallery
     ${whereSql}
     ORDER BY display_order ASC, created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      db.query(`SELECT COUNT(*) as total FROM gallery ${whereSql}`, params, (e, count) => {
        if (e) return res.status(500).json({ message: e.message });
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
    }
  );
});

app.get('/api/admin/gallery/stats', authenticate, (req, res) => {
  fs.readdir(uploadsDir, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).json({ message: err.message });
    const files = entries.filter(e => e.isFile()).map(e => path.join(uploadsDir, e.name));
    let totalBytes = 0;
    for (const f of files) {
      try {
        const st = fs.statSync(f);
        totalBytes += st.size;
      } catch (_) {}
    }
    db.query('SELECT COUNT(*) as total FROM gallery', (e, rows) => {
      if (e) return res.status(500).json({ message: e.message });
      res.json({ totalImages: rows[0]?.total || 0, storageBytes: totalBytes });
    });
  });
});

app.get('/api/admin/gallery/:id', authenticate, rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'admin-gallery-image' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid image id' });
  db.query('SELECT * FROM gallery WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!rows[0]) return res.status(404).json({ message: 'Image not found' });
    res.json(rows[0]);
  });
});

app.put('/api/admin/gallery/:id', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 20, keyPrefix: 'gallery-update' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid image id' });
  const { caption, description, category, is_featured, display_order } = req.body || {};
  db.query(
    `UPDATE gallery SET caption = ?, description = ?, category = ?, is_featured = ?, display_order = ? WHERE id = ?`,
    [
      caption || null,
      description || null,
      category || null,
      is_featured ? 1 : 0,
      Number.isFinite(Number(display_order)) ? Number(display_order) : 0,
      id
    ],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Image not found' });
      res.json({ message: 'Image updated' });
    }
  );
});

app.delete('/api/admin/gallery/:id', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 20, keyPrefix: 'gallery-delete' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid image id' });

  db.query('SELECT url FROM gallery WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!rows[0]) return res.status(404).json({ message: 'Image not found' });

    const url = rows[0].url;
    db.query('DELETE FROM gallery WHERE id = ?', [id], (err2) => {
      if (err2) return res.status(500).json({ message: err2.message });

      if (typeof url === 'string' && url.startsWith('/uploads/')) {
        const filename = path.basename(url);
        const filePath = path.join(uploadsDir, filename);
        fs.unlink(filePath, () => {
          // ignore errors (file might be shared or already removed)
        });
      }

      res.json({ message: 'Image deleted' });
    });
  });
});

app.get('/api/finance/export', authenticate, rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'finance-export' }), (req, res) => {
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

app.post('/api/finance/transactions', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 20, keyPrefix: 'transaction-create' }), (req, res) => {
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

app.post('/api/admin/gallery', authenticate, rateLimit({ windowMs: 60 * 60_000, max: 10, keyPrefix: 'gallery-upload' }), upload.single('image'), (req, res) => {
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
app.get('/error/empty', (req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'pages', 'error', 'empty.html')));
app.get('/error/offline', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'error', 'offline.html')));
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

// Fallback (pages)
app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'pages', 'error', 'empty.html'));
});

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
