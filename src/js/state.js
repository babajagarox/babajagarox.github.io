/**
 * state.js
 * App state: the methods array and all mutation functions.
 * No DOM access here — pure data model.
 */

import { S } from './settings.js';

// ── state ──────────────────────────────────────────────────
export let methods = [];

// Wrapped in an object so the imported binding stays live across modules.
// Read as:  import { ui } from './state.js'  then  ui.allCollapsed
export const ui = { allCollapsed: false };

/** Returns the current default type from settings. */
export const defType = () => S.defaultType || 'VARCHAR2';

// ── id helpers ─────────────────────────────────────────────
const uid = () => '_' + Math.random().toString(36).slice(2, 8);

// ── factories ──────────────────────────────────────────────
export function makeMethod(type) {
  return {
    id:              uid(),
    name:            '',
    type,
    purpose:         '',
    params:          [],
    returnType:      'BOOLEAN',
    indexedBy:       'PLS_INTEGER',
    indexedByCustom: '',
    recordRef:       '',
    open:            true,
    isPrivate:       false,
    // cursor-specific
    cursorParams:    [],
    selectSql:       '',
    declareRowVar:   false,
    // proc/func inline cursors
    localCursors:    [],
  };
}

export function makeLocalCursor() {
  return {
    id:           uid(),
    name:         '',
    cursorParams: [],
    selectSql:    '',
    declareRowVar: false,
    open:          true,
  };
}

// ── finders ────────────────────────────────────────────────
export const findMethod  = id    => methods.find(m => m.id === id);
export const findParam   = (mId, pId)  => findMethod(mId)?.params.find(p => p.id === pId);
export const findCParam  = (mId, pId)  => findMethod(mId)?.cursorParams?.find(p => p.id === pId);
export const findLC      = (mId, cId)  => findMethod(mId)?.localCursors?.find(c => c.id === cId);
export const findLCParam = (mId, cId, pId) => findLC(mId, cId)?.cursorParams?.find(p => p.id === pId);

// ── method mutations ───────────────────────────────────────
export function addMethod(type) {
  const m = makeMethod(type);
  methods.push(m);
  return m;
}

export function removeMethod(id) {
  methods = methods.filter(m => m.id !== id);
}

export function updateMethod(id, field, value) {
  const m = findMethod(id);
  if (m) m[field] = value;
}

export function toggleMethodOpen(id) {
  const m = findMethod(id);
  if (m) m.open = !m.open;
  return m?.open;
}

export function toggleMethodPrivate(id) {
  const m = findMethod(id);
  if (m) m.isPrivate = !m.isPrivate;
}

export function reorderMethods(fromId, toId) {
  const fi = methods.findIndex(m => m.id === fromId);
  const ti = methods.findIndex(m => m.id === toId);
  if (fi < 0 || ti < 0) return;
  const [moved] = methods.splice(fi, 1);
  methods.splice(ti, 0, moved);
}

export function toggleAllOpen(collapse) {
  ui.allCollapsed = collapse;
  methods.forEach(m => { m.open = !collapse; });
}

// ── param mutations ────────────────────────────────────────
export function addParam(mId) {
  const p = { id: uid(), name: '', mode: 'IN', type: defType(), def: '' };
  findMethod(mId)?.params.push(p);
  return p;
}

export function removeParam(mId, pId) {
  const m = findMethod(mId);
  if (m) m.params = m.params.filter(p => p.id !== pId);
}

export function updateParam(mId, pId, field, value) {
  const p = findParam(mId, pId);
  if (p) p[field] = value;
}

// ── cursor param mutations (standalone CURSOR type) ────────
export function addCursorParam(mId) {
  const name = S.autoPrefixCursorParams ? 'cp_' : '';
  const p = { id: uid(), name, mode: 'IN', type: defType() };
  findMethod(mId)?.cursorParams.push(p);
  return p;
}

export function removeCursorParam(mId, pId) {
  const m = findMethod(mId);
  if (m) m.cursorParams = m.cursorParams.filter(p => p.id !== pId);
}

export function updateCursorParam(mId, pId, field, value) {
  const p = findCParam(mId, pId);
  if (p) p[field] = value;
}

export function copyParamsAsCursorParams(mId, srcId) {
  const src = findMethod(srcId);
  const dst = findMethod(mId);
  if (!src?.params.length || !dst) return false;
  dst.cursorParams = src.params.map(p => ({
    id: uid(), name: 'cp_' + (p.name || 'param'), mode: 'IN', type: p.type || defType(),
  }));
  return true;
}

// ── local cursor mutations (inside proc/func) ──────────────
export function addLocalCursor(mId) {
  const m = findMethod(mId);
  if (!m) return null;
  const c = makeLocalCursor();
  m.localCursors.push(c);
  return c;
}

export function removeLocalCursor(mId, cId) {
  const m = findMethod(mId);
  if (m) m.localCursors = m.localCursors.filter(c => c.id !== cId);
}

export function updateLocalCursor(mId, cId, field, value) {
  const c = findLC(mId, cId);
  if (c) c[field] = value;
}

export function toggleLocalCursorOpen(mId, cId) {
  const c = findLC(mId, cId);
  if (c) c.open = !c.open;
  return c?.open;
}

export function addLocalCursorParam(mId, cId) {
  const c = findLC(mId, cId);
  if (!c) return null;
  const name = S.autoPrefixCursorParams ? 'cp_' : '';
  const p = { id: uid(), name, mode: 'IN', type: defType() };
  c.cursorParams.push(p);
  return p;
}

export function removeLocalCursorParam(mId, cId, pId) {
  const c = findLC(mId, cId);
  if (c) c.cursorParams = c.cursorParams.filter(p => p.id !== pId);
}

export function updateLocalCursorParam(mId, cId, pId, field, value) {
  const p = findLCParam(mId, cId, pId);
  if (p) p[field] = value;
}

export function copyMethodParamsToLocalCursor(mId, cId) {
  const m = findMethod(mId);
  const c = findLC(mId, cId);
  if (!m?.params.length || !c) return false;
  c.cursorParams = m.params.map(p => ({
    id: uid(), name: 'cp_' + (p.name || 'param'), mode: 'IN', type: p.type || defType(),
  }));
  return true;
}

/**
 * Copy parameters from any method into a local cursor's cursorParams.
 * Source types handled:
 *   PROCEDURE / FUNCTION  → params[]        (prefixed cp_)
 *   CURSOR                → cursorParams[]  (prefixed cp_, strip existing cp_ first)
 *   TYPE_RECORD           → params[]        (treated as fields, prefixed cp_)
 *
 * @param {string} mId    - parent method id (owner of the local cursor)
 * @param {string} cId    - local cursor id
 * @param {string} srcId  - source method id to copy from
 * @returns {boolean}     - false if nothing to copy
 */
export function copyAnySourceToLocalCursor(mId, cId, srcId) {
  const src = findMethod(srcId);
  const c   = findLC(mId, cId);
  if (!src || !c) return false;

  let sourceParms = [];

  if (src.type === 'CURSOR') {
    // cursor params — strip any existing cp_ prefix before re-adding
    sourceParms = src.cursorParams || [];
  } else if (src.type === 'TYPE_RECORD') {
    // record fields stored in params[]
    sourceParms = src.params || [];
  } else {
    // PROCEDURE / FUNCTION
    sourceParms = src.params || [];
  }

  if (!sourceParms.length) return false;

  c.cursorParams = sourceParms.map(p => {
    const baseName = (p.name || 'param').replace(/^cp_/, '');
    return { id: uid(), name: 'cp_' + baseName, mode: 'IN', type: p.type || defType() };
  });
  return true;
}

export function clearMethods() {
  methods.length = 0;
}

// ── ordering ───────────────────────────────────────────────
const ORDER_WEIGHTS = { TYPE_RECORD: 0, TYPE_TABLE: 1, CURSOR: 2, EXCEPTION: 3, PROCEDURE: 4, FUNCTION: 5 };

export function getOrderedMethods() {
  return [...methods].sort((a, b) => (ORDER_WEIGHTS[a.type] ?? 9) - (ORDER_WEIGHTS[b.type] ?? 9));
}

// ── cursor name helpers ────────────────────────────────────
export const cursorBaseName = n => (n || 'cursor_name').replace(/^c_/, '');
export const cursorFullName = n => 'c_' + cursorBaseName(n);
