/**
 * core/SceneManager.js
 * ------------------------------------------------------------------
 * Owns the single shared THREE.Scene (and its baseline lighting) for
 * the whole app. Individual epoch scenes never get their own
 * THREE.Scene — instead each one builds a THREE.Group (`scene.root`,
 * see BaseScene) that SceneManager adds/removes on transition. This
 * keeps one renderer/camera/lighting setup alive across epoch changes
 * so transitions can be smooth rather than a hard cut, and guarantees
 * the previous epoch's objects are actually removed (exit() disposes
 * their GPU resources; SceneManager removes the now-empty group).
 */
import * as THREE from 'three';

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this._activeScene = null;

    this._addBaselineLighting();
  }

  _addBaselineLighting() {
    // Neutral ambient + a single key light so placeholder geometry (and
    // any future scene that doesn't bring its own lights) is visible.
    // Dedicated scenes are free to add their own lights to their root
    // group for epoch-specific mood.
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(3, 4, 5);
    this.scene.add(ambient, key);
  }

  /**
   * Exit the current scene (if any) and enter `newScene`.
   * @param {import('../scenes/BaseScene.js').BaseScene} newScene
   * @param {object} context passed straight through to enter()
   */
  switchTo(newScene, context) {
    if (this._activeScene) {
      this._activeScene.exit();
      this.scene.remove(this._activeScene.root);
    }

    this._activeScene = newScene;
    this._activeScene.enter(context);
    this.scene.add(this._activeScene.root);
  }

  /** Forward a frame update to whichever scene is currently active. */
  update(deltaTime, context) {
    this._activeScene?.update(deltaTime, context);
  }
}
