/**
 * scenes/BaseScene.js
 * ------------------------------------------------------------------
 * Every epoch's visual is a class extending BaseScene and implementing
 * enter/update/exit. This is the contract SceneManager relies on, and
 * the only thing a future "CosmicWebScene" or "MilkyWayScene" needs to
 * satisfy to slot into the app — see scenes/sceneRegistry.js for where
 * it gets wired in.
 *
 * Lifecycle contract:
 *   enter(context)         called once when this scene becomes active.
 *                           Build all THREE objects here and add them
 *                           to `this.root` (a THREE.Group already
 *                           created for you). Do NOT touch the shared
 *                           THREE.Scene directly — SceneManager adds/
 *                           removes `this.root` for you so switching
 *                           epochs can't leak objects from the last one.
 *   update(deltaTime, ctx)  called every frame while active. `ctx` is
 *                           the same shape as `context` in enter(), so
 *                           you can read live epoch/progress/temperature
 *                           values without subscribing to the event bus
 *                           yourself.
 *   exit()                  called once when another epoch is about to
 *                           become active. Dispose geometries/materials
 *                           you created (GPU memory isn't garbage
 *                           collected) — `this.root` itself is removed
 *                           and discarded by SceneManager after this
 *                           returns.
 *
 * `context` passed to enter()/update() has the shape:
 *   {
 *     epoch,            // the full epoch record from data/epochs.js
 *     state,             // SimulationState.snapshot()
 *     camera,            // the shared THREE.PerspectiveCamera
 *     eventBus,          // the shared EventBus, for scenes that need it
 *   }
 */
import * as THREE from 'three';

export class BaseScene {
  constructor() {
    /** Root group SceneManager adds to/removes from the shared scene. */
    this.root = new THREE.Group();
  }

  /** @param {object} context */
  enter(context) {
    // Intentionally empty — override in subclasses.
  }

  /**
   * @param {number} deltaTime seconds since last frame
   * @param {object} context
   */
  update(deltaTime, context) {
    // Intentionally empty — override in subclasses.
  }

  exit() {
    // Intentionally empty — override in subclasses.
  }
}
