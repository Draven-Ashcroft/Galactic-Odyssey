/**
 * core/CosmicTimeController.js
 * ------------------------------------------------------------------
 * Bridges real wall-clock time (the `deltaTime` from requestAnimationFrame)
 * to *cosmic* time, which spans ~60 orders of magnitude from the first
 * epoch to the present day. A literal "1 real second = N cosmic
 * seconds" mapping is unusable — early epochs would flash by in
 * nanoseconds of playback. Instead:
 *
 *   1. Each epoch is allotted a fixed real-time playback duration
 *      (`playbackDurationSec`, a pacing/UX knob — NOT a scientific
 *      constant, so it intentionally does not live in data/epochs.js).
 *   2. Within that duration, progress (0..1) maps to the epoch's
 *      [tStartSec, tEndSec] range on a LOG scale via logLerp, so the
 *      huge range still animates smoothly.
 *   3. When progress reaches 1, this controller emits "epoch:complete"
 *      and stops advancing; the EpochStateMachine listens for that and
 *      decides whether/how to move to the next epoch.
 *
 * This module only ever reads epoch bounds from the data model that's
 * passed in — it never hardcodes a temperature or time value itself.
 *
 * EXTENDED for the early-universe scale factor: alongside time and
 * temperature, this also publishes `scaleFactor` — `null` outside the
 * 'early-universe'/'expansion-cooling' epochs it's meaningful for (see
 * ScaleFactorModel.js), non-null within them. The controller itself
 * still only orchestrates; the actual model lives in ScaleFactorModel.js,
 * same separation TemperatureModel.js already established.
 */
import { clamp, logLerp } from '../utils/mathUtils.js';
import { resolveTemperatures } from './TemperatureModel.js';
import { isScaleFactorApplicable, resolveScaleFactor } from './ScaleFactorModel.js';

const DEFAULT_EPOCH_PLAYBACK_SEC = 8; // real seconds to play through one epoch at speed=1

export class CosmicTimeController {
  /**
   * @param {object} deps
   * @param {import('./EventBus.js').EventBus} deps.eventBus
   * @param {import('./SimulationState.js').SimulationState} deps.simulationState
   * @param {number} [deps.epochPlaybackDurationSec]
   */
  constructor({ eventBus, simulationState, epochPlaybackDurationSec = DEFAULT_EPOCH_PLAYBACK_SEC }) {
    this._eventBus = eventBus;
    this._state = simulationState;
    this._epochPlaybackDurationSec = epochPlaybackDurationSec;

    this._currentEpoch = null;
    this._elapsedInEpochSec = 0;
  }

  /** Called by EpochStateMachine whenever the active epoch changes. */
  setEpoch(epoch, { resetProgress = true } = {}) {
    this._currentEpoch = epoch;
    if (resetProgress) this._elapsedInEpochSec = 0;
    this._publish();
  }

  /** Advance cosmic time by `deltaTimeSec` of real time. Call once per frame. */
  update(deltaTimeSec) {
    if (!this._currentEpoch || !this._state.isPlaying) return;

    this._elapsedInEpochSec += deltaTimeSec * this._state.playbackSpeed;
    const progress = clamp(this._elapsedInEpochSec / this._epochPlaybackDurationSec, 0, 1);

    this._publish(progress);

    if (progress >= 1) {
      this._eventBus.emit('epoch:complete', { epoch: this._currentEpoch });
    }
  }

  /** Jump directly to a given progress (0..1) within the current epoch, e.g. from a scrub bar. */
  seekWithinEpoch(progress) {
    if (!this._currentEpoch) return;
    this._elapsedInEpochSec = clamp(progress, 0, 1) * this._epochPlaybackDurationSec;
    this._publish();
  }

  _publish(progressOverride) {
    const epoch = this._currentEpoch;
    const progress =
      progressOverride ?? clamp(this._elapsedInEpochSec / this._epochPlaybackDurationSec, 0, 1);
    const cosmicTimeSec = logLerp(epoch.tStartSec, epoch.tEndSec, progress);
    const { cosmicBackgroundTemperatureK, localTemperatureK, context } = resolveTemperatures(epoch, progress);
    const scaleFactor = isScaleFactorApplicable(epoch.id) ? resolveScaleFactor(cosmicTimeSec) : null;

    this._state.set({
      cosmicTimeSec,
      epochProgress: progress,
      cosmicBackgroundTemperatureK,
      localTemperatureK,
      temperatureContext: context,
      scaleFactor,
    });
  }
}
