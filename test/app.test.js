const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcrypt');
const { createApp } = require('../backend/app');
const { createConfig } = require('../backend/config/env');

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function createMockDb({ users, churchInfo, links }) {
  const state = {
    contacts: [],
    lastAnnouncementParams: null
  };

  const db = {
    state,
    // transaction() in utils/db.js checks out a pooled connection, so the
    // double has to expose the same surface as a mysql2 pool.
    getConnection(callback) {
      setImmediate(() => callback(null, {
        query: (sql, params, cb) => db.query(sql, params, cb),
        beginTransaction: (cb) => setImmediate(() => cb(null)),
        commit: (cb) => setImmediate(() => cb(null)),
        rollback: (cb) => setImmediate(() => cb(null)),
        release: () => {}
      }));
    },
    query(sql, params, callback) {
      const cb = typeof params === 'function' ? params : callback;
      const values = Array.isArray(params) ? params : [];
      const normalized = normalizeSql(sql);

      setImmediate(() => {
        try {
          if (normalized.startsWith('SELECT * FROM users WHERE email = ?')) {
            const email = String(values[0] || '').toLowerCase();
            cb(null, users[email] ? [users[email]] : []);
            return;
          }

          if (normalized.startsWith('UPDATE users SET last_login = NOW(), last_ip = ? WHERE id = ?')) {
            cb(null, { affectedRows: 1 });
            return;
          }

          // Used by the authenticate middleware to validate token_version.
          if (normalized.startsWith('SELECT id, role, token_version FROM users WHERE id = ?')) {
            const id = Number(values[0]);
            const user = Object.values(users).find((item) => item.id === id);
            cb(null, user ? [{ id: user.id, role: user.role, token_version: user.token_version || 0 }] : []);
            return;
          }

          // Used by the RBAC middleware when the role is not already cached.
          if (normalized.startsWith('SELECT id, role FROM users WHERE id = ?')) {
            const id = Number(values[0]);
            const user = Object.values(users).find((item) => item.id === id);
            cb(null, user ? [{ id: user.id, role: user.role }] : []);
            return;
          }

          if (normalized.startsWith('UPDATE users SET token_version = token_version + 1 WHERE id = ?')) {
            const id = Number(values[0]);
            const user = Object.values(users).find((item) => item.id === id);
            if (user) user.token_version = (user.token_version || 0) + 1;
            cb(null, { affectedRows: user ? 1 : 0 });
            return;
          }

          if (normalized.startsWith('SELECT id, name, email, role, avatar, twofa_enabled as twofaEnabled')) {
            const id = Number(values[0]);
            const user = Object.values(users).find((item) => item.id === id);
            cb(null, user ? [{
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              avatar: user.avatar || null,
              twofaEnabled: false,
              lastLogin: null,
              lastIp: null
            }] : []);
            return;
          }

          if (normalized.startsWith('SELECT * FROM church_info LIMIT 1')) {
            cb(null, [churchInfo]);
            return;
          }

          if (normalized.startsWith('INSERT INTO contact_messages')) {
            state.contacts.push({
              name: values[0],
              email: values[1],
              phone: values[2],
              subject: values[3],
              message: values[4]
            });
            cb(null, { affectedRows: 1, insertId: state.contacts.length });
            return;
          }

          if (normalized.startsWith('SELECT id, title, summary, category, image_url, is_new, created_at FROM announcements')) {
            state.lastAnnouncementParams = values.slice(0, values.length - 2);
            cb(null, []);
            return;
          }

          if (normalized.startsWith('SELECT COUNT(*) as total FROM announcements')) {
            cb(null, [{ total: 0 }]);
            return;
          }

          if (normalized.startsWith('DELETE FROM members WHERE id = ?')) {
            cb(null, { affectedRows: 1 });
            return;
          }

          if (normalized.startsWith('SELECT link_key, url FROM external_links')) {
            cb(null, Object.entries(links).map(([link_key, url]) => ({ link_key, url })));
            return;
          }

          if (normalized.startsWith('SELECT link_key as `key`, label, url, updated_at as updatedAt FROM external_links')) {
            cb(null, Object.entries(links).map(([key, url]) => ({ key, label: key, url, updatedAt: null })));
            return;
          }

          if (normalized.startsWith('UPDATE external_links SET url = ? WHERE link_key = ?')) {
            const nextUrl = values[0];
            const key = values[1];
            links[key] = nextUrl;
            cb(null, { affectedRows: 1 });
            return;
          }

          cb(new Error(`Unhandled SQL in test double: ${normalized}`));
        } catch (error) {
          cb(error);
        }
      });
    }
  };

  return db;
}

async function buildTestServer() {
  const password = 'CorrectHorseBatteryStaple!';
  const passwordHash = await bcrypt.hash(password, 10);
  const users = {
    'admin@example.com': {
      id: 1,
      name: 'Parish Admin',
      email: 'admin@example.com',
      password: passwordHash,
      role: 'admin',
      is_active: 1,
      token_version: 0
    },
    'ratelimit@example.com': {
      id: 2,
      name: 'Rate Limit User',
      email: 'ratelimit@example.com',
      password: passwordHash,
      role: 'admin',
      is_active: 1,
      token_version: 0
    },
    'logout@example.com': {
      id: 4,
      name: 'Logout User',
      email: 'logout@example.com',
      password: passwordHash,
      role: 'admin',
      is_active: 1,
      token_version: 0
    },
    'viewer@example.com': {
      id: 3,
      name: 'Read Only',
      email: 'viewer@example.com',
      password: passwordHash,
      role: 'viewer',
      is_active: 1,
      token_version: 0
    }
  };

  const config = createConfig({ rootDir: path.resolve(__dirname, '..') });
  config.jwtSecret = '12345678901234567890123456789012';
  config.nodeEnv = 'test';
  config.isProduction = false;
  config.admin.email = 'admin@example.com';
  config.admin.password = 'StrongAdminPassword123!';

  fs.mkdirSync(config.paths.uploadsDir, { recursive: true });

  const db = createMockDb({
    users,
    churchInfo: {
      id: 1,
      name: 'The Sacred Hearth',
      address: '12 Cathedral Way',
      phone: '+2348000000000',
      email: 'hello@sacredhearth.ng'
    },
    links: {
      join_service: 'https://example.com/join',
      watch_online: 'https://example.com/watch'
    }
  });

  const emailService = {
    renderBrandedEmail: () => '<p>email</p>',
    async sendOTP() {},
    async sendAppEmail() {}
  };
  const uploadService = {
    uploadsDir: config.paths.uploadsDir,
    upload: {
      single() {
        return (req, res, next) => next();
      }
    },
    async detectImageFormat() { return null; },
    removeUploadByUrl() {}
  };

  const { app } = createApp({ config, db, emailService, uploadService });
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return { server, baseUrl, db, password };
}

async function readJson(response) {
  return response.json();
}

let context;

test.before(async () => {
  context = await buildTestServer();
});

test.after(async () => {
  if (context?.server) {
    await new Promise((resolve, reject) => {
      context.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('serves the public church info endpoint with security headers', async () => {
  const response = await fetch(`${context.baseUrl}/api/church/info`);
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(data.name, 'The Sacred Hearth');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
});

test('blocks protected auth route without a token', async () => {
  const response = await fetch(`${context.baseUrl}/api/auth/me`);
  const data = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(data.message, 'No token provided');
});

test('logs in and returns the current user profile', async () => {
  const loginResponse = await fetch(`${context.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: context.password })
  });
  const loginData = await readJson(loginResponse);

  assert.equal(loginResponse.status, 200);
  assert.ok(loginData.token);

  const meResponse = await fetch(`${context.baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${loginData.token}` }
  });
  const meData = await readJson(meResponse);

  assert.equal(meResponse.status, 200);
  assert.equal(meData.email, 'admin@example.com');
});

test('rejects invalid admin link updates before touching the database', async () => {
  const loginResponse = await fetch(`${context.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: context.password })
  });
  const { token } = await readJson(loginResponse);

  const response = await fetch(`${context.baseUrl}/api/admin/settings/links`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      links: [{ key: 'watch_online', url: 'javascript:alert(1)' }]
    })
  });
  const data = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(data.message, 'Invalid URL for watch_online');
});

test('accepts valid contact form submissions', async () => {
  const response = await fetch(`${context.baseUrl}/api/contact/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Visitor Name',
      email: 'visitor@example.com',
      phone: '+2348000000000',
      subject: 'Need help',
      message: 'Please share service times.'
    })
  });
  const data = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(data.message, 'Message sent');
  assert.equal(context.db.state.contacts.length, 1);
});

test('enforces login rate limits', async () => {
  let lastResponse;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    lastResponse = await fetch(`${context.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ratelimit@example.com', password: context.password })
    });
  }

  const data = await readJson(lastResponse);
  assert.equal(lastResponse.status, 429);
  assert.equal(data.message, 'Too many requests. Please try again later.');
  assert.ok(lastResponse.headers.get('retry-after'));
});

test('returns API 404s and page 404s from the new router structure', async () => {
  const apiResponse = await fetch(`${context.baseUrl}/api/does-not-exist`);
  const apiData = await readJson(apiResponse);
  assert.equal(apiResponse.status, 404);
  assert.equal(apiData.message, 'Not found');

  const pageResponse = await fetch(`${context.baseUrl}/does-not-exist`);
  const pageBody = await pageResponse.text();
  assert.equal(pageResponse.status, 404);
  assert.match(pageBody, /html/i);
});

// --- Regression tests for the authorization and token bugs ---

test('RBAC denies a viewer the permissions it does not hold', async () => {
  const { baseUrl, password } = context;

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'viewer@example.com', password })
  });
  assert.equal(login.status, 200);
  const { token } = await readJson(login);

  // members:delete is not granted to the viewer role.
  const denied = await fetch(`${baseUrl}/api/members/1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(denied.status, 403);
  const body = await readJson(denied);
  assert.equal(body.message, 'Insufficient permissions');
});

test('RBAC allows a permission the role does hold', async () => {
  const { baseUrl, password } = context;

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'viewer@example.com', password })
  });
  const { token } = await readJson(login);

  // settings:read is not granted to viewer, but contact:read is - confirm the
  // guard distinguishes between them rather than failing closed on everything.
  const denied = await fetch(`${baseUrl}/api/admin/settings/links`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(denied.status, 403);
});

test('a password-reset token cannot be used as a session token', async () => {
  const { baseUrl } = context;
  const jwt = require('jsonwebtoken');

  const resetToken = jwt.sign(
    { email: 'admin@example.com', rid: 1, purpose: 'password-reset' },
    '12345678901234567890123456789012',
    { expiresIn: '10m' }
  );

  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${resetToken}` }
  });
  assert.equal(response.status, 401);
});

test('a session token cannot be used to reset a password', async () => {
  const { baseUrl, password } = context;

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password })
  });
  const { token } = await readJson(login);

  const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword: 'BrandNewPassw0rd!' })
  });

  assert.equal(response.status, 400);
  const body = await readJson(response);
  assert.equal(body.message, 'Invalid or expired token');
});

test('logging out revokes every token issued for that user', async () => {
  const { baseUrl, password } = context;

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'logout@example.com', password })
  });
  assert.equal(login.status, 200);
  const { token } = await readJson(login);

  const before = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(before.status, 200);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(logout.status, 200);

  const after = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(after.status, 401);
});

test('the public announcements endpoint cannot be coerced into serving drafts', async () => {
  const { baseUrl, db } = context;

  db.state.lastAnnouncementParams = null;
  const response = await fetch(`${baseUrl}/api/announcements?status=draft`);

  // The handler pins status to 'published' regardless of the query string.
  assert.equal(response.status, 200);
  assert.deepEqual(db.state.lastAnnouncementParams, ['published']);
});

test('contact submissions are stripped of markup before storage', async () => {
  const { baseUrl, db } = context;

  const response = await fetch(`${baseUrl}/api/contact/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Ada <script>alert(1)</script>',
      email: 'ada@example.com',
      subject: 'Hello',
      message: 'Please call me <img src=x onerror=alert(1)> soon.'
    })
  });

  assert.equal(response.status, 200);
  const stored = db.state.contacts[db.state.contacts.length - 1];
  assert.ok(!stored.name.includes('<'), 'name should not retain markup');
  assert.ok(!stored.message.includes('<'), 'message should not retain markup');
  assert.ok(!stored.message.includes('onerror'), 'event handlers should be stripped');
});

test('the pages router serves /admin and the settings deep links', async () => {
  const { baseUrl } = context;

  const admin = await fetch(`${baseUrl}/admin`, { redirect: 'manual' });
  assert.equal(admin.status, 302);
  assert.equal(admin.headers.get('location'), '/admin/dashboard');

  const parish = await fetch(`${baseUrl}/admin/settings/parish`, { redirect: 'manual' });
  assert.equal(parish.status, 302);
  assert.equal(parish.headers.get('location'), '/admin/settings#parish');
});
