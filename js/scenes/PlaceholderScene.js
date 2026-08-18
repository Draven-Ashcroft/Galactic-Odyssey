/**
 * scenes/PlaceholderScene.js
 * ------------------------------------------------------------------
 * A minimal, epoch-agnostic visual so the state machine, camera, and
 * UI can all be exercised end-to-end before any real epoch scene
 * exists. Every entry in sceneRegistry.js currently points here.
 *
 * IMPORTANT SCIENTIFIC RULE (project brief):
 * The Big Bang must never read as an explosion from a single point in
 * pre-existing space — it is space itself stretching. This placeholder
 * honors that even in its generic form, as a working example for
 * whoever builds the dedicated early-universe scene later:
 *   - Particles are seeded uniformly through the *entire* view volume,
 *     never emitted from an origin.
 *   - "Expansion" is animated by uniformly scaling `this.root`, i.e.
 *     stretching the whole field, so every particle recedes from every
 *     other particle equally — there is no center.
 * A future BigBangScene / ExpansionScene should preserve this
 * no-single-origin approach rather than reintroducing one for "visual
 * punch".
 *
 * All color/temperature values come from the epoch object passed via
 * context — nothing scientific is hardcoded in this file.
 */
import * as THREE from 'three';
import { BaseScene } from './BaseScene.js';
import { createSeededRandom } from '../utils/seededRandom.js';

const PARTICLE_COUNT = 1500;
const FIELD_RADIUS = 6;
const PLACEHOLDER_SEED_BASE = 900000001; // distinct from every real scene's seed - see enter() for the per-epoch offset

export class PlaceholderScene extends BaseScene {
  enter(context) {
    const { epoch } = context;
    // Seeded, not Math.random() - every real scene in this project
    // reproduces the exact same structure on every load; this
    // placeholder should too, rather than being the one exception.
    // Offset by epoch.index so if this is ever used for more than one
    // epoch at once, they don't look pixel-identical to each other.
    const rand = createSeededRandom(PLACEHOLDER_SEED_BASE + epoch.index);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Uniform-in-volume seeding (not radial-from-origin bias) so the
      // field already fills the frame — see the scientific rule above.
      positions[i * 3 + 0] = (rand() - 0.5) * 2 * FIELD_RADIUS;
      positions[i * 3 + 1] = (rand() - 0.5) * 2 * FIELD_RADIUS;
      positions[i * 3 + 2] = (rand() - 0.5) * 2 * FIELD_RADIUS;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: new THREE.Color(epoch.color),
      size: 0.045,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
    });

    this._points = new THREE.Points(geometry, material);
    this.root.add(this._points);

    // A soft label sprite-free marker: a faint wireframe icosahedron at
    // the center gives scale/rotation feedback without implying "this
    // is where it all began" — it's just a neutral focal object.
    const markerGeometry = new THREE.IcosahedronGeometry(0.6, 1);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(epoch.color),
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    this._marker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.root.add(this._marker);

    this._elapsed = 0;
    this.root.scale.setScalar(1);
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;

    // Gentle, epoch-agnostic motion: gradual uniform-scale "expansion"
    // over the epoch's duration plus slow rotation, purely to confirm
    // the render loop and camera are alive. Real per-epoch dynamics
    // belong in each epoch's dedicated scene.
    const growth = 1 + context.state.epochProgress * 0.6;
    this.root.scale.setScalar(growth);
    this.root.rotation.y = this._elapsed * 0.05;
    this._marker.rotation.x = this._elapsed * 0.15;
  }

  exit() {
    this._points.geometry.dispose();
    this._points.material.dispose();
    this._marker.geometry.dispose();
    this._marker.material.dispose();
  }
}
