/* ================================================================
   dict.js — dictionary and roots page (configurable)
   Depends on: data.js, utils.js, auth.js
   ================================================================ */

/**
 * Create a dictionary/roots page.
 *
 * @param {object} cfg
 * @param {boolean}  cfg.hasPos     - true for dictionary (has POS field), false for roots
 * @param {string}   cfg.dataKey    - localStorage key, e.g. 'mv_dict'
 * @param {Array[]}  cfg.dataRaw    - fallback data array
 * @param {Array[]}  cfg.kwTable    - keywords table (DICT_KEYWORDS or ROOTS_KEYWORDS)
 * @param {string}   cfg.label      - singular label, e.g. 'word' or 'root'
 * @param {string}   cfg.noun       - plural label, e.g. 'words' or 'roots'
 *
 * @returns {{ render: Function }}
 */
function createDictPage(cfg) {
  const { hasPos, dataKey, dataRaw, kwTable, label, noun } = cfg;

  /* ── page-local state ── */
  let data        = load(dataKey, dataRaw);
  let query       = '';
  let showKwModal = false;

  /* ── undo callback for this page ── */
  registerUndoCallback((dk, restored) => {
    if (dk !== dataKey) return;
    data = restored;
    _refreshList();
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
            to match the word string itself, prioritizing entries that begin with your query.
          </p>
          <table class="kw-table">
            <thead><tr><th>keyword</th><th>description</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function _entryHTML(entry, realIdx) {
    const posSpan = (hasPos && entry[1])
      ? `<span class="dict-pos">${esc(entry[1])} </span>` : '';

    const actions = AUTH.isLoggedIn() ? `
      <div class="entry-actions">
        <button class="btn btn-sm btn-ghost" data-edit="${realIdx}">edit</button>
        <button class="btn btn-sm btn-danger" data-delete="${realIdx}">×</button>
      </div>` : '';

    const posEditField = (AUTH.isLoggedIn() && hasPos)
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
              data-edit-def="${realIdx}" value="${esc(entry[hasPos ? 2 : 1])}" />
            <button class="btn btn-primary btn-sm" data-edit-save="${realIdx}">save</button>
            <button class="btn btn-sm" data-edit-cancel="${realIdx}">cancel</button>
          </div>
        </div>
      </div>` : '';

    return `
      <div class="dict-entry-wrapper" data-entry-idx="${realIdx}">
        <div class="dict-entry">
          <span class="dict-word">${esc(entry[0])}</span>
          <span class="dict-body">${posSpan}${esc(entry[hasPos ? 2 : 1])}</span>
          ${actions}
        </div>
        ${editForm}
      </div>`;
  }

  function _addFormHTML() {
    const posField = hasPos ? `
      <div class="form-group" style="flex-grow:0;min-width:85px">
        <label class="form-label">pos</label>
        <input class="form-input" id="add-pos" placeholder="n." />
      </div>` : '';
    return `
      <div class="edit-collapse" id="add-form-collapse">
        <div class="edit-collapse-inner">
          <div class="add-form">
            <div class="add-form-title">New ${label}</div>
            <div class="form-row">
              <div class="form-group" style="flex-grow:0;min-width:130px">
                <label class="form-label">${label}</label>
                <input class="form-input" id="add-word" placeholder="vid" />
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
          </div>
        </div>
      </div>`;
  }

  function _listHTML() {
    const filtered = filterEntries(data, query, hasPos);
    if (filtered.length === 0) return `<div class="no-results">No ${noun} found.</div>`;
    return filtered.map(e => _entryHTML(e, data.indexOf(e))).join('');
  }

  function _pageHTML() {
    const addControls = AUTH.isLoggedIn() ? `
      <button class="btn btn-sm" id="dict-add-btn">+ add ${label}</button>
      ${_addFormHTML()}` : '';

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
          ${addControls}
        </div>
        <div id="entry-list">${_listHTML()}</div>
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
          w.querySelector('.edit-collapse')?.classList.remove('open');
        });
        const wrapper  = document.querySelector(`[data-entry-idx="${idx}"]`);
        const editForm = document.querySelector(`[data-edit-form="${idx}"]`);
        if (wrapper && editForm) {
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
      btn.addEventListener('click', () => {
        const idx      = parseInt(btn.dataset.editCancel);
        const wrapper  = document.querySelector(`[data-entry-idx="${idx}"]`);
        const editForm = document.querySelector(`[data-edit-form="${idx}"]`);
        wrapper?.classList.remove('editing');
        editForm?.classList.remove('open');
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
        const before = JSON.parse(JSON.stringify(data));
        data[idx] = hasPos ? [word, pos, def] : [word, def];
        save(dataKey, data);
        pushUndo(dataKey, before, JSON.parse(JSON.stringify(data)));
        _refreshList();
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
      btn.addEventListener('click', async () => {
        const idx  = parseInt(btn.dataset.delete);
        const word = data[idx]?.[0] || '';
        if (!await showConfirm(`Delete "${word}"?`, 'delete')) return;
        const before = JSON.parse(JSON.stringify(data));
        data = data.filter((_, i) => i !== idx);
        save(dataKey, data);
        pushUndo(dataKey, before, JSON.parse(JSON.stringify(data)));
        _refreshList();
      })
    );
  }

  function _bindPageEvents() {
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
      if (first) setTimeout(() => first.focus(), 20);
    });

    const addCancel = document.getElementById('add-cancel-btn');
    if (addCancel) addCancel.addEventListener('click', () => {
      document.getElementById('add-form-collapse')?.classList.remove('open');
    });

    const addSave = document.getElementById('add-save-btn');
    if (addSave) addSave.addEventListener('click', () => {
      const word = (document.getElementById('add-word')?.value || '').trim();
      const pos  = (document.getElementById('add-pos')?.value  || '').trim();
      const def  = (document.getElementById('add-def')?.value  || '').trim();
      if (!word || !def) return;
      const before = JSON.parse(JSON.stringify(data));
      data = [...data, hasPos ? [word, pos, def] : [word, def]]
               .sort((a, b) => a[0].localeCompare(b[0]));
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
