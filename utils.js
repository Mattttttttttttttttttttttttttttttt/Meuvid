/* ================================================================
   utils.js — shared utility functions and SVG icons
   ================================================================ */

/** Escape a string for safe HTML attribute / text insertion. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** SHA-256 hash of a string, returned as a hex string. */
async function hashStr(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Load a value from localStorage, falling back to defaultValue. */
function load(key, defaultValue) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/** Save a value to localStorage as JSON. */
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota exceeded etc. */ }
}

/**
 * Filter a data array by a search query.
 * Supports keywords: pos(x), all(x), def(x).
 * Default: match the word string, starts-with first.
 *
 * @param {Array[]} data    - 2D array of entries
 * @param {string}  query   - raw search string
 * @param {boolean} hasPos  - whether the data has a POS field (index 1)
 */
function filterEntries(data, query, hasPos) {
  if (!query.trim()) return data;
  const q    = query.trim();
  const posM = q.match(/^pos\((.+)\)$/i);
  const allM = q.match(/^all\((.+)\)$/i);
  const defM = q.match(/^def\((.+)\)$/i);

  if (posM && hasPos) {
    const t = posM[1].toLowerCase();
    return data.filter(e => e[1].toLowerCase().includes(t));
  }
  if (allM) {
    const t = allM[1].toLowerCase();
    return data.filter(e => e.some(f => f.toLowerCase().includes(t)));
  }
  if (defM) {
    const t   = defM[1].toLowerCase();
    const idx = hasPos ? 2 : 1;
    return data.filter(e => e[idx].toLowerCase().includes(t));
  }

  // Default: match word string; starts-with has priority
  const t      = q.toLowerCase();
  const starts = data.filter(e =>  e[0].toLowerCase().startsWith(t));
  const rest   = data.filter(e => !e[0].toLowerCase().startsWith(t) && e[0].toLowerCase().includes(t));
  return [...starts, ...rest];
}

/* ── Inline SVG icons ── */

const SVG_CHEVRON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="9 18 15 12 9 6"/>
</svg>`;

const SVG_QUESTION = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
  <circle cx="12" cy="17" r="0.6" fill="currentColor"/>
</svg>`;
