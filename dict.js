/* ================================================================
   dict.js — configurable word-list page
   ================================================================ */

import {
  esc, withSnippets, registerUndoCallback, pushUndo, showConfirm, hideKeyForEntry,
  applyHiding, revealHidden, filterEntries, discardEditDraft, guardDiscard,
  SVG_QUESTION, SVG_LIST, SVG_SECTION, wordFieldsHTML,
} from './utils.js';
import { AUTH } from './auth.js';
import { load, save } from './store.js';
import { createTextPage } from './textpage.js';

/**
 * Create the dictionary page.
 *
 * @param {object} cfg
 * @param {string}   cfg.dataKey      - key in the "mv" store, e.g. 'dict'
 * @param {Array[]}  cfg.dataRaw      - fallback data array
 * @param {Array[]}  cfg.kwTable      - keywords table (DICT_KEYWORDS)
 * @param {string}   cfg.sectionsKey  - store key of the section view's data
 * @param {Array}    cfg.sectionsRaw  - fallback sections array
 *
 * @returns {{ render: Function }}
 */
export function createDictPage(cfg) {
  const { dataKey, dataRaw, kwTable } = cfg;

  /* An entry is [word, pos, def] (+ optional numeric id). The id is the trailing
     element and exists only to disambiguate; the first occurrence stays id-less. */
  const entryId = e => (e.length > 3 ? e[3] : null);

  /* ignore prefix hyphens */
  const _cmpEntries = (a, b) => a[0].replace(/^-/, '').localeCompare(b[0].replace(/^-/, ''));

  /* ── page-local state ── */
  let data        = load(dataKey, dataRaw).sort(_cmpEntries);
  let query       = '';
  let showKwModal = false;
  let viewMode    = load('dict-view', 'list'); // 'list' | 'section'

  /* ── section view module ── */
  const sectionView = createTextPage({
    dataKey: cfg.sectionsKey,
    dataRaw: cfg.sectionsRaw,
    getDict: () => data,
    addDictEntry: _addDictEntry,
    updateDictEntry: _updateEntryByRef,
  });

  _migrateDuplicateIds();

  /* Smallest unused id, considering both the dictionary and any id still held by
     a section reference, so a dangling reference's id is never reassigned. */
  function _nextId() {
    let mx = 0;
    data.forEach(e => { const id = entryId(e); if (id != null && id > mx) mx = id; });
    (sectionView?.collectRefIds() || []).forEach(id => { if (id > mx) mx = id; });
    return mx + 1;
  }

  /* Assign ids to duplicate entries that lack one (keeping the first occurrence
     id-less), e.g. for seed data that predates this scheme. Runs once on load. */
  function _migrateDuplicateIds() {
    const seen = new Set();
    let changed = false;
    data.forEach(e => {
      if (entryId(e) != null) return;
      if (seen.has(e[0])) { e.push(_nextId()); changed = true; }
      else seen.add(e[0]);
    });
    if (changed) save(dataKey, data);
  }

  /* Build a storable entry from a [word, …] tuple, attaching an id when the word
     already exists (so the addition is a duplicate). Returns the entry. */
  function _entryWithId(tuple) {
    return data.some(e => e[0] === tuple[0]) ? [...tuple, _nextId()] : [...tuple];
  }

  /* Add a word on behalf of the section view; returns the reference to store. */
  function _addDictEntry(tuple) {
    const before = JSON.parse(JSON.stringify(data));
    const entry  = _entryWithId(tuple);
    data = [...data, entry].sort(_cmpEntries);
    save(dataKey, data);
    pushUndo(dataKey, before, JSON.parse(JSON.stringify(data)));
    if (viewMode === 'list') _refreshList();
    const id = entryId(entry);
    return id != null ? [entry[0], id] : [entry[0]];
  }

  /* Edit a word on behalf of the section view, identified by its current word/id.
     Ripples the rename to every section reference.
     Returns the new reference, or null if no matching entry was found. */
  function _updateEntryByRef(oldWord, oldId, word, pos, def) {
    const idx = data.findIndex(e => e[0] === oldWord && entryId(e) === oldId);
    if (idx === -1) return null;
    const before = JSON.parse(JSON.stringify(data));
    const newEntry = [word, pos, def];
    if (oldId != null) newEntry.push(oldId);
    else if (data.some((e, i) => i !== idx && e[0] === word && entryId(e) == null)) {
      newEntry.push(_nextId()); // a rename turned this into a duplicate
    }
    data[idx] = newEntry;
    data.sort(_cmpEntries);
    save(dataKey, data);
    pushUndo(dataKey, before, JSON.parse(JSON.stringify(data)));
    const newId = entryId(newEntry);
    if (oldWord !== word || oldId !== newId) sectionView?.updateRef(oldWord, oldId, word, newId);
    if (viewMode === 'list') _refreshList();
    revealHidden(document.querySelector(`[data-entry-idx="${idx}"]`)); // stays visible past the rebuild
    return newId != null ? [newEntry[0], newId] : [newEntry[0]];
  }

  /* ── undo callback for this page (handles both datasets) ── */
  registerUndoCallback((dk, restored) => {
    if (dk === dataKey) { data = restored; _refreshList(); return; }
    sectionView?.handleUndo(dk, restored);
  });

  /* ── HTML builders ── */

  function _kwModalHTML() {
    const rows = kwTable.map(([kw, desc]) =>
      `<tr><td>${esc(kw)}</td><td>${esc(desc)}</td></tr>`
    ).join('');
    return `
      <div class="overlay" id="kw-overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="kw-title">
          <div class="modal-head">
            <div class="modal-title" id="kw-title">Keywords</div>
            <button class="btn btn-sm btn-ghost" id="kw-close">✕</button>
          </div>
          <p class="kw-intro">
            Use these keywords to refine your search. Without any keyword, the default is
            to match the word string itself, prioritizing entries that begin with your query.</br>
            The search bar accepts regex, but <code>*</code> means "any letter" (use
            <code>\\*</code> for a literal asterisk).
          </p>
          <table class="kw-table">
            <thead><tr><th>keyword</th><th>description</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function _entryHTML(entry, realIdx) {
    const posSpan = entry[1]
      ? `<span class="dict-pos">${esc(entry[1])} </span>` : '';

    const actions = AUTH.isLoggedIn() ? `
      <div class="entry-actions">
        <button class="btn btn-sm btn-ghost" data-edit="${realIdx}">edit</button>
        <button class="btn btn-sm btn-danger" data-delete="${realIdx}">×</button>
      </div>` : '';

    const posEditField = AUTH.isLoggedIn()
      ? `<input class="form-input" style="width:80px;flex-shrink:0"
           data-edit-pos="${realIdx}" value="${esc(entry[1])}" placeholder="pos." />` : '';

    const editForm = AUTH.isLoggedIn() ? `
      <div class="edit-collapse" data-edit-form="${realIdx}">
        <div class="edit-collapse-inner">
          <div class="entry-edit-row">
            <input class="form-input" style="width:130px;flex-shrink:0"
              data-edit-word="${realIdx}" value="${esc(entry[0])}" />
            ${posEditField}
            <input class="form-input" style="flex:1;min-width:120px"
              data-edit-def="${realIdx}" value="${esc(entry[2])}" />
            <button class="btn btn-primary btn-sm" data-edit-save="${realIdx}">save</button>
            <button class="btn btn-sm" data-edit-cancel="${realIdx}">cancel</button>
          </div>
        </div>
      </div>` : '';

    const wKey = esc(hideKeyForEntry(entry[0], entryId(entry), 'word'));
    const dKey = esc(hideKeyForEntry(entry[0], entryId(entry), 'def'));
    return `
      <div class="dict-entry-wrapper" data-entry-idx="${realIdx}">
        <div class="dict-entry">
          <span class="dict-word" data-hide-key="${wKey}">${esc(entry[0])}</span>
          <span class="dict-body" data-hide-key="${dKey}">${posSpan}${withSnippets(esc(entry[2]))}</span>
          ${actions}
        </div>
        ${editForm}
      </div>`;
  }

  function _addFormHTML() {
    return `
      <div class="edit-collapse" id="add-form-collapse">
        <div class="edit-collapse-inner">
          <div class="add-form">
            ${wordFieldsHTML({ word: 'add-word', pos: 'add-pos', def: 'add-def' })}
            <div class="form-actions">
              <button class="btn btn-primary btn-sm" id="add-save-btn">add</button>
              <button class="btn btn-sm" id="add-cancel-btn">cancel</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function _listHTML() {
    const filtered = filterEntries(data, query);
    if (filtered.length === 0) return `<div class="no-results">No words found.</div>`;
    return filtered.map(e => _entryHTML(e, data.indexOf(e))).join('');
  }

  /* segmented list/section toggle */
  function _toggleHTML() {
    const on = m => viewMode === m ? ' active' : '';
    return `
      <div class="view-toggle" role="tablist" aria-label="view mode">
        <button class="view-toggle-btn${on('list')}" data-view="list" role="tab"
          aria-selected="${viewMode === 'list'}">${SVG_LIST}<span>list</span></button>
        <button class="view-toggle-btn${on('section')}" data-view="section" role="tab"
          aria-selected="${viewMode === 'section'}">${SVG_SECTION}<span>section</span></button>
      </div>`;
  }

  /* list-mode body: search bar, add controls, entry list */
  function _listModeHTML() {
    const addControls = AUTH.isLoggedIn() ? `
      <button class="btn btn-sm" id="dict-add-btn" data-tooltip="coin a word (Ctrl++)">+ add word</button>
      ${_addFormHTML()}` : '';
    return `
      <div class="search-row">
        <input class="search-input" id="search-input" type="text"
          placeholder="search…" value="${esc(query)}"
          autocomplete="off" spellcheck="false" />
        <button class="search-help" id="search-help-btn"
          aria-label="Search keywords" data-tooltip="Search keywords">${SVG_QUESTION}</button>
      </div>
      ${addControls}
      <div id="entry-list">${_listHTML()}</div>`;
  }

  function _pageHTML() {
    return `
      <main class="page">
        <div class="page-header">
          <h1 class="page-title">Meuvid</h1>
          ${_toggleHTML()}
        </div>
        <div id="dict-content"></div>
      </main>`;
  }

  /* ── event binding ── */

  function _bindListEvents() {
    /* open edit form — pure DOM toggle, no render() */
    document.querySelectorAll('[data-edit]').forEach(btn =>
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.edit);
        /* close any currently open edit form first */
        document.querySelectorAll('.dict-entry-wrapper.editing').forEach(w => {
          w.classList.remove('editing');
          const f = w.querySelector('.edit-collapse');
          f?.classList.remove('open');
          discardEditDraft(f);
        });
        const wrapper  = document.querySelector(`[data-entry-idx="${idx}"]`);
        const editForm = document.querySelector(`[data-edit-form="${idx}"]`);
        if (wrapper && editForm) {
          revealHidden(wrapper);
          wrapper.classList.add('editing');
          editForm.classList.add('open');
          /* focus first input after visibility transition clears (see CSS 0s delay) */
          const first = editForm.querySelector('.form-input');
          if (first) setTimeout(() => first.focus(), 20);
        }
      })
    );

    /* cancel edit */
    document.querySelectorAll('[data-edit-cancel]').forEach(btn =>
      btn.addEventListener('click', async e => {
        if (!await guardDiscard(document.querySelector(`[data-edit-form="${btn.dataset.editCancel}"]`), e)) return;
        const idx      = parseInt(btn.dataset.editCancel);
        const wrapper  = document.querySelector(`[data-entry-idx="${idx}"]`);
        const editForm = document.querySelector(`[data-edit-form="${idx}"]`);
        wrapper?.classList.remove('editing');
        editForm?.classList.remove('open');
        discardEditDraft(editForm);
      })
    );

    /* save edit */
    document.querySelectorAll('[data-edit-save]').forEach(btn =>
      btn.addEventListener('click', () => {
        const idx  = parseInt(btn.dataset.editSave);
        const word = (document.querySelector(`[data-edit-word="${idx}"]`)?.value || '').trim();
        const pos  = (document.querySelector(`[data-edit-pos="${idx}"]`)?.value  || '').trim();
        const def  = (document.querySelector(`[data-edit-def="${idx}"]`)?.value  || '').trim();
        if (!word || !def) return;
        _updateEntryByRef(data[idx][0], entryId(data[idx]), word, pos, def);
      })
    );

    /* Enter in edit inputs → trigger save */
    document.querySelectorAll('[data-edit-word], [data-edit-pos], [data-edit-def]').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const idx = input.dataset.editWord ?? input.dataset.editPos ?? input.dataset.editDef;
        document.querySelector(`[data-edit-save="${idx}"]`)?.click();
      });
    });

    /* delete */
    document.querySelectorAll('[data-delete]').forEach(btn =>
      btn.addEventListener('click', async e => {
        const idx  = parseInt(btn.dataset.delete);
        const word = data[idx]?.[0] || '';
        revealHidden(document.querySelector(`[data-entry-idx="${idx}"]`));
        if (!await showConfirm(`Delete "${word}"?`, 'delete', e)) return;
        const before = JSON.parse(JSON.stringify(data));
        data = data.filter((_, i) => i !== idx);
        save(dataKey, data);
        pushUndo(dataKey, before, JSON.parse(JSON.stringify(data)));
        _refreshList();
      })
    );
  }

  /* toggle between list and section views */
  function _bindToggleEvents() {
    document.querySelectorAll('.view-toggle-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        const mode = btn.dataset.view;
        if (mode === viewMode) return;
        viewMode = mode;
        save('dict-view', viewMode);
        document.querySelectorAll('.view-toggle-btn').forEach(b => {
          const on = b.dataset.view === viewMode;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', on);
        });
        _renderContent();
      })
    );
  }

  /* render the active view into #dict-content */
  function _renderContent() {
    const c = document.getElementById('dict-content');
    if (!c) return;
    if (viewMode === 'section' && sectionView) {
      // pick up edits made elsewhere (e.g. another tab) since page load
      data = load(dataKey, dataRaw).sort(_cmpEntries);
      sectionView.render(c); // applies hiding itself
      return;
    }
    c.innerHTML = _listModeHTML();
    _bindListModeEvents();
    applyHiding(c);
    const si = document.getElementById('search-input');
    if (si) { const l = si.value.length; si.focus(); si.setSelectionRange(l, l); }
  }

  function _bindListModeEvents() {
    /* search — debounced so the list isn't rebuilt on every keystroke */
    const si = document.getElementById('search-input');
    if (si) {
      let _searchTimer = null;
      si.addEventListener('input', e => {
        query = e.target.value;
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(_refreshList, 120);
      });
    }

    /* keywords modal */
    const helpBtn = document.getElementById('search-help-btn');
    if (helpBtn) helpBtn.addEventListener('click', () => {
      showKwModal = true;
      document.getElementById('modal-container').innerHTML = _kwModalHTML();
      _bindKwModalEvents();
    });

    /* add form */
    const addBtn = document.getElementById('dict-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => {
      const collapse = document.getElementById('add-form-collapse');
      collapse?.classList.add('open');
      const first = collapse?.querySelector('.form-input');
      addBtn.style.display = 'none';
      if (first) setTimeout(() => first.focus(), 20);
    });

    const addCancel = document.getElementById('add-cancel-btn');
    if (addCancel) addCancel.addEventListener('click', async e => {
      if (!await guardDiscard(document.getElementById('add-form-collapse'), e)) return;
      document.getElementById('add-form-collapse')?.classList.remove('open');
      if (addBtn) addBtn.style.display = '';
    });

    const addSave = document.getElementById('add-save-btn');
    if (addSave) addSave.addEventListener('click', () => {
      const word = (document.getElementById('add-word')?.value || '').trim();
      const pos  = (document.getElementById('add-pos')?.value  || '').trim();
      const def  = (document.getElementById('add-def')?.value  || '').trim();
      if (!word || !def) return;
      const before = JSON.parse(JSON.stringify(data));
      data = [...data, _entryWithId([word, pos, def])]
               .sort(_cmpEntries);
      save(dataKey, data);
      pushUndo(dataKey, before, JSON.parse(JSON.stringify(data)));
      /* clear inputs and refocus for the next entry — form stays open */
      ['add-word', 'add-pos', 'add-def'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      setTimeout(() => document.getElementById('add-word')?.focus(), 20);
      _refreshList();
    });

    /* Enter in add-form inputs → trigger add */
    ['add-word', 'add-pos', 'add-def'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('add-save-btn')?.click();
      });
    });

    _bindListEvents();
  }

  function _bindKwModalEvents() {
    const closeKw = () => {
      showKwModal = false;
      document.getElementById('modal-container').innerHTML = '';
    };
    const closeBtn = document.getElementById('kw-close');
    const overlay  = document.getElementById('kw-overlay');
    if (closeBtn) closeBtn.addEventListener('click', closeKw);
    if (overlay)  overlay.addEventListener('click', e => { if (e.target === overlay) closeKw(); });
    const onKey = e => { if (e.key === 'Escape') { closeKw(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }

  /* ── partial list refresh (keeps search focus) ── */
  function _refreshList() {
    const el = document.getElementById('entry-list');
    if (!el) return;
    el.innerHTML = _listHTML();
    _bindListEvents();
    applyHiding(el);
  }

  /* ── public render ── */
  function render() {
    document.getElementById('app').innerHTML = _pageHTML();
    _bindToggleEvents();
    _renderContent();
  }

  return { render };
}
