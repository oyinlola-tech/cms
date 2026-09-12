const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseHTML, NodeFilter } = require('linkedom');

/**
 * Frontend tests.
 *
 * These cover the classes of bug that shipped previously and were invisible to
 * the backend suite: pages whose scripts targeted element IDs that no longer
 * existed, buttons with no listener bound, and form payloads that did not match
 * what the API expects.
 */

const ROOT = path.resolve(__dirname, '..');

function resolveScript(src) {
  // Mirrors the static resolution order in backend/app.js: publicDir is the
  // root mount, then /js, /src/js and /src/auth.
  const candidates = [];
  if (src.startsWith('/')) candidates.push(path.join(ROOT, 'public', src));
  if (src.startsWith('/js/')) candidates.push(path.join(ROOT, src.slice(1)));
  if (src.startsWith('/src/')) candidates.push(path.join(ROOT, src.slice(1)));
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function bootPage(file, { pageName, api = {}, pathname = '/' } = {}) {
  const { document, window } = parseHTML(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const calls = [];
  const store = { authToken: 'tok', currentUser: JSON.stringify({ id: 1, name: 'A', role: 'super_admin' }) };

  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; }
  };

  global.document = document;
  global.window = window;
  global.NodeFilter = NodeFilter;
  global.localStorage = localStorage;
  global.confirm = () => true;

  window.localStorage = localStorage;
  window.location = { pathname, hash: '', href: '' };
  window.tailwind = {};
  window.CMS = undefined;
  window.fetch = (url, opts) => {
    const endpoint = String(url).replace(/^.*\/api\/v1/, '');
    calls.push({ url: endpoint, method: (opts && opts.method) || 'GET', body: opts && opts.body });
    const clean = endpoint.split('?')[0];
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(clean in api ? api[clean] : {}),
      text: () => Promise.resolve('')
    });
  };

  // Page scripts capture FormData as a closure parameter at load time, so the
  // recorder has to be installed before they run - reassigning it afterwards
  // would never reach them.
  const formAppends = [];
  class TestFormData {
    get(name) {
      const el = document.querySelector(`[name="${name}"]`);
      return el ? el.value : null;
    }
    append(key) { formAppends.push(key); }
  }
  global.FormData = TestFormData;
  window.FormData = TestFormData;

  const quietConsole = { log() {}, warn() {}, error() {} };

  for (const el of document.querySelectorAll('script[src]')) {
    const src = el.getAttribute('src');
    if (!src.startsWith('/')) continue;
    const resolved = resolveScript(src);
    if (!resolved) continue;
    new Function('window', 'document', 'localStorage', 'FormData', 'NodeFilter', 'console', 'confirm',
      fs.readFileSync(resolved, 'utf8'))(window, document, localStorage, TestFormData, NodeFilter, quietConsole, global.confirm);
  }

  // linkedom does not implement HTMLFormElement.reset(); browsers do.
  for (const form of document.querySelectorAll('form')) {
    if (typeof form.reset !== 'function') {
      form.reset = function reset() {
        this.querySelectorAll('input, textarea, select').forEach((el) => {
          if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
          else el.value = '';
        });
      };
    }
  }

  window.CMS.shared.init();
  if (pageName) {
    const group = window.CMS.pages || {};
    const authGroup = window.CMS.authPages || {};
    const entry = group[pageName] || authGroup[pageName];
    assert.ok(entry && typeof entry.init === 'function', `no initializer registered for "${pageName}"`);
    entry.init();
  }

  return { document, window, calls, localStorage, formAppends };
}

const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

// The page -> initializer map the bootstrapper dispatches on.
const PAGE_INITIALIZERS = [
  ['public/index.html', 'home'],
  ['public/pages/announcement-details.html', 'announcementDetails'],
  ['public/pages/announcements.html', 'announcements'],
  ['public/pages/contact.html', 'contact'],
  ['public/pages/gallery.html', 'gallery'],
  ['public/pages/programs.html', 'programs'],
  ['src/index.html', 'dashboard'],
  ['src/pages/members.html', 'members'],
  ['src/pages/finance.html', 'finance'],
  ['src/pages/programs.html', 'programsAdmin'],
  ['src/pages/announcements.html', 'announcementsAdmin'],
  ['src/pages/gallery.html', 'galleryAdmin'],
  ['src/pages/settings.html', 'settings'],
  ['src/pages/users.html', 'users'],
  ['src/pages/details/members-details.html', 'memberDetails'],
  ['src/auth/login.html', 'login'],
  ['src/auth/forgot-password.html', 'forgotPassword'],
  ['src/auth/verify-otp.html', 'verifyOTP'],
  ['src/auth/reset-password.html', 'resetPassword']
];

const ALL_HTML = (function collect(dir, acc = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(rel, acc);
    else if (entry.name.endsWith('.html')) acc.push(rel);
  }
  return acc;
})('public').concat((function collect(dir, acc = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(rel, acc);
    else if (entry.name.endsWith('.html')) acc.push(rel);
  }
  return acc;
})('src'));

test('every page loads the shared Tailwind config and carries no inline scripts', () => {
  for (const file of ALL_HTML) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const { document } = parseHTML(html);

    assert.ok(html.includes('/js/tailwind-config.js'), `${file} is missing the shared Tailwind config`);

    // Inline scripts would force the CSP to allow 'unsafe-inline'.
    const inline = [...document.querySelectorAll('script')].filter((s) => !s.getAttribute('src'));
    assert.equal(inline.length, 0, `${file} still has ${inline.length} inline script(s)`);
  }
});

test('every page registers the initializer named by its data-page attribute', () => {
  for (const [file, pageName] of PAGE_INITIALIZERS) {
    const { document } = parseHTML(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    assert.equal(document.body.getAttribute('data-page'), pageName, `${file} data-page mismatch`);
  }
});

test('page scripts only reference element IDs that exist in their markup', () => {
  const PAGE_SCRIPTS = {
    'public/index.html': ['public/js/pages/home.js'],
    'public/pages/announcement-details.html': ['public/js/pages/announcement-details.js'],
    'public/pages/announcements.html': ['public/js/pages/announcements.js'],
    'public/pages/contact.html': ['public/js/pages/contact.js'],
    'public/pages/gallery.html': ['public/js/pages/gallery.js'],
    'public/pages/programs.html': ['public/js/pages/programs.js'],
    'src/index.html': ['src/js/pages/dashboard.js'],
    'src/pages/members.html': ['src/js/pages/members.js'],
    'src/pages/finance.html': ['src/js/pages/finance.js'],
    'src/pages/programs.html': ['src/js/pages/programs.js'],
    'src/pages/announcements.html': ['src/js/pages/announcements.js'],
    'src/pages/gallery.html': ['src/js/pages/gallery.js'],
    'src/pages/settings.html': ['src/js/pages/settings.js'],
    'src/pages/users.html': ['src/js/pages/users.js'],
    'src/pages/details/members-details.html': ['src/js/pages/member-details.js'],
    'src/auth/verify-otp.html': ['src/auth/verify-otp.js']
  };

  for (const [html, scripts] of Object.entries(PAGE_SCRIPTS)) {
    const { document } = parseHTML(fs.readFileSync(path.join(ROOT, html), 'utf8'));
    const ids = new Set([...document.querySelectorAll('[id]')].map((e) => e.getAttribute('id')));

    for (const script of scripts) {
      const src = fs.readFileSync(path.join(ROOT, script), 'utf8');
      for (const match of src.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
        assert.ok(ids.has(match[1]), `${script} looks up #${match[1]}, absent from ${html}`);
      }
      for (const match of src.matchAll(/querySelector(?:All)?\(['"]#([A-Za-z0-9_-]+)/g)) {
        assert.ok(ids.has(match[1]), `${script} queries #${match[1]}, absent from ${html}`);
      }
    }
  }
});

test('updateFooterYear rewrites the year without destroying footer markup', () => {
  const { document, window } = bootPage('public/index.html');
  const footer = document.querySelector('footer');

  const linksBefore = footer.querySelectorAll('a').length;
  const elementsBefore = footer.querySelectorAll('*').length;
  assert.ok(linksBefore > 0, 'fixture should have footer links');

  window.CMS.shared.updateFooterYear();

  // The previous implementation assigned to el.textContent on every matching
  // `footer div`, which flattened the outermost one and deleted its children.
  assert.equal(footer.querySelectorAll('a').length, linksBefore, 'footer links were destroyed');
  assert.equal(footer.querySelectorAll('*').length, elementsBefore, 'footer elements were destroyed');

  const year = (footer.textContent.match(/©\s*(\d{4})/) || [])[1];
  assert.equal(year, String(new Date().getFullYear()));
});

test('the program modal opens from the create button and submits a merged datetime', async () => {
  const { document, window, calls } = bootPage('src/pages/programs.html', {
    pageName: 'programsAdmin',
    pathname: '/admin/programs',
    api: {
      '/admin/programs': { items: [], total: 0, page: 1, totalPages: 1, from: 0, to: 0 },
      '/admin/programs/stats': {},
      '/dashboard/upcoming-event': {}
    }
  });
  await settle();

  const modal = document.getElementById('program-modal');
  assert.ok(modal.classList.contains('hidden'), 'modal should start hidden');

  document.getElementById('add-program-header-btn').click();
  await settle(10);
  assert.ok(!modal.classList.contains('hidden'), 'create button should open the modal');

  document.getElementById('program-title').value = 'Easter Retreat';
  document.getElementById('program-date').value = '2026-12-01';
  document.getElementById('program-time').value = '10:30';

  calls.length = 0;
  document.getElementById('program-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await settle();

  const post = calls.find((c) => c.method === 'POST' && c.url === '/admin/programs');
  assert.ok(post, 'submitting the form should POST');

  const body = JSON.parse(post.body);
  assert.equal(body.title, 'Easter Retreat');
  // The form splits date and time; the API stores one DATETIME.
  assert.equal(body.start_datetime, '2026-12-01 10:30:00');
});

test('announcements save-draft posts a draft and carries the chosen priority', async () => {
  const { document, calls } = bootPage('src/pages/announcements.html', {
    pageName: 'announcementsAdmin',
    pathname: '/admin/announcements',
    api: {
      '/admin/announcements': { items: [], total: 0, page: 1, totalPages: 1, from: 0, to: 0 },
      '/admin/announcements/stats': {}
    }
  });
  await settle();

  document.getElementById('create-announcement-header-btn').click();
  await settle(10);

  document.getElementById('announcement-title').value = 'Harvest Sunday';
  document.getElementById('priority-selector').querySelector('[data-priority="urgent"]').click();
  assert.equal(document.getElementById('announcement-priority').value, 'urgent');

  calls.length = 0;
  document.getElementById('save-draft-btn').click();
  await settle();

  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post, '"Save draft" should POST');

  const body = JSON.parse(post.body);
  assert.equal(body.status, 'draft');
  assert.equal(body.priority, 'urgent');
});

test('gallery uploads send one file per request under the field name the API expects', async () => {
  const { window, calls, formAppends } = bootPage('src/pages/gallery.html', {
    pageName: 'galleryAdmin',
    pathname: '/admin/gallery',
    api: {
      '/admin/gallery': { items: [], total: 0, page: 1, totalPages: 1, from: 0, to: 0 },
      '/admin/gallery/stats': { totalImages: 0, storageBytes: 0 }
    }
  });
  await settle();

  formAppends.length = 0;
  calls.length = 0;
  await window.CMS.pages.galleryAdmin.uploadImages([{ name: 'a.png' }, { name: 'b.png' }]);
  await settle();

  // multer is configured as .single('image'); appending 'images' made every
  // upload fail with "Unexpected field".
  assert.ok(formAppends.length > 0, 'upload should build a FormData payload');
  assert.deepEqual([...new Set(formAppends)], ['image']);
  assert.equal(calls.filter((c) => c.method === 'POST' && c.url === '/admin/gallery').length, 2);
});

test('the change-password form submits and stores the refreshed token', async () => {
  const { document, window, calls, localStorage } = bootPage('src/pages/settings.html', {
    pageName: 'settings',
    pathname: '/admin/settings',
    api: {
      '/auth/me': { id: 1, name: 'A', email: 'a@b.c', role: 'admin' },
      '/admin/contact/messages': { items: [], total: 0, page: 1, totalPages: 1, from: 0, to: 0 },
      '/admin/settings/links': [],
      '/auth/change-password': { message: 'ok', token: 'REFRESHED' }
    }
  });
  await settle();

  document.getElementById('current-password').value = 'OldPassw0rd!';
  document.getElementById('new-password').value = 'NewPassw0rd!';
  document.getElementById('confirm-password').value = 'NewPassw0rd!';

  calls.length = 0;
  document.getElementById('password-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await settle();

  assert.ok(calls.find((c) => c.url === '/auth/change-password'), 'should POST the change');
  // Changing the password revokes old tokens, so the new one must be stored.
  assert.equal(localStorage.getItem('authToken'), 'REFRESHED');

  document.getElementById('new-password').value = 'Another1!';
  document.getElementById('confirm-password').value = 'Different1!';
  calls.length = 0;
  document.getElementById('password-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await settle(20);
  assert.equal(calls.length, 0, 'a mismatched confirmation must not submit');
});

test('the home page renders any number of programs without indexing past the list', async () => {
  const { document, window } = bootPage('public/index.html', { pathname: '/' });
  const container = document.getElementById('programs-container');

  const make = (n) => Array.from({ length: n }, (_, i) => ({
    title: `Program ${i + 1}`, type: 'service', description: 'desc', schedule: 'Sun 9am', is_main_service: i === 1
  }));

  // The old renderer required exactly 3 and read programs[1] and programs[2]
  // unguarded.
  for (const count of [0, 1, 2, 3]) {
    window.CMS.pages.home.renderHomePrograms(make(count));
    const cards = container.querySelectorAll(':scope > div').length;
    assert.equal(cards, count, `${count} programs should render ${count} card(s)`);
  }
});

// --- Footer design ---

const PUBLIC_PAGES_WITH_FOOTER = [
  'public/index.html',
  'public/pages/announcement-details.html',
  'public/pages/announcements.html',
  'public/pages/contact.html',
  'public/pages/gallery.html',
  'public/pages/give.html',
  'public/pages/privacy.html',
  'public/pages/programs.html',
  'public/pages/terms.html',
  'public/pages/error/403.html',
  'public/pages/error/404.html',
  'public/pages/error/500.html',
  'public/pages/error/empty.html',
  'public/pages/error/offline.html'
];

function footerMarkup(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return html.slice(html.indexOf('<footer'), html.lastIndexOf('</footer>') + '</footer>'.length);
}

test('every public page carries the identical footer and loads its module', () => {
  const variants = new Set(PUBLIC_PAGES_WITH_FOOTER.map(footerMarkup));
  assert.equal(variants.size, 1, `expected one footer version, found ${variants.size}`);

  for (const file of PUBLIC_PAGES_WITH_FOOTER) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(html.includes('/js/footer.js'), `${file} does not load the footer module`);
  }
});

test('the footer renders the weekly schedule without JavaScript', () => {
  const { document } = parseHTML(fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'));
  const slots = document.querySelectorAll('#footer-week li');

  // The rail is the footer's reason for existing, so it must survive a failed
  // or blocked script load rather than collapsing to an empty list.
  assert.equal(slots.length, 3);
  assert.match(document.querySelector('#footer-week').textContent, /Divine Worship/);
});

test('the week rail marks exactly one upcoming service', async () => {
  const { document, window } = bootPage('public/index.html', {
    pathname: '/',
    api: {
      '/programs/weekly-schedule': [
        { day_of_week: 'Sunday', program_name: 'Divine Worship', start_time: '08:00:00', display_order: 1 },
        { day_of_week: 'Wednesday', program_name: 'Prayer Hour', start_time: '17:00:00', display_order: 2 },
        { day_of_week: 'Friday', program_name: 'Vigil (Monthly)', start_time: '22:00:00', display_order: 3 }
      ]
    }
  });

  await window.CMS.footer.init();
  await settle();

  const slots = document.querySelectorAll('#footer-week li');
  assert.equal(slots.length, 3);

  const next = document.querySelectorAll('#footer-week li.is-next');
  assert.equal(next.length, 1, 'exactly one service should be marked as next');
  assert.match(next[0].textContent, /Today|Tomorrow|In \d+ days/);
});

test('the next-service calculation rolls over correctly', () => {
  const { window } = bootPage('public/index.html', { pathname: '/' });
  const { nextOccurrence, relativeLabel, splitTime } = window.CMS.schedule;

  // A Saturday morning: Sunday's 8am service is tomorrow.
  const saturday = new Date(2026, 8, 12, 9, 0, 0);
  const sunday = nextOccurrence('Sunday', '08:00:00', saturday);
  assert.equal(sunday.getDay(), 0);
  assert.equal(relativeLabel(sunday, saturday), 'Tomorrow');

  // A Sunday at 09:00, after the 08:00 service: it rolls to next week.
  const afterService = new Date(2026, 8, 13, 9, 0, 0);
  const rolled = nextOccurrence('Sunday', '08:00:00', afterService);
  assert.equal(Math.round((rolled - afterService) / 86400000), 7);

  assert.deepEqual(splitTime('17:00:00'), { clock: '5:00', meridiem: 'PM' });
  assert.deepEqual(splitTime('00:30:00'), { clock: '12:30', meridiem: 'AM' });
});

test('footer links are keyboard-visible and respect reduced motion', () => {
  const { document } = parseHTML(fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'));
  const footer = document.querySelector('footer');

  for (const link of footer.querySelectorAll('a')) {
    const classes = link.getAttribute('class') || '';
    assert.ok(/focus-visible:/.test(classes), `footer link "${link.textContent.trim()}" has no focus style`);
    if (/\btransition/.test(classes)) {
      assert.ok(/motion-reduce:transition-none/.test(classes),
        `footer link "${link.textContent.trim()}" animates without a reduced-motion opt-out`);
    }
  }
});

test('the oversized wordmark is decorative and hidden from assistive tech', () => {
  for (const file of ['public/index.html', 'src/pages/members.html']) {
    const { document } = parseHTML(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const footer = document.querySelector('footer');
    const mark = footer.querySelector('[aria-hidden="true"] p.font-headline');
    assert.ok(mark, `${file} is missing the wordmark`);
    // It repeats the parish name already present in the copyright line, so it
    // must not be announced twice.
    assert.match(mark.textContent, /Sacred Hearth/);
  }
});

test('footer colour tokens all resolve against the shared Tailwind config', () => {
  const scope = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'js/tailwind-config.js'), 'utf8'))(scope);
  const colors = scope.__tailwindConfig.theme.extend.colors;

  for (const file of ['public/index.html', 'src/pages/members.html']) {
    const { document } = parseHTML(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const footer = document.querySelector('footer');
    const classes = [...footer.querySelectorAll('*')]
      .map((el) => el.getAttribute('class') || '')
      .concat(footer.getAttribute('class') || '')
      .join(' ');

    for (const match of classes.matchAll(/(?:bg|text|border|divide|ring)-((?:on-)?[a-z][a-z-]*)(?:\/|\[|\s|$)/g)) {
      const token = match[1];
      if (/^(primary|secondary|tertiary|surface|background|error|outline|inverse|on-)/.test(token)) {
        assert.ok(colors[token], `${file}: footer uses undefined colour token "${token}"`);
      }
    }
  }
});

// --- Navigation and page chrome ---

const PUBLIC_PAGES = PUBLIC_PAGES_WITH_FOOTER;

function headerMarkup(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const start = html.indexOf('<!-- Announcement bar');
  // Cut at the close of the full-screen menu rather than at <main>, so a
  // trailing comment on one page does not read as a different header.
  const close = '  </nav>\n</div>';
  const end = html.indexOf(close, start);
  assert.ok(start !== -1 && end !== -1, `${file} has no recognisable header`);
  return html.slice(start, end + close.length);
}

test('every public page carries the identical header', () => {
  const variants = new Set(PUBLIC_PAGES.map(headerMarkup));
  assert.equal(variants.size, 1, `expected one header version, found ${variants.size}`);
});

test('the admin sign-in link is not exposed anywhere on the public site', () => {
  for (const file of PUBLIC_PAGES) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!html.includes('/admin/login'), `${file} still links to the admin sign-in`);
  }
});

test('the mobile menu opens, traps and releases correctly', async () => {
  const { document, window } = bootPage('public/index.html', {
    pathname: '/',
    api: { '/programs/weekly-schedule': [] }
  });
  await settle();

  const menu = document.getElementById('mobile-menu');
  const openBtn = document.getElementById('menu-open');
  const closeBtn = document.getElementById('menu-close');

  // Mobile previously had no navigation at all: the links were `hidden md:flex`
  // with nothing behind them.
  assert.ok(menu && openBtn, 'mobile menu and trigger must exist');
  assert.equal(menu.getAttribute('role'), 'dialog');
  assert.equal(menu.getAttribute('aria-modal'), 'true');
  assert.equal(openBtn.getAttribute('aria-controls'), 'mobile-menu');

  await window.CMS.nav.init();

  assert.ok(menu.classList.contains('hidden'), 'menu should start closed');
  assert.equal(openBtn.getAttribute('aria-expanded'), 'false');

  openBtn.click();
  assert.ok(!menu.classList.contains('hidden'), 'trigger should open the menu');
  assert.equal(openBtn.getAttribute('aria-expanded'), 'true');
  assert.ok(document.body.classList.contains('overflow-hidden'), 'background scroll should lock');

  document.dispatchEvent(Object.assign(new window.Event('keydown'), { key: 'Escape' }));
  assert.ok(menu.classList.contains('hidden'), 'Escape should close the menu');
  assert.ok(!document.body.classList.contains('overflow-hidden'), 'scroll lock should release');

  openBtn.click();
  closeBtn.click();
  assert.ok(menu.classList.contains('hidden'), 'close button should work');
});

test('the current page is marked in the navigation', async () => {
  const { document, window } = bootPage('public/pages/gallery.html', {
    pathname: '/gallery',
    api: { '/programs/weekly-schedule': [], '/gallery': { items: [], totalPages: 1, page: 1 } }
  });
  await window.CMS.nav.init();
  await settle();

  const current = document.querySelectorAll('[data-nav-link].is-current');
  assert.ok(current.length > 0, 'the active link should be marked');
  for (const link of current) {
    assert.equal(link.getAttribute('href'), '/gallery');
    assert.equal(link.getAttribute('aria-current'), 'page');
  }

  const other = document.querySelector('[data-nav-link][href="/contact"]');
  assert.ok(!other.classList.contains('is-current'));
});

test('the announcement bar fills in the next service', async () => {
  const { document, window } = bootPage('public/index.html', {
    pathname: '/',
    api: {
      '/programs/weekly-schedule': [
        { day_of_week: 'Sunday', program_name: 'Divine Worship', start_time: '08:00:00', display_order: 1 },
        { day_of_week: 'Wednesday', program_name: 'Prayer Hour', start_time: '17:00:00', display_order: 2 }
      ]
    }
  });

  const slot = document.getElementById('next-service');
  assert.ok(slot, 'the bar needs a slot to fill');
  // It ships with a usable default so the bar is never empty without JS.
  assert.match(slot.textContent, /\S/);

  await window.CMS.nav.init();
  await settle();
  assert.match(slot.textContent, /Today|Tomorrow|In \d+ days/);
});

// --- Auth pages ---

const AUTH_PAGES = [
  ['src/auth/login.html', 'login', ['login-form', 'password']],
  ['src/auth/forgot-password.html', 'forgotPassword', ['forgot-password-form']],
  ['src/auth/verify-otp.html', 'verifyOTP', ['otp-form', 'timer-display', 'resend-btn', 'contact-mask']],
  ['src/auth/reset-password.html', 'resetPassword', ['reset-password-form', 'confirm_password']]
];

test('auth pages share one shell and expose what their scripts need', () => {
  for (const [file, page, ids] of AUTH_PAGES) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const { document } = parseHTML(html);

    assert.equal(document.body.getAttribute('data-page'), page, `${file} data-page`);
    assert.ok(html.includes('/css/site.css'), `${file} missing the shared stylesheet`);
    assert.equal([...document.querySelectorAll('script')].filter((s) => !s.getAttribute('src')).length, 0,
      `${file} has inline scripts`);

    for (const id of ids) {
      assert.ok(document.getElementById(id), `${file} is missing #${id}`);
    }

    // The split shell: a brand panel and the form, not a flex row that lets a
    // stray sibling squeeze the card.
    assert.ok(document.querySelector('.grid.min-h-screen'), `${file} is missing the split shell`);
    assert.ok(document.querySelector('main'), `${file} is missing <main>`);
  }
});

test('the sidebar normaliser only touches the dashboard sidebar', () => {
  // Selecting "the first <aside> on any /admin path" also caught the sign-in
  // page's brand panel and forced it to w-64/fixed, collapsing that layout.
  for (const [file] of AUTH_PAGES) {
    const { document, window } = bootPage(file, { pathname: '/admin/login' });
    window.CMS.shared.normalizeAdminSidebar();
    const aside = document.querySelector('aside');
    assert.ok(aside, `${file} should have a brand panel`);
    assert.ok(!aside.classList.contains('w-64'), `${file} brand panel was treated as a sidebar`);
    assert.ok(!aside.classList.contains('fixed'), `${file} brand panel was pinned`);
  }

  const { document } = bootPage('src/pages/members.html', { pathname: '/admin/members' });
  const sidebar = document.querySelector('aside[data-admin-sidebar]');
  assert.ok(sidebar, 'the dashboard sidebar should be marked');
  assert.ok(sidebar.classList.contains('w-64'), 'the dashboard sidebar should still be normalised');
});

test('password visibility toggles are wired on every auth page that has one', () => {
  for (const [file] of AUTH_PAGES) {
    const { document, window } = bootPage(file, { pathname: '/admin/login' });
    const toggles = document.querySelectorAll('.toggle-password');
    if (toggles.length === 0) continue;

    window.CMS.shared.initPasswordToggles();

    for (const toggle of toggles) {
      const target = document.querySelector(toggle.getAttribute('data-target'));
      assert.ok(target, `${file}: toggle points at a missing field`);
      assert.equal(target.type, 'password');
      toggle.dispatchEvent(new window.Event('click'));
      assert.equal(target.type, 'text', `${file}: toggle did not reveal the password`);
      toggle.dispatchEvent(new window.Event('click'));
      assert.equal(target.type, 'password', `${file}: toggle did not hide the password again`);
    }
  }
});

test('setButtonBusy preserves the button markup it restores', () => {
  const { document, window } = bootPage('src/auth/login.html', { pathname: '/admin/login' });
  const button = document.querySelector('#login-form button[type="submit"]');
  const before = button.innerHTML;

  // Assigning to textContent (as the auth scripts used to) destroys the arrow
  // inside the button and hard-codes the idle label in the script.
  const restore = window.CMS.shared.setButtonBusy(button, 'Signing in…');
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'Signing in…');

  restore();
  assert.equal(button.disabled, false);
  assert.equal(button.innerHTML, before, 'the button markup should be restored intact');
});
