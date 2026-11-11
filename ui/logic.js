// Pure helpers (no DOM): folder tree, filtering, search highlighting. Tested by tests/logic.test.js.
(function (root) {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const tokens = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  // Secrets are never searched: typing part of a password must not reveal which item holds it.
  const SECRET = new Set(['password', 'totp', 'number', 'code', 'ssn', 'passportNumber', 'licenseNumber', 'privateKey']);
  const haystack = (it) => [it.name, it.notes, it.folder,
    ...Object.entries(it.data || {}).filter(([k]) => !SECRET.has(k)).map(([, v]) => v)].join('\n').toLowerCase();
  const inFolder = (it, path) => !path || it.folder === path || it.folder.startsWith(path + '/');

  // A search looks through the whole vault (like KeePassXC); otherwise the selected folder applies.
  function filterItems(items, { query, folder, kind }) {
    const t = tokens(query);
    return items.filter((it) =>
      (t.length || inFolder(it, folder)) && (!kind || it.kind === kind) &&
      t.every((x) => haystack(it).includes(x)));
  }

  // Bitwarden folders nest by name ("Perso/Banque"); parents may not exist as real folders.
  function buildTree(folders, items) {
    const root = { name: '', path: '', children: new Map(), count: 0 };
    const walk = (path, visit) => {
      let n = root, acc = '';
      for (const part of path.split('/')) {
        acc = acc ? acc + '/' + part : part;
        if (!n.children.has(part)) n.children.set(part, { name: part, path: acc, children: new Map(), count: 0 });
        n = n.children.get(part);
        visit(n);
      }
    };
    for (const f of folders) if (f) walk(f, () => {});
    for (const it of items) {
      root.count++;
      if (it.folder) walk(it.folder, (n) => n.count++);
    }
    return root;
  }

  function flatten(tree, collapsed) {
    const out = [];
    const rec = (n, depth) => {
      const kids = [...n.children.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
      for (const c of kids) {
        const open = !collapsed.has(c.path);
        out.push({ path: c.path, name: c.name, depth, count: c.count, hasChildren: c.children.size > 0, open });
        if (open) rec(c, depth + 1);
      }
    };
    rec(tree, 0);
    return out;
  }

  // Escapes text and wraps every search-token occurrence in <mark>.
  function highlight(text, query) {
    text = String(text ?? '');
    const t = tokens(query);
    const low = text.toLowerCase();
    if (!t.length || low.length !== text.length) return esc(text);
    const on = new Array(text.length).fill(false);
    for (const x of t) for (let i = low.indexOf(x); i >= 0; i = low.indexOf(x, i + x.length)) on.fill(true, i, i + x.length);
    let out = '', open = false;
    for (let k = 0; k < text.length; k++) {
      if (on[k] !== open) { out += on[k] ? '<mark>' : '</mark>'; open = on[k]; }
      out += esc(text[k]);
    }
    return open ? out + '</mark>' : out;
  }

  function host(uri) {
    if (!uri) return '';
    try {
      const h = new URL(uri.includes('://') ? uri : 'https://' + uri).hostname;
      return /^[a-z0-9.-]+$/i.test(h) ? h : '';
    } catch { return ''; }
  }

  const api = { esc, SECRET, tokens, inFolder, filterItems, buildTree, flatten, highlight, host };
  if (typeof module !== 'undefined') module.exports = api; else root.L = api;
})(this);
