/* ================================================================
   textpage.js — sectioned pages (grammar, phonetics, dict-section)

   Data model (localStorage key cfg.dataKey, fallback cfg.dataRaw):
     [ [headingText, items], ... ]
   An item is either a paragraph { text, id }, or a word reference. A reference holds
   only [word], or [word, id] when the word is duplicated in the source. It is
   resolved against the live source at render time, so source edits and deletes
   require no writes here. A reference whose target was deleted renders as such.

   Reordering a heading moves its whole section past the adjacent section.
   ================================================================ */

import {
  esc, withSnippets, registerUndoCallback, pushUndo, wrapSelectedText, showConfirm, hideKeyForEntry,
  randId, tagParaHideKeys, applyHiding, revealHidden, dragHandleHTML, initDragReorder,
  registerEscHandler, filterEntries, discardEditDraft, guardDiscard, formDirty,
  animateIn, animateOut, captureOpenForms, replayCollapse, SVG_CHEVRON, wordFieldsHTML,
} from './utils.js';
import { load, save } from './store.js'
import { AUTH } from './auth.js';

/**
 * Standalone by default. Embedded as a dictionary's section view when cfg.getDict
 * is given; the options below it apply only then.
 *
 * @param {object}   cfg
 * @param {string}   cfg.dataKey       localStorage key
 * @param {Array}    cfg.dataRaw       fallback array
 * @param {Function} cfg.getDict       () => live source array
 * @param {Function} cfg.addDictEntry  (tuple) => reference; adds to the source
 *                                      (persist + undo) and returns the reference
 * @param {Function} cfg.updateDictEntry (oldWord, oldId, word, pos, def) => reference | null;
 *                                      edits a source entry by its current word/id
 *                                      (persist + undo) and returns its new reference
 * @returns {{ render, handleUndo, collectRefIds }}
 */
export function createTextPage(cfg) {
  const { getDict, addDictEntry, updateDictEntry } = cfg;
  const sectionsKey = cfg.dataKey;
  const embedded = !!getDict;
  const idIdx   = 3;                    // source entry [word, pos, def, id?]: id slot, if present
  const defIdx  = 2;

  let sections = load(sectionsKey, cfg.dataRaw);
  let container = null;
  /* the single open "add" panel: { sec, pos, mode, q } | null */
  let adder = null;
  let _adderEnter = false; // animate the adder on its next render

  /* ── helpers ── */
  const clone = x => JSON.parse(JSON.stringify(x));
  const loggedIn = () => AUTH.isLoggedIn();
  const entryId = e => (e.length > idIdx ? e[idIdx] : null);

  /* Collapsed sections: stored in `mv` under "collapsed"; not exported */
  const collapsed = new Set(load('collapsed', {})[sectionsKey] || []);

  function _saveCollapsed() {
    save('collapsed', { ...load('collapsed', {}), [sectionsKey]: [...collapsed] });
  }

  /** Forget collapsed state for headings that no longer exist. */
  function _pruneCollapsed() {
    const live = new Set(sections.map(sec => sec[0]));
    const stale = [...collapsed].filter(h => !live.has(h));
    if (!stale.length) return;
    stale.forEach(h => collapsed.delete(h));
    _saveCollapsed();
  }

  function commit(before) {
    save(sectionsKey, sections);
    pushUndo(sectionsKey, before, clone(sections));
    _pruneCollapsed();
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
    return entry ? { entry, word: ref[0] } : { deleted: true, word: ref[0] };
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

  /* ── item HTML ── */

  function _wordItemHTML(ref, s, i) {
    const { entry, deleted, word } = resolveRef(ref);
    const editable = loggedIn() && !deleted; // nothing to edit for a deleted target
    const actions = loggedIn() ? `
      <div class="entry-actions">
        ${editable ? `<button class="btn btn-sm btn-ghost" data-item-edit="${s}.${i}">edit</button>` : ''}
        <button class="btn btn-sm btn-danger" data-item-del="${s}.${i}" aria-label="remove from section" data-tooltip="remove from section">×</button>
      </div>` : '';
    const refId = ref.length > 1 ? ref[1] : null;
    const wKey = esc(hideKeyForEntry(word, refId, 'word'));
    const dKey = esc(hideKeyForEntry(word, refId, 'def'));
    const body = deleted
      ? `<span class="dict-word" data-hide-key="${wKey}">${esc(word)}</span>
         <span class="dict-body sec-deleted" data-hide-key="${dKey}">deleted from dictionary</span>`
      : `<span class="dict-word" data-hide-key="${wKey}">${esc(entry[0])}</span>
         <span class="dict-body" data-hide-key="${dKey}">${entry[1] ? `<span class="dict-pos">${esc(entry[1])} </span>` : ''}${withSnippets(esc(entry[defIdx] ?? ''))}</span>`;

    const posEditField = editable ? `
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
      <div class="sec-item sec-word" data-sec="${s}" data-item="${i}" data-drag-key="${s}.${i}">
        ${loggedIn() ? dragHandleHTML() : ''}
        <div class="dict-entry">${body}${actions}</div>
        ${editForm}
      </div>`;
  }

  /** Paragraph text → HTML. Lines starting "- " become hanging-indent bullets (.li) */
  function _paraHTML(text) {
    const lines = withSnippets(text).split('\n');
    return lines.map((l, k) => {
      const bullet = l.startsWith('- ');
      const out = bullet ? `<span class="li">${l.slice(2)}</span>` : l;
      return bullet || k === lines.length - 1 ? out : out + '<br>';
    }).join('');
  }

  function _paraItemHTML(item, s, i) {
    const { text, id } = item;

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
            <button class="btn btn-sm btn-danger"  data-item-del="${s}.${i}">delete</button>
            <span style="flex:1"></span>
            <button class="btn btn-sm btn-ghost" data-item-fmt="b.${s}.${i}" aria-label="Bold (Ctrl+B)"      data-tooltip="Bold (Ctrl+B)"      style="font-weight:600">B</button>
            <button class="btn btn-sm btn-ghost" data-item-fmt="i.${s}.${i}" aria-label="Italic (Ctrl+I)"    data-tooltip="Italic (Ctrl+I)"    style="font-style:italic">I</button>
            <button class="btn btn-sm btn-ghost" data-item-fmt="u.${s}.${i}" aria-label="Underline (Ctrl+U)" data-tooltip="Underline (Ctrl+U)" style="text-decoration:underline;text-underline-offset:2px">U</button>
          </div>
        </div></div>
      </div>` : '';
    return `
      <div class="sec-item para-block" data-sec="${s}" data-item="${i}" data-drag-key="${s}.${i}">
        <div class="para-content" data-para-id="${esc(id)}">
          <p>${_paraHTML(text)}</p>
          ${loggedIn() ? `<div class="para-gutter">${dragHandleHTML()}${editBtn}</div>` : ''}
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
      <button class="sec-insert${active}" data-insert="${s}.${pos}" aria-label="add here" data-tooltip="add here">
        <span class="sec-insert-line"></span>
        <span class="sec-insert-plus">+</span>
      </button>`;
  }

  function _adderHTML() {
    const mode = adder.mode;
    const tab = (m, label) =>
      `<button class="view-toggle-btn${mode === m ? ' active' : ''}" data-adder-mode="${m}">${label}</button>`;
    return `
      <div class="sec-adder">
        <div class="view-toggle adder-toggle">
          ${tab('para', 'paragraph')}${tab('head', 'new section')}${embedded ? tab('word', 'word') + tab('assign', 'assign') : ''}
        </div>

        <div class="adder-pane" data-adder-pane="para"${mode === 'para' ? '' : ' hidden'}>
          <textarea class="form-textarea" id="adder-para-ta" rows="6" placeholder="Paragraph text…"></textarea>
        </div>

        <div class="adder-pane" data-adder-pane="head"${mode === 'head' ? '' : ' hidden'}>
          <input class="form-input" id="adder-head-w" placeholder="New section heading…" />
        </div>

        ${embedded ? `
        <div class="adder-pane" data-adder-pane="word"${mode === 'word' ? '' : ' hidden'}>
          ${wordFieldsHTML({ word: 'adder-word-w', pos: 'adder-word-p', def: 'adder-word-d' })}
        </div>

        <div class="adder-pane" data-adder-pane="assign"${mode === 'assign' ? '' : ' hidden'}>
          <input class="form-input" id="adder-assign-search" placeholder="search a word…"
            autocomplete="off" spellcheck="false" value="${esc(adder.q || '')}" />
          <div class="assign-results" id="adder-assign-results"></div>
        </div>
        ` : ''}

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
            <button class="btn btn-sm"             data-head-up="${s}"   aria-label="move section up"   data-tooltip="move section up">↑</button>
            <button class="btn btn-sm"             data-head-down="${s}" aria-label="move section down" data-tooltip="move section down">↓</button>
            <button class="btn btn-sm btn-danger"  data-head-del="${s}">delete section</button>
          </div>
        </div></div>
      </div>` : '';
    return `
      <section class="sec-block${collapsed.has(heading) ? ' collapsed' : ''}" data-sec-block="${s}">
        <div class="sec-head">
          <button class="sec-fold" data-sec-fold="${s}" aria-label="collapse or expand section"
            aria-expanded="${!collapsed.has(heading)}">${SVG_CHEVRON}</button>
          <h1>${esc(heading)}</h1>${headActions}
        </div>
        ${headForm}
        <div class="sec-fold-body"><div class="sec-fold-inner">
          <div class="sec-items" data-sec-items="${s}">${_itemsHTML(items, s)}</div>
        </div></div>
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
        ${embedded ? '' : '<button class="btn btn-sm" id="text-raw-btn">raw edit</button>'}
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
      </div>
      ${embedded ? '' : `
      <div class="edit-collapse" id="raw-form-collapse">
        <div class="edit-collapse-inner"><div class="add-form">
          <div class="add-form-title">Raw edit — paragraphs separated by blank lines; headings start with "# "</div>
          <textarea class="form-textarea raw-edit-area" id="raw-edit-ta" rows="16" spellcheck="false"></textarea>
          <div class="form-actions">
            <button class="btn btn-primary btn-sm" id="raw-apply-btn">apply</button>
            <button class="btn btn-sm" id="raw-cancel-btn">cancel</button>
          </div>
        </div></div>
      </div>`}` : '';
    return `<div class="text-body sec-view${loggedIn() ? ' editing' : ''}">${secs}${bottom}</div>`;
  }

  /* ── parse helpers ── */
  const _si = v => v.split('.').map(Number);

  /* ── mutations ── */
  /** Move the item at fromKey ("s.i") to just before toKey ("s.i") */
  function _dragMoveTo(fromKey, toKey) {
    if (_editorOpen()) return;
    const [fs, fi] = _si(fromKey);
    let [ts, ti] = _si(toKey);
    if (fs === ts && (ti === fi || ti === fi + 1)) return; // dropped back where it started
    const before = clone(sections);
    const [item] = sections[fs][1].splice(fi, 1);
    if (fs === ts && ti > fi) ti -= 1;
    sections[ts][1].splice(ti, 0, item);
    commit(before);
    render(container);
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

  /** True while an adder or any edit form is visible; reordering is locked then. */
  function _editorOpen() {
    return !!adder || !!container.querySelector(
      '[data-item-form].open, [data-head-form].open, #sec-add-section-form.open, #raw-form-collapse.open');
  }

  /** Sections holding an open adder or edit form; these can't be collapsed. */
  function _activeSections() {
    const active = new Set();
    if (adder) active.add(adder.sec);
    container.querySelectorAll('.sec-item.editing').forEach(b => active.add(Number(b.dataset.sec)));
    container.querySelectorAll('[data-head-form].open').forEach(f => active.add(Number(f.dataset.headForm)));
    return active;
  }

  /* Reflect the locks visually: dimmed chevrons and drag handles. Re-run on any DOM class change. */
  const _lockObserver = new MutationObserver(() => _syncLocks());
  function _syncLocks() {
    if (!container) return;
    const active = _activeSections();
    container.querySelectorAll('.sec-block').forEach(b =>
      b.querySelector('.sec-fold')?.classList.toggle('locked', active.has(Number(b.dataset.secBlock))));
    container.classList.toggle('drag-locked', _editorOpen());
  }

  /** Close the adder (confirming first if it has typed input). False if the user keeps it. */
  async function _dismissAdder(ev) {
    if (!adder) return true;
    if (!await guardDiscard(container.querySelector('.sec-adder'), ev)) return false;
    adder = null;
    /* collapse in place (no rebuild) so it overlaps the form opening */
    container.querySelector('.sec-insert.active')?.classList.remove('active');
    animateOut(container.querySelector('.sec-adder'));
    return true;
  }

  /** Close every open edit form (one confirmation if any has changes). False if the user keeps them. */
  async function _dismissEdits(ev) {
    const forms = [...container.querySelectorAll('[data-item-form].open, [data-head-form].open, #sec-add-section-form.open')];
    if (!forms.length) return true;
    if (!await guardDiscard(forms.find(formDirty) ?? null, ev)) return false;
    container.querySelectorAll('.sec-item.editing').forEach(b => b.classList.remove('editing'));
    forms.forEach(f => { f.classList.remove('open'); discardEditDraft(f); });
    return true;
  }

  async function _openItemEdit(s, i, ev) {
    if (!await _dismissAdder(ev)) return;
    container.querySelectorAll('.sec-item.editing').forEach(b => {
      b.classList.remove('editing');
      const f = b.querySelector('[data-item-form]');
      f?.classList.remove('open');
      discardEditDraft(f);
    });
    const block = container.querySelector(`.sec-item[data-sec="${s}"][data-item="${i}"]`);
    revealHidden(block);
    block?.classList.add('editing');
    _openCollapse(container.querySelector(`[data-item-form="${s}.${i}"]`), '.form-input, .form-textarea');
  }

  function _bindItemEvents() {
    container.querySelectorAll('[data-item-edit]').forEach(btn =>
      btn.addEventListener('click', e => _openItemEdit(..._si(btn.dataset.itemEdit), e))
    );
    container.querySelectorAll('[data-item-cancel]').forEach(btn =>
      btn.addEventListener('click', async e => {
        const [s, i] = _si(btn.dataset.itemCancel);
        if (!await guardDiscard(container.querySelector(`[data-item-form="${s}.${i}"]`), e)) return;
        container.querySelector(`.sec-item[data-sec="${s}"][data-item="${i}"]`)?.classList.remove('editing');
        const f = container.querySelector(`[data-item-form="${s}.${i}"]`);
        f?.classList.remove('open');
        discardEditDraft(f);
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
          revealHidden(container.querySelector(`.sec-item[data-sec="${s}"][data-item="${i}"]`));
        } else {
          const text = (container.querySelector(`[data-item-ta="${s}.${i}"]`)?.value || '').trim();
          if (!text) return;
          const before = clone(sections);
          sections[s][1][i] = { text, id: item.id };
          commit(before);
          render(container);
          revealHidden(container.querySelector(`.sec-item[data-sec="${s}"][data-item="${i}"]`));
        }
      })
    );
    container.querySelectorAll('[data-item-del]').forEach(btn =>
      btn.addEventListener('click', async e => {
        const [s, i] = _si(btn.dataset.itemDel);
        const isWord = Array.isArray(sections[s][1][i]);
        revealHidden(container.querySelector(`.sec-item[data-sec="${s}"][data-item="${i}"]`));
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

  /** Sync every section's collapsed class with the state. */
  function _applyFold() {
    container.querySelectorAll('.sec-block').forEach(b => {
      const c = collapsed.has(sections[Number(b.dataset.secBlock)][0]);
      if (b.classList.contains('collapsed') !== c) {
        /* clip the content only while it animates: clipping at rest would cut off the gutter handles */
        b.classList.add('folding');
        clearTimeout(b._foldTimer);
        const ms = parseFloat(getComputedStyle(b.querySelector('.sec-fold-body')).transitionDuration) * 1000 || 0;
        b._foldTimer = setTimeout(() => b.classList.remove('folding'), ms + 30);
      }
      b.classList.toggle('collapsed', c);
      b.querySelector('.sec-fold')?.setAttribute('aria-expanded', String(!c));
    });
  }

  function _toggleFold(s) {
    const heading = sections[s][0];
    if (_activeSections().has(s)) return; // its editor/adder is open
    if (collapsed.has(heading)) collapsed.delete(heading); else collapsed.add(heading);
    _saveCollapsed();
    _applyFold();
  }

  /* Same query as the chevron's CSS: hover devices get the chevron, the rest tap the heading. */
  const _hoverDevice = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function _bindHeadEvents() {
    container.querySelectorAll('[data-sec-fold]').forEach(btn =>
      btn.addEventListener('click', () => _toggleFold(Number(btn.dataset.secFold)))
    );
    container.querySelectorAll('.sec-head > h1').forEach(h =>
      h.addEventListener('click', () => {
        if (!_hoverDevice()) _toggleFold(Number(h.closest('.sec-block').dataset.secBlock));
      })
    );
    container.querySelectorAll('[data-head-edit]').forEach(btn =>
      btn.addEventListener('click', async e => {
        if (!await _dismissAdder(e)) return;
        _openCollapse(container.querySelector(`[data-head-form="${btn.dataset.headEdit}"]`), '.form-textarea');
      })
    );
    container.querySelectorAll('[data-head-cancel]').forEach(btn =>
      btn.addEventListener('click', async e => {
        const f = container.querySelector(`[data-head-form="${btn.dataset.headCancel}"]`);
        if (!await guardDiscard(f, e)) return;
        f?.classList.remove('open');
        discardEditDraft(f);
      })
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
        if (collapsed.delete(sections[s][0])) { collapsed.add(text); _saveCollapsed(); } // carry state over a rename
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
  async function _openAdder(s, pos, mode, ev) {
    if (adder && adder.sec === s && adder.pos === pos) { adder = null; render(container); return; }
    const closing = captureOpenForms(container); // replayed after the rebuild
    if (!await _dismissEdits(ev)) return;
    if (collapsed.delete(sections[s][0])) _saveCollapsed(); // a hidden adder is useless
    adder = { sec: s, pos, mode: mode || 'para', q: '', sel: 0 };
    _adderEnter = true;
    render(container);
    replayCollapse(container, closing);
  }

  function _bindAdderEvents() {
    container.querySelectorAll('[data-insert]').forEach(btn =>
      btn.addEventListener('click', e => { const [s, p] = _si(btn.dataset.insert); _openAdder(s, p, undefined, e); })
    );
    if (!adder) return;
    if (_adderEnter) { _adderEnter = false; animateIn(container.querySelector('.sec-adder')); }

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
      _insertAtAdder({ text, id: randId() });
    } else if (adder.mode === 'head') {
      const text = (container.querySelector('#adder-head-w')?.value || '').trim();
      if (!text) return;
      _splitIntoNewSection(text);
    } else if (adder.mode === 'word') {
      const w = (container.querySelector('#adder-word-w')?.value || '').trim();
      const p = (container.querySelector('#adder-word-p')?.value || '').trim();
      const d = (container.querySelector('#adder-word-d')?.value || '').trim();
      if (!w || !d) return;
      const ref = addDictEntry([w, p, d]);
      _insertAtAdder(clone(ref));
    }
  }

  function _refreshAssign() {
    const box = container.querySelector('#adder-assign-results');
    if (!box) return;
    const results = filterEntries(getDict(), adder.q || '');
    if (!results.length) { box.innerHTML = `<div class="sec-empty">No matches.</div>`; return; }
    box.innerHTML = results.map(e => {
      const pos = e[1] ? `<span class="dict-pos">${esc(e[1])} </span>` : '';
      const wKey = esc(hideKeyForEntry(e[0], entryId(e), 'word'));
      const dKey = esc(hideKeyForEntry(e[0], entryId(e), 'def'));
      return `
        <button class="assign-result" data-assign-pick="${encodeURIComponent(JSON.stringify(e))}">
          <span class="dict-word" data-hide-key="${wKey}">${esc(e[0])}</span>
          <span class="dict-body" data-hide-key="${dKey}">${pos}${withSnippets(esc(e[defIdx] ?? ''))}</span>
        </button>`;
    }).join('');
    box.querySelectorAll('[data-assign-pick]').forEach(btn =>
      btn.addEventListener('click', e => {
        e.stopPropagation();
        _insertAtAdder(refFor(JSON.parse(decodeURIComponent(btn.dataset.assignPick))));
      })
    );
    _setAssignSel(adder.sel || 0);
    applyHiding(box);
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
    if (addSec) addSec.addEventListener('click', async e => {
      const form = container.querySelector('#sec-add-section-form');
      if (form?.classList.contains('open')) { form.classList.remove('open'); return; }
      if (!await _dismissAdder(e)) return;
      _openCollapse(container.querySelector('#sec-add-section-form'), '#sec-new-head-ta'); // re-query: render may have rebuilt it
    });
    const newSave = container.querySelector('#sec-new-head-save');
    if (newSave) newSave.addEventListener('click', _addSection);
    const newTa = container.querySelector('#sec-new-head-ta');
    if (newTa) newTa.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); _addSection(); }
    });
    const newCancel = container.querySelector('#sec-new-head-cancel');
    if (newCancel) newCancel.addEventListener('click', async e => {
      const f = container.querySelector('#sec-add-section-form');
      if (!await guardDiscard(f, e)) return;
      f?.classList.remove('open');
      discardEditDraft(f);
    });

    /* raw edit (standalone only): the whole page as blank-line-separated text */
    const rawBtn = container.querySelector('#text-raw-btn');
    if (rawBtn) {
      const rawForm = container.querySelector('#raw-form-collapse');
      const rawTa = container.querySelector('#raw-edit-ta');
      const closeRaw = () => { rawForm.classList.remove('open'); rawBtn.textContent = 'raw edit'; };
      rawBtn.addEventListener('click', async e => {
        if (rawForm.classList.contains('open')) { closeRaw(); return; }
        if (!await _dismissAdder(e) || !await _dismissEdits(e)) return;
        rawTa.value = _sectionsToRaw();
        _openCollapse(rawForm, '#raw-edit-ta');
        rawBtn.textContent = 'close raw edit';
      });
      rawTa.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          container.querySelector('#raw-apply-btn').click();
        }
      });
      container.querySelector('#raw-apply-btn').addEventListener('click', () => {
        const before = clone(sections);
        sections = _rawToSections(rawTa.value);
        commit(before);
        render(container);
      });
      container.querySelector('#raw-cancel-btn').addEventListener('click', closeRaw);
    }

    /* "+ add paragraph" → open the unified adder at the end of the last section */
    const addPara = container.querySelector('#sec-add-para-btn');
    if (addPara) addPara.addEventListener('click', e => {
      if (!sections.length) return;
      const last = sections.length - 1;
      _openAdder(last, sections[last][1].length, 'para', e);
    });
  }

  /* Raw edit text: headings as "# heading" paragraphs, items as their text.
     Rewrites the whole page, so old and new paragraphs can't be paired: every
     paragraph gets a fresh id (which resets its spoiler state). Text before the
     first heading goes under "tbd". */
  function _sectionsToRaw() {
    return sections.map(([heading, items]) =>
      ['# ' + heading, ...items.map(it => it.text)].join('\n\n')).join('\n\n');
  }

  function _rawToSections(raw) {
    const out = [];
    raw.split('\n\n').map(t => t.trim()).filter(Boolean).forEach(text => {
      if (text.startsWith('# ')) { out.push([text.slice(2), []]); return; }
      if (!out.length) out.push(['tbd', []]);
      out[out.length - 1][1].push({ text, id: randId() });
    });
    return out;
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
    initDragReorder(container, _dragMoveTo, key => _openItemEdit(..._si(key)), () => !_editorOpen());
    _lockObserver.disconnect();
    _lockObserver.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    _syncLocks();
    tagParaHideKeys(container);
    applyHiding(container);
  }

  /* Escape closes the adder, then any open heading or add-section form.
     Only acts while the section view is on screen. */
  function _handleEsc() {
    if (!container || !container.querySelector('.sec-view')) return false;
    if (adder) { adder = null; render(container); return true; }
    const open = container.querySelector('[data-head-form].open, #sec-add-section-form.open');
    if (open) { open.classList.remove('open'); discardEditDraft(open); return true; }
    const editing = container.querySelectorAll('.sec-item.editing');
    if (editing.length) {
      editing.forEach(b => {
        b.classList.remove('editing');
        const f = b.querySelector('[data-item-form]');
        f?.classList.remove('open');
        discardEditDraft(f);
      });
      return true;
    }
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

  /* Standalone pages own their undo callback and page shell; an embedding host
     (the dictionary) provides both. */
  if (!embedded) registerUndoCallback(handleUndo);

  function renderPage(into) {
    if (into || embedded) { render(into); return; }
    document.getElementById('app').innerHTML = `
      <main class="page">
        <div class="page-header">
          <h1 class="page-title">Meuvid</h1>
        </div>
        <div id="text-root"></div>
      </main>`;
    render(document.getElementById('text-root'));
  }

  return { render: renderPage, handleUndo, collectRefIds, updateRef };
}
