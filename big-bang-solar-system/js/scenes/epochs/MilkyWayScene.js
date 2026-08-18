/**
 * scenes/epochs/MilkyWayScene.js
 * ------------------------------------------------------------------
 * The dedicated scene for 'milky-way' (index 7), replacing
 * PlaceholderScene. Follows the standard enter()/update()/exit()
 * contract from BaseScene exactly — `this.root` is the THREE.Group
 * BaseScene's constructor already creates; nothing here creates a
 * second THREE.Scene or THREE.Camera, and SceneManager remains solely
 * responsible for adding/removing `this.root`.
 *
 * EDUCATIONAL PURPOSE:
 * A single, richly-detailed spiral galaxy — our own — assembling into
 * its bulge+disk+arms shape, followed by the camera drifting from a
 * wide whole-galaxy view toward a marked "Solar System will form here"
 * site well out in one spiral arm. This is the narrative bridge the
 * epoch summary describes: the galaxy exists first, as a whole; our
 * own Solar System is a much later, local event within it, not
 * something that appears everywhere at once. See MilkyWayData.js's
 * file header for exactly how the star field and the site marker are
 * generated (both reuse `generateSpiralPositions()` from
 * `galaxies/SpiralGalaxy.js` rather than reinventing spiral-arm math).
 *
 * CAMERA: reuses the exact per-frame exponential-damping-toward-a-
 * live-target technique GalaxyFormationScene.js's close-up mode
 * already proved out (there: following a galaxy that drifts during a
 * merger; here: smoothly blending from a wide galaxy view toward the
 * Solar System site as `phase.zoomT` advances) — not the older fixed
 * start/end ease other scenes use, since the target here is
 * continuously changing as the epoch progresses, not a single
 * stationary destination.
 *
 * PERFORMANCE:
 * One shared THREE.Points/BufferGeometry for all ~5,000 stars (one
 * draw call). One small InstancedMesh (a single instance) for the
 * Solar System site marker. All typed arrays allocated once in
 * enter(), mutated in place in update() — no per-frame allocation.
 *
 * ARCHITECTURAL BOUNDARIES:
 * This scene never calls simulationState.set(...), never reaches into
 * another scene, and keeps no module-level/global state — everything
 * it owns lives on `this`, created in enter() and disposed in exit().
 * No eventBus listeners are registered by this scene, so there is
 * nothing to unsubscribe.
 */
import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { generateMilkyWayField, resolveMilkyWayPhase } from './MilkyWayData.js';

const BULGE_COLOR = new THREE.Color('#ffe3b0'); // matches this epoch's own HUD accent
const DISK_COLOR = new THREE.Color('#bfe0ff'); // cooler, younger disk-population tint
const MARKER_COLOR = new THREE.Color('#ffd27a'); // warm - "our own Sun-to-be"

const CAMERA_FOLLOW_TIME_CONSTANT = 0.9; // per-frame damping speed while blending the camera target
const MARKER_MAX_SCALE = 0.16;

function isNarrowViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

export class MilkyWayScene extends BaseScene {
  enter(context) {
    const narrow = isNarrowViewport();

    this._field = generateMilkyWayField({ starCount: narrow ? 2600 : 5000 });
    this._reusableVec = new THREE.Vector3(); // scratch, reused every frame — never reallocated
    this._reusableLookAt = new THREE.Vector3();

    this._buildStars();
    this._buildMarker();

    this._elapsed = 0;
  }

  _buildStars() {
    const stars = this._field.stars;
    const count = stars.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this._starOrigins = new Float32Array(count * 3);
    this._starTargets = new Float32Array(count * 3);
    this._starBrightness = new Float32Array(count);
    this._starIsBulge = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
      const s = stars[i];
      const i3 = i * 3;
      this._starOrigins[i3] = s.originX;
      this._starOrigins[i3 + 1] = s.originY;
      this._starOrigins[i3 + 2] = s.originZ;
      this._starTargets[i3] = s.targetX;
      this._starTargets[i3 + 1] = s.targetY;
      this._starTargets[i3 + 2] = s.targetZ;
      this._starBrightness[i] = s.brightness;
      this._starIsBulge[i] = s.region === 'bulge' ? 1 : 0;

      positions[i3] = s.originX;
      positions[i3 + 1] = s.originY;
      positions[i3 + 2] = s.originZ;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.028,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this._starPoints = new THREE.Points(geometry, material);
    this.root.add(this._starPoints);
  }

  _buildMarker() {
    const geometry = new THREE.SphereGeometry(1, 12, 12);
    const material = new THREE.MeshBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.95, depthWrite: false });
    this._markerMesh = new THREE.InstancedMesh(geometry, material, 1);
    this._markerDummy = new THREE.Object3D();
    this._markerDummy.position.set(this._field.solarSite.x, this._field.solarSite.y, this._field.solarSite.z);
    this._markerDummy.scale.setScalar(0.0001);
    this._markerDummy.updateMatrix();
    this._markerMesh.setMatrixAt(0, this._markerDummy.matrix);
    this.root.add(this._markerMesh);
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const progress = context.state.epochProgress;
    const phase = resolveMilkyWayPhase(progress);

    this._updateStars(phase);
    this._updateMarker(phase);
    this._updateCamera(deltaTime, context.camera, phase);

    this.root.rotation.y = this._elapsed * 0.01; // slow ambient rotation for depth cues, subtle
  }

  _updateStars(phase) {
    const posAttr = this._starPoints.geometry.attributes.position;
    const colAttr = this._starPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const origins = this._starOrigins;
    const targets = this._starTargets;
    const brightness = this._starBrightness;
    const isBulge = this._starIsBulge;
    const t = phase.settleT;

    const count = brightness.length;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3] = origins[i3] + (targets[i3] - origins[i3]) * t;
      pos[i3 + 1] = origins[i3 + 1] + (targets[i3 + 1] - origins[i3 + 1]) * t;
      pos[i3 + 2] = origins[i3 + 2] + (targets[i3 + 2] - origins[i3 + 2]) * t;

      const baseColor = isBulge[i] === 1 ? BULGE_COLOR : DISK_COLOR;
      const b = brightness[i] * (0.3 + t * 0.7); // dim while still assembling, full brightness once settled
      col[i3] = baseColor.r * b;
      col[i3 + 1] = baseColor.g * b;
      col[i3 + 2] = baseColor.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateMarker(phase) {
    const dummy = this._markerDummy;
    const site = this._field.solarSite;
    // A gentle pulse so it reads as "a highlighted site," not a static dot.
    const pulse = 0.85 + Math.sin(this._elapsed * 2.0) * 0.15;
    dummy.position.set(site.x, site.y, site.z);
    dummy.scale.setScalar(Math.max(0.0001, phase.markerGlowT * MARKER_MAX_SCALE * pulse));
    dummy.updateMatrix();
    this._markerMesh.setMatrixAt(0, dummy.matrix);
    this._markerMesh.instanceMatrix.needsUpdate = true;
  }

  _updateCamera(deltaTime, camera, phase) {
    const diskRadius = this._field.diskRadius;
    const site = this._field.solarSite;

    // Wide whole-galaxy view, blending toward a close view near the
    // Solar System site as phase.zoomT advances - both position and
    // look-at target are recomputed fresh every frame from zoomT, then
    // approached via per-frame damping (see file header for why, not
    // the fixed-start ease other scenes use).
    const wideX = 0;
    const wideY = diskRadius * 1.15;
    const wideZ = diskRadius * 2.1;
    const closeX = site.x * 1.15;
    const closeY = diskRadius * 0.18;
    const closeZ = site.z + diskRadius * 0.55;

    const targetX = wideX + (closeX - wideX) * phase.zoomT;
    const targetY = wideY + (closeY - wideY) * phase.zoomT;
    const targetZ = wideZ + (closeZ - wideZ) * phase.zoomT;
    this._reusableVec.set(targetX, targetY, targetZ);

    const followT = 1 - Math.exp(-deltaTime / CAMERA_FOLLOW_TIME_CONSTANT);
    camera.position.lerp(this._reusableVec, followT);

    const lookAtX = 0 + (site.x - 0) * phase.zoomT;
    const lookAtY = 0 + (site.y - 0) * phase.zoomT;
    const lookAtZ = 0 + (site.z - 0) * phase.zoomT;
    this._reusableLookAt.set(lookAtX, lookAtY, lookAtZ);
    camera.lookAt(this._reusableLookAt);
  }

  exit() {
    this._starPoints.geometry.dispose();
    this._starPoints.material.dispose();
    this._markerMesh.geometry.dispose();
    this._markerMesh.material.dispose();
    // No textures were created.
  }
}
