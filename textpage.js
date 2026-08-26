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
  let adder = null; // open insert panel: { pos, type } | null

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
            <div class="view-toggle adder-toggle" style="margin-bottom:10px">
              <button type="button" class="view-toggle-btn${!isHead ? ' active' : ''}" data-para-type="${idx}" data-val="p">paragraph</button>
              <button type="button" class="view-toggle-btn${isHead ? ' active' : ''}" data-para-type="${idx}" data-val="h1">header</button>
            </div>
            <textarea class="form-textarea" data-para-ta="${idx}"
              rows="8">${esc(displayVal)}</textarea>
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
          <${tag}>${text.replace(/\n/g, '<br>')}</${tag}>
          ${editBtn}
        </div>
        ${editForm}
      </div>`;
  }

  /* ── insertion gap + inline adder (mirrors dict-section.js) ── */

  function _gapHTML(pos) {
    if (!AUTH.isLoggedIn()) return '';
    const active = adder && adder.pos === pos ? ' active' : '';
    return `
      <button class="sec-insert${active}" data-insert="${pos}" title="add here">
        <span class="sec-insert-line"></span>
        <span class="sec-insert-plus">+</span>
      </button>`;
  }

  function _adderHTML() {
    const type = adder.type || 'p';
    const tab = (t, label) =>
      `<button class="view-toggle-btn${type === t ? ' active' : ''}" data-adder-type="${t}">${label}</button>`;
    return `
      <div class="sec-adder">
        <div class="view-toggle adder-toggle">
          ${tab('p', 'paragraph')}${tab('h1', 'header')}
        </div>
        <textarea class="form-textarea" id="adder-ta" rows="8"
          placeholder="${type === 'h1' ? 'Heading text…' : 'Paragraph text…'}"></textarea>
        <div class="form-actions">
          <button class="btn btn-primary btn-sm" id="adder-save">add</button>
          <button class="btn btn-sm"             id="adder-cancel">cancel</button>
        </div>
      </div>`;
  }

  /* interleave insertion gaps (and the open adder, if any) between paragraphs */
  function _parasHTML() {
    if (!AUTH.isLoggedIn()) return data.map((p, i) => _paraHTML(p, i)).join('');
    let html = '';
    for (let pos = 0; pos <= data.length; pos++) {
      html += _gapHTML(pos);
      if (adder && adder.pos === pos) html += _adderHTML();
      if (pos < data.length) html += _paraHTML(data[pos], pos);
    }
    return html;
  }

  /* ── full page HTML ── */
  function _pageHTML() {
    let editControls = '';
    if (AUTH.isLoggedIn()) {
      editControls = `
        <div class="section-actions">
          <button class="btn btn-sm" id="text-add-btn">+ add paragraph</button>
          <button class="btn btn-sm" id="text-raw-btn">raw edit</button>
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
        <div class="text-body${AUTH.isLoggedIn() ? ' editing' : ''}" id="text-body">${_parasHTML()}</div>
      </main>`;
  }

  /* ── event binding ── */

  /** Rebuild only #text-body and re-attach paragraph events (cheaper than full render). */
  function _refreshBody() {
    const el = document.getElementById('text-body');
    if (!el) return;
    el.innerHTML = _parasHTML();
    _bindParaEditEvents();
    _bindAdderEvents();
    tagParaHideKeys(el);
    applyHiding(el);
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
          revealHidden(block);
          block.classList.add('editing');
          editForm.classList.add('open');
          _editSnapshot = [...data];
          setEscCleanup(() => { data = _editSnapshot; _editSnapshot = null; _refreshBody(); });
          const ta = editForm.querySelector('.form-textarea');
          if (ta) setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 20);
        }
      })
    );

    /* type toggle — DOM-only, matches the adder's tab pattern */
    document.querySelectorAll('[data-para-type]').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelectorAll(`[data-para-type="${btn.dataset.paraType}"]`).forEach(b =>
          b.classList.toggle('active', b === btn));
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
        const type = document.querySelector(`[data-para-type="${i}"].active`)?.dataset.val || 'p';
        const text = (document.querySelector(`[data-para-ta="${i}"]`)?.value || '').trim();
        if (!text) return;
        const before = _editSnapshot ?? [...data];
        data[i] = type === 'h1' ? '# ' + text : text;
        save(dataKey, data);
        pushUndo(dataKey, before, [...data]);
        _editSnapshot = null;
        clearEscCleanup();
        _refreshBody();
        revealHidden(document.querySelector(`[data-para-idx="${i}"]`));
      })
    );

    /* move up — in-session only; not written to storage until save/delete */
    document.querySelectorAll('[data-para-up]').forEach(btn =>
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.paraUp);
        if (i <= 0) return;
        revealHidden(document.querySelector(`[data-para-idx="${i}"]`));
        const oldForm = document.querySelector(`[data-para-edit-form="${i}"]`);
        const oldFormTop = oldForm ? oldForm.getBoundingClientRect().top : null;
        [data[i], data[i - 1]] = [data[i - 1], data[i]];
        _refreshBody();
        _reopenParaEdit(i - 1, oldFormTop, '[data-para-up]');
        revealHidden(document.querySelector(`[data-para-idx="${i - 1}"]`));
      })
    );

    /* move down — same, not committed until save/delete */
    document.querySelectorAll('[data-para-down]').forEach(btn =>
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.paraDown);
        if (i >= data.length - 1) return;
        revealHidden(document.querySelector(`[data-para-idx="${i}"]`));
        const oldForm = document.querySelector(`[data-para-edit-form="${i}"]`);
        const oldFormTop = oldForm ? oldForm.getBoundingClientRect().top : null;
        [data[i], data[i + 1]] = [data[i + 1], data[i]];
        _refreshBody();
        _reopenParaEdit(i + 1, oldFormTop, '[data-para-down]');
        revealHidden(document.querySelector(`[data-para-idx="${i + 1}"]`));
      })
    );

    /* delete — commits pending moves along with the deletion as one undo entry */
    document.querySelectorAll('[data-para-del]').forEach(btn =>
      btn.addEventListener('click', async e => {
        revealHidden(document.querySelector(`[data-para-idx="${btn.dataset.paraDel}"]`));
        if (!await showConfirm('Delete this paragraph?', 'delete', e)) return;
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

  /* open (or toggle closed) the insert adder at a gap; closes raw-edit if open */
  function _openAdder(pos) {
    if (adder && adder.pos === pos) { adder = null; }
    else {
      adder = { pos, type: 'p' };
      document.getElementById('raw-form-collapse')?.classList.remove('open');
      const rawBtn = document.getElementById('text-raw-btn');
      if (rawBtn) rawBtn.textContent = 'raw edit';
    }
    _refreshBody();
  }

  function _submitAdder() {
    if (!adder) return;
    const type = adder.type || 'p';
    const text = (document.getElementById('adder-ta')?.value || '').trim();
    if (!text) return;
    const before = [...data];
    data.splice(adder.pos, 0, type === 'h1' ? '# ' + text : text);
    save(dataKey, data);
    pushUndo(dataKey, before, [...data]);
    adder.pos += 1; // next add lands after this one
    _refreshBody();
  }

  function _bindAdderEvents() {
    document.querySelectorAll('[data-insert]').forEach(btn =>
      btn.addEventListener('click', () => _openAdder(parseInt(btn.dataset.insert)))
    );
    if (!adder) return;

    document.querySelectorAll('[data-adder-type]').forEach(btn =>
      btn.addEventListener('click', () => {
        adder.type = btn.dataset.adderType;
        document.querySelectorAll('[data-adder-type]').forEach(b =>
          b.classList.toggle('active', b.dataset.adderType === adder.type));
        const ta = document.getElementById('adder-ta');
        if (ta) ta.placeholder = adder.type === 'h1' ? 'Heading text…' : 'Paragraph text…';
      })
    );

    const ta = document.getElementById('adder-ta');
    if (ta) {
      ta.addEventListener('keydown', e => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key === 'Enter') { e.preventDefault(); _submitAdder(); }
        if (ctrl && e.key === 'b') { e.preventDefault(); wrapSelectedText(ta, '<b>', '</b>'); }
        if (ctrl && e.key === 'i') { e.preventDefault(); wrapSelectedText(ta, '<i>', '</i>'); }
        if (ctrl && e.key === 'u') { e.preventDefault(); wrapSelectedText(ta, '<u>', '</u>'); }
      });
      setTimeout(() => ta.focus(), 20);
    }

    document.getElementById('adder-save')?.addEventListener('click', _submitAdder);
    document.getElementById('adder-cancel')?.addEventListener('click', () => { adder = null; _refreshBody(); });
  }

  /* Escape closes the adder; only acts while it's open. */
  registerEscHandler(() => {
    if (!adder) return false;
    adder = null;
    _refreshBody();
    return true;
  });

  function _bindEvents() {
    /* "+ add paragraph" → open the inline adder at the end */
    const addBtn = document.getElementById('text-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => _openAdder(data.length));

    /* toggle raw-edit */
    const rawBtn = document.getElementById('text-raw-btn');
    if (rawBtn) rawBtn.addEventListener('click', () => {
      const rawCollapse = document.getElementById('raw-form-collapse');
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
        /* close the inline adder if open */
        adder = null;
        _refreshBody();
        setTimeout(() => document.getElementById('raw-edit-ta')?.focus(), 20);
      }
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
    _bindAdderEvents();
  }

  /* ── public render ── */
  function render() {
    document.getElementById('app').innerHTML = _pageHTML();
    _bindEvents();
    tagParaHideKeys(document.getElementById('app'));
    applyHiding(document.getElementById('app'));
  }

  return { render };
}
