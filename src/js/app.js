/**
 * app.js
 * Main controller — wires state, renderer, codegen and DOM together.
 * Exposes window.PLSQL as the global API for inline HTML event handlers.
 */

import { loadSettings, saveFromForm, populateForm,
         addCustomType, removeCustomType, resetSettings,
         exportSettings, importSettings } from './settings.js';
import { showAC, applyAC, closeAC, acKeydown } from './autocomplete.js';
import {
  methods, ui,
  addMethod, removeMethod, updateMethod,
  toggleMethodOpen, toggleMethodPrivate, reorderMethods, toggleAllOpen,
  getOrderedMethods, clearMethods,
  addParam, removeParam, updateParam,
  addCursorParam, removeCursorParam, updateCursorParam, copyParamsAsCursorParams,
  addLocalCursor, removeLocalCursor, updateLocalCursor, toggleLocalCursorOpen,
  addLocalCursorParam, removeLocalCursorParam, updateLocalCursorParam,
  copyMethodParamsToLocalCursor, copyAnySourceToLocalCursor,
  findMethod, findLC,
  cursorBaseName, cursorFullName,
} from './state.js';
import { buildMethodCardHTML, buildParamsHTML, buildCursorParamRowsHTML, buildLocalCursorsListHTML, buildLCCopyDropdownOptions, esc } from './renderer.js';
import { buildSpec, buildBody } from './codegen.js';

// ── module-level UI state ──────────────────────────────────
let curTab = 'spec';
let focusNext = null;

// ── DOM helpers ────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── view switching ─────────────────────────────────────────
function showSettings() {
  populateForm();
  $('viewMain').classList.remove('active');
  $('viewSettings').classList.add('active');
}

function hideSettings() {
  $('viewSettings').classList.remove('active');
  $('viewMain').classList.add('active');
}

function saveSettingsAndClose() {
  saveFromForm();
  hideSettings();
}

function switchStab(el, id) {
  document.querySelectorAll('.stab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.stab-panel').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  $(id).classList.add('on');
}

// ── output tab ─────────────────────────────────────────────
function switchTab(t) {
  curTab = t;
  $('tSpec').classList.toggle('on', t === 'spec');
  $('tBody').classList.toggle('on', t === 'body');
  const se = $('cSpec'), be = $('cBody');
  if (se.style.display !== 'none' || be.style.display !== 'none') {
    se.style.display = t === 'spec' ? 'block' : 'none';
    be.style.display = t === 'body' ? 'block' : 'none';
  }
}

function copyCode() {
  const el = curTab === 'spec' ? $('cSpec') : $('cBody');
  if (el && el.style.display !== 'none') {
    navigator.clipboard.writeText(el.textContent || '').catch(() => {});
  }
}

// ── generate ───────────────────────────────────────────────
function generate() {
  const name    = ($('pkgName').value || 'PKG_UNNAMED').toUpperCase();
  const schema  = ($('pkgSchema').value || '').toUpperCase();
  const authid  = $('pkgAuthid').value;
  const purpose = $('pkgPurpose').value || '';
  const genBody = $('chkBody').checked;
  const ordered = $('chkOrd').checked ? getOrderedMethods() : [...methods];
  const fqn     = schema ? `${schema}.${name}` : name;

  $('phMsg').style.display  = 'none';
  $('cSpec').textContent    = buildSpec(fqn, schema, authid, ordered, purpose);
  $('cBody').textContent    = genBody ? buildBody(fqn, schema, authid, ordered, purpose) : '-- BODY generation disabled';
  $('cSpec').style.display  = curTab === 'spec' ? 'block' : 'none';
  $('cBody').style.display  = curTab === 'body' ? 'block' : 'none';
  $('tBody').style.opacity  = genBody ? '1' : '.4';
}

function clearAll() {
  // clear methods (mutate in place to preserve references)
  clearMethods();
  ['pkgName', 'pkgSchema', 'pkgPurpose'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('pkgAuthid').value    = '';
  $('chkOrd').checked     = false;
  $('chkBody').checked    = true;
  $('phMsg').style.display = 'flex';
  $('cSpec').style.display = 'none';
  $('cBody').style.display = 'none';
  focusNext = 'pkgName';
  fullRender();
}

// ── full DOM render ────────────────────────────────────────
function fullRender() {
  const list     = $('mlist');
  const ordered  = $('chkOrd')?.checked;
  const display  = ordered ? getOrderedMethods() : [...methods];
  const copyable = methods.filter(m => (m.type === 'PROCEDURE' || m.type === 'FUNCTION') && m.params.length > 0);

  // collapse/expand button label
  const colBtn = $('btnColExp');
  if (colBtn) colBtn.textContent = ui.allCollapsed ? 'Expand all' : 'Collapse all';

  if (!display.length) {
    list.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--tx3);padding:.75rem">No methods — add one above</div>';
    applyFocus();
    return;
  }

  list.innerHTML = display.map(m => buildMethodCardHTML(m, copyable, methods)).join('');
  setupDrag();
  applyFocus();
}

function applyFocus() {
  if (!focusNext) return;
  const el = $(focusNext);
  if (el) {
    el.focus();
    // Place caret at end of existing value (e.g. after 'cp_') rather than
    // selecting all — selecting would immediately overwrite the prefix on keypress.
    const len = (el.value || '').length;
    try { el.setSelectionRange(len, len); } catch (e) {}
  }
  focusNext = null;
}

// ── surgical patch helpers (avoid full re-render on param add/remove) ──
function patchParams(mId) {
  const m = findMethod(mId);
  if (!m) return;
  const c = $('params_' + mId);
  if (c) { c.innerHTML = buildParamsHTML(m); applyFocus(); }
}

function patchCursorParams(mId) {
  const m = findMethod(mId);
  if (!m) return;
  const c = $('cparams_' + mId);
  if (c) { c.innerHTML = buildCursorParamRowsHTML(m.cursorParams, mId, null, 'cpn_', 'cp'); applyFocus(); }
}

function patchLCParams(mId, cId) {
  const lc = findLC(mId, cId);
  if (!lc) return;
  const el = $('lcparams_' + cId);
  if (el) { el.innerHTML = buildCursorParamRowsHTML(lc.cursorParams, mId, cId, 'lcpn_', 'lcp'); applyFocus(); }
}

function patchLocalCursors(mId) {
  const m = findMethod(mId);
  if (!m) return;
  const c = $('lclist_' + mId);
  if (c) { c.innerHTML = buildLocalCursorsListHTML(m, methods); applyFocus(); }
}

/**
 * Refresh only the copy-from <select> inside every visible local cursor block.
 * Called after any operation that changes the method list or param counts so
 * that dropdowns on already-rendered cards stay up to date without a full re-render.
 */
function refreshAllLCDropdowns() {
  const newOptions = buildLCCopyDropdownOptions(methods);
  document.querySelectorAll('[id^="lcCopySrc_"]').forEach(sel => {
    // Remember the currently selected value so we can restore it if it still exists
    const prev = sel.value;
    sel.innerHTML = newOptions;
    // Restore previous selection if that method still exists
    if (prev && sel.querySelector(`option[value="${prev}"]`)) {
      sel.value = prev;
    }
  });
}

// ── drag & drop reorder ────────────────────────────────────
let dragFrom = null;

// Tags that should never trigger card drag when clicked/focused
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LABEL', 'A']);

function setupDrag() {
  document.querySelectorAll('.mcard[draggable]').forEach(card => {
    card.ondragstart = e => {
      // Cancel drag if the pointer is on or inside an editable/interactive element
      if (EDITABLE_TAGS.has(e.target.tagName) || e.target.closest('input, textarea, select, button, label')) {
        e.preventDefault();
        return;
      }
      dragFrom = card.dataset.id;
      card.classList.add('dragging');
    };
    card.ondragend   = () => { card.classList.remove('dragging'); card.style.outline = ''; };
    card.ondragover  = e  => { e.preventDefault(); card.style.outline = '2px solid #534AB7'; };
    card.ondragleave = ()  => { card.style.outline = ''; };
    card.ondrop      = e  => {
      e.preventDefault();
      card.style.outline = '';
      if (!dragFrom || dragFrom === card.dataset.id) return;
      reorderMethods(dragFrom, card.dataset.id);
      fullRender();
    };
  });
}

// ── collapse/expand all ────────────────────────────────────
function toggleAllCards() {
  const nowCollapsed = !ui.allCollapsed;
  toggleAllOpen(nowCollapsed);
  methods.forEach(m => {
    const b  = $('mb_' + m.id);
    const ch = $('ch_' + m.id);
    if (b)  b.classList.toggle('open', m.open);
    if (ch) ch.textContent = m.open ? '▲' : '▼';
  });
  const btn = $('btnColExp');
  if (btn) btn.textContent = nowCollapsed ? 'Expand all' : 'Collapse all';
}

// ── global API exposed to inline HTML handlers ─────────────
// All oninput/onclick attributes call window.PLSQL.xxx()
window.PLSQL = {
  // views
  showSettings, hideSettings, saveSettings: saveSettingsAndClose,
  switchStab, switchTab, copyCode, generate, clearAll,

  // settings
  addCustomType, removeCustomType, resetSettings, exportSettings, importSettings,

  // output
  toggleAllCards,

  // method mutations
  addM(type)   { const m = addMethod(type); focusNext = 'mn_' + m.id; fullRender(); },
  removeM(id)  { removeMethod(id); fullRender(); },
  toggleOpen(id) {
    toggleMethodOpen(id);
    const m  = findMethod(id);
    const b  = $('mb_' + id);
    const ch = $('ch_' + id);
    if (b)  b.classList.toggle('open', m?.open);
    if (ch) ch.textContent = m?.open ? '▲' : '▼';
  },
  togglePriv(id) { toggleMethodPrivate(id); fullRender(); },
  updM(id, field, value) {
    updateMethod(id, field, value);
    // If name changed, option labels in other cards' dropdowns are stale
    if (field === 'name') refreshAllLCDropdowns();
  },
  fullRender,

  // param type setters (called from oninput on type inputs)
  setParamType:       (mId, pId, v) => updateParam(mId, pId, 'type', v),
  setCursorParamType: (mId, pId, v) => updateCursorParam(mId, pId, 'type', v),
  setLCParamType:     (mId, cId, pId, v) => updateLocalCursorParam(mId, cId, pId, 'type', v),
  setReturnType:      (mId, v) => updateMethod(mId, 'returnType', v),

  // params
  addP(mId)            { const p = addParam(mId); focusNext = 'pn_' + p.id; patchParams(mId); refreshAllLCDropdowns(); },
  removeP(mId, pId)    { removeParam(mId, pId); patchParams(mId); refreshAllLCDropdowns(); },
  updP:                updateParam,

  // cursor params
  addCP(mId)           { const p = addCursorParam(mId); focusNext = 'cpn_' + p.id; patchCursorParams(mId); refreshAllLCDropdowns(); },
  removeCP(mId, pId)   { removeCursorParam(mId, pId); patchCursorParams(mId); refreshAllLCDropdowns(); },
  updCP:               updateCursorParam,
  copyFuncParamsAsCursor(mId) {
    const srcId = $('cpSrcSel_' + mId)?.value;
    if (!srcId || !copyParamsAsCursorParams(mId, srcId)) { alert('No params to copy.'); return; }
    patchCursorParams(mId);
    refreshAllLCDropdowns();
  },

  // local cursors
  addLC(mId)           { const c = addLocalCursor(mId); if (!c) return; focusNext = 'lcn_' + c.id; patchLocalCursors(mId); },
  removeLC(mId, cId)   { removeLocalCursor(mId, cId); patchLocalCursors(mId); },
  toggleLC(mId, cId) {
    const open = toggleLocalCursorOpen(mId, cId);
    const b  = $('lcb_' + cId);
    const ch = $('lcc_' + cId);
    if (b)  b.classList.toggle('open', open);
    if (ch) ch.textContent = open ? '▲' : '▼';
  },
  updLC: updateLocalCursor,

  // local cursor params
  addLCP(mId, cId)           { const p = addLocalCursorParam(mId, cId); if (!p) return; focusNext = 'lcpn_' + p.id; patchLCParams(mId, cId); },
  removeLCP(mId, cId, pId)   { removeLocalCursorParam(mId, cId, pId); patchLCParams(mId, cId); },
  updLCP: updateLocalCursorParam,
  copyParamsToLC(mId, cId) {
    if (!copyMethodParamsToLocalCursor(mId, cId)) { alert('No params to copy.'); return; }
    patchLCParams(mId, cId);
  },
  copySourceToLC(mId, cId) {
    const srcId = document.getElementById('lcCopySrc_' + cId)?.value;
    if (!srcId) { alert('Select a source from the dropdown first.'); return; }
    if (!copyAnySourceToLocalCursor(mId, cId, srcId)) { alert('Selected source has no params to copy.'); return; }
    patchLCParams(mId, cId);
  },

  // autocomplete (called from typeInputHTML-generated handlers)
  showAC, applyAC, closeAC, acKeydown,

  // cursor name utils (used in renderer inline scripts)
  cfn: cursorFullName,
  cbn: cursorBaseName,
};

// ── bootstrap ──────────────────────────────────────────────
loadSettings();
$('chkOrd').addEventListener('change', fullRender);
fullRender();
