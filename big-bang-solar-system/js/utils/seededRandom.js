/**
 * seededRandom.js
 * ------------------------------------------------------------------
 * A small deterministic pseudo-random number generator (mulberry32).
 * Given the same numeric seed, `createSeededRandom(seed)` returns a
 * function that produces the exact same sequence of numbers in [0, 1)
 * every time, on every machine — which is what lets a procedural scene
 * (e.g. CosmicWebData) regenerate an identical structure on every load
 * instead of a different random layout each time.
 *
 * Not cryptographically secure, not intended to be — just fast,
 * dependency-free, and reproducible. Generic and cosmology-agnostic;
 * any future procedural scene can reuse this.
 */

/**
 * @param {number} seed - any 32-bit integer; the same seed always
 *   produces the same sequence.
 * @returns {() => number} a function returning the next number in
 *   [0, 1) on each call.
 */
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
