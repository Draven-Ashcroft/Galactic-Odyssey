/**
 * scenes/epochs/DarkAgesScene.js
 * ------------------------------------------------------------------
 * The dedicated scene for 'dark-ages' (index 3), replacing
 * PlaceholderScene. Follows the standard enter()/update()/exit()
 * contract from BaseScene exactly — `this.root` is the THREE.Group
 * BaseScene's constructor already creates; nothing here creates a
 * second THREE.Scene or THREE.Camera, and SceneManager remains solely
 * responsible for adding/removing `this.root`. This file does not
 * modify FirstStarsScene.js or FirstStarsData.js — it only reuses
 * CosmicWebData.js's exported generator with FirstStarsData.js's exact
 * backdrop parameters (see DarkAgesData.js's file header).
 *
 * SCIENTIFIC PURPOSE (stylized, not a gravity simulation):
 * No stars exist anywhere in this epoch — there is no light source.
 * The only thing happening is gravity slowly drawing slightly denser
 * pockets of gas together, seeding the halos First Stars will later
 * ignite inside. This scene is the visual and conceptual INVERSE of
 * FirstStarsScene's radiation shells: instead of a boundary expanding
 * outward from a point as radiation propagates, twelve boundaries here
 * CONTRACT inward as gravity gathers matter — see "THE INVERSE-OF-
 * RADIATION DESIGN" below for exactly how.
 *
 * THE INVERSE-OF-RADIATION DESIGN:
 * Each of the 12 gravity-well sites gets a faint wireframe sphere
 * (`_wellMesh`, one InstancedMesh) whose RADIUS SHRINKS from large to
 * small as that site's own accretion timeline advances
 * (`shellRadiusT` in DarkAgesData.js runs 1 -> 0, the mirror image of
 * FirstStarsScene's `shellRadius` which runs 0 -> growing). Nothing
 * about it glows or brightens sharply — it stays dim and subtle
 * throughout, appropriate for an epoch with no light sources at all.
 * Independently, every diffuse gas particle eases from a widely
 * scattered starting position toward a small cluster near its nearest
 * gravity well (same origin -> target lerp technique used by every
 * other scene in this project), so the CONTRACTION reads at both the
 * boundary level and the particle level simultaneously — matter
 * visibly gathering inward, never blown outward.
 *
 * DARK MATTER LEADS, GAS FOLLOWS: the well and the gas particles
 * deliberately do NOT share one timeline. `_updateWells()` still uses
 * `phase.shellRadiusT`/`phase.wellStrength`, both derived from the
 * well's own smooth schedule; `_updateParticles()` instead uses
 * `phase.gasContractionT`, which lags behind that same schedule and
 * eases in with an ACCELERATING curve — see the long comment in
 * DarkAgesData.js for the physical reasoning (dark matter free-falls
 * and settles first; baryonic gas has to cool before it can follow,
 * and speeds up as it approaches the well rather than gently
 * decelerating). Concretely: the boundary finishes contracting
 * noticeably before the gas inside it finishes clustering.
 *
 * SPIRAL INFALL: gas particles no longer travel a dead-straight line
 * from origin to target — `_updateParticles()` adds a perpendicular
 * swirl (zero at both endpoints, peaking partway through the journey)
 * that winds around the straight path as it travels, the same
 * angular-momentum-motivated technique real accretion disks form
 * from. The formula is inlined here for performance (1500 particles
 * every frame) rather than calling DarkAgesData.js's
 * `resolveParticlePosition()` per particle — see the long comment
 * inside `_updateParticles()` before changing one copy without the
 * other. The rendered swirl amplitude is ALSO scaled by that
 * particle's node's own `wellStrength` (weaker early, more pronounced
 * as a node matures) — a node barely beginning to collapse shouldn't
 * show as much rotational character as one that's nearly settled.
 *
 * FILAMENTS: `_buildFilaments()`/`_updateFilaments()` render
 * `field.filamentPoints` — reused verbatim from
 * `generateCosmicWebData()` (see DarkAgesData.js's "FILAMENTS" note),
 * NOT regenerated. Each point eases from a scattered origin toward its
 * settled position on the connecting line between two nodes, using
 * `resolveFilamentRevealT()` (a plain number return, so — unlike
 * `resolveParticlePosition()` — calling it once per point here carries
 * no real allocation cost even at ~140 points/frame; no inlined copy
 * needed). Kept deliberately faint throughout — "extremely subtle" —
 * so students can tell matter is present without it reading as
 * already-formed structure.
 *
 * PROTO-STELLAR HINTS: `_buildProtoStars()`/`_updateProtoStars()`
 * render a SMALL InstancedMesh — only for the (typically 3) nodes
 * DarkAgesData.js marks `isProtoStarCandidate`, not all 12 — that
 * glows in, very faintly and small, only once that specific node's own
 * `wellStrength` is most of the way to fully settled
 * (`PROTO_STAR_WELL_THRESHOLD`). Because those candidate nodes are
 * guaranteed (by construction — see DarkAgesData.js) to be a subset of
 * the nodes First Stars will actually ignite, this hint genuinely
 * foreshadows where the first real stars appear, rather than
 * decorating an arbitrary node.
 *
 * NOT A SINGLE CENTRAL VORTEX: every particle, filament point, and
 * well is positioned and animated relative to ITS OWN nearest/owning
 * node — there is no shared "universe center" anywhere in this file.
 * The 12 wells stay spatially distributed across the whole volume for
 * the entire epoch. See DarkAgesData.js's matching note before adding
 * anything that would violate this.
 *
 * COSMIC-TIME BEHAVIOR:
 * Everything is driven by `context.state.epochProgress` (0..1) via
 * `resolveDarkAgesPhase()` (kept in DarkAgesData.js, testable without
 * Three.js). Each of the 12 sites accretes on its own staggered
 * schedule — gravity doesn't finish gathering every pocket of gas at
 * the same instant.
 *
 * The camera ease-in on enter() is, like every other scene in this
 * project, a local UI transition using its own short elapsed-time
 * counter — not part of the scientific timeline.
 *
 * PERFORMANCE:
 * One shared THREE.Points/BufferGeometry for all ~1,500 diffuse gas
 * particles desktop / 750 mobile (one draw call), tagged with a
 * parallel owner-node-index array. One InstancedMesh (12 instances)
 * for the contracting boundaries. Filaments (~140 points) are a
 * second shared Points buffer. Proto-stellar hints are a third, tiny
 * InstancedMesh (only as many instances as candidate nodes, typically
 * 3 — not one per node). All typed arrays are allocated once in
 * enter() and mutated in place in update() — no per-frame allocation.
 *
 * ARCHITECTURAL BOUNDARIES:
 * This scene never calls simulationState.set(...), never reaches into
 * another scene, and keeps no module-level/global state — everything
 * it owns lives on `this`, created in enter() and disposed in exit().
 */
import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { generateDarkAgesField, resolveDarkAgesPhase, resolveFilamentRevealT, SWIRL_TURNS } from './DarkAgesData.js';

const CAMERA_TARGET_POSITION = new THREE.Vector3(6, 4.5, 15);
const CAMERA_LOOKAT = new THREE.Vector3(0, 0, 0);
const CAMERA_EASE_TIME_CONSTANT = 1.4;

const MAX_WELL_RADIUS = 2.1; // how large a contracting boundary starts out
const PROTO_STAR_WELL_THRESHOLD = 0.75; // a candidate node's own wellStrength must clear this before its proto-stellar hint starts to appear

/** Cheap, one-time mobile heuristic — matches the project's own 640px CSS breakpoint, same as every other scene. */
function isNarrowViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

export class DarkAgesScene extends BaseScene {
  enter(context) {
    const { epoch, camera } = context;
    const narrow = isNarrowViewport();

    this._field = generateDarkAgesField({ particleCount: narrow ? 750 : 1500 });
    this._epochColor = new THREE.Color(epoch.color); // '#3b3550' — this epoch's own dim, dark accent
    this._reusableColor = new THREE.Color();

    this._buildParticles();
    this._buildWells();
    this._buildFilaments();
    this._buildProtoStars();

    this._cameraStartPosition = camera.position.clone();
    this._cameraEaseElapsed = 0;
    this._elapsed = 0;
  }

  _buildParticles() {
    const particles = this._field.particles;
    const nodes = this._field.nodes;
    const nodeIdToIndex = new Map(nodes.map((n, i) => [n.id, i]));
    const count = particles.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this._particleOrigins = new Float32Array(count * 3);
    this._particleTargets = new Float32Array(count * 3);
    this._particleBasisU = new Float32Array(count * 3);
    this._particleBasisV = new Float32Array(count * 3);
    this._particleSwirlPhase = new Float32Array(count);
    this._particleSwirlDirection = new Float32Array(count);
    this._particleSwirlAmplitude = new Float32Array(count);
    this._particleBrightness = new Float32Array(count);
    this._particleNodeIndex = new Int32Array(count);

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const i3 = i * 3;
      this._particleOrigins[i3] = p.originX;
      this._particleOrigins[i3 + 1] = p.originY;
      this._particleOrigins[i3 + 2] = p.originZ;
      this._particleTargets[i3] = p.targetX;
      this._particleTargets[i3 + 1] = p.targetY;
      this._particleTargets[i3 + 2] = p.targetZ;
      this._particleBasisU[i3] = p.basisUX;
      this._particleBasisU[i3 + 1] = p.basisUY;
      this._particleBasisU[i3 + 2] = p.basisUZ;
      this._particleBasisV[i3] = p.basisVX;
      this._particleBasisV[i3 + 1] = p.basisVY;
      this._particleBasisV[i3 + 2] = p.basisVZ;
      this._particleSwirlPhase[i] = p.swirlPhase;
      this._particleSwirlDirection[i] = p.swirlDirection;
      this._particleSwirlAmplitude[i] = p.swirlAmplitude;
      this._particleBrightness[i] = p.brightness;
      this._particleNodeIndex[i] = nodeIdToIndex.get(p.ownerNodeId);

      positions[i3] = p.originX;
      positions[i3 + 1] = p.originY;
      positions[i3 + 2] = p.originZ;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this._particlePoints = new THREE.Points(geometry, material);
    this.root.add(this._particlePoints);
  }

  _buildWells() {
    const nodes = this._field.nodes;
    // A genuinely round wireframe sphere, not a low-poly polyhedron -
    // dark matter halos are diffuse, smoothly-varying density
    // distributions (e.g. an NFW profile) with no sharp edge; a
    // faceted icosahedron visually implies geometric structure that
    // isn't physically there. Segment counts are modest (16x12) since
    // this is ONE shared geometry across all instances via
    // InstancedMesh below - the extra vertices are a one-time,
    // negligible cost, not multiplied per instance.
    const geometry = new THREE.SphereGeometry(1, 16, 12);
    const material = new THREE.MeshBasicMaterial({
      color: this._epochColor,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    this._wellMesh = new THREE.InstancedMesh(geometry, material, nodes.length);
    this._wellMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nodes.length * 3), 3);
    this._wellDummy = new THREE.Object3D();

    nodes.forEach((node, i) => {
      this._wellDummy.position.set(node.x, node.y, node.z);
      this._wellDummy.scale.setScalar(MAX_WELL_RADIUS);
      this._wellDummy.updateMatrix();
      this._wellMesh.setMatrixAt(i, this._wellDummy.matrix);
    });
    this._wellMesh.instanceMatrix.needsUpdate = true;

    this.root.add(this._wellMesh);
  }

  _buildFilaments() {
    // Reused verbatim from generateCosmicWebData() via
    // DarkAgesData.js — see that file's "FILAMENTS" note. Not
    // regenerated here; just rendered.
    const points = this._field.filamentPoints;
    const count = points.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this._filamentBrightness = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const p = points[i];
      const i3 = i * 3;
      positions[i3] = p.originX;
      positions[i3 + 1] = p.originY;
      positions[i3 + 2] = p.originZ;
      this._filamentBrightness[i] = p.brightness;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.028, // smaller than the diffuse gas points - "extremely subtle filamentary lines"
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this._filamentPoints = new THREE.Points(geometry, material);
    this.root.add(this._filamentPoints);
  }

  _buildProtoStars() {
    // Only as many instances as candidate nodes (typically 3), not
    // one per node - see "PROTO-STELLAR HINTS" above.
    const nodes = this._field.nodes;
    this._protoStarNodeIndices = [];
    nodes.forEach((n, i) => {
      if (n.isProtoStarCandidate) this._protoStarNodeIndices.push(i);
    });

    const geometry = new THREE.SphereGeometry(0.09, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: this._epochColor,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    this._protoStarMesh = new THREE.InstancedMesh(geometry, material, this._protoStarNodeIndices.length);
    this._protoStarMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this._protoStarNodeIndices.length * 3), 3);
    this._protoStarDummy = new THREE.Object3D();

    this._protoStarNodeIndices.forEach((nodeIdx, i) => {
      const node = nodes[nodeIdx];
      this._protoStarDummy.position.set(node.x, node.y, node.z);
      this._protoStarDummy.scale.setScalar(0.0001); // invisible until its node is nearly settled
      this._protoStarDummy.updateMatrix();
      this._protoStarMesh.setMatrixAt(i, this._protoStarDummy.matrix);
    });
    this._protoStarMesh.instanceMatrix.needsUpdate = true;

    this.root.add(this._protoStarMesh);
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const progress = context.state.epochProgress;

    this._phasesCache = this._field.nodes.map((node) => resolveDarkAgesPhase(node, progress));

    this._updateParticles();
    this._updateWells();
    this._updateFilaments(progress);
    this._updateProtoStars();
    this._updateCamera(deltaTime, context.camera);

    this.root.rotation.y = this._elapsed * 0.008; // very slow - this epoch is quiet, not energetic
  }

  _updateParticles() {
    const posAttr = this._particlePoints.geometry.attributes.position;
    const colAttr = this._particlePoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const origins = this._particleOrigins;
    const targets = this._particleTargets;
    const basisU = this._particleBasisU;
    const basisV = this._particleBasisV;
    const swirlPhase = this._particleSwirlPhase;
    const swirlDirection = this._particleSwirlDirection;
    const swirlAmplitude = this._particleSwirlAmplitude;
    const brightness = this._particleBrightness;
    const nodeIndex = this._particleNodeIndex;
    const phases = this._phasesCache;
    const epochColor = this._epochColor;

    // Same formula as resolveParticlePosition() in DarkAgesData.js,
    // inlined here rather than called per-particle: at 1500 particles
    // every frame, calling a function that allocates a small return
    // object each time is real per-frame allocation pressure (unlike
    // AtomFormationScene's comet trails, only 13 electrons). Keep
    // these two in sync if the formula ever changes - DarkAgesData.js
    // is the pure, tested reference; this is the perf-motivated copy.
    const count = brightness.length;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const phase = phases[nodeIndex[i]];
      const t = phase.gasContractionT;

      const baseX = origins[i3] + (targets[i3] - origins[i3]) * t;
      const baseY = origins[i3 + 1] + (targets[i3 + 1] - origins[i3 + 1]) * t;
      const baseZ = origins[i3 + 2] + (targets[i3 + 2] - origins[i3 + 2]) * t;

      const bump = 4 * t * (1 - t); // 0 at t=0 and t=1, peaks at t=0.5
      const windAngle = swirlPhase[i] + swirlDirection[i] * t * SWIRL_TURNS * Math.PI * 2;
      // Scaled by this node's own wellStrength - a node barely
      // beginning to collapse shouldn't show as much rotational
      // character as one that's nearly settled ("swirling becomes
      // slightly stronger" as a node matures).
      const swirlR = swirlAmplitude[i] * bump * (0.55 + phase.wellStrength * 0.45);
      const cosA = Math.cos(windAngle);
      const sinA = Math.sin(windAngle);

      pos[i3] = baseX + (cosA * basisU[i3] + sinA * basisV[i3]) * swirlR;
      pos[i3 + 1] = baseY + (cosA * basisU[i3 + 1] + sinA * basisV[i3 + 1]) * swirlR;
      pos[i3 + 2] = baseZ + (cosA * basisU[i3 + 2] + sinA * basisV[i3 + 2]) * swirlR;

      // Gently brightens as matter concentrates - density increasing,
      // still well short of First Stars' ignition brightness. Baseline
      // (pre-contraction) raised from an earlier pass that still read
      // as close to invisible on real hardware (~11-23/255) - the
      // diffuse field needs to be clearly present from the very start,
      // not just once contraction is underway.
      const b = brightness[i] * (0.85 + t * 0.5);
      col[i3] = epochColor.r * b;
      col[i3 + 1] = epochColor.g * b;
      col[i3 + 2] = epochColor.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateWells() {
    const nodes = this._field.nodes;
    const phases = this._phasesCache;
    const dummy = this._wellDummy;
    const epochColor = this._epochColor;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const phase = phases[i];

      // THE inverse-of-radiation cue: this boundary SHRINKS as
      // accretion proceeds, the mirror image of FirstStarsScene's
      // shells, which grow.
      const radius = Math.max(0.04, MAX_WELL_RADIUS * phase.shellRadiusT);
      dummy.position.set(node.x, node.y, node.z);
      dummy.scale.setScalar(radius);
      dummy.updateMatrix();
      this._wellMesh.setMatrixAt(i, dummy.matrix);

      // Baseline raised for the same real-hardware-visibility reason as
      // the particle field above - still a strengthening gravitational
      // well, not a light source, so this stays well short of First
      // Stars' glow.
      this._reusableColor.copy(epochColor).multiplyScalar(0.85 + phase.wellStrength * 0.35);
      this._wellMesh.setColorAt(i, this._reusableColor);
    }
    this._wellMesh.instanceMatrix.needsUpdate = true;
    if (this._wellMesh.instanceColor) this._wellMesh.instanceColor.needsUpdate = true;
  }

  _updateFilaments(progress) {
    const points = this._field.filamentPoints;
    const posAttr = this._filamentPoints.geometry.attributes.position;
    const colAttr = this._filamentPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const brightness = this._filamentBrightness;
    const epochColor = this._epochColor;

    // resolveFilamentRevealT() returns a plain number, not an object -
    // calling it once per point here carries no real allocation cost
    // even at ~140 points/frame, unlike resolveParticlePosition() in
    // _updateParticles() above (which DOES return an object and IS
    // inlined for that reason at 1500 particles/frame).
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const t = resolveFilamentRevealT(p, progress);
      const i3 = i * 3;

      pos[i3] = p.originX + (p.targetX - p.originX) * t;
      pos[i3 + 1] = p.originY + (p.targetY - p.originY) * t;
      pos[i3 + 2] = p.originZ + (p.targetZ - p.originZ) * t;

      // Extremely subtle throughout - a hint that matter is present at
      // t=0, gradually becoming a genuinely visible strand by t=1.
      // Deliberately much dimmer than the diffuse gas particles.
      const b = brightness[i] * (0.06 + t * 0.3);
      col[i3] = epochColor.r * b;
      col[i3 + 1] = epochColor.g * b;
      col[i3 + 2] = epochColor.b * b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateProtoStars() {
    const nodes = this._field.nodes;
    const dummy = this._protoStarDummy;
    const phases = this._phasesCache;
    const epochColor = this._epochColor;

    for (let i = 0; i < this._protoStarNodeIndices.length; i++) {
      const nodeIdx = this._protoStarNodeIndices[i];
      const node = nodes[nodeIdx];
      const phase = phases[nodeIdx];

      // Ramps in only once THIS node's own wellStrength is most of the
      // way to fully settled - tied to that specific node's own
      // maturity, not a single global time cutoff. See "PROTO-STELLAR
      // HINTS" in the file header for why these particular nodes.
      const glowT = Math.max(0, Math.min(1, (phase.wellStrength - PROTO_STAR_WELL_THRESHOLD) / (1 - PROTO_STAR_WELL_THRESHOLD)));

      dummy.position.set(node.x, node.y, node.z);
      dummy.scale.setScalar(Math.max(0.0001, glowT * 0.7)); // stays small even at full readiness - a hint, not a star
      dummy.updateMatrix();
      this._protoStarMesh.setMatrixAt(i, dummy.matrix);

      // A gentle pulse so it draws a LITTLE attention without reading
      // as an actual ignited star (First Stars' own scene handles
      // that). Brighter than the epoch's own dim base tone since this
      // represents something genuinely new beginning, but still capped
      // well short of anything resembling starlight.
      const pulse = 0.85 + Math.sin(this._elapsed * 2.2 + nodeIdx) * 0.15;
      this._reusableColor.copy(epochColor).multiplyScalar(glowT * 1.4 * pulse);
      this._protoStarMesh.setColorAt(i, this._reusableColor);
    }
    this._protoStarMesh.instanceMatrix.needsUpdate = true;
    if (this._protoStarMesh.instanceColor) this._protoStarMesh.instanceColor.needsUpdate = true;
  }

  _updateCamera(deltaTime, camera) {
    this._cameraEaseElapsed += deltaTime;
    const t = 1 - Math.exp(-this._cameraEaseElapsed / CAMERA_EASE_TIME_CONSTANT);
    camera.position.lerpVectors(this._cameraStartPosition, CAMERA_TARGET_POSITION, t);
    camera.lookAt(CAMERA_LOOKAT);
  }

  exit() {
    this._particlePoints.geometry.dispose();
    this._particlePoints.material.dispose();
    this._wellMesh.geometry.dispose();
    this._wellMesh.material.dispose();
    this._filamentPoints.geometry.dispose();
    this._filamentPoints.material.dispose();
    this._protoStarMesh.geometry.dispose();
    this._protoStarMesh.material.dispose();
    // No textures were created. No eventBus listeners were registered
    // by this scene, so there is nothing to unsubscribe.
  }
}
