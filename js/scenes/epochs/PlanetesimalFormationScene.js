/**
 * scenes/epochs/PlanetesimalFormationScene.js
 * ------------------------------------------------------------------
 * The Planetesimal Formation epoch's dedicated scene, replacing
 * PlaceholderScene for 'planetesimal-formation' in sceneRegistry.js.
 * Follows the standard enter()/update()/exit() contract from BaseScene
 * exactly — `this.root` is the THREE.Group BaseScene's constructor
 * already creates; nothing here creates a second THREE.Scene or
 * THREE.Camera, and SceneManager remains solely responsible for
 * adding/removing `this.root`. This file does not modify
 * SolarNebulaScene.js, ProtoplanetaryDiskScene.js, or any other
 * epoch's scene.
 *
 * SCIENTIFIC PURPOSE (a stylized, illustrative approximation — NOT an
 * N-body/collisional simulation): within the young protoplanetary
 * disk, small solid particles gradually accumulate into progressively
 * larger bodies. See PlanetesimalFormationData.js's file header for
 * the full reasoning, especially its explicit note that this is NOT a
 * claim about the literal physical mechanism of planetesimal growth —
 * only a "gradual, not sudden" visual story.
 *
 * REUSES Protoplanetary Disk's established techniques rather than
 * reinventing them:
 *   - Continuous Keplerian orbital motion (per-particle precomputed
 *     angular velocity, integrated into an accumulated angle every
 *     frame — same technique, independently duplicated per this
 *     project's established "don't couple independent scenes"
 *     precedent, not a shared import).
 *   - The young Sun reuses the glow-sprite core+corona technique
 *     (`createGlowTexture()`), already fully formed from Protoplanetary
 *     Disk's own ending state — this scene doesn't re-animate its
 *     growth, just keeps it present and stable.
 *
 * NEW: IRREGULAR ROCKY PLANETESIMALS. Unlike every luminous object in
 * this project (stars, protostars — soft glow-sprite THREE.Points,
 * deliberately never polygon geometry, see FirstStarsScene.js's
 * "cartoonish polygon" fix), a planetesimal is a SOLID, NON-LUMINOUS
 * rocky body — a fundamentally different visual object, and the spec
 * explicitly asks for "irregular... not perfect spheres," which a
 * point sprite cannot convey at all. Six small InstancedMesh groups
 * (`_rockMeshes`, one per procedurally-displaced irregular geometry —
 * see `createIrregularRockGeometry()`) render the ~13 planetesimals,
 * grouped by `site.rockSeed % ROCK_VARIANT_COUNT` (reusing entropy the
 * data file already generates per site, rather than adding a new
 * field there) — this is bounded, non-per-object Mesh usage (a
 * handful of instances across 6 draw calls total, not "thousands of
 * Mesh objects").
 *
 * GEOMETRY QUALITY FIX (this pass): an earlier version displaced every
 * vertex of a coarse (detail=1, ~42 vertex) icosahedron by an
 * INDEPENDENT random amount — with no correlation between neighboring
 * vertices, that reads as crumpled paper / a spiky crystal, not a
 * weathered rock, because adjacent points can differ wildly with
 * nothing smoothing the transition between them. `createIrregularRockGeometry()`
 * now deforms a smoother (detail=2, ~162 vertex) base using a handful
 * of COHERENT signed "lobes" instead — each lobe has a random center
 * direction and a smooth angular falloff (`Math.pow(dot(normal, lobeDir), power)`),
 * so nearby vertices receive similar displacement and the silhouette
 * stays rounded while still reading as genuinely irregular (some lobes
 * push out as gentle protrusions, some pull in as shallow
 * craters/indentations — signed amplitudes, not just outward bumps). A
 * SMALL secondary per-vertex jitter is layered on top for fine surface
 * roughness, deliberately kept an order of magnitude smaller than the
 * lobes — a prototype with the original larger jitter amplitude
 * reintroduced small dark notches at the silhouette edge (confirmed
 * visually, then fixed by cutting the amplitude down), so the
 * lobes still do essentially all of the shaping work. `material.side
 * = THREE.DoubleSide` is kept as a robustness safety net against any
 * residual backface-culling gaps at locally concave dents, at
 * negligible cost given the small triangle counts involved. Each
 * geometry bakes a FIXED per-vertex pseudo-
 * lighting pattern into vertex colors (based on each vertex's own
 * normal, computed once at generation time, now also with a small
 * per-vertex tonal variation for a mineral-texture look) — a cheap,
 * static approximation of "subtle rocky lighting" that stays fully
 * consistent with this project's established all-emissive
 * (MeshBasicMaterial-only, never a real scene THREE.Light) rendering
 * approach, rather than introducing real dynamic lighting for the
 * first time just for this scene. THREE.js's InstancedMesh multiplies
 * per-vertex color x per-instance color automatically when both are
 * present, so the baked shading and each planetesimal's own
 * rocky/icy tint combine for free.
 *
 * DUST CAPTURE / AGGREGATION: `_updateDustParticles()` blends each
 * captured particle's rendered position between its own free orbit
 * and a small residual scatter around its cluster site's CURRENT
 * position (tracked via `this._siteAngles`, integrated the same way
 * as dust particle angles), weighted by that site's own
 * `aggregationT` — see PlanetesimalFormationData.js's "DUST CAPTURE"
 * note. `_updateClusters()` crossfades each site's loose
 * aggregate-points cluster into its solid rock as `aggregationT`
 * crosses its growth window (`pointsOpacity`/`rockScale`).
 *
 * CAMERA: a three-phase journey (wide whole-disk view -> zoom onto
 * one representative site while it's aggregating -> pull back to the
 * full, now-populated disk), driven by `resolveEpochPhase()`'s
 * `cameraFocusT` bump curve. Uses the same per-frame
 * exponential-damping-toward-a-live-target technique
 * ProtoplanetaryDiskScene.js/SolarNebulaScene.js already established.
 *
 * COSMIC-TIME BEHAVIOR:
 * Everything is driven by `context.state.epochProgress` (0..1). No
 * second timeline.
 *
 * PERFORMANCE:
 * One shared THREE.Points/BufferGeometry for ~2,600 dust particles,
 * one shared layer for the small per-site aggregate-cluster points
 * (~200 total across all sites), a small static backdrop layer, three
 * small InstancedMesh groups for the irregular rocks (~13 instances
 * total, not per-object Mesh usage), and two small Points layers for
 * the young Sun's core/corona — all typed arrays allocated once in
 * enter() and mutated in place in update(). No per-frame allocation.
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
import { createSeededRandom } from '../../utils/seededRandom.js';
import { generatePlanetesimalFormationData, resolveClusterPhase, resolveEpochPhase } from './PlanetesimalFormationData.js';

const PLANETESIMAL_SEED = 52900001; // fixed -> same structure every load
const BACKDROP_COLOR = new THREE.Color('#7a8bb0');
const CORE_COLOR = new THREE.Color('#fff3d9');
const CORONA_COLOR = new THREE.Color('#ffb066');
const ROCKY_COLOR = new THREE.Color('#8a6a52'); // warm brown-tan - "predominantly rocky solid material" - DUST particles only, see ROCK_COLOR_INNER/OUTER below for the planetesimal rocks' own separate palette
const ICY_COLOR = new THREE.Color('#c9d4de'); // pale blue-grey - "more ice can remain stable" - DUST particles only
// Separate from the dust gradient above on purpose: the spec asked
// specifically for the ROCK bodies to read as "dark grey, brown,
// charcoal and muted mineral-rock tones," and changing the shared
// ROCKY_COLOR/ICY_COLOR constants above would have altered the dust
// particles' appearance too - out of scope ("preserve the existing
// particle field"). resolveRadialColorInline() (below) is reused for
// both, just fed a different pair of endpoint colors depending on
// whether it's coloring dust or a rock.
const ROCK_COLOR_INNER = new THREE.Color('#4f4038'); // dark muted brown - inner/rocky
const ROCK_COLOR_OUTER = new THREE.Color('#565a60'); // dark muted charcoal-grey - outer/icier, but still a rock, never bright/pale
const AGGREGATE_POINT_COLOR = new THREE.Color('#b89a7c');
const CAMERA_FOLLOW_TIME_CONSTANT = 1.3;

const CORE_POINT_SIZE = 0.2;
const CORONA_POINT_SIZE = 0.5;
const ROCK_BASE_RADIUS = 0.16;
const ROCK_VARIANT_COUNT = 6; // up from 3 - more shared geometries means fewer instances ever look like "obvious duplicated copies," while staying far short of "hundreds of unique meshes"
const AGGREGATE_POINTS_PER_SITE = 16;

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
 * An irregular, non-spherical rock geometry — a low-subdivision
 * icosahedron with each vertex displaced outward/inward by a seeded
 * random amount, then a FIXED per-vertex pseudo-lighting pattern
 * baked into vertex colors (based on each vertex's own recomputed
 * normal against an arbitrary but consistent reference direction) —
 * see "NEW: IRREGULAR ROCKY PLANETESIMALS" in the file header for why
 * this is a deliberate, scope-appropriate use of real geometry rather
 * than this project's usual glow-sprite Points technique.
 */
function createIrregularRockGeometry(seed) {
  // Smoother base than before (detail=2, ~162 vertices vs the old
  // detail=1, ~42) so the coherent lobes below can read as genuinely
  // rounded rather than blocky - see "GEOMETRY QUALITY FIX" above.
  const geometry = new THREE.IcosahedronGeometry(ROCK_BASE_RADIUS, 2);
  const positionAttr = geometry.attributes.position;
  const rand = createSeededRandom(seed);

  // A handful of smooth, signed "lobes" - each has a random center
  // direction and a falloff that's smooth in angle (a power of the dot
  // product with that direction), so NEARBY vertices get SIMILAR
  // displacement. Signed amplitude: most lobes are gentle outward
  // protrusions, some are shallow inward dents (small natural
  // craters/indentations), never a single independent value per vertex.
  const LOBE_COUNT = 5;
  const lobes = new Array(LOBE_COUNT);
  for (let i = 0; i < LOBE_COUNT; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(rand() * 2 - 1);
    lobes[i] = {
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.sin(phi) * Math.sin(theta),
      z: Math.cos(phi),
      amp: (rand() * 2 - 1) * 0.24 + 0.03, // signed, slightly bump-favored
      power: 2.5 + rand() * 3, // controls lobe width - lower = broader/gentler
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
    // Small fine jitter for subtle surface roughness, deliberately an
    // order of magnitude smaller than the lobes - a larger amplitude
    // here was tried and confirmed (visually) to reintroduce small
    // dark notches at the silhouette edge, see "GEOMETRY QUALITY FIX".
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
    // Small per-vertex tonal variation layered onto the lit/shadowed
    // base shade, for a subtle mineral-texture look rather than
    // perfectly flat per-face tone.
    const tonalVariation = 0.92 + rand() * 0.13;
    const shade = (0.55 + Math.max(0, dot) * 0.45) * tonalVariation;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function resolveRadialColorInline(t, rockyColor, icyColor) {
  const c = Math.min(1, Math.max(0, t));
  return {
    r: rockyColor.r + (icyColor.r - rockyColor.r) * c,
    g: rockyColor.g + (icyColor.g - rockyColor.g) * c,
    b: rockyColor.b + (icyColor.b - rockyColor.b) * c,
  };
}

export class PlanetesimalFormationScene extends BaseScene {
  enter(context) {
    const narrow = isNarrowViewport();

    this._data = generatePlanetesimalFormationData({
      seed: PLANETESIMAL_SEED,
      dustParticleCount: narrow ? 1300 : 2600,
      clusterSiteCount: narrow ? 9 : 13,
      backdropStarCount: narrow ? 40 : 70,
    });

    this._reusableColor = new THREE.Color();
    this._glowTexture = createGlowTexture();
    this._elapsed = 0;

    // Per-site accumulated orbital angle - integrated every frame, same
    // technique as dust particles, so captured dust can blend toward
    // each site's LIVE current position, not just its starting angle.
    this._siteAngles = new Float32Array(this._data.clusterSites.length);
    this._data.clusterSites.forEach((s, i) => { this._siteAngles[i] = s.angle0; });
    this._sitePhaseCache = new Array(this._data.clusterSites.length);

    this._buildBackdrop();
    this._buildDustParticles();
    this._buildAggregatePoints();
    this._buildRockVariants();
    this._buildSunCore();
    this._buildSunCorona();

    this._cameraOrbitAngle = 0;
    // Pick a representative site (nearest to the median orbital radius) for the camera's close-up phase.
    const sorted = [...this._data.clusterSites].sort((a, b) => a.orbitalRadius - b.orbitalRadius);
    this._focusSiteIndex = this._data.clusterSites.indexOf(sorted[Math.floor(sorted.length / 2)]);
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
    const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.7, sizeAttenuation: true, depthWrite: false });
    this._backdropPoints = new THREE.Points(geometry, material);
    this.root.add(this._backdropPoints);
  }

  _buildDustParticles() {
    const particles = this._data.dustParticles;
    const count = particles.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this._dustRadius = new Float32Array(count);
    this._dustAngles = new Float32Array(count);
    this._dustAngularVelocity = new Float32Array(count);
    this._dustY0 = new Float32Array(count);
    this._dustBrightness = new Float32Array(count);
    this._dustCaptured = new Uint8Array(count);
    this._dustSiteIndex = new Int32Array(count);
    this._dustScatter = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      this._dustRadius[i] = p.orbitalRadius;
      this._dustAngles[i] = p.angle0;
      this._dustAngularVelocity[i] = p.angularVelocity;
      this._dustY0[i] = p.y0;
      this._dustBrightness[i] = p.brightness;
      this._dustCaptured[i] = p.captured ? 1 : 0;
      this._dustSiteIndex[i] = p.capturedSiteIndex ?? -1;
      this._dustScatter[i * 3] = p.captureScatterX;
      this._dustScatter[i * 3 + 1] = p.captureScatterY;
      this._dustScatter[i * 3 + 2] = p.captureScatterZ;

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
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._dustPoints = new THREE.Points(geometry, material);
    this.root.add(this._dustPoints);
  }

  _buildAggregatePoints() {
    // A small loose-points cluster PER SITE, representing "small
    // aggregate" before it crossfades into a solid rock - see
    // "DUST CAPTURE / AGGREGATION" in the file header.
    const sites = this._data.clusterSites;
    const perSite = AGGREGATE_POINTS_PER_SITE;
    const total = sites.length * perSite;

    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    this._aggregateSiteIndex = new Int32Array(total);
    this._aggregateOffset = new Float32Array(total * 3);

    const rand = createSeededRandom(PLANETESIMAL_SEED + 7);
    let cursor = 0;
    sites.forEach((site, siteIndex) => {
      for (let p = 0; p < perSite; p++) {
        const dirX = rand() * 2 - 1;
        const dirY = rand() * 2 - 1;
        const dirZ = rand() * 2 - 1;
        const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
        const r = ROCK_BASE_RADIUS * (1.4 + rand() * 1.6);
        const i3 = cursor * 3;
        this._aggregateSiteIndex[cursor] = siteIndex;
        this._aggregateOffset[i3] = (dirX / dirLen) * r;
        this._aggregateOffset[i3 + 1] = (dirY / dirLen) * r * 0.6;
        this._aggregateOffset[i3 + 2] = (dirZ / dirLen) * r;
        positions[i3] = Math.cos(site.angle0) * site.orbitalRadius + this._aggregateOffset[i3];
        positions[i3 + 1] = this._aggregateOffset[i3 + 1];
        positions[i3 + 2] = Math.sin(site.angle0) * site.orbitalRadius + this._aggregateOffset[i3 + 2];
        cursor++;
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.06,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._aggregatePoints = new THREE.Points(geometry, material);
    this.root.add(this._aggregatePoints);
  }

  _buildRockVariants() {
    // Six shared irregular geometries (up from three - see
    // ROCK_VARIANT_COUNT above), each its own small InstancedMesh -
    // see "NEW: IRREGULAR ROCKY PLANETESIMALS" above. Grouped by
    // site.rockSeed % ROCK_VARIANT_COUNT rather than the data file's
    // own rockVariantIndex field (which only ever ranged 0-2) - this
    // reuses entropy the data file ALREADY generates per site instead
    // of touching PlanetesimalFormationData.js at all, keeping this
    // pass scoped entirely to rendering.
    const sites = this._data.clusterSites;
    this._rockGeometries = [];
    for (let v = 0; v < ROCK_VARIANT_COUNT; v++) {
      this._rockGeometries.push(createIrregularRockGeometry(PLANETESIMAL_SEED + 101 * (v + 1)));
    }
    this._rockMeshes = [];
    this._rockSiteIndices = []; // which clusterSites[] index each instance within a variant corresponds to

    for (let v = 0; v < ROCK_VARIANT_COUNT; v++) {
      const variantSites = sites.filter((s) => s.rockSeed % ROCK_VARIANT_COUNT === v);
      this._rockSiteIndices.push(variantSites.map((s) => sites.indexOf(s)));
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide, // robustness net against any residual backface-culling gaps at locally concave dents - negligible cost at this triangle count
      });
      const mesh = new THREE.InstancedMesh(this._rockGeometries[v], material, Math.max(1, variantSites.length));
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, variantSites.length) * 3), 3);
      mesh.count = variantSites.length;
      this._rockMeshes.push(mesh);
      this.root.add(mesh);
    }
    this._rockDummy = new THREE.Object3D();
  }

  _buildSunCore() {
    const positions = new Float32Array(3);
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
    this._sunCorePoints = new THREE.Points(geometry, material);
    this.root.add(this._sunCorePoints);
    this._reusableColor.copy(CORE_COLOR);
    colors[0] = this._reusableColor.r;
    colors[1] = this._reusableColor.g;
    colors[2] = this._reusableColor.b;
  }

  _buildSunCorona() {
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
    this._sunCoronaPoints = new THREE.Points(geometry, material);
    this.root.add(this._sunCoronaPoints);
    this._reusableColor.copy(CORONA_COLOR).multiplyScalar(0.35);
    colors[0] = this._reusableColor.r;
    colors[1] = this._reusableColor.g;
    colors[2] = this._reusableColor.b;
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const progress = context.state.epochProgress;
    const epochPhase = resolveEpochPhase(progress);

    // Integrate every cluster site's own orbital angle first - dust
    // capture blending needs each site's LIVE current position.
    const sites = this._data.clusterSites;
    for (let i = 0; i < sites.length; i++) {
      this._siteAngles[i] += sites[i].angularVelocity * deltaTime;
      this._sitePhaseCache[i] = resolveClusterPhase(sites[i], progress);
    }

    this._updateDustParticles(deltaTime, progress);
    this._updateAggregatePoints();
    this._updateRocks();
    this._updateCamera(deltaTime, context.camera, epochPhase);
  }

  _updateDustParticles(deltaTime, progress) {
    const posAttr = this._dustPoints.geometry.attributes.position;
    const colAttr = this._dustPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const radius = this._dustRadius;
    const angles = this._dustAngles;
    const angularVelocity = this._dustAngularVelocity;
    const y0 = this._dustY0;
    const brightness = this._dustBrightness;
    const captured = this._dustCaptured;
    const siteIndex = this._dustSiteIndex;
    const scatter = this._dustScatter;
    const innerRadius = this._data.innerRadius;
    const outerRadius = this._data.outerRadius;
    const radiusSpan = outerRadius - innerRadius;
    const siteAngles = this._siteAngles;
    const sites = this._data.clusterSites;
    const sitePhases = this._sitePhaseCache;

    const count = radius.length;
    for (let i = 0; i < count; i++) {
      angles[i] += angularVelocity[i] * deltaTime;
      const i3 = i * 3;
      const freeX = Math.cos(angles[i]) * radius[i];
      const freeY = y0[i];
      const freeZ = Math.sin(angles[i]) * radius[i];

      let px = freeX, py = freeY, pz = freeZ;
      let colorWarmth = radiusSpan > 0 ? (radius[i] - innerRadius) / radiusSpan : 0;

      if (captured[i] === 1) {
        const s = siteIndex[i];
        const site = sites[s];
        const sitePhase = sitePhases[s];
        const blendT = sitePhase.aggregationT;
        const scatterShrink = 1 - blendT * 0.7;
        const siteX = Math.cos(siteAngles[s]) * site.orbitalRadius + scatter[i * 3] * scatterShrink;
        const siteY = scatter[i * 3 + 1] * scatterShrink;
        const siteZ = Math.sin(siteAngles[s]) * site.orbitalRadius + scatter[i * 3 + 2] * scatterShrink;
        px = freeX + (siteX - freeX) * blendT;
        py = freeY + (siteY - freeY) * blendT;
        pz = freeZ + (siteZ - freeZ) * blendT;
        colorWarmth = radiusSpan > 0 ? (site.orbitalRadius - innerRadius) / radiusSpan : 0;
      }

      pos[i3] = px;
      pos[i3 + 1] = py;
      pos[i3 + 2] = pz;

      const rc = resolveRadialColorInline(colorWarmth, ROCKY_COLOR, ICY_COLOR);
      const b = brightness[i] * 0.75;
      col[i3] = rc.r * b;
      col[i3 + 1] = rc.g * b;
      col[i3 + 2] = rc.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateAggregatePoints() {
    const posAttr = this._aggregatePoints.geometry.attributes.position;
    const colAttr = this._aggregatePoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const siteIdxArr = this._aggregateSiteIndex;
    const offset = this._aggregateOffset;
    const sites = this._data.clusterSites;
    const siteAngles = this._siteAngles;
    const sitePhases = this._sitePhaseCache;

    const count = siteIdxArr.length;
    for (let i = 0; i < count; i++) {
      const s = siteIdxArr[i];
      const site = sites[s];
      const phase = sitePhases[s];
      const i3 = i * 3;

      const siteX = Math.cos(siteAngles[s]) * site.orbitalRadius;
      const siteZ = Math.sin(siteAngles[s]) * site.orbitalRadius;
      pos[i3] = siteX + offset[i3];
      pos[i3 + 1] = offset[i3 + 1];
      pos[i3 + 2] = siteZ + offset[i3 + 2];

      const b = phase.pointsOpacity * 0.7;
      col[i3] = AGGREGATE_POINT_COLOR.r * b;
      col[i3 + 1] = AGGREGATE_POINT_COLOR.g * b;
      col[i3 + 2] = AGGREGATE_POINT_COLOR.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateRocks() {
    const sites = this._data.clusterSites;
    const siteAngles = this._siteAngles;
    const sitePhases = this._sitePhaseCache;
    const innerRadius = this._data.innerRadius;
    const outerRadius = this._data.outerRadius;
    const radiusSpan = outerRadius - innerRadius;
    const dummy = this._rockDummy;

    for (let v = 0; v < ROCK_VARIANT_COUNT; v++) {
      const mesh = this._rockMeshes[v];
      const indices = this._rockSiteIndices[v];
      for (let k = 0; k < indices.length; k++) {
        const s = indices[k];
        const site = sites[s];
        const phase = sitePhases[s];

        const x = Math.cos(siteAngles[s]) * site.orbitalRadius;
        const z = Math.sin(siteAngles[s]) * site.orbitalRadius;
        dummy.position.set(x, 0, z);
        dummy.rotation.set(site.rockSeed % 6.28, (site.rockSeed * 1.7) % 6.28, (site.rockSeed * 0.6) % 6.28);
        dummy.scale.setScalar(Math.max(0.0001, phase.rockScale * site.targetSize));
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);

        const normalizedR = radiusSpan > 0 ? (site.orbitalRadius - innerRadius) / radiusSpan : 0;
        const rc = resolveRadialColorInline(normalizedR, ROCK_COLOR_INNER, ROCK_COLOR_OUTER);
        this._reusableColor.setRGB(rc.r, rc.g, rc.b);
        mesh.setColorAt(k, this._reusableColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  _updateCamera(deltaTime, camera, epochPhase) {
    const outerRadius = this._data.outerRadius;
    const sites = this._data.clusterSites;
    const focusSite = sites[this._focusSiteIndex];

    const wideOrbitDistance = outerRadius * 2.6;
    const closeOrbitDistance = ROCK_BASE_RADIUS * 12; // a tight framing on the focus site during aggregation

    const t = epochPhase.cameraFocusT;
    const orbitDistance = wideOrbitDistance + (closeOrbitDistance - wideOrbitDistance) * t;

    this._cameraOrbitAngle += deltaTime * 0.045;
    const elevationAngle = 0.35 + Math.sin(this._elapsed * 0.05) * 0.18; // gentle ambient elevation drift, always a readable angle

    // Wide-view target: centered on the Sun (origin), as always.
    const wideX = Math.cos(this._cameraOrbitAngle) * Math.cos(elevationAngle) * wideOrbitDistance;
    const wideY = Math.sin(elevationAngle) * wideOrbitDistance;
    const wideZ = Math.sin(this._cameraOrbitAngle) * Math.cos(elevationAngle) * wideOrbitDistance;

    // Close-up target: centered on the focus site's OWN live position, not the origin.
    const siteX = Math.cos(this._siteAngles[this._focusSiteIndex]) * focusSite.orbitalRadius;
    const siteZ = Math.sin(this._siteAngles[this._focusSiteIndex]) * focusSite.orbitalRadius;
    const closeX = siteX + Math.cos(this._cameraOrbitAngle) * Math.cos(elevationAngle) * closeOrbitDistance;
    const closeY = Math.sin(elevationAngle) * closeOrbitDistance;
    const closeZ = siteZ + Math.sin(this._cameraOrbitAngle) * Math.cos(elevationAngle) * closeOrbitDistance;

    const targetX = wideX + (closeX - wideX) * t;
    const targetY = wideY + (closeY - wideY) * t;
    const targetZ = wideZ + (closeZ - wideZ) * t;
    const lookAtX = 0 + (siteX - 0) * t;
    const lookAtY = 0;
    const lookAtZ = 0 + (siteZ - 0) * t;

    const followT = 1 - Math.exp(-deltaTime / CAMERA_FOLLOW_TIME_CONSTANT);
    camera.position.x += (targetX - camera.position.x) * followT;
    camera.position.y += (targetY - camera.position.y) * followT;
    camera.position.z += (targetZ - camera.position.z) * followT;
    camera.lookAt(lookAtX, lookAtY, lookAtZ);
  }

  exit() {
    this._backdropPoints.geometry.dispose();
    this._backdropPoints.material.dispose();
    this._dustPoints.geometry.dispose();
    this._dustPoints.material.dispose();
    this._aggregatePoints.geometry.dispose();
    this._aggregatePoints.material.dispose();
    for (const mesh of this._rockMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this._sunCorePoints.geometry.dispose();
    this._sunCorePoints.material.dispose();
    this._sunCoronaPoints.geometry.dispose();
    this._sunCoronaPoints.material.dispose();
    this._glowTexture.dispose();
    // No eventBus listeners were registered by this scene, so there is
    // nothing to unsubscribe.
  }
}
