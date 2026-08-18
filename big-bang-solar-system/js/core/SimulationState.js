/**
 * core/SimulationState.js
 * ------------------------------------------------------------------
 * The single source of truth for "where the simulation currently is".
 * Every other module reads state from here and, where it needs to
 * change something, calls `.set()` rather than mutating fields
 * directly. That keeps the data flow one-directional and makes
 * "state:changed" a reliable signal that something actually happened:
 *
 *   controller calls state.set({...})
 *     -> SimulationState updates its fields
 *     -> SimulationState emits "state:changed" on the EventBus
 *     -> UIManager / scenes re-render from the new values
 *
 * No module other than the controllers below should ever import and
 * call `.set()` directly: scenes and UIManager should only read
 * `state.snapshot()` and listen for "state:changed".
 */
export class SimulationState {
  /**
   * @param {import('./EventBus.js').EventBus} eventBus
   */
  constructor(eventBus) {
    this._eventBus = eventBus;

    this.currentEpochIndex = 0;
    this.cosmicTimeSec = 0; // seconds since t=0, set by CosmicTimeController
    this.epochProgress = 0; // 0..1 progress through the current epoch
    this.cosmicBackgroundTemperatureK = 0; // always populated — see data/epochs.js temperature note
    this.localTemperatureK = null; // populated only from 'solar-nebula' onward
    this.temperatureContext = 'cosmic-background'; // 'cosmic-background' | 'local-environment' — which one the UI should feature
    this.scaleFactor = null; // populated only during 'early-universe'/'expansion-cooling' — see core/ScaleFactorModel.js
    this.isPlaying = false;
    this.playbackSpeed = 0.5; // multiplier applied to real elapsed time - default is 0.5x (see index.html's speed selector, which must stay in sync with this)
  }

  /** Merge a partial patch into state and broadcast what changed. */
  set(patch) {
    const changedKeys = [];
    for (const key of Object.keys(patch)) {
      if (this[key] !== patch[key]) {
        this[key] = patch[key];
        changedKeys.push(key);
      }
    }
    if (changedKeys.length > 0) {
      this._eventBus.emit('state:changed', {
        changedKeys,
        state: this.snapshot(),
      });
    }
  }

  /** Read-only plain-object copy, safe to hand to UI/scene code. */
  snapshot() {
    return {
      currentEpochIndex: this.currentEpochIndex,
      cosmicTimeSec: this.cosmicTimeSec,
      epochProgress: this.epochProgress,
      cosmicBackgroundTemperatureK: this.cosmicBackgroundTemperatureK,
      localTemperatureK: this.localTemperatureK,
      temperatureContext: this.temperatureContext,
      scaleFactor: this.scaleFactor,
      isPlaying: this.isPlaying,
      playbackSpeed: this.playbackSpeed,
    };
  }
}
