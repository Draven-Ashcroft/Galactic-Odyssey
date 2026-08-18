/**
 * core/CameraManager.js
 * ------------------------------------------------------------------
 * Owns the single shared THREE.PerspectiveCamera and keeps it in sync
 * with the viewport size. Camera framing is intentionally static for
 * now (architecture phase); `frameEpoch()` is a stub extension point
 * so a later scene can request a specific vantage point (e.g. pull
 * back for the cosmic web, push in close for planetesimal formation)
 * without any other module needing to change.
 */
import * as THREE from 'three';

const FOV_DEGREES = 55;
const NEAR = 0.01;
const FAR = 2000;
const DEFAULT_POSITION = [0, 0, 10];

export class CameraManager {
  /** @param {HTMLElement} container element used to size the camera's aspect ratio */
  constructor(container) {
    this._container = container;
    this.camera = new THREE.PerspectiveCamera(FOV_DEGREES, this._aspect(), NEAR, FAR);
    this.camera.position.set(...DEFAULT_POSITION);
    this.camera.lookAt(0, 0, 0);
  }

  _aspect() {
    const { clientWidth, clientHeight } = this._container;
    return clientHeight === 0 ? 1 : clientWidth / clientHeight;
  }

  onResize() {
    this.camera.aspect = this._aspect();
    this.camera.updateProjectionMatrix();
  }

  /**
   * Extension point for future scenes: move/orient the camera to suit
   * a given epoch. Currently a no-op placeholder — dedicated scenes
   * can call this from enter() once real framing logic exists here.
   * @param {object} _epoch
   */
  frameEpoch(_epoch) {
    // Intentionally unimplemented during the architecture phase.
  }
}
