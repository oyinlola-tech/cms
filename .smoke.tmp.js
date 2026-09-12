const path = require('path');
const { once } = require('events');
const { createApp } = require('./backend/app');
const { createConfig } = require('./backend/config/env');

// Minimal pool-shaped double; page/static routes do not touch it.
const db = {
  query: (sql, params, cb) => setImmediate(() => (typeof params === 'function' ? params : cb)(null, [])),
  getConnection: (cb) => setImmediate(() => cb(null, {
    query: (s, p, c) => setImmediate(() => c(null, [])),
    beginTransaction: (c) => c(null), commit: (c) => c(null), rollback: (c) => c(), release() {}
  }))
};

const config = createConfig({ rootDir: process.cwd() });
config.jwtSecret = '12345678901234567890123456789012';
config.nodeEnv = 'test'; config.isProduction = false;

const { app } = createApp({
  config, db,
  emailService: { renderBrandedEmail: () => '', async sendOTP(){}, async sendAppEmail(){} },
  uploadService: { uploadsDir: config.paths.uploadsDir, upload: { single: () => (q,s,n)=>n() }, removeUploadByUrl(){} }
});

(async () => {
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const pages = ['/', '/programs', '/gallery', '/announcements', '/announcements/1', '/contact',
                 '/privacy', '/terms', '/give', '/error/404', '/error/403', '/error/500',
                 '/error/empty', '/error/offline', '/admin/login', '/admin/dashboard',
                 '/admin/members', '/admin/members/1', '/admin/finance', '/admin/programs',
                 '/admin/announcements', '/admin/gallery', '/admin/reports', '/admin/settings',
                 '/admin/users', '/admin/forgot-password', '/admin/verify-otp', '/admin/reset-password'];

  let bad = 0;
  for (const p of pages) {
    const r = await fetch(base + p, { redirect: 'manual' });
    const ok = r.status === 200 || (p.startsWith('/error/') && [403,404,500].includes(r.status));
    if (!ok) { console.log(`  ✖ ${p} -> ${r.status}`); bad++; }
  }
  console.log(`Pages: ${pages.length - bad}/${pages.length} served correctly`);

  // Redirects
  for (const [p, want] of [['/admin', '/admin/dashboard'], ['/admin/settings/parish', '/admin/settings#parish'],
                           ['/admin/settings/financial', '/admin/settings#financial'], ['/favicon.ico', '/favicon.svg']]) {
    const r = await fetch(base + p, { redirect: 'manual' });
    const loc = r.headers.get('location');
    console.log(`  ${loc === want ? '✔' : '✖'} ${p} -> ${r.status} ${loc}`);
    if (loc !== want) bad++;
  }

  // Static assets the pages now depend on
  for (const a of ['/js/tailwind-config.js', '/js/page-init.js', '/js/utils/shared.js',
                   '/js/utils/api.js', '/js/utils/auth.js', '/src/js/pages/users.js', '/favicon.svg']) {
    const r = await fetch(base + a);
    console.log(`  ${r.status === 200 ? '✔' : '✖'} ${a} -> ${r.status}`);
    if (r.status !== 200) bad++;
  }

  // CSP must no longer allow inline scripts
  const home = await fetch(base + '/');
  const csp = home.headers.get('content-security-policy') || '';
  const inlineAllowed = /script-src[^;]*unsafe-inline/.test(csp);
  console.log(`  ${inlineAllowed ? '✖' : '✔'} CSP script-src blocks inline: ${!inlineAllowed}`);
  if (inlineAllowed) bad++;

  // Unknown route -> 404 page
  const nf = await fetch(base + '/definitely-not-a-page');
  console.log(`  ${nf.status === 404 ? '✔' : '✖'} unknown page -> ${nf.status}`);
  if (nf.status !== 404) bad++;

  const nfApi = await fetch(base + '/api/v1/nope');
  console.log(`  ${nfApi.status === 404 ? '✔' : '✖'} unknown API -> ${nfApi.status}`);
  if (nfApi.status !== 404) bad++;

  server.close();
  console.log(bad === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${bad} issue(s))`);
  process.exit(bad === 0 ? 0 : 1);
})();
