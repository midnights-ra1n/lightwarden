// Run: node tests/i18n.test.js
const assert = require('assert');
const I = require('../ui/i18n.js');

I.setLang('fr');
assert.strictEqual(I.tr('Mot de passe'), 'Mot de passe'); // French is the source: untouched
I.setLang('en');
assert.strictEqual(I.tr('Mot de passe'), 'Password');
assert.strictEqual(I.tr('  Verrouiller '), '  Lock '); // surrounding whitespace is kept
assert.strictEqual(I.tr("Nom d’utilisateur copié"), 'Username copied'); // curly apostrophe, nested lookup
assert.strictEqual(I.tr('Nouveau dossier (⌘+⇧+N)'), 'New folder (⌘+⇧+N)'); // tooltip shortcut suffix
assert.strictEqual(I.tr('3 éléments'), '3 items');
assert.strictEqual(I.tr('? Cela concerne 2 sous-dossiers et 3 éléments (déplacés dans « Aucun dossier », pas supprimés).'),
  '? This affects 2 subfolders and 3 items (moved to “No folder”, not deleted).');
assert.strictEqual(I.tr('Dossier perso'), 'Dossier perso'); // unknown text is left alone
assert.strictEqual(I.resolve(1), 'fr');
assert.strictEqual(I.resolve(2), 'en');
console.log('i18n ok');
