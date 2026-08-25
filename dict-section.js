/* ================================================================
   dict-section.js — section view for the dictionary and roots pages
   Depends on: utils.js, auth.js, lang-data.js

   Data model (localStorage key cfg.sectionsKey, fallback cfg.sectionsRaw):
     [ [headingText, items], ... ]
   An item is either a paragraph string, or a word reference. A reference holds
   only [word], or [word, id] when the word is duplicated in the source. It is
   resolved against the live source at render time, so source edits and deletes
   require no writes here. A reference whose target was deleted renders as such.

   Reordering a heading moves its whole section past the adjacent section.
   Reordering an item moves it one slot, crossing into the neighbouring
   section at a section edge.
   ================================================================ */

/**
 * @param {object}   cfg
 * @param {string}   cfg.sectionsKey   localStorage key
 * @param {Array}    cfg.sectionsRaw   fallback array
 * @param {boolean}  cfg.hasPos        whether source entries carry a POS field
 * @param {Function} cfg.getDict       () => live source array
 * @param {Function} cfg.addDictEntry  (tuple) => reference; adds to the source
 *                                      (persist + undo) and returns the reference
 * @param {Function} cfg.updateDictEntry (oldWord, oldId, word, pos, def) => reference | null;
 *                                      edits a source entry by its current word/id
 *                                      (persist + undo) and returns its new reference
 * @returns {{ render, handleUndo, collectRefIds }}
 */
function createDictSection(cfg) {
  const { sectionsKey, sectionsRaw, hasPos, getDict, addDictEntry, updateDictEntry } = cfg;
  const baseLen = hasPos ? 3 : 2;       // source entry length without an id
  const idIdx   = baseLen;              // index the id occupies when present
  const defIdx  = hasPos ? 2 : 1;

  let sections = load(sectionsKey, sectionsRaw);
  let container = null;
  /* the single open "add" panel: { sec, pos, mode, q } | null */
  let adder = null;

  /* ── helpers ── */
  const clone = x => JSON.parse(JSON.stringify(x));
  const loggedIn = () => AUTH.isLoggedIn();
  const entryId = e => (e.length > baseLen ? e[idIdx] : null);

  /* Legacy: "# " items used to be a heading-styled paragraph within a section
     (the old adder wrote these). Split each one out into a real section, so
     data saved before the adder change still displays correctly. Runs once. */
  function _migrateHeadingsToSections() {
    let changed = false;
    const result = [];
    sections.forEach(([heading, items]) => {
      let curHeading = heading;
      let curItems = [];
      items.forEach(item => {
        if (typeof item === 'string' && item.startsWith('# ')) {
          result.push([curHeading, curItems]);
          curHeading = item.slice(2);
          curItems = [];
          changed = true;
        } else {
          curItems.push(item);
        }
      });
      result.push([curHeading, curItems]);
    });
    if (changed) { sections = result; save(sectionsKey, sections); }
  }
  _migrateHeadingsToSections();

  _migrateRefs();

  function commit(before) {
    save(sectionsKey, sections);
    pushUndo(sectionsKey, before, clone(sections));
  }

  /* A reference is [word] for an unambiguous word, or [word, id] for a duplicate. */
  const refHasId = ref => ref.length > 1;

  /** Build the reference that points at a given source entry. */
  function refFor(entry) {
    const id = entryId(entry);
    return id != null ? [entry[0], id] : [entry[0]];
  }

  /**
   * Resolve a reference against the live source.
   * Returns { entry } when found, or { deleted: true, word } when the target is gone.
   */
  function resolveRef(ref) {
    const matches = getDict().filter(e => e[0] === ref[0]);
    const entry = refHasId(ref)
      ? matches.find(e => entryId(e) === ref[1])
      : matches.find(e => entryId(e) == null);
    return entry ? { entry } : { deleted: true, word: ref[0] };
  }

  /** Numeric ids currently held by references; used by the host to avoid id reuse. */
  function collectRefIds() {
    const ids = [];
    sections.forEach(sec => sec[1].forEach(it => {
      if (Array.isArray(it) && refHasId(it)) ids.push(it[1]);
    }));
    return ids;
  }

  /**
   * Re-point every reference to (oldWord[, oldId]) at (newWord[, newId]).
   * Called by the host page when an edit renames a word or changes its id,
   * so stored references don't go stale.
   */
  function updateRef(oldWord, oldId, newWord, newId) {
    let changed = false;
    sections.forEach(sec => sec[1].forEach((it, i) => {
      if (!Array.isArray(it)) return;
      const sameId = oldId == null ? it.length === 1 : (it.length > 1 && it[1] === oldId);
      if (it[0] === oldWord && sameId) {
        sec[1][i] = newId != null ? [newWord, newId] : [newWord];
        changed = true;
      }
    }));
    if (changed) {
      save(sectionsKey, sections);
      if (container && container.querySelector('.sec-view')) render(container);
    }
  }

  /** Upgrade references saved in the earlier full-tuple format to [word] / [word, id]. */
  function _migrateRefs() {
    let changed = false;
    sections.forEach(sec => sec[1].forEach((it, i) => {
      if (!Array.isArray(it) || it.length < 2 || typeof it[1] === 'number') return;
      const match = getDict().find(e => it.slice(0, baseLen).every((v, k) => e[k] === v));
      sec[1][i] = match ? refFor(match) : [it[0]];
      changed = true;
    }));
    if (changed) save(sectionsKey, sections);
  }

  /* ── item HTML ── */

  function _wordItemHTML(ref, s, i) {
    const { entry, deleted, word } = resolveRef(ref);
    const editable = loggedIn() && !deleted; // nothing to edit for a deleted target
    const actions = loggedIn() ? `
      <div class="entry-actions">
        ${editable ? `<button class="btn btn-sm btn-ghost" data-item-edit="${s}.${i}">edit</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-item-up="${s}.${i}"   title="move up">↑</button>
        <button class="btn btn-sm btn-ghost" data-item-down="${s}.${i}" title="move down">↓</button>
        <button class="btn btn-sm btn-danger" data-item-del="${s}.${i}" title="remove from section">×</button>
      </div>` : '';
    const body = deleted
      ? `<span class="dict-word">${esc(word)}</span>
         <span class="dict-body sec-deleted">deleted from ${hasPos ? 'dictionary' : 'roots'}</span>`
      : `<span class="dict-word">${esc(entry[0])}</span>
         <span class="dict-body">${(hasPos && entry[1]) ? `<span class="dict-pos">${esc(entry[1])} </span>` : ''}${esc(entry[defIdx] ?? '')}</span>`;

    const posEditField = editable && hasPos ? `
      <input class="form-input" style="width:80px;flex-shrink:0"
        data-word-pos="${s}.${i}" value="${esc(entry[1])}" placeholder="pos." />` : '';
    const editForm = editable ? `
      <div class="edit-collapse" data-item-form="${s}.${i}">
        <div class="edit-collapse-inner">
          <div class="entry-edit-row">
            <input class="form-input" style="width:130px;flex-shrink:0"
              data-word-word="${s}.${i}" value="${esc(entry[0])}" />
            ${posEditField}
            <input class="form-input" style="flex:1;min-width:120px"
              data-word-def="${s}.${i}" value="${esc(entry[defIdx] ?? '')}" />
            <button class="btn btn-primary btn-sm" data-item-save="${s}.${i}">save</button>
            <button class="btn btn-sm" data-item-cancel="${s}.${i}">cancel</button>
          </div>
        </div>
      </div>` : '';

    return `
      <div class="sec-item sec-word" data-sec="${s}" data-item="${i}">
        <div class="dict-entry">${body}${actions}</div>
        ${editForm}
      </div>`;
  }

  function _paraItemHTML(text, s, i) {
    // items using the "# " prefix (same convention as textpage.js) render as headers
    const isHead = text.startsWith('# ');
    const displayText = isHead ? text.slice(2) : text;
    const tag = isHead ? 'h1' : 'p';

    const editBtn = loggedIn()
      ? `<button class="btn btn-sm btn-ghost para-edit-btn"
           data-item-edit="${s}.${i}" style="margin-bottom:4px">edit</button>` : '';
    const editForm = loggedIn() ? `
      <div class="edit-collapse para-edit-collapse" data-item-form="${s}.${i}">
        <div class="edit-collapse-inner"><div class="inline-edit">
          <textarea class="form-textarea" data-item-ta="${s}.${i}" rows="6">${esc(text)}</textarea>
          <div class="form-actions">
            <button class="btn btn-primary btn-sm" data-item-save="${s}.${i}">save</button>
            <button class="btn btn-sm"             data-item-cancel="${s}.${i}">cancel</button>
            <button class="btn btn-sm"             data-item-up="${s}.${i}"   title="move up">↑</button>
            <button class="btn btn-sm"             data-item-down="${s}.${i}" title="move down">↓</button>
            <button class="btn btn-sm btn-danger"  data-item-del="${s}.${i}">delete</button>
            <span style="flex:1"></span>
            <button class="btn btn-sm btn-ghost" data-item-fmt="b.${s}.${i}" title="Bold (Ctrl+B)"      style="font-weight:600">B</button>
            <button class="btn btn-sm btn-ghost" data-item-fmt="i.${s}.${i}" title="Italic (Ctrl+I)"    style="font-style:italic">I</button>
            <button class="btn btn-sm btn-ghost" data-item-fmt="u.${s}.${i}" title="Underline (Ctrl+U)" style="text-decoration:underline;text-underline-offset:2px">U</button>
          </div>
        </div></div>
      </div>` : '';
    return `
      <div class="sec-item para-block" data-sec="${s}" data-item="${i}">
        <div class="para-content">
          <${tag}>${displayText.replace(/\n/g, '<br>')}</${tag}>
          ${editBtn}
        </div>
        ${editForm}
      </div>`;
  }

  function _itemHTML(item, s, i) {
    return Array.isArray(item) ? _wordItemHTML(item, s, i) : _paraItemHTML(item, s, i);
  }

  /* ── insertion hint + unified adder ── */

  function _gapHTML(s, pos) {
    if (!loggedIn()) return '';
    const active = adder && adder.sec === s && adder.pos === pos ? ' active' : '';
    return `
      <button class="sec-insert${active}" data-insert="${s}.${pos}" title="add here">
        <span class="sec-insert-line"></span>
        <span class="sec-insert-plus">+</span>
      </button>`;
  }

  function _adderHTML() {
    const mode = adder.mode;
    const tab = (m, label) =>
      `<button class="view-toggle-btn${mode === m ? ' active' : ''}" data-adder-mode="${m}">${label}</button>`;
    const posField = hasPos ? `
      <div class="form-group" style="flex-grow:0;min-width:85px">
        <label class="form-label">pos</label>
        <input class="form-input" id="adder-word-p" placeholder="n." />
      </div>` : '';
    return `
      <div class="sec-adder">
        <div class="view-toggle adder-toggle">
          ${tab('para', 'paragraph')}${tab('head', 'new section')}${tab('word', 'word')}${tab('assign', 'assign')}
        </div>

        <div class="adder-pane" data-adder-pane="para"${mode === 'para' ? '' : ' hidden'}>
          <textarea class="form-textarea" id="adder-para-ta" rows="6" placeholder="Paragraph text…"></textarea>
        </div>

        <div class="adder-pane" data-adder-pane="head"${mode === 'head' ? '' : ' hidden'}>
          <input class="form-input" id="adder-head-w" placeholder="New section heading…" />
        </div>

        <div class="adder-pane" data-adder-pane="word"${mode === 'word' ? '' : ' hidden'}>
          <div class="add-form-title">New word</div>
          <div class="form-row">
            <div class="form-group" style="flex-grow:0;min-width:130px">
              <label class="form-label">${hasPos ? 'word' : 'root'}</label>
              <input class="form-input" id="adder-word-w" placeholder="${hasPos ? 'vid' : 'vid'}" />
            </div>
            ${posField}
            <div class="form-group" style="flex:1;min-width:120px">
              <label class="form-label">definition</label>
              <input class="form-input" id="adder-word-d" placeholder="meaning…" />
            </div>
          </div>
        </div>

        <div class="adder-pane" data-adder-pane="assign"${mode === 'assign' ? '' : ' hidden'}>
          <input class="form-input" id="adder-assign-search" placeholder="search a word…"
            autocomplete="off" spellcheck="false" value="${esc(adder.q || '')}" />
          <div class="assign-results" id="adder-assign-results"></div>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary btn-sm" id="adder-add"${mode === 'assign' ? ' hidden' : ''}>add</button>
          <button class="btn btn-sm" id="adder-cancel">${mode === 'assign' ? 'done' : 'cancel'}</button>
        </div>
      </div>`;
  }

  function _itemsHTML(items, s) {
    if (!loggedIn()) return items.map((it, i) => _itemHTML(it, s, i)).join('');
    let html = '';
    for (let pos = 0; pos <= items.length; pos++) {
      html += _gapHTML(s, pos);
      if (adder && adder.sec === s && adder.pos === pos) html += _adderHTML();
      if (pos < items.length) html += _itemHTML(items[pos], s, pos);
    }
    return html;
  }

  /* ── section + body HTML ── */

  function _sectionHTML(sec, s) {
    const [heading, items] = sec;
    const headActions = loggedIn()
      ? `<button class="btn btn-sm btn-ghost" data-head-edit="${s}" style="margin-left:10px">edit</button>` : '';
    const headForm = loggedIn() ? `
      <div class="edit-collapse" data-head-form="${s}">
        <div class="edit-collapse-inner"><div class="inline-edit">
          <textarea class="form-textarea" data-head-ta="${s}" rows="2">${esc(heading)}</textarea>
          <div class="form-actions">
            <button class="btn btn-primary btn-sm" data-head-save="${s}">save</button>
            <button class="btn btn-sm"             data-head-cancel="${s}">cancel</button>
            <button class="btn btn-sm"             data-head-up="${s}"   title="move section up">↑</button>
            <button class="btn btn-sm"             data-head-down="${s}" title="move section down">↓</button>
            <button class="btn btn-sm btn-danger"  data-head-del="${s}">delete section</button>
          </div>
        </div></div>
      </div>` : '';
    return `
      <section class="sec-block" data-sec-block="${s}">
        <div class="sec-head"><h1>${esc(heading)}</h1>${headActions}</div>
        ${headForm}
        <div class="sec-items" data-sec-items="${s}">${_itemsHTML(items, s)}</div>
      </section>`;
  }

  function _bodyHTML() {
    if (!sections.length && !loggedIn())
      return `<div class="no-results">No sections yet.</div>`;
    const secs = sections.map((sec, s) => _sectionHTML(sec, s)).join('');
    const bottom = loggedIn() ? `
      <div class="section-actions sec-bottom">
        <button class="btn btn-sm" id="sec-add-para-btn"${sections.length ? '' : ' disabled'}>+ add paragraph</button>
        <button class="btn btn-sm" id="sec-add-section-btn">+ add section</button>
      </div>
      <div class="edit-collapse" id="sec-add-section-form">
        <div class="edit-collapse-inner"><div class="add-form">
          <div class="add-form-title">New section heading</div>
          <textarea class="form-textarea" id="sec-new-head-ta" rows="2" placeholder="Heading text…"></textarea>
          <div class="form-actions">
            <button class="btn btn-primary btn-sm" id="sec-new-head-save">add</button>
            <button class="btn btn-sm" id="sec-new-head-cancel">cancel</button>
          </div>
        </div></div>
      </div>` : '';
    return `<div class="text-body sec-view${loggedIn() ? ' editing' : ''}">${secs}${bottom}</div>`;
  }

  /* ── parse helpers ── */
  const _si = v => v.split('.').map(Number);

  /* ── mutations ── */
  function _moveItem(s, i, dir) {
    const items = sections[s][1];
    if (dir < 0) {
      if (i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; return true; }
      if (s > 0) { sections[s - 1][1].push(items.splice(i, 1)[0]); return true; }
      return false;
    }
    if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; return true; }
    if (s < sections.length - 1) { sections[s + 1][1].unshift(items.splice(i, 1)[0]); return true; }
    return false;
  }

  /** Insert a value at the adder's current position; advance so the next add lands after it. */
  function _insertAtAdder(value) {
    const before = clone(sections);
    const scrollTop = container.querySelector('#adder-assign-results')?.scrollTop;
    sections[adder.sec][1].splice(adder.pos, 0, value);
    commit(before);
    adder.pos += 1;
    render(container);
    const box = container.querySelector('#adder-assign-results');
    if (box && scrollTop) box.scrollTop = scrollTop;
  }

  /** Break the current section at the adder's position: everything from that
      point on moves into a new section (given heading) inserted right after.
      The adder then continues inside the new section, at its start. */
  function _splitIntoNewSection(text) {
    const before = clone(sections);
    const items = sections[adder.sec][1];
    const after = items.splice(adder.pos); // truncates items in place, keeps the rest
    sections.splice(adder.sec + 1, 0, [text, after]);
    commit(before);
    adder.sec += 1;
    adder.pos = 0;
    render(container);
  }

  /* ── event binding ── */

  function _openCollapse(el, focusSel) {
    el?.classList.add('open');
    const f = focusSel ? el?.querySelector(focusSel) : null;
    if (f) setTimeout(() => f.focus(), 20);
  }

  function _bindItemEvents() {
    container.querySelectorAll('[data-item-edit]').forEach(btn =>
      btn.addEventListener('click', () => {
        container.querySelectorAll('.sec-item.editing').forEach(b => {
          b.classList.remove('editing');
          b.querySelector('[data-item-form]')?.classList.remove('open');
        });
        const [s, i] = _si(btn.dataset.itemEdit);
        container.querySelector(`.sec-item[data-sec="${s}"][data-item="${i}"]`)?.classList.add('editing');
        _openCollapse(container.querySelector(`[data-item-form="${s}.${i}"]`), '.form-input, .form-textarea');
      })
    );
    container.querySelectorAll('[data-item-cancel]').forEach(btn =>
      btn.addEventListener('click', () => {
        const [s, i] = _si(btn.dataset.itemCancel);
        container.querySelector(`.sec-item[data-sec="${s}"][data-item="${i}"]`)?.classList.remove('editing');
        container.querySelector(`[data-item-form="${s}.${i}"]`)?.classList.remove('open');
      })
    );
    container.querySelectorAll('[data-item-save]').forEach(btn =>
      btn.addEventListener('click', () => {
        const [s, i] = _si(btn.dataset.itemSave);
        const item = sections[s][1][i];
        if (Array.isArray(item)) {
          // word item — edits the actual dictionary entry, not just the reference
          const { entry } = resolveRef(item);
          if (!entry) return;
          const word = (container.querySelector(`[data-word-word="${s}.${i}"]`)?.value || '').trim();
          const pos  = (container.querySelector(`[data-word-pos="${s}.${i}"]`)?.value  || '').trim();
          const def  = (container.querySelector(`[data-word-def="${s}.${i}"]`)?.value  || '').trim();
          if (!word || !def) return;
          updateDictEntry(entry[0], entryId(entry), word, pos, def);
          render(container);
        } else {
          const text = (container.querySelector(`[data-item-ta="${s}.${i}"]`)?.value || '').trim();
          if (!text) return;
          const before = clone(sections);
          sections[s][1][i] = text;
          commit(before);
          render(container);
        }
      })
    );
    container.querySelectorAll('[data-item-up]').forEach(btn =>
      btn.addEventListener('click', () => {
        const [s, i] = _si(btn.dataset.itemUp);
        const before = clone(sections);
        if (_moveItem(s, i, -1)) { commit(before); render(container); }
      })
    );
    container.querySelectorAll('[data-item-down]').forEach(btn =>
      btn.addEventListener('click', () => {
        const [s, i] = _si(btn.dataset.itemDown);
        const before = clone(sections);
        if (_moveItem(s, i, 1)) { commit(before); render(container); }
      })
    );
    container.querySelectorAll('[data-item-del]').forEach(btn =>
      btn.addEventListener('click', async e => {
        const [s, i] = _si(btn.dataset.itemDel);
        const isWord = Array.isArray(sections[s][1][i]);
        if (!await showConfirm(
          isWord ? 'Remove this word from the section?' : 'Delete this paragraph?',
          isWord ? 'remove' : 'delete', e)) return;
        const before = clone(sections);
        sections[s][1].splice(i, 1);
        commit(before);
        render(container);
      })
    );
    container.querySelectorAll('[data-item-fmt]').forEach(btn =>
      btn.addEventListener('click', () => {
        const [kind, s, i] = btn.dataset.itemFmt.split('.');
        const ta = container.querySelector(`[data-item-ta="${s}.${i}"]`);
        if (ta) wrapSelectedText(ta, `<${kind}>`, `</${kind}>`);
      })
    );
    container.querySelectorAll('[data-item-ta]').forEach(ta =>
      ta.addEventListener('keydown', e => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key === 'Enter') { e.preventDefault(); container.querySelector(`[data-item-save="${ta.dataset.itemTa}"]`)?.click(); }
        if (ctrl && e.key === 'b') { e.preventDefault(); wrapSelectedText(ta, '<b>', '</b>'); }
        if (ctrl && e.key === 'i') { e.preventDefault(); wrapSelectedText(ta, '<i>', '</i>'); }
        if (ctrl && e.key === 'u') { e.preventDefault(); wrapSelectedText(ta, '<u>', '</u>'); }
      })
    );

    /* Enter in word-edit inputs → trigger save */
    container.querySelectorAll('[data-word-word], [data-word-pos], [data-word-def]').forEach(input =>
      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const idx = input.dataset.wordWord ?? input.dataset.wordPos ?? input.dataset.wordDef;
        container.querySelector(`[data-item-save="${idx}"]`)?.click();
      })
    );
  }

  function _bindHeadEvents() {
    container.querySelectorAll('[data-head-edit]').forEach(btn =>
      btn.addEventListener('click', () =>
        _openCollapse(container.querySelector(`[data-head-form="${btn.dataset.headEdit}"]`), '.form-textarea'))
    );
    container.querySelectorAll('[data-head-cancel]').forEach(btn =>
      btn.addEventListener('click', () =>
        container.querySelector(`[data-head-form="${btn.dataset.headCancel}"]`)?.classList.remove('open'))
    );
    container.querySelectorAll('[data-head-ta]').forEach(ta =>
      ta.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          container.querySelector(`[data-head-save="${ta.dataset.headTa}"]`)?.click();
        }
      })
    );
    container.querySelectorAll('[data-head-save]').forEach(btn =>
      btn.addEventListener('click', () => {
        const s = Number(btn.dataset.headSave);
        const text = (container.querySelector(`[data-head-ta="${s}"]`)?.value || '').trim();
        if (!text) return;
        const before = clone(sections);
        sections[s][0] = text;
        commit(before);
        render(container);
      })
    );
    container.querySelectorAll('[data-head-up]').forEach(btn =>
      btn.addEventListener('click', () => {
        const s = Number(btn.dataset.headUp);
        if (s <= 0) return;
        const before = clone(sections);
        [sections[s - 1], sections[s]] = [sections[s], sections[s - 1]];
        commit(before); render(container);
      })
    );
    container.querySelectorAll('[data-head-down]').forEach(btn =>
      btn.addEventListener('click', () => {
        const s = Number(btn.dataset.headDown);
        if (s >= sections.length - 1) return;
        const before = clone(sections);
        [sections[s + 1], sections[s]] = [sections[s], sections[s + 1]];
        commit(before); render(container);
      })
    );
    container.querySelectorAll('[data-head-del]').forEach(btn =>
      btn.addEventListener('click', async e => {
        const s = Number(btn.dataset.headDel);
        const n = sections[s][1].length;
        if (!await showConfirm(
          n ? `Delete section "${sections[s][0]}" and its ${n} entr${n === 1 ? 'y' : 'ies'}?`
            : `Delete section "${sections[s][0]}"?`, 'delete', e)) return;
        const before = clone(sections);
        sections.splice(s, 1);
        if (adder && adder.sec === s) adder = null;
        commit(before); render(container);
      })
    );
  }

  /* open the unified adder at a gap (or toggle it closed) */
  function _openAdder(s, pos, mode) {
    if (adder && adder.sec === s && adder.pos === pos) { adder = null; }
    else { adder = { sec: s, pos, mode: mode || 'para', q: '', sel: 0 }; }
    render(container);
  }

  function _bindAdderEvents() {
    container.querySelectorAll('[data-insert]').forEach(btn =>
      btn.addEventListener('click', () => { const [s, p] = _si(btn.dataset.insert); _openAdder(s, p); })
    );
    if (!adder) return;

    /* mode toggle — DOM-only, preserves typed input */
    container.querySelectorAll('[data-adder-mode]').forEach(btn =>
      btn.addEventListener('click', () => {
        adder.mode = btn.dataset.adderMode;
        container.querySelectorAll('[data-adder-mode]').forEach(b =>
          b.classList.toggle('active', b.dataset.adderMode === adder.mode));
        container.querySelectorAll('[data-adder-pane]').forEach(p =>
          p.hidden = p.dataset.adderPane !== adder.mode);
        const addBtn = container.querySelector('#adder-add');
        if (addBtn) addBtn.hidden = adder.mode === 'assign';
        const cancel = container.querySelector('#adder-cancel');
        if (cancel) cancel.textContent = adder.mode === 'assign' ? 'done' : 'cancel';
        const focus = adder.mode === 'para' ? '#adder-para-ta'
                    : adder.mode === 'head' ? '#adder-head-w'
                    : adder.mode === 'word' ? '#adder-word-w' : '#adder-assign-search';
        container.querySelector(focus)?.focus();
        if (adder.mode === 'assign') { adder.sel = 0; _refreshAssign(); }
      })
    );

    container.querySelector('#adder-cancel')?.addEventListener('click', () => { adder = null; render(container); });
    container.querySelector('#adder-add')?.addEventListener('click', _submitAdder);

    const paraTa = container.querySelector('#adder-para-ta');
    if (paraTa) paraTa.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); _submitAdder(); }
    });
    container.querySelectorAll('#adder-head-w, #adder-word-w, #adder-word-p, #adder-word-d').forEach(inp =>
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') _submitAdder(); }));

    const search = container.querySelector('#adder-assign-search');
    if (search) {
      let t = null;
      search.addEventListener('input', e => {
        adder.q = e.target.value;
        adder.sel = 0;
        clearTimeout(t); t = setTimeout(_refreshAssign, 120);
      });
      /* the one-line field is free, so arrows drive the result selection */
      search.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown')    { e.preventDefault(); _moveAssignSel(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); _moveAssignSel(-1); }
        else if (e.key === 'Enter')   { e.preventDefault(); container.querySelector('.assign-result.selected')?.click(); }
      });
    }

    /* focus + populate the open pane */
    const focusSel = adder.mode === 'para' ? '#adder-para-ta'
                   : adder.mode === 'head' ? '#adder-head-w'
                   : adder.mode === 'word' ? '#adder-word-w' : '#adder-assign-search';
    const fe = container.querySelector(focusSel);
    if (fe) setTimeout(() => { fe.focus(); if (fe.value) fe.setSelectionRange(fe.value.length, fe.value.length); }, 20);
    if (adder.mode === 'assign') _refreshAssign();
  }

  function _submitAdder() {
    if (!adder) return;
    if (adder.mode === 'para') {
      const text = (container.querySelector('#adder-para-ta')?.value || '').trim();
      if (!text) return;
      _insertAtAdder(text);
    } else if (adder.mode === 'head') {
      const text = (container.querySelector('#adder-head-w')?.value || '').trim();
      if (!text) return;
      _splitIntoNewSection(text);
    } else if (adder.mode === 'word') {
      const w = (container.querySelector('#adder-word-w')?.value || '').trim();
      const p = (container.querySelector('#adder-word-p')?.value || '').trim();
      const d = (container.querySelector('#adder-word-d')?.value || '').trim();
      if (!w || !d) return;
      const ref = addDictEntry(hasPos ? [w, p, d] : [w, d]);
      _insertAtAdder(clone(ref));
    }
  }

  function _refreshAssign() {
    const box = container.querySelector('#adder-assign-results');
    if (!box) return;
    const results = filterEntries(getDict(), adder.q || '', hasPos);
    if (!results.length) { box.innerHTML = `<div class="sec-empty">No matches.</div>`; return; }
    box.innerHTML = results.map(e => {
      const pos = (hasPos && e[1]) ? `<span class="dict-pos">${esc(e[1])} </span>` : '';
      return `
        <button class="assign-result" data-assign-pick="${encodeURIComponent(JSON.stringify(e))}">
          <span class="dict-word">${esc(e[0])}</span>
          <span class="dict-body">${pos}${esc(e[defIdx] ?? '')}</span>
        </button>`;
    }).join('');
    box.querySelectorAll('[data-assign-pick]').forEach(btn =>
      btn.addEventListener('click', () =>
        _insertAtAdder(refFor(JSON.parse(decodeURIComponent(btn.dataset.assignPick)))))
    );
    _setAssignSel(adder.sel || 0);
  }

  /* Highlight the n-th assign result, clamped to range. */
  function _setAssignSel(n) {
    const els = container.querySelectorAll('.assign-result');
    if (!els.length) return;
    adder.sel = Math.max(0, Math.min(n, els.length - 1));
    els.forEach((el, i) => el.classList.toggle('selected', i === adder.sel));
    els[adder.sel].scrollIntoView({ block: 'nearest' });
  }

  function _moveAssignSel(delta) {
    _setAssignSel((adder.sel || 0) + delta);
  }

  function _bindBottomEvents() {
    const addSec = container.querySelector('#sec-add-section-btn');
    if (addSec) addSec.addEventListener('click', () => {
      const form = container.querySelector('#sec-add-section-form');
      if (form?.classList.contains('open')) form.classList.remove('open');
      else _openCollapse(form, '#sec-new-head-ta');
    });
    const newSave = container.querySelector('#sec-new-head-save');
    if (newSave) newSave.addEventListener('click', _addSection);
    const newTa = container.querySelector('#sec-new-head-ta');
    if (newTa) newTa.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); _addSection(); }
    });
    const newCancel = container.querySelector('#sec-new-head-cancel');
    if (newCancel) newCancel.addEventListener('click', () =>
      container.querySelector('#sec-add-section-form')?.classList.remove('open'));

    /* "+ add paragraph" → open the unified adder at the end of the last section */
    const addPara = container.querySelector('#sec-add-para-btn');
    if (addPara) addPara.addEventListener('click', () => {
      if (!sections.length) return;
      const last = sections.length - 1;
      _openAdder(last, sections[last][1].length, 'para');
    });
  }

  function _addSection() {
    const ta = container.querySelector('#sec-new-head-ta');
    const text = (ta?.value || '').trim();
    if (!text) return;
    const before = clone(sections);
    sections.push([text, []]);
    commit(before);
    render(container);
  }

  /* ── public API ── */
  function render(into) {
    container = into || container;
    if (!container) return;
    container.innerHTML = _bodyHTML();
    _bindHeadEvents();
    _bindItemEvents();
    _bindAdderEvents();
    _bindBottomEvents();
  }

  /* Escape closes the adder, then any open heading or add-section form.
     Only acts while the section view is on screen. */
  function _handleEsc() {
    if (!container || !container.querySelector('.sec-view')) return false;
    if (adder) { adder = null; render(container); return true; }
    const open = container.querySelector('[data-head-form].open, #sec-add-section-form.open');
    if (open) { open.classList.remove('open'); return true; }
    return false;
  }
  registerEscHandler(_handleEsc);

  function handleUndo(dk, restored) {
    if (dk !== sectionsKey) return false;
    sections = restored;
    if (adder && adder.sec >= sections.length) adder = null;
    render(container);
    return true;
  }

  return { render, handleUndo, collectRefIds, updateRef };
}
