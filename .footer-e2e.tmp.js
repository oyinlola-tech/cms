const fs = require('fs');
const path = require('path');
const { parseHTML, NodeFilter } = require('linkedom');

const PAGES = ['public/index.html','public/pages/terms.html','public/pages/privacy.html','public/pages/give.html',
               'public/pages/contact.html','public/pages/announcements.html','public/pages/gallery.html',
               'public/pages/programs.html','public/pages/announcement-details.html','src/index.html',
               'src/pages/members.html','src/pages/settings.html'];

const CONFIG = (() => {
  const w = {}; global.window = w;
  const code = fs.readFileSync('js/tailwind-config.js','utf8');
  new Function('window', code)(w);
  return w.__tailwindConfig;
})();
const COLORS = CONFIG.theme.extend.colors;

// Which colour tokens does each footer actually use?
const TOKEN_RE = /(?:bg|text|border|from|to|via)-([a-z-]+?)(?:\/\d+)?(?=\s|"|$)/g;

let bad = 0;
for (const file of PAGES) {
  const html = fs.readFileSync(file, 'utf8');
  const { document, window } = parseHTML(html);
  global.document = document; global.window = window; global.NodeFilter = NodeFilter;
  global.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
  window.localStorage = global.localStorage;
  window.location = { pathname: '/' };
  window.CMS = undefined;

  new Function('window','document','localStorage','NodeFilter','console',
    fs.readFileSync('js/utils/shared.js','utf8'))(window, document, global.localStorage, NodeFilter, console);

  const footer = document.querySelector('footer');
  if (!footer) { console.log(`  - ${file}: no footer`); continue; }

  const before = { links: footer.querySelectorAll('a').length, els: footer.querySelectorAll('*').length };

  window.CMS.shared.updateFooterYear();
  window.CMS.shared.applyStickyFooter();

  const after = { links: footer.querySelectorAll('a').length, els: footer.querySelectorAll('*').length };

  // Every colour token the footer references must exist in the shared config.
  const classes = [...footer.querySelectorAll('*')].map(e => e.getAttribute('class') || '').join(' ') + ' ' + (footer.getAttribute('class') || '');
  const missing = new Set();
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(classes))) {
    const tok = m[1];
    if (/^(primary|secondary|tertiary|surface|background|error|outline|inverse|on-)/.test(tok) && !COLORS[tok]) missing.add(tok);
  }

  const year = (footer.textContent.match(/©\s*(\d{4})/) || [])[1];
  const wantYear = String(new Date().getFullYear());
  const problems = [];
  if (after.links !== before.links) problems.push(`lost ${before.links - after.links} links`);
  if (after.els !== before.els) problems.push(`lost ${before.els - after.els} elements`);
  if (missing.size) problems.push(`undefined tokens: ${[...missing].join(', ')}`);
  if (year && year !== wantYear) problems.push(`year ${year}`);

  if (problems.length) { bad++; console.log(`  ✖ ${file}: ${problems.join('; ')}`); }
  else console.log(`  ✔ ${file}: ${after.links} links intact, tokens resolve, year ${year}`);
}
console.log(bad === 0 ? '\nFOOTERS OK' : `\n${bad} FOOTER PROBLEM(S)`);
process.exit(bad ? 1 : 0);
