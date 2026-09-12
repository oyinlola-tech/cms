const fs = require('fs');
const path = require('path');
const { parseHTML, NodeFilter } = require('linkedom');

const PAGES = [
  ['public/index.html', 'home'],
  ['public/pages/terms.html', null],
  ['public/pages/give.html', null],
  ['public/pages/privacy.html', null],
  ['public/pages/announcement-details.html', 'announcementDetails'],
  ['public/pages/contact.html', 'contact'],
  ['src/index.html', 'dashboard'],
  ['src/pages/members.html', 'members'],
  ['src/pages/settings.html', 'settings'],
  ['src/pages/users.html', 'users'],
  ['src/pages/finance.html', 'finance'],
  ['src/pages/programs.html', 'programsAdmin'],
  ['src/pages/announcements.html', 'announcementsAdmin'],
  ['src/pages/gallery.html', 'galleryAdmin'],
  ['src/pages/details/members-details.html', 'memberDetails'],
  ['src/auth/login.html', 'login'],
];

const SCRIPT_ROOTS = { '/js/': '', '/src/js/': '', '/src/auth/': '' };
// Mirror the server's static resolution order from backend/app.js:
//   express.static(publicDir) is mounted first, then /js -> <root>/js,
//   /src/js -> src/js and /src/auth -> src/auth.
function resolveScript(src) {
  const candidates = [];
  if (src.startsWith('/')) candidates.push(path.join('public', src));      // publicDir root
  if (src.startsWith('/js/')) candidates.push(src.slice(1));               // <root>/js
  if (src.startsWith('/src/')) candidates.push(src.slice(1));              // <root>/src
  return candidates.find(c => fs.existsSync(c)) || null;
}

let failures = 0;

for (const [file, expectedPage] of PAGES) {
  const html = fs.readFileSync(file, 'utf8');
  const { document, window } = parseHTML(html);

  global.document = document;
  global.window = window;
  global.NodeFilter = NodeFilter;
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  global.FormData = class { get() { return null; } };
  window.localStorage = global.localStorage;
  window.location = { pathname: '/', href: '' };
  window.fetch = () => Promise.resolve({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: () => Promise.resolve({ items: [], totalPages: 1, page: 1 }) });
  window.CMS = undefined;
  window.tailwind = {};

  const dataPage = document.body.getAttribute('data-page');
  const inline = [...document.querySelectorAll('script')].filter(s => !s.getAttribute('src')).length;
  const hasConfig = html.includes('/js/tailwind-config.js');
  const hasInit = html.includes('/js/page-init.js');

  // Load every local script the page declares, in order.
  const srcs = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).filter(s => s.startsWith('/'));
  let loadError = null;
  for (const src of srcs) {
    const rel = resolveScript(src);
    if (!rel) { loadError = (loadError ? loadError + ' | ' : '') + `${src}: not found on disk`; continue; }
    try {
      const code = fs.readFileSync(rel, 'utf8');
      new Function('window', 'document', 'localStorage', 'FormData', 'NodeFilter', 'console', code)(
        window, document, global.localStorage, global.FormData, NodeFilter, console);
    } catch (e) {
      loadError = (loadError ? loadError + ' | ' : '') + `${src}: ${e.message}`;
    }
  }

  const cms = window.CMS || {};
  const ns = [cms.pages, cms.authPages];
  const initFound = expectedPage ? ns.some(g => g && g[expectedPage] && typeof g[expectedPage].init === 'function') : true;

  const problems = [];
  if (inline > 0) problems.push(`${inline} inline script(s)`);
  if (!hasConfig) problems.push('no tailwind-config');
  if (!hasInit) problems.push('no page-init');
  if (expectedPage && dataPage !== expectedPage) problems.push(`data-page="${dataPage}" != ${expectedPage}`);
  if (loadError) problems.push(`load error ${loadError}`);
  if (expectedPage && !initFound) problems.push(`initializer "${expectedPage}" not registered`);

  if (problems.length) { failures++; console.log(`  ✖ ${file}: ${problems.join('; ')}`); }
  else console.log(`  ✔ ${file}${expectedPage ? ` (${expectedPage})` : ''}`);
}

console.log(failures === 0 ? '\nALL PAGES OK' : `\n${failures} PAGE(S) WITH PROBLEMS`);
process.exit(failures ? 1 : 0);
