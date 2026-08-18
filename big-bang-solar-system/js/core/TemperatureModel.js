/**
 * core/TemperatureModel.js
 * ------------------------------------------------------------------
 * Given a cosmic time and the epoch it falls within, returns Kelvin
 * values in Kelvin for BOTH temperature contexts an epoch may define
 * (see the "TEMPERATURE HAS TWO DISTINCT CONTEXTS" note at the top of
 * data/epochs.js for the full rationale). This is deliberately a
 * *pure function module* — no Three.js, no DOM, no mutable state — so
 * it can be called from the time controller, the UI, or a unit test
 * identically.
 *
 * Physically, cosmic background temperature falls off with the inverse
 * of the universe's scale factor (T ~ 1/a(t)), which in the radiation-
 * and matter-dominated eras is itself a function of time. Rather than
 * embedding a full FRW solver here, we interpolate log-linearly
 * between each epoch's documented start/end temperature (see
 * data/epochs.js) — accurate enough to be pedagogically honest at the
 * epoch-boundary scale this project visualizes, and trivially
 * replaceable with a closed-form solution later without touching any
 * caller. Local-environment temperature (nebula/disk/protoplanet) uses
 * the same log interpolation for the same reason, over its own
 * separate start/end pair.
 */
import { logLerp, clamp } from '../utils/mathUtils.js';

/**
 * @param {object} epoch - one entry from data/epochs.js
 * @param {number} progress - 0..1 progress through that epoch
 * @returns {{ cosmicBackgroundTemperatureK: number, localTemperatureK: number|null, context: 'cosmic-background'|'local-environment' }}
 */
export function resolveTemperatures(epoch, progress) {
  const t = clamp(progress, 0, 1);

  // Always resolved: the cosmic background exists throughout the
  // universe's entire history, whether or not a given epoch features
  // it as the primary HUD reading.
  const cosmicBackgroundTemperatureK = logLerp(
    epoch.cosmicBackgroundTempStartK,
    epoch.cosmicBackgroundTempEndK,
    t
  );

  // Only resolved once a local structure (nebula, disk, protoplanet...)
  // actually exists to have its own temperature. `localTempStartK`/`EndK`
  // are `null` on every epoch before 'solar-nebula' — see data/epochs.js.
  const hasLocalTrack = epoch.localTempStartK != null && epoch.localTempEndK != null;
  const localTemperatureK = hasLocalTrack ? logLerp(epoch.localTempStartK, epoch.localTempEndK, t) : null;

  return {
    cosmicBackgroundTemperatureK,
    localTemperatureK,
    context: epoch.temperatureContext,
  };
}
