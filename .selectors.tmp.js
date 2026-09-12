const fs = require('fs');
const { parseHTML } = require('linkedom');

const PAGES = {
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
  'src/pages/reports.html': ['src/js/pages/reports.js'],
  'src/pages/users.html': ['src/js/pages/users.js'],
  'src/pages/details/members-details.html': ['src/js/pages/member-details.js'],
  'src/auth/login.html': ['src/auth/login.js'],
  'src/auth/forgot-password.html': ['src/auth/forgot-password.js'],
  'src/auth/verify-otp.html': ['src/auth/verify-otp.js'],
  'src/auth/reset-password.html': ['src/auth/reset-password.js'],
};

let problems = 0;
for (const [html, scripts] of Object.entries(PAGES)) {
  const { document } = parseHTML(fs.readFileSync(html, 'utf8'));
  const ids = new Set([...document.querySelectorAll('[id]')].map(e => e.getAttribute('id')));
  const names = new Set([...document.querySelectorAll('[name]')].map(e => e.getAttribute('name')));

  const missing = [];
  for (const script of scripts) {
    if (!fs.existsSync(script)) { missing.push(`${script} MISSING FILE`); continue; }
    const src = fs.readFileSync(script, 'utf8');

    // getElementById('x') — only flag ones not created dynamically by the script.
    for (const m of src.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
      const id = m[1];
      if (!ids.has(id) && !src.includes(`id="${id}"`) && !src.includes(`'${id}'`.replace(id, id) + ' =')) {
        if (!src.includes(`id="` + id) && !src.includes("'" + id + "',")) missing.push(`#${id}`);
      }
    }
    // querySelector('#x ...')
    for (const m of src.matchAll(/querySelector(?:All)?\(['"]#([A-Za-z0-9_-]+)/g)) {
      if (!ids.has(m[1])) missing.push(`#${m[1]} (qs)`);
    }
    // form field names read via formData.get('x') are checked against the page
    // only when the script does not build its own modal markup.
    if (!src.includes('openModal')) {
      for (const m of src.matchAll(/formData\.get\(['"]([^'"]+)['"]\)/g)) {
        if (!names.has(m[1])) missing.push(`[name=${m[1]}]`);
      }
    }
  }

  const unique = [...new Set(missing)];
  if (unique.length) { problems++; console.log(`  ✖ ${html}\n      ${unique.join(', ')}`); }
  else console.log(`  ✔ ${html}`);
}
console.log(problems === 0 ? '\nSELECTORS OK' : `\n${problems} page(s) with selector mismatches`);
