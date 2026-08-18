/**
 * core/ScaleFactorModel.js
 * ------------------------------------------------------------------
 * Pure model for the early-universe scale factor a(t) — the quantity
 * that expresses metric expansion ("space itself stretching"), used
 * only during the 'early-universe' and 'expansion-cooling' epochs
 * (index 0 and 1). No Three.js, no DOM, no mutable state — identical
 * convention to TemperatureModel.js, callable from the time
 * controller, a scene, or a unit test alike.
 *
 * WHAT a(t) MEANS HERE, AND WHAT IT DOESN'T:
 * A full cosmological scale factor spans the entire 13.8 Gyr history
 * of the universe, normalized to a(today) = 1. That is NOT what this
 * file computes. This is a deliberately narrow, normalized model
 * covering only the two earliest epochs — normalized so a = 1 at
 * `expansion-cooling`'s own end time (t = 1 second), not at the
 * present day. Treat it as "how much this early slice of the universe
 * has stretched relative to itself by the time this narrow window
 * closes," not a literal historical measurement plugged into anywhere
 * else in the app.
 *
 * The a(t) \u221d t^(1/2) relation used below is the standard radiation-
 * era approximation — physically appropriate for exactly the window
 * this covers (both epochs sit well within radiation domination), but
 * still a simplification: it ignores the brief inflationary epoch's
 * very different expansion law and any subtlety in the transition
 * between the two. Good enough to be pedagogically honest at the
 * epoch-boundary scale this project visualizes; not a cosmological
 * solver.
 *
 * Density here follows density \u221d 1/a\u00b3 (matter/radiation dilution
 * under expansion), likewise a simplified derived quantity for
 * visualization, not a historical number.
 *
 * `isScaleFactorApplicable()` gates all of this to exactly the two
 * epochs it's meaningful for — CosmicTimeController publishes `null`
 * outside them, the same null-outside-its-scope convention
 * `localTemperatureK` already uses in SimulationState (see
 * data/epochs.js's temperature note) for a value that only means
 * something for part of the timeline.
 */
import { EPOCHS } from '../data/epochs.js';

const APPLICABLE_EPOCH_IDS = new Set(['early-universe', 'expansion-cooling']);

// Normalize a(t) = 1 at the end of 'expansion-cooling' (t = 1 second) —
// read from the data model, never hardcoded here, so a future edit to
// that epoch's bounds in data/epochs.js keeps this consistent
// automatically rather than silently drifting out of sync.
const REFERENCE_TIME_SEC = EPOCHS.find((e) => e.id === 'expansion-cooling').tEndSec;

/** @param {string} epochId */
export function isScaleFactorApplicable(epochId) {
  return APPLICABLE_EPOCH_IDS.has(epochId);
}

/**
 * @param {number} cosmicTimeSec
 * @returns {number} a(t), normalized so a(REFERENCE_TIME_SEC) = 1
 */
export function resolveScaleFactor(cosmicTimeSec) {
  const t = Math.max(cosmicTimeSec, 0);
  return Math.sqrt(t / REFERENCE_TIME_SEC);
}

/**
 * @param {number} scaleFactor
 * @returns {number} density \u221d 1/a\u00b3, normalized the same way as scaleFactor
 */
export function resolveRelativeDensity(scaleFactor) {
  const a = Math.max(scaleFactor, 1e-300); // guard against divide-by-zero at t=0
  return 1 / (a * a * a);
}
