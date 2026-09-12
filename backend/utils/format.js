function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function percentChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur === 0 ? 0 : 100;
  return Math.round(((cur - prev) / prev) * 100);
}

function isSafeHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Spreadsheet apps execute any cell whose text begins with one of these, so a
// stored value like "=HYPERLINK(...)" becomes code on open. Prefixing with a
// single quote neutralises it while staying readable.
const CSV_FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

function csvEscape(value) {
  let text = String(value ?? '');

  if (CSV_FORMULA_PREFIXES.includes(text.charAt(0))) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = {
  csvEscape,
  escapeHtml,
  isSafeHttpUrl,
  percentChange
};
