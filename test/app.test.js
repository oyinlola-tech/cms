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
    contacts: []
  };

  return {
    state,
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
      role: 'admin'
    },
    'ratelimit@example.com': {
      id: 2,
      name: 'Rate Limit User',
      email: 'ratelimit@example.com',
      password: passwordHash,
      role: 'admin'
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
