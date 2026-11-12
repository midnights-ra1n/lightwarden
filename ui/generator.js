// Password / passphrase generation (no DOM). Tested by tests/generator.test.js.
(function (root) {
  const WORDS = typeof module !== 'undefined' ? require('./words.js') : root.WORDS;
  const SETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%&*-_=+?' };
  const AMBIGUOUS = /[IOl01o]/g; // easy to misread: dropped when `avoidAmbiguous` is on
  const pool = (k, o) => (o.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]);

  /** Uniform integer in [0, n): rejection sampling, no modulo bias. */
  function randInt(n) {
    const lim = 2 ** 32 - (2 ** 32 % n), b = new Uint32Array(1);
    do crypto.getRandomValues(b); while (b[0] >= lim);
    return b[0] % n;
  }

  // opts: { length, upper, lower, digits, symbols, avoidAmbiguous } — at least one class must be on.
  // Each enabled class appears at least once, then the rest is drawn from the union and shuffled.
  function password(o) {
    const sets = ['upper', 'lower', 'digits', 'symbols'].filter((k) => o[k]).map((k) => pool(k, o));
    if (!sets.length) return '';
    const n = Math.max(o.length, sets.length), all = sets.join('');
    const out = sets.map((s) => s[randInt(s.length)]);
    while (out.length < n) out.push(all[randInt(all.length)]);
    for (let i = out.length - 1; i > 0; i--) { const j = randInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out.join('');
  }

  // opts: { words, separator, capitalize, number }
  function passphrase(o) {
    const w = Array.from({ length: o.words }, () => WORDS[randInt(WORDS.length)]).map((x) => (o.capitalize ? x[0].toUpperCase() + x.slice(1) : x));
    if (o.number) { const i = randInt(w.length); w[i] += randInt(10); }
    return w.join(o.separator);
  }

  /** Strength estimate in bits for the given options (for the meter). */
  function entropy(o) {
    if (o.mode === 'words') return Math.round(o.words * Math.log2(WORDS.length) + (o.number ? Math.log2(o.words * 10) : 0));
    const size = ['upper', 'lower', 'digits', 'symbols'].filter((k) => o[k]).reduce((n, k) => n + pool(k, o).length, 0);
    return size ? Math.round(o.length * Math.log2(size)) : 0;
  }

  const api = { SETS, password, passphrase, entropy, WORDS };
  if (typeof module !== 'undefined') module.exports = api; else root.G = api;
})(this);
