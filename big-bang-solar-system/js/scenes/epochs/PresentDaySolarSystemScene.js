/**
 * scenes/epochs/PresentDaySolarSystemScene.js
 * ------------------------------------------------------------------
 * The final epoch's dedicated scene, replacing PlaceholderScene for
 * 'present-day' in sceneRegistry.js. Follows the standard
 * enter()/update()/exit() contract from BaseScene exactly — `this.root`
 * is the THREE.Group BaseScene's constructor already creates; nothing
 * here creates a second THREE.Scene or THREE.Camera, and SceneManager
 * remains solely responsible for adding/removing `this.root`. This
 * file does not modify any other epoch's scene, the timeline, the
 * state machine, or CameraManager.
 *
 * SCIENTIFIC PURPOSE (an educational visual approximation, explicitly
 * NOT a physically accurate N-body accretion simulation): eight
 * planetesimals grow into the eight planets through accretion, never
 * an explosion, settling into the Solar System we see today. See
 * PresentDaySolarSystemData.js's file header for the full data-model
 * reasoning (the four particle populations, the accretion-blend
 * technique, the heating curve).
 *
 * ONE CONTINUOUS TIMELINE: `context.state.epochProgress` (0..1) drives
 * everything through `resolvePresentDayPhase()` — planetesimal disk
 * (echoing Planetesimal Formation) -> growth/accretion -> early Solar
 * System -> cinematic cleanup -> present-day stable state. No second
 * clock; the "FORM PLANETS" button (see "INTERACTIVE CAMERA FOCUS"
 * below) never gates or alters this timeline, only the camera.
 *
 * RECOGNIZABLE PLANET APPEARANCE: the 8 planet-seed meshes use a
 * smooth `THREE.SphereGeometry` with a procedurally-generated,
 * stylized canvas texture (`createPlanetTexture()` below - same
 * "draw it with 2D canvas at runtime, no downloaded assets"
 * technique `createGlowTexture()` already established) instead of
 * the irregular rock geometry - a highly lobed/irregular surface
 * would distort an equirectangular texture unpredictably (bands
 * would look wavy, continents stretched), and the goal here is
 * specifically "visually recognizable... scientifically grounded
 * characteristics" for the FINAL planets, not an asteroid-like
 * shape. This does NOT affect "preserve the existing planetesimal
 * appearance" - that requirement is about the smaller, far more
 * numerous feed/belt/debris populations elsewhere in this file,
 * which are completely unchanged and still use
 * `createIrregularRockGeometry()` exactly as before. Saturn/Uranus
 * additionally get a `THREE.RingGeometry` ring, tilted to read as a
 * genuine ellipse from this scene's own camera angles rather than an
 * edge-on line.
 *
 * GATED FORMATION, NOT AMBIENT: nothing in this scene collides, grows,
 * or heats up until "FORM PLANETS" has been clicked at least once -
 * before that, `localProgress` (the ONLY progress value fed into
 * `resolvePresentDayPhase()`/`resolveSeedHeat()`) stays pinned at 0,
 * so feed planetesimals simply orbit freely and the 8 seeds stay
 * indistinguishable from any other planetesimal. This is a
 * deliberate, later revision away from this scene's own earlier
 * design (where growth advanced automatically from `epochProgress`
 * alone, with the button only adding a temporary boost on top) - the
 * button is now the actual trigger for the sequence, not just an
 * accelerant for something already happening in the background.
 * `context.state.epochProgress` (the real, authoritative epoch
 * timeline) is READ once per frame only to know we're in this epoch
 * at all - it never drives pacing here, so scrubbing the outer
 * timeline without ever pressing the button leaves this scene at its
 * "just planetesimals" starting state regardless of how far epoch
 * progress has advanced.
 *
 * Once clicked, `_postClickElapsed` (a dedicated local timer,
 * completely separate from `epochProgress`) starts counting up,
 * scaled by `context.state.playbackSpeed` - the SAME global speed
 * control every other part of this app already respects, satisfying
 * the originating spec's own "slow enough to observe even at 0.5x"
 * requirement directly. `localProgress = postClickElapsed /
 * POST_CLICK_SEQUENCE_DURATION` then drives the entire rest of the
 * sequence exactly as before (growth, heating, debris cleanup, ring
 * reveal). A temporary rotational-energy burst (`rotationBoost` in
 * `update()`) rises and falls entirely within the EARLY part of this
 * same post-click window - framed as part of the same triggering
 * event that starts collisions, deliberately never as its literal
 * cause (per the originating spec's own caveat: this is a visual
 * time-lapse device, not a physical claim that faster spin causes
 * accretion).
 *
 * Clicking FORM PLANETS again after the sequence has already started
 * does NOT restart or re-trigger it (`_hasFormedPlanets` only ever
 * flips true, once) - repeated clicks only affect the cinematic
 * camera focus (see "INTERACTIVE CAMERA FOCUS" below), same as
 * before.
 *
 * Planet selection (tap-to-zoom) only responds once
 * `_hasFormedPlanets` is true - see `_handleCanvasTap()` - matching
 * "later... should be clickable": tapping one of these bodies before
 * they've actually become planets wouldn't mean anything yet.
 *
 * LABEL TRACKS ITS PLANET: once selected, the small floating label
 * (see "PLANET SELECTION" below) now visibly follows its planet as it
 * keeps orbiting, rather than staying pinned at wherever the original
 * tap happened to land. `_updateSelectedPlanetLabelPosition()` re-
 * projects the selected planet's CURRENT world position to screen
 * space every frame and emits `planet:label-position` for
 * UIManager.js to reposition the (already-visible, already-labeled)
 * element - a lightweight, position-only update, never touching the
 * label's text or visibility, which stay owned by the original
 * `planet:selected`/`planet:deselected` events exactly as before.
 *
 * COLLISION FORMS A CORE, THEN THE CORE ATTRACTS: a later revision
 * from a single smooth "whole body glows warm" heating curve to a
 * genuine two-beat sequence, user-proposed and confirmed before
 * implementing. Beat one: `coreFormT` (in `_updatePlanetSeeds()`)
 * rises FAST — fully formed by `localProgress=0.08`, well before the
 * body has grown at all — representing initial collisions producing
 * a small, bright, hot core. Beat two: `coreVisibility` then fades as
 * `phase.growthT` rises (material accreting into a shell around that
 * core), but never reaches zero — a small residual glow persists even
 * at full growth, since real planets keep a hot interior long after
 * forming. The interior glow-sprite (same soft `createGlowTexture()`
 * technique every luminous object in this project uses) is driven by
 * `coreVisibility`, deliberately capped at a small, non-growing size
 * so it stays reading as "a small hot heart," never scaling up to
 * "the whole planet is glowing." The shell material's own color (the
 * mesh itself) still warms somewhat via `resolveSeedHeat()`'s
 * existing rise-then-fall `heatT`, but at a reduced weight relative
 * to before, so there's a clear visual hierarchy: a distinctly
 * bright core, a moderately warm shell around it. Both curves are
 * derived entirely from `progress`/`phase.growthT`, which are already
 * computed elsewhere for other purposes — no changes to
 * `PresentDaySolarSystemData.js`'s phase-resolution functions were
 * needed for this. At no point does anything scale up suddenly, spawn
 * particles outward, or flash — see `_updatePlanetSeeds()` for
 * exactly how this stays two smooth, overlapping curves rather than
 * any kind of burst.
 *
 * ACCRETION, NOT TELEPORTATION: feed planetesimals blend from a free
 * Kepler orbit toward a small residual scatter around their seed's
 * CURRENT position as growth advances — the same
 * "precompute-the-target, blend-toward-it-smoothly" technique
 * PlanetesimalFormationScene.js's dust-capture already established,
 * independently duplicated here (this project's standing precedent
 * for keeping scenes independent).
 *
 * ROCK APPEARANCE PRESERVED: every planetesimal/planet body in this
 * scene reuses PlanetesimalFormationScene.js's exact coherent-lobe
 * irregular-rock geometry technique (see that file's "GEOMETRY
 * QUALITY FIX" note for why — independent per-vertex noise on a
 * coarse base reads as crumpled paper, not rock) — duplicated here,
 * not imported, and PlanetesimalFormationScene.js itself is untouched
 * (confirmed via exact md5 match). Planets simply SCALE UP the same
 * geometry as they grow, rather than switching to a different shape.
 *
 * PLANET SELECTION (tap/click): reuses GalaxyFormationScene.js's
 * established `input:canvas-tap` + `THREE.Raycaster` pattern exactly
 * (see that file's "GALAXY INTERACTION" note) — this scene does its
 * own raycasting against the 8 individual planet meshes (a trivial
 * count, not InstancedMesh — see "WHY INDIVIDUAL MESHES FOR PLANETS"
 * below) and emits `planet:selected`/`planet:deselected` for
 * UIManager.js to render a small label near the tap point. Tapping
 * empty space deselects, exactly like the galaxy panel's own behavior.
 *
 * WHY INDIVIDUAL MESHES FOR PLANETS (not InstancedMesh): there are
 * only 8, a trivial count nowhere near "thousands of Mesh objects" —
 * individual meshes give each planet its own independent raycast
 * target (no instanceId bookkeeping needed for click-selection) and
 * independent per-planet color/scale updates (needed for the heating
 * blend), at zero real performance cost at this count. Every
 * higher-count population (feed planetesimals, belt, debris) still
 * uses shared InstancedMesh/Points exactly like the rest of this
 * project.
 *
 * INTERACTIVE CAMERA FOCUS ("FORM PLANETS" button): clicking it emits
 * `ui:form-planets` (wired in UIManager.js); this scene listens and
 * starts a temporary camera-focus window on whichever seed currently
 * has the highest `heatT` (the most visibly "in-progress" growth) —
 * a purely cinematic camera move, giving the viewer optional agency
 * to see a close-up. It NEVER gates, pauses, or alters the underlying
 * `epochProgress`-driven simulation, which keeps running identically
 * whether or not the button is ever pressed — see "Preserve the
 * existing playback architecture" in the originating spec.
 *
 * PERFORMANCE:
 * Feed planetesimals (~72) use 6 shared InstancedMesh rock-geometry
 * variants (same grouping technique as PlanetesimalFormationScene.js:
 * `site.rockSeed % 6`). Belt (~70) and scattered debris (~40) are
 * each one shared THREE.Points/BufferGeometry — cheaper than full
 * rock meshes, appropriate for "background material" that isn't the
 * active subject of the accretion story. Planet seeds (8) are
 * individual meshes (see above). Orbital rings (8) are individual
 * `THREE.LineLoop` objects, built once in enter() and only made
 * visible near the very end — trivial cost at this count. All typed
 * arrays allocated once in enter(), mutated in place in update() — no
 * per-frame allocation anywhere.
 *
 * ARCHITECTURAL BOUNDARIES:
 * This scene never calls simulationState.set(...) and keeps no
 * module-level/global state — everything it owns lives on `this`,
 * created in enter() and disposed in exit(). EventBus subscriptions
 * are stored and explicitly unsubscribed in exit() (the same pattern
 * GalaxyFormationScene.js already established for the first scene
 * that needed it).
 */
import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { createSeededRandom } from '../../utils/seededRandom.js';
import { clamp, easeInOutCubic } from '../../utils/mathUtils.js';
import {
  generatePresentDaySolarSystemData,
  resolvePresentDayPhase,
  resolveSeedHeat,
} from './PresentDaySolarSystemData.js';

const SUN_SEED = 71100001;
const ROCK_VARIANT_COUNT = 6; // same technique/count as PlanetesimalFormationScene.js
const ROCK_BASE_RADIUS = 0.16; // same base as PlanetesimalFormationScene.js, before per-body targetSizeScale
const CORE_COLOR = new THREE.Color('#fff3d9');
const CORONA_COLOR = new THREE.Color('#ffb066');
const ROCK_COLOR_TERRESTRIAL = new THREE.Color('#8a7566'); // muted rocky brown-grey
const ROCK_COLOR_GIANT = new THREE.Color('#c9b896'); // lighter, warmer - a stylized terrestrial/giant distinction, not a scaled model
const HEAT_COLOR = new THREE.Color('#ff5a33'); // warm orange-red - "internal heating," never a bright flash
const WHITE_COLOR = new THREE.Color('#ffffff'); // no tint - lets a grown/cooled planet's own texture show its true colors
const BELT_COLOR = new THREE.Color('#9a8570');
const DEBRIS_COLOR = new THREE.Color('#6f6459');
const RING_COLOR = new THREE.Color('#5a6a80');
const SELECTION_COLOR = new THREE.Color('#6fd6c9'); // matches --focus-ring, this project's established selection/focus accent

const CAMERA_FOCUS_DURATION = 6; // seconds - how long the "FORM PLANETS" cinematic focus holds before returning
const POST_CLICK_SEQUENCE_DURATION = 14; // seconds at 1x playback speed - the whole gated formation sequence's own duration once triggered; scales naturally with the global speed control, same as everything else
const HIT_SPHERE_MIN_SCALE = 0.35; // minimum world-space tap-target scale, independent of a planet's own current (possibly tiny, early-growth) visible scale - see "LARGER TAP TARGETS" note
const CAMERA_FOLLOW_TIME_CONSTANT = 1.3;
const RAYCASTER_POINTS_THRESHOLD = 0.12;

function isNarrowViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

/** Same soft radial-gradient glow sprite technique as every other recent scene - see file header for why this is a deliberate duplicate, not a shared import. */
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

/**
 * Procedural, stylized per-planet surface texture - canvas-generated
 * at runtime (same "no external assets, draw it with 2D canvas"
 * technique createGlowTexture() above already uses), never a
 * downloaded/photorealistic texture. Small (256x128, equirectangular)
 * on purpose - "stylized scientific representations... prioritize
 * mobile performance." Each config below turns on only the visual
 * traits that specific planet actually needs (bands, craters,
 * continents, a storm spot, uniform cloud cover, polar caps) - see
 * PLANET_TEXTURE_CONFIGS immediately below this function.
 */
function createPlanetTexture(config) {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const rand = createSeededRandom(config.seed);

  ctx.fillStyle = config.baseColor;
  ctx.fillRect(0, 0, w, h);

  if (config.bands) {
    const bandCount = config.bandCount;
    for (let i = 0; i < bandCount; i++) {
      const y = (i / bandCount) * h;
      const bandHeight = h / bandCount;
      ctx.fillStyle = config.bandColors[i % config.bandColors.length];
      ctx.globalAlpha = 0.55 + rand() * 0.25;
      ctx.fillRect(0, y, w, bandHeight * (0.7 + rand() * 0.5));
    }
    ctx.globalAlpha = 1;
  }

  if (config.craters) {
    for (let i = 0; i < config.craterCount; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const r = 2 + rand() * 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,0,0,${0.15 + rand() * 0.2})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.08 + rand() * 0.08})`;
      ctx.fill();
    }
  }

  if (config.continents) {
    for (let i = 0; i < config.continentCount; i++) {
      const cx = rand() * w;
      const cy = h * 0.2 + rand() * h * 0.6;
      const rx = 15 + rand() * 30;
      const ry = 10 + rand() * 18;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#5a7d4a' : '#7a6a4a';
      ctx.fill();
    }
    for (let i = 0; i < 10; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 12 + rand() * 20, 4 + rand() * 6, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.2})`;
      ctx.fill();
    }
  }

  if (config.surfaceNoise) {
    for (let i = 0; i < 60; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 6 + rand() * 14, 4 + rand() * 10, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,0,0,${0.06 + rand() * 0.1})`;
      ctx.fill();
    }
  }

  if (config.polarCaps) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(w / 2, 6, w * 0.18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 6, w * 0.18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (config.spot) {
    // Positioned at u=0.5 (this geometry's own front-facing longitude,
    // confirmed empirically against THREE.SphereGeometry's default UV
    // mapping - not guessed) so it's reliably visible without relying
    // on a particular camera angle.
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.6, 26, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = config.spotColor;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (config.uniformClouds) {
    for (let i = 0; i < 25; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 20 + rand() * 30, 8 + rand() * 12, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,250,230,${0.15 + rand() * 0.15})`;
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// One config per planet, same order as PresentDaySolarSystemData.js's
// PLANET_DEFS (Mercury..Neptune) - see createPlanetTexture() above for
// what each flag draws. Colors/traits from the originating spec's own
// per-planet description (Section 10), kept simplified/stylized per
// its own "NOT photorealistic" instruction.
const PLANET_TEXTURE_CONFIGS = [
  { name: 'Mercury', baseColor: '#8c8378', craters: true, craterCount: 45, seed: 71100101 },
  { name: 'Venus', baseColor: '#e8d9a8', uniformClouds: true, seed: 71100102 },
  { name: 'Earth', baseColor: '#2a5f8a', continents: true, continentCount: 6, seed: 71100103 },
  { name: 'Mars', baseColor: '#b9553a', surfaceNoise: true, polarCaps: true, seed: 71100104 },
  { name: 'Jupiter', baseColor: '#d9b98c', bands: true, bandCount: 8, bandColors: ['#c9a878', '#e8d0a8', '#b89060'], spot: true, spotColor: '#b5493a', seed: 71100105 },
  { name: 'Saturn', baseColor: '#e8d5a0', bands: true, bandCount: 6, bandColors: ['#dcc790', '#f0e0b0'], ring: true, ringColor: '#e8d5a8', ringOpacity: 0.85, seed: 71100106 },
  { name: 'Uranus', baseColor: '#a8dde0', bands: true, bandCount: 4, bandColors: ['#9ed4d8', '#b8e5e8'], ring: true, ringColor: '#c8e8ea', ringOpacity: 0.4, seed: 71100107 },
  { name: 'Neptune', baseColor: '#3a5fa0', bands: true, bandCount: 5, bandColors: ['#345590', '#4570b0'], spot: true, spotColor: '#2a4570', seed: 71100108 },
];

/**
 * The exact coherent-lobe irregular-rock technique from
 * PlanetesimalFormationScene.js's createIrregularRockGeometry() -
 * duplicated verbatim (not imported, not touching that file) per this
 * project's standing precedent. See that file's "GEOMETRY QUALITY
 * FIX" note for the full reasoning.
 */
function createIrregularRockGeometry(seed) {
  const geometry = new THREE.IcosahedronGeometry(ROCK_BASE_RADIUS, 2);
  const positionAttr = geometry.attributes.position;
  const rand = createSeededRandom(seed);

  const LOBE_COUNT = 5;
  const lobes = new Array(LOBE_COUNT);
  for (let i = 0; i < LOBE_COUNT; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(rand() * 2 - 1);
    lobes[i] = {
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.sin(phi) * Math.sin(theta),
      z: Math.cos(phi),
      amp: (rand() * 2 - 1) * 0.24 + 0.03,
      power: 2.5 + rand() * 3,
    };
  }

  for (let i = 0; i < positionAttr.count; i++) {
    const x = positionAttr.getX(i);
    const y = positionAttr.getY(i);
    const z = positionAttr.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;

    let bump = 0;
    for (let l = 0; l < LOBE_COUNT; l++) {
      const lobe = lobes[l];
      const dot = nx * lobe.x + ny * lobe.y + nz * lobe.z;
      if (dot > 0) bump += lobe.amp * Math.pow(dot, lobe.power);
    }
    const fineJitter = (rand() * 2 - 1) * 0.012;
    const scale = Math.max(0.72, Math.min(1.32, 1 + bump + fineJitter));
    positionAttr.setXYZ(i, nx * len * scale, ny * len * scale, nz * len * scale);
  }
  geometry.computeVertexNormals();

  const normalAttr = geometry.attributes.normal;
  const colors = new Float32Array(positionAttr.count * 3);
  const lightDir = { x: 0.5, y: 0.72, z: 0.48 };
  const lightLen = Math.hypot(lightDir.x, lightDir.y, lightDir.z);
  for (let i = 0; i < positionAttr.count; i++) {
    const nx = normalAttr.getX(i);
    const ny = normalAttr.getY(i);
    const nz = normalAttr.getZ(i);
    const dot = (nx * lightDir.x + ny * lightDir.y + nz * lightDir.z) / lightLen;
    const tonalVariation = 0.92 + rand() * 0.13;
    const shade = (0.55 + Math.max(0, dot) * 0.45) * tonalVariation;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export class PresentDaySolarSystemScene extends BaseScene {
  enter(context) {
    const { camera, eventBus } = context;
    const narrow = isNarrowViewport();

    this._data = generatePresentDaySolarSystemData({
      feedCountPerSeed: narrow ? 5 : 9,
      beltCount: narrow ? 65 : 110, // denser than the original 40/70 - the belt read as fairly sparse before
      debrisCount: narrow ? 22 : 40,
    });

    this._reusableColor = new THREE.Color();
    this._glowTexture = createGlowTexture();
    this._elapsed = 0;

    this._buildBackdrop();
    this._buildSun();
    this._buildFeedPlanetesimals();
    this._buildBeltAndDebris();
    this._buildPlanetSeeds();
    this._buildOrbitalRings();

    // Selection state - see "PLANET SELECTION" above.
    this._camera = camera;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.params.Points.threshold = RAYCASTER_POINTS_THRESHOLD;
    this._pointer = new THREE.Vector2();
    this._projectionVector = new THREE.Vector3(); // reused every frame for label-position projection - never reallocated
    this._selectedPlanetIndex = null;

    // Camera-focus state - see "INTERACTIVE CAMERA FOCUS" above.
    this._focusPlanetIndex = null;
    this._focusElapsed = 0;
    this._focusCycleCounter = -1;
    this._cameraOrbitAngle = 0;
    // Gated formation-sequence state - see "GATED FORMATION, NOT
    // AMBIENT" above. Nothing below advances until FORM PLANETS is
    // clicked at least once.
    this._hasFormedPlanets = false;
    this._postClickElapsed = 0;

    this._eventBus = eventBus;
    this._unsubscribers = [
      eventBus.on('input:canvas-tap', (payload) => this._handleCanvasTap(payload)),
      eventBus.on('ui:form-planets', () => this._handleFormPlanets()),
    ];
  }

  _buildBackdrop() {
    const rand = createSeededRandom(SUN_SEED + 9001);
    const count = 90;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const backdropColor = new THREE.Color('#7a8bb0');
    for (let i = 0; i < count; i++) {
      const dirX = rand() * 2 - 1;
      const dirY = rand() * 2 - 1;
      const dirZ = rand() * 2 - 1;
      const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
      const r = 20 * (0.5 + rand() * 0.5);
      const i3 = i * 3;
      positions[i3] = (dirX / dirLen) * r;
      positions[i3 + 1] = (dirY / dirLen) * r;
      positions[i3 + 2] = (dirZ / dirLen) * r;
      const b = 0.08 + rand() * 0.1;
      colors[i3] = backdropColor.r * b;
      colors[i3 + 1] = backdropColor.g * b;
      colors[i3 + 2] = backdropColor.b * b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.7, sizeAttenuation: true, depthWrite: false });
    this._backdropPoints = new THREE.Points(geometry, material);
    this.root.add(this._backdropPoints);
  }

  _buildSun() {
    const corePositions = new Float32Array(3);
    const coreColors = new Float32Array(3);
    this._reusableColor.copy(CORE_COLOR);
    coreColors[0] = this._reusableColor.r;
    coreColors[1] = this._reusableColor.g;
    coreColors[2] = this._reusableColor.b;
    const coreGeometry = new THREE.BufferGeometry();
    coreGeometry.setAttribute('position', new THREE.BufferAttribute(corePositions, 3));
    coreGeometry.setAttribute('color', new THREE.BufferAttribute(coreColors, 3));
    const coreMaterial = new THREE.PointsMaterial({ size: 0.24, map: this._glowTexture, vertexColors: true, transparent: true, opacity: 1, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this._sunCorePoints = new THREE.Points(coreGeometry, coreMaterial);
    this.root.add(this._sunCorePoints);

    const coronaPositions = new Float32Array(3);
    const coronaColors = new Float32Array(3);
    this._reusableColor.copy(CORONA_COLOR).multiplyScalar(0.35);
    coronaColors[0] = this._reusableColor.r;
    coronaColors[1] = this._reusableColor.g;
    coronaColors[2] = this._reusableColor.b;
    const coronaGeometry = new THREE.BufferGeometry();
    coronaGeometry.setAttribute('position', new THREE.BufferAttribute(coronaPositions, 3));
    coronaGeometry.setAttribute('color', new THREE.BufferAttribute(coronaColors, 3));
    const coronaMaterial = new THREE.PointsMaterial({ size: 0.6, map: this._glowTexture, vertexColors: true, transparent: true, opacity: 0.4, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this._sunCoronaPoints = new THREE.Points(coronaGeometry, coronaMaterial);
    this.root.add(this._sunCoronaPoints);
  }

  _buildFeedPlanetesimals() {
    const feeds = this._data.feedPlanetesimals;
    this._feedGeometries = [];
    for (let v = 0; v < ROCK_VARIANT_COUNT; v++) {
      this._feedGeometries.push(createIrregularRockGeometry(SUN_SEED + 101 * (v + 1)));
    }
    this._feedMeshes = [];
    this._feedSiteIndices = [];
    for (let v = 0; v < ROCK_VARIANT_COUNT; v++) {
      const variantIndices = [];
      for (let i = 0; i < feeds.length; i++) {
        const rockSeed = Math.floor((feeds[i].orbitalRadius * 1e6 + feeds[i].angle0 * 1e5) % 1e9);
        if (rockSeed % ROCK_VARIANT_COUNT === v) variantIndices.push(i);
      }
      this._feedSiteIndices.push(variantIndices);
      const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(this._feedGeometries[v], material, Math.max(1, variantIndices.length));
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, variantIndices.length) * 3), 3);
      mesh.count = variantIndices.length;
      this._feedMeshes.push(mesh);
      this.root.add(mesh);
    }
    this._feedDummy = new THREE.Object3D();
    this._feedAngles = new Float32Array(feeds.length);
    feeds.forEach((f, i) => { this._feedAngles[i] = f.angle0; });
  }

  _buildBeltAndDebris() {
    const buildPointsPopulation = (particles, color) => {
      const positions = new Float32Array(particles.length * 3);
      const colors = new Float32Array(particles.length * 3);
      particles.forEach((p, i) => {
        const i3 = i * 3;
        positions[i3] = Math.cos(p.angle0) * p.orbitalRadius;
        positions[i3 + 1] = p.y0;
        positions[i3 + 2] = Math.sin(p.angle0) * p.orbitalRadius;
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.85, sizeAttenuation: true, depthWrite: false });
      const points = new THREE.Points(geometry, material);
      this.root.add(points);
      return points;
    };
    this._beltPoints = buildPointsPopulation(this._data.beltPlanetesimals, BELT_COLOR);
    this._debrisPoints = buildPointsPopulation(this._data.scatteredDebris, DEBRIS_COLOR);
    this._beltAngles = new Float32Array(this._data.beltPlanetesimals.length);
    this._data.beltPlanetesimals.forEach((p, i) => { this._beltAngles[i] = p.angle0; });
    this._debrisAngles = new Float32Array(this._data.scatteredDebris.length);
    this._data.scatteredDebris.forEach((p, i) => { this._debrisAngles[i] = p.angle0; });
  }

  _buildPlanetSeeds() {
    const seeds = this._data.planetSeeds;
    this._planetMeshes = [];
    this._planetHitSpheres = []; // invisible, larger raycast targets - see "LARGER TAP TARGETS" note in file header
    this._planetGlowPoints = [];
    this._planetTextures = [];
    this._ringMeshes = []; // index-aligned with seeds; null for planets without a ring
    this._planetAngles = new Float32Array(seeds.length);
    this._planetRotationPhase = new Float32Array(seeds.length); // monotonic self-rotation accumulator - see _updatePlanetSeeds()

    const hitSphereGeometry = new THREE.SphereGeometry(ROCK_BASE_RADIUS, 8, 6); // shared across all 8 - low-poly since it's never actually rendered
    const hitSphereMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }); // invisible but still raycastable - THREE.Raycaster skips object.visible=false entirely, so opacity:0 (not visible:false) is the correct way to keep this tappable while rendering nothing
    this._hitSphereGeometry = hitSphereGeometry; // explicit refs for exit() - all 8 hit-spheres below share these same two objects
    this._hitSphereMaterial = hitSphereMaterial;

    seeds.forEach((seed, i) => {
      const texConfig = PLANET_TEXTURE_CONFIGS[i];
      const texture = createPlanetTexture(texConfig);
      this._planetTextures.push(texture);

      // A smooth sphere, not the irregular rock geometry - see file
      // header's "RECOGNIZABLE PLANET APPEARANCE" note: a highly
      // irregular/lobed surface would distort an equirectangular
      // texture (bands would look wavy, continents stretched
      // unpredictably), and the goal here is specifically
      // "visually recognizable... scientifically grounded
      // characteristics," not an irregular asteroid-like shape. The
      // feed/belt/debris planetesimal populations elsewhere in this
      // file are UNCHANGED and still use the original irregular rock
      // technique - this only applies to the 8 planets themselves.
      const geometry = new THREE.SphereGeometry(ROCK_BASE_RADIUS, 24, 16);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.planetIndex = i;
      mesh.userData.planetName = seed.name;
      this.root.add(mesh);
      this._planetMeshes.push(mesh);
      this._planetAngles[i] = seed.angle0;

      const hitSphere = new THREE.Mesh(hitSphereGeometry, hitSphereMaterial);
      hitSphere.userData.planetIndex = i;
      hitSphere.userData.planetName = seed.name;
      this.root.add(hitSphere);
      this._planetHitSpheres.push(hitSphere);

      // Small interior glow-sprite for the heating cue - see file
      // header's "INTERNAL HEATING, NOT AN EXPLOSION" note. Scaled
      // well under the body's own size so it reads as glowing FROM
      // WITHIN, never as a separate visible object.
      const glowPositions = new Float32Array(3);
      const glowColors = new Float32Array(3);
      const glowGeometry = new THREE.BufferGeometry();
      glowGeometry.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
      glowGeometry.setAttribute('color', new THREE.BufferAttribute(glowColors, 3));
      const glowMaterial = new THREE.PointsMaterial({ size: ROCK_BASE_RADIUS * 0.7, map: this._glowTexture, vertexColors: true, transparent: true, opacity: 0, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const glowPoints = new THREE.Points(glowGeometry, glowMaterial);
      this.root.add(glowPoints);
      this._planetGlowPoints.push(glowPoints);

      // Saturn/Uranus only - a flat ring via THREE.RingGeometry (a
      // standard primitive, not custom geometry), tilted to read as a
      // genuine ellipse rather than a flat line. Saturn's is
      // prominent per the originating spec (not hedged with "if
      // performance permits"); Uranus's is deliberately fainter, both
      // real, both cheap (one extra draw call each, only for these
      // two planets).
      if (texConfig.ring) {
        const ringGeometry = new THREE.RingGeometry(ROCK_BASE_RADIUS * 1.35, ROCK_BASE_RADIUS * (texConfig.name === 'Saturn' ? 2.05 : 1.55), 48);
        const ringMaterial = new THREE.MeshBasicMaterial({ color: texConfig.ringColor, transparent: true, opacity: texConfig.ringOpacity, side: THREE.DoubleSide, depthWrite: false });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2.6; // a clear ellipse from this scene's own camera angles, not edge-on-flat
        this.root.add(ring);
        this._ringMeshes.push(ring);
      } else {
        this._ringMeshes.push(null);
      }
    });
  }

  _buildOrbitalRings() {
    const seeds = this._data.planetSeeds;
    this._ringLines = seeds.map((seed) => {
      const segments = 64;
      const positions = new Float32Array((segments + 1) * 3);
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        positions[i * 3] = Math.cos(angle) * seed.orbitalRadius;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = Math.sin(angle) * seed.orbitalRadius;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0 });
      const line = new THREE.LineLoop(geometry, material);
      this.root.add(line);
      return line;
    });
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const realProgress = context.state.epochProgress; // still the authoritative epoch-timeline position - only used to know we're in this epoch at all, never advances anything below

    // Gated formation sequence - see file header's "GATED FORMATION,
    // NOT AMBIENT" note. localProgress stays pinned at 0 (nothing
    // grows, nothing collides, feed planetesimals just orbit freely)
    // until FORM PLANETS has been clicked at least once - after that
    // it advances via its own dedicated timer, scaled by the SAME
    // global playbackSpeed every other control in this app already
    // respects (never by realProgress/epochProgress, which stays
    // completely unused for pacing here).
    if (this._hasFormedPlanets) {
      this._postClickElapsed += deltaTime * context.state.playbackSpeed;
    }
    const localProgress = this._hasFormedPlanets
      ? Math.min(1, this._postClickElapsed / POST_CLICK_SEQUENCE_DURATION)
      : 0;

    // A temporary rotational-energy burst, present only in the early
    // part of the post-click sequence (rises fast, settles back to
    // normal well before growth is far along) - "the acceleration
    // should make the formation process feel faster and more
    // energetic," framed as part of the SAME event that starts
    // collisions, never as its literal cause - see file header.
    const burstRise = easeInOutCubic(clamp(localProgress / 0.12, 0, 1));
    const burstFall = 1 - easeInOutCubic(clamp((localProgress - 0.18) / 0.22, 0, 1));
    const burstT = this._hasFormedPlanets ? Math.min(burstRise, burstFall) : 0;
    const rotationBoost = 1 + burstT * 3;

    const phase = resolvePresentDayPhase(localProgress);

    // Planet seeds first - feed planetesimals below read their CURRENT
    // orbital angle (this frame's, not last frame's) to blend toward.
    this._updatePlanetSeeds(deltaTime, localProgress, phase, rotationBoost);
    this._updateFeedPlanetesimals(deltaTime, localProgress, phase, rotationBoost);
    this._updateBeltAndDebris(deltaTime, phase, rotationBoost);
    this._updateOrbitalRings(phase);
    this._updateCamera(deltaTime, context.camera, phase);
    this._updateSelectedPlanetLabelPosition();
  }

  _updateFeedPlanetesimals(deltaTime, progress, phase, rotationBoost) {
    const feeds = this._data.feedPlanetesimals;
    const seeds = this._data.planetSeeds;
    const dummy = this._feedDummy;
    const angles = this._feedAngles;

    for (let i = 0; i < feeds.length; i++) {
      angles[i] += feeds[i].angularVelocity * deltaTime * rotationBoost;
    }

    for (let v = 0; v < ROCK_VARIANT_COUNT; v++) {
      const mesh = this._feedMeshes[v];
      const indices = this._feedSiteIndices[v];
      for (let k = 0; k < indices.length; k++) {
        const i = indices[k];
        const f = feeds[i];
        const seed = seeds[f.seedIndex];
        const seedHeat = resolveSeedHeat(progress); // same curve every seed uses for its OWN merge timing; fine to share since growthT already gates the overall window

        const freeX = Math.cos(angles[i]) * f.orbitalRadius;
        const freeY = f.y0;
        const freeZ = Math.sin(angles[i]) * f.orbitalRadius;

        const blendT = phase.growthT;
        const scatterShrink = 1 - blendT * 0.8;
        const seedX = Math.cos(this._planetAngles[f.seedIndex]) * seed.orbitalRadius + f.captureScatterX * scatterShrink;
        const seedY = f.captureScatterY * scatterShrink;
        const seedZ = Math.sin(this._planetAngles[f.seedIndex]) * seed.orbitalRadius + f.captureScatterZ * scatterShrink;

        const px = freeX + (seedX - freeX) * blendT;
        const py = freeY + (seedY - freeY) * blendT;
        const pz = freeZ + (seedZ - freeZ) * blendT;

        dummy.position.set(px, py, pz);
        dummy.rotation.set((f.orbitalRadius * 3.1) % 6.28, (f.angle0 * 1.7) % 6.28, (f.orbitalRadius * 0.6) % 6.28);
        // Feed material shrinks away as it merges - "gradually reduce
        // as material becomes incorporated," never teleports/vanishes
        // instantly.
        const fadeScale = Math.max(0.0001, 0.55 * (1 - blendT * 0.92));
        dummy.scale.setScalar(fadeScale);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Colors: set once per variant-group is wasteful to repeat every
    // frame at fixed values, but brightness needs to fade WITH growth
    // - do it here, still O(count), same cost class as position.
    for (let v = 0; v < ROCK_VARIANT_COUNT; v++) {
      const mesh = this._feedMeshes[v];
      const indices = this._feedSiteIndices[v];
      for (let k = 0; k < indices.length; k++) {
        const i = indices[k];
        const f = feeds[i];
        const b = f.brightness * (1 - phase.growthT * 0.3);
        this._reusableColor.copy(ROCK_COLOR_TERRESTRIAL).multiplyScalar(b);
        mesh.setColorAt(k, this._reusableColor);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  _updateBeltAndDebris(deltaTime, phase, rotationBoost) {
    const updatePop = (points, particles, anglesArr, color, visibility) => {
      const posAttr = points.geometry.attributes.position;
      const colAttr = points.geometry.attributes.color;
      const pos = posAttr.array;
      const col = colAttr.array;
      for (let i = 0; i < particles.length; i++) {
        anglesArr[i] += particles[i].angularVelocity * deltaTime * rotationBoost;
        const i3 = i * 3;
        pos[i3] = Math.cos(anglesArr[i]) * particles[i].orbitalRadius;
        pos[i3 + 1] = particles[i].y0;
        pos[i3 + 2] = Math.sin(anglesArr[i]) * particles[i].orbitalRadius;
        const b = particles[i].brightness * visibility;
        col[i3] = color.r * b;
        col[i3 + 1] = color.g * b;
        col[i3 + 2] = color.b * b;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    };
    // Belt persists (visibility stays ~1, matching the real asteroid
    // belt still being there today); debris fades per phase.debrisT.
    updatePop(this._beltPoints, this._data.beltPlanetesimals, this._beltAngles, BELT_COLOR, 0.5 + phase.debrisT * 0.15 + (1 - phase.debrisT) * 0.5);
    updatePop(this._debrisPoints, this._data.scatteredDebris, this._debrisAngles, DEBRIS_COLOR, phase.debrisT);
  }

  _updatePlanetSeeds(deltaTime, progress, phase, rotationBoost) {
    const seeds = this._data.planetSeeds;
    for (let i = 0; i < seeds.length; i++) {
      this._planetAngles[i] += seeds[i].angularVelocity * deltaTime * rotationBoost;
      // A separate monotonic accumulator, not this._elapsed * rate -
      // multiplying an ever-growing elapsed-time value by a DECAYING
      // boost multiplier can make the product briefly decrease frame
      // to frame (i.e. the planet visibly spins backward for an
      // instant) once the boost starts fading. Accumulating the
      // ALREADY-boosted increment each frame instead is always
      // non-negative, so rotation only ever speeds up or slows down,
      // never reverses - caught and fixed before this ever rendered.
      this._planetRotationPhase[i] += deltaTime * 0.08 * rotationBoost;

      const seed = seeds[i];
      const mesh = this._planetMeshes[i];
      const glow = this._planetGlowPoints[i];
      const ring = this._ringMeshes[i];
      const shellHeat = resolveSeedHeat(progress).heatT;
      // Two distinct beats, both derived from curves already driving
      // everything else (no data-file changes needed - see file
      // header's "COLLISION FORMS A CORE, THEN THE CORE ATTRACTS"
      // note): (1) coreFormT rises FAST (fully formed by
      // localProgress=0.08) - "collision -> bright hot core" happens
      // distinctly first, well before the body has grown at all
      // (phase.growthT is still ~0 at that point). (2) coreVisibility
      // then fades as phase.growthT rises - the core isn't
      // extinguished, it's progressively BURIED under the accreting
      // shell (a small residual glow always remains, even at full
      // growth - real planets keep a hot interior long after forming).
      const coreFormT = easeInOutCubic(clamp(progress / 0.08, 0, 1));
      const coreVisibility = coreFormT * (1 - phase.growthT * 0.85);

      const x = Math.cos(this._planetAngles[i]) * seed.orbitalRadius;
      const z = Math.sin(this._planetAngles[i]) * seed.orbitalRadius;
      mesh.position.set(x, 0, z);
      // Uniform, controlled rotation - not chaotic per-object spin -
      // see "UNIFORM ROTATION" in the originating spec. Axial tilt
      // (seed.axialTilt, mostly real per-planet values - see
      // PresentDaySolarSystemData.js's own PLANET_DEFS comment for
      // which one is simplified and why) is a fixed offset applied
      // alongside the spin, not physically-rigorous tilted-axis
      // rotation (consistent with this whole scene's established
      // "stylized, not exact" approach) - Uranus's dramatic ~98°
      // value is the deliberate standout here.
      mesh.rotation.z = seed.axialTilt;
      mesh.rotation.y = this._planetRotationPhase[i];

      const scale = Math.max(0.08, phase.growthT * seed.targetSizeScale);
      mesh.scale.setScalar(scale);

      const hitSphere = this._planetHitSpheres[i];
      hitSphere.position.set(x, 0, z);
      hitSphere.scale.setScalar(Math.max(scale, HIT_SPHERE_MIN_SCALE));

      // Color: rocky tint (still basically a planetesimal, texture
      // obscured) -> the texture's own TRUE colors as growthT rises
      // (a body only starts looking like a recognizable, distinct
      // planet as it actually grows) -> a MODEST warm tint layered on
      // top while heat is high (the accreting shell material is
      // warmed by the process, but deliberately kept LESS hot-looking
      // than the distinct core below it - see coreVisibility above -
      // so there's a clear visual hierarchy: bright core, moderately
      // warm shell) -> back to true colors as heat falls again. See
      // file header's "COLLISION FORMS A CORE..." /
      // "RECOGNIZABLE PLANET APPEARANCE" notes for why this ISN'T
      // simply "rock color -> heat color" like the old irregular-rock
      // version - blending FROM a flat rock tint would wash out the
      // texture's own accurate colors (Earth's blue, Jupiter's bands)
      // even once fully grown and cooled, which defeats the point of
      // having a real texture at all.
      const rockyBase = seed.isGiant ? ROCK_COLOR_GIANT : ROCK_COLOR_TERRESTRIAL;
      this._reusableColor.copy(rockyBase).lerp(WHITE_COLOR, phase.growthT);
      this._reusableColor.lerp(HEAT_COLOR, shellHeat * 0.32);
      const isSelected = this._selectedPlanetIndex === i;
      if (isSelected) this._reusableColor.lerp(SELECTION_COLOR, 0.25);
      // MeshBasicMaterial.color multiplies with the texture map
      // automatically - same mechanism the old vertexColors version
      // relied on, just against a map instead of baked vertex colors.
      mesh.material.color.copy(this._reusableColor);

      // The core itself - a small, bright, hot point, distinctly
      // brighter than the shell's own warm tint above. Size is
      // deliberately capped (never scales up with the full-grown
      // body) so it keeps reading as "a small hot heart," not "the
      // whole planet is glowing."
      glow.position.set(x, 0, z);
      this._reusableColor.copy(HEAT_COLOR).multiplyScalar(coreVisibility * 0.95);
      const glowColAttr = glow.geometry.attributes.color;
      glowColAttr.array[0] = this._reusableColor.r;
      glowColAttr.array[1] = this._reusableColor.g;
      glowColAttr.array[2] = this._reusableColor.b;
      glowColAttr.needsUpdate = true;
      glow.material.opacity = coreVisibility * 0.9 + 0.05; // never fully invisible - see coreVisibility's own residual floor above
      glow.material.size = ROCK_BASE_RADIUS * Math.min(scale, 0.22) * 1.3;

      if (ring) {
        ring.position.set(x, 0, z);
        ring.scale.setScalar(scale);
        ring.material.opacity = (seed.name === 'Saturn' ? 0.85 : 0.4) * Math.min(1, phase.growthT * 1.3);
      }
    }
  }

  _updateOrbitalRings(phase) {
    for (const line of this._ringLines) {
      line.material.opacity = phase.ringsT * 0.5;
    }
  }

  _updateCamera(deltaTime, camera, phase) {
    const outerRadius = this._data.outerRadius;

    if (this._focusPlanetIndex !== null) {
      this._focusElapsed += deltaTime;
      if (this._focusElapsed > CAMERA_FOCUS_DURATION) {
        this._focusPlanetIndex = null;
      } else {
        const seed = this._data.planetSeeds[this._focusPlanetIndex];
        const x = Math.cos(this._planetAngles[this._focusPlanetIndex]) * seed.orbitalRadius;
        const z = Math.sin(this._planetAngles[this._focusPlanetIndex]) * seed.orbitalRadius;
        const closeDistance = ROCK_BASE_RADIUS * 14;
        this._cameraOrbitAngle += deltaTime * 0.15;
        const targetX = x + Math.cos(this._cameraOrbitAngle) * closeDistance;
        const targetY = closeDistance * 0.45;
        const targetZ = z + Math.sin(this._cameraOrbitAngle) * closeDistance;
        const followT = 1 - Math.exp(-deltaTime / CAMERA_FOLLOW_TIME_CONSTANT);
        camera.position.x += (targetX - camera.position.x) * followT;
        camera.position.y += (targetY - camera.position.y) * followT;
        camera.position.z += (targetZ - camera.position.z) * followT;
        camera.lookAt(x, 0, z);
        return;
      }
    }

    // Default: wide, slowly orbiting view of the whole system - "calm
    // and readable," per the originating spec's own camera guidance.
    this._cameraOrbitAngle += deltaTime * 0.025;
    const distance = outerRadius * (1.85 - phase.ringsT * 0.15);
    const elevation = outerRadius * 0.5;
    const targetX = Math.cos(this._cameraOrbitAngle) * distance;
    const targetY = elevation;
    const targetZ = Math.sin(this._cameraOrbitAngle) * distance;
    const followT = 1 - Math.exp(-deltaTime / CAMERA_FOLLOW_TIME_CONSTANT);
    camera.position.x += (targetX - camera.position.x) * followT;
    camera.position.y += (targetY - camera.position.y) * followT;
    camera.position.z += (targetZ - camera.position.z) * followT;
    camera.lookAt(0, 0, 0);
  }

  /**
   * Re-projects the currently-selected planet's CURRENT world
   * position to screen space every frame, and emits it for
   * UIManager.js to reposition the label - so the label visibly
   * tracks its planet as it keeps orbiting, rather than staying
   * pinned at wherever the original tap happened to land. A no-op
   * when nothing is selected. Explicit updateMatrixWorld() first as a
   * safeguard: this runs after _updateCamera() moves the camera for
   * THIS frame, but Object3D.lookAt() doesn't necessarily flush
   * matrixWorld synchronously, and project() needs the camera's
   * up-to-date transform, not a stale one from before this frame's
   * own move.
   */
  _updateSelectedPlanetLabelPosition() {
    if (this._selectedPlanetIndex === null) return;
    this._camera.updateMatrixWorld();
    const mesh = this._planetMeshes[this._selectedPlanetIndex];
    this._projectionVector.copy(mesh.position).project(this._camera);
    this._eventBus.emit('planet:label-position', {
      ndcX: this._projectionVector.x,
      ndcY: this._projectionVector.y,
    });
  }

  _handleCanvasTap({ ndcX, ndcY }) {
    // Selection only makes sense once these bodies are actually
    // planets, not just 8 more planetesimals among ~180 - see "GATED
    // FORMATION, NOT AMBIENT" above ("later... should be clickable").
    if (!this._hasFormedPlanets) return;

    this._pointer.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._pointer, this._camera);
    // Against the invisible hit-spheres, not the visible planet
    // meshes directly - see "LARGER TAP TARGETS" note: a visible
    // planet's own geometry shrinks to a genuinely tiny radius during
    // early growth, which is hard to tap precisely on mobile; the hit
    // spheres guarantee a comfortable minimum regardless.
    const hits = this._raycaster.intersectObjects(this._planetHitSpheres, false);

    if (hits.length === 0) {
      if (this._selectedPlanetIndex !== null) {
        this._selectedPlanetIndex = null;
        this._eventBus.emit('planet:deselected');
      }
      return;
    }

    const hit = hits[0];
    const planetIndex = hit.object.userData.planetIndex;
    this._selectedPlanetIndex = planetIndex;
    const seed = this._data.planetSeeds[planetIndex];
    this._eventBus.emit('planet:selected', {
      name: hit.object.userData.planetName,
      relativeOrbitalPeriodYears: seed.relativeOrbitalPeriodYears,
      ndcX,
      ndcY,
    });
  }

  _handleFormPlanets() {
    // Two effects, both purely visual/scene-local:
    //
    // 1. Starts the gated formation sequence - see "GATED FORMATION,
    // NOT AMBIENT" above. Idempotent: once already started, clicking
    // again does NOT restart or re-trigger it (this._postClickElapsed
    // just keeps counting up from wherever it already was) - only the
    // FIRST click matters for this part.
    this._hasFormedPlanets = true;

    // 2. Camera focus: if the user has already tapped a planet to
    // select it, focus THERE - a direct, intuitive connection between
    // the two interactions, rather than jumping to an arbitrary spot
    // in the cycle regardless of what's currently selected. Only
    // falls back to cycling through all 8 seeds when nothing is
    // selected (via a separate persistent counter, not
    // _focusPlanetIndex itself - that field resets to null once a
    // focus session's own duration expires, so reusing it for cycling
    // would jump back to planet 0 on every click after a pause) -
    // every seed grows simultaneously (no per-seed heat timing, just
    // one shared progress-driven curve), so there's no meaningful
    // "which one is heating most" to pick when cycling; it gives
    // predictable, testable behavior and lets repeated clicks see a
    // different body up close each time.
    if (this._selectedPlanetIndex !== null) {
      this._focusPlanetIndex = this._selectedPlanetIndex;
    } else {
      this._focusCycleCounter = (this._focusCycleCounter ?? -1) + 1;
      this._focusPlanetIndex = this._focusCycleCounter % this._data.planetSeeds.length;
    }
    this._focusElapsed = 0;
  }

  exit() {
    for (const unsubscribe of this._unsubscribers) unsubscribe();

    this._hitSphereGeometry.dispose();
    this._hitSphereMaterial.dispose();
    this._backdropPoints.geometry.dispose();
    this._backdropPoints.material.dispose();
    this._sunCorePoints.geometry.dispose();
    this._sunCorePoints.material.dispose();
    this._sunCoronaPoints.geometry.dispose();
    this._sunCoronaPoints.material.dispose();
    for (const geo of this._feedGeometries) geo.dispose();
    for (const mesh of this._feedMeshes) mesh.material.dispose();
    this._beltPoints.geometry.dispose();
    this._beltPoints.material.dispose();
    this._debrisPoints.geometry.dispose();
    this._debrisPoints.material.dispose();
    for (const mesh of this._planetMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const texture of this._planetTextures) texture.dispose();
    for (const ring of this._ringMeshes) {
      if (!ring) continue;
      ring.geometry.dispose();
      ring.material.dispose();
    }
    for (const glow of this._planetGlowPoints) {
      glow.geometry.dispose();
      glow.material.dispose();
    }
    for (const line of this._ringLines) {
      line.geometry.dispose();
      line.material.dispose();
    }
    this._glowTexture.dispose();
  }
}
