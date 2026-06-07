/* ================================================================
   textpage.js — grammar / phonetics / philosophy pages (configurable)
   Depends on: utils.js, auth.js
   ================================================================ */

/**
 * Create a text-content page.
 *
 * @param {object}   cfg
 * @param {string}   cfg.dataKey     - localStorage key, e.g. 'mv_grammar'
 * @param {string[]} cfg.defaultData - fallback paragraph array
 *
 * Data format:
 *   '# Heading'    → rendered as <h1>
 *   '\\# Text'     → rendered as <p> showing literal "# Text"
 *   'Anything else' → rendered as <p>
 *
 * @returns {{ render: Function }}
 */
function createTextPage(cfg) {
  const { dataKey, defaultData } = cfg;

  /* ── page-local state ── */
  let data = load(dataKey, defaultData);
  let editIdx = -1;
  let showAddForm = false;
  let addType = 'p';
  let addText = '';
  let showRaw = false;
  let rawText = '';

  /* ── HTML for a single paragraph ── */
  function _paraHTML(para, idx) {
    const isHead = para.startsWith('# ');
    const isEsc = !isHead && para[0] === '\\' && para[1] === '#' && para[2] === ' ';

    if (editIdx === idx) {
      const displayVal = isHead ? para.slice(2) : (isEsc ? para.slice(3) : para);
      return `
        <div class="inline-edit">
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
            <span style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;
                         color:var(--text-3)">type</span>
            <select class="form-select"
              style="width:auto;padding:4px 10px;font-size:14px" id="para-type-sel">
              <option value="h1"${isHead ? ' selected' : ''}>heading</option>
              <option value="p"${!isHead ? ' selected' : ''}>paragraph</option>
            </select>
          </div>
          <textarea class="form-textarea" id="para-edit-ta"
            rows="4">${esc(displayVal)}</textarea>
          <div class="form-actions">
            <button class="btn btn-primary btn-sm" id="para-save-btn">save</button>
            <button class="btn btn-sm"             id="para-cancel-btn">cancel</button>
            <button class="btn btn-sm"             id="para-up-btn"    title="move up">↑</button>
            <button class="btn btn-sm"             id="para-down-btn"  title="move down">↓</button>
            <button class="btn btn-sm btn-danger"  id="para-del-btn">delete</button>
          </div>
        </div>`;
    }

    let tag, cls, text;
    if (isHead) { tag = 'h1'; text = para.slice(2); }
    else if (isEsc) { tag = 'p'; text = '# ' + para.slice(3); }
    else { tag = 'p'; text = para; }

    const editBtn = AUTH.isLoggedIn()
      ? `<button class="btn btn-sm btn-ghost para-edit-btn"
           data-para-edit="${idx}" style="margin-bottom:4px">edit</button>`
      : '';

    return `
      <div class="para-block" data-para-idx="${idx}">
        <${tag} class="${cls}">${esc(text)}</${tag}>
        ${editBtn}
      </div>`;
  }

  /* ── full page HTML ── */
  function _pageHTML() {
    const paras = data.map((p, i) => _paraHTML(p, i)).join('');

    let editControls = '';
    if (AUTH.isLoggedIn()) {
      const addForm = showAddForm ? `
        <div class="add-form">
          <div class="add-form-title">New entry</div>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">
            <span style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;
                         color:var(--text-3)">type</span>
            <select class="form-select"
              style="width:auto;padding:4px 10px;font-size:14px" id="new-para-type">
              <option value="p"${addType === 'p' ? ' selected' : ''}>paragraph</option>
              <option value="h1"${addType === 'h1' ? ' selected' : ''}>heading</option>
            </select>
          </div>
          <textarea class="form-textarea" id="new-para-ta" rows="4"
            placeholder="${addType === 'h1' ? 'Heading text…' : 'Paragraph text…'}"
          >${esc(addText)}</textarea>
          <div class="form-actions">
            <button class="btn btn-primary btn-sm" id="new-para-save">add</button>
            <button class="btn btn-sm"             id="new-para-cancel">cancel</button>
          </div>
        </div>` : '';

      const rawForm = showRaw ? `
        <div class="add-form">
          <div class="add-form-title">
            Raw edit — paragraphs separated by blank lines; headings start with "# "
          </div>
          <textarea class="form-textarea raw-edit-area" id="raw-edit-ta"
            rows="16" spellcheck="false">${esc(rawText)}</textarea>
          <div class="form-actions">
            <button class="btn btn-primary btn-sm" id="raw-apply-btn">apply</button>
            <button class="btn btn-sm"             id="raw-cancel-btn">cancel</button>
          </div>
        </div>` : '';

      editControls = `
        <div class="section-actions">
          <button class="btn btn-sm" id="text-add-btn">
            ${showAddForm ? 'cancel' : '+ add paragraph'}
          </button>
          <button class="btn btn-sm" id="text-raw-btn">
            ${showRaw ? 'close raw edit' : 'raw edit'}
          </button>
        </div>
        ${addForm}${rawForm}`;
    }

    return `
      <main class="page">
        <div class="page-header">
          <h1 class="page-title">Meuvid</h1>
          ${editControls}
        </div>
        <div class="text-body">${paras}</div>
      </main>`;
  }

  /* ── event binding ── */
  /* mobile modal edits deferred — modal helper removed */

  function _bindEvents() {
    /* toggle add-form */
    const addBtn = document.getElementById('text-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => {
      showAddForm = !showAddForm;
      if (showAddForm) { showRaw = false; addText = ''; }
      render();
    });

    /* toggle raw-edit */
    const rawBtn = document.getElementById('text-raw-btn');
    if (rawBtn) rawBtn.addEventListener('click', () => {
      showRaw = !showRaw;
      if (showRaw) { rawText = data.join('\n\n'); showAddForm = false; editIdx = -1; }
      render();
    });

    /* add-form internals */
    const newType = document.getElementById('new-para-type');
    if (newType) newType.addEventListener('change', e => {
      addType = e.target.value;
      render();
    });

    const newTa = document.getElementById('new-para-ta');
    if (newTa) newTa.addEventListener('input', e => { addText = e.target.value; });

    const newSave = document.getElementById('new-para-save');
    if (newSave) newSave.addEventListener('click', () => {
      const text = (document.getElementById('new-para-ta')?.value || '').trim();
      if (!text) return;
      data = [...data, addType === 'h1' ? '# ' + text : text];
      save(dataKey, data);
      showAddForm = false; addText = '';
      render();
    });

    const newCancel = document.getElementById('new-para-cancel');
    if (newCancel) newCancel.addEventListener('click', () => { showAddForm = false; render(); });

    /* raw-edit internals */
    const rawTa = document.getElementById('raw-edit-ta');
    if (rawTa) rawTa.addEventListener('input', e => { rawText = e.target.value; });

    const rawApply = document.getElementById('raw-apply-btn');
    if (rawApply) rawApply.addEventListener('click', () => {
      data = rawText.split('\n\n').map(s => s.trim()).filter(Boolean);
      save(dataKey, data);
      showRaw = false; editIdx = -1;
      render();
    });

    const rawCancel = document.getElementById('raw-cancel-btn');
    if (rawCancel) rawCancel.addEventListener('click', () => { showRaw = false; render(); });

    /* paragraph edit buttons */
    document.querySelectorAll('[data-para-edit]').forEach(btn =>
      btn.addEventListener('click', () => {
        editIdx = parseInt(btn.dataset.paraEdit);
        showRaw = false; showAddForm = false;
        render();
      })
    );

    /* mobile double-click editing paused */

    /* inline edit controls */
    const paraSave = document.getElementById('para-save-btn');
    if (paraSave) paraSave.addEventListener('click', () => {
      const i = editIdx;
      const type = document.getElementById('para-type-sel')?.value || 'p';
      const text = (document.getElementById('para-edit-ta')?.value || '').trim();
      if (!text) return;
      data[i] = type === 'h1' ? '# ' + text : text;
      save(dataKey, data);
      editIdx = -1;
      render();
    });

    const paraCancel = document.getElementById('para-cancel-btn');
    if (paraCancel) paraCancel.addEventListener('click', () => { editIdx = -1; render(); });

    const paraUp = document.getElementById('para-up-btn');
    if (paraUp) paraUp.addEventListener('click', () => {
      const i = editIdx;
      if (i <= 0) return;
      [data[i], data[i - 1]] = [data[i - 1], data[i]];
      save(dataKey, data);
      editIdx = i - 1;
      render();
    });

    const paraDown = document.getElementById('para-down-btn');
    if (paraDown) paraDown.addEventListener('click', () => {
      const i = editIdx;
      if (i >= data.length - 1) return;
      [data[i], data[i + 1]] = [data[i + 1], data[i]];
      save(dataKey, data);
      editIdx = i + 1;
      render();
    });

    const paraDel = document.getElementById('para-del-btn');
    if (paraDel) paraDel.addEventListener('click', () => {
      if (!confirm('Delete this paragraph?')) return;
      const i = editIdx;
      data = data.filter((_, idx) => idx !== i);
      save(dataKey, data);
      editIdx = -1;
      render();
    });

    /* restore textarea focus after re-render */
    if (editIdx >= 0) {
      const ta = document.getElementById('para-edit-ta');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
  }

  /* ── public render ── */
  function render() {
    document.getElementById('app').innerHTML = _pageHTML();
    _bindEvents();
  }

  return { render };
}
