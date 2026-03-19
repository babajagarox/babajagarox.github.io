/**
 * renderer.js
 * Builds HTML strings for method cards, param grids, cursor blocks.
 * Does NOT directly mutate the DOM — callers set innerHTML on containers.
 */

import { typeInputHTML } from './autocomplete.js';
import {
  cursorBaseName, cursorFullName,
  findMethod, findLC,
} from './state.js';

// ── util ──────────────────────────────────────────────────

export function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function typeTag(t) {
  const cls = { PROCEDURE:'t-proc', FUNCTION:'t-func', TYPE_RECORD:'t-rec', TYPE_TABLE:'t-tab', CURSOR:'t-cur' };
  const lbl = { PROCEDURE:'PROC', FUNCTION:'FUNC', TYPE_RECORD:'RECORD', TYPE_TABLE:'TABLE', CURSOR:'CURSOR' };
  return `<span class="tag ${cls[t] || 't-proc'}">${lbl[t] || t}</span>`;
}

function visHint(m) {
  const isTypeObj = ['TYPE_RECORD', 'TYPE_TABLE', 'CURSOR'].includes(m.type);
  if (isTypeObj) return m.isPrivate
    ? '<div class="vis-hint body-only">Defined in BODY only</div>'
    : '<div class="vis-hint spec-only">Declared in SPEC</div>';
  return m.isPrivate
    ? '<div class="vis-hint body-only">BODY only — private helper</div>'
    : '<div class="vis-hint both">SPEC + BODY</div>';
}

// ── param grids ───────────────────────────────────────────

/**
 * Build the full params section HTML for a method.
 * Handles both regular params (with default column) and record fields (without).
 */
export function buildParamsHTML(m) {
  const isRecord = m.type === 'TYPE_RECORD';
  const label    = isRecord ? 'fields' : 'parameters';

  if (!m.params.length) {
    return `<div style="font-size:11px;color:var(--tx3);margin-bottom:4px">No ${label}</div>`;
  }

  const hdr = isRecord
    ? `<div class="cphdr" style="grid-template-columns:minmax(0,1.6fr) 72px minmax(0,1.8fr) 24px">` +
      `<span>Name</span><span>Mode</span><span>Type</span><span></span></div>`
    : `<div class="phdr"><span>Name</span><span>Mode</span><span>Type</span><span>Default</span><span></span></div>`;

  const rows = m.params.map(p => {
    const inputId = 'pt_' + p.id;
    const setCall = `window.PLSQL.setParamType('${m.id}','${p.id}',this.value)`;
    const typeInp = typeInputHTML(p.type, inputId, setCall);

    if (!isRecord) {
      return `<div class="pgrid">
  <input type="text" id="pn_${p.id}" value="${esc(p.name)}" placeholder="param_name"
    oninput="window.PLSQL.updP('${m.id}','${p.id}','name',this.value)"/>
  <select onchange="window.PLSQL.updP('${m.id}','${p.id}','mode',this.value)">
    <option ${p.mode==='IN'?'selected':''}>IN</option>
    <option ${p.mode==='OUT'?'selected':''}>OUT</option>
    <option ${p.mode==='IN OUT'?'selected':''}>IN OUT</option>
  </select>
  ${typeInp}
  <input type="text" value="${esc(p.def||'')}" placeholder="default (opt)"
    oninput="window.PLSQL.updP('${m.id}','${p.id}','def',this.value)"/>
  <button class="btn-del" onclick="window.PLSQL.removeP('${m.id}','${p.id}')">✕</button>
</div>`;
    }

    // Record field (no default column)
    return `<div class="pgrid" style="grid-template-columns:minmax(0,1.6fr) 72px minmax(0,1.8fr) 24px">
  <input type="text" id="pn_${p.id}" value="${esc(p.name)}" placeholder="field_name"
    oninput="window.PLSQL.updP('${m.id}','${p.id}','name',this.value)"/>
  <select onchange="window.PLSQL.updP('${m.id}','${p.id}','mode',this.value)">
    <option ${p.mode==='IN'?'selected':''}>IN</option>
    <option ${p.mode==='OUT'?'selected':''}>OUT</option>
    <option ${p.mode==='IN OUT'?'selected':''}>IN OUT</option>
  </select>
  ${typeInp}
  <button class="btn-del" onclick="window.PLSQL.removeP('${m.id}','${p.id}')">✕</button>
</div>`;
  }).join('');

  return hdr + rows;
}

/**
 * Build cursor param rows (no default column).
 * kind: 'cp' = package-level cursor, 'lcp' = local cursor inside proc/func
 */
export function buildCursorParamRowsHTML(params, mId, cId, idPrefix, kind) {
  if (!params?.length) {
    return `<div style="font-size:11px;color:var(--tx3);margin-bottom:4px">No cursor parameters</div>`;
  }

  const hdr = `<div class="cphdr"><span>Name</span><span>Mode</span><span>Type</span><span></span></div>`;

  const rows = params.map(p => {
    const inputId  = 'cpt_' + p.id;
    const setCall  = kind === 'lcp'
      ? `window.PLSQL.setLCParamType('${mId}','${cId}','${p.id}',this.value)`
      : `window.PLSQL.setCursorParamType('${mId}','${p.id}',this.value)`;
    const nameUpd  = kind === 'lcp'
      ? `window.PLSQL.updLCP('${mId}','${cId}','${p.id}','name',this.value)`
      : `window.PLSQL.updCP('${mId}','${p.id}','name',this.value)`;
    const modeUpd  = kind === 'lcp'
      ? `window.PLSQL.updLCP('${mId}','${cId}','${p.id}','mode',this.value)`
      : `window.PLSQL.updCP('${mId}','${p.id}','mode',this.value)`;
    const removeFn = kind === 'lcp'
      ? `window.PLSQL.removeLCP('${mId}','${cId}','${p.id}')`
      : `window.PLSQL.removeCP('${mId}','${p.id}')`;

    return `<div class="cprow">
  <input type="text" id="${idPrefix}${p.id}" value="${esc(p.name)}" placeholder="cp_param"
    oninput="${nameUpd}"/>
  <select onchange="${modeUpd}">
    <option ${p.mode==='IN'?'selected':''}>IN</option>
    <option ${p.mode==='OUT'?'selected':''}>OUT</option>
    <option ${p.mode==='IN OUT'?'selected':''}>IN OUT</option>
  </select>
  ${typeInputHTML(p.type, inputId, setCall)}
  <button class="btn-del" onclick="${removeFn}">✕</button>
</div>`;
  }).join('');

  return hdr + rows;
}

// ── local cursor (inline inside proc/func) ─────────────────

/**
 * Build only the <optgroup> options for the copy-from select.
 * Exported so app.js can refresh just the select without rebuilding the whole card.
 */
export function buildLCCopyDropdownOptions(allMethods) {
  const sources = allMethods.filter(m => {
    if (m.type === 'PROCEDURE' || m.type === 'FUNCTION') return m.params.length > 0;
    if (m.type === 'CURSOR')      return (m.cursorParams || []).length > 0;
    if (m.type === 'TYPE_RECORD') return m.params.length > 0;
    return false;
  });

  if (!sources.length) return '<option value="">— copy from —</option>';

  const typeLabel = { PROCEDURE: 'Proc', FUNCTION: 'Func', CURSOR: 'Cursor', TYPE_RECORD: 'Record' };
  const typeOrder = ['PROCEDURE', 'FUNCTION', 'CURSOR', 'TYPE_RECORD'];

  const groups = {};
  sources.forEach(m => {
    if (!groups[m.type]) groups[m.type] = [];
    groups[m.type].push(m);
  });

  return '<option value="">— copy from —</option>' +
    typeOrder
      .filter(t => groups[t])
      .map(t =>
        `<optgroup label="${typeLabel[t]}">` +
        groups[t].map(m => `<option value="${m.id}">${esc(m.name) || '(unnamed)'}</option>`).join('') +
        `</optgroup>`
      ).join('');
}

/**
 * Build the full copy-from dropdown widget (select + button).
 */
function buildLCCopyDropdown(mId, cId, allMethods) {
  const options = buildLCCopyDropdownOptions(allMethods);
  // If only the placeholder option exists, no sources available
  if (options === '<option value="">— copy from —</option>') return '';

  return `
<div style="display:flex;gap:5px;align-items:center">
  <select id="lcCopySrc_${cId}"
    style="font-size:10px;padding:2px 5px;border-radius:var(--r4);border:1px solid var(--bd);background:var(--bg);color:var(--tx2);max-width:160px">
    ${options}
  </select>
  <button class="btn" style="font-size:10px;padding:2px 8px;white-space:nowrap"
    onclick="window.PLSQL.copySourceToLC('${mId}','${cId}')">Copy as cp_</button>
</div>`;
}

export function buildLocalCursorHTML(m, c, allMethods) {
  const mId = m.id, cId = c.id;
  const bn  = cursorBaseName(c.name);
  const cn  = cursorFullName(c.name);
  const cpHTML      = buildCursorParamRowsHTML(c.cursorParams, mId, cId, 'lcpn_', 'lcp');
  const copyDropdown = buildLCCopyDropdown(mId, cId, allMethods || []);

  return `<div class="inline-cur" data-cid="${cId}">
  <div class="inline-cur-head" onclick="window.PLSQL.toggleLC('${mId}','${cId}')">
    <span class="tag t-cur" style="font-size:9px">CURSOR</span>
    <span class="inline-cur-name" id="lchn_${cId}">${esc(cn) || 'c_(unnamed)'}</span>
    ${c.declareRowVar ? `<span style="font-size:9px;color:var(--tx3)">+r_${esc(bn)}</span>` : ''}
    <button class="btn-del" onclick="event.stopPropagation();window.PLSQL.removeLC('${mId}','${cId}')">✕</button>
    <span id="lcc_${cId}" style="font-size:10px;color:var(--tx3)">${c.open ? '▲' : '▼'}</span>
  </div>
  <div id="lcb_${cId}" class="inline-cur-body ${c.open ? 'open' : ''}">
    <div class="row" style="margin-bottom:6px"><div class="col">
      <label>Cursor name <span style="font-weight:400;color:var(--tx3)">(c_ prefix auto-added)</span></label>
      <input type="text" id="lcn_${cId}" value="${esc(c.name)}" placeholder="get_orders"
        oninput="window.PLSQL.updLC('${mId}','${cId}','name',this.value);
                 const h=document.getElementById('lchn_${cId}');
                 if(h)h.textContent=window.PLSQL.cfn(this.value)||'c_(unnamed)'"/>
    </div></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <label style="margin-bottom:0">Cursor parameters</label>
      <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
        ${copyDropdown}
        <button class="add-param-btn" onclick="window.PLSQL.addLCP('${mId}','${cId}')">+ Add param</button>
      </div>
    </div>
    <div id="lcparams_${cId}">${cpHTML}</div>
    <div style="margin-top:7px">
      <label>SELECT statement <span style="font-weight:400;color:var(--tx3)">(optional)</span></label>
      <textarea rows="3"
        oninput="window.PLSQL.updLC('${mId}','${cId}','selectSql',this.value)">${esc(c.selectSql)}</textarea>
    </div>
    <div class="cbrow" style="margin-top:6px">
      <input type="checkbox" id="lcdecl_${cId}" ${c.declareRowVar ? 'checked' : ''}
        onchange="window.PLSQL.updLC('${mId}','${cId}','declareRowVar',this.checked)"/>
      <label for="lcdecl_${cId}">
        Declare <code class="pill">r_${esc(bn) || 'name'}</code> as
        <code class="pill">${esc(cn) || 'c_name'}%ROWTYPE</code>
      </label>
    </div>
  </div>
</div>`;
}

export function buildLocalCursorsListHTML(m, allMethods) {
  if (!m.localCursors?.length) return '<div style="font-size:11px;color:var(--tx3)">No local cursors</div>';
  return m.localCursors.map(c => buildLocalCursorHTML(m, c, allMethods)).join('');
}

// ── full method card ──────────────────────────────────────

export function buildMethodCardHTML(m, copyableMethods, allMethods) {
  const isP   = m.type === 'PROCEDURE';
  const isF   = m.type === 'FUNCTION';
  const isR   = m.type === 'TYPE_RECORD';
  const isT   = m.type === 'TYPE_TABLE';
  const isCur = m.type === 'CURSOR';
  const hasPF = isP || isF;

  // ── return type row (functions only) ──
  const retRow = isF
    ? `<div class="ret-row">
        <label>Return type</label>
        ${typeInputHTML(m.returnType, 'ret_' + m.id, `window.PLSQL.setReturnType('${m.id}',this.value)`)}
       </div>`
    : '';

  // ── indexed-by row (TYPE TABLE only) ──
  const idxRow = isT
    ? `<div style="display:grid;grid-template-columns:74px 1fr ${m.indexedBy==='custom'?'1fr':''};gap:6px;align-items:center;margin-top:7px">
        <label style="margin-bottom:0;font-size:11px">Indexed by</label>
        <select style="font-size:11.5px" onchange="window.PLSQL.updM('${m.id}','indexedBy',this.value);window.PLSQL.fullRender()">
          <option ${m.indexedBy==='PLS_INTEGER'?'selected':''}>PLS_INTEGER</option>
          <option ${m.indexedBy==='BINARY_INTEGER'?'selected':''}>BINARY_INTEGER</option>
          <option ${m.indexedBy==='VARCHAR2(255)'?'selected':''}>VARCHAR2(255)</option>
          <option value="custom" ${m.indexedBy==='custom'?'selected':''}>Custom…</option>
        </select>
        ${m.indexedBy==='custom'
          ? `<input type="text" value="${esc(m.indexedByCustom)}" style="font-size:11.5px"
               oninput="window.PLSQL.updM('${m.id}','indexedByCustom',this.value)"/>`
          : ''}
      </div>
      <div style="display:grid;grid-template-columns:74px 1fr;gap:6px;align-items:center;margin-top:5px">
        <label style="margin-bottom:0;font-size:11px">Of type</label>
        <input type="text" value="${esc(m.recordRef)}" placeholder="T_REC or scalar"
          style="font-size:11.5px" oninput="window.PLSQL.updM('${m.id}','recordRef',this.value)"/>
      </div>`
    : '';

  // ── standalone cursor blocks ──
  const curBlock = isCur ? buildStandaloneCursorBlock(m, copyableMethods) : '';

  // ── local cursors inside proc/func ──
  const lcBlock = hasPF
    ? `<div style="margin-top:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
          <label style="margin-bottom:0;color:#9d174d;font-weight:600;font-size:11px">Local cursors</label>
          <button class="add-cur-btn" onclick="window.PLSQL.addLC('${m.id}')">+ Add cursor</button>
        </div>
        <div id="lclist_${m.id}">${buildLocalCursorsListHTML(m, allMethods)}</div>
      </div>`
    : '';

  // ── purpose field (proc/func only) ──
  const purposeRow = hasPF
    ? `<div class="purpose-row">
        <label>Purpose</label>
        <input type="text" value="${esc(m.purpose || '')}"
          placeholder="What this ${m.type.toLowerCase()} does"
          oninput="window.PLSQL.updM('${m.id}','purpose',this.value);
                   const _p=document.getElementById('mname_${m.id}');
                   if(_p){let ps=_p.querySelector('.mname-purpose');
                     if(this.value){if(!ps){ps=document.createElement('span');ps.className='mname-purpose';_p.appendChild(ps);}ps.textContent='— '+this.value;}
                     else if(ps){ps.remove();}}"/>
      </div>`
    : '';

  // ── params section ──
  const paramsSection = (isP || isF || isR)
    ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <label style="margin-bottom:0">${isR ? 'Fields' : 'Parameters'}</label>
        <button class="add-param-btn"
          onclick="window.PLSQL.addP('${m.id}')">+ Add ${isR ? 'field' : 'param'}</button>
      </div>
      <div id="params_${m.id}">${buildParamsHTML(m)}</div>`
    : '';

  return `<div class="mcard" draggable="true" data-id="${m.id}">
  <div class="mhead" onclick="window.PLSQL.toggleOpen('${m.id}')">
    <span class="dhandle">⠿</span>
    ${typeTag(m.type)}
    ${m.isPrivate ? '<span class="tag t-priv" style="font-size:9px">PRIVATE</span>' : ''}
    <span id="mname_${m.id}" class="mname">
      ${esc(m.name) || '(unnamed)'}
      ${m.purpose ? `<span class="mname-purpose">— ${esc(m.purpose)}</span>` : ''}
    </span>
    <button class="btn btn-priv ${m.isPrivate ? 'prv' : 'pub'}"
      onclick="event.stopPropagation();window.PLSQL.togglePriv('${m.id}')">
      ${m.isPrivate ? 'Private' : 'Public'}
    </button>
    <button class="btn-del" onclick="event.stopPropagation();window.PLSQL.removeM('${m.id}')" title="Remove">✕</button>
    <span id="ch_${m.id}" class="chevron">${m.open ? '▲' : '▼'}</span>
  </div>
  <div id="mb_${m.id}" class="mbody ${m.open ? 'open' : ''}">
    <div class="row" style="margin-bottom:8px"><div class="col">
      <label>${isCur ? 'Cursor name (c_ prefix auto-added)' : 'Name'}</label>
      <input type="text" id="mn_${m.id}" value="${esc(m.name)}"
        placeholder="${isR?'T_CUSTOMER_REC':isT?'T_CUSTOMER_TAB':isCur?'get_customers':isF?'get_customer':'process_order'}"
        oninput="window.PLSQL.updM('${m.id}','name',this.value);
                 const _h=document.getElementById('mname_${m.id}');
                 if(_h)_h.firstChild.textContent=this.value||'(unnamed)'"/>
    </div></div>
    ${purposeRow}
    ${paramsSection}
    ${retRow}
    ${idxRow}
    ${curBlock}
    ${lcBlock}
    ${visHint(m)}
  </div>
</div>`;
}

// ── standalone cursor section ──────────────────────────────

function buildStandaloneCursorBlock(m, copyableMethods) {
  const bn = cursorBaseName(m.name);
  const cn = cursorFullName(m.name);

  const copyOptions = copyableMethods.length
    ? `<select id="cpSrcSel_${m.id}"
         style="font-size:10px;padding:2px 5px;border-radius:var(--r4);border:1px solid var(--bd);background:var(--bg);color:var(--tx2)">
         <option value="">— copy from method —</option>
         ${copyableMethods.map(cm => `<option value="${cm.id}">${esc(cm.name) || 'unnamed'}</option>`).join('')}
       </select>
       <button class="btn" style="font-size:10px;padding:2px 8px"
         onclick="window.PLSQL.copyFuncParamsAsCursor('${m.id}')">Copy as cp_</button>`
    : '';

  return `
<div class="cur-section">
  <div class="cur-stitle">
    <span>Cursor parameters</span>
    <div style="display:flex;gap:5px">
      ${copyOptions}
      <button class="add-param-btn" onclick="window.PLSQL.addCP('${m.id}')">+ Add param</button>
    </div>
  </div>
  <div id="cparams_${m.id}">
    ${buildCursorParamRowsHTML(m.cursorParams, m.id, null, 'cpn_', 'cp')}
  </div>
</div>
<div class="cur-section" style="margin-top:6px">
  <div class="cur-stitle">SELECT statement</div>
  <textarea rows="4" oninput="window.PLSQL.updM('${m.id}','selectSql',this.value)">${esc(m.selectSql)}</textarea>
  <div class="cbrow" style="margin-top:6px">
    <input type="checkbox" id="decl_${m.id}" ${m.declareRowVar ? 'checked' : ''}
      onchange="window.PLSQL.updM('${m.id}','declareRowVar',this.checked)"/>
    <label for="decl_${m.id}">
      Declare <code class="pill">r_${esc(bn)}</code> as
      <code class="pill">${esc(cn)}%ROWTYPE</code> in BODY
    </label>
  </div>
</div>`;
}
