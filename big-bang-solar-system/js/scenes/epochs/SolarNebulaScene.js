/**
 * scenes/epochs/SolarNebulaScene.js
 * ------------------------------------------------------------------
 * The Solar Nebula Formation epoch's dedicated scene, replacing
 * PlaceholderScene for 'solar-nebula' in sceneRegistry.js. Follows the
 * standard enter()/update()/exit() contract from BaseScene exactly —
 * `this.root` is the THREE.Group BaseScene's constructor already
 * creates; nothing here creates a second THREE.Scene or THREE.Camera,
 * and SceneManager remains solely responsible for adding/removing
 * `this.root`. This file does not modify MilkyWayScene.js or any
 * other epoch's scene.
 *
 * SCIENTIFIC PURPOSE (stylized, not a hydrodynamic simulation):
 * A diffuse, irregular fragment of a molecular cloud collapses under
 * its own gravity. As it contracts, conservation of angular momentum
 * makes it spin increasingly fast and flatten into a broad rotating
 * structure — the solar nebula — with most infalling material
 * concentrating into a dense central protosun while the rest settles
 * into the surrounding disk. This epoch intentionally stops short of
 * a mature, organized protoplanetary disk (see PHASE 4 in the
 * originating spec) and creates no planets or planetesimals — those
 * are later epochs' subjects.
 *
 * COSMIC-TIME BEHAVIOR:
 * Everything is driven by `context.state.epochProgress` (0..1) — no
 * second timeline. Unlike Dark Ages/First Stars/Galaxy Formation
 * (each a POPULATION of independently-staggered sites), this is one
 * continuous, single-object collapse: the whole epoch's progress
 * drives one shared timeline via `resolveNebulaPhase()` in
 * SolarNebulaData.js, kept there so the phase math is testable
 * without Three.js.
 *
 * BULK ROTATION: the nebula's "increasing rotation as it flattens" is
 * rendered as one accumulated rotation angle (`this._nebulaAngle`),
 * integrated every frame from `phase.angularVelocity` (which itself
 * increases with collapse — see SolarNebulaData.js's "BULK ROTATION"
 * note) and applied to every particle's position AFTER its own
 * origin->target+swirl motion. This is a visually convincing
 * simplified model, not a precise angular-momentum calculation.
 *
 * PROTOSUN: rendered as layered glow-sprite THREE.Points (core + soft
 * glow), the SAME technique FirstStarsScene.js's recent visual
 * redesign uses — a small soft-radial-gradient CanvasTexture, additive
 * blending, no polygon geometry at all. `createGlowTexture()` below is
 * deliberately a SEPARATE, near-identical copy of FirstStarsScene.js's
 * own function rather than a shared import — consistent with this
 * codebase's established precedent (e.g. Dark Ages/First Stars
 * duplicate their shared backdrop seed/params rather than importing
 * from one another) of not coupling independent epoch scenes together
 * just to save a few lines. The "subtle accretion-like material" the
 * spec asks for is the 'core'-role particles themselves, streaming
 * inward — not a separate decorative layer.
 *
 * PERFORMANCE:
 * One shared THREE.Points/BufferGeometry for all ~2,200 cloud
 * particles (one draw call, both 'disk' and 'core' roles share the
 * same buffer, distinguished only by their precomputed target
 * position), a small static backdrop layer, and two small Points
 * layers for the protosun's core/glow — all typed arrays allocated
 * once in enter() and mutated in place in update(). No per-object Mesh
 * instances anywhere, no per-frame allocation.
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
import { generateSolarNebulaData, resolveNebulaPhase, SWIRL_TURNS } from './SolarNebulaData.js';

const SOLAR_NEBULA_SEED = 29100001; // fixed -> same structure every load
const BACKDROP_COLOR = new THREE.Color('#7a8bb0'); // dim, desaturated — distant galactic context, not the subject
const CLOUD_COLOR_COOL = new THREE.Color('#8fa8d9'); // cool blue-grey - diffuse, still-cold gas/dust
const CLOUD_COLOR_WARM = new THREE.Color('#ffcf9e'); // warm - gas nearer the forming protosun, gently heated
const CORE_COLOR = new THREE.Color('#fff6e8'); // near-white-warm hot protostellar core
const CAMERA_FOLLOW_TIME_CONSTANT = 1.1; // per-frame damping speed while blending the camera target with collapse

const CORE_POINT_SIZE = 0.22;
const GLOW_POINT_SIZE = 0.85;

/** Cheap, one-time mobile heuristic — matches the project's own 640px CSS breakpoint. */
function isNarrowViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

/**
 * A small (64x64), soft, white-to-transparent radial gradient — same
 * technique as FirstStarsScene.js's own `createGlowTexture()`,
 * deliberately duplicated rather than shared (see file header).
 * Generated once per scene instance in enter(), disposed in exit().
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

export class SolarNebulaScene extends BaseScene {
  enter(context) {
    const narrow = isNarrowViewport();

    this._data = generateSolarNebulaData({
      seed: SOLAR_NEBULA_SEED,
      cloudParticleCount: narrow ? 1100 : 2200,
      backdropStarCount: narrow ? 55 : 90,
    });

    this._reusableColor = new THREE.Color(); // scratch, reused every frame — never reallocated
    this._glowTexture = createGlowTexture();
    this._nebulaAngle = 0; // accumulated bulk-rotation angle, integrated over real elapsed time each frame

    this._buildBackdrop();
    this._buildCloudParticles();
    this._buildProtosunCore();
    this._buildProtosunGlow();

    this._elapsed = 0;
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

  _buildCloudParticles() {
    const particles = this._data.particles;
    const count = particles.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this._cloudOrigins = new Float32Array(count * 3);
    this._cloudTargets = new Float32Array(count * 3);
    this._cloudBasisU = new Float32Array(count * 3);
    this._cloudBasisV = new Float32Array(count * 3);
    this._cloudSwirlPhase = new Float32Array(count);
    this._cloudSwirlDirection = new Float32Array(count);
    this._cloudSwirlAmplitude = new Float32Array(count);
    this._cloudBrightness = new Float32Array(count);
    this._cloudIsCore = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const i3 = i * 3;
      this._cloudOrigins[i3] = p.originX;
      this._cloudOrigins[i3 + 1] = p.originY;
      this._cloudOrigins[i3 + 2] = p.originZ;
      this._cloudTargets[i3] = p.targetX;
      this._cloudTargets[i3 + 1] = p.targetY;
      this._cloudTargets[i3 + 2] = p.targetZ;
      this._cloudBasisU[i3] = p.basisUX;
      this._cloudBasisU[i3 + 1] = p.basisUY;
      this._cloudBasisU[i3 + 2] = p.basisUZ;
      this._cloudBasisV[i3] = p.basisVX;
      this._cloudBasisV[i3 + 1] = p.basisVY;
      this._cloudBasisV[i3 + 2] = p.basisVZ;
      this._cloudSwirlPhase[i] = p.swirlPhase;
      this._cloudSwirlDirection[i] = p.swirlDirection;
      this._cloudSwirlAmplitude[i] = p.swirlAmplitude;
      this._cloudBrightness[i] = p.brightness;
      this._cloudIsCore[i] = p.role === 'core' ? 1 : 0;

      positions[i3] = p.originX;
      positions[i3 + 1] = p.originY;
      positions[i3 + 2] = p.originZ;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.075,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // soft volumetric gas/dust glow, not hard dots
    });

    this._cloudPoints = new THREE.Points(geometry, material);
    this.root.add(this._cloudPoints);
  }

  _buildProtosunCore() {
    const positions = new Float32Array(3); // one point, at the origin (the collapse center)
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
    this._protosunCorePoints = new THREE.Points(geometry, material);
    this.root.add(this._protosunCorePoints);
  }

  _buildProtosunGlow() {
    const positions = new Float32Array(3);
    const colors = new Float32Array(3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: GLOW_POINT_SIZE,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._protosunGlowPoints = new THREE.Points(geometry, material);
    this.root.add(this._protosunGlowPoints);
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const progress = context.state.epochProgress; // the ONE scientific timeline
    const phase = resolveNebulaPhase(progress);

    // Integrate the current angular velocity into an accumulated bulk-
    // rotation angle - see "BULK ROTATION" in the file header.
    this._nebulaAngle += phase.angularVelocity * deltaTime;

    this._updateCloudParticles(phase);
    this._updateProtosun(phase);
    this._updateCamera(deltaTime, context.camera, phase);
  }

  _updateCloudParticles(phase) {
    const posAttr = this._cloudPoints.geometry.attributes.position;
    const colAttr = this._cloudPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const origins = this._cloudOrigins;
    const targets = this._cloudTargets;
    const basisU = this._cloudBasisU;
    const basisV = this._cloudBasisV;
    const swirlPhase = this._cloudSwirlPhase;
    const swirlDirection = this._cloudSwirlDirection;
    const swirlAmplitude = this._cloudSwirlAmplitude;
    const brightness = this._cloudBrightness;
    const isCore = this._cloudIsCore;
    const t = phase.collapseT;
    const cosA_bulk = Math.cos(this._nebulaAngle);
    const sinA_bulk = Math.sin(this._nebulaAngle);

    // Same spiral-collapse formula as DarkAgesScene.js/
    // FirstStarsScene.js's particle updates (see those files' comments
    // for why this is inlined rather than calling a per-point function
    // that returns an object - same reasoning applies here at ~2200
    // particles/frame). SolarNebulaData.js is the source of truth for
    // this formula; keep both in sync if it ever changes.
    const count = brightness.length;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      const baseX = origins[i3] + (targets[i3] - origins[i3]) * t;
      const baseY = origins[i3 + 1] + (targets[i3 + 1] - origins[i3 + 1]) * t;
      const baseZ = origins[i3 + 2] + (targets[i3 + 2] - origins[i3 + 2]) * t;

      const bump = 4 * t * (1 - t); // 0 at t=0 and t=1, peaks at t=0.5
      const windAngle = swirlPhase[i] + swirlDirection[i] * t * SWIRL_TURNS * Math.PI * 2;
      const swirlR = swirlAmplitude[i] * bump;
      const cosA = Math.cos(windAngle);
      const sinA = Math.sin(windAngle);

      const swirledX = baseX + (cosA * basisU[i3] + sinA * basisV[i3]) * swirlR;
      const swirledY = baseY + (cosA * basisU[i3 + 1] + sinA * basisV[i3 + 1]) * swirlR;
      const swirledZ = baseZ + (cosA * basisU[i3 + 2] + sinA * basisV[i3 + 2]) * swirlR;

      // Bulk rotation around the Y axis - applied AFTER the particle's
      // own origin->target+swirl motion, see "BULK ROTATION" above.
      pos[i3] = swirledX * cosA_bulk - swirledZ * sinA_bulk;
      pos[i3 + 1] = swirledY;
      pos[i3 + 2] = swirledX * sinA_bulk + swirledZ * cosA_bulk;

      // Color: cool diffuse gas early on, gently warming as the
      // nebula concentrates (nearer the forming protosun); core-role
      // particles (infalling accretion material) run a bit brighter
      // and warmer than disk particles at the same progress.
      const warmth = isCore[i] === 1 ? Math.min(1, t * 1.3) : t * 0.55;
      this._reusableColor.copy(CLOUD_COLOR_COOL).lerp(CLOUD_COLOR_WARM, warmth);
      const b = brightness[i] * (0.5 + t * 0.6) * (isCore[i] === 1 ? 1.15 : 1);
      col[i3] = this._reusableColor.r * b;
      col[i3 + 1] = this._reusableColor.g * b;
      col[i3 + 2] = this._reusableColor.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateProtosun(phase) {
    // Core: intensely bright, small, near-white-warm.
    const coreColAttr = this._protosunCorePoints.geometry.attributes.color;
    this._reusableColor.copy(CORE_COLOR).multiplyScalar(phase.protosunBrightness);
    coreColAttr.array[0] = this._reusableColor.r;
    coreColAttr.array[1] = this._reusableColor.g;
    coreColAttr.array[2] = this._reusableColor.b;
    coreColAttr.needsUpdate = true;
    // Apparent size comes from brightness (see FirstStarsScene.js's
    // established reasoning - PointsMaterial.size is material-wide,
    // not per-point), but the core ALSO gets a modest literal size
    // change here since there's only ONE point in this layer (no
    // cross-star inconsistency risk the way there would be with
    // multiple simultaneous stars sharing one material).
    this._protosunCorePoints.material.size = CORE_POINT_SIZE * (0.3 + phase.protosunScale * 0.85);

    // Glow: softer, warm, surrounding halo.
    const glowColAttr = this._protosunGlowPoints.geometry.attributes.color;
    this._reusableColor.copy(CLOUD_COLOR_WARM).lerp(CORE_COLOR, 0.4).multiplyScalar(phase.protosunBrightness * 0.6);
    glowColAttr.array[0] = this._reusableColor.r;
    glowColAttr.array[1] = this._reusableColor.g;
    glowColAttr.array[2] = this._reusableColor.b;
    glowColAttr.needsUpdate = true;
    this._protosunGlowPoints.material.size = GLOW_POINT_SIZE * (0.35 + phase.protosunScale * 0.9);
  }

  _updateCamera(deltaTime, camera, phase) {
    const cloudRadius = this._data.cloudRadius;
    // Wide whole-cloud view, blending toward a closer nebula-scale
    // framing as collapse progresses - both recomputed fresh every
    // frame from collapseT, then approached via per-frame damping
    // (same technique GalaxyFormationScene.js's close-up mode and
    // MilkyWayScene.js already use, since the target here changes
    // continuously rather than being one stationary destination).
    const wideX = 0;
    const wideY = cloudRadius * 0.9;
    const wideZ = cloudRadius * 2.2;
    const closeX = 0;
    const closeY = cloudRadius * 0.32;
    const closeZ = cloudRadius * 0.85;

    const t = phase.collapseT;
    const targetX = wideX + (closeX - wideX) * t;
    const targetY = wideY + (closeY - wideY) * t;
    const targetZ = wideZ + (closeZ - wideZ) * t;

    const followT = 1 - Math.exp(-deltaTime / CAMERA_FOLLOW_TIME_CONSTANT);
    camera.position.x += (targetX - camera.position.x) * followT;
    camera.position.y += (targetY - camera.position.y) * followT;
    camera.position.z += (targetZ - camera.position.z) * followT;
    camera.lookAt(0, 0, 0);
  }

  exit() {
    this._backdropPoints.geometry.dispose();
    this._backdropPoints.material.dispose();
    this._cloudPoints.geometry.dispose();
    this._cloudPoints.material.dispose();
    this._protosunCorePoints.geometry.dispose();
    this._protosunCorePoints.material.dispose();
    this._protosunGlowPoints.geometry.dispose();
    this._protosunGlowPoints.material.dispose();
    this._glowTexture.dispose();
    // No eventBus listeners were registered by this scene, so there is
    // nothing to unsubscribe.
  }
}
