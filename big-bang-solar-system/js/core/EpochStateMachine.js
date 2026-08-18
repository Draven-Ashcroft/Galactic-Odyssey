/**
 * core/EpochStateMachine.js
 * ------------------------------------------------------------------
 * The finite state machine whose states are the 13 epochs in
 * data/epochs.js. This is the only module that is allowed to change
 * SimulationState.currentEpochIndex or tell SceneManager to switch
 * scenes — everything else reacts to the "epoch:changed" event it
 * emits.
 *
 * Transition sequence for goToEpoch(index):
 *   1. emit "epoch:will-change"                    (scenes/UI can react pre-emptively)
 *   2. simulationState.set({ currentEpochIndex })    updated BEFORE the scene is entered,
 *   3. cosmicTimeController.setEpoch(newEpoch)        so the context.state snapshot handed
 *   4. cameraManager.frameEpoch(newEpoch)             to the new scene's enter() below is
 *                                                      already correct — see the fixed-bug
 *                                                      note in goToEpoch().
 *   5. resolve the new epoch's Scene class via sceneRegistry
 *   6. sceneManager.switchTo(newScene, context)  (old scene exit()s, new scene enter()s)
 *   7. emit "epoch:changed"
 *
 * Listens for "epoch:complete" (raised by CosmicTimeController when an
 * epoch finishes playing) and automatically advances to the next one,
 * so normal playback flows through this same transition path.
 */
import { EPOCHS } from '../data/epochs.js';
import { resolveSceneClass } from '../scenes/sceneRegistry.js';

export class EpochStateMachine {
  /**
   * @param {object} deps
   * @param {import('./EventBus.js').EventBus} deps.eventBus
   * @param {import('./SimulationState.js').SimulationState} deps.simulationState
   * @param {import('./SceneManager.js').SceneManager} deps.sceneManager
   * @param {import('./CameraManager.js').CameraManager} deps.cameraManager
   * @param {import('./CosmicTimeController.js').CosmicTimeController} deps.cosmicTimeController
   */
  constructor({ eventBus, simulationState, sceneManager, cameraManager, cosmicTimeController }) {
    this._eventBus = eventBus;
    this._state = simulationState;
    this._sceneManager = sceneManager;
    this._cameraManager = cameraManager;
    this._cosmicTimeController = cosmicTimeController;

    this._eventBus.on('epoch:complete', () => this.next());
  }

  goToEpoch(index) {
    if (index < 0 || index >= EPOCHS.length) return;
    const epoch = EPOCHS[index];

    this._eventBus.emit('epoch:will-change', { fromIndex: this._state.currentEpochIndex, toIndex: index });

    // BUGFIX (foundation validation pass): state/time/camera must be updated
    // BEFORE the context object is built, because sceneManager.switchTo()
    // below calls the new scene's enter() synchronously. Building `context`
    // first (as an earlier version of this method did) meant enter() always
    // received a snapshot of the PREVIOUS epoch's state — harmless while
    // PlaceholderScene ignores context.state, but a real bug waiting to
    // surface the moment any scene reads context.state in enter().
    this._state.set({ currentEpochIndex: index, epochProgress: 0 });
    this._cosmicTimeController.setEpoch(epoch);
    this._cameraManager.frameEpoch(epoch);

    const SceneClass = resolveSceneClass(epoch.id);
    const context = {
      epoch,
      state: this._state.snapshot(),
      camera: this._cameraManager.camera,
      eventBus: this._eventBus,
    };
    this._sceneManager.switchTo(new SceneClass(), context);

    this._eventBus.emit('epoch:changed', { epoch, index });
  }

  next() {
    const nextIndex = this._state.currentEpochIndex + 1;
    if (nextIndex >= EPOCHS.length) {
      // BUGFIX (foundation validation pass): goToEpoch() silently no-ops on
      // an out-of-range index, so without this guard, reaching the final
      // epoch left CosmicTimeController re-emitting "epoch:complete" every
      // single frame forever (each one calling next() -> goToEpoch(13) ->
      // no-op, in a tight loop) instead of stopping. Pause playback instead.
      this._state.set({ isPlaying: false });
      return;
    }
    this.goToEpoch(nextIndex);
  }

  previous() {
    this.goToEpoch(this._state.currentEpochIndex - 1);
  }
}
