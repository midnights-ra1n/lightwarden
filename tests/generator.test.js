// Run: node tests/generator.test.js
const assert = require('assert');
const G = require('../ui/generator.js');

const all = { length: 24, upper: true, lower: true, digits: true, symbols: true, avoidAmbiguous: true };
for (let i = 0; i < 200; i++) {
  const p = G.password(all);
  assert.strictEqual(p.length, 24);
  assert(/[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p), 'every enabled class is present: ' + p);
  assert(!/[IOlo01]/.test(p), 'ambiguous characters are left out by default: ' + p);
}
assert.strictEqual(G.password({ ...all, upper: false, lower: false, digits: false, symbols: false }), ''); // nothing enabled
assert(/^[0-9]{8}$/.test(G.password({ length: 8, digits: true, upper: false, lower: false, symbols: false, avoidAmbiguous: false })));
assert.strictEqual(G.password({ ...all, length: 2 }).length, 4); // never shorter than the number of classes

const ph = G.passphrase({ words: 5, separator: '-', capitalize: true, number: true });
assert.strictEqual(ph.split('-').length, 5);
assert(/^[A-Z]/.test(ph) && /\d/.test(ph));
assert.strictEqual(G.WORDS.length, 1296);
assert.strictEqual(G.entropy({ mode: 'words', words: 4 }), 41); // 4 x log2(1296)
assert(G.entropy({ mode: 'chars', ...all }) > 100);
console.log('generator ok');
