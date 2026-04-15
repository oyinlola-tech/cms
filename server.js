require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

// Import database initializer
const { initializeDatabase } = require('./db-init');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Global database connection (set after initialization)
let db;

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
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
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
  db.query('SELECT id, name, email, role, avatar FROM users WHERE id = ?', [req.userId], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(results[0]);
  });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
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

app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  db.query(
    'SELECT * FROM password_resets WHERE email = ? AND otp = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
    [email, otp], (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      if (results.length === 0) return res.status(400).json({ message: 'Invalid or expired OTP' });
      const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '10m' });
      res.json({ token });
    });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
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

app.post('/api/auth/resend-otp', (req, res) => {
  const { email } = req.body;
  db.query('SELECT id FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (results.length === 0) {
      return res.json({ message: 'If an account exists, a new OTP has been sent.' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    db.query('UPDATE password_resets SET otp = ?, expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE email = ? ORDER BY created_at DESC LIMIT 1',
      [otp, email], async (err2) => {
        if (err2) return res.status(500).json({ message: err2.message });
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
  db.query('SELECT password FROM users WHERE id = ?', [req.userId], async (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
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
  const { name, email, role } = req.body;
  db.query('UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?',
    [name, email, role, req.userId], (err) => {
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
  db.query(
    `SELECT id, title, summary, category, image_url, is_new, created_at 
     FROM announcements WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [status, limit, offset],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      db.query('SELECT COUNT(*) as total FROM announcements WHERE status = ?', [status], (e, count) => {
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
  const status = req.query.status || 'upcoming';
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
     (SELECT 'tithe', CONCAT('₦', FORMAT(amount,0)), description, created_at FROM transactions WHERE type='income')
     ORDER BY created_at DESC LIMIT 5`,
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(results);
    });
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

app.delete('/api/members/:id', authenticate, (req, res) => {
  db.query('DELETE FROM members WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ message: 'Member deleted' });
  });
});

app.get('/api/finance/summary', authenticate, (req, res) => {
  db.query(
    `SELECT 
      (SELECT SUM(amount) FROM transactions WHERE type='income') - (SELECT SUM(amount) FROM transactions WHERE type='expense') as balance,
      (SELECT SUM(amount) FROM transactions WHERE type='income' AND MONTH(transaction_date)=MONTH(CURDATE())) as monthlyTithes,
      (SELECT SUM(amount) FROM transactions WHERE type='expense' AND MONTH(transaction_date)=MONTH(CURDATE())) as monthlyExpenses
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
  const limit = 10;
  const offset = (page - 1) * limit;
  db.query(
    'SELECT * FROM transactions ORDER BY transaction_date DESC LIMIT ? OFFSET ?',
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

app.post('/api/admin/gallery', authenticate, upload.single('image'), (req, res) => {
  const { caption, description, category } = req.body;
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
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'contact.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'src', 'auth', 'login.html')));
app.get('/admin/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'src', 'auth', 'forgot-password.html')));
app.get('/admin/verify-otp', (req, res) => res.sendFile(path.join(__dirname, 'src', 'auth', 'verify-otp.html')));
app.get('/admin/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'src', 'auth', 'reset-password.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'src', 'index.html')));
app.get('/admin/members', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'members.html')));
app.get('/admin/finance', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'finance.html')));
app.get('/admin/programs', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'programs.html')));
app.get('/admin/announcements', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'announcements.html')));
app.get('/admin/gallery', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'gallery.html')));
app.get('/admin/reports', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'reports.html')));
app.get('/admin/settings', (req, res) => res.sendFile(path.join(__dirname, 'src', 'pages', 'settings.html')));

// Fallback
app.get('*', (req, res) => res.redirect('/'));
initializeDatabase()
  .then((connection) => {
    db = connection; // Assign to global for route handlers
    app.listen(PORT, () => {
      console.log(`\nServer running at http://localhost:${PORT}`);
      console.log(`Environment: ${NODE_ENV}`);
      if (NODE_ENV !== 'production') {
        console.log('OTP codes will be shown in console (no real emails sent).');
      }
      console.log(`Admin login: ${process.env.ADMIN_EMAIL}`);
    });
  })
  .catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });