'use strict';
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { esc } = L;
const $ = (s, r = document) => r.querySelector(s);
const IS_MAC = /Mac/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';

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
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const SHIELD = '<svg viewBox="62 62 156 186" aria-hidden="true"><path fill="currentColor" d="M189.909 161.837V90.424H140V217.294C148.838 212.608 156.748 207.512 163.729 202.007C181.183 188.32 189.909 174.93 189.909 161.837ZM211.299 76.1413V161.837C211.299 168.235 210.055 174.576 207.567 180.862C205.079 187.148 201.997 192.727 198.32 197.6C194.644 202.472 190.262 207.214 185.175 211.826C180.087 216.439 175.39 220.27 171.082 223.32C166.774 226.369 162.281 229.252 157.602 231.967C152.923 234.682 149.6 236.524 147.631 237.491C145.663 238.458 144.085 239.202 142.897 239.722C142.005 240.169 141.04 240.392 140 240.392C138.96 240.392 137.995 240.169 137.104 239.722C135.915 239.202 134.337 238.458 132.369 237.491C130.401 236.524 127.077 234.682 122.398 231.967C117.719 229.252 113.226 226.369 108.918 223.32C104.611 220.27 99.913 216.439 94.8256 211.826C89.7381 207.214 85.3562 202.472 81.6798 197.6C78.0035 192.727 74.9213 187.148 72.4332 180.862C69.9452 174.576 68.7012 168.235 68.7012 161.837V76.1413C68.7012 74.2072 69.4067 72.5335 70.8179 71.1201C72.229 69.7067 73.9001 69 75.8311 69H204.169C206.1 69 207.771 69.7067 209.182 71.1201C210.594 72.5335 211.299 74.2072 211.299 76.1413Z"/></svg>';

const KINDS = [
  { k: 0, label: 'Tous les éléments', icon: 'grid' },
  { k: 1, label: 'Identifiants', icon: 'globe' },
  { k: 3, label: 'Cartes', icon: 'card' },
  { k: 4, label: 'Identités', icon: 'user' },
  { k: 2, label: 'Notes sécurisées', icon: 'note' },
  { k: 5, label: 'Clés SSH', icon: 'terminal' },
];
const kindOf = (k) => KINDS.find((x) => x.k === k) || KINDS[1];
const SERVERS = ['bitwarden.com', 'bitwarden.eu', 'Auto-hébergé'];

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* per-viewer convenience only */ } },
};

let snap = null;      // accounts + settings from Rust
let vault = null;     // { folders, items } of the current account, null when locked
const st = { folder: '', kind: 0, query: '', list: [], selItem: null, adding: false, needCode: '', revealed: false, tab: 0 };
const collapsed = new Set(store.get('collapsed', []));

const account = () => snap.accounts[snap.current];
const cur = () => st.selItem;

/* ---------------- data ---------------- */
async function refresh() {
  snap = await invoke('snapshot');
  vault = snap.accounts.length ? await invoke('vault') : null;
  applyTheme();
  render();
}

function applyTheme() {
  const t = snap.global.theme;
  if (t === 0) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t === 1 ? 'light' : 'dark';
}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.className = 'toast show' + (bad ? ' bad' : '');
  t.innerHTML = ic(bad ? 'alert' : 'check') + esc(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

async function copyField(it, field, label) {
  if (!it || !it[field]) return;
  try { await invoke('copy', { text: it[field] }); toast(`${label} copié`); }
  catch (e) { toast(`Copie impossible : ${e}`, true); }
}
async function openUri(it) {
  if (!it || !it.uri) return;
  const url = it.uri.includes('://') ? it.uri : 'https://' + it.uri;
  try { await invoke('open_url', { url }); } catch (e) { toast(String(e), true); }
}

/* ---------------- render ---------------- */
function render() {
  closeMenu();
  const app = $('#app');
  if (!vault || st.adding) {
    $('#shell')?.remove();
    app.innerHTML = loginView();
    bindLogin();
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
    ${snap.accounts.length ? `<button type="button" class="ghost" id="l-other">${adding ? 'Annuler' : 'Changer de compte'}</button>` : ''}
  </form></div>`;
}

function bindLogin() {
  const form = $('#login');
  let kind = +form.querySelector('.seg .on').dataset.srv;
  form.querySelectorAll('[data-srv]').forEach((b) => b.onclick = () => {
    kind = +b.dataset.srv;
    form.querySelectorAll('[data-srv]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    $('#url-fld').classList.toggle('hidden', kind !== 2);
    if (kind === 2) $('#l-url').focus();
  });
  $('#l-reveal').onclick = () => {
    const pw = $('#l-pw'); const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    $('#l-reveal').innerHTML = ic(show ? 'eyeOff' : 'eye');
  };
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
        st.adding = false; st.needCode = ''; st.folder = ''; st.kind = 0; st.query = ''; st.selItem = null;
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
      <div class="side-scroll">
        <nav id="kinds"></nav>
        <div class="side-h">Dossiers</div>
        <div id="tree" role="tree"></div>
      </div>
      <div class="side-foot">
        <button class="ghost" id="b-lock" title="Verrouiller (${MOD}+L)">${ic('lock')}Verrouiller</button>
        <button class="icon-btn" id="b-keys" title="Raccourcis clavier (F1)">${ic('keyboard')}</button>
        <button class="icon-btn" id="b-settings" title="Paramètres (${MOD}+,)">${ic('settings')}</button>
      </div>
    </aside>
    <section class="list">
      <div class="search">${ic('search')}<input id="q" placeholder="Rechercher dans le coffre" spellcheck="false" autocomplete="off">
        <kbd id="q-kbd">${MOD} F</kbd><button class="icon-btn sm hidden" id="q-clear" title="Effacer (Échap)">${ic('x')}</button></div>
      <div class="list-h"><b id="list-title"></b><span id="list-count"></span></div>
      <div class="items" id="items" tabindex="0" role="listbox"></div>
    </section>
    <main class="detail" id="detail"></main>
  </div>`;
}

function bindShell() {
  $('#acct').onclick = (e) => openAccountMenu(e.currentTarget);
  $('#b-lock').onclick = doLock;
  $('#b-settings').onclick = openSettings;
  $('#b-keys').onclick = openShortcuts;
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
  tree.ondblclick = (e) => { const row = e.target.closest('[data-path]'); if (row) toggleFolder(row.dataset.path); };
  tree.oncontextmenu = (e) => {
    const row = e.target.closest('[data-path]');
    if (!row) return;
    e.preventDefault();
    const p = row.dataset.path;
    const has = row.querySelector('.twist:not(.invisible)');
    openMenu(e.clientX, e.clientY, [
      { icon: 'folderOpen', label: 'Afficher le dossier', run: () => { st.folder = p; renderSidebar(); renderList(); } },
      { icon: collapsed.has(p) ? 'expand' : 'collapse', label: collapsed.has(p) ? 'Développer' : 'Réduire', disabled: !has, run: () => toggleFolder(p) },
      '-',
      { icon: 'expand', label: 'Tout développer', run: () => { collapsed.clear(); saveCollapsed(); renderSidebar(); } },
      { icon: 'collapse', label: 'Tout réduire', run: () => { L.flatten(L.buildTree(vault.folders, vault.items), new Set()).forEach((r) => r.hasChildren && collapsed.add(r.path)); saveCollapsed(); renderSidebar(); } },
    ]);
  };

  const items = $('#items');
  items.onclick = (e) => {
    const qb = e.target.closest('[data-quick]');
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const it = st.list[+row.dataset.i];
    if (qb) return qb.dataset.quick === 'u' ? copyField(it, 'username', "Nom d'utilisateur") : copyField(it, 'password', 'Mot de passe');
    select(+row.dataset.i);
  };
  items.ondblclick = (e) => {
    const row = e.target.closest('[data-i]');
    if (row && !e.target.closest('[data-quick]')) copyField(st.list[+row.dataset.i], 'password', 'Mot de passe');
  };
  items.oncontextmenu = (e) => {
    const row = e.target.closest('[data-i]');
    if (!row) return;
    e.preventDefault();
    select(+row.dataset.i);
    openMenu(e.clientX, e.clientY, itemMenu(cur()));
  };

  const detail = $('#detail');
  detail.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const it = cur(), f = b.dataset.f;
    if (b.dataset.act === 'copy') copyField(it, f, b.dataset.label);
    else if (b.dataset.act === 'open') openUri(it);
    else if (b.dataset.act === 'reveal') { st.revealed = !st.revealed; renderDetail(); }
  };
}

function itemMenu(it) {
  return [
    { icon: 'user', label: "Copier le nom d'utilisateur", kbd: `${MOD}+B`, disabled: !it.username, run: () => copyField(it, 'username', "Nom d'utilisateur") },
    { icon: 'key', label: 'Copier le mot de passe', kbd: `${MOD}+C`, disabled: !it.password, run: () => copyField(it, 'password', 'Mot de passe') },
    { icon: 'link', label: "Copier l'URL", kbd: `${MOD}+⇧+U`, disabled: !it.uri, run: () => copyField(it, 'uri', 'URL') },
    { icon: 'external', label: 'Ouvrir le site web', kbd: `${MOD}+U`, disabled: !it.uri, run: () => openUri(it) },
    '-',
    { icon: 'type', label: 'Copier le nom', run: () => copyField(it, 'name', 'Nom') },
    { icon: 'note', label: 'Copier les notes', disabled: !it.notes, run: () => copyField(it, 'notes', 'Notes') },
  ];
}

function saveCollapsed() { store.set('collapsed', [...collapsed]); }
function toggleFolder(p) {
  collapsed.has(p) ? collapsed.delete(p) : collapsed.add(p);
  saveCollapsed();
  renderSidebar();
}

function renderSidebar() {
  const acc = account();
  $('#acct').innerHTML = `<span class="av">${esc(acc.email[0]?.toUpperCase() || '?')}</span>
    <span class="who"><b>${esc(acc.email)}</b><span>${esc(serverLabel(acc))}</span></span>${ic('chevUpDown', 'sm')}`;

  const counts = {};
  for (const it of vault.items) counts[it.kind] = (counts[it.kind] || 0) + 1;
  $('#kinds').innerHTML = KINDS.filter((k) => k.k === 0 || counts[k.k]).map((k) =>
    `<div class="row ${st.kind === k.k && (k.k !== 0 || !st.folder) ? 'sel' : ''}" data-kind="${k.k}">${ic(k.icon)}<span class="label">${k.label}</span><span class="count">${k.k ? counts[k.k] : vault.items.length}</span></div>`).join('');

  const rows = L.flatten(L.buildTree(vault.folders, vault.items), collapsed);
  $('#tree').innerHTML = rows.length ? rows.map((r) =>
    `<div class="row tree-row ${r.path === st.folder ? 'sel' : ''}" style="--d:${r.depth}" data-path="${esc(r.path)}" role="treeitem" aria-expanded="${r.hasChildren ? r.open : ''}">
      <button class="twist ${r.hasChildren ? '' : 'invisible'}" tabindex="-1">${ic(r.open ? 'chevDown' : 'chevRight')}</button>
      ${ic(r.hasChildren && r.open ? 'folderOpen' : 'folder')}<span class="label">${esc(r.name)}</span><span class="count">${r.count || ''}</span></div>`).join('')
    : '<div class="row muted" style="cursor:default">Aucun dossier</div>';
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
  if (q && !st.selItem && st.list.length) select(0);
}

function favicon(it, lg = false) {
  const h = it.kind === 1 && snap.account.website_icons ? L.host(it.uri) : '';
  const k = kindOf(it.kind);
  if (h) return `<div class="fav ${lg ? 'lg' : ''}"><img src="${esc(account().icons)}/${esc(h)}/icon.png" alt="" data-fb="${k.icon}" data-k="${it.kind}" loading="lazy"></div>`;
  return `<div class="fav k${it.kind} ${lg ? 'lg' : ''}">${ic(k.icon)}</div>`;
}

function renderList() {
  st.list = L.filterItems(vault.items, st);
  if (!st.list.includes(st.selItem)) st.selItem = null;
  const title = st.query ? `Résultats pour « ${st.query} »`
    : st.folder ? st.folder.split('/').pop()
    : kindOf(st.kind).label;
  $('#list-title').textContent = title;
  $('#list-count').textContent = `${st.list.length} élément${st.list.length > 1 ? 's' : ''}`;
  const quick = snap.global.quick_copy;
  $('#items').innerHTML = st.list.length ? st.list.map((it, i) => `
    <div class="item ${it === st.selItem ? 'sel' : ''}" data-i="${i}" role="option" aria-selected="${it === st.selItem}">
      ${favicon(it)}
      <div class="meta">
        <div class="name">${L.highlight(it.name, st.query)}</div>
        <div class="sub">${it.username ? L.highlight(it.username, st.query) : esc(kindOf(it.kind).label)}</div>
        ${st.query && it.folder ? `<div class="path">${ic('folder')}${esc(it.folder)}</div>` : ''}
      </div>
      ${quick && it.kind === 1 ? `<div class="quick">
        <button class="icon-btn sm" data-quick="u" title="Copier le nom d'utilisateur" ${it.username ? '' : 'disabled'}>${ic('user', 'sm')}</button>
        <button class="icon-btn sm" data-quick="p" title="Copier le mot de passe" ${it.password ? '' : 'disabled'}>${ic('key', 'sm')}</button></div>` : ''}
    </div>`).join('')
    : `<div class="empty"><div class="bubble">${ic(st.query ? 'search' : 'folder')}</div>
        <b>${st.query ? 'Aucun résultat' : 'Aucun élément'}</b>
        <span>${st.query ? 'Essayez avec d’autres mots-clés.' : 'Ce dossier est vide.'}</span></div>`;
  renderDetail();
}

function select(i) {
  const it = st.list[i];
  if (!it) return;
  if (it !== st.selItem) st.revealed = false;
  st.selItem = it;
  document.querySelectorAll('#items .item').forEach((el) => {
    const on = +el.dataset.i === i;
    el.classList.toggle('sel', on);
    el.setAttribute('aria-selected', on);
    if (on) el.scrollIntoView({ block: 'nearest' });
  });
  renderDetail();
}

function move(delta) {
  if (!st.list.length) return;
  const i = st.list.indexOf(st.selItem);
  select(Math.max(0, Math.min(st.list.length - 1, i < 0 ? 0 : i + delta)));
}

function colorPw(p) {
  return [...p].map((c) => /[0-9]/.test(c) ? `<span class="pw-n">${esc(c)}</span>` : /[A-Za-z]/.test(c) ? esc(c) : `<span class="pw-s">${esc(c)}</span>`).join('');
}

function field({ label, value, f, secret = false, link = false }) {
  const shown = secret && !st.revealed ? '••••••••••••' : secret ? colorPw(value) : esc(value);
  return `<div class="field">
    <div class="fv"><label>${label}</label><div class="val ${secret ? 'mono' : ''}">${shown}</div></div>
    ${secret ? `<button class="icon-btn" data-act="reveal" title="${st.revealed ? 'Masquer' : 'Afficher'}">${ic(st.revealed ? 'eyeOff' : 'eye')}</button>` : ''}
    ${link ? `<button class="icon-btn" data-act="open" title="Ouvrir (${MOD}+U)">${ic('external')}</button>` : ''}
    <button class="icon-btn" data-act="copy" data-f="${f}" data-label="${esc(label)}" title="Copier">${ic('copy')}</button>
  </div>`;
}

function renderDetail() {
  const d = $('#detail');
  const it = cur();
  if (!it) {
    d.innerHTML = `<div class="empty"><div class="logo">${SHIELD}</div><b>Aucun élément sélectionné</b>
      <span>Utilisez <kbd>${MOD} F</kbd> pour rechercher, <kbd>↑</kbd> <kbd>↓</kbd> pour naviguer, <kbd>F1</kbd> pour l’aide.</span></div>`;
    return;
  }
  const k = kindOf(it.kind);
  const creds = [
    it.username && field({ label: "Nom d'utilisateur", value: it.username, f: 'username' }),
    it.password && field({ label: 'Mot de passe', value: it.password, f: 'password', secret: true }),
  ].filter(Boolean).join('');
  d.innerHTML = `<div class="d-wrap">
    <div class="d-head">${favicon(it, true)}<div><h1>${esc(it.name)}</h1>
      <div class="chips"><span class="chip">${ic(k.icon)}${k.label}</span>${it.folder ? `<span class="chip">${ic('folder')}${esc(it.folder)}</span>` : ''}</div></div></div>
    ${creds ? `<div class="group"><div class="group-h">Identifiants</div>${creds}</div>` : ''}
    ${it.uri ? `<div class="group"><div class="group-h">Site web</div>${field({ label: 'URL', value: it.uri, f: 'uri', link: true })}</div>` : ''}
    ${it.notes ? `<div class="group"><div class="group-h">Notes</div><div class="notes">${esc(it.notes)}</div></div>` : ''}
  </div>`;
}

/* ---------------- menus ---------------- */
function openMenu(x, y, entries) {
  const m = $('#menu');
  m.innerHTML = entries.map((e, i) => e === '-' ? '<div class="sep"></div>'
    : `<button role="menuitem" data-mi="${i}" ${e.disabled ? 'disabled' : ''}>${e.html || ic(e.icon)}<span>${e.label}</span>${e.kbd ? `<kbd>${e.kbd}</kbd>` : ''}</button>`).join('');
  m.classList.remove('hidden');
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
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
    run: async () => { await invoke('select_account', { index: i }); st.adding = false; st.needCode = ''; st.folder = ''; st.kind = 0; st.selItem = null; st.query = ''; await refresh(); },
  }));
  entries.push('-', { icon: 'plus', label: 'Ajouter un compte', run: () => { st.adding = true; st.needCode = ''; render(); } });
  if (snap.accounts.length) entries.push({ icon: 'logout', label: 'Retirer ce compte…', run: removeAccount });
  openMenu(r.left, r.bottom + 6, entries);
}

/* ---------------- modals ---------------- */
function modal(html, cls = '') {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = `<div class="backdrop"><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
  root.querySelector('.backdrop').onmousedown = (e) => { if (e.target === e.currentTarget) closeModal(); };
  root.querySelectorAll('[data-close]').forEach((b) => b.onclick = closeModal);
  return root.querySelector('.modal');
}
function closeModal() { $('#modal-root').innerHTML = ''; }
const modalOpen = () => !!$('#modal-root').firstChild;

function confirmModal(title, text, ok) {
  return new Promise((resolve) => {
    const m = modal(`<div class="modal-h"><h2>${title}</h2></div><div class="modal-b"><span class="muted">${text}</span></div>
      <div class="modal-f"><button class="ghost" data-close>Annuler</button><button class="primary danger" id="m-ok">${ok}</button></div>`, 'sm');
    m.querySelector('#m-ok').onclick = () => { closeModal(); resolve(true); };
    m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => resolve(false)));
    m.querySelector('#m-ok').focus();
  });
}

async function removeAccount() {
  const a = account();
  if (!await confirmModal('Retirer le compte', `Retirer <b>${esc(a.email)}</b> de Lightwarden ? Le coffre reste intact sur le serveur.`, 'Retirer')) return;
  await invoke('remove_account');
  st.selItem = null; st.folder = ''; st.query = '';
  await refresh();
}

async function doLock() {
  await invoke('lock');
  st.selItem = null; st.query = '';
  await refresh();
}

function openShortcuts() {
  const rows = [
    ['Rechercher', [MOD, 'F'], ['/']],
    ['Naviguer dans la liste', ['↑'], ['↓']],
    ["Copier le nom d'utilisateur", [MOD, 'B']],
    ['Copier le mot de passe', [MOD, 'C']],
    ['Ouvrir le site web', [MOD, 'U']],
    ["Copier l'URL", [MOD, '⇧', 'U']],
    ['Filtrer par type', [MOD, '1…6']],
    ['Verrouiller', [MOD, 'L']],
    ['Paramètres', [MOD, ',']],
    ['Fermer / effacer la recherche', ['Échap']],
  ];
  const keys = (ks) => ks.map((k) => `<kbd>${k}</kbd>`).join('');
  modal(`<div class="modal-h"><h2>Raccourcis clavier</h2><button class="icon-btn" data-close title="Fermer">${ic('x')}</button></div>
    <div class="modal-b"><div class="keys">${rows.map(([l, a, b]) => `<span>${l}</span><span>${keys(a)}${b ? ' ou ' + keys(b) : ''}</span>`).join('')}</div></div>`, 'sm');
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
    ["Paramètres de l'application (tous les comptes)", () =>
      chk('global', 'keep_background', 'Garder Lightwarden en cours d’exécution en arrière-plan', 'À la fermeture de la fenêtre, Lightwarden reste accessible depuis la zone de notification. Recommandé avec l’agent SSH.')
      + chk('global', 'autostart', 'Démarrer automatiquement à la connexion', 'Démarre Lightwarden à l’ouverture de session.')
      + chk('global', 'hw_accel', "Utiliser l'accélération matérielle", 'Désactivez-la uniquement en cas de problèmes graphiques. Redémarrage requis.')
      + chk('global', 'ssh_agent', "Activer l'agent SSH", 'Signe les demandes SSH directement depuis votre coffre.')
      + sel('global', 'ssh_approval', "Demander une autorisation lors de l'utilisation de l'agent SSH", "Choisir comment gérer les demandes d'autorisation de l'agent SSH.")
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
    m.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    m.querySelector('#tab-body').innerHTML = tabs[st.tab][1]();
  };
  m.onchange = async (e) => {
    const el = e.target;
    if (!el.dataset.k) return;
    snap[el.dataset.scope][el.dataset.k] = el.type === 'checkbox' ? el.checked : +el.value;
    try { await invoke('save_settings', { global: snap.global, account: snap.account }); }
    catch (x) { toast(String(x), true); }
    applyTheme();
    renderList();
  };
}

/* ---------------- keyboard ---------------- */
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const active = document.activeElement;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName);

  if (e.key === 'Escape') {
    if (menuOpen()) { closeMenu(); return; }
    if (modalOpen()) { closeModal(); return; }
    if (active?.id === 'q' && st.query) { setQuery(''); return; }
    active?.blur();
    return;
  }
  if (menuOpen() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const bs = [...document.querySelectorAll('#menu button:not([disabled])')];
    const i = bs.indexOf(active);
    bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
    return;
  }
  if (!vault || st.adding || modalOpen()) return;

  if ((mod && k === 'f') || (!typing && e.key === '/')) { e.preventDefault(); $('#q').focus(); $('#q').select(); return; }
  if (mod && k === 'l') { e.preventDefault(); doLock(); return; }
  if (mod && e.key === ',') { e.preventDefault(); openSettings(); return; }
  if (e.key === 'F1' || (mod && e.key === '/')) { e.preventDefault(); openShortcuts(); return; }
  if (mod && /^[1-6]$/.test(e.key)) {
    e.preventDefault();
    const visible = [...document.querySelectorAll('#kinds [data-kind]')];
    visible[+e.key - 1]?.click();
    return;
  }

  const it = cur();
  if (mod && k === 'b') { e.preventDefault(); copyField(it, 'username', "Nom d'utilisateur"); return; }
  if (mod && k === 'c' && !e.shiftKey) {
    // leave normal copy alone when the user selected text
    const textSel = typing ? active.selectionStart !== active.selectionEnd : String(getSelection()).length > 0;
    if (!textSel && it?.password) { e.preventDefault(); copyField(it, 'password', 'Mot de passe'); }
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
    if (!st.selItem && st.list.length) select(0);
    $('#items').focus();
  }
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
    const el = document.querySelector('#items .item.sel');
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

listen('locked', () => { st.selItem = null; refresh(); });
refresh().catch((e) => { document.body.textContent = 'Erreur : ' + e; });
