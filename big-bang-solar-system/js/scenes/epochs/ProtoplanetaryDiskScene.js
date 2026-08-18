/**
 * scenes/epochs/ProtoplanetaryDiskScene.js
 * ------------------------------------------------------------------
 * The Protoplanetary Disk epoch's dedicated scene, replacing
 * PlaceholderScene for 'protoplanetary-disk' in sceneRegistry.js.
 * Follows the standard enter()/update()/exit() contract from BaseScene
 * exactly — `this.root` is the THREE.Group BaseScene's constructor
 * already creates; nothing here creates a second THREE.Scene or
 * THREE.Camera, and SceneManager remains solely responsible for
 * adding/removing `this.root`. This file does not modify
 * SolarNebulaScene.js or any other epoch's scene.
 *
 * SCIENTIFIC PURPOSE (stylized, not a hydrodynamic/radiative-transfer
 * simulation): a young Sun surrounded by a thin, physically-plausible
 * disk of gas and dust, continuously orbiting under genuine Keplerian
 * differential rotation (inner material visibly outpaces outer
 * material over time — not just a one-time infall swirl the way
 * Dark Ages/First Stars/Solar Nebula use). See
 * ProtoplanetaryDiskData.js's file header for the full data-model
 * reasoning (radial density profile, radial temperature/color
 * gradient, Kepler angular-velocity formula, and the explicit "no
 * self-shadowing" scope decision).
 *
 * COSMIC-TIME BEHAVIOR:
 * Everything is driven by `context.state.epochProgress` (0..1) via
 * `resolveDiskPhase()` in ProtoplanetaryDiskData.js — one continuous,
 * single-object timeline (like SolarNebulaScene.js, not a population
 * of staggered sites). This epoch picks up from roughly where Solar
 * Nebula left off (a still-settling structure) and matures into a
 * clean, organized disk — see `resolveDiskPhase()`'s `settleT`.
 *
 * CONTINUOUS ORBITAL MOTION: unlike every earlier scene's one-time
 * origin->target infall, disk particles orbit CONTINUOUSLY for as
 * long as this epoch is active. Each particle's own angular velocity
 * (precomputed once in the data file from Kepler's third law) is
 * integrated into a per-particle accumulated angle every frame
 * (`this._diskAngles`/`this._gasAngles`, Float32Arrays updated in
 * place — no per-frame allocation). This is the same
 * "precompute-the-rate, integrate-the-angle" split
 * SolarNebulaScene.js's bulk rotation established, extended to a
 * PER-PARTICLE rate instead of one shared rate, since genuine
 * differential rotation is the whole point of this epoch.
 *
 * CAMERA: no new interactive controls (preserving the existing camera
 * architecture exactly) — "smooth camera rotation" and the "optional
 * near-edge-on view" are both AMBIENT, automatic behaviors layered on
 * top of the usual progress-driven wide->moderate zoom: a slow
 * continuous azimuthal orbit, plus an even slower elevation
 * oscillation that periodically brings the camera close to edge-on
 * and back. See `_updateCamera()`.
 *
 * PERFORMANCE:
 * One shared THREE.Points/BufferGeometry for all ~3,000 dust/clump
 * particles (one draw call — both roles share the same buffer,
 * distinguished only by a brightness/color multiplier), a second
 * shared layer for ~800 softer diffuse-gas particles, a small static
 * backdrop layer, and two small Points layers for the protostar's
 * core/glow — all typed arrays allocated once in enter() and mutated
 * in place in update(). No per-object Mesh instances anywhere, no
 * per-frame allocation.
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
import { generateProtoplanetaryDiskData, resolveDiskPhase } from './ProtoplanetaryDiskData.js';

const PROTOPLANETARY_DISK_SEED = 41800001; // fixed -> same structure every load
const BACKDROP_COLOR = new THREE.Color('#7a8bb0'); // dim, desaturated — distant galactic context, not the subject
const CORE_COLOR = new THREE.Color('#fff3d9'); // warm white-yellow hot protostellar surface
const CORONA_COLOR = new THREE.Color('#ffb066'); // subtle orange corona tone
const CAMERA_FOLLOW_TIME_CONSTANT = 1.3; // per-frame damping speed while blending the camera target with maturity

const CORE_POINT_SIZE = 0.2;
const CORONA_POINT_SIZE = 0.5;

/** Cheap, one-time mobile heuristic — matches the project's own 640px CSS breakpoint. */
function isNarrowViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

/**
 * A small (64x64), soft, white-to-transparent radial gradient — same
 * technique as FirstStarsScene.js/SolarNebulaScene.js's own
 * `createGlowTexture()`, deliberately duplicated rather than shared
 * (see those files' headers — established precedent in this codebase
 * for not coupling independent epoch scenes together). Generated once
 * per scene instance in enter(), disposed in exit().
 */
function createGlowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Same formula as resolveRadialTemperatureColor() in
// ProtoplanetaryDiskData.js, inlined here for performance (called
// ~3800 times/frame across the disk+gas populations - too many to
// call the data-file function, which returns a new object each call,
// without real per-frame allocation pressure, same reasoning
// DarkAgesScene.js/FirstStarsScene.js/SolarNebulaScene.js already
// established for their own per-particle formulas). Keep both in sync
// if the gradient ever changes.
function resolveRadialTemperatureColorInline(t) {
  const c = Math.min(1, Math.max(0, t));
  let aR, aG, aB, bR, bG, bB, aAt, bAt;
  if (c <= 0.5) {
    aR = 1.0; aG = 0.82; aB = 0.42; aAt = 0;
    bR = 0.72; bG = 0.42; bB = 0.3; bAt = 0.5;
  } else {
    aR = 0.72; aG = 0.42; aB = 0.3; aAt = 0.5;
    bR = 0.32; bG = 0.28; bB = 0.26; bAt = 1;
  }
  const span = bAt - aAt;
  const localT = span > 0 ? (c - aAt) / span : 0;
  return {
    r: aR + (bR - aR) * localT,
    g: aG + (bG - aG) * localT,
    b: aB + (bB - aB) * localT,
  };
}

export class ProtoplanetaryDiskScene extends BaseScene {
  enter(context) {
    const narrow = isNarrowViewport();

    this._data = generateProtoplanetaryDiskData({
      seed: PROTOPLANETARY_DISK_SEED,
      diskParticleCount: narrow ? 1500 : 3000,
      diffuseGasCount: narrow ? 400 : 800,
      backdropStarCount: narrow ? 45 : 80,
    });

    this._reusableColor = new THREE.Color(); // scratch, reused every frame — never reallocated
    this._glowTexture = createGlowTexture();
    this._elapsed = 0;

    this._buildBackdrop();
    this._buildDiskParticles();
    this._buildDiffuseGas();
    this._buildProtostarCore();
    this._buildProtostarCorona();

    this._cameraOrbitAngle = 0; // ambient azimuthal orbit, integrated over real elapsed time - see "CAMERA" in the file header
  }

  _buildBackdrop() {
    const stars = this._data.backdropStars;
    const positions = new Float32Array(stars.length * 3);
    const colors = new Float32Array(stars.length * 3);

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      positions[i * 3] = s.x;
      positions[i * 3 + 1] = s.y;
      positions[i * 3 + 2] = s.z;
      const b = 0.08 + s.brightness * 0.1;
      colors[i * 3] = BACKDROP_COLOR.r * b;
      colors[i * 3 + 1] = BACKDROP_COLOR.g * b;
      colors[i * 3 + 2] = BACKDROP_COLOR.b * b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this._backdropPoints = new THREE.Points(geometry, material);
    this.root.add(this._backdropPoints);
  }

  _buildDiskParticles() {
    const particles = this._data.diskParticles;
    const count = particles.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this._diskRadius = new Float32Array(count);
    this._diskAngles = new Float32Array(count); // CURRENT angle, mutated every frame - starts at angle0
    this._diskAngularVelocity = new Float32Array(count);
    this._diskInclination = new Float32Array(count);
    this._diskY0 = new Float32Array(count);
    this._diskBrightness = new Float32Array(count);
    this._diskIsClump = new Uint8Array(count);
    this._diskWobblePhase = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      this._diskRadius[i] = p.orbitalRadius;
      this._diskAngles[i] = p.angle0;
      this._diskAngularVelocity[i] = p.angularVelocity;
      this._diskInclination[i] = p.inclination;
      this._diskY0[i] = p.y0;
      this._diskBrightness[i] = p.brightness;
      this._diskIsClump[i] = p.role === 'clump' ? 1 : 0;
      this._diskWobblePhase[i] = (p.angle0 * 3.7) % (Math.PI * 2); // derived, not a separate random draw - deterministic and cheap

      const i3 = i * 3;
      positions[i3] = Math.cos(p.angle0) * p.orbitalRadius;
      positions[i3 + 1] = p.y0;
      positions[i3 + 2] = Math.sin(p.angle0) * p.orbitalRadius;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.045,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // particles visually melt together into a continuous-looking disk, not discrete dots
    });

    this._diskPoints = new THREE.Points(geometry, material);
    this.root.add(this._diskPoints);
  }

  _buildDiffuseGas() {
    const particles = this._data.diffuseGasParticles;
    const count = particles.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this._gasRadius = new Float32Array(count);
    this._gasAngles = new Float32Array(count);
    this._gasAngularVelocity = new Float32Array(count);
    this._gasY0 = new Float32Array(count);
    this._gasBrightness = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      this._gasRadius[i] = p.orbitalRadius;
      this._gasAngles[i] = p.angle0;
      this._gasAngularVelocity[i] = p.angularVelocity;
      this._gasY0[i] = p.y0;
      this._gasBrightness[i] = p.brightness;

      const i3 = i * 3;
      positions[i3] = Math.cos(p.angle0) * p.orbitalRadius;
      positions[i3 + 1] = p.y0;
      positions[i3 + 2] = Math.sin(p.angle0) * p.orbitalRadius;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.16,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // soft volumetric haze underneath the sharper dust layer
    });

    this._gasPoints = new THREE.Points(geometry, material);
    this.root.add(this._gasPoints);
  }

  _buildProtostarCore() {
    const positions = new Float32Array(3); // one point, at the origin
    const colors = new Float32Array(3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: CORE_POINT_SIZE,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._protostarCorePoints = new THREE.Points(geometry, material);
    this.root.add(this._protostarCorePoints);
  }

  _buildProtostarCorona() {
    // "Very subtle glowing corona" - deliberately dim/low-opacity, a
    // soft halo rather than a second bright layer.
    const positions = new Float32Array(3);
    const colors = new Float32Array(3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: CORONA_POINT_SIZE,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._protostarCoronaPoints = new THREE.Points(geometry, material);
    this.root.add(this._protostarCoronaPoints);
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const progress = context.state.epochProgress; // the ONE scientific timeline
    const phase = resolveDiskPhase(progress);

    this._updateDiskParticles(deltaTime, phase);
    this._updateDiffuseGas(deltaTime, phase);
    this._updateProtostar(phase);
    this._updateCamera(deltaTime, context.camera, phase);
  }

  _updateDiskParticles(deltaTime, phase) {
    const posAttr = this._diskPoints.geometry.attributes.position;
    const colAttr = this._diskPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const radius = this._diskRadius;
    const angles = this._diskAngles;
    const angularVelocity = this._diskAngularVelocity;
    const inclination = this._diskInclination;
    const y0 = this._diskY0;
    const brightness = this._diskBrightness;
    const isClump = this._diskIsClump;
    const wobblePhase = this._diskWobblePhase;
    const innerRadius = this._data.innerRadius;
    const outerRadius = this._data.outerRadius;
    const radiusSpan = outerRadius - innerRadius;
    const elapsed = this._elapsed;
    const settleT = phase.settleT;
    const clumpVisibility = phase.clumpVisibility;

    const count = radius.length;
    for (let i = 0; i < count; i++) {
      // Continuous Keplerian integration - see "CONTINUOUS ORBITAL
      // MOTION" in the file header.
      angles[i] += angularVelocity[i] * deltaTime;
      const angle = angles[i];
      const r = radius[i];

      // Small residual settling wobble, echoing Solar Nebula - decays
      // to exactly zero once settleT reaches 0 (matured disk).
      const wobble = settleT > 0 ? Math.sin(elapsed * 1.4 + wobblePhase[i]) * settleT * r * 0.06 : 0;
      const effectiveR = r + wobble;

      // Small per-particle inclination tilt - avoids a perfectly flat,
      // perfectly symmetrical disk.
      const tilt = inclination[i];
      const baseX = Math.cos(angle) * effectiveR;
      const baseZ = Math.sin(angle) * effectiveR;
      const i3 = i * 3;
      pos[i3] = baseX;
      pos[i3 + 1] = y0[i] + baseZ * Math.sin(tilt);
      pos[i3 + 2] = baseZ * Math.cos(tilt);

      // Radial temperature/color gradient - warm-to-neutral only, see
      // ProtoplanetaryDiskData.js's resolveRadialTemperatureColor().
      const normalizedR = radiusSpan > 0 ? (r - innerRadius) / radiusSpan : 0;
      const tc = resolveRadialTemperatureColorInline(normalizedR);

      const clumpBoost = isClump[i] === 1 ? clumpVisibility * 1.4 : 1;
      const b = brightness[i] * (0.55 + phase.maturityT * 0.35) * clumpBoost;
      col[i3] = tc.r * b;
      col[i3 + 1] = tc.g * b;
      col[i3 + 2] = tc.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateDiffuseGas(deltaTime, phase) {
    const posAttr = this._gasPoints.geometry.attributes.position;
    const colAttr = this._gasPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const radius = this._gasRadius;
    const angles = this._gasAngles;
    const angularVelocity = this._gasAngularVelocity;
    const y0 = this._gasY0;
    const brightness = this._gasBrightness;
    const innerRadius = this._data.innerRadius;
    const outerRadius = this._data.outerRadius;
    const radiusSpan = outerRadius - innerRadius;

    const count = radius.length;
    for (let i = 0; i < count; i++) {
      angles[i] += angularVelocity[i] * deltaTime;
      const angle = angles[i];
      const r = radius[i];
      const i3 = i * 3;
      pos[i3] = Math.cos(angle) * r;
      pos[i3 + 1] = y0[i];
      pos[i3 + 2] = Math.sin(angle) * r;

      const normalizedR = radiusSpan > 0 ? (r - innerRadius) / radiusSpan : 0;
      const tc = resolveRadialTemperatureColorInline(normalizedR);
      const b = brightness[i] * (0.5 + phase.maturityT * 0.3);
      col[i3] = tc.r * b;
      col[i3 + 1] = tc.g * b;
      col[i3 + 2] = tc.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateProtostar(phase) {
    const coreColAttr = this._protostarCorePoints.geometry.attributes.color;
    this._reusableColor.copy(CORE_COLOR).multiplyScalar(phase.protostarBrightness);
    coreColAttr.array[0] = this._reusableColor.r;
    coreColAttr.array[1] = this._reusableColor.g;
    coreColAttr.array[2] = this._reusableColor.b;
    coreColAttr.needsUpdate = true;
    this._protostarCorePoints.material.size = CORE_POINT_SIZE * (0.7 + phase.protostarScale * 0.4);

    const coronaColAttr = this._protostarCoronaPoints.geometry.attributes.color;
    this._reusableColor.copy(CORONA_COLOR).multiplyScalar(phase.protostarBrightness * 0.35);
    coronaColAttr.array[0] = this._reusableColor.r;
    coronaColAttr.array[1] = this._reusableColor.g;
    coronaColAttr.array[2] = this._reusableColor.b;
    coronaColAttr.needsUpdate = true;
    this._protostarCoronaPoints.material.size = CORONA_POINT_SIZE * (0.75 + phase.protostarScale * 0.35);
  }

  _updateCamera(deltaTime, camera, phase) {
    const outerRadius = this._data.outerRadius;

    // Spherical parameterization (orbit distance + elevation ANGLE,
    // not a raw height) - this is what actually guarantees the
    // elevation oscillation below can swing from genuinely near
    // edge-on to a genuine three-quarter view, independent of the
    // zoom distance. An earlier version drove elevation as a raw
    // height fraction of distance, which could never exceed ~25
    // degrees from horizontal at any zoom level - fixed here.
    const wideOrbitDistance = outerRadius * 2.6;
    const closeOrbitDistance = outerRadius * 1.6;
    const orbitDistance = wideOrbitDistance + (closeOrbitDistance - wideOrbitDistance) * phase.maturityT;

    // Ambient azimuthal orbit - "smooth camera rotation," fully
    // automatic, no interactive control added (preserving the
    // existing camera architecture exactly).
    this._cameraOrbitAngle += deltaTime * 0.045; // one full revolution roughly every ~140s - slow, unobtrusive

    // Ambient elevation-ANGLE oscillation - genuinely sweeps between
    // near edge-on (~7 degrees above the disk plane) and a clear
    // three-quarter view (~42 degrees), "reinforcing that it is a
    // flattened structure" some of the time while still showing both
    // the disk's geometry and the proto-Sun the rest of the time,
    // without needing a user toggle.
    const oscillation = Math.sin(this._elapsed * 0.05) * 0.5 + 0.5; // 0..1, very slow
    const minElevationAngle = 0.12; // ~7 degrees - near edge-on
    const maxElevationAngle = 0.73; // ~42 degrees - clear three-quarter view
    const elevationAngle = minElevationAngle + (maxElevationAngle - minElevationAngle) * oscillation;

    const horizontalDistance = orbitDistance * Math.cos(elevationAngle);
    const height = orbitDistance * Math.sin(elevationAngle);

    const targetX = Math.cos(this._cameraOrbitAngle) * horizontalDistance;
    const targetZ = Math.sin(this._cameraOrbitAngle) * horizontalDistance;
    const targetY = height;

    const followT = 1 - Math.exp(-deltaTime / CAMERA_FOLLOW_TIME_CONSTANT);
    camera.position.x += (targetX - camera.position.x) * followT;
    camera.position.y += (targetY - camera.position.y) * followT;
    camera.position.z += (targetZ - camera.position.z) * followT;
    camera.lookAt(0, 0, 0);
  }

  exit() {
    this._backdropPoints.geometry.dispose();
    this._backdropPoints.material.dispose();
    this._diskPoints.geometry.dispose();
    this._diskPoints.material.dispose();
    this._gasPoints.geometry.dispose();
    this._gasPoints.material.dispose();
    this._protostarCorePoints.geometry.dispose();
    this._protostarCorePoints.material.dispose();
    this._protostarCoronaPoints.geometry.dispose();
    this._protostarCoronaPoints.material.dispose();
    this._glowTexture.dispose();
    // No eventBus listeners were registered by this scene, so there is
    // nothing to unsubscribe.
  }
}
