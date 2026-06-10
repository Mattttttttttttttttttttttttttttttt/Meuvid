/* ================================================================
   textpage.js — grammar / phonetics / philosophy pages (configurable)
   Depends on: utils.js, auth.js
   ================================================================ */

/**
 * Create a text-content page.
 *
 * @param {object}   cfg
 * @param {string}   cfg.dataKey   - localStorage key, e.g. 'mv_grammar'
 * @param {string[]} cfg.dataRaw   - fallback paragraph array
 *
 * Data format:
 *   '# Heading'    → rendered as <h1>
 *   '\\# Text'     → rendered as <p> showing literal "# Text"
 *   'Anything else' → rendered as <p>
 *
 * @returns {{ render: Function }}
 */
function createTextPage(cfg) {
  const { dataKey } = cfg;

  /* ── page-local state ── */
  let data = load(dataKey, cfg.dataRaw);
  let _editSnapshot = null; // set when a para edit form opens; cleared on save/cancel/delete

  /* ── undo callback for this page ── */
  registerUndoCallback((dk, restored) => {
    if (dk !== dataKey) return;
    data = restored;
    _refreshBody();
  });

  /* ── HTML for a single paragraph ── */
  function _paraHTML(para, idx) {
    const isHead = para.startsWith('# ');
    const isEsc = !isHead && para[0] === '\\' && para[1] === '#' && para[2] === ' ';

    let tag, text, displayVal;
    if (isHead) { tag = 'h1'; text = para.slice(2); displayVal = text; }
    else if (isEsc) { tag = 'p'; text = '# ' + para.slice(3); displayVal = para.slice(3); }
    else { tag = 'p'; text = para; displayVal = para; }

    const editBtn = AUTH.isLoggedIn()
      ? `<button class="btn btn-sm btn-ghost para-edit-btn"
           data-para-edit="${idx}" style="margin-bottom:4px">edit</button>`
      : '';

    const editForm = AUTH.isLoggedIn() ? `
      <div class="edit-collapse para-edit-collapse" data-para-edit-form="${idx}">
        <div class="edit-collapse-inner">
          <div class="inline-edit">
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
              <span style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;
                           color:var(--text-3)">type</span>
              <select class="form-select"
                style="width:auto;padding:4px 10px;font-size:14px"
                data-para-type-sel="${idx}">
                <option value="h1"${isHead ? ' selected' : ''}>heading</option>
                <option value="p" ${!isHead ? ' selected' : ''}>paragraph</option>
              </select>
            </div>
            <textarea class="form-textarea" data-para-ta="${idx}"
              rows="4">${esc(displayVal)}</textarea>
            <div class="form-actions">
              <button class="btn btn-primary btn-sm" data-para-save="${idx}">save</button>
              <button class="btn btn-sm"             data-para-cancel="${idx}">cancel</button>
              <button class="btn btn-sm"             data-para-up="${idx}"   title="move up">↑</button>
              <button class="btn btn-sm"             data-para-down="${idx}" title="move down">↓</button>
              <button class="btn btn-sm btn-danger"  data-para-del="${idx}">delete</button>
              <span style="flex:1"></span>
              <button class="btn btn-sm btn-ghost" data-fmt-b="${idx}" title="Bold (Ctrl+B)"      style="font-weight:600">B</button>
              <button class="btn btn-sm btn-ghost" data-fmt-i="${idx}" title="Italic (Ctrl+I)"    style="font-style:italic">I</button>
              <button class="btn btn-sm btn-ghost" data-fmt-u="${idx}" title="Underline (Ctrl+U)" style="text-decoration:underline;text-underline-offset:2px">U</button>
            </div>
          </div>
        </div>
      </div>` : '';

    return `
      <div class="para-block" data-para-idx="${idx}">
        <div class="para-content">
          <${tag}>${text}</${tag}>
          ${editBtn}
        </div>
        ${editForm}
      </div>`;
  }

  /* ── full page HTML ── */
  function _pageHTML() {
    const paras = data.map((p, i) => _paraHTML(p, i)).join('');

    let editControls = '';
    if (AUTH.isLoggedIn()) {
      editControls = `
        <div class="section-actions">
          <button class="btn btn-sm" id="text-add-btn">+ add paragraph</button>
          <button class="btn btn-sm" id="text-raw-btn">raw edit</button>
        </div>
        <div class="edit-collapse" id="add-form-collapse">
          <div class="edit-collapse-inner">
            <div class="add-form">
              <div class="add-form-title">New entry</div>
              <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
                <span style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;
                             color:var(--text-3)">type</span>
                <select class="form-select"
                  style="width:auto;padding:4px 10px;font-size:14px" id="new-para-type">
                  <option value="p">paragraph</option>
                  <option value="h1">heading</option>
                </select>
              </div>
              <textarea class="form-textarea" id="new-para-ta" rows="4"
                placeholder="Paragraph text…"></textarea>
              <div class="form-actions">
                <button class="btn btn-primary btn-sm" id="new-para-save">add</button>
                <button class="btn btn-sm"             id="new-para-cancel">cancel</button>
              </div>
            </div>
          </div>
        </div>
        <div class="edit-collapse" id="raw-form-collapse">
          <div class="edit-collapse-inner">
            <div class="add-form">
              <div class="add-form-title">
                Raw edit — paragraphs separated by blank lines; headings start with "# "
              </div>
              <textarea class="form-textarea raw-edit-area" id="raw-edit-ta"
                rows="16" spellcheck="false"></textarea>
              <div class="form-actions">
                <button class="btn btn-primary btn-sm" id="raw-apply-btn">apply</button>
                <button class="btn btn-sm"             id="raw-cancel-btn">cancel</button>
              </div>
            </div>
          </div>
        </div>`;
    }

    return `
      <main class="page">
        <div class="page-header">
          <h1 class="page-title">Meuvid</h1>
          ${editControls}
        </div>
        <div class="text-body" id="text-body">${paras}</div>
      </main>`;
  }

  /* ── event binding ── */

  /** Rebuild only #text-body and re-attach paragraph events (cheaper than full render). */
  function _refreshBody() {
    const el = document.getElementById('text-body');
    if (!el) return;
    el.innerHTML = data.map((p, i) => _paraHTML(p, i)).join('');
    _bindParaEditEvents();
  }

  /**
   * After a move, re-open the edit form at newIdx and scroll the viewport so the form
   * appears at the same screen position it occupied before the move.
   * focusSel: CSS selector for the element to focus within the form (default: textarea).
   */
  function _reopenParaEdit(newIdx, oldFormTop, focusSel) {
    const block = document.querySelector(`[data-para-idx="${newIdx}"]`);
    const editForm = document.querySelector(`[data-para-edit-form="${newIdx}"]`);
    if (!block || !editForm) return;
    block.classList.add('editing');
    editForm.classList.add('open');
    if (oldFormTop !== null) {
      const delta = editForm.getBoundingClientRect().top - oldFormTop;
      window.scrollBy({ top: delta, behavior: 'instant' });
    }
    const focusEl = editForm.querySelector(focusSel || '.form-textarea');
    if (focusEl) setTimeout(() => focusEl.focus(), 20);
  }

  /** Bind per-paragraph open/cancel/save/move/delete. Called from _bindEvents and _refreshBody. */
  function _bindParaEditEvents() {
    /* open edit form — snapshot data so cancel/Escape can fully revert moves */
    document.querySelectorAll('[data-para-edit]').forEach(btn =>
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.paraEdit);
        /* close any currently open para edit */
        document.querySelectorAll('.para-block.editing').forEach(b => {
          b.classList.remove('editing');
          b.querySelector('.para-edit-collapse')?.classList.remove('open');
        });
        const block = document.querySelector(`[data-para-idx="${idx}"]`);
        const editForm = document.querySelector(`[data-para-edit-form="${idx}"]`);
        if (block && editForm) {
          block.classList.add('editing');
          editForm.classList.add('open');
          _editSnapshot = [...data];
          setEscCleanup(() => { data = _editSnapshot; _editSnapshot = null; _refreshBody(); });
          const ta = editForm.querySelector('.form-textarea');
          if (ta) setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 20);
        }
      })
    );

    /* cancel — revert any in-session moves by restoring the snapshot */
    document.querySelectorAll('[data-para-cancel]').forEach(btn =>
      btn.addEventListener('click', () => {
        clearEscCleanup();
        if (_editSnapshot !== null) {
          data = _editSnapshot;
          _editSnapshot = null;
          _refreshBody(); // rebuilds DOM with original order, all forms closed
        } else {
          const idx = parseInt(btn.dataset.paraCancel);
          document.querySelector(`[data-para-idx="${idx}"]`)?.classList.remove('editing');
          document.querySelector(`[data-para-edit-form="${idx}"]`)?.classList.remove('open');
        }
      })
    );

    /* save — before-state covers the whole session (moves + text change) */
    document.querySelectorAll('[data-para-save]').forEach(btn =>
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.paraSave);
        const type = document.querySelector(`[data-para-type-sel="${i}"]`)?.value || 'p';
        const text = (document.querySelector(`[data-para-ta="${i}"]`)?.value || '').trim();
        if (!text) return;
        const before = _editSnapshot ?? [...data];
        data[i] = type === 'h1' ? '# ' + text : text;
        save(dataKey, data);
        pushUndo(dataKey, before, [...data]);
        _editSnapshot = null;
        clearEscCleanup();
        _refreshBody();
      })
    );

    /* move up — in-session only; not written to storage until save/delete */
    document.querySelectorAll('[data-para-up]').forEach(btn =>
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.paraUp);
        if (i <= 0) return;
        const oldForm = document.querySelector(`[data-para-edit-form="${i}"]`);
        const oldFormTop = oldForm ? oldForm.getBoundingClientRect().top : null;
        [data[i], data[i - 1]] = [data[i - 1], data[i]];
        _refreshBody();
        _reopenParaEdit(i - 1, oldFormTop, '[data-para-up]');
      })
    );

    /* move down — same, not committed until save/delete */
    document.querySelectorAll('[data-para-down]').forEach(btn =>
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.paraDown);
        if (i >= data.length - 1) return;
        const oldForm = document.querySelector(`[data-para-edit-form="${i}"]`);
        const oldFormTop = oldForm ? oldForm.getBoundingClientRect().top : null;
        [data[i], data[i + 1]] = [data[i + 1], data[i]];
        _refreshBody();
        _reopenParaEdit(i + 1, oldFormTop, '[data-para-down]');
      })
    );

    /* delete — commits pending moves along with the deletion as one undo entry */
    document.querySelectorAll('[data-para-del]').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!await showConfirm('Delete this paragraph?', 'delete')) return;
        const i      = parseInt(btn.dataset.paraDel);
        const before = _editSnapshot ?? [...data];
        data = data.filter((_, idx) => idx !== i);
        save(dataKey, data);
        pushUndo(dataKey, before, [...data]);
        _editSnapshot = null;
        clearEscCleanup();
        _refreshBody();
      })
    );

    /* B/I/U formatting buttons */
    document.querySelectorAll('[data-fmt-b]').forEach(btn =>
      btn.addEventListener('click', () => {
        const ta = document.querySelector(`[data-para-ta="${btn.dataset.fmtB}"]`);
        if (ta) wrapSelectedText(ta, '<b>', '</b>');
      })
    );
    document.querySelectorAll('[data-fmt-i]').forEach(btn =>
      btn.addEventListener('click', () => {
        const ta = document.querySelector(`[data-para-ta="${btn.dataset.fmtI}"]`);
        if (ta) wrapSelectedText(ta, '<i>', '</i>');
      })
    );
    document.querySelectorAll('[data-fmt-u]').forEach(btn =>
      btn.addEventListener('click', () => {
        const ta = document.querySelector(`[data-para-ta="${btn.dataset.fmtU}"]`);
        if (ta) wrapSelectedText(ta, '<u>', '</u>');
      })
    );

    /* Ctrl+Enter to save; Ctrl+B/I/U for inline formatting — on each para textarea */
    document.querySelectorAll('[data-para-ta]').forEach(ta => {
      ta.addEventListener('keydown', e => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key === 'Enter') { e.preventDefault(); document.querySelector(`[data-para-save="${ta.dataset.paraTa}"]`)?.click(); }
        if (ctrl && e.key === 'b') { e.preventDefault(); wrapSelectedText(ta, '<b>', '</b>'); }
        if (ctrl && e.key === 'i') { e.preventDefault(); wrapSelectedText(ta, '<i>', '</i>'); }
        if (ctrl && e.key === 'u') { e.preventDefault(); wrapSelectedText(ta, '<u>', '</u>'); }
      });
    });
  }

  function _bindEvents() {
    /* toggle add-form */
    const addBtn = document.getElementById('text-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => {
      const addCollapse = document.getElementById('add-form-collapse');
      const rawCollapse = document.getElementById('raw-form-collapse');
      const rawBtn = document.getElementById('text-raw-btn');
      const isOpen = addCollapse?.classList.contains('open');
      if (isOpen) {
        addCollapse.classList.remove('open');
        addBtn.textContent = '+ add paragraph';
      } else {
        addCollapse?.classList.add('open');
        addBtn.textContent = 'cancel';
        /* close raw if open */
        rawCollapse?.classList.remove('open');
        if (rawBtn) rawBtn.textContent = 'raw edit';
        setTimeout(() => document.getElementById('new-para-ta')?.focus(), 20);
      }
    });

    /* toggle raw-edit */
    const rawBtn = document.getElementById('text-raw-btn');
    if (rawBtn) rawBtn.addEventListener('click', () => {
      const rawCollapse = document.getElementById('raw-form-collapse');
      const addCollapse = document.getElementById('add-form-collapse');
      const addBtn = document.getElementById('text-add-btn');
      const isOpen = rawCollapse?.classList.contains('open');
      if (isOpen) {
        rawCollapse.classList.remove('open');
        rawBtn.textContent = 'raw edit';
      } else {
        /* populate textarea with current data before revealing */
        const rawTa = document.getElementById('raw-edit-ta');
        if (rawTa) rawTa.value = data.join('\n\n');
        rawCollapse?.classList.add('open');
        rawBtn.textContent = 'close raw edit';
        /* close add if open */
        addCollapse?.classList.remove('open');
        if (addBtn) addBtn.textContent = '+ add paragraph';
        setTimeout(() => document.getElementById('raw-edit-ta')?.focus(), 20);
      }
    });

    /* add-form: update placeholder when type changes (no re-render needed) */
    const newType = document.getElementById('new-para-type');
    if (newType) newType.addEventListener('change', e => {
      const ta = document.getElementById('new-para-ta');
      if (ta) ta.placeholder = e.target.value === 'h1' ? 'Heading text…' : 'Paragraph text…';
    });

    /* add-form: save */
    const newSave = document.getElementById('new-para-save');
    if (newSave) newSave.addEventListener('click', () => {
      const type = document.getElementById('new-para-type')?.value || 'p';
      const text = (document.getElementById('new-para-ta')?.value || '').trim();
      if (!text) return;
      const before = [...data];
      data = [...data, type === 'h1' ? '# ' + text : text];
      save(dataKey, data);
      pushUndo(dataKey, before, [...data]);
      document.getElementById('add-form-collapse')?.classList.remove('open');
      const addBtnEl = document.getElementById('text-add-btn');
      if (addBtnEl) addBtnEl.textContent = '+ add paragraph';
      const ta = document.getElementById('new-para-ta');
      if (ta) ta.value = '';
      _refreshBody();
    });

    /* add-form textarea: Ctrl+Enter to submit, Ctrl+B/I/U for formatting */
    const newParaTa = document.getElementById('new-para-ta');
    if (newParaTa) newParaTa.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'Enter') { e.preventDefault(); document.getElementById('new-para-save')?.click(); }
      if (ctrl && e.key === 'b') { e.preventDefault(); wrapSelectedText(newParaTa, '<b>', '</b>'); }
      if (ctrl && e.key === 'i') { e.preventDefault(); wrapSelectedText(newParaTa, '<i>', '</i>'); }
      if (ctrl && e.key === 'u') { e.preventDefault(); wrapSelectedText(newParaTa, '<u>', '</u>'); }
    });

    /* add-form: cancel */
    const newCancel = document.getElementById('new-para-cancel');
    if (newCancel) newCancel.addEventListener('click', () => {
      document.getElementById('add-form-collapse')?.classList.remove('open');
      const addBtnEl = document.getElementById('text-add-btn');
      if (addBtnEl) addBtnEl.textContent = '+ add paragraph';
    });

    /* raw-edit textarea: Ctrl+Enter to apply */
    const rawEditTa = document.getElementById('raw-edit-ta');
    if (rawEditTa) rawEditTa.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('raw-apply-btn')?.click();
      }
    });

    /* raw-edit: apply */
    const rawApply = document.getElementById('raw-apply-btn');
    if (rawApply) rawApply.addEventListener('click', () => {
      const rawTa = document.getElementById('raw-edit-ta');
      const before = [...data];
      data = (rawTa?.value || '').split('\n\n').map(s => s.trim()).filter(Boolean);
      save(dataKey, data);
      pushUndo(dataKey, before, [...data]);
      document.getElementById('raw-form-collapse')?.classList.remove('open');
      const rawBtnEl = document.getElementById('text-raw-btn');
      if (rawBtnEl) rawBtnEl.textContent = 'raw edit';
      _refreshBody();
    });

    /* raw-edit: cancel */
    const rawCancel = document.getElementById('raw-cancel-btn');
    if (rawCancel) rawCancel.addEventListener('click', () => {
      document.getElementById('raw-form-collapse')?.classList.remove('open');
      const rawBtnEl = document.getElementById('text-raw-btn');
      if (rawBtnEl) rawBtnEl.textContent = 'raw edit';
    });

    _bindParaEditEvents();
  }

  /* ── public render ── */
  function render() {
    document.getElementById('app').innerHTML = _pageHTML();
    _bindEvents();
  }

  return { render };
}
