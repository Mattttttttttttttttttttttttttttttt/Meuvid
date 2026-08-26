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

/*
 * Track whether Shift is currently held via keyboard events.
 * window blur resets it so we don't get stuck "held".
 */
let _shiftHeld = false;
document.addEventListener('keydown', e => { if (e.key === 'Shift') _shiftHeld = true;  }, true);
document.addEventListener('keyup',   e => { if (e.key === 'Shift') _shiftHeld = false; }, true);
window.addEventListener('blur', () => { _shiftHeld = false; });

/**
 * Show a styled yes/no dialog. Returns a Promise that resolves to true (confirmed)
 * or false (cancelled). Cancel button is focused by default.
 * Shift-clicking the triggering control bypasses the dialog: pass the
 * originating event and the Promise resolves immediately to true.
 * @param {string} message
 * @param {string} [confirmLabel='confirm']
 * @param {Event}  [event] originating event; if shiftKey is held, skip the dialog
 */
function showConfirm(message, confirmLabel = 'confirm', event = null) {
  if ((event && event.shiftKey) || _shiftHeld) return Promise.resolve(true);
  return new Promise(resolve => {
    // Clear any lingering text selection so the modal doesn't render highlighted.
    window.getSelection()?.removeAllRanges();
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

/* ── Hiding (spoiler) mode ── */

let _hideWords = false;
let _hideDefs  = false;
const _wordExceptions = new Set(); // keys whose covered state differs from the baseline
const _defExceptions  = new Set();

function _hideKind(el) {
  if (el.classList.contains('dict-word')) return 'word';
  if (el.classList.contains('dict-body')) return 'def';
  if (el.tagName === 'G') return 'word';
  if (el.tagName === 'H') return 'def';
  return null;
}
function _hideBaseline(kind)   { return kind === 'word' ? _hideWords : _hideDefs; }
function _hideExceptions(kind) { return kind === 'word' ? _wordExceptions : _defExceptions; }
function _isCovered(key, kind) { return _hideBaseline(kind) !== _hideExceptions(kind).has(key); }

/** Stable key for a dict entry/reference, so hidden state survives reordering and re-renders. */
function hideKeyForEntry(word, id, field) { return `w:${word}::${id ?? ''}::${field}`; }

/** Assign each <g>/<h> tag inside under root a stable key derived from
    its paragraph's text and its occurrence within it. Call
    after inserting any new paragraph markup, before applyHiding(). */
function tagParaHideKeys(root) {
  (root || document).querySelectorAll('.para-content').forEach(pc => {
    const counts = {};
    pc.querySelectorAll('g, h').forEach(el => {
      const tag = el.tagName.toLowerCase();
      counts[tag] = (counts[tag] || 0) + 1;
      el.dataset.hideKey = `p:${pc.textContent}::${tag}${counts[tag]}`;
    });
  });
}

function _syncHideEl(el) {
  const key = el.dataset.hideKey, kind = _hideKind(el);
  if (!key || !kind) return;
  el.classList.toggle('spoiler-hidden', _isCovered(key, kind));
}

/** Apply current hidden/revealed state to every coverable element under root
    (the whole document if omitted). Call after any render that might contain
    dict-word/dict-body spans or <g>/<h> tags. */
function applyHiding(root) {
  (root || document).querySelectorAll('[data-hide-key]').forEach(_syncHideEl);
}

function toggleHideWords() { _hideWords = !_hideWords; _wordExceptions.clear(); applyHiding(); }
function toggleHideDefs()  { _hideDefs  = !_hideDefs;  _defExceptions.clear();  applyHiding(); }

/** Force el (and everything coverable inside it) to be revealed, regardless of
    the baseline. Call this right before an edit form opens, an item moves, or
    its delete confirmation shows, so the user isn't acting on text they can't
    read. */
function revealHidden(el) {
  if (!el) return;
  const nodes = el.matches?.('[data-hide-key]')
    ? [el, ...el.querySelectorAll('[data-hide-key]')]
    : [...(el.querySelectorAll?.('[data-hide-key]') || [])];
  nodes.forEach(n => {
    const key = n.dataset.hideKey, kind = _hideKind(n);
    if (!key || !kind) return;
    const exc = _hideExceptions(kind);
    if (_hideBaseline(kind)) exc.add(key); else exc.delete(key); // force covered = false
    _syncHideEl(n);
  });
}

/*
 * Click a coverable region (nothing selected, no modifier held) to flip its
 * hidden state, independent of the baseline mode.
 */
document.addEventListener('click', e => {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  if (window.getSelection()?.toString()) return; // was a text selection, not a click
  const el = e.target.closest('[data-hide-key]');
  if (!el) return;
  const key = el.dataset.hideKey, kind = _hideKind(el);
  if (!key || !kind) return;
  const exc = _hideExceptions(kind);
  exc.has(key) ? exc.delete(key) : exc.add(key);
  _syncHideEl(el);
});

/* ── Global keyboard shortcuts ── */

/*
 * _escCleanup: registered by the textpage edit form so that Escape can
 * revert in-memory moves and restore data, not just toggle CSS classes.
 */
let _escCleanup = null;
function setEscCleanup(fn) { _escCleanup = fn; }
function clearEscCleanup() { _escCleanup = null; }

/*
 * _escHandler: registered by a page (e.g. the section view) to close its own
 * transient UI on Escape. Returns true when it handled the key.
 */
let _escHandler = null;
function registerEscHandler(fn) { _escHandler = fn; }

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

    // Ctrl+Shift+G / Ctrl+Shift+H → toggle hiding
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'g') { e.preventDefault(); toggleHideWords(); return; }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); toggleHideDefs();  return; }

    // Ctrl+F → focus search input
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
      // Let a page-registered handler (section view) close its own UI first
      if (_escHandler && _escHandler()) return;
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
 * Build a case-insensitive RegExp from a search fragment. Full regex syntax is
 * supported, with one twist: a bare "*" means "any single letter" (\w) instead of
 * the usual "0 or more of the previous token"; "\*" still matches a literal "*".
 * Falls back to a literal (fully-escaped) match if the pattern is invalid, so a
 * search string mid-edit (e.g. unbalanced parens) never throws.
 */
function _toRegexSource(s) {
  return s
    .replace(/\\\*/g, '\u0000')  // stash literal "\*"
    .replace(/\*/g, '\\w')       // bare "*" → any single letter
    .replace(/\u0000/g, '\\*');  // restore the literal
}

function _buildRegex(s) {
  try { return new RegExp(_toRegexSource(s), 'i'); }
  catch { return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
}

/** Strip apostrophes so for the field being searched */
function _stripApos(s) { return String(s).replace(/'/g, ''); }

/**
 * Filter a data array by a search query. The query (and each keyword function's
 * argument) is interpreted as regex — see _buildRegex for the "*" exception.
 * Supports keyword functions: pos(x), all(x), def(x).
 * The closing paren is optional
 * If the text before "("  * isn't a recognized function, the whole query is
 * treated as a pattern itself.
 * Default: match the word string, starts-with first.
 *
 * @param {Array[]} data    - 2D array of entries
 * @param {string}  query   - raw search string
 * @param {boolean} hasPos  - whether the data has a POS field (index 1)
 */
function filterEntries(data, query, hasPos) {
  if (!query.trim()) return data;
  const q = query.trim();

  // name( ... ) with an optional trailing ")" — captures the function name and arg
  const fnM = q.match(/^([a-z]+)\((.*?)\)?$/i);
  if (fnM) {
    const fn = fnM[1].toLowerCase();
    const re = _buildRegex(fnM[2]);
    if (fn === 'pos' && hasPos) return data.filter(e => re.test(_stripApos(e[1])));
    if (fn === 'all')          return data.filter(e => e.some(f => re.test(_stripApos(String(f)))));
    if (fn === 'def') {
      const idx = hasPos ? 2 : 1;
      return data.filter(e => re.test(_stripApos(e[idx])));
    }
    // unrecognized function name → fall through to literal search
  }

  // Default: match word string (apostrophes ignored); starts-with has priority
  const re = _buildRegex(q);
  const startsAt0 = s => { const m = re.exec(_stripApos(s)); return !!m && m.index === 0; };
  const starts = data.filter(e => startsAt0(e[0]));
  const rest = data.filter(e => !startsAt0(e[0]) && re.test(_stripApos(e[0])));
  return [...starts, ...rest];
}

/* ── Inline SVG icons ── */

/**
 * Serialize a 2D array (e.g. dict, affixes) into a JS array literal.
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
 * Serialize the SECTIONS dataset. Each section is [headingText, itemsArray];
 * an item is either a string (paragraph) or an array (a referenced word entry).
 */
function _serSections(arr) {
  const secs = arr.map(([heading, items]) => {
    const lines = (items || []).map(it =>
      Array.isArray(it)
        ? '    [' + it.map(s => JSON.stringify(s)).join(', ') + ']'
        : '    ' + JSON.stringify(it)
    ).join(',\n');
    const body = lines ? `\n${lines},\n  ` : '';
    return `  [${JSON.stringify(heading)}, [${body}]]`;
  }).join(',\n');
  return arr.length ? `[\n${secs},\n]` : '[]';
}

const MV_DATA_KEYS = [
  'mv_dict', 'mv_dict_view',
  'mv_affixes', 'mv_affixes_view',
  'mv_grammar',
  'mv_phonetics',
  'mv_philosophy',
  'mv_sections',
  'mv_affixes_sections',
  'mv_undo', 'mv_redo',
];

/** Wipe all locally-saved meuvid data so every page falls back to the shipped lang-data.js. */
function resetMeuvidData() {
  MV_DATA_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  location.reload();
}

/**
 * Build a fresh lang-data.js from current localStorage state and trigger a download.
 */
function exportDataJS() {
  const dict = load('mv_dict', DICT);
  const affixes = load('mv_affixes', AFFIXES);
  const grammar = load('mv_grammar', GRAMMAR);
  const phonetics = load('mv_phonetics', PHONETICS);
  const philosophy = load('mv_philosophy', PHILOSOPHY);
  const sections = load('mv_sections', SECTIONS);
  const affixesSections = load('mv_affixes_sections', AFFIXES_SECTIONS);

  const ts = new Date().toISOString();

  const content =
    `/* ================================================================
   lang-data.js — all language data arrays
   Last updated: ${ts}
   ================================================================ */

const DICT = ${_ser2D(dict)};

const AFFIXES = ${_ser2D(affixes)};

const GRAMMAR = ${_ser1D(grammar)};

const PHONETICS = ${_ser1D(phonetics)};

const PHILOSOPHY = ${_ser1D(philosophy)};

const SECTIONS = ${_serSections(sections)};

const AFFIXES_SECTIONS = ${_serSections(affixesSections)};
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

/* list view — rows of lines */
const SVG_LIST = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="8" y1="6" x2="20" y2="6"/>
  <line x1="8" y1="12" x2="20" y2="12"/>
  <line x1="8" y1="18" x2="20" y2="18"/>
  <circle cx="4" cy="6" r="1"/>
  <circle cx="4" cy="12" r="1"/>
  <circle cx="4" cy="18" r="1"/>
</svg>`;

/* section view — a framed table with a frozen header row */
const SVG_SECTION = `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"
  xmlns="http://www.w3.org/2000/svg">
  <path d="M6.25 3C4.45507 3 3 4.45507 3 6.25V17.75C3 19.5449 4.45507 21 6.25 21H17.75C19.5449 21 21 19.5449 21 17.75V6.25C21 4.45507 19.5449 3 17.75 3H6.25ZM4.5 6.25C4.5 5.2835 5.2835 4.5 6.25 4.5H17.75C18.7165 4.5 19.5 5.2835 19.5 6.25V8.5H4.5V6.25ZM10 10H14V14H10V10ZM8.5 10V14H4.5V10H8.5ZM8.5 15.5V19.5H6.25C5.2835 19.5 4.5 18.7165 4.5 17.75V15.5H8.5ZM10 19.5V15.5H14V19.5H10ZM15.5 14V10H19.5V14H15.5ZM15.5 15.5H19.5V17.75C19.5 18.7165 18.7165 19.5 17.75 19.5H15.5V15.5Z"/>
</svg>`;
