'use strict';
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { esc } = L;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const IS_MAC = /Mac/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const MIME_ITEM = 'application/x-lightwarden-item';
const MIME_FOLDER = 'application/x-lightwarden-folder';

// Icons: Lucide (ISC licence) path data.
const ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  note: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  folderPlus: '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderInput: '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-1.73"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/>',
  chevRight: '<path d="m9 18 6-6-6-6"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  chevUpDown: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  keyboard: '<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  expand: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  collapse: '<path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/>',
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const SHIELD = '<svg viewBox="62 62 156 186" aria-hidden="true"><path fill="currentColor" d="M189.909 161.837V90.424H140V217.294C148.838 212.608 156.748 207.512 163.729 202.007C181.183 188.32 189.909 174.93 189.909 161.837ZM211.299 76.1413V161.837C211.299 168.235 210.055 174.576 207.567 180.862C205.079 187.148 201.997 192.727 198.32 197.6C194.644 202.472 190.262 207.214 185.175 211.826C180.087 216.439 175.39 220.27 171.082 223.32C166.774 226.369 162.281 229.252 157.602 231.967C152.923 234.682 149.6 236.524 147.631 237.491C145.663 238.458 144.085 239.202 142.897 239.722C142.005 240.169 141.04 240.392 140 240.392C138.96 240.392 137.995 240.169 137.104 239.722C135.915 239.202 134.337 238.458 132.369 237.491C130.401 236.524 127.077 234.682 122.398 231.967C117.719 229.252 113.226 226.369 108.918 223.32C104.611 220.27 99.913 216.439 94.8256 211.826C89.7381 207.214 85.3562 202.472 81.6798 197.6C78.0035 192.727 74.9213 187.148 72.4332 180.862C69.9452 174.576 68.7012 168.235 68.7012 161.837V76.1413C68.7012 74.2072 69.4067 72.5335 70.8179 71.1201C72.229 69.7067 73.9001 69 75.8311 69H204.169C206.1 69 207.771 69.7067 209.182 71.1201C210.594 72.5335 211.299 74.2072 211.299 76.1413Z"/></svg>';

const KINDS = [
  { k: 0, label: 'Tous les éléments', icon: 'grid' },
  { k: 1, label: 'Identifiants', one: 'Identifiant', icon: 'globe' },
  { k: 3, label: 'Cartes', one: 'Carte', icon: 'card' },
  { k: 4, label: 'Identités', one: 'Identité', icon: 'user' },
  { k: 2, label: 'Notes sécurisées', one: 'Note sécurisée', icon: 'note' },
  { k: 5, label: 'Clés SSH', one: 'Clé SSH', icon: 'terminal' },
];
const kindOf = (k) => KINDS.find((x) => x.k === k) || KINDS[1];

// Field layout per item type: [group title, [[key, label, flags]]]. Keys are Bitwarden's field names.
const SCHEMA = {
  1: [['Identifiants', [['username', "Nom d'utilisateur"], ['password', 'Mot de passe', 'secret gen'], ['totp', 'Clé d’authentification (TOTP)', 'secret']]],
    ['Site web', [['uri', 'URL', 'link']]]],
  3: [['Carte', [['cardholderName', 'Titulaire'], ['brand', 'Marque'], ['number', 'Numéro', 'secret mono'],
    ['expMonth', 'Mois d’expiration', 'month'], ['expYear', 'Année d’expiration'], ['code', 'Code de sécurité', 'secret mono']]]],
  4: [['Identité', [['title', 'Civilité'], ['firstName', 'Prénom'], ['middleName', 'Deuxième prénom'], ['lastName', 'Nom'],
    ['username', "Nom d'utilisateur"], ['company', 'Société'], ['ssn', 'N° de sécurité sociale', 'secret'],
    ['passportNumber', 'N° de passeport', 'secret'], ['licenseNumber', 'N° de permis de conduire', 'secret']]],
    ['Contact', [['email', 'E-mail'], ['phone', 'Téléphone']]],
    ['Adresse', [['address1', 'Adresse'], ['address2', 'Adresse (suite)'], ['address3', 'Adresse (suite)'],
      ['postalCode', 'Code postal'], ['city', 'Ville'], ['state', 'Région'], ['country', 'Pays']]]],
  2: [],
  5: [['Clé SSH', [['privateKey', 'Clé privée', 'secret mono multi'], ['publicKey', 'Clé publique', 'mono'], ['keyFingerprint', 'Empreinte', 'mono']]]],
};
const has = (flags, f) => (flags || '').split(' ').includes(f);
const SERVERS = ['bitwarden.com', 'bitwarden.eu', 'Auto-hébergé'];

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* per-viewer convenience only */ } },
};

let snap = null;      // accounts + settings from Rust
let vault = null;     // { folders, items } of the current account, null when locked
const st = {
  folder: '', kind: 0, query: '', list: [], selId: null,
  adding: false, needCode: '', revealed: new Set(), tab: 0, usePw: false,
  edit: null, dirty: false, // item being created/edited
};
const collapsed = new Set(store.get('collapsed', []));

const account = () => snap.accounts[snap.current];
const cur = () => (vault && st.selId ? vault.items.find((i) => i.id === st.selId) : null) || null;
const leaf = (p) => p.split('/').pop();
const parentOf = (p) => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';

function allFolderPaths() {
  return L.flatten(L.buildTree(vault.folders, vault.items), new Set()).map((r) => r.path);
}

/* ---------------- data ---------------- */
async function refresh() {
  snap = await invoke('snapshot');
  vault = snap.accounts.length ? await invoke('vault') : null;
  if (!vault) { st.edit = null; st.dirty = false; } else st.usePw = false;
  applyTheme();
  render();
}

function applyTheme() {
  const t = snap.global.theme;
  if (t === 0) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t === 1 ? 'light' : 'dark';
}

/** Runs a vault write in Rust; the backend re-syncs and returns the fresh vault. */
async function mutate(cmd, args, okMsg) {
  document.body.classList.add('busy');
  try {
    vault = await invoke(cmd, args);
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    toast(String(e), true);
    try { vault = await invoke('vault') || vault; } catch { /* keep last known */ }
    return false;
  } finally {
    document.body.classList.remove('busy');
    if (vault && $('#shell')) { renderSidebar(); renderList(); }
  }
}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.className = 'toast show' + (bad ? ' bad' : '');
  t.innerHTML = ic(bad ? 'alert' : 'check') + esc(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), bad ? 4000 : 1800);
}

async function copyText(text, label) {
  if (!text) return;
  try { await invoke('copy', { text }); toast(`${label} copié`); }
  catch (e) { toast(`Copie impossible : ${e}`, true); }
}
const copyField = (it, key, label) => it && copyText(key === 'name' || key === 'notes' ? it[key] : it.data[key], label);
async function openUri(it) {
  const u = it?.data.uri;
  if (!u) return;
  try { await invoke('open_url', { url: u.includes('://') ? u : 'https://' + u }); } catch (e) { toast(String(e), true); }
}

/* ---------------- render ---------------- */
function render() {
  closeMenu();
  const app = $('#app');
  if (!vault || st.adding) {
    $('#shell')?.remove();
    const acc = snap.accounts[snap.current];
    const pin = !st.adding && acc?.pin && !st.usePw;
    app.innerHTML = pin ? pinView(acc) : loginView();
    pin ? bindPin() : bindLogin();
    return;
  }
  if (!$('#shell')) { app.innerHTML = shellView(); bindShell(); }
  renderSidebar();
  renderList();
}

/* ---------- login ---------- */
function loginView() {
  const acc = snap.accounts[snap.current];
  const adding = st.adding || !acc;
  const kind = adding ? 0 : acc.server_kind;
  return `<div class="login-wrap"><form class="login-card" id="login" autocomplete="off" novalidate>
    <div class="logo">${SHIELD}</div>
    <h1>${adding ? 'Connexion' : 'Coffre verrouillé'}</h1>
    <p class="muted">${adding ? 'Connectez-vous à votre compte Bitwarden' : 'Saisissez votre mot de passe maître pour déverrouiller'}</p>
    <div class="seg" role="radiogroup" aria-label="Serveur">${SERVERS.map((l, i) => `<button type="button" role="radio" aria-checked="${i === kind}" data-srv="${i}" class="${i === kind ? 'on' : ''}">${l}</button>`).join('')}</div>
    <label class="fld ${kind === 2 ? '' : 'hidden'}" id="url-fld"><span class="fld-l">URL du serveur</span>
      <input id="l-url" type="url" placeholder="https://vault.exemple.fr" value="${esc(adding ? '' : acc.server_url)}"></label>
    <label class="fld"><span class="fld-l">Adresse e-mail</span>
      <input id="l-email" type="email" value="${esc(adding ? '' : acc.email)}" placeholder="vous@exemple.fr"></label>
    <label class="fld"><span class="fld-l">Mot de passe maître</span>
      <div class="pw"><input id="l-pw" type="password"><button type="button" class="icon-btn sm" id="l-reveal" title="Afficher">${ic('eye')}</button></div></label>
    <label class="fld ${st.needCode ? '' : 'hidden'}" id="code-fld"><span class="fld-l" id="code-hint">${esc(st.needCode)}</span>
      <input id="l-code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456"></label>
    <div class="err" id="l-err" role="alert"></div>
    <button class="primary" id="l-go" type="submit">${adding ? 'Se connecter' : 'Déverrouiller'}</button>
    ${!adding && acc.pin ? '<button type="button" class="ghost" id="l-pin">Utiliser le code PIN</button>' : ''}
    ${snap.accounts.length ? `<button type="button" class="ghost" id="l-other">${adding ? 'Annuler' : 'Changer de compte'}</button>` : ''}
  </form></div>`;
}

/* ---------- PIN unlock ---------- */
function pinView(acc) {
  return `<div class="login-wrap"><form class="login-card" id="login" autocomplete="off" novalidate>
    <div class="logo">${SHIELD}</div>
    <h1>Coffre verrouillé</h1>
    <p class="muted">${esc(acc.email)}</p>
    <label class="fld"><span class="fld-l">Code PIN</span>
      <input id="p-pin" type="password" autocomplete="off" spellcheck="false"></label>
    <div class="err" id="l-err" role="alert"></div>
    <button class="primary" id="l-go" type="submit">Déverrouiller</button>
    <button type="button" class="ghost" id="p-mp">Utiliser le mot de passe maître</button>
    <button type="button" class="ghost" id="l-other">Changer de compte</button>
  </form></div>`;
}

function bindPin() {
  const form = $('#login');
  $('#p-mp').onclick = () => { st.usePw = true; render(); };
  $('#l-other').onclick = (e) => openAccountMenu(e.currentTarget);
  $('#p-pin').focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#l-go'), err = $('#l-err'), pin = $('#p-pin').value;
    if (!pin) { $('#p-pin').focus(); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Déverrouillage…'; err.textContent = '';
    try {
      await invoke('unlock_pin', { pin });
      Object.assign(st, { selId: null, query: '' });
      await refresh();
      return;
    } catch (x) {
      snap = await invoke('snapshot');
      if (!account().pin) { render(); $('#l-err').textContent = String(x); return; } // too many tries: master password
      err.textContent = String(x);
    }
    btn.disabled = false; btn.textContent = 'Déverrouiller';
    $('#p-pin').select();
  };
}

/** Create + confirm the PIN; resolves true once it is set. */
function pinModal() {
  return new Promise((resolve) => {
    const m = modal(`<form id="m-form" novalidate><div class="modal-h"><h2>Définir un code PIN</h2></div>
      <div class="modal-b"><p class="muted pin-intro">Le code PIN déverrouille ce coffre sans votre mot de passe maître. Après un redémarrage de Lightwarden, ou après 5 codes erronés, le mot de passe maître est demandé une fois.</p>
        <label class="fld"><span class="fld-l">Code PIN</span><input id="pin1" type="password" autocomplete="off" spellcheck="false"></label>
        <label class="fld"><span class="fld-l">Confirmer le code PIN</span><input id="pin2" type="password" autocomplete="off" spellcheck="false"></label>
        <div class="err" id="pin-err" role="alert"></div></div>
      <div class="modal-f"><button type="button" class="ghost" data-close>Annuler</button><button class="primary" type="submit" id="pin-ok">Définir le code PIN</button></div></form>`, 'sm', () => resolve(false));
    const [a, b, err, ok] = ['#pin1', '#pin2', '#pin-err', '#pin-ok'].map((x) => m.querySelector(x));
    a.focus();
    m.querySelector('#m-form').onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      if ([...a.value].length < 4) { err.textContent = 'Le code PIN doit comporter au moins 4 caractères.'; a.focus(); return; }
      if (a.value !== b.value) { err.textContent = 'Les deux codes PIN ne correspondent pas.'; b.select(); return; }
      ok.disabled = true; ok.innerHTML = '<span class="spinner"></span>Définir le code PIN';
      try { await invoke('set_pin', { pin: a.value }); finishModal(resolve, true); }
      catch (x) { err.textContent = String(x); ok.disabled = false; ok.textContent = 'Définir le code PIN'; }
    };
  });
}

function bindLogin() {
  const form = $('#login');
  let kind = +form.querySelector('.seg .on').dataset.srv;
  $$('[data-srv]', form).forEach((b) => b.onclick = () => {
    kind = +b.dataset.srv;
    $$('[data-srv]', form).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    $('#url-fld').classList.toggle('hidden', kind !== 2);
    if (kind === 2) $('#l-url').focus();
  });
  $('#l-reveal').onclick = () => {
    const pw = $('#l-pw'); const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    $('#l-reveal').innerHTML = ic(show ? 'eyeOff' : 'eye');
  };
  const usePin = $('#l-pin');
  if (usePin) usePin.onclick = () => { st.usePw = false; render(); };
  const other = $('#l-other');
  if (other) other.onclick = (e) => {
    if (st.adding) { st.adding = false; st.needCode = ''; render(); }
    else openAccountMenu(e.currentTarget);
  };
  ($('#l-email').value ? $('#l-pw') : $('#l-email')).focus();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#l-go'), err = $('#l-err');
    const label = btn.textContent;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Connexion…'; err.textContent = '';
    try {
      const r = await invoke('login', { kind, url: $('#l-url').value, email: $('#l-email').value, password: $('#l-pw').value, code: $('#l-code').value });
      if (r.status === 'NeedCode') {
        st.needCode = r.hint;
        $('#code-hint').textContent = r.hint;
        $('#code-fld').classList.remove('hidden');
        $('#l-code').value = ''; $('#l-code').focus();
      } else {
        Object.assign(st, { adding: false, needCode: '', folder: '', kind: 0, query: '', selId: null });
        await refresh();
        return;
      }
    } catch (x) {
      err.textContent = String(x);
    }
    btn.disabled = false; btn.textContent = label;
  };
}

/* ---------- shell ---------- */
function shellView() {
  return `<div id="shell">
    <aside class="side">
      <div class="brand"><div class="logo">${SHIELD}</div>Lightwarden</div>
      <button class="acct" id="acct" aria-haspopup="menu"></button>
      <div class="side-scroll" id="side-scroll">
        <nav id="kinds"></nav>
        <div class="side-h" data-drop="" id="folders-h"><span>Dossiers</span>
          <button class="icon-btn xs" id="b-newfolder" title="Nouveau dossier (${MOD}+⇧+N)">${ic('plus')}</button></div>
        <div id="tree" role="tree"></div>
      </div>
      <div class="side-foot">
        <button class="ghost" id="b-lock" title="Verrouiller (${MOD}+L)">${ic('lock')}Verrouiller</button>
        <button class="icon-btn" id="b-sync" title="Synchroniser (${MOD}+R)">${ic('refresh')}</button>
        <button class="icon-btn" id="b-keys" title="Raccourcis clavier (F1)">${ic('keyboard')}</button>
        <button class="icon-btn" id="b-settings" title="Paramètres (${MOD}+,)">${ic('settings')}</button>
      </div>
    </aside>
    <section class="list">
      <div class="list-top">
        <div class="search">${ic('search')}<input id="q" placeholder="Rechercher dans le coffre" spellcheck="false" autocomplete="off">
          <kbd id="q-kbd">${MOD} F</kbd><button class="icon-btn sm hidden" id="q-clear" title="Effacer (Échap)">${ic('x')}</button></div>
        <button class="primary new-btn" id="b-new" title="Nouvel élément (${MOD}+N)">${ic('plus')}</button>
      </div>
      <div class="list-h"><b id="list-title"></b><span id="list-count"></span></div>
      <div class="items" id="items" tabindex="0" role="listbox"></div>
    </section>
    <main class="detail" id="detail"></main>
  </div>`;
}

function bindShell() {
  $('#acct').onclick = (e) => openAccountMenu(e.currentTarget);
  $('#b-lock').onclick = doLock;
  $('#b-sync').onclick = doSync;
  $('#b-settings').onclick = openSettings;
  $('#b-keys').onclick = openShortcuts;
  $('#b-new').onclick = (e) => openNewMenu(e.currentTarget);
  $('#b-newfolder').onclick = (e) => { e.stopPropagation(); newFolder(''); };
  const q = $('#q');
  q.oninput = () => setQuery(q.value);
  $('#q-clear').onclick = () => { setQuery(''); q.focus(); };

  $('#kinds').onclick = (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    st.kind = +b.dataset.kind;
    if (st.kind === 0) st.folder = '';
    renderSidebar(); renderList();
  };

  const tree = $('#tree');
  tree.onclick = (e) => {
    const row = e.target.closest('[data-path]');
    if (!row) return;
    if (e.target.closest('.twist')) return toggleFolder(row.dataset.path);
    st.folder = row.dataset.path === st.folder ? '' : row.dataset.path;
    renderSidebar(); renderList();
  };
  tree.ondblclick = (e) => { const row = e.target.closest('[data-path]'); if (row && !e.target.closest('.twist')) toggleFolder(row.dataset.path); };
  $('#side-scroll').oncontextmenu = (e) => {
    e.preventDefault();
    const row = e.target.closest('[data-path]');
    if (row) return openMenu(e.clientX, e.clientY, folderMenu(row.dataset.path));
    openMenu(e.clientX, e.clientY, [
      { icon: 'folderPlus', label: 'Nouveau dossier', kbd: `${MOD}+⇧+N`, run: () => newFolder('') },
      { icon: 'plus', label: 'Nouvel élément', kbd: `${MOD}+N`, run: () => openNewMenu(null, e.clientX, e.clientY) },
      '-',
      { icon: 'expand', label: 'Tout développer', run: expandAll },
      { icon: 'collapse', label: 'Tout réduire', run: collapseAll },
    ]);
  };

  const items = $('#items');
  items.onclick = (e) => {
    const qb = e.target.closest('[data-quick]');
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const it = vault.items.find((i) => i.id === row.dataset.id);
    if (qb) return qb.dataset.quick === 'u' ? copyField(it, 'username', "Nom d'utilisateur") : copyField(it, 'password', 'Mot de passe');
    select(row.dataset.id);
  };
  items.ondblclick = (e) => {
    const row = e.target.closest('[data-id]');
    if (row && !e.target.closest('[data-quick]')) startEdit();
  };
  items.oncontextmenu = async (e) => {
    e.preventDefault();
    const row = e.target.closest('[data-id]');
    if (!row) return openMenu(e.clientX, e.clientY, newItemEntries());
    if (!await select(row.dataset.id)) return;
    openMenu(e.clientX, e.clientY, itemMenu(cur()));
  };
  bindDnd();
}

/* ---------- menus content ---------- */
function newItemEntries(folder = st.folder) {
  return KINDS.filter((k) => k.k).map((k) => ({ icon: k.icon, label: k.one, run: () => startNew(k.k, folder) }));
}
function openNewMenu(anchor, x, y) {
  if (anchor) { const r = anchor.getBoundingClientRect(); x = r.left; y = r.bottom + 6; }
  openMenu(x, y, newItemEntries());
}

function itemMenu(it) {
  const d = it.data;
  const m = [];
  if (d.username) m.push({ icon: 'user', label: "Copier le nom d'utilisateur", kbd: `${MOD}+B`, run: () => copyField(it, 'username', "Nom d'utilisateur") });
  if (d.password) m.push({ icon: 'key', label: 'Copier le mot de passe', kbd: `${MOD}+C`, run: () => copyField(it, 'password', 'Mot de passe') });
  if (d.uri) m.push({ icon: 'link', label: "Copier l'URL", kbd: `${MOD}+⇧+U`, run: () => copyField(it, 'uri', 'URL') },
    { icon: 'external', label: 'Ouvrir le site web', kbd: `${MOD}+U`, run: () => openUri(it) });
  if (d.number) m.push({ icon: 'card', label: 'Copier le numéro', run: () => copyField(it, 'number', 'Numéro') });
  if (d.code) m.push({ icon: 'key', label: 'Copier le code de sécurité', run: () => copyField(it, 'code', 'Code') });
  if (d.publicKey) m.push({ icon: 'copy', label: 'Copier la clé publique', run: () => copyField(it, 'publicKey', 'Clé publique') },
    { icon: 'download', label: 'Exporter la clé privée…', run: () => exportKey(it, true) },
    { icon: 'download', label: 'Exporter la clé publique…', run: () => exportKey(it, false) });
  m.push({ icon: 'type', label: 'Copier le nom', run: () => copyField(it, 'name', 'Nom') });
  if (it.notes) m.push({ icon: 'note', label: 'Copier les notes', run: () => copyField(it, 'notes', 'Notes') });
  m.push('-',
    { icon: 'pencil', label: 'Modifier', kbd: `${MOD}+E`, run: startEdit },
    { icon: 'folderInput', label: 'Déplacer vers…', run: () => moveDialog(it) },
    { icon: 'trash', label: 'Supprimer', kbd: 'Suppr', danger: true, run: () => deleteItem(it) });
  return m;
}

function folderMenu(p) {
  const hasKids = allFolderPaths().some((x) => x.startsWith(p + '/'));
  return [
    { icon: 'plus', label: 'Nouvel élément ici', run: () => { const r = $(`#tree [data-path="${CSS.escape(p)}"]`)?.getBoundingClientRect(); openMenu(r ? r.right - 40 : 200, r ? r.bottom : 200, newItemEntries(p)); } },
    { icon: 'folderPlus', label: 'Nouveau sous-dossier', run: () => newFolder(p) },
    { icon: 'pencil', label: 'Renommer', kbd: 'F2', run: () => renameFolder(p) },
    { icon: 'trash', label: 'Supprimer', danger: true, run: () => deleteFolder(p) },
    '-',
    { icon: collapsed.has(p) ? 'expand' : 'collapse', label: collapsed.has(p) ? 'Développer' : 'Réduire', disabled: !hasKids, run: () => toggleFolder(p) },
    { icon: 'expand', label: 'Tout développer', run: expandAll },
    { icon: 'collapse', label: 'Tout réduire', run: collapseAll },
  ];
}

/* ---------- folders ---------- */
function saveCollapsed() { store.set('collapsed', [...collapsed]); }
function toggleFolder(p) {
  collapsed.has(p) ? collapsed.delete(p) : collapsed.add(p);
  saveCollapsed();
  renderSidebar();
}
function expandAll() { collapsed.clear(); saveCollapsed(); renderSidebar(); }
function collapseAll() {
  L.flatten(L.buildTree(vault.folders, vault.items), new Set()).forEach((r) => r.hasChildren && collapsed.add(r.path));
  saveCollapsed(); renderSidebar();
}

async function newFolder(parent) {
  const name = await promptModal(parent ? `Nouveau sous-dossier dans « ${parent} »` : 'Nouveau dossier', 'Nom du dossier', '', 'Créer');
  if (!name?.trim()) return;
  const path = (parent ? parent + '/' : '') + name.trim();
  if (parent) { collapsed.delete(parent); saveCollapsed(); }
  if (await mutate('create_folder', { path }, 'Dossier créé')) { st.folder = path; renderSidebar(); renderList(); }
}

async function renameFolder(p) {
  const name = await promptModal('Renommer le dossier', 'Nouveau nom', leaf(p), 'Renommer');
  if (!name?.trim() || name.trim() === leaf(p)) return;
  const to = (parentOf(p) ? parentOf(p) + '/' : '') + name.trim();
  await moveFolder(p, to, 'Dossier renommé');
}

async function moveFolder(from, to, msg) {
  if (!await mutate('rename_folder', { from, to }, msg)) return;
  if (st.folder === from || st.folder.startsWith(from + '/')) st.folder = to + st.folder.slice(from.length);
  renderSidebar(); renderList();
}

async function deleteFolder(p) {
  const n = vault.items.filter((i) => L.inFolder(i, p)).length;
  const subs = allFolderPaths().filter((x) => x.startsWith(p + '/')).length;
  const what = [subs && `${subs} sous-dossier${subs > 1 ? 's' : ''}`, n && `${n} élément${n > 1 ? 's' : ''} (déplacés dans « Aucun dossier », pas supprimés)`].filter(Boolean).join(' et ');
  if (!await confirmModal('Supprimer le dossier', `Supprimer <b>${esc(p)}</b>${what ? ` ? Cela concerne ${what}.` : ' ?'}`, 'Supprimer')) return;
  if (await mutate('delete_folder', { path: p }, 'Dossier supprimé') && L.inFolder({ folder: st.folder }, p)) { st.folder = ''; renderSidebar(); renderList(); }
}

/* ---------- items ---------- */
async function moveItem(it, folder) {
  if (it.folder === folder) return;
  await mutate('move_items', { ids: [it.id], folder }, `Déplacé vers « ${folder || 'Aucun dossier'} »`);
}

async function moveDialog(it) {
  const opts = ['', ...allFolderPaths()];
  const v = await selectModal('Déplacer vers', `Dossier de destination pour « ${it.name} »`, opts.map((p) => [p, p || 'Aucun dossier']), it.folder, 'Déplacer');
  if (v !== null) await moveItem(it, v);
}

async function deleteItem(it) {
  if (!it) return;
  if (!await confirmModal('Supprimer l’élément', `Envoyer <b>${esc(it.name)}</b> à la corbeille ? Vous pourrez le restaurer depuis le coffre web.`, 'Supprimer')) return;
  if (await mutate('delete_item', { id: it.id }, 'Élément envoyé à la corbeille')) { st.selId = null; st.edit = null; renderList(); }
}

async function doSync() {
  const b = $('#b-sync');
  b.classList.add('spin');
  await mutate('sync_vault', {}, 'Coffre synchronisé');
  b.classList.remove('spin');
}

async function exportKey(it, priv) {
  const base = (it.name || 'cle').normalize('NFD').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'cle';
  const name = priv ? `id_${base}` : `id_${base}.pub`;
  const text = priv ? it.data.privateKey : it.data.publicKey;
  if (!text) return;
  try {
    if (await invoke('save_text_file', { name, text: text.endsWith('\n') ? text : text + '\n', private: priv })) toast(priv ? 'Clé privée exportée' : 'Clé publique exportée');
  } catch (e) { toast(String(e), true); }
}

/* ---------- sidebar & list ---------- */
function renderSidebar() {
  const acc = account();
  $('#acct').innerHTML = `<span class="av">${esc(acc.email[0]?.toUpperCase() || '?')}</span>
    <span class="who"><b>${esc(acc.email)}</b><span>${esc(serverLabel(acc))}</span></span>${ic('chevUpDown', 'sm')}`;

  const counts = {};
  for (const it of vault.items) counts[it.kind] = (counts[it.kind] || 0) + 1;
  $('#kinds').innerHTML = KINDS.map((k) =>
    `<div class="row ${st.kind === k.k && (k.k !== 0 || !st.folder) ? 'sel' : ''}" data-kind="${k.k}" ${k.k === 0 ? 'data-drop=""' : ''}>${ic(k.icon)}<span class="label">${k.label}</span><span class="count">${(k.k ? counts[k.k] : vault.items.length) || ''}</span></div>`).join('');

  const rows = L.flatten(L.buildTree(vault.folders, vault.items), collapsed);
  $('#tree').innerHTML = rows.length ? rows.map((r) =>
    `<div class="row tree-row ${r.path === st.folder ? 'sel' : ''}" style="--d:${r.depth}" data-path="${esc(r.path)}" data-drop="${esc(r.path)}" draggable="true" role="treeitem" aria-expanded="${r.hasChildren ? r.open : ''}">
      <button class="twist ${r.hasChildren ? '' : 'invisible'}" tabindex="-1">${ic(r.open ? 'chevDown' : 'chevRight')}</button>
      ${ic(r.hasChildren && r.open ? 'folderOpen' : 'folder')}<span class="label">${esc(r.name)}</span><span class="count">${r.count || ''}</span></div>`).join('')
    : `<button class="row muted add-folder" id="b-firstfolder">${ic('folderPlus')}<span class="label">Créer un dossier</span></button>`;
  const first = $('#b-firstfolder');
  if (first) first.onclick = () => newFolder('');
}

function serverLabel(a) {
  if (a.server_kind < 2) return SERVERS[a.server_kind];
  return L.host(a.server_url) || 'Auto-hébergé';
}

function setQuery(q) {
  st.query = q;
  if ($('#q').value !== q) $('#q').value = q;
  $('#q-clear').classList.toggle('hidden', !q);
  $('#q-kbd').classList.toggle('hidden', !!q);
  renderList();
  if (q && !cur() && st.list.length && !st.edit) select(st.list[0].id);
}

function favicon(it, lg = false) {
  const h = it.kind === 1 && snap.account.website_icons ? L.host(it.data.uri) : '';
  const k = kindOf(it.kind);
  if (h) return `<div class="fav ${lg ? 'lg' : ''}"><img src="${esc(account().icons)}/${esc(h)}/icon.png" alt="" data-fb="${k.icon}" data-k="${it.kind}" loading="lazy" draggable="false"></div>`;
  return `<div class="fav k${it.kind} ${lg ? 'lg' : ''}">${ic(k.icon)}</div>`;
}

function subline(it) {
  const d = it.data;
  switch (it.kind) {
    case 1: return L.highlight(d.username || '', st.query);
    case 3: return esc([d.brand, d.number && '•••• ' + d.number.slice(-4)].filter(Boolean).join(' '));
    case 4: return L.highlight([d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || '', st.query);
    case 5: return esc(d.keyFingerprint || '');
    default: return '';
  }
}

function renderList() {
  st.list = L.filterItems(vault.items, st);
  if (!st.edit && st.selId && !st.list.some((i) => i.id === st.selId)) st.selId = null;
  const title = st.query ? `Résultats pour « ${st.query} »` : st.folder ? leaf(st.folder) : kindOf(st.kind).label;
  $('#list-title').textContent = title;
  $('#list-count').textContent = `${st.list.length} élément${st.list.length > 1 ? 's' : ''}`;
  const quick = snap.global.quick_copy;
  $('#items').innerHTML = st.list.length ? st.list.map((it) => `
    <div class="item ${it.id === st.selId ? 'sel' : ''}" data-id="${esc(it.id)}" draggable="true" role="option" aria-selected="${it.id === st.selId}">
      ${favicon(it)}
      <div class="meta">
        <div class="name">${L.highlight(it.name, st.query)}</div>
        <div class="sub">${subline(it) || esc(kindOf(it.kind).one)}</div>
        ${st.query && it.folder ? `<div class="path">${ic('folder')}${esc(it.folder)}</div>` : ''}
      </div>
      ${quick && it.kind === 1 ? `<div class="quick">
        <button class="icon-btn sm" data-quick="u" title="Copier le nom d'utilisateur" ${it.data.username ? '' : 'disabled'}>${ic('user', 'sm')}</button>
        <button class="icon-btn sm" data-quick="p" title="Copier le mot de passe" ${it.data.password ? '' : 'disabled'}>${ic('key', 'sm')}</button></div>` : ''}
    </div>`).join('')
    : `<div class="empty"><div class="bubble">${ic(st.query ? 'search' : 'folder')}</div>
        <b>${st.query ? 'Aucun résultat' : 'Aucun élément'}</b>
        <span>${st.query ? 'Essayez avec d’autres mots-clés.' : 'Créez un élément avec <kbd>' + MOD + ' N</kbd> ou glissez-en un ici.'}</span></div>`;
  if (!st.edit) renderDetail();
}

/** Selects an item; asks before dropping unsaved edits. Returns false if the user kept editing. */
async function select(id) {
  if (st.edit && id !== st.edit.id && !await leaveEdit()) return false;
  if (id !== st.selId) st.revealed.clear();
  st.selId = id;
  $$('#items .item').forEach((el) => {
    const on = el.dataset.id === id;
    el.classList.toggle('sel', on);
    el.setAttribute('aria-selected', on);
    if (on) el.scrollIntoView({ block: 'nearest' });
  });
  if (!st.edit) renderDetail();
  return true;
}

function move(delta) {
  if (!st.list.length) return;
  const i = st.list.findIndex((x) => x.id === st.selId);
  select(st.list[Math.max(0, Math.min(st.list.length - 1, i < 0 ? 0 : i + delta))].id);
}

/* ---------- detail (view) ---------- */
function colorPw(p) {
  return [...p].map((c) => /[0-9]/.test(c) ? `<span class="pw-n">${esc(c)}</span>` : /[\p{L}]/u.test(c) ? esc(c) : `<span class="pw-s">${esc(c)}</span>`).join('');
}

function viewField(key, label, flags, value) {
  const secret = has(flags, 'secret'), multi = has(flags, 'multi'), shown = !secret || st.revealed.has(key);
  const display = !shown ? '••••••••••••' : (secret && !multi) ? colorPw(value) : esc(value);
  return `<div class="field ${multi ? 'multi' : ''}">
    <div class="fv"><label>${label}</label><div class="val ${has(flags, 'mono') ? 'mono' : ''} ${multi && shown ? 'pre' : ''}">${display}</div></div>
    ${secret ? `<button class="icon-btn" data-act="reveal" data-k="${key}" title="${shown ? 'Masquer' : 'Afficher'}">${ic(shown ? 'eyeOff' : 'eye')}</button>` : ''}
    ${has(flags, 'link') ? `<button class="icon-btn" data-act="open" title="Ouvrir (${MOD}+U)">${ic('external')}</button>` : ''}
    <button class="icon-btn" data-act="copy" data-k="${key}" data-label="${esc(label)}" title="Copier">${ic('copy')}</button>
  </div>`;
}

function renderDetail() {
  const d = $('#detail');
  if (st.edit) return renderEditor();
  const it = cur();
  if (!it) {
    d.innerHTML = `<div class="empty"><div class="logo">${SHIELD}</div><b>Aucun élément sélectionné</b>
      <span>Utilisez <kbd>${MOD} F</kbd> pour rechercher, <kbd>${MOD} N</kbd> pour créer, <kbd>F1</kbd> pour l’aide.</span></div>`;
    return;
  }
  const k = kindOf(it.kind);
  const groups = (SCHEMA[it.kind] || []).map(([title, fields]) => {
    const rows = fields.filter(([key]) => it.data[key]).map(([key, label, flags]) => viewField(key, label, flags, it.data[key])).join('');
    return rows ? `<div class="group"><div class="group-h">${title}</div>${rows}</div>` : '';
  }).join('');
  const sshActions = it.kind === 5 && it.data.privateKey ? `<div class="btn-row">
      <button class="ghost" data-act="export-priv">${ic('download')}Exporter la clé privée</button>
      ${it.data.publicKey ? `<button class="ghost" data-act="export-pub">${ic('download')}Exporter la clé publique</button>` : ''}</div>` : '';
  d.innerHTML = `<div class="d-wrap">
    <div class="d-head">${favicon(it, true)}<div class="grow"><h1>${esc(it.name)}</h1>
      <div class="chips"><span class="chip">${ic(k.icon)}${k.one}</span>${it.folder ? `<span class="chip">${ic('folder')}${esc(it.folder)}</span>` : ''}</div></div>
      <div class="d-tools">
        <button class="ghost" data-act="edit" title="Modifier (${MOD}+E)">${ic('pencil')}Modifier</button>
        <button class="icon-btn" data-act="delete" title="Supprimer (Suppr)">${ic('trash')}</button>
      </div></div>
    ${groups}${sshActions}
    ${it.notes ? `<div class="group"><div class="group-h">Notes</div><div class="notes">${esc(it.notes)}</div></div>` : ''}
    ${!groups && !it.notes ? '<p class="muted">Cet élément est vide.</p>' : ''}
  </div>`;
  d.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || st.edit) return;
    const key = b.dataset.k;
    switch (b.dataset.act) {
      case 'copy': return copyText(it.data[key], b.dataset.label);
      case 'open': return openUri(it);
      case 'reveal': st.revealed.has(key) ? st.revealed.delete(key) : st.revealed.add(key); return renderDetail();
      case 'edit': return startEdit();
      case 'delete': return deleteItem(it);
      case 'export-priv': return exportKey(it, true);
      case 'export-pub': return exportKey(it, false);
    }
  };
}

/* ---------- editor ---------- */
async function startNew(kind, folder = st.folder) {
  if (!await leaveEdit()) return;
  st.edit = { id: null, kind, name: '', notes: '', folder, data: {} };
  st.dirty = false;
  st.revealed.clear();
  renderEditor();
  $('#detail [data-e="name"]')?.focus();
}

async function startEdit() {
  const it = cur();
  if (!it || st.edit) return;
  st.edit = { id: it.id, kind: it.kind, name: it.name, notes: it.notes, folder: it.folder, data: { ...it.data } };
  st.dirty = false;
  renderEditor();
  $('#detail [data-e="name"]')?.focus();
}

async function leaveEdit() {
  if (!st.edit) return true;
  if (st.dirty && !await confirmModal('Modifications non enregistrées', 'Abandonner les modifications en cours ?', 'Abandonner')) return false;
  st.edit = null; st.dirty = false;
  renderDetail();
  return true;
}

function genPassword(n = 20) {
  const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_=+?';
  const out = [];
  const limit = 256 - (256 % cs.length); // rejection sampling: no modulo bias
  while (out.length < n) {
    for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) if (b < limit && out.length < n) out.push(cs[b % cs.length]);
  }
  return out.join('');
}

function editField(key, label, flags) {
  const v = esc(st.edit.data[key] || '');
  const secret = has(flags, 'secret'), mono = has(flags, 'mono') ? 'mono' : '';
  const shown = st.revealed.has(key);
  if (has(flags, 'multi')) {
    return `<label class="fld"><span class="fld-l">${label}</span><div class="pw">
      <textarea data-k="${key}" class="${mono} ${shown ? '' : 'masked'}" rows="7" spellcheck="false" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----">${v}</textarea>
      <button type="button" class="icon-btn sm" data-act="reveal" data-k="${key}" title="${shown ? 'Masquer' : 'Afficher'}">${ic(shown ? 'eyeOff' : 'eye')}</button></div></label>`;
  }
  if (has(flags, 'month')) {
    return `<label class="fld"><span class="fld-l">${label}</span><div class="select"><select data-k="${key}">
      <option value="">—</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${String(i + 1) === st.edit.data[key] ? 'selected' : ''}>${String(i + 1).padStart(2, '0')}</option>`).join('')}
      </select>${ic('chevDown')}</div></label>`;
  }
  const readonly = st.edit.kind === 5 && key !== 'privateKey';
  return `<label class="fld"><span class="fld-l">${label}</span><div class="pw ${secret ? 'with-btns' : ''}">
    <input data-k="${key}" class="${mono}" type="${secret && !shown ? 'password' : 'text'}" value="${v}" spellcheck="false" autocomplete="off" ${readonly ? 'readonly placeholder="Rempli automatiquement"' : ''}>
    ${secret ? `<span class="in-btns">${has(flags, 'gen') ? `<button type="button" class="icon-btn sm" data-act="gen" data-k="${key}" title="Générer">${ic('refresh')}</button>` : ''}
      <button type="button" class="icon-btn sm" data-act="reveal" data-k="${key}" title="${shown ? 'Masquer' : 'Afficher'}">${ic(shown ? 'eyeOff' : 'eye')}</button></span>` : ''}
  </div></label>`;
}

function renderEditor() {
  const e = st.edit, k = kindOf(e.kind), d = $('#detail');
  const folders = ['', ...allFolderPaths()];
  if (!folders.includes(e.folder)) folders.push(e.folder);
  const groups = (SCHEMA[e.kind] || []).map(([title, fields]) => {
    const ssh = e.kind === 5;
    return `<div class="group pad ${ssh ? 'dropzone' : ''}" ${ssh ? 'id="ssh-drop"' : ''}><div class="group-h">${title}</div>
      ${ssh ? `<div class="btn-row">
        <button type="button" class="ghost" data-act="import">${ic('upload')}Importer un fichier…</button>
        <button type="button" class="ghost" data-act="sshgen">${ic('sparkles')}Générer une clé Ed25519</button></div>
        <span class="hint">… ou glissez-déposez un fichier de clé privée ici. La clé publique et l’empreinte se remplissent automatiquement.</span>` : ''}
      <div class="grid">${fields.map(([key, label, flags]) => editField(key, label, flags)).join('')}</div>
      ${ssh ? '<div class="err" id="ssh-err"></div>' : ''}</div>`;
  }).join('');
  d.innerHTML = `<form class="d-wrap editor" id="ed" novalidate>
    <div class="d-head"><div class="fav k${e.kind} lg">${ic(k.icon)}</div><div class="grow">
      <h1>${e.id ? 'Modifier l’élément' : `Nouvel élément`}</h1><div class="chips"><span class="chip">${ic(k.icon)}${k.one}</span></div></div></div>
    <div class="group pad"><div class="grid">
      <label class="fld"><span class="fld-l">Nom <span class="req">*</span></span><input data-e="name" value="${esc(e.name)}" autocomplete="off"></label>
      <label class="fld"><span class="fld-l">Dossier</span><div class="select"><select data-e="folder">
        ${folders.map((p) => `<option value="${esc(p)}" ${p === e.folder ? 'selected' : ''}>${esc(p || 'Aucun dossier')}</option>`).join('')}</select>${ic('chevDown')}</div></label>
    </div></div>
    ${groups}
    <div class="group pad"><label class="fld"><span class="fld-l">Notes</span><textarea data-e="notes" rows="4">${esc(e.notes)}</textarea></label></div>
    <div class="err" id="ed-err"></div>
    <div class="ed-actions"><button type="button" class="ghost" data-act="cancel">Annuler <kbd>Échap</kbd></button>
      <button type="submit" class="primary" id="ed-save">${ic('check')}Enregistrer <kbd class="on-accent">${MOD} S</kbd></button></div>
  </form>`;
  const form = $('#ed');
  form.oninput = (ev) => {
    const t = ev.target;
    if (t.dataset.e) e[t.dataset.e] = t.value;
    else if (t.dataset.k) e.data[t.dataset.k] = t.value;
    else return;
    st.dirty = true;
    if (t.dataset.k === 'privateKey') parseKeyDebounced();
  };
  form.onchange = form.oninput;
  form.onclick = async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const key = b.dataset.k;
    switch (b.dataset.act) {
      case 'cancel': return leaveEdit();
      case 'reveal': st.revealed.has(key) ? st.revealed.delete(key) : st.revealed.add(key); return rerenderEditor();
      case 'gen': e.data[key] = genPassword(); st.revealed.add(key); st.dirty = true; return rerenderEditor();
      case 'import': return importKeyFile();
      case 'sshgen': {
        if (e.data.privateKey && !await confirmModal('Remplacer la clé', 'Remplacer la clé actuelle par une nouvelle clé générée ?', 'Remplacer')) return;
        try { fillKey(await invoke('ssh_generate')); if (!e.name) e.name = 'Clé SSH'; rerenderEditor(); toast('Clé Ed25519 générée'); }
        catch (x) { toast(String(x), true); }
      }
    }
  };
  form.onsubmit = (ev) => { ev.preventDefault(); saveEdit(); };
}

/** Re-render the editor keeping focus and scroll. */
function rerenderEditor() {
  const active = document.activeElement;
  const sel = active && (active.dataset.k ? `[data-k="${active.dataset.k}"]` : active.dataset.e ? `[data-e="${active.dataset.e}"]` : null);
  const top = $('#detail').scrollTop;
  renderEditor();
  $('#detail').scrollTop = top;
  if (sel) $(`#ed ${sel}`)?.focus();
}

async function saveEdit() {
  const e = st.edit;
  if (!e) return;
  const err = $('#ed-err');
  if (!e.name.trim()) { err.textContent = 'Le nom est obligatoire.'; $('#ed [data-e="name"]').focus(); return; }
  if (e.kind === 5 && e.data.privateKey && !e.data.publicKey) { err.textContent = 'La clé privée n’est pas valide.'; return; }
  const keys = new Set((SCHEMA[e.kind] || []).flatMap(([, f]) => f.map(([k]) => k)));
  const data = Object.fromEntries(Object.entries(e.data).filter(([k, v]) => keys.has(k) && v !== ''));
  const before = new Set(vault.items.map((i) => i.id));
  const btn = $('#ed-save');
  btn.disabled = true;
  const ok = await mutate('save_item', { item: { id: e.id, kind: e.kind, name: e.name, notes: e.notes, folder: e.folder, data } }, e.id ? 'Élément enregistré' : 'Élément créé');
  if (!ok) { if (btn) btn.disabled = false; return; }
  const id = e.id || vault.items.find((i) => !before.has(i.id))?.id || null;
  st.edit = null; st.dirty = false;
  st.selId = id;
  if (id) {
    const it = vault.items.find((i) => i.id === id);
    if (it && !L.filterItems([it], st).length) { st.query = ''; $('#q').value = ''; st.kind = 0; st.folder = it.folder; renderSidebar(); }
  }
  renderList();
  select(id);
}

/* ---------- SSH key import ---------- */
function fillKey(p) {
  Object.assign(st.edit.data, { privateKey: p.private_key, publicKey: p.public_key, keyFingerprint: p.fingerprint });
  st.dirty = true;
}

let parseTimer;
function parseKeyDebounced() {
  clearTimeout(parseTimer);
  parseTimer = setTimeout(async () => {
    const e = st.edit;
    if (!e || e.kind !== 5) return;
    const text = e.data.privateKey || '';
    const err = $('#ssh-err');
    if (!text.trim()) { e.data.publicKey = ''; e.data.keyFingerprint = ''; syncSshInputs(); if (err) err.textContent = ''; return; }
    try {
      const p = await invoke('ssh_parse', { text, passphrase: '' });
      e.data.publicKey = p.public_key; e.data.keyFingerprint = p.fingerprint;
      if (err) err.textContent = '';
    } catch (x) {
      e.data.publicKey = ''; e.data.keyFingerprint = '';
      if (err) err.textContent = String(x) === 'PASSPHRASE' ? 'Cette clé est protégée : importez-la via « Importer un fichier » pour saisir sa phrase de passe.' : String(x);
    }
    syncSshInputs();
  }, 300);
}
function syncSshInputs() {
  for (const k of ['publicKey', 'keyFingerprint']) { const el = $(`#ed [data-k="${k}"]`); if (el) el.value = st.edit.data[k] || ''; }
}

/** Parses key text (asking for its passphrase if needed) and fills the editor. */
async function applyKeyText(text, fileName) {
  let p;
  try { p = await invoke('ssh_parse', { text, passphrase: '' }); }
  catch (x) {
    if (String(x) !== 'PASSPHRASE') { toast(String(x), true); return; }
    for (;;) {
      const pass = await promptModal('Clé protégée', 'Phrase de passe de la clé (elle sera stockée déchiffrée dans le coffre, comme dans Bitwarden)', '', 'Déverrouiller', true);
      if (pass === null) return;
      try { p = await invoke('ssh_parse', { text, passphrase: pass }); break; }
      catch (y) { toast(String(y), true); }
    }
  }
  if (!st.edit || st.edit.kind !== 5) await startNew(5);
  if (!st.edit) return;
  fillKey(p);
  if (!st.edit.name && fileName) st.edit.name = fileName.replace(/\.(pem|key|txt)$/i, '');
  rerenderEditor();
  toast('Clé importée');
}

async function importKeyFile() {
  try {
    const r = await invoke('open_text_file');
    if (r) await applyKeyText(r[1], r[0]);
  } catch (e) { toast(String(e), true); }
}

/* ---------------- drag & drop ---------------- */
function bindDnd() {
  const shell = $('#shell');
  shell.addEventListener('dragstart', (e) => {
    const item = e.target.closest?.('.item[data-id]');
    const folder = e.target.closest?.('.tree-row[data-path]');
    if (item) { e.dataTransfer.setData(MIME_ITEM, item.dataset.id); e.dataTransfer.setData('text/plain', ''); }
    else if (folder) { e.dataTransfer.setData(MIME_FOLDER, folder.dataset.path); e.dataTransfer.setData('text/plain', ''); }
    else return;
    e.dataTransfer.effectAllowed = 'move';
    (item || folder).classList.add('dragging');
    document.body.classList.add('dnd');
  });
  shell.addEventListener('dragend', () => {
    $$('.dragging, .drop-over').forEach((x) => x.classList.remove('dragging', 'drop-over'));
    document.body.classList.remove('dnd');
  });
}

let dropTarget = null;
function setDropTarget(el) {
  if (dropTarget === el) return;
  dropTarget?.classList.remove('drop-over');
  dropTarget = el;
  el?.classList.add('drop-over');
}

document.addEventListener('dragover', (e) => {
  const types = [...e.dataTransfer.types];
  e.preventDefault(); // also stops the webview from navigating to dropped files
  if (types.includes('Files')) {
    e.dataTransfer.dropEffect = 'copy';
    setDropTarget(e.target.closest('#ssh-drop') || (vault && !st.adding ? $('#shell') : null));
    return;
  }
  const t = (types.includes(MIME_ITEM) || types.includes(MIME_FOLDER)) ? e.target.closest('[data-drop]') : null;
  e.dataTransfer.dropEffect = t ? 'move' : 'none';
  setDropTarget(t);
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) setDropTarget(null); });

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const target = dropTarget;
  setDropTarget(null);
  document.body.classList.remove('dnd');
  if (!vault || st.adding) return;
  const files = e.dataTransfer.files;
  if (files?.length) {
    const f = files[0];
    if (f.size > 1 << 20) return toast('Fichier trop volumineux pour une clé.', true);
    try { await applyKeyText(await f.text(), f.name); } catch (x) { toast(String(x), true); }
    return;
  }
  if (!target) return;
  const to = target.dataset.drop;
  const id = e.dataTransfer.getData(MIME_ITEM);
  const from = e.dataTransfer.getData(MIME_FOLDER);
  if (id) {
    const it = vault.items.find((i) => i.id === id);
    if (it) await moveItem(it, to);
  } else if (from) {
    if (to === from || to.startsWith(from + '/') || parentOf(from) === to) return;
    await moveFolder(from, (to ? to + '/' : '') + leaf(from), `Dossier déplacé vers « ${to || 'la racine'} »`);
  }
});

/* ---------------- context menu ---------------- */
function openMenu(x, y, entries) {
  const m = $('#menu');
  m.innerHTML = entries.map((e, i) => e === '-' ? '<div class="sep"></div>'
    : `<button role="menuitem" data-mi="${i}" class="${e.danger ? 'danger-item' : ''}" ${e.disabled ? 'disabled' : ''}>${e.html || ic(e.icon)}<span>${e.label}</span>${e.kbd ? `<kbd>${e.kbd}</kbd>` : ''}</button>`).join('');
  m.classList.remove('hidden');
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  m.onclick = (ev) => {
    const b = ev.target.closest('[data-mi]');
    if (!b || b.disabled) return;
    closeMenu();
    entries[+b.dataset.mi].run();
  };
  m.querySelector('button:not([disabled])')?.focus();
}
function closeMenu() { $('#menu').classList.add('hidden'); }
const menuOpen = () => !$('#menu').classList.contains('hidden');

function openAccountMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  const entries = snap.accounts.map((a, i) => ({
    html: `<span class="av">${esc(a.email[0]?.toUpperCase() || '?')}</span>`,
    label: `${esc(a.email)}<div class="sub">${a.unlocked ? 'Déverrouillé' : 'Verrouillé'} · ${esc(serverLabel(a))}</div>`,
    kbd: i === snap.current ? '✓' : '',
    run: async () => {
      if (!await leaveEdit()) return;
      await invoke('select_account', { index: i });
      Object.assign(st, { adding: false, needCode: '', folder: '', kind: 0, selId: null, query: '' });
      await refresh();
    },
  }));
  entries.push('-', { icon: 'plus', label: 'Ajouter un compte', run: async () => { if (await leaveEdit()) { st.adding = true; st.needCode = ''; render(); } } });
  if (snap.accounts.length) entries.push({ icon: 'logout', label: 'Retirer ce compte…', danger: true, run: removeAccount });
  openMenu(r.left, r.bottom + 6, entries);
}

/* ---------------- modals ---------------- */
let modalOnClose = null;
function modal(html, cls = '', onClose = null) {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = `<div class="backdrop"><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
  root.querySelector('.backdrop').onmousedown = (e) => { if (e.target === e.currentTarget) closeModal(); };
  root.querySelectorAll('[data-close]').forEach((b) => b.onclick = closeModal);
  modalOnClose = onClose;
  return root.querySelector('.modal');
}
function closeModal() {
  $('#modal-root').innerHTML = '';
  const f = modalOnClose; modalOnClose = null;
  if (f) f();
}
const modalOpen = () => !!$('#modal-root').firstChild;
/** Closes the modal with a result, without triggering the "cancelled" callback. */
function finishModal(resolve, v) { modalOnClose = null; closeModal(); resolve(v); }

function confirmModal(title, text, ok) {
  return new Promise((resolve) => {
    const m = modal(`<div class="modal-h"><h2>${title}</h2></div><div class="modal-b"><span class="muted">${text}</span></div>
      <div class="modal-f"><button class="ghost" data-close>Annuler</button><button class="primary danger" id="m-ok">${ok}</button></div>`, 'sm', () => resolve(false));
    m.querySelector('#m-ok').onclick = () => finishModal(resolve, true);
    m.querySelector('#m-ok').focus();
  });
}

function promptModal(title, label, value, ok, password = false) {
  return new Promise((resolve) => {
    const m = modal(`<form id="m-form"><div class="modal-h"><h2>${esc(title)}</h2></div>
      <div class="modal-b"><label class="fld"><span class="fld-l">${esc(label)}</span><input id="m-in" type="${password ? 'password' : 'text'}" value="${esc(value)}" autocomplete="off" spellcheck="false"></label></div>
      <div class="modal-f"><button type="button" class="ghost" data-close>Annuler</button><button class="primary" type="submit">${ok}</button></div></form>`, 'sm', () => resolve(null));
    const input = m.querySelector('#m-in');
    input.focus(); input.select();
    m.querySelector('#m-form').onsubmit = (e) => { e.preventDefault(); finishModal(resolve, input.value); };
  });
}

function selectModal(title, label, options, value, ok) {
  return new Promise((resolve) => {
    const m = modal(`<form id="m-form"><div class="modal-h"><h2>${esc(title)}</h2></div>
      <div class="modal-b"><label class="fld"><span class="fld-l">${esc(label)}</span><div class="select"><select id="m-in">
        ${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${ic('chevDown')}</div></label></div>
      <div class="modal-f"><button type="button" class="ghost" data-close>Annuler</button><button class="primary" type="submit">${ok}</button></div></form>`, 'sm', () => resolve(null));
    const input = m.querySelector('#m-in');
    input.focus();
    m.querySelector('#m-form').onsubmit = (e) => { e.preventDefault(); finishModal(resolve, input.value); };
  });
}

async function removeAccount() {
  const a = account();
  if (!await confirmModal('Retirer le compte', `Retirer <b>${esc(a.email)}</b> de Lightwarden ? Le coffre reste intact sur le serveur.`, 'Retirer')) return;
  await invoke('remove_account');
  Object.assign(st, { selId: null, folder: '', query: '', edit: null, dirty: false });
  await refresh();
}

async function doLock() {
  if (!await leaveEdit()) return;
  await invoke('lock');
  st.selId = null; st.query = '';
  await refresh();
}

function openShortcuts() {
  const rows = [
    ['Rechercher', [MOD, 'F'], ['/']],
    ['Naviguer dans la liste', ['↑'], ['↓']],
    ['Nouvel élément', [MOD, 'N']],
    ['Nouveau dossier', [MOD, '⇧', 'N']],
    ["Modifier l'élément", [MOD, 'E'], ['Double-clic']],
    ['Enregistrer', [MOD, 'S']],
    ["Supprimer l'élément", ['Suppr']],
    ['Renommer le dossier sélectionné', ['F2']],
    ["Copier le nom d'utilisateur", [MOD, 'B']],
    ['Copier le mot de passe', [MOD, 'C']],
    ['Ouvrir le site web', [MOD, 'U']],
    ["Copier l'URL", [MOD, '⇧', 'U']],
    ['Filtrer par type', [MOD, '1…6']],
    ['Synchroniser', [MOD, 'R']],
    ['Verrouiller', [MOD, 'L']],
    ['Paramètres', [MOD, ',']],
    ['Menu contextuel', ['⇧', 'F10']],
    ['Fermer / annuler / effacer la recherche', ['Échap']],
  ];
  const keys = (ks) => ks.map((k) => `<kbd>${k}</kbd>`).join('');
  modal(`<div class="modal-h"><h2>Raccourcis clavier</h2><button class="icon-btn" data-close title="Fermer">${ic('x')}</button></div>
    <div class="modal-b"><div class="keys">${rows.map(([l, a, b]) => `<span>${l}</span><span>${keys(a)}${b ? ' ou ' + keys(b) : ''}</span>`).join('')}</div>
    <p class="hint">Glissez un élément sur un dossier pour l’y déplacer, ou un dossier sur un autre pour l’imbriquer. Déposez un fichier de clé SSH n’importe où pour l’importer.</p></div>`, 'sm');
}

const SEL = {
  timeout: ["Au redémarrage de l'application", 'Immédiatement', '1 minute', '5 minutes', '15 minutes', '1 heure', 'Jamais'],
  timeout_action: ['Verrouiller', 'Se déconnecter'],
  clipboard_clear: ['Jamais', '10 secondes', '20 secondes', '30 secondes', '1 minute', '2 minutes', '5 minutes'],
  ssh_approval: ['Toujours demander', "Se souvenir jusqu'au verrouillage du coffre", 'Ne jamais demander'],
  theme: ['Système', 'Clair', 'Sombre'],
  language: ['Par défaut', 'Français', 'English'],
};

function openSettings() {
  const sel = (scope, key, label, hint = '') => `<label class="fld"><span class="fld-l">${label}</span>
    <div class="select"><select data-scope="${scope}" data-k="${key}">${SEL[key].map((o, i) => `<option value="${i}" ${snap[scope][key] === i ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${ic('chevDown')}</div>
    ${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
  const chk = (scope, key, label, hint = '') => `<label class="chk"><input type="checkbox" data-scope="${scope}" data-k="${key}" ${snap[scope][key] ? 'checked' : ''}>
    <span class="box">${ic('check')}</span><span><span class="chk-l">${label}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</span></label>`;
  const tabs = [
    ['Sécurité', () => sel('account', 'timeout', "Délai d'expiration de la session")
      + sel('account', 'timeout_action', "Action à l'expiration")
      + chk('account', 'unlock_pin', 'Déverrouiller avec un code PIN')
      + chk('account', 'unlock_system', "Déverrouiller avec l'authentification du système")],
    ['Préférences', () => sel('account', 'clipboard_clear', 'Effacer le presse-papiers', 'Efface automatiquement les valeurs copiées de votre presse-papiers.')
      + chk('account', 'minimize_on_copy', 'Réduire lors de la copie dans le presse-papiers', "Réduit l'application lors de la copie des données d'un élément.")
      + chk('account', 'website_icons', 'Afficher les icônes des sites web', 'Les icônes sont récupérées depuis le service d’icônes de votre serveur.')],
    ["Paramètres de l'application (tous les comptes)", () => updatesSection()
      + chk('global', 'keep_background', 'Garder Lightwarden en cours d’exécution en arrière-plan', 'À la fermeture de la fenêtre, Lightwarden reste accessible depuis la zone de notification. Recommandé avec l’agent SSH.')
      + chk('global', 'autostart', 'Démarrer automatiquement à la connexion', 'Démarre Lightwarden à l’ouverture de session.')
      + chk('global', 'hw_accel', "Utiliser l'accélération matérielle", 'Désactivez-la uniquement en cas de problèmes graphiques. Redémarrage requis.')
      + chk('global', 'ssh_agent', "Activer l'agent SSH", 'Signe les demandes SSH directement depuis votre coffre.')
      + sel('global', 'ssh_approval', "Demander une autorisation lors de l'utilisation de l'agent SSH", "Choisir comment gérer les demandes d'autorisation de l'agent SSH.")
      + sshHelp()
      + chk('global', 'quick_copy', 'Afficher les actions de copie rapide dans le coffre')
      + sel('global', 'theme', 'Thème', "Modifier la couleur du thème de l'application.")
      + sel('global', 'language', 'Langue', 'Un redémarrage est requis.')],
  ];
  const m = modal(`<div class="modal-h"><h2>Paramètres de l'application pour ${esc(account().email)}</h2><button class="icon-btn" data-close title="Fermer (Échap)">${ic('x')}</button></div>
    <div class="tabs" role="tablist">${tabs.map(([t], i) => `<button role="tab" data-tab="${i}" class="${i === st.tab ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="modal-b" id="tab-body">${tabs[st.tab][1]()}</div>`);
  m.querySelector('.tabs').onclick = (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    st.tab = +b.dataset.tab;
    $$('[data-tab]', m).forEach((x) => x.classList.toggle('on', x === b));
    m.querySelector('#tab-body').innerHTML = tabs[st.tab][1]();
    bindUpdates(); bindSsh();
  };
  bindUpdates(); bindSsh();
  m.onchange = async (e) => {
    const el = e.target;
    if (!el.dataset.k) return;
    if (el.dataset.k === 'unlock_pin') {
      if (el.checked) {
        if (await pinModal()) { snap.account.unlock_pin = true; toast('Code PIN défini'); }
        openSettings(); // the PIN dialog replaced the settings dialog
      } else {
        try { await invoke('set_pin', { pin: '' }); snap.account.unlock_pin = false; toast('Code PIN supprimé'); }
        catch (x) { el.checked = true; toast(String(x), true); }
      }
      return;
    }
    snap[el.dataset.scope][el.dataset.k] = el.type === 'checkbox' ? el.checked : +el.value;
    try { await invoke('save_settings', { global: snap.global, account: snap.account }); }
    catch (x) { toast(String(x), true); }
    applyTheme();
    renderList();
  };
}

/* ---------------- updates (settings section) ---------------- */
let updInfo = null;
const CHANNELS = { stable: 'Stable', beta: 'Bêta', dev: 'Développement' };

function updatesSection() {
  return `<div class="upd" id="upd"><div class="upd-h"><span class="fld-l">Mises à jour</span><span class="hint" id="upd-ver"></span></div>
    <div class="upd-status" id="upd-status"></div>
    <div class="btn-row"><button class="ghost" id="upd-check">${ic('refresh')}Rechercher des mises à jour</button>
      <button class="primary" id="upd-install" disabled>${ic('download')}Mettre à jour</button></div>
    ${'<label class="chk"><input type="checkbox" data-scope="global" data-k="auto_update" ' + (snap.global.auto_update ? 'checked' : '') + '><span class="box">' + ic('check') + '</span><span><span class="chk-l">Mettre à jour automatiquement</span><span class="hint">Recherche une mise à jour à chaque lancement puis chaque jour, la télécharge en arrière-plan et vous prévient quand elle est prête.</span></span></label>'}
  </div>`;
}

function updateText(s) {
  switch (s.state) {
    case 'disabled': return ['Mises à jour désactivées pour les compilations locales.', ''];
    case 'checking': return ['Recherche en cours…', ''];
    case 'up_to_date': return ['Lightwarden est à jour.', 'ok'];
    case 'available': return [`La version ${s.version} est disponible.`, 'new'];
    case 'downloading': return [`Téléchargement de la version ${s.version}…${s.total ? ' ' + Math.round((s.done / s.total) * 100) + ' %' : ''}`, ''];
    case 'ready': return [`La version ${s.version} est prête à être installée.`, 'new'];
    case 'installing': return [`Installation de la version ${s.version}…`, ''];
    case 'error': return [s.message, 'err'];
    default: return ['', ''];
  }
}

function paintUpdates() {
  const box = $('#upd');
  if (!box || !updInfo) return;
  const s = updInfo.status;
  $('#upd-ver').textContent = `Version ${updInfo.version} · canal ${CHANNELS[updInfo.channel] || updInfo.channel}`;
  const [text, cls] = updateText(s);
  const el = $('#upd-status');
  el.textContent = text;
  el.className = 'upd-status ' + cls;
  const dev = updInfo.channel === 'dev';
  $('#upd-check').disabled = dev || ['checking', 'downloading', 'installing'].includes(s.state);
  $('#upd-install').disabled = !['available', 'ready'].includes(s.state);
}

async function bindUpdates() {
  if (!$('#upd')) return;
  $('#upd-check').onclick = () => invoke('update_check');
  $('#upd-install').onclick = () => invoke('update_install');
  try { updInfo = await invoke('update_info'); } catch { return; }
  paintUpdates();
}

listen('update-status', (e) => { if (updInfo) { updInfo.status = e.payload; paintUpdates(); } });

/* ---------------- SSH agent (settings section) ---------------- */
const SSH_OS = IS_MAC ? 'mac' : /Win/.test(navigator.platform) ? 'win' : 'linux';

function sshHelp() {
  const code = (t) => `<div class="code"><pre>${esc(t)}</pre><button type="button" class="icon-btn xs" data-copy="${esc(t)}" title="Copier">${ic('copy')}</button></div>`;
  const os = (id, title, body) => `<details class="ssh-os" ${id === SSH_OS ? 'open' : ''}><summary>${title}</summary>${body}</details>`;
  const unix = (rc) => `
    <p><b>1.</b> Indiquez l'agent à SSH, pour toutes les connexions (terminal, Git, éditeurs…), en ajoutant au début de <code>~/.ssh/config</code> :</p>
    ${code('Host *\n  IdentityAgent ~/.lightwarden-ssh-agent.sock')}
    <p><b>2.</b> Pour que <code>ssh-add</code> et les autres outils le trouvent aussi, ajoutez à <code>${rc}</code> puis ouvrez un nouveau terminal :</p>
    ${code('export SSH_AUTH_SOCK="$HOME/.lightwarden-ssh-agent.sock"')}`;
  return `<div class="upd ssh-help" id="ssh-help"><div class="upd-h"><span class="fld-l">Configurer l'agent SSH</span></div>
    <div class="upd-status" id="ssh-status"></div>
    ${os('linux', 'Linux', unix('~/.bashrc</code> ou <code>~/.zshrc')
      + `<p>Fish :</p>${code('set -Ux SSH_AUTH_SOCK $HOME/.lightwarden-ssh-agent.sock')}
      <p>Applications graphiques lancées hors terminal : créez <code>~/.config/environment.d/lightwarden.conf</code> avec la ligne suivante, puis reconnectez-vous.</p>
      ${code('SSH_AUTH_SOCK=${HOME}/.lightwarden-ssh-agent.sock')}
      <p><b>3.</b> Vérifiez :</p>${code('ssh-add -L')}`)}
    ${os('mac', 'macOS', unix('~/.zshrc')
      + `<p>Applications graphiques lancées hors terminal (à refaire après chaque redémarrage) :</p>
      ${code('launchctl setenv SSH_AUTH_SOCK "$HOME/.lightwarden-ssh-agent.sock"')}
      <p><b>3.</b> Vérifiez :</p>${code('ssh-add -L')}`)}
    ${os('win', 'Windows', `
      <p><b>1.</b> Lightwarden remplace l'agent OpenSSH intégré à Windows. Désactivez ce service dans PowerShell <b>ouvert en administrateur</b> :</p>
      ${code('Stop-Service ssh-agent; Set-Service ssh-agent -StartupType Disabled')}
      <p><b>2.</b> Décochez puis recochez « Activer l'agent SSH » ci-dessus.</p>
      <p><b>3.</b> Vérifiez dans un nouveau terminal :</p>${code('ssh-add -L')}
      <p>Git for Windows utilise son propre ssh : faites-lui utiliser celui de Windows.</p>
      ${code('git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"')}`)}
    <p class="hint">Seuls les éléments de type <b>Clé SSH</b> des coffres déverrouillés sont proposés. Si tous les coffres sont verrouillés, Lightwarden s'ouvre et vous laisse une minute pour en déverrouiller un.
      Avec beaucoup de clés, un serveur peut refuser la connexion (« Too many authentication failures ») : exportez la clé publique voulue et précisez-la par hôte dans <code>~/.ssh/config</code> avec <code>IdentityFile ~/.ssh/ma-cle.pub</code> et <code>IdentitiesOnly yes</code>.</p>
  </div>`;
}

function paintSsh(s) {
  const el = $('#ssh-status');
  if (!el) return;
  const [text, cls] = s.error ? [s.error, 'err'] : s.running ? [`Agent actif : ${s.address}`, 'ok'] : ["L'agent est désactivé.", ''];
  el.textContent = text;
  el.className = 'upd-status ' + cls;
}

async function bindSsh() {
  const box = $('#ssh-help');
  if (!box) return;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    // web clipboard first: invoke("copy") applies the "minimize on copy" / auto-clear settings meant for secrets
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copié'); }
    catch { copyText(b.dataset.copy, 'Commande'); } // WebKitGTK may refuse the web clipboard
  };
  try { paintSsh(await invoke('ssh_agent_status')); } catch { /* status stays empty */ }
}

listen('ssh-agent', (e) => paintSsh(e.payload));
listen('ssh-unlock-request', () => toast('Une application demande une clé SSH : déverrouillez un coffre.'));

/* ---------------- keyboard ---------------- */
document.addEventListener('keydown', async (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const active = document.activeElement;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName);

  if (e.key === 'Escape') {
    if (menuOpen()) { closeMenu(); return; }
    if (modalOpen()) { closeModal(); return; }
    if (st.edit) { leaveEdit(); return; }
    if (active?.id === 'q' && st.query) { setQuery(''); return; }
    active?.blur();
    return;
  }
  if (menuOpen() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const bs = $$('#menu button:not([disabled])');
    const i = bs.indexOf(active);
    bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
    return;
  }
  if (!vault || st.adding || modalOpen()) return;

  // shortcuts that also apply while editing
  if (mod && k === 's') { e.preventDefault(); if (st.edit) saveEdit(); return; }
  if (mod && k === 'n') { e.preventDefault(); e.shiftKey ? newFolder(st.folder) : openNewMenu($('#b-new')); return; }
  if (mod && k === 'f') { e.preventDefault(); $('#q').focus(); $('#q').select(); return; }
  if (mod && k === 'l') { e.preventDefault(); doLock(); return; }
  if (mod && k === 'r') { e.preventDefault(); doSync(); return; }
  if (mod && e.key === ',') { e.preventDefault(); openSettings(); return; }
  if (e.key === 'F1' || (mod && e.key === '/')) { e.preventDefault(); openShortcuts(); return; }
  if (st.edit) return;

  if (!typing && e.key === '/') { e.preventDefault(); $('#q').focus(); return; }
  if (mod && /^[1-6]$/.test(e.key)) { e.preventDefault(); $$('#kinds [data-kind]')[+e.key - 1]?.click(); return; }
  if (e.key === 'F2' && st.folder) { e.preventDefault(); renameFolder(st.folder); return; }

  const it = cur();
  if (mod && k === 'e') { e.preventDefault(); startEdit(); return; }
  if ((e.key === 'Delete' || (IS_MAC && e.key === 'Backspace' && mod)) && !typing && it) { e.preventDefault(); deleteItem(it); return; }
  if (mod && k === 'b') { e.preventDefault(); copyField(it, 'username', "Nom d'utilisateur"); return; }
  if (mod && k === 'c' && !e.shiftKey) {
    // leave normal copy alone when the user selected text
    const textSel = typing ? active.selectionStart !== active.selectionEnd : String(getSelection()).length > 0;
    if (!textSel && it?.data.password) { e.preventDefault(); copyField(it, 'password', 'Mot de passe'); }
    return;
  }
  if (mod && k === 'u') { e.preventDefault(); e.shiftKey ? copyField(it, 'uri', 'URL') : openUri(it); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (typing && active.id !== 'q') return;
    e.preventDefault();
    move(e.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (e.key === 'Enter' && active?.id === 'q') {
    if (!it && st.list.length) select(st.list[0].id);
    $('#items').focus();
    return;
  }
  if (e.key === 'Enter' && active?.id === 'items' && it) { startEdit(); return; }
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
    const el = $('#items .item.sel');
    if (el && it) { e.preventDefault(); const r = el.getBoundingClientRect(); openMenu(r.left + 40, r.bottom, itemMenu(it)); }
  }
});

/* ---------------- global ---------------- */
document.addEventListener('mousedown', (e) => { if (menuOpen() && !e.target.closest('#menu')) closeMenu(); });
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);
// keep the native menu only where it is useful (text fields)
document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea')) e.preventDefault(); });
// favicon failed: fall back to the item-type icon
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.fb) {
    const box = img.parentElement;
    box.classList.add('k' + img.dataset.k);
    box.innerHTML = ic(img.dataset.fb);
  }
}, true);

listen('locked', () => { Object.assign(st, { selId: null, edit: null, dirty: false }); refresh(); });
refresh().catch((e) => { document.body.textContent = 'Erreur : ' + e; });
