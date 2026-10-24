/* ================================================================
   store.js — all persistent state lives in one localStorage entry,
   "mv": { auth, "dict-view", undo, redo, dict, grammar, … }.
   No imports, so any module (auth.js included) can use it.
   ================================================================ */

const KEY = 'mv';

function _read() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY));
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}

function _write(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* quota exceeded etc. */ }
}

/** Value stored under `name`, or `fallback` if absent. */
export function load(name, fallback) {
  const v = _read()[name];
  return v === undefined ? fallback : v;
}

export function save(name, value) {
  _write({ ..._read(), [name]: value });
}

export function remove(name) {
  const o = _read();
  delete o[name];
  _write(o);
}

/** Drop everything except the listed names. */
export function clearExcept(keep = []) {
  const o = _read();
  _write(Object.fromEntries(keep.filter(k => k in o).map(k => [k, o[k]])));
}
