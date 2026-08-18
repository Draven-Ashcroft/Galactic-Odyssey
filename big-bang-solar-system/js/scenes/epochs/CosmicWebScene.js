/**
 * scenes/epochs/CosmicWebScene.js
 * ------------------------------------------------------------------
 * The Cosmic Web epoch's dedicated scene, replacing PlaceholderScene
 * for 'cosmic-web' in sceneRegistry.js. Follows the standard
 * enter()/update()/exit() contract from BaseScene exactly — `this.root`
 * is the THREE.Group BaseScene's constructor already creates; nothing
 * here creates a second THREE.Scene or THREE.Camera, and SceneManager
 * remains solely responsible for adding/removing `this.root`.
 *
 * SCIENTIFIC PURPOSE (stylized, not a simulation):
 * Communicates how small early-universe density fluctuations are
 * believed to be gravitationally amplified into the large-scale
 * "cosmic web" — filaments threading between dense nodes, with large
 * voids in between and galaxies concentrating in and around the
 * densest regions. This is an educational visualization, NOT a
 * cosmological N-body simulation — no gravity solver, no particle
 * physics, no attempt to match real large-scale-structure statistics.
 * See CosmicWebData.js for the deterministic procedural generator.
 *
 * DARK MATTER VISUAL REDESIGN (this pass): the previous version
 * rendered "nodes" as solid, opaque, epoch-colored icosahedra — which
 * read as ordinary glowing matter, not as an inferred, invisible
 * gravitational structure. The concept this epoch needs to
 * communicate is specifically: invisible dark matter -> gravitational
 * potential wells -> gas follows gravity -> filaments and nodes
 * emerge. That's now THREE visually and conceptually distinct layers:
 *   1. A GRAVITATIONAL FIELD (`_fieldPoints`) — a large, very dim,
 *      deep violet-indigo (`FIELD_COLOR`, deliberately darker/more
 *      saturated than the epoch's own lighter periwinkle accent used
 *      for gas) point cloud filling the whole volume. Each point's
 *      brightness is driven by a precomputed, normalized
 *      "gravitational potential" (`_fieldPotential`) — a simple
 *      inverse-square-ish sum over every node's mass and distance,
 *      NOT a real physics solve, just enough to make points near
 *      massive nodes read as denser/deeper than points in the voids.
 *      This NEVER becomes brighter than the gas layers (see the
 *      brightness ceiling in `_updateGravitationalField()`) and stays
 *      present-but-nearly-uniform at low progress, only visibly
 *      "resolving" into contrast as the epoch advances — "inferred
 *      from its gravitational effect, not glowing matter."
 *   2. POTENTIAL SHELLS (`_shellLines`) — a single combined
 *      `THREE.LineSegments` draw call: two concentric circles (an
 *      "equator" + a "meridian" plane) per shell, per node — a
 *      stand-in for "gravitational-potential contours," growing from
 *      nothing as each node's own well deepens. An earlier version
 *      used per-node `THREE.SphereGeometry` wireframe InstancedMesh
 *      layers instead (matching the stabilization audit's own
 *      Dark Ages/Galaxy Formation dark-matter technique exactly), but
 *      at this instance count (up to 52 overlapping, transparent,
 *      depthWrite:false instances) that measured a confirmed, severe,
 *      SUSTAINED frame-time regression during this pass's own
 *      testing (~35-40ms/frame baseline -> ~190-227ms/frame) — many
 *      overlapping semi-transparent objects without depthWrite can't
 *      use early-Z rejection, so total triangle count across every
 *      instance matters far more than in Dark Ages' single-layer,
 *      12-instance case. The combined-geometry approach here sidesteps
 *      that entirely (one draw call, direct typed-array writes each
 *      frame, no per-instance matrix/color overhead) while still
 *      reading as a round, sphere-suggestive contour from the camera's
 *      actual viewing angles. Same FIELD_COLOR as every other
 *      "invisible dark matter" representation in this project (Dark
 *      Ages' wells, Galaxy Formation's halos), so all three read as
 *      one consistent visual language even though the exact rendering
 *      technique differs here for performance reasons.
 *   3. GAS (`_filamentPoints`, now with added swirl motion — see
 *      "CURVED GAS TRAJECTORIES" below — plus `_nodePoints`, replacing
 *      the old solid icosahedra with a glow-sprite `THREE.Points`
 *      layer using the SAME technique every luminous object in this
 *      project uses since FirstStarsScene.js's "cartoonish polygon"
 *      fix) — the only genuinely BRIGHT, visible layer, tinted the
 *      epoch's own lighter accent color, never the field's violet.
 *      Nodes read as "gas piling up where the well is deepest," not
 *      as dark matter itself.
 *
 * CURVED GAS TRAJECTORIES: filament points now precompute a
 * perpendicular swirl basis/phase/amplitude at build time (the same
 * technique DarkAgesData.js/FirstStarsData.js use for gas falling
 * under gravity, replicated here — not imported, since it can only be
 * derived from filament origin/target positions this SCENE already
 * owns, and CosmicWebData.js must NOT change — see "SHARED DATA,
 * NEVER MODIFIED" below) so gas visibly curves toward each developing
 * structure instead of moving in a dead-straight line — "gravity
 * visibly understandable," not just movement toward a marker.
 *
 * SEQUENCING: field contrast and potential shells are driven by
 * `structuralEased`; gas (filament) motion uses `gasEased`, a copy of
 * the same curve delayed by a small fixed offset (4% of progress) —
 * so the field is always the first thing to (barely) develop, with
 * gas visibly responding just after, matching the requested
 * "invisible structure first -> gas traces it" causal order without
 * a heavier new phase-timing system.
 *
 * SHARED DATA, NEVER MODIFIED: `generateCosmicWebData()` (from
 * CosmicWebData.js) is reused verbatim by DarkAgesData.js,
 * FirstStarsData.js, and GalaxyGenerator.js with this SAME seed, for
 * genuine structural continuity (Dark Ages' wells = First Stars'
 * sites = Galaxy Formation's chosen sites). This file reads
 * `this._data.nodes`/`filamentPoints` but never adds to or changes
 * what CosmicWebData.js itself generates — every new visual layer
 * above (field points, potential shells, swirl parameters) is derived
 * ENTIRELY within this scene file, using its own locally-scoped seeded
 * RNG (`FIELD_LOCAL_SEED`, distinct from `COSMIC_WEB_SEED`), so the
 * shared generator's output for every other consumer is guaranteed
 * byte-for-byte unaffected by anything in this file.
 *
 * COSMIC-TIME BEHAVIOR:
 * All scientific/structural progression is driven by the epoch's own
 * `context.state.epochProgress` (0..1) — there is no second timeline.
 * The one thing NOT driven by epochProgress is the camera ease-in on
 * enter() — a local UI transition, unrelated to the scientific
 * timeline, using its own small elapsed-time counter.
 *
 * PERFORMANCE:
 * Gravitational field (~1,600 points desktop / 800 mobile) is one
 * shared THREE.Points/BufferGeometry (no glow texture/additive blend
 * on this specific layer — see _buildGravitationalField() — a
 * deliberately cheaper material given how dim this layer always is).
 * Potential shells are ONE combined THREE.LineSegments draw call (not
 * per-node/per-shell objects — see _buildPotentialShells() for why).
 * Filament gas (~1,400 points), nodes (~26), and galaxy sites (~80)
 * are each one shared Points/BufferGeometry or InstancedMesh, same as
 * before. All typed arrays allocated once in enter(), mutated in
 * place in update() — no per-frame allocation anywhere, including the
 * new swirl-curve math
 * (inlined directly in `_updateFilaments()`, consistent with every
 * other scene's own high-particle-count per-frame formulas).
 *
 * ARCHITECTURAL BOUNDARIES:
 * This scene never calls simulationState.set(...), never reaches into
 * another scene, and keeps no module-level/global state — everything
 * it owns lives on `this`, created in enter() and disposed in exit().
 */
import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { generateCosmicWebData } from './CosmicWebData.js';
import { createSeededRandom } from '../../utils/seededRandom.js';
import { clamp, easeInOutCubic } from '../../utils/mathUtils.js';

const COSMIC_WEB_SEED = 20260809; // fixed -> same structure every load; UNCHANGED, still matches every other consumer of generateCosmicWebData()
const HALF_EXTENT = 9;
const GALAXY_REVEAL_WINDOW = 0.18; // progress-units over which one galaxy site fades in
const CAMERA_TARGET_POSITION = new THREE.Vector3(7, 5.5, 17); // pulled back + angled to read the 3D depth
const CAMERA_LOOKAT = new THREE.Vector3(0, 0, 0);
const CAMERA_EASE_TIME_CONSTANT = 1.4; // seconds; local UI transition, not scientific time

// Dark matter's own visual language - see "DARK MATTER VISUAL
// REDESIGN" above. Deliberately a deeper, more saturated violet-
// indigo than the epoch's own lighter periwinkle accent (#7a8cff,
// used for gas/nodes below), so the two concepts read as visually
// distinct even though both sit in the blue-violet family.
const FIELD_COLOR = new THREE.Color('#4a2f8f');
const FIELD_LOCAL_SEED = COSMIC_WEB_SEED + 8801; // LOCAL to this scene only - see "SHARED DATA, NEVER MODIFIED" above
const FIELD_POINT_COUNT_DESKTOP = 1600;
const FIELD_POINT_COUNT_MOBILE = 800;
const POTENTIAL_SOFTENING = 1.2; // avoids the 1/distSq potential blowing up right at a node's own center
const SHELL_RADIUS_FRACTIONS = [0.6, 1.05]; // 2 nested "equipotential" shells per node (was 3), innermost tightest/brightest
const SHELL_BASE_RADIUS = 1.1;
const SHELL_CIRCLE_SEGMENTS = 20; // per circle, in the combined LineSegments geometry - see _buildPotentialShells()

// Swirl-curve tuning for gas trajectories - see "CURVED GAS
// TRAJECTORIES" above. Same formula shape as DarkAgesData.js/
// FirstStarsData.js's own spiral-infall constants, independently
// tuned here.
const SWIRL_AMPLITUDE_FRACTION = 0.14;
const SWIRL_TURNS = 0.65;

/** Cheap, one-time mobile heuristic — matches the project's own 640px CSS breakpoint. */
function isNarrowViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

/**
 * A small (64x64), soft, white-to-transparent radial gradient — same
 * technique every luminous object in this project uses since
 * FirstStarsScene.js's visual redesign, deliberately duplicated here
 * rather than shared (see that file's header — established precedent
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

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** Any two vectors perpendicular to `axis` and to each other, for placing the swirl around a gas point's own infall direction. */
function orthonormalBasis(axis) {
  const ref = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(axis, ref));
  const v = normalize(cross(axis, u));
  return { u, v };
}

export class CosmicWebScene extends BaseScene {
  enter(context) {
    const { epoch, camera } = context;
    const narrow = isNarrowViewport();

    this._data = generateCosmicWebData({
      seed: COSMIC_WEB_SEED,
      halfExtent: HALF_EXTENT,
      nodeCount: narrow ? 16 : 26,
      filamentPointsPerUnit: narrow ? 3.5 : 6,
      galaxySitesPerNode: narrow ? 2 : 3,
    });

    this._epochColor = new THREE.Color(epoch.color);
    this._galaxyColor = new THREE.Color(epoch.color).lerp(new THREE.Color('#ffffff'), 0.55);
    this._reusableColor = new THREE.Color(); // scratch, reused every frame — never reallocated
    this._glowTexture = createGlowTexture();

    this._buildGravitationalField(narrow);
    this._buildPotentialShells();
    this._buildFilaments();
    this._buildNodes();
    this._buildGalaxySites();

    // Local UI camera ease — see file header. Not part of the scientific timeline.
    this._cameraStartPosition = camera.position.clone();
    this._cameraEaseElapsed = 0;

    this._elapsed = 0;
  }

  _buildGravitationalField(narrow) {
    const count = narrow ? FIELD_POINT_COUNT_MOBILE : FIELD_POINT_COUNT_DESKTOP;
    const rand = createSeededRandom(FIELD_LOCAL_SEED);
    const nodes = this._data.nodes;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this._fieldPotential = new Float32Array(count); // normalized 0..1, precomputed once — never changes per frame

    let maxPotential = 0;
    const rawPotential = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const x = (rand() * 2 - 1) * HALF_EXTENT;
      const y = (rand() * 2 - 1) * HALF_EXTENT;
      const z = (rand() * 2 - 1) * HALF_EXTENT;
      const i3 = i * 3;
      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      // A simple stand-in "gravitational potential" - NOT a real
      // physics solve, just a smooth inverse-square-ish sum over every
      // node's mass/distance, enough to make points near massive
      // nodes read as denser than points sitting in a void.
      let potential = 0;
      for (const node of nodes) {
        const dx = x - node.x;
        const dy = y - node.y;
        const dz = z - node.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        potential += node.mass / (distSq + POTENTIAL_SOFTENING);
      }
      rawPotential[i] = potential;
      if (potential > maxPotential) maxPotential = potential;
    }

    const normalizer = maxPotential > 0 ? 1 / maxPotential : 0;
    for (let i = 0; i < count; i++) {
      this._fieldPotential[i] = rawPotential[i] * normalizer;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      // No texture/additive blending here on purpose - this layer is
      // ALWAYS extremely dim (see the tiny brightness ceiling in
      // _updateGravitationalField()), so a glow-sprite texture adds
      // real GPU cost (sampling + overdraw from additive blending)
      // for a visual difference that's imperceptible at these
      // brightness values. Simple alpha-blended flat points look
      // effectively identical here while being cheaper to render -
      // part of fixing the confirmed frame-time regression above.
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this._fieldPoints = new THREE.Points(geometry, material);
    this.root.add(this._fieldPoints);
  }

  _buildPotentialShells() {
    // A single combined THREE.LineSegments draw call - concentric
    // circles (two orthogonal planes per shell, per node) rather than
    // full InstancedMesh wireframe spheres. An earlier version used
    // SphereGeometry InstancedMesh here (matching Dark Ages/Galaxy
    // Formation's own dark-matter technique) but at this instance
    // count (shellCount x nodeCount = up to 52 overlapping,
    // transparent, depthWrite:false instances) that measured a
    // confirmed, severe, SUSTAINED frame-time regression (real
    // per-frame timing: ~35-40ms baseline -> ~190-227ms) - many
    // overlapping semi-transparent objects without depthWrite can't
    // use early-Z rejection, so total triangle count across every
    // instance matters far more than in Dark Ages' single-layer,
    // 12-instance case. A single combined line geometry sidesteps this
    // entirely (one draw call, no per-instance matrix/color overhead)
    // while still reading as "contour rings around each well" - two
    // circles per shell (an "equator" in the XZ plane, a "meridian" in
    // the XY plane) give a recognizably round, sphere-suggestive
    // silhouette from the camera's actual viewing angles without
    // needing full 3-great-circle sphere coverage.
    const nodes = this._data.nodes;
    const shellCount = SHELL_RADIUS_FRACTIONS.length;
    const planesPerShell = 2;
    const vertsPerCircle = SHELL_CIRCLE_SEGMENTS * 2; // LineSegments: 2 verts per segment
    const totalVerts = nodes.length * shellCount * planesPerShell * vertsPerCircle;

    const positions = new Float32Array(totalVerts * 3);
    const colors = new Float32Array(totalVerts * 3);
    // Precomputed once (setup time): the UNIT direction for each
    // vertex, before scaling by that node/shell's own current radius.
    // update() only needs to scale+translate this, not recompute the
    // trig every frame.
    this._shellBaseDir = new Float32Array(totalVerts * 3);
    this._shellNodeIndex = new Int32Array(totalVerts);
    this._shellShellIndex = new Uint8Array(totalVerts);

    let cursor = 0;
    for (let n = 0; n < nodes.length; n++) {
      for (let s = 0; s < shellCount; s++) {
        for (let plane = 0; plane < planesPerShell; plane++) {
          for (let seg = 0; seg < SHELL_CIRCLE_SEGMENTS; seg++) {
            const angleA = (seg / SHELL_CIRCLE_SEGMENTS) * Math.PI * 2;
            const angleB = ((seg + 1) / SHELL_CIRCLE_SEGMENTS) * Math.PI * 2;
            for (const angle of [angleA, angleB]) {
              const i3 = cursor * 3;
              if (plane === 0) {
                // "equator" - XZ plane
                this._shellBaseDir[i3] = Math.cos(angle);
                this._shellBaseDir[i3 + 1] = 0;
                this._shellBaseDir[i3 + 2] = Math.sin(angle);
              } else {
                // "meridian" - XY plane
                this._shellBaseDir[i3] = Math.cos(angle);
                this._shellBaseDir[i3 + 1] = Math.sin(angle);
                this._shellBaseDir[i3 + 2] = 0;
              }
              this._shellNodeIndex[cursor] = n;
              this._shellShellIndex[cursor] = s;
              cursor++;
            }
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    this._shellLines = new THREE.LineSegments(geometry, material);
    this.root.add(this._shellLines);
  }

  _buildFilaments() {
    const points = this._data.filamentPoints;
    const count = points.length;
    const rand = createSeededRandom(FIELD_LOCAL_SEED + 1); // separate stream from the field's own RNG use, still local to this scene

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    // Parallel typed arrays kept around for update() to lerp from,
    // without re-deriving anything from this._data every frame.
    this._filamentOrigins = new Float32Array(count * 3);
    this._filamentTargets = new Float32Array(count * 3);
    this._filamentBrightness = new Float32Array(count);
    // Swirl-curve parameters - see "CURVED GAS TRAJECTORIES" above.
    this._filamentBasisU = new Float32Array(count * 3);
    this._filamentBasisV = new Float32Array(count * 3);
    this._filamentSwirlPhase = new Float32Array(count);
    this._filamentSwirlDirection = new Float32Array(count);
    this._filamentSwirlAmplitude = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = points[i];
      const i3 = i * 3;
      this._filamentOrigins[i3] = p.originX;
      this._filamentOrigins[i3 + 1] = p.originY;
      this._filamentOrigins[i3 + 2] = p.originZ;
      this._filamentTargets[i3] = p.targetX;
      this._filamentTargets[i3 + 1] = p.targetY;
      this._filamentTargets[i3 + 2] = p.targetZ;
      this._filamentBrightness[i] = p.brightness;

      const travelDistance = Math.hypot(p.targetX - p.originX, p.targetY - p.originY, p.targetZ - p.originZ);
      const axis = normalize({ x: p.targetX - p.originX, y: p.targetY - p.originY, z: p.targetZ - p.originZ });
      const { u, v } = orthonormalBasis(axis);
      this._filamentBasisU[i3] = u.x;
      this._filamentBasisU[i3 + 1] = u.y;
      this._filamentBasisU[i3 + 2] = u.z;
      this._filamentBasisV[i3] = v.x;
      this._filamentBasisV[i3 + 1] = v.y;
      this._filamentBasisV[i3 + 2] = v.z;
      this._filamentSwirlPhase[i] = rand() * Math.PI * 2;
      this._filamentSwirlDirection[i] = rand() < 0.5 ? 1 : -1;
      this._filamentSwirlAmplitude[i] = travelDistance * SWIRL_AMPLITUDE_FRACTION;

      // Start at the scattered origin position, dim — see update().
      positions[i3] = p.originX;
      positions[i3 + 1] = p.originY;
      positions[i3 + 2] = p.originZ;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      // Reverted to the original flat-color material (no texture/
      // additive blend) - part of fixing the confirmed frame-time
      // regression above; at ~1,400 points, texture-sampled additive
      // blending added a meaningful, measured GPU cost for a visual
      // difference that's subtle at this point size and count.
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      depthWrite: false, // diffuse haze, not solid tubes — avoid points occluding each other harshly
    });

    this._filamentPoints = new THREE.Points(geometry, material);
    this.root.add(this._filamentPoints);
  }

  _buildNodes() {
    // Replaces the old solid IcosahedronGeometry InstancedMesh - a
    // faceted polyhedron read as ordinary glowing matter, not an
    // inferred structure. Nodes are GAS concentrating where the well
    // is deepest, so they use the same glow-sprite Points technique
    // as every other luminous object in this project, tinted the
    // epoch's own (not the field's) color.
    const nodes = this._data.nodes;
    const positions = new Float32Array(nodes.length * 3);
    const colors = new Float32Array(nodes.length * 3);

    nodes.forEach((node, i) => {
      positions[i * 3] = node.x;
      positions[i * 3 + 1] = node.y;
      positions[i * 3 + 2] = node.z;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.55,
      map: this._glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._nodePoints = new THREE.Points(geometry, material);
    this.root.add(this._nodePoints);
  }

  _buildGalaxySites() {
    const sites = this._data.galaxySites;
    const count = sites.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3); // starts at 0 -> invisible against the dark background

    for (let i = 0; i < count; i++) {
      const s = sites[i];
      positions[i * 3] = s.x;
      positions[i * 3 + 1] = s.y;
      positions[i * 3 + 2] = s.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this._galaxyPoints = new THREE.Points(geometry, material);
    this.root.add(this._galaxyPoints);
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const progress = context.state.epochProgress; // the ONE scientific timeline — never a second clock
    // Field/shells develop first; gas visibly responds just after -
    // see "SEQUENCING" in the file header.
    const structuralEased = easeInOutCubic(progress);
    const gasEased = easeInOutCubic(clamp((progress - 0.04) / 0.96, 0, 1));

    this._updateGravitationalField(structuralEased);
    this._updatePotentialShells(structuralEased);
    this._updateFilaments(gasEased);
    this._updateNodes(structuralEased);
    this._updateGalaxySites(progress);
    this._updateCamera(deltaTime, context.camera);

    // Slow ambient rotation for depth cues — subtle, not game-like.
    this.root.rotation.y = this._elapsed * 0.02;
  }

  _updateGravitationalField(structuralEased) {
    const colAttr = this._fieldPoints.geometry.attributes.color;
    const col = colAttr.array;
    const potential = this._fieldPotential;
    const count = potential.length;

    for (let i = 0; i < count; i++) {
      // Early on, potential contrast is barely perceptible - a nearly
      // uniform field; as structuralEased grows, high-potential points
      // pull ahead of low-potential ones, i.e. the field visibly
      // "resolves" into wells. The absolute brightness ceiling here is
      // deliberately tiny — "mostly invisible... never brighter than
      // the gas" — see the much larger brightness values in
      // _updateNodes()/_updateFilaments() for the contrast.
      const contrast = 0.15 + potential[i] * structuralEased * 0.85;
      const b = 0.05 + contrast * 0.1;
      const i3 = i * 3;
      col[i3] = FIELD_COLOR.r * b;
      col[i3 + 1] = FIELD_COLOR.g * b;
      col[i3 + 2] = FIELD_COLOR.b * b;
    }
    colAttr.needsUpdate = true;
  }

  _updatePotentialShells(structuralEased) {
    const nodes = this._data.nodes;
    const posAttr = this._shellLines.geometry.attributes.position;
    const colAttr = this._shellLines.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const baseDir = this._shellBaseDir;
    const nodeIndex = this._shellNodeIndex;
    const shellIndex = this._shellShellIndex;

    const count = nodeIndex.length;
    for (let i = 0; i < count; i++) {
      const n = nodeIndex[i];
      const s = shellIndex[i];
      const node = nodes[n];
      const fraction = SHELL_RADIUS_FRACTIONS[s];
      // Grows from nothing — "small fluctuations slowly grow into
      // gravitational potential wells" — modulated by each node's own
      // mass so stronger wells get visibly larger/more-developed
      // contours, not just brighter ones.
      const radius = SHELL_BASE_RADIUS * fraction * (0.5 + node.mass * 0.5) * structuralEased;

      const i3 = i * 3;
      pos[i3] = node.x + baseDir[i3] * radius;
      pos[i3 + 1] = node.y + baseDir[i3 + 1] * radius;
      pos[i3 + 2] = node.z + baseDir[i3 + 2] * radius;

      const brightness = (0.12 + structuralEased * 0.5) * (1 - s * 0.25); // outer shells dimmer than inner
      col[i3] = FIELD_COLOR.r * brightness;
      col[i3 + 1] = FIELD_COLOR.g * brightness;
      col[i3 + 2] = FIELD_COLOR.b * brightness;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateFilaments(gasEased) {
    const posAttr = this._filamentPoints.geometry.attributes.position;
    const colAttr = this._filamentPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const origins = this._filamentOrigins;
    const targets = this._filamentTargets;
    const brightness = this._filamentBrightness;
    const basisU = this._filamentBasisU;
    const basisV = this._filamentBasisV;
    const swirlPhase = this._filamentSwirlPhase;
    const swirlDirection = this._filamentSwirlDirection;
    const swirlAmplitude = this._filamentSwirlAmplitude;
    const epochColor = this._epochColor;
    const t = gasEased;

    // Same spiral-collapse formula as DarkAgesScene.js/
    // FirstStarsScene.js's own particle updates (see those files for
    // why this is inlined rather than calling a per-point function
    // that returns an object - same reasoning at ~1,400 points/frame).
    const count = brightness.length;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const baseX = origins[i3] + (targets[i3] - origins[i3]) * t;
      const baseY = origins[i3 + 1] + (targets[i3 + 1] - origins[i3 + 1]) * t;
      const baseZ = origins[i3 + 2] + (targets[i3 + 2] - origins[i3 + 2]) * t;

      const bump = 4 * t * (1 - t); // 0 at t=0 and t=1, peaks mid-journey — "trajectories visibly bend"
      const windAngle = swirlPhase[i] + swirlDirection[i] * t * SWIRL_TURNS * Math.PI * 2;
      const swirlR = swirlAmplitude[i] * bump;
      const cosA = Math.cos(windAngle);
      const sinA = Math.sin(windAngle);

      pos[i3] = baseX + (cosA * basisU[i3] + sinA * basisV[i3]) * swirlR;
      pos[i3 + 1] = baseY + (cosA * basisU[i3 + 1] + sinA * basisV[i3 + 1]) * swirlR;
      pos[i3 + 2] = baseZ + (cosA * basisU[i3 + 2] + sinA * basisV[i3 + 2]) * swirlR;

      // Faint at the start, clearer as structure develops.
      const b = 0.1 + brightness[i] * t * 0.85;
      col[i3] = epochColor.r * b;
      col[i3 + 1] = epochColor.g * b;
      col[i3 + 2] = epochColor.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateNodes(structuralEased) {
    const nodes = this._data.nodes;
    const colAttr = this._nodePoints.geometry.attributes.color;
    const col = colAttr.array;
    const epochColor = this._epochColor;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      // Density contrast increasing: nodes grow and brighten together,
      // modulated slightly by each node's own "mass" for variety -
      // apparent size comes from brightness (see FirstStarsScene.js's
      // established reasoning — PointsMaterial.size is material-wide,
      // not per-point), not a literal scale change.
      const brightness = 0.15 + structuralEased * (0.55 + node.mass * 0.45);
      const i3 = i * 3;
      col[i3] = epochColor.r * brightness;
      col[i3 + 1] = epochColor.g * brightness;
      col[i3 + 2] = epochColor.b * brightness;
    }
    colAttr.needsUpdate = true;
  }

  _updateGalaxySites(progress) {
    const sites = this._data.galaxySites;
    const colAttr = this._galaxyPoints.geometry.attributes.color;
    const col = colAttr.array;
    const galaxyColor = this._galaxyColor;

    for (let i = 0; i < sites.length; i++) {
      // Each site fades in over its own small window once `progress`
      // reaches its individually staggered revealProgress threshold —
      // continuous per-site, and staggered across sites, so nothing
      // "spawns" all at once.
      const localT = clamp((progress - sites[i].revealProgress) / GALAXY_REVEAL_WINDOW, 0, 1);
      const brightness = easeInOutCubic(localT);
      const i3 = i * 3;
      col[i3] = galaxyColor.r * brightness;
      col[i3 + 1] = galaxyColor.g * brightness;
      col[i3 + 2] = galaxyColor.b * brightness;
    }
    colAttr.needsUpdate = true;
  }

  _updateCamera(deltaTime, camera) {
    // Local UI transition only — deliberately NOT driven by epochProgress
    // (see file header). Exponential ease toward a vantage point that
    // shows the structure's genuine 3D depth.
    this._cameraEaseElapsed += deltaTime;
    const t = 1 - Math.exp(-this._cameraEaseElapsed / CAMERA_EASE_TIME_CONSTANT);
    camera.position.lerpVectors(this._cameraStartPosition, CAMERA_TARGET_POSITION, t);
    camera.lookAt(CAMERA_LOOKAT);
  }

  exit() {
    this._fieldPoints.geometry.dispose();
    this._fieldPoints.material.dispose();
    this._shellLines.geometry.dispose();
    this._shellLines.material.dispose();
    this._filamentPoints.geometry.dispose();
    this._filamentPoints.material.dispose();
    this._nodePoints.geometry.dispose();
    this._nodePoints.material.dispose();
    this._galaxyPoints.geometry.dispose();
    this._galaxyPoints.material.dispose();
    this._glowTexture.dispose();
    // No eventBus listeners were registered by this scene, so there is
    // nothing to unsubscribe.
  }
}
