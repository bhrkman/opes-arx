/* Capital Divide — /sim/prng.js
 * Seeded randomness core. Canon (DESIGN.md §2.20, §17): mulberry32, no Math.random,
 * seed ⇒ identical output, ports 1:1 to GDScript at Step 11.
 * UMD-ish: browser gets window.CDPRNG, node gets module.exports.
 */
(function (global) {
  "use strict";

  /** mulberry32: 32-bit seeded PRNG. Returns () => float in [0,1).
   *
   *  The WHOLE state of this generator is `a`, one 32-bit integer, and a seed is nothing more
   *  than a starting value of it — so `mulberry32(rng.state())` resumes a stream exactly where
   *  it was left. That is what makes a save file possible without recording every draw: the
   *  career is a deterministic function of its seed, and a saved `a` IS a seed.
   *  `state()` is a method on the returned function rather than a second return value so every
   *  existing call site keeps working unchanged.
   */
  function mulberry32(seed) {
    let a = seed >>> 0;
    const next = function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.state = function () { return a >>> 0; };
    return next;
  }

  /** Hash a string (or number) to a 32-bit seed. Deterministic. */
  function seedFrom(x) {
    if (typeof x === "number" && Number.isFinite(x)) return x >>> 0;
    const s = String(x);
    let h = 2166136261 >>> 0; // FNV-1a
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Derive an independent child rng from a parent rng (stream splitting). */
  function child(rng) {
    return mulberry32(Math.floor(rng() * 4294967296) >>> 0);
  }

  /** Standard normal via Box–Muller (two rng() draws). */
  function normal(rng, mean, sd) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return (mean || 0) + z * (sd === undefined ? 1 : sd);
  }

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  /** Integer in [lo, hi] inclusive. */
  function int(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

  /** Uniform pick from array. */
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  /** Weighted pick. entries: [[value, weight], ...] or object {value: weight}. */
  function weightedPick(rng, entries) {
    const pairs = Array.isArray(entries) ? entries : Object.entries(entries);
    let total = 0;
    for (const [, w] of pairs) total += w;
    let roll = rng() * total;
    for (const [v, w] of pairs) {
      roll -= w;
      if (roll <= 0) return v;
    }
    return pairs[pairs.length - 1][0];
  }

  /** True with probability p. */
  function chance(rng, p) { return rng() < p; }

  /** Fisher–Yates shuffle (copy). */
  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Round to nearest multiple. */
  function roundTo(x, m) { return Math.round(x / m) * m; }

  const api = { mulberry32, seedFrom, child, normal, clamp, int, pick, weightedPick, chance, shuffle, roundTo };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CDPRNG = api;
})(typeof window !== "undefined" ? window : globalThis);
