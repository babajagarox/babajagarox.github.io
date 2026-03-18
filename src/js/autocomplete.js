/**
 * autocomplete.js
 * Type-field autocomplete dropdown.
 *
 * Usage:
 *   showAC(inputId, forceAll)  — open/refresh dropdown
 *   applyAC(inputId, value)    — pick a value, fire input event
 *   closeAC()                  — remove dropdown
 *   acKeydown(event, inputId)  — keyboard navigation
 *   typeInputHTML(val, id, updaterCall) — returns HTML string for a type input cell
 */

import { S } from './settings.js';

const BUILTIN_TYPES = [
  'BOOLEAN',
  'VARCHAR2(255)','VARCHAR2(500)','VARCHAR2(2000)','VARCHAR2(4000)','VARCHAR2(32767)',
  'NVARCHAR2(255)','CHAR(1)','CHAR(10)',
  'NUMBER','NUMBER(5)','NUMBER(10)','NUMBER(15,2)','NUMBER(20)','NUMBER(38)',
  'INTEGER','PLS_INTEGER','BINARY_INTEGER','SIMPLE_INTEGER',
  'DATE','TIMESTAMP','TIMESTAMP(6)',
  'TIMESTAMP WITH TIME ZONE','TIMESTAMP WITH LOCAL TIME ZONE',
  'INTERVAL YEAR TO MONTH','INTERVAL DAY TO SECOND',
  'CLOB','BLOB','NCLOB','XMLTYPE','RAW(255)','SYS_REFCURSOR',
  'SIMPLE_FLOAT','SIMPLE_DOUBLE',
];

/** Returns the full ordered type list (custom + builtin per settings). */
export function typeList() {
  const custom = Array.isArray(S.customTypes) ? S.customTypes : [];
  if (!custom.length) return BUILTIN_TYPES;
  return S.customTypesTop
    ? [...custom, ...BUILTIN_TYPES]
    : [...BUILTIN_TYPES, ...custom];
}

/** Current keyboard-navigation cursor index. */
let acFi = 0;

/**
 * Open or refresh the autocomplete dropdown for a given input.
 * @param {string} inputId  - DOM id of the target input
 * @param {boolean} forceAll - true on focus (show all), false on input (filter)
 */
export function showAC(inputId, forceAll) {
  closeAC();
  const el = document.getElementById(inputId);
  if (!el) return;

  const full      = typeList();
  const customSet = new Set(Array.isArray(S.customTypes) ? S.customTypes : []);
  const hasCustom = customSet.size > 0;

  // Filtering logic:
  //   focus  → show all (forceAll = true)
  //   input  → filter, BUT if current value exactly matches a known type show all
  //            (prevents pre-filled default from collapsing the list on first focus)
  let hits;
  if (forceAll) {
    hits = full;
  } else {
    const q = el.value.trim().toLowerCase();
    const exactMatch = full.some(t => t.toLowerCase() === q);
    hits = (q === '' || exactMatch) ? full : full.filter(t => t.toLowerCase().includes(q));
  }

  if (!hits.length) return;
  const shown = hits.slice(0, 24);

  acFi = 0;
  const wrap = el.closest('.acwrap');
  const drop = document.createElement('div');
  drop.className  = 'acdrop';
  drop.id         = 'acdrop';
  drop.dataset.for = inputId;

  const showSections = hasCustom && (forceAll || hits.length === full.length);
  let lastSection = null;
  let itemIdx     = 0;

  shown.forEach(t => {
    const isCustom  = hasCustom && customSet.has(t);
    const section   = isCustom ? 'custom' : 'builtin';

    if (showSections && lastSection !== null && section !== lastSection) {
      const sep = document.createElement('div');
      sep.className   = 'acitem ac-sep';
      sep.textContent = isCustom ? '★ Custom types' : 'Built-in types';
      drop.appendChild(sep);
    }
    lastSection = section;

    const item = document.createElement('div');
    item.dataset.val = t;
    item.dataset.idx = String(itemIdx);
    item.onmousedown = ev => { ev.preventDefault(); applyAC(inputId, t); };
    // Set textContent BEFORE className to avoid wiping classList
    item.textContent = t;
    item.className   = 'acitem' + (isCustom ? ' ac-custom' : '') + (itemIdx === 0 ? ' hi' : '');
    drop.appendChild(item);
    itemIdx++;
  });

  if (itemIdx > 0) wrap.appendChild(drop);
}

/**
 * Pick a value: write it into the input and fire the input event
 * so the state updater (oninput handler) runs.
 */
export function applyAC(inputId, val) {
  const el = document.getElementById(inputId);
  if (el) {
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  closeAC();
}

/** Remove the dropdown. */
export function closeAC() {
  document.getElementById('acdrop')?.remove();
  acFi = 0;
}

/** Keyboard navigation handler — wire to onkeydown of the input. */
export function acKeydown(event, inputId) {
  const drop = document.getElementById('acdrop');
  if (!drop || drop.dataset.for !== inputId) return;
  const items = [...drop.querySelectorAll('.acitem:not(.ac-sep)')];
  if (!items.length) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    acFi = Math.min(acFi + 1, items.length - 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    acFi = Math.max(acFi - 1, 0);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    applyAC(inputId, items[acFi].dataset.val);
    return;
  } else if (event.key === 'Escape') {
    closeAC();
    return;
  }
  items.forEach((it, i) => it.classList.toggle('hi', i === acFi));
}

/**
 * Build the HTML string for a type-input cell (used in param grids).
 * `updaterCall` is a JS expression called from oninput, e.g.:
 *   "setParamType('_abc','_xyz',this.value)"
 */
export function typeInputHTML(currentVal, inputId, updaterCall) {
  const v = (currentVal || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  return `<div class="acwrap">` +
    `<input type="text" id="${inputId}" value="${v}" placeholder="type"` +
    ` oninput="${updaterCall};window.PLSQL.showAC('${inputId}',false)"` +
    ` onfocus="window.PLSQL.showAC('${inputId}',true)"` +
    ` onkeydown="window.PLSQL.acKeydown(event,'${inputId}')" />` +
    `</div>`;
}

// Close on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.acwrap')) closeAC();
});
