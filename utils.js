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

/* ── Undo / Redo ── */

const _MAX_HISTORY = 50;

function _loadStack(k)    { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : []; } catch { return []; } }
function _saveStack(k, a) { try { localStorage.setItem(k, JSON.stringify(a)); } catch {} }

let _undoRestoreCallback = null;
/** Register the current page's restore handler; replaces the previous one on navigation. */
function registerUndoCallback(cb) { _undoRestoreCallback = cb; }

/**
 * Push a reversible data change onto the undo stack.
 * @param {string} dataKey
 * @param {*} before  deep-cloned snapshot BEFORE the change
 * @param {*} after   deep-cloned snapshot AFTER the change
 */
function pushUndo(dataKey, before, after) {
  const stack = _loadStack('mv_undo');
  stack.push({ dataKey, before, after });
  if (stack.length > _MAX_HISTORY) stack.shift();
  _saveStack('mv_undo', stack);
  _saveStack('mv_redo', []); // new action always clears the redo branch
}

function undoAction() {
  const stack = _loadStack('mv_undo');
  if (!stack.length) return;
  const entry = stack.pop(); _saveStack('mv_undo', stack);
  const redo = _loadStack('mv_redo'); redo.push(entry); _saveStack('mv_redo', redo);
  save(entry.dataKey, entry.before);
  _undoRestoreCallback?.(entry.dataKey, entry.before);
}

function redoAction() {
  const redo = _loadStack('mv_redo');
  if (!redo.length) return;
  const entry = redo.pop(); _saveStack('mv_redo', redo);
  const stack = _loadStack('mv_undo'); stack.push(entry); _saveStack('mv_undo', stack);
  save(entry.dataKey, entry.after);
  _undoRestoreCallback?.(entry.dataKey, entry.after);
}

/* ── Inline text formatting ── */

/**
 * Wrap the textarea's current selection in open/close tags.
 * If nothing is selected, insert the tags and place the cursor between them.
 */
function wrapSelectedText(ta, open, close) {
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  if (s === e) {
    ta.value = v.slice(0, s) + open + close + v.slice(s);
    ta.setSelectionRange(s + open.length, s + open.length);
  } else {
    ta.value = v.slice(0, s) + open + v.slice(s, e) + close + v.slice(e);
    ta.setSelectionRange(s, s + open.length + (e - s) + close.length);
  }
  ta.focus();
}

/* ── Confirmation modal ── */

/**
 * Show a styled yes/no dialog. Returns a Promise that resolves to true (confirmed)
 * or false (cancelled). Cancel button is focused by default.
 * @param {string} message
 * @param {string} [confirmLabel='confirm']
 */
function showConfirm(message, confirmLabel = 'confirm') {
  return new Promise(resolve => {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
      <div class="overlay" id="confirm-overlay">
        <div class="modal modal-sm" role="dialog" aria-modal="true">
          <p class="confirm-msg">${esc(message)}</p>
          <div class="confirm-actions">
            <button class="btn btn-sm"          id="confirm-cancel">cancel</button>
            <button class="btn btn-sm btn-danger" id="confirm-ok">${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>`;

    function close(result) {
      document.removeEventListener('keydown', onKey);
      container.innerHTML = '';
      resolve(result);
    }
    function onKey(e) { if (e.key === 'Escape') close(false); }

    document.getElementById('confirm-ok').addEventListener('click',     () => close(true));
    document.getElementById('confirm-cancel').addEventListener('click', () => close(false));
    document.getElementById('confirm-overlay').addEventListener('click', e => {
      if (e.target.id === 'confirm-overlay') close(false);
    });
    document.addEventListener('keydown', onKey);
    setTimeout(() => document.getElementById('confirm-cancel')?.focus(), 20);
  });
}

/* ── Global keyboard shortcuts ── */

/*
 * _escCleanup: registered by the textpage edit form so that Escape can
 * revert in-memory moves and restore data, not just toggle CSS classes.
 */
let _escCleanup = null;
function setEscCleanup(fn) { _escCleanup = fn; }
function clearEscCleanup() { _escCleanup = null; }

/**
 * Register site-wide keyboard shortcuts once per page load.
 * Called by initNav on its first render so AUTH is guaranteed to be defined.
 */
function initGlobalShortcuts() {
  document.addEventListener('keydown', e => {
    const ctrl   = e.ctrlKey || e.metaKey;
    const active = document.activeElement;
    const inText = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

    // Ctrl+S → export data (logged-in only)
    if (ctrl && e.key === 's') {
      e.preventDefault();
      if (typeof AUTH !== 'undefined' && AUTH.isLoggedIn()) exportDataJS();
      return;
    }

    // Ctrl+F → focus search input (dict/roots pages)
    if (ctrl && e.key === 'f') {
      const si = document.getElementById('search-input');
      if (si) { e.preventDefault(); si.focus(); si.select(); }
      return;
    }

    // Ctrl+Z → big undo (only when focus is NOT inside a text field)
    if (ctrl && !e.shiftKey && e.key === 'z') {
      if (!inText) { e.preventDefault(); undoAction(); }
      return;
    }

    // Ctrl+Y or Ctrl+Shift+Z → redo
    if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      if (!inText) { e.preventDefault(); redoAction(); }
      return;
    }

    // Escape
    if (e.key === 'Escape') {
      // Let the confirm dialog handle its own Escape via its own listener
      if (document.getElementById('confirm-overlay')) return;
      // If a textpage edit session is active, revert moves and close
      if (_escCleanup) { _escCleanup(); _escCleanup = null; return; }
      // Otherwise do the normal CSS-only close for dict and textpage forms
      document.querySelectorAll('.dict-entry-wrapper.editing').forEach(w => {
        w.classList.remove('editing');
        w.querySelector('.edit-collapse')?.classList.remove('open');
      });
      document.querySelectorAll('.para-block.editing').forEach(b => {
        b.classList.remove('editing');
        b.querySelector('.para-edit-collapse')?.classList.remove('open');
      });
      const addC = document.getElementById('add-form-collapse');
      if (addC?.classList.contains('open')) {
        addC.classList.remove('open');
        const btn = document.getElementById('text-add-btn');
        if (btn) btn.textContent = '+ add paragraph';
      }
      const rawC = document.getElementById('raw-form-collapse');
      if (rawC?.classList.contains('open')) {
        rawC.classList.remove('open');
        const btn = document.getElementById('text-raw-btn');
        if (btn) btn.textContent = 'raw edit';
      }
    }
  });
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
 * Build a fresh lang-data.js from current localStorage state and trigger a download.
 */
function exportDataJS() {
  const dict = load('mv_dict', DICT);
  const roots = load('mv_roots', ROOTS);
  const grammar = load('mv_grammar', GRAMMAR);
  const phonetics = load('mv_phonetics', PHONETICS);
  const philosophy = load('mv_philosophy', PHILOSOPHY);

  const ts = new Date().toISOString();

  const content =
    `/* ================================================================
   lang-data.js — all language data arrays
   Last updated: ${ts}
   ================================================================ */

const DICT = ${_ser2D(dict)};

const ROOTS = ${_ser2D(roots)};

const GRAMMAR = ${_ser1D(grammar)};

const PHONETICS = ${_ser1D(phonetics)};

const PHILOSOPHY = ${_ser1D(philosophy)};
`;

  const blob = new Blob([content], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'lang-data.js'; a.click();
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
