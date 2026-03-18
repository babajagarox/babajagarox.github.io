/**
 * settings.js
 * Manages user preferences — persisted to localStorage as JSON.
 * Single mutable object `S` — never reassigned so all closures
 * remain valid after import/reset.
 */

export const DEFAULTS = {
  defaultType:           'VARCHAR2(255)',
  customTypes:           [],
  customTypesTop:        true,
  autoPrefixCursorParams: false,   // prepend cp_ to new cursor params on add
  exceptionBody:         'RAISE;',
  pkgSig:                '',
  procSig:               '',
  author:                '',
};

const STORAGE_KEY = 'plsql_creator_v1';

/** The single source-of-truth settings object. */
export const S = Object.assign({}, DEFAULTS);

/** Load from localStorage on startup. */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.keys(S).forEach(k => delete S[k]);
      Object.assign(S, DEFAULTS, parsed);
    }
  } catch (e) {
    console.warn('plsql-creator: could not load settings', e);
  }
}

/** Write current S to localStorage. */
export function persistSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
  } catch (e) {
    console.warn('plsql-creator: could not persist settings', e);
  }
}

/** Overwrite S in-place from a parsed object (keeps all closure refs valid). */
export function applyParsed(parsed) {
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, DEFAULTS, parsed);
}

/** Read form → S → persist → close settings view. */
export function saveFromForm() {
  S.defaultType    = (document.getElementById('s_defaultType').value.trim()) || 'VARCHAR2(255)';
  S.customTypesTop        = document.getElementById('s_customTypesTop').checked;
  S.autoPrefixCursorParams = document.getElementById('s_autoPrefixCursorParams').checked;
  S.exceptionBody         = document.getElementById('s_exceptionBody').value;
  S.pkgSig         = document.getElementById('s_pkgSig').value;
  S.procSig        = document.getElementById('s_procSig').value;
  S.author         = document.getElementById('s_author').value;
  // S.customTypes already mutated live via addCustomType / removeCustomType
  persistSettings();
}

/** Push S into the settings form fields. */
export function populateForm() {
  document.getElementById('s_defaultType').value    = S.defaultType || '';
  document.getElementById('s_customTypesTop').checked          = !!S.customTypesTop;
  document.getElementById('s_autoPrefixCursorParams').checked  = !!S.autoPrefixCursorParams;
  document.getElementById('s_exceptionBody').value             = S.exceptionBody || '';
  document.getElementById('s_pkgSig').value         = S.pkgSig || '';
  document.getElementById('s_procSig').value        = S.procSig || '';
  document.getElementById('s_author').value         = S.author || '';
  renderChips();
}

/** Re-render the custom type chip list in settings. */
export function renderChips() {
  const el = document.getElementById('customTypeChips');
  if (!el) return;
  el.innerHTML = (S.customTypes || [])
    .map((t, i) => `<span class="chip">★ ${esc(t)}<button onclick="window.PLSQL.removeCustomType(${i})">✕</button></span>`)
    .join('');
}

export function addCustomType() {
  const inp = document.getElementById('newCustomType');
  const v = inp.value.trim();
  if (!v) return;
  if (!Array.isArray(S.customTypes)) S.customTypes = [];
  if (!S.customTypes.includes(v)) S.customTypes.push(v);
  inp.value = '';
  renderChips();
}

export function removeCustomType(i) {
  S.customTypes.splice(i, 1);
  renderChips();
}

export function resetSettings() {
  if (!confirm('Reset all settings to defaults?')) return;
  applyParsed({});
  populateForm();
  persistSettings();
}

export function exportSettings() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plsql_creator_settings.json';
  a.click();
}

export function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed = JSON.parse(ev.target.result);
      applyParsed(parsed);
      persistSettings();
      populateForm();
      alert(
        `Imported.\nDefault type: ${S.defaultType}\n` +
        `Custom types: [${(S.customTypes || []).join(', ')}]`
      );
    } catch (x) {
      alert('Invalid settings JSON: ' + x.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ── helpers ──────────────────────────────────────────────
function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
