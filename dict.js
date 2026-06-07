/* ================================================================
   dict.js — dictionary and roots page (configurable)
   Depends on: data.js, utils.js, auth.js
   ================================================================ */

/**
 * Create a dictionary/roots page.
 *
 * @param {object} cfg
 * @param {boolean}  cfg.hasPos       - true for dictionary (has POS field), false for roots
 * @param {string}   cfg.dataKey      - localStorage key, e.g. 'mv_dict'
 * @param {Array[]}  cfg.defaultData  - fallback data array
 * @param {Array[]}  cfg.kwTable      - keywords table (DICT_KEYWORDS or ROOTS_KEYWORDS)
 * @param {string}   cfg.label        - singular label, e.g. 'word' or 'root'
 * @param {string}   cfg.noun         - plural label, e.g. 'words' or 'roots'
 *
 * @returns {{ render: Function }}
 */
function createDictPage(cfg) {
  const { hasPos, dataKey, defaultData, kwTable, label, noun } = cfg;

  /* ── page-local state ── */
  let data        = load(dataKey, defaultData);
  let query       = '';
  let showKwModal = false;
  let showAddForm = false;
  let editIdx     = -1;

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
            to match the word string itself, prioritising entries that begin with your query.
          </p>
          <table class="kw-table">
            <thead><tr><th>keyword</th><th>description</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function _entryHTML(entry, realIdx) {
    if (editIdx === realIdx) {
      const posField = hasPos
        ? `<input class="form-input" style="width:80px;flex-shrink:0"
             id="edit-pos" value="${esc(entry[1])}" placeholder="pos." />`
        : '';
      return `
        <div class="entry-edit-row">
          <input class="form-input" style="width:130px;flex-shrink:0"
            id="edit-word" value="${esc(entry[0])}" />
          ${posField}
          <input class="form-input" style="flex:1;min-width:120px"
            id="edit-def" value="${esc(entry[hasPos ? 2 : 1])}" />
          <button class="btn btn-primary btn-sm" id="edit-save-btn">save</button>
          <button class="btn btn-sm" id="edit-cancel-btn">cancel</button>
        </div>`;
    }

    const posSpan = (hasPos && entry[1])
      ? `<span class="dict-pos">${esc(entry[1])} </span>` : '';
    const actions = AUTH.isLoggedIn() ? `
      <div class="entry-actions">
        <button class="btn btn-sm btn-ghost" data-edit="${realIdx}">edit</button>
        <button class="btn btn-sm btn-danger" data-delete="${realIdx}">×</button>
      </div>` : '';

    return `
      <div class="dict-entry">
        <span class="dict-word">${esc(entry[0])}</span>
        <span class="dict-body">${posSpan}${esc(entry[hasPos ? 2 : 1])}</span>
        ${actions}
      </div>`;
  }

  function _addFormHTML() {
    const posField = hasPos ? `
      <div class="form-group" style="flex-grow:0;min-width:85px">
        <label class="form-label">pos</label>
        <input class="form-input" id="add-pos" placeholder="n." />
      </div>` : '';
    return `
      <div class="add-form">
        <div class="add-form-title">New ${label}</div>
        <div class="form-row">
          <div class="form-group" style="flex-grow:0;min-width:130px">
            <label class="form-label">${label}</label>
            <input class="form-input" id="add-word"
              placeholder="${hasPos ? 'auzme' : 'auz'}" />
          </div>
          ${posField}
          <div class="form-group" style="flex:1;min-width:120px">
            <label class="form-label">definition</label>
            <input class="form-input" id="add-def" placeholder="meaning…" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary btn-sm" id="add-save-btn">add</button>
          <button class="btn btn-sm" id="add-cancel-btn">cancel</button>
        </div>
      </div>`;
  }

  function _listHTML() {
    const filtered = filterEntries(data, query, hasPos);
    if (filtered.length === 0) return `<div class="no-results">No ${noun} found.</div>`;
    return filtered.map(e => _entryHTML(e, data.indexOf(e))).join('');
  }

  function _pageHTML() {
    const addBtn  = AUTH.isLoggedIn() && !showAddForm
      ? `<button class="btn btn-sm" id="dict-add-btn">+ add ${label}</button>` : '';
    const addForm = AUTH.isLoggedIn() && showAddForm ? _addFormHTML() : '';

    return `
      <main class="page">
        <div class="page-header">
          <h1 class="page-title">Meuvid</h1>
          <div class="search-row">
            <input class="search-input" id="search-input" type="text"
              placeholder="search…" value="${esc(query)}"
              autocomplete="off" spellcheck="false" />
            <button class="search-help" id="search-help-btn"
              title="Search keywords">${SVG_QUESTION}</button>
          </div>
          ${addBtn}${addForm}
        </div>
        <div id="entry-list">${_listHTML()}</div>
      </main>`;
  }

  /* ── event binding ── */

  function _bindListEvents() {
    document.querySelectorAll('[data-edit]').forEach(btn =>
      btn.addEventListener('click', () => {
        editIdx = parseInt(btn.dataset.edit);
        render();
      })
    );

    document.querySelectorAll('[data-delete]').forEach(btn =>
      btn.addEventListener('click', () => {
        const idx  = parseInt(btn.dataset.delete);
        const word = data[idx]?.[0] || '';
        if (!confirm(`Delete "${word}"?`)) return;
        data = data.filter((_, i) => i !== idx);
        save(dataKey, data);
        if (editIdx === idx) editIdx = -1;
        _refreshList();
      })
    );

    const editSave = document.getElementById('edit-save-btn');
    if (editSave) editSave.addEventListener('click', () => {
      const word = (document.getElementById('edit-word')?.value || '').trim();
      const pos  = (document.getElementById('edit-pos')?.value  || '').trim();
      const def  = (document.getElementById('edit-def')?.value  || '').trim();
      if (!word || !def) return;
      data[editIdx] = hasPos ? [word, pos, def] : [word, def];
      save(dataKey, data);
      editIdx = -1;
      render();
    });

    const editCancel = document.getElementById('edit-cancel-btn');
    if (editCancel) editCancel.addEventListener('click', () => { editIdx = -1; render(); });
  }

  function _bindPageEvents() {
    /* search */
    const si = document.getElementById('search-input');
    if (si) si.addEventListener('input', e => { query = e.target.value; _refreshList(); });

    /* keywords modal */
    const helpBtn = document.getElementById('search-help-btn');
    if (helpBtn) helpBtn.addEventListener('click', () => {
      showKwModal = true;
      document.getElementById('modal-container').innerHTML = _kwModalHTML();
      _bindKwModalEvents();
    });

    /* add form */
    const addBtn = document.getElementById('dict-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => { showAddForm = true; render(); });

    const addCancel = document.getElementById('add-cancel-btn');
    if (addCancel) addCancel.addEventListener('click', () => { showAddForm = false; render(); });

    const addSave = document.getElementById('add-save-btn');
    if (addSave) addSave.addEventListener('click', () => {
      const word = (document.getElementById('add-word')?.value || '').trim();
      const pos  = (document.getElementById('add-pos')?.value  || '').trim();
      const def  = (document.getElementById('add-def')?.value  || '').trim();
      if (!word || !def) return;
      data = [...data, hasPos ? [word, pos, def] : [word, def]]
               .sort((a, b) => a[0].localeCompare(b[0]));
      save(dataKey, data);
      showAddForm = false;
      render();
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
  }

  /* ── public render ── */
  function render() {
    document.getElementById('app').innerHTML = _pageHTML();
    _bindPageEvents();
    // Restore search focus
    const si = document.getElementById('search-input');
    if (si) { const l = si.value.length; si.focus(); si.setSelectionRange(l, l); }
  }

  return { render };
}
