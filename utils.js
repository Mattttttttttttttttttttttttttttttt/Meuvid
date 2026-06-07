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
  const q = query.trim();
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
    const t = defM[1].toLowerCase();
    const idx = hasPos ? 2 : 1;
    return data.filter(e => e[idx].toLowerCase().includes(t));
  }

  // Default: match word string; starts-with has priority
  const t = q.toLowerCase();
  const starts = data.filter(e => e[0].toLowerCase().startsWith(t));
  const rest = data.filter(e => !e[0].toLowerCase().startsWith(t) && e[0].toLowerCase().includes(t));
  return [...starts, ...rest];
}

/* ── Inline SVG icons ── */

/**
 * Serialize a 2D array (e.g. dict, roots) into a JS array literal.
 * Each sub-array becomes one indented line.
 */
function _ser2D(arr) {
  const rows = arr.map(row =>
    '  [' + row.map(s => JSON.stringify(s)).join(', ') + ']'
  ).join(',\n');
  return `[\n${rows},\n]`;
}

/**
 * Serialize a flat string array (e.g. grammar paragraphs) into a JS array literal.
 */
function _ser1D(arr) {
  const rows = arr.map(s => '  ' + JSON.stringify(s)).join(',\n');
  return `[\n${rows},\n]`;
}

/**
 * Build a fresh data.js from current localStorage state and trigger a download.
 * Replace the data.js in your project folder with the downloaded file, then redeploy.
 */
function exportDataJS() {
  const dict = load('mv_dict', DEFAULT_DICT);
  const roots = load('mv_roots', DEFAULT_ROOTS);
  const grammar = load('mv_grammar', DEFAULT_GRAMMAR);
  const phonetics = load('mv_phonetics', DEFAULT_PHONETICS);
  const philosophy = load('mv_philosophy', DEFAULT_PHILOSOPHY);

  const ts = new Date().toISOString();

  const content =
    `/* ================================================================
   data.js — all static data arrays and navigation config
   Last edited: ${ts}
   ================================================================ */

// SHA-256 hash of the admin password.
// Hardcode this value manually. All devices check against it directly.
const AUTH_HASH = ${JSON.stringify(AUTH_HASH)};

const DEFAULT_DICT = ${_ser2D(dict)};

const DEFAULT_ROOTS = ${_ser2D(roots)};

const DEFAULT_GRAMMAR = ${_ser1D(grammar)};

const DEFAULT_PHONETICS = ${_ser1D(phonetics)};

const DEFAULT_PHILOSOPHY = ${_ser1D(philosophy)};

// [keyword, description] — shown in the ? modal
const DICT_KEYWORDS = ${_ser2D(DICT_KEYWORDS)};

const ROOTS_KEYWORDS = ${_ser2D(ROOTS_KEYWORDS)};

// Navigation items — id must match the page's active id passed to initNav()
const NAV_ITEMS = [
  { id: 'dict',       label: 'dictionary',  href: 'dict'       },
  { id: 'grammar',    label: 'grammar',     href: 'grammar'    },
  { id: 'roots',      label: 'roots',       href: 'roots'      },
  { id: 'phonetics',  label: 'phonetics',   href: 'phonetics'  },
  { id: 'philosophy', label: 'philosophy…', href: 'philosophy' },
];

const HOME_CARDS = [
  { id: 'dict',       title: 'Dictionary',  href: 'dict',       desc: 'Browse and search Meuvid words, parts of speech, and definitions.' },
  { id: 'grammar',    title: 'Grammar',     href: 'grammar',    desc: 'Learn the grammatical structure and rules governing Meuvid.' },
  { id: 'roots',      title: 'Roots',       href: 'roots',      desc: 'Explore the morphological roots from which Meuvid words are built.' },
  { id: 'phonetics',  title: 'Phonetics',   href: 'phonetics',  desc: 'Study the sound system, vowels, consonants, and phonotactics.' },
  { id: 'philosophy', title: 'Philosophy',  href: 'philosophy', desc: 'Understand the ideas and intentions behind Meuvid.' },
];
`;

  const blob = new Blob([content], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'data.js'; a.click();
  URL.revokeObjectURL(url);
}

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
