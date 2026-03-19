/**
 * codegen.js
 * Generates Oracle PL/SQL SPEC and BODY strings from state.
 */

import { S } from './settings.js';
import { cursorBaseName, cursorFullName } from './state.js';

// ── formatting helpers ─────────────────────────────────────

function pad(s, n) {
  return (s || '').padEnd(n);
}

/**
 * Format a parameter list.
 * @param {Array}   params
 * @param {boolean} isCursor - cursor params omit mode and DEFAULT
 */
function formatParams(params, isCursor = false) {
  if (!params?.length) return '';
  const maxN = Math.max(...params.map(p => (p.name || 'p').length), 4);
  const maxM = isCursor ? 0 : Math.max(...params.map(p => (p.mode || 'IN').length), 2);
  const lines = params.map(p => {
    let l = `    ${pad(p.name || 'p', maxN + 1)} `;
    if (!isCursor) l += `${pad(p.mode || 'IN', maxM + 1)} `;
    l += p.type || 'VARCHAR2';
    if (!isCursor && p.def?.trim()) l += ` DEFAULT ${p.def.trim()}`;
    return l;
  });
  return ' (\n' + lines.join(',\n') + '\n  )';
}

// ── template helper ─────────────────────────────────────────

function applyTemplate(tpl, vars) {
  if (!tpl?.trim()) return '';
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{{${k}}}`));
}

// ── signature builders ─────────────────────────────────────

export function buildPackageSig(fqn, schema, purpose) {
  const tpl = S.pkgSig || '';
  const date = new Date().toISOString().split('T')[0];
  if (!tpl.trim()) {
    return (
      `  /*${'='.repeat(66)}\n` +
      `  ** Package : ${fqn}\n` +
      `  ** Author  : ${S.author || ''}\n` +
      `  ** Created : ${date}\n` +
      `  ** Purpose : ${purpose || ''}\n` +
      `  **${'='.repeat(66)}*/`
    );
  }
  return applyTemplate(tpl, { package: fqn, schema: schema || '', date, author: S.author || '', purpose: purpose || '' });
}

export function buildProcSig(m) {
  const tpl = S.procSig || '';
  const date = new Date().toISOString().split('T')[0];
  if (!tpl.trim()) {
    return m.purpose
      ? `  -- ${m.type}: ${m.name} | ${m.purpose}${S.author ? ' | ' + S.author : ''}\n`
      : '';
  }
  return applyTemplate(tpl, { name: m.name, type: m.type, date, author: S.author || '', purpose: m.purpose || '' }) + '\n';
}

// ── exception block ────────────────────────────────────────

export function buildExceptionBlock(indent) {
  const body = (S.exceptionBody || 'RAISE;').trim();
  const lines = body.split('\n').map(l => `${indent}${l}`).join('\n');
  return `${indent.slice(0, -2)}EXCEPTION\n${indent}WHEN OTHERS THEN\n${lines}`;
}

// ── type emitters ──────────────────────────────────────────

export function emitTypeRecord(m, indent = '  ') {
  let s = `${indent}TYPE ${m.name.toUpperCase()} IS RECORD (\n`;
  s += m.params.length
    ? m.params.map(p => `${indent}  ${pad((p.name || 'col').toUpperCase(), 24)} ${p.type || 'VARCHAR2(255)'}`).join(',\n') + '\n'
    : `${indent}  -- add record fields\n`;
  return s + `${indent});\n\n`;
}

export function emitTypeTable(m, indent = '  ') {
  const idx = m.indexedBy === 'custom' ? (m.indexedByCustom || 'PLS_INTEGER') : m.indexedBy;
  const ofType = (m.recordRef || 'VARCHAR2(4000)').toUpperCase();
  return `${indent}TYPE ${m.name.toUpperCase()} IS TABLE OF ${ofType}\n${indent}  INDEX BY ${idx};\n\n`;
}

export function emitCursor(c, indent = '  ') {
  const cn = cursorFullName(c.name);
  let s = `${indent}CURSOR ${cn}`;
  if (c.cursorParams?.length) s += formatParams(c.cursorParams, true);
  if (c.selectSql?.trim()) {
    const lines = c.selectSql.trim().split('\n');
    s += `\n${indent}IS ${lines[0]}`;
    for (let j = 1; j < lines.length; j++) s += `\n${indent}   ${lines[j]}`;
  } else {
    s += `\n${indent}IS\n${indent}  SELECT NULL FROM DUAL -- TODO: add SELECT`;
  }
  return s + ';\n\n';
}

// ── local cursors inside proc/func IS block ────────────────

function emitLocalCursors(m, indent = '    ') {
  let s = '';
  for (const c of (m.localCursors || [])) {
    if (c.name) s += emitCursor(c, indent);
  }
  const rowtypeVars = (m.localCursors || []).filter(c => c.name && c.declareRowVar);
  for (const c of rowtypeVars) {
    s += `${indent}r_${cursorBaseName(c.name)}  ${cursorFullName(c.name)}%ROWTYPE;\n`;
  }
  return s;
}

// ── SPEC ───────────────────────────────────────────────────

export function buildSpec(fqn, schema, authid, orderedMethods, purpose) {
  let s = `CREATE OR REPLACE PACKAGE ${fqn}`;
  if (authid) s += `\n  AUTHID ${authid}`;
  s += `\nAS\n\n${buildPackageSig(fqn, schema, purpose)}\n\n`;

  for (const m of orderedMethods) {
    if (!m.name || m.isPrivate) continue;

    if      (m.type === 'TYPE_RECORD') s += emitTypeRecord(m);
    else if (m.type === 'TYPE_TABLE')  s += emitTypeTable(m);
    else if (m.type === 'CURSOR')      s += emitCursor(m);
    else if (m.type === 'PROCEDURE')   s += `  PROCEDURE ${m.name}_PC${formatParams(m.params)};\n\n`;
    else if (m.type === 'FUNCTION')    s += `  FUNCTION ${m.name}_FN${formatParams(m.params)}\n  RETURN ${m.returnType || 'BOOLEAN'};\n\n`;
  }

  return s + `END ${fqn};\n/`;
}

// ── BODY ───────────────────────────────────────────────────

export function buildBody(fqn, schema, authid, orderedMethods, purpose) {
  let s = `CREATE OR REPLACE PACKAGE BODY ${fqn}\nAS\n\n${buildPackageSig(fqn, schema, purpose)}\n\n`;

  // Private types
  const privTypes = orderedMethods.filter(m => m.name && m.isPrivate && (m.type === 'TYPE_RECORD' || m.type === 'TYPE_TABLE'));
  if (privTypes.length) {
    s += `  -- Private type declarations\n`;
    for (const m of privTypes) s += m.type === 'TYPE_RECORD' ? emitTypeRecord(m) : emitTypeTable(m);
  }

  // Private cursors
  const privCursors = orderedMethods.filter(m => m.name && m.isPrivate && m.type === 'CURSOR');
  if (privCursors.length) {
    s += `  -- Private cursor declarations\n`;
    for (const m of privCursors) s += emitCursor(m);
  }

  // Package-level cursor rowtype vars
  const pkgRowtypes = orderedMethods.filter(m => m.name && m.type === 'CURSOR' && m.declareRowVar);
  if (pkgRowtypes.length) {
    s += `  -- Cursor rowtype variables\n`;
    for (const m of pkgRowtypes) s += `  r_${cursorBaseName(m.name)}  ${cursorFullName(m.name)}%ROWTYPE;\n`;
    s += '\n';
  }

  // Procedures and functions
  const skip = new Set(['TYPE_RECORD', 'TYPE_TABLE', 'CURSOR']);
  for (const m of orderedMethods) {
    if (!m.name || skip.has(m.type)) continue;
    s += buildProcSig(m);
    if (m.isPrivate) s += `  -- Private: not declared in SPEC\n`;

    if (m.type === 'PROCEDURE') {
      s += `  PROCEDURE ${m.name}_PC${formatParams(m.params)} IS 
    l_PackName          constant varchar2(30) := lower($$plsql_unit);
    l_ProcName          constant varchar2(30) := lower(utl_call_stack.subprogram(1)(2));
    l_Procedure         constant varchar2(60) := l_PackName||'.'||l_ProcName;\n`;
      s += emitLocalCursors(m);
      s += `  BEGIN\n    -- TODO: implement ${m.name}\n    NULL;\n`;
      s += buildExceptionBlock('    ') + '\n';
      s += `  END ${m.name};\n\n`;
    }

    if (m.type === 'FUNCTION') {
      const rt = m.returnType || 'BOOLEAN';
      s += `  FUNCTION ${m.name}_FN${formatParams(m.params)}\n  RETURN ${rt} IS
    l_PackName          constant varchar2(30) := lower($$plsql_unit);
    l_ProcName          constant varchar2(30) := lower(utl_call_stack.subprogram(1)(2));
    l_Procedure         constant varchar2(60) := l_PackName||'.'||l_ProcName;\n`;
      s += emitLocalCursors(m);
      s += `  BEGIN\n    -- TODO: implement ${m.name}\n    RETURN l_result;\n`;
      s += buildExceptionBlock('    ') + '\n    RETURN NULL;\n';
      s += `  END ${m.name};\n\n`;
    }
  }

  return s + `END ${fqn};\n/`;
}
