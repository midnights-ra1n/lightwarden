// Run: node tests/logic.test.js
const assert = require('assert');
const L = require('../ui/logic.js');

const items = [
  { kind: 1, name: 'GitHub', notes: '', folder: 'Dev', data: { username: 'dev', uri: 'https://github.com', password: 'hunter2' } },
  { kind: 5, name: 'Serveur', notes: 'clé ed25519', folder: 'Dev/SSH', data: { publicKey: 'ssh-ed25519 AAAA root@srv' } },
  { kind: 1, name: 'Banque', notes: '', folder: 'Perso/Finance', data: { username: 'moi', uri: 'banque.fr' } },
  { kind: 2, name: 'Divers <b>', notes: '', folder: '', data: {} },
];

const tree = L.buildTree(['Dev', 'Dev/SSH', 'Vide'], items);
const rows = L.flatten(tree, new Set());
assert.deepStrictEqual(rows.map((r) => r.path), ['Dev', 'Dev/SSH', 'Perso', 'Perso/Finance', 'Vide']);
assert.strictEqual(rows[0].count, 2);
assert.strictEqual(tree.count, 4);
assert.deepStrictEqual(L.flatten(tree, new Set(['Dev'])).map((r) => r.path), ['Dev', 'Perso', 'Perso/Finance', 'Vide']);

assert.strictEqual(L.filterItems(items, { folder: 'Dev', kind: 0, query: '' }).length, 2);
assert.strictEqual(L.filterItems(items, { folder: 'Dev', kind: 1, query: '' }).length, 1);
// search ignores the folder and ANDs tokens across fields
assert.deepStrictEqual(L.filterItems(items, { folder: 'Dev', kind: 0, query: 'moi finance' }).map((i) => i.name), ['Banque']);
assert.strictEqual(L.filterItems(items, { folder: '', kind: 0, query: 'ED25519' }).length, 1);

assert.strictEqual(L.filterItems(items, { folder: '', kind: 0, query: 'hunter2' }).length, 0, 'passwords are not searchable');
assert.strictEqual(L.filterItems(items, { folder: '', kind: 0, query: 'root@srv' }).length, 1);
assert.strictEqual(L.highlight('GitHub', 'hub'), 'Git<mark>Hub</mark>');
assert.strictEqual(L.highlight('<b>', ''), '&lt;b&gt;');
assert.strictEqual(L.highlight('a<b', 'a'), '<mark>a</mark>&lt;b');
assert.strictEqual(L.host('banque.fr/login'), 'banque.fr');
assert.strictEqual(L.host('javascript:alert(1)'), '');
console.log('logic: ok');
