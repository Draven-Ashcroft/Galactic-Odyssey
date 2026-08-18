/**
 * scenes/epochs/EarlyUniverseScene.js
 * ------------------------------------------------------------------
 * The dedicated scene for BOTH 'early-universe' AND 'expansion-cooling'
 * — sceneRegistry.js maps both epoch ids to this SAME class. That's
 * intentional, not a shortcut: the task these two epochs describe is
 * one continuous physical process (hot/dense -> expansion -> cooling)
 * that the existing 13-epoch array happens to split across two epoch
 * slots for pacing/narrative reasons. Reusing one class for both keeps
 * that continuity honest — see "CONTINUITY ACROSS THE EPOCH BOUNDARY"
 * below for exactly how a smooth visual result survives the scene
 * instance being torn down and rebuilt at the boundary.
 *
 * Follows the standard enter()/update()/exit() contract from BaseScene
 * exactly — `this.root` is the THREE.Group BaseScene's constructor
 * already creates; nothing here creates a second THREE.Scene or
 * THREE.Camera, and SceneManager remains solely responsible for
 * adding/removing `this.root`.
 *
 * THE CENTRAL SCIENTIFIC RULE — HOW THIS AVOIDS "EXPLOSION FROM A POINT":
 * Every particle is seeded once, uniformly throughout the whole volume
 * (see EarlyUniverseData.js) — never emitted from, or biased toward,
 * the origin. Each frame, a particle's rendered position is:
 *
 *     renderedPosition = particle.comovingPosition * visualScaleFactor
 *
 * computed independently for every particle from ITS OWN original
 * position. That is metric expansion (every pair of particles recedes
 * from every other pair, proportionally to their own separation) —
 * NOT an explosion (which would mean every particle moving radially
 * outward from a shared origin with its own individual velocity).
 * Visually, points do still appear to recede from the world origin —
 * but that's just because the origin is where the "camera" happens to
 * sit, not because it's a privileged center in the model; an observer
 * riding on any other particle would see exactly the same pattern
 * relative to themselves. Nothing here ever gives a particle a radial
 * velocity or acceleration away from a point.
 *
 * TRUE SCALE FACTOR vs. VISUAL SCALE — WHY THEY'RE NOT THE SAME NUMBER:
 * `context.state.scaleFactor` (from ScaleFactorModel.js) is the
 * scientifically-motivated quantity, and it spans roughly 22 orders of
 * magnitude across these two epochs (~3e-22 to 1). Rendering with that
 * number literally would make the field an invisible point for nearly
 * the entire early-universe epoch, then suddenly "pop" into visibility
 * — which would perceptually read as exactly the sudden-appearance-
 * from-a-point misconception this whole feature exists to avoid, even
 * though the underlying math is smooth and continuous throughout. So
 * rendering uses a separate, monotonic, LOG-space remapping of the
 * true scale factor into a legible `MIN_VISUAL_SCALE..MAX_VISUAL_SCALE`
 * range (`_visualScaleFromTrueScaleFactor()` below) — same technique
 * CosmicTimeController already uses for cosmic time display, applied
 * here for the same reason (values spanning many orders of magnitude
 * need a log-space mapping to stay legible). The TRUE scale factor
 * remains available via SimulationState for anything that wants the
 * real number; only the pixels on screen use the compressed one.
 *
 * CONTINUITY ACROSS THE EPOCH BOUNDARY:
 * `early-universe` and `expansion-cooling` each get their own fresh
 * scene instance (SceneManager tears down and rebuilds at every
 * transition, as it does for every epoch). Both instances use the
 * SAME fixed seed, so they generate IDENTICAL comoving particle
 * positions. Because `context.state.scaleFactor` is itself continuous
 * across the boundary (see ScaleFactorModel.js — it's a function of
 * the always-continuous `cosmicTimeSec`, not of local epoch progress),
 * the rendered result — comoving position * visualScaleFactor(true
 * scaleFactor) — is visually continuous too, even though the JS object
 * holding it was destroyed and recreated in between. No special-casing
 * was needed anywhere else in the architecture for this to work.
 *
 * COSMIC-TIME BEHAVIOR:
 * Particle "activity" (jitter amplitude/frequency) and color both
 * derive from `context.state.cosmicBackgroundTemperatureK` — the
 * ALREADY-COMPUTED existing value (TemperatureModel.js /
 * CosmicTimeController), not a second independent temperature
 * calculation. High temperature -> energetic, white-hot, jittery.
 * Cooling -> calmer, dimmer, shifting toward amber (foreshadowing
 * 'atom-formation's own accent color as this stage ends).
 *
 * PERFORMANCE:
 * One THREE.Points/BufferGeometry for the whole field (~2,200 desktop
 * / ~1,100 mobile particles). Comoving positions are pre-allocated
 * once in enter() and never reallocated; update() only rewrites the
 * existing position/color typed arrays in place.
 *
 * ARCHITECTURAL BOUNDARIES:
 * This scene never calls simulationState.set(...) — scaleFactor is
 * computed by CosmicTimeController/ScaleFactorModel.js and only READ
 * here via context.state, preserving the existing one-way data flow.
 */
import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { generateEarlyUniverseField } from './EarlyUniverseData.js';
import { EPOCHS } from '../../data/epochs.js';
import { resolveScaleFactor } from '../../core/ScaleFactorModel.js';
import { clamp, lerp, inverseLogLerp } from '../../utils/mathUtils.js';

const SEED = 90000001; // fixed and SHARED across both epoch instances - see file header on continuity
const HALF_EXTENT = 6; // smaller than later large-structure scenes (9) - this stage is compact, not cosmic-web-scale
const PARTICLE_COUNT_DESKTOP = 2200;
const PARTICLE_COUNT_MOBILE = 1100;

const HOT_COLOR = new THREE.Color('#eaf2ff'); // white-hot
const COOL_COLOR = new THREE.Color('#ff8a5c'); // amber - matches 'atom-formation's own accent, foreshadowing it

// Visual-space scale range - see "TRUE SCALE FACTOR vs. VISUAL SCALE" above.
const MIN_VISUAL_SCALE = 0.22; // field starts compact but still a clearly populated, dense volume - never an invisible point
const MAX_VISUAL_SCALE = 1.0;

const EARLY_UNIVERSE_EPOCH = EPOCHS.find((e) => e.id === 'early-universe');
const EXPANSION_COOLING_EPOCH = EPOCHS.find((e) => e.id === 'expansion-cooling');
const TRUE_SCALE_FACTOR_AT_START = resolveScaleFactor(EARLY_UNIVERSE_EPOCH.tStartSec);
const TRUE_SCALE_FACTOR_AT_END = resolveScaleFactor(EXPANSION_COOLING_EPOCH.tEndSec);
// Temperature bounds for particle-energy normalization, read from the
// data model (never hardcoded) - covers the combined span of both epochs.
const ENERGY_TEMP_HOT_K = EARLY_UNIVERSE_EPOCH.cosmicBackgroundTempStartK;
const ENERGY_TEMP_COOL_K = EXPANSION_COOLING_EPOCH.cosmicBackgroundTempEndK;

/** Cheap, one-time mobile heuristic — matches the project's own 640px CSS breakpoint. */
function isNarrowViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

/** Log-space remap of the true (astronomically-ranged) scale factor into a legible render-space range. */
function visualScaleFromTrueScaleFactor(trueScaleFactor) {
  const clamped = clamp(trueScaleFactor, TRUE_SCALE_FACTOR_AT_START, TRUE_SCALE_FACTOR_AT_END);
  const t = inverseLogLerp(TRUE_SCALE_FACTOR_AT_START, TRUE_SCALE_FACTOR_AT_END, clamped);
  return lerp(MIN_VISUAL_SCALE, MAX_VISUAL_SCALE, clamp(t, 0, 1));
}

export class EarlyUniverseScene extends BaseScene {
  enter(context) {
    const narrow = isNarrowViewport();
    this._particles = generateEarlyUniverseField({
      seed: SEED,
      halfExtent: HALF_EXTENT,
      particleCount: narrow ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP,
    });
    this._buildPoints();
    this._elapsed = 0;
  }

  _buildPoints() {
    const n = this._particles.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    this._comoving = new Float32Array(n * 3); // fixed comoving coordinates - set once, never mutated
    this._jitterPhase = new Float32Array(n);
    this._jitterAxis = new Float32Array(n * 3);
    this._brightness = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const p = this._particles[i];
      const i3 = i * 3;
      this._comoving[i3] = p.x;
      this._comoving[i3 + 1] = p.y;
      this._comoving[i3 + 2] = p.z;
      this._jitterPhase[i] = p.jitterPhase;
      this._jitterAxis[i3] = p.jitterAxisX;
      this._jitterAxis[i3 + 1] = p.jitterAxisY;
      this._jitterAxis[i3 + 2] = p.jitterAxisZ;
      this._brightness[i] = p.brightness;

      positions[i3] = p.x * MIN_VISUAL_SCALE;
      positions[i3 + 1] = p.y * MIN_VISUAL_SCALE;
      positions[i3 + 2] = p.z * MIN_VISUAL_SCALE;
      colors[i3] = HOT_COLOR.r;
      colors[i3 + 1] = HOT_COLOR.g;
      colors[i3 + 2] = HOT_COLOR.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this._points = new THREE.Points(geometry, material);
    this.root.add(this._points);
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const { state } = context;

    // scaleFactor: read from SimulationState, computed by
    // CosmicTimeController/ScaleFactorModel.js - never recomputed here.
    const trueScaleFactor = state.scaleFactor ?? TRUE_SCALE_FACTOR_AT_START;
    const visualScale = visualScaleFromTrueScaleFactor(trueScaleFactor);

    // Particle energy: derived from the ALREADY-COMPUTED cosmic
    // background temperature, not a second independent calculation.
    // 1 = hottest (epoch start), 0 = coolest (epoch1 end).
    const energyT = clamp(
      inverseLogLerp(ENERGY_TEMP_COOL_K, ENERGY_TEMP_HOT_K, clamp(state.cosmicBackgroundTemperatureK, ENERGY_TEMP_COOL_K, ENERGY_TEMP_HOT_K)),
      0,
      1
    );

    this._updatePositions(visualScale, energyT);
    this.root.rotation.y = this._elapsed * 0.01; // slow ambient rotation for depth cues, subtle
  }

  _updatePositions(visualScale, energyT) {
    const posAttr = this._points.geometry.attributes.position;
    const colAttr = this._points.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const comoving = this._comoving;
    const phases = this._jitterPhase;
    const axes = this._jitterAxis;
    const brightness = this._brightness;

    // Color blend is the SAME for every particle this frame (only
    // brightness varies per-particle) - compute it once outside the
    // loop rather than doing a THREE.Color allocation/lerp per particle.
    const blend = 1 - energyT; // 0 = hottest/whitest, 1 = coolest/amber-est
    const colorR = HOT_COLOR.r + (COOL_COLOR.r - HOT_COLOR.r) * blend;
    const colorG = HOT_COLOR.g + (COOL_COLOR.g - HOT_COLOR.g) * blend;
    const colorB = HOT_COLOR.b + (COOL_COLOR.b - HOT_COLOR.b) * blend;

    // "High visual activity" when hot, calming as the universe cools -
    // a rendering stand-in for thermal motion, not a velocity simulation.
    const jitterAmplitude = 0.05 * energyT;
    const jitterFreq = 3 + energyT * 6;

    const n = brightness.length;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;

      // THE key line: every particle scales from ITS OWN comoving
      // position - see the file header for why that's expansion, not
      // an explosion.
      const baseX = comoving[i3] * visualScale;
      const baseY = comoving[i3 + 1] * visualScale;
      const baseZ = comoving[i3 + 2] * visualScale;

      const wobble = Math.sin(this._elapsed * jitterFreq + phases[i]) * jitterAmplitude;
      pos[i3] = baseX + axes[i3] * wobble;
      pos[i3 + 1] = baseY + axes[i3 + 1] * wobble;
      pos[i3 + 2] = baseZ + axes[i3 + 2] * wobble;

      const b = brightness[i] * (0.55 + energyT * 0.45);
      col[i3] = colorR * b;
      col[i3 + 1] = colorG * b;
      col[i3 + 2] = colorB * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  exit() {
    this._points.geometry.dispose();
    this._points.material.dispose();
    // No textures were created. No eventBus listeners were registered
    // by this scene, so there is nothing to unsubscribe.
  }
}
