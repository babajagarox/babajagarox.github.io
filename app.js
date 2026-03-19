// ═══════════════════════════════════════════════════
//  Oracle PL/SQL Package Creator — app.js
// ═══════════════════════════════════════════════════

// ── State ────────────────────────────────────────────
let methods  = [];
let curTab   = 'spec';
let focusId  = null;   // id of input to focus after next render

// ── Settings (single object, persisted to localStorage) ──
const DEFAULTS = {
  defaultType:           'VARCHAR2',
  customTypes:           [],
  customTypesTop:        true,
  autoPrefixCursorParams: false,
  exceptionBody:         'RAISE;',
  pkgSig:                '',
  procSig:               '',
  author:                '',
};
const S = loadSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem('plsql_s1');
    return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
  } catch (e) { return Object.assign({}, DEFAULTS); }
}
function saveSettingsToStorage() {
  try { localStorage.setItem('plsql_s1', JSON.stringify(S)); } catch (e) {}
}

// ── Utilities ────────────────────────────────────────
const uid  = () => '_' + Math.random().toString(36).slice(2, 8);
const esc  = s  => (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const $    = id => document.getElementById(id);
const pad  = (s, n) => (s || '').padEnd(n);
const cfn  = n  => 'c_' + (n || 'cursor').replace(/^c_/, '');  // cursor full name
const cbn  = n  => (n || 'cursor').replace(/^c_/, '');          // cursor base name

// ── Built-in Oracle types ─────────────────────────────
const BUILTIN_TYPES = [
  'BOOLEAN','VARCHAR2',
  'NVARCHAR2','CHAR','NUMBER',
  'INTEGER','PLS_INTEGER','BINARY_INTEGER','SIMPLE_INTEGER',
  'DATE','TIMESTAMP','TIMESTAMP WITH TIME ZONE','TIMESTAMP WITH LOCAL TIME ZONE',
  'INTERVAL YEAR TO MONTH','INTERVAL DAY TO SECOND',
  'CLOB','BLOB','NCLOB','XMLTYPE','RAW','SYS_REFCURSOR','SIMPLE_FLOAT','SIMPLE_DOUBLE',
];

function typeList() {
  const c = S.customTypes || [];
  if (!c.length) return BUILTIN_TYPES;
  return S.customTypesTop ? [...c, ...BUILTIN_TYPES] : [...BUILTIN_TYPES, ...c];
}

// ── Method factories ──────────────────────────────────
function newMethod(type) {
  return {
    id: uid(), type, name: '', purpose: '', isPrivate: false, open: true,
    params: [],                        // PROCEDURE / FUNCTION / TYPE_RECORD fields
    returnType: 'BOOLEAN',             // FUNCTION only
    indexedBy: 'PLS_INTEGER', indexedByCustom: '', recordRef: '', // TYPE_TABLE
    cursorParams: [], selectSql: '', declareRowVar: false,         // CURSOR
    localCursors: [],                  // PROCEDURE / FUNCTION inline cursors
  };
}
function newParam(prefix) {
  return { id: uid(), name: prefix || '', mode: 'IN', type: S.defaultType || 'VARCHAR2', def: '' };
}
function newCursorParam(autoPrefix) {
  return { id: uid(), name: autoPrefix ? 'cp_' : '', mode: 'IN', type: S.defaultType || 'VARCHAR2' };
}
function newLocalCursor() {
  return { id: uid(), name: '', cursorParams: [], selectSql: '', declareRowVar: false, open: true };
}

// ── Finders ───────────────────────────────────────────
const findM   = id          => methods.find(m => m.id === id);
const findP   = (mid, pid)  => findM(mid)?.params.find(p => p.id === pid);
const findCP  = (mid, pid)  => findM(mid)?.cursorParams.find(p => p.id === pid);
const findLC  = (mid, cid)  => findM(mid)?.localCursors.find(c => c.id === cid);
const findLCP = (mid,cid,pid) => findLC(mid, cid)?.cursorParams.find(p => p.id === pid);

// ── Ordering (Oracle standard) ────────────────────────
const ORDER = { TYPE_RECORD:0, TYPE_TABLE:1, CURSOR:2, EXCEPTION:3, PROCEDURE:4, FUNCTION:5 };
function orderedMethods() {
  return $('chkOrd').checked ? [...methods].sort((a,b) => (ORDER[a.type]??9)-(ORDER[b.type]??9)) : methods;
}

// ── Type tag HTML ─────────────────────────────────────
function typeTag(t) {
  const cls = { PROCEDURE:'t-proc',FUNCTION:'t-func',TYPE_RECORD:'t-rec',TYPE_TABLE:'t-tab',CURSOR:'t-cur' };
  const lbl = { PROCEDURE:'PROC', FUNCTION:'FUNC', TYPE_RECORD:'RECORD', TYPE_TABLE:'TABLE', CURSOR:'CURSOR' };
  return `<span class="tag ${cls[t]}">${lbl[t]}</span>`;
}

// ── Visibility hint ───────────────────────────────────
function visHint(m) {
  const isType = ['TYPE_RECORD','TYPE_TABLE','CURSOR'].includes(m.type);
  if (isType) return m.isPrivate
    ? '<div class="vis-hint body">Defined in BODY only</div>'
    : '<div class="vis-hint spec">Declared in SPEC</div>';
  return m.isPrivate
    ? '<div class="vis-hint body">BODY only — private</div>'
    : '<div class="vis-hint both">SPEC + BODY</div>';
}

// ── Autocomplete ──────────────────────────────────────
let acFi = 0;

function showAC(inputId, all) {
  closeAC();
  const el = $(inputId); if (!el) return;
  const q = el.value.trim().toLowerCase();
  const full = typeList();
  const customSet = new Set(S.customTypes || []);
  const hits = all ? full : full.filter(t => q === '' || t.toLowerCase().includes(q));
  if (!hits.length) return;

  acFi = 0;
  const drop = document.createElement('div');
  drop.className = 'acdrop'; drop.id = 'acdrop'; drop.dataset.for = inputId;

  let lastWasCustom = null;
  let idx = 0;
  hits.slice(0, 24).forEach(t => {
    const isC = customSet.has(t);
    // Section separator only when browsing all and custom types exist
    if (all && customSet.size && lastWasCustom !== null && isC !== lastWasCustom) {
      const sep = document.createElement('div');
      sep.className = 'acitem sep';
      sep.textContent = isC ? '★ Custom types' : 'Built-in types';
      drop.appendChild(sep);
    }
    lastWasCustom = isC;

    const item = document.createElement('div');
    item.textContent = t;
    item.className = 'acitem' + (isC ? ' custom' : '') + (idx === 0 ? ' hi' : '');
    item.dataset.val = t;
    item.onmousedown = e => { e.preventDefault(); pickAC(inputId, t); };
    drop.appendChild(item);
    idx++;
  });

  if (idx) el.closest('.acwrap').appendChild(drop);
}

function pickAC(inputId, val) {
  const el = $(inputId);
  if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
  closeAC();
}

function closeAC() { $('acdrop')?.remove(); acFi = 0; }

function acKey(e, inputId) {
  const drop = $('acdrop'); if (!drop || drop.dataset.for !== inputId) return;
  const items = [...drop.querySelectorAll('.acitem:not(.sep)')];
  if (e.key === 'ArrowDown') { e.preventDefault(); acFi = Math.min(acFi+1, items.length-1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); acFi = Math.max(acFi-1, 0); }
  else if (e.key === 'Enter')  { e.preventDefault(); pickAC(inputId, items[acFi]?.dataset.val); return; }
  else if (e.key === 'Escape') { closeAC(); return; }
  items.forEach((it, i) => it.classList.toggle('hi', i === acFi));
}

document.addEventListener('click', e => { if (!e.target.closest('.acwrap')) closeAC(); });

// Returns HTML string for a type input cell with autocomplete wired up
function typeCell(val, id, onInputExpr) {
  const v = esc(val);
  return `<div class="acwrap">` +
    `<input type="text" id="${id}" value="${v}" placeholder="type"` +
    ` oninput="${onInputExpr};showAC('${id}',false)"` +
    ` onfocus="showAC('${id}',true)"` +
    ` onkeydown="acKey(event,'${id}')"/>` +
    `</div>`;
}

// ── Param row HTML ────────────────────────────────────
// kind: 'p' = regular param (5-col with default), 'c' = cursor param (4-col, no default)
function paramRowHTML(p, mid, kind, lcid) {
  const is5 = kind === 'p';
  const setType = kind === 'p'  ? `findP('${mid}','${p.id}').type=this.value` :
                  kind === 'c'  ? `findCP('${mid}','${p.id}').type=this.value` :
                                  `findLCP('${mid}','${lcid}','${p.id}').type=this.value`;
  const updName = kind === 'p'  ? `findP('${mid}','${p.id}').name=this.value` :
                  kind === 'c'  ? `findCP('${mid}','${p.id}').name=this.value` :
                                  `findLCP('${mid}','${lcid}','${p.id}').name=this.value`;
  const updMode = kind === 'p'  ? `findP('${mid}','${p.id}').mode=this.value` :
                  kind === 'c'  ? `findCP('${mid}','${p.id}').mode=this.value` :
                                  `findLCP('${mid}','${lcid}','${p.id}').mode=this.value`;
  const removeCall = kind === 'p'  ? `removeP('${mid}','${p.id}')` :
                     kind === 'c'  ? `removeCP('${mid}','${p.id}')` :
                                     `removeLCP('${mid}','${lcid}','${p.id}')`;
  const typeId = `t_${p.id}`;

  return `<div class="${is5 ? 'pgrid' : 'pgrid-4'}">` +
    `<input type="text" id="pn_${p.id}" value="${esc(p.name)}" placeholder="${kind==='c'||kind==='lc'?'cp_param':'param_name'}" oninput="${updName}"/>` +
    `<select onchange="${updMode}">` +
    `<option ${p.mode==='IN'?'selected':''}>IN</option>` +
    `<option ${p.mode==='OUT'?'selected':''}>OUT</option>` +
    `<option ${p.mode==='IN OUT'?'selected':''}>IN OUT</option>` +
    `</select>` +
    typeCell(p.type, typeId, setType) +
    (is5 ? `<input type="text" value="${esc(p.def||'')}" placeholder="default (opt)" oninput="findP('${mid}','${p.id}').def=this.value"/>` : '') +
    `<button class="btn-del" onclick="${removeCall}">✕</button>` +
    `</div>`;
}

// ── Copy-from dropdown options (for local cursor) ─────
function copyFromOptions() {
  // All methods that have something to copy
  const sources = methods.filter(m => {
    if (m.type === 'PROCEDURE' || m.type === 'FUNCTION') return m.params.length > 0;
    if (m.type === 'CURSOR')      return m.cursorParams.length > 0;
    if (m.type === 'TYPE_RECORD') return m.params.length > 0;
    return false;
  });
  if (!sources.length) return '<option value="">— no sources yet —</option>';

  const labels = { PROCEDURE:'Proc', FUNCTION:'Func', CURSOR:'Cursor', TYPE_RECORD:'Record' };
  const order  = ['PROCEDURE','FUNCTION','CURSOR','TYPE_RECORD'];
  const groups = {};
  sources.forEach(m => { (groups[m.type] = groups[m.type]||[]).push(m); });

  return '<option value="">— copy from —</option>' +
    order.filter(t => groups[t]).map(t =>
      `<optgroup label="${labels[t]}">` +
      groups[t].map(m => `<option value="${m.id}">${esc(m.name)||'(unnamed)'}</option>`).join('') +
      `</optgroup>`
    ).join('');
}

// ── Local cursor HTML ─────────────────────────────────
function localCursorHTML(m, lc) {
  const cn = cfn(lc.name);
  const bn = cbn(lc.name);
  const cpRows = lc.cursorParams.map(p => paramRowHTML(p, m.id, 'lc', lc.id)).join('');

  return `<div class="lc-card">
  <div class="lc-head" onclick="toggleLC('${m.id}','${lc.id}')">
    <span class="tag t-cur" style="font-size:9px">CURSOR</span>
    <span class="lc-name" id="lcn_${lc.id}">${esc(cn)||'c_(unnamed)'}</span>
    ${lc.declareRowVar ? `<span style="font-size:9px;color:var(--tx3)">+r_${esc(bn)}</span>` : ''}
    <button class="btn-del" onclick="event.stopPropagation();removeLC('${m.id}','${lc.id}')">✕</button>
    <span id="lcc_${lc.id}" class="chevron">${lc.open?'▲':'▼'}</span>
  </div>
  <div id="lcb_${lc.id}" class="lc-body ${lc.open?'open':''}">
    <div class="row" style="margin-bottom:6px"><div class="col">
      <label>Cursor name <span style="font-weight:400;color:var(--tx3)">(c_ prefix auto-added)</span></label>
      <input id="lcname_${lc.id}" type="text" value="${esc(lc.name)}" placeholder="get_orders"
        oninput="findLC('${m.id}','${lc.id}').name=this.value;
                 const h=$('lcn_${lc.id}');if(h)h.textContent=cfn(this.value)||'c_(unnamed)'"/>
    </div></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <label style="margin-bottom:0">Cursor parameters</label>
      <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
        <select id="lcSrc_${lc.id}" style="font-size:10px;padding:2px 5px;border-radius:var(--r4);border:1px solid var(--bd);background:var(--bg);color:var(--tx2);max-width:160px">
          ${copyFromOptions()}
        </select>
        <button class="btn" style="font-size:10px;padding:2px 8px" onclick="copyToLC('${m.id}','${lc.id}')">Copy as cp_</button>
        <button class="btn-dash" onclick="addLCP('${m.id}','${lc.id}')">+ Add param</button>
      </div>
    </div>
    ${lc.cursorParams.length ? '<div class="phdr-4"><span>Name</span><span>Mode</span><span>Type</span><span></span></div>' : ''}
    ${cpRows || '<div style="font-size:11px;color:var(--tx3);margin-bottom:4px">No cursor parameters</div>'}
    <div style="margin-top:7px">
      <label>SELECT statement <span style="font-weight:400;color:var(--tx3)">(optional)</span></label>
      <textarea rows="3" oninput="findLC('${m.id}','${lc.id}').selectSql=this.value">${esc(lc.selectSql)}</textarea>
    </div>
    <div class="cbrow" style="margin-top:6px">
      <input type="checkbox" id="lcdecl_${lc.id}" ${lc.declareRowVar?'checked':''}
        onchange="findLC('${m.id}','${lc.id}').declareRowVar=this.checked"/>
      <label for="lcdecl_${lc.id}">
        Declare <code class="pill">r_${esc(bn)||'name'}</code> as
        <code class="pill">${esc(cn)||'c_name'}%ROWTYPE</code>
      </label>
    </div>
  </div>
</div>`;
}

// ── Method card HTML ──────────────────────────────────
function methodCardHTML(m) {
  const isP = m.type==='PROCEDURE', isF = m.type==='FUNCTION';
  const isR = m.type==='TYPE_RECORD', isT = m.type==='TYPE_TABLE', isC = m.type==='CURSOR';
  const hasPF = isP || isF;

  // ── params section ──
  let paramsHTML = '';
  if (isP || isF || isR) {
    const label = isR ? 'Fields' : 'Parameters';
    const rows  = m.params.map(p => paramRowHTML(p, m.id, isR ? 'c' : 'p')).join('');
    const hdr   = isR
      ? '<div class="phdr-4"><span>Name</span><span>Mode</span><span>Type</span><span></span></div>'
      : '<div class="phdr"><span>Name</span><span>Mode</span><span>Type</span><span>Default</span><span></span></div>';
    paramsHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <label style="margin-bottom:0">${label}</label>
      <button class="btn-dash" onclick="addP('${m.id}')">+ Add ${isR?'field':'param'}</button>
    </div>
    ${m.params.length ? hdr : ''}
    ${rows || `<div style="font-size:11px;color:var(--tx3);margin-bottom:4px">No ${label.toLowerCase()}</div>`}`;
  }

  // ── return type (function only) ──
  const retHTML = isF ? `<div class="ret-row">
    <label>Return type</label>
    ${typeCell(m.returnType, 'ret_'+m.id, `findM('${m.id}').returnType=this.value`)}
  </div>` : '';

  // ── type table fields ──
  const tabHTML = isT ? `
  <div style="display:grid;grid-template-columns:74px 1fr ${m.indexedBy==='custom'?'1fr':''};gap:6px;align-items:center;margin-top:7px">
    <label style="margin-bottom:0;font-size:11px">Indexed by</label>
    <select style="font-size:11.5px" onchange="findM('${m.id}').indexedBy=this.value;render()">
      <option ${m.indexedBy==='PLS_INTEGER'?'selected':''}>PLS_INTEGER</option>
      <option ${m.indexedBy==='BINARY_INTEGER'?'selected':''}>BINARY_INTEGER</option>
      <option ${m.indexedBy==='VARCHAR2(255)'?'selected':''}>VARCHAR2(255)</option>
      <option value="custom" ${m.indexedBy==='custom'?'selected':''}>Custom…</option>
    </select>
    ${m.indexedBy==='custom' ? `<input type="text" value="${esc(m.indexedByCustom)}" style="font-size:11.5px" oninput="findM('${m.id}').indexedByCustom=this.value"/>` : ''}
  </div>
  <div style="display:grid;grid-template-columns:74px 1fr;gap:6px;align-items:center;margin-top:5px">
    <label style="margin-bottom:0;font-size:11px">Of type</label>
    <input type="text" value="${esc(m.recordRef)}" placeholder="T_REC or scalar" style="font-size:11.5px" oninput="findM('${m.id}').recordRef=this.value"/>
  </div>` : '';

  // ── standalone cursor ──
  const cursorHTML = isC ? `
  <div class="cur-box">
    <div class="cur-title">
      <span>Cursor parameters</span>
      <div style="display:flex;gap:5px;align-items:center">
        <select id="cpSrc_${m.id}" style="font-size:10px;padding:2px 5px;border-radius:var(--r4);border:1px solid var(--bd);background:var(--bg);color:var(--tx2);max-width:160px">
          ${copyFromOptions()}
        </select>
        <button class="btn" style="font-size:10px;padding:2px 8px" onclick="copyCursorParams('${m.id}')">Copy as cp_</button>
        <button class="btn-dash" onclick="addCP('${m.id}')">+ Add param</button>
      </div>
    </div>
    ${m.cursorParams.length ? '<div class="phdr-4"><span>Name</span><span>Mode</span><span>Type</span><span></span></div>' : ''}
    ${m.cursorParams.map(p => paramRowHTML(p, m.id, 'c')).join('') || '<div style="font-size:11px;color:var(--tx3);margin-bottom:4px">No cursor parameters</div>'}
  </div>
  <div class="cur-box" style="margin-top:6px">
    <div class="cur-title">SELECT statement</div>
    <textarea rows="4" oninput="findM('${m.id}').selectSql=this.value">${esc(m.selectSql)}</textarea>
    <div class="cbrow" style="margin-top:6px">
      <input type="checkbox" id="decl_${m.id}" ${m.declareRowVar?'checked':''}
        onchange="findM('${m.id}').declareRowVar=this.checked"/>
      <label for="decl_${m.id}">Declare <code class="pill">r_${esc(cbn(m.name))}</code> as <code class="pill">${esc(cfn(m.name))}%ROWTYPE</code></label>
    </div>
  </div>` : '';

  // ── local cursors (proc/func only) ──
  const lcHTML = hasPF ? `
  <div style="margin-top:10px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
      <label style="margin-bottom:0;color:#9d174d;font-weight:600;font-size:11px">Local cursors</label>
      <button class="btn-dash btn-dash-pink" onclick="addLC('${m.id}')">+ Add cursor</button>
    </div>
    ${m.localCursors.length
      ? m.localCursors.map(lc => localCursorHTML(m, lc)).join('')
      : '<div style="font-size:11px;color:var(--tx3)">No local cursors</div>'}
  </div>` : '';

  return `<div class="mcard" draggable="true" data-id="${m.id}">
  <div class="mhead" onclick="toggleCard('${m.id}')">
    <span class="dhandle">⠿</span>
    ${typeTag(m.type)}
    ${m.isPrivate ? '<span class="tag t-priv" style="font-size:9px">PRIVATE</span>' : ''}
    <span class="mname" id="mname_${m.id}">
      ${esc(m.name)||'(unnamed)'}${m.purpose ? `<span class="mname-sub">— ${esc(m.purpose)}</span>` : ''}
    </span>
    <button class="btn btn-priv ${m.isPrivate?'prv':'pub'}"
      onclick="event.stopPropagation();togglePriv('${m.id}')">${m.isPrivate?'Private':'Public'}</button>
    <button class="btn-del" onclick="event.stopPropagation();removeM('${m.id}')" title="Remove">✕</button>
    <span id="chev_${m.id}" class="chevron">${m.open?'▲':'▼'}</span>
  </div>
  <div id="body_${m.id}" class="mbody ${m.open?'open':''}">
    <div class="row" style="margin-bottom:8px"><div class="col">
      <label>${isC ? 'Cursor name (c_ prefix auto-added)' : 'Name'}</label>
      <input type="text" id="mn_${m.id}" value="${esc(m.name)}"
        placeholder="${isR?'T_CUSTOMER_REC':isT?'T_CUSTOMER_TAB':isC?'get_customers':isF?'get_customer':'process_order'}"
        oninput="findM('${m.id}').name=this.value;
                 const h=$('mname_${m.id}');
                 if(h)h.childNodes[0].textContent=(this.value||'(unnamed)')"/>
    </div></div>
    ${hasPF ? `<div class="purpose-row">
      <label>Purpose</label>
      <input type="text" value="${esc(m.purpose||'')}" placeholder="What this ${m.type.toLowerCase()} does"
        oninput="findM('${m.id}').purpose=this.value;
                 const h=$('mname_${m.id}');if(h){let s=h.querySelector('.mname-sub');
                   if(this.value){if(!s){s=document.createElement('span');s.className='mname-sub';h.appendChild(s);}s.textContent='— '+this.value;}
                   else if(s)s.remove();}"/>
    </div>` : ''}
    ${paramsHTML}
    ${retHTML}${tabHTML}${cursorHTML}${lcHTML}
    ${visHint(m)}
  </div>
</div>`;
}

// ── Render ────────────────────────────────────────────
function render() {
  const list = $('mlist');
  const display = orderedMethods();

  if (!display.length) {
    list.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--tx3);padding:.75rem">No methods — add one above</div>';
  } else {
    list.innerHTML = display.map(methodCardHTML).join('');
    setupDrag();
  }

  // Focus management — place caret at end, not select-all
  if (focusId) {
    const el = $(focusId);
    if (el) {
      el.focus();
      const len = (el.value || '').length;
      try { el.setSelectionRange(len, len); } catch(e) {}
    }
    focusId = null;
  }
}

// ── Add / remove methods ──────────────────────────────
function addM(type) {
  const m = newMethod(type);
  methods.push(m);
  focusId = 'mn_' + m.id;
  render();
}
function removeM(id) { methods = methods.filter(m => m.id !== id); render(); }
function toggleCard(id) {
  const m = findM(id); if (!m) return;
  m.open = !m.open;
  const b = $('body_'+id), c = $('chev_'+id);
  if (b) b.classList.toggle('open', m.open);
  if (c) c.textContent = m.open ? '▲' : '▼';
}
function togglePriv(id) { const m = findM(id); if (m) { m.isPrivate = !m.isPrivate; render(); } }
function toggleAllCards() {
  const allOpen = methods.every(m => m.open);
  methods.forEach(m => { m.open = !allOpen; });
  render();
  $('btnColExp').textContent = allOpen ? 'Expand all' : 'Collapse all';
}

// ── Add / remove params ───────────────────────────────
function addP(mid) {
  const m = findM(mid); if (!m) return;
  const p = newParam();
  m.params.push(p);
  focusId = 'pn_' + p.id;
  render();
}
function removeP(mid, pid) { const m = findM(mid); if (m) { m.params = m.params.filter(p => p.id !== pid); render(); } }

// ── Add / remove cursor params ────────────────────────
function addCP(mid) {
  const m = findM(mid); if (!m) return;
  const p = newCursorParam(S.autoPrefixCursorParams);
  m.cursorParams.push(p);
  focusId = 'pn_' + p.id;
  render();
}
function removeCP(mid, pid) { const m = findM(mid); if (m) { m.cursorParams = m.cursorParams.filter(p => p.id !== pid); render(); } }

// Copy from another method's params into a standalone cursor
function copyCursorParams(mid) {
  const srcId = $('cpSrc_' + mid)?.value;
  const src = srcId ? findM(srcId) : null;
  if (!src) { alert('Select a source.'); return; }
  const srcList = src.type === 'CURSOR' ? src.cursorParams : src.params;
  if (!srcList.length) { alert('Selected source has no params.'); return; }
  findM(mid).cursorParams = srcList.map(p => ({
    ...newCursorParam(), name: 'cp_' + (p.name || 'param').replace(/^cp_/, ''),
  }));
  render();
}

// ── Local cursors ─────────────────────────────────────
function addLC(mid) {
  const m = findM(mid); if (!m) return;
  const lc = newLocalCursor();
  m.localCursors.push(lc);
  focusId = 'lcname_' + lc.id;
  render();
}
function removeLC(mid, lcid) { const m = findM(mid); if (m) { m.localCursors = m.localCursors.filter(c => c.id !== lcid); render(); } }
function toggleLC(mid, lcid) {
  const lc = findLC(mid, lcid); if (!lc) return;
  lc.open = !lc.open;
  const b = $('lcb_'+lcid), c = $('lcc_'+lcid);
  if (b) b.classList.toggle('open', lc.open);
  if (c) c.textContent = lc.open ? '▲' : '▼';
}

// Local cursor params
function addLCP(mid, lcid) {
  const lc = findLC(mid, lcid); if (!lc) return;
  const p = newCursorParam(S.autoPrefixCursorParams);
  lc.cursorParams.push(p);
  focusId = 'pn_' + p.id;
  render();
}
function removeLCP(mid, lcid, pid) {
  const lc = findLC(mid, lcid); if (!lc) return;
  lc.cursorParams = lc.cursorParams.filter(p => p.id !== pid);
  render();
}

// Copy from dropdown into a local cursor
function copyToLC(mid, lcid) {
  const srcId = $('lcSrc_' + lcid)?.value;
  const src   = srcId ? findM(srcId) : null;
  if (!src) { alert('Select a source.'); return; }
  const srcList = src.type === 'CURSOR' ? src.cursorParams : src.params;
  if (!srcList.length) { alert('Selected source has no params.'); return; }
  findLC(mid, lcid).cursorParams = srcList.map(p => ({
    ...newCursorParam(), name: 'cp_' + (p.name || 'param').replace(/^cp_/, ''),
  }));
  render();
}

// ── Drag to reorder ───────────────────────────────────
let dragFrom = null;
const EDITABLE = new Set(['INPUT','TEXTAREA','SELECT','BUTTON','LABEL','A']);

function setupDrag() {
  document.querySelectorAll('.mcard[draggable]').forEach(card => {
    card.ondragstart = e => {
      if (EDITABLE.has(e.target.tagName) || e.target.closest('input,textarea,select,button,label')) {
        e.preventDefault(); return;
      }
      dragFrom = card.dataset.id; card.classList.add('dragging');
    };
    card.ondragend   = () => { card.classList.remove('dragging'); card.style.outline = ''; };
    card.ondragover  = e  => { e.preventDefault(); card.style.outline = '2px solid #534AB7'; };
    card.ondragleave = ()  => { card.style.outline = ''; };
    card.ondrop      = e  => {
      e.preventDefault(); card.style.outline = '';
      if (!dragFrom || dragFrom === card.dataset.id) return;
      const fi = methods.findIndex(m => m.id === dragFrom);
      const ti = methods.findIndex(m => m.id === card.dataset.id);
      if (fi < 0 || ti < 0) return;
      const [moved] = methods.splice(fi, 1); methods.splice(ti, 0, moved);
      render();
    };
  });
}

// ── Output ────────────────────────────────────────────
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
  if (el && el.style.display !== 'none')
    navigator.clipboard.writeText(el.textContent || '').catch(() => {});
}

function generate() {
  const name    = ($('pkgName').value  || 'PKG_UNNAMED').toUpperCase();
  const schema  = ($('pkgSchema').value || '').toUpperCase();
  const purpose = $('pkgPurpose').value || '';
  const authid  = $('pkgAuthid').value;
  const genBody = $('chkBody').checked;
  const list    = orderedMethods();
  const fqn     = schema ? `${schema}.${name}` : name;

  $('phMsg').style.display  = 'none';
  $('cSpec').textContent    = buildSpec(fqn, schema, authid, list, purpose);
  $('cBody').textContent    = genBody ? buildBody(fqn, schema, authid, list, purpose) : '-- BODY generation disabled';
  $('cSpec').style.display  = curTab === 'spec' ? 'block' : 'none';
  $('cBody').style.display  = curTab === 'body' ? 'block' : 'none';
  $('tBody').style.opacity  = genBody ? '1' : '.4';
}

function clearAll() {
  methods = [];
  ['pkgName','pkgSchema','pkgPurpose'].forEach(id => { const el=$(id); if(el) el.value=''; });
  $('pkgAuthid').value=''; $('chkOrd').checked=false; $('chkBody').checked=true;
  $('phMsg').style.display='flex'; $('cSpec').style.display='none'; $('cBody').style.display='none';
  focusId = 'pkgName';
  render();
}

// ── Code generation ───────────────────────────────────
function fmtParams(params, isCursor) {
  if (!params?.length) return '';
  const maxN = Math.max(...params.map(p => (p.name||'p').length), 4);
  const maxM = isCursor ? 0 : Math.max(...params.map(p => (p.mode||'IN').length), 2);
  const lines = params.map(p => {
    let l = `    ${pad(p.name||'p', maxN+1)} `;
    if (!isCursor) l += `${pad(p.mode||'IN', maxM+1)} `;
    l += p.type || 'VARCHAR2';
    if (!isCursor && p.def?.trim()) l += ` DEFAULT ${p.def.trim()}`;
    return l;
  });
  return ' (\n' + lines.join(',\n') + '\n  )';
}

function emitRecord(m, i='  ') {
  let s = `${i}TYPE ${m.name.toUpperCase()} IS RECORD (\n`;
  s += m.params.length
    ? m.params.map(p => `${i}  ${pad(p.name.toUpperCase(),24)} ${p.type||'VARCHAR2(255)'}`).join(',\n') + '\n'
    : `${i}  -- add record fields\n`;
  return s + `${i});\n\n`;
}

function emitTable(m, i='  ') {
  const idx = m.indexedBy === 'custom' ? (m.indexedByCustom||'PLS_INTEGER') : m.indexedBy;
  return `${i}TYPE ${m.name.toUpperCase()} IS TABLE OF ${(m.recordRef||'VARCHAR2(4000)').toUpperCase()}\n${i}  INDEX BY ${idx};\n\n`;
}

function emitCursor(c, i='  ') {
  const cn = cfn(c.name);
  let s = `${i}CURSOR ${cn}`;
  if (c.cursorParams?.length) s += fmtParams(c.cursorParams, true);
  if (c.selectSql?.trim()) {
    const lines = c.selectSql.trim().split('\n');
    s += `\n${i}IS ${lines[0]}`;
    for (let j = 1; j < lines.length; j++) s += `\n${i}   ${lines[j]}`;
  } else {
    s += `\n${i}IS\n${i}  SELECT NULL FROM DUAL -- TODO`;
  }
  return s + ';\n\n';
}

function applyTpl(tpl, vars) {
  return (tpl||'').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function pkgComment(fqn, schema, purpose) {
  const date = new Date().toISOString().split('T')[0];
  if (S.pkgSig?.trim()) return applyTpl(S.pkgSig, { package:fqn, schema, date, author:S.author||'', purpose });
  return `  /*${'='.repeat(66)}\n  ** Package : ${fqn}\n  ** Author  : ${S.author||''}\n  ** Created : ${date}\n  ** Purpose : ${purpose}\n  **${'='.repeat(66)}*/`;
}

function procComment(m) {
  if (!S.procSig?.trim()) return m.purpose ? `  -- ${m.type}: ${m.name} | ${m.purpose}${S.author?' | '+S.author:''}\n` : '';
  return applyTpl(S.procSig, { name:m.name, type:m.type, date:new Date().toISOString().split('T')[0], author:S.author||'', purpose:m.purpose||'' }) + '\n';
}

function excBlock(ind) {
  const body = (S.exceptionBody || 'RAISE;').trim();
  return `${ind.slice(0,-2)}EXCEPTION\n${ind}WHEN OTHERS THEN\n` + body.split('\n').map(l=>`${ind}${l}`).join('\n');
}

function buildSpec(fqn, schema, authid, list, purpose) {
  let s = `CREATE OR REPLACE PACKAGE ${fqn}`;
  if (authid) s += `\n  AUTHID ${authid}`;
  s += `\nAS\n\n${pkgComment(fqn, schema, purpose)}\n\n`;
  for (const m of list) {
    if (!m.name || m.isPrivate) continue;
    if (m.type === 'TYPE_RECORD') s += emitRecord(m);
    else if (m.type === 'TYPE_TABLE') s += emitTable(m);
    else if (m.type === 'CURSOR') s += emitCursor(m);
    else if (m.type === 'PROCEDURE') s += `  PROCEDURE ${m.name}_PC${fmtParams(m.params)};\n\n`;
    else if (m.type === 'FUNCTION')  s += `  FUNCTION ${m.name}_FN${fmtParams(m.params)}\n  RETURN ${m.returnType||'BOOLEAN'};\n\n`;
  }
  return s + `END ${fqn};\n/`;
}

function buildBody(fqn, schema, authid, list, purpose) {
  let s = `CREATE OR REPLACE PACKAGE BODY ${fqn}\nAS\n\n${pkgComment(fqn, schema, purpose)}\n\n`;

  const privTypes   = list.filter(m => m.name && m.isPrivate && (m.type==='TYPE_RECORD'||m.type==='TYPE_TABLE'));
  const privCursors = list.filter(m => m.name && m.isPrivate && m.type==='CURSOR');
  const rowVars     = list.filter(m => m.name && m.type==='CURSOR' && m.declareRowVar);

  if (privTypes.length)   { s += `  -- Private types\n`;   privTypes.forEach(m   => s += m.type==='TYPE_RECORD' ? emitRecord(m) : emitTable(m)); }
  if (privCursors.length) { s += `  -- Private cursors\n`; privCursors.forEach(m => s += emitCursor(m)); }
  if (rowVars.length)     { s += `  -- Cursor rowtype vars\n`; rowVars.forEach(m  => s += `  r_${cbn(m.name)}  ${cfn(m.name)}%ROWTYPE;\n`); s += '\n'; }

  const skip = new Set(['TYPE_RECORD','TYPE_TABLE','CURSOR']);
  for (const m of list) {
    if (!m.name || skip.has(m.type)) continue;
    s += procComment(m);
    if (m.isPrivate) s += `  -- Private\n`;

    const lcs  = (m.localCursors||[]).filter(c => c.name);
    const lcVars = lcs.filter(c => c.declareRowVar);

    if (m.type === 'PROCEDURE') {
      s += `  PROCEDURE ${m.name}_PC${fmtParams(m.params)} IS\n`;
      lcs.forEach(c => s += emitCursor(c, '    '));
      lcVars.forEach(c => s += `    r_${cbn(c.name)}  ${cfn(c.name)}%ROWTYPE;\n`);
      s += `  BEGIN\n    -- TODO: implement ${m.name}\n    NULL;\n${excBlock('    ')}\n  END ${m.name};\n\n`;
    }
    if (m.type === 'FUNCTION') {
      const rt = m.returnType || 'BOOLEAN';
      s += `  FUNCTION ${m.name}_FN${fmtParams(m.params)}\n  RETURN ${rt} IS\n    l_result  ${rt};\n`;
      lcs.forEach(c => s += emitCursor(c, '    '));
      lcVars.forEach(c => s += `    r_${cbn(c.name)}  ${cfn(c.name)}%ROWTYPE;\n`);
      s += `  BEGIN\n    -- TODO: implement ${m.name}\n    RETURN l_result;\n${excBlock('    ')}\n  END ${m.name};\n\n`;
    }
  }
  return s + `END ${fqn};\n/`;
}

// ── Settings ──────────────────────────────────────────
function showSettings() {
  // Populate form from S
  $('s_defaultType').value             = S.defaultType || '';
  $('s_customTypesTop').checked        = !!S.customTypesTop;
  $('s_autoPrefixCursorParams').checked = !!S.autoPrefixCursorParams;
  $('s_exceptionBody').value           = S.exceptionBody || '';
  $('s_pkgSig').value                  = S.pkgSig || '';
  $('s_procSig').value                 = S.procSig || '';
  $('s_author').value                  = S.author || '';
  renderChips();
  $('viewMain').classList.remove('active');
  $('viewSettings').classList.add('active');
}

function hideSettings() {
  $('viewSettings').classList.remove('active');
  $('viewMain').classList.add('active');
}

function saveSettings() {
  S.defaultType            = $('s_defaultType').value.trim() || 'VARCHAR2(255)';
  S.customTypesTop         = $('s_customTypesTop').checked;
  S.autoPrefixCursorParams = $('s_autoPrefixCursorParams').checked;
  S.exceptionBody          = $('s_exceptionBody').value;
  S.pkgSig                 = $('s_pkgSig').value;
  S.procSig                = $('s_procSig').value;
  S.author                 = $('s_author').value;
  saveSettingsToStorage();
  hideSettings();
}

function resetSettings() {
  if (!confirm('Reset all settings to defaults?')) return;
  Object.assign(S, DEFAULTS);
  showSettings(); // re-populate form
}

function exportSettings() {
  const b = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b);
  a.download = 'plsql_settings.json'; a.click();
}

function importSettings(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      Object.assign(S, DEFAULTS, JSON.parse(ev.target.result));
      saveSettingsToStorage();
      showSettings();
      alert('Imported. Default type: ' + S.defaultType + '\nCustom types: [' + (S.customTypes||[]).join(', ') + ']');
    } catch (x) { alert('Invalid JSON: ' + x.message); }
  };
  r.readAsText(f); e.target.value = '';
}

function renderChips() {
  $('customTypeChips').innerHTML = (S.customTypes||[]).map((t,i) =>
    `<span class="chip">★ ${esc(t)}<button onclick="removeChip(${i})">✕</button></span>`
  ).join('');
}

function addChip() {
  const inp = $('newChip'); const v = inp.value.trim(); if (!v) return;
  if (!S.customTypes.includes(v)) S.customTypes.push(v);
  inp.value = ''; renderChips();
}

function removeChip(i) { S.customTypes.splice(i, 1); renderChips(); }

function switchStab(el, id) {
  document.querySelectorAll('.stab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.spanel').forEach(p => p.classList.remove('on'));
  el.classList.add('on'); $(id).classList.add('on');
}

// ── Boot ──────────────────────────────────────────────
$('chkOrd').addEventListener('change', render);
render();
