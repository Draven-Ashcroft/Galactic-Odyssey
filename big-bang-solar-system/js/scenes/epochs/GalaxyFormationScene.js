/**
 * scenes/epochs/GalaxyFormationScene.js
 * ------------------------------------------------------------------
 * The Galaxy Formation epoch's dedicated scene, replacing
 * PlaceholderScene for 'galaxy-formation' in sceneRegistry.js. Follows
 * the standard enter()/update()/exit() contract from BaseScene exactly
 * — `this.root` is the THREE.Group BaseScene's constructor already
 * creates; nothing here creates a second THREE.Scene or THREE.Camera,
 * and SceneManager remains solely responsible for adding/removing
 * `this.root`. This file does not modify CosmicWebScene.js,
 * CosmicWebData.js, FirstStarsScene.js, or FirstStarsData.js — it only
 * imports and reuses CosmicWebData's exported generator (via
 * GalaxyGenerator.js, see that file's header for how and why).
 *
 * SCIENTIFIC PURPOSE (stylized, not a simulation):
 * A dark-matter halo is NOT a galaxy — see the "IMPORTANT SCIENTIFIC
 * RULE" note at the top of galaxies/GalaxyGenerator.js for the full
 * rationale, which this scene's visuals follow directly: only a
 * minority of the backdrop's halos host a visible galaxy, each galaxy
 * passes through a proto-galactic/clumpy phase before settling into a
 * spiral, elliptical, or irregular morphology, and one limited,
 * deterministic merger event demonstrates hierarchical assembly
 * without implying every galaxy collides. This is an educational
 * visualization, not a cosmological simulation — hierarchical galaxy
 * formation's earliest stages remain an active research area.
 *
 * CONTINUITY: the backdrop reuses the exact same seed and node
 * parameters CosmicWebScene.js uses, so the large-scale skeleton here
 * is literally the one shown in the Cosmic Web epoch — galaxies form
 * at that already-established structure, not a freshly randomized one.
 *
 * COSMIC-TIME BEHAVIOR:
 * Everything is driven by `context.state.epochProgress` (0..1) via
 * `resolveGalaxyPhase()` (see GalaxyGenerator.js) — no second timeline.
 * Per galaxy: invisible before its `formationStart`, then its stars
 * ease from scattered "proto-galactic" positions toward their settled
 * morphology-specific positions as it approaches `matureAt` (the same
 * origin -> target technique CosmicWebScene and FirstStarsScene use),
 * growing and brightening together. The one merging pair additionally
 * drifts toward a shared midpoint, gets a transient non-directional
 * "stretch" pulse and brightness boost (temporary star-formation
 * enhancement) during the merger window, and afterward the "b" galaxy
 * fades out while the "a" galaxy settles as a modestly larger remnant.
 *
 * The camera ease-in on enter() is, like the prior two scenes, a local
 * UI transition using its own short elapsed-time counter — not part of
 * the scientific timeline.
 *
 * GALAXY INTERACTION (click/tap a galaxy):
 * This scene subscribes to three events in enter() and stores the
 * unsubscribe functions eventBus.on() returns, calling them all in
 * exit() — the first scene in this project that needs to (every
 * earlier scene's exit() comment "no eventBus listeners were
 * registered" no longer applies here specifically, not by accident).
 *   - "input:canvas-tap" (raw, from main.js — see EventBus.js) is
 *     where this scene does its OWN raycasting against
 *     `this._galaxyPoints` using `context.camera` (captured once in
 *     enter()) and a THREE.Raycaster with a widened
 *     `params.Points.threshold` (THREE's default is too strict for
 *     reliable tap-picking against a sparse point cloud). A hit is
 *     only accepted if that galaxy's CURRENT phase.visible is true —
 *     an unformed galaxy's Points object still exists in the scene
 *     graph at opacity 0, so without this check it would still be
 *     "hittable" despite nothing being visibly there.
 *   - "ui:galaxy-enter-view" / "ui:galaxy-return-view" (emitted by
 *     UIManager's info-panel buttons) switch `this._cameraMode`
 *     between 'population' and 'closeup' — see `_updateCamera()`.
 * On every selection change, this scene emits ONE event type,
 * "galaxy:selected" (or "galaxy:deselected" for tapping empty space),
 * carrying the full current picture (type/massClass/starCount/
 * isMilkyWay/stageLabel/viewMode) — UIManager has no galaxy-domain
 * logic of its own, it only renders whatever payload it's given and
 * translates its buttons into the two "ui:galaxy-*" intents above.
 * Milky Way is never special-cased here beyond forwarding
 * `galaxy.isMilkyWay` in the payload — UIManager decides what button
 * that unlocks, and "continue to Milky Way" reuses the EXISTING
 * "ui:seek-epoch" intent (same mechanism the timeline ticks already
 * use), not a new transition path.
 *
 * PERFORMANCE:
 * ~12 galaxies x ~180-380 stars each (~3,500 total) as one
 * THEE.Points object per galaxy (NOT one per star, NOT one Mesh per
 * star) — each galaxy's own material is fine to keep per-galaxy
 * (per-GALAXY materials, a dozen of them, are not the "one material
 * per star" anti-pattern the project's performance guidance warns
 * against) since it lets per-frame brightness/fade be a single
 * `material.opacity` write rather than touching every star's color
 * every frame. Only the position attribute is mutated per frame (the
 * settle/merge blend), using pre-allocated typed arrays. Dark-matter
 * halo envelopes for all galaxies share a single InstancedMesh. Galaxy
 * generation happens once in enter(), never per frame. Counts scale
 * down on narrow viewports.
 *
 * ARCHITECTURAL BOUNDARIES:
 * This scene never calls simulationState.set(...), never reaches into
 * another scene, and keeps no module-level/global state — everything
 * it owns lives on `this`, created in enter() and disposed in exit(),
 * INCLUDING the three eventBus subscriptions the "GALAXY INTERACTION"
 * note above describes — unsubscribed in exit() like everything else.
 * Each galaxy's THREE.Points carries `userData = { galaxyId, type,
 * seed, massClass, isMilkyWay }` — used directly for raycast-hit
 * lookup (see `_handleCanvasTap()`).
 */
import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { generateGalaxyPopulation, resolveGalaxyPhase, resolveFormationStageLabel } from '../galaxies/GalaxyGenerator.js';

const HALF_EXTENT = 9;
const BACKDROP_COLOR = new THREE.Color('#5a5540'); // dim, desaturated amber — structure, not the star of the show
const HALO_ENVELOPE_MULTIPLIER = 2.3; // dark-matter halos extend well beyond the visible galaxy
const HALO_COLOR = new THREE.Color('#8f8aa8');
const CAMERA_TARGET_POSITION = new THREE.Vector3(7, 5, 15); // pulled back - framing a galaxy POPULATION, not one object
const CAMERA_LOOKAT = new THREE.Vector3(0, 0, 0);
const CAMERA_EASE_TIME_CONSTANT = 1.5;
const RAYCASTER_POINTS_THRESHOLD = 0.35; // world-space distance - THREE's default is too strict for reliable tap-picking against a sparse point cloud
const CLOSEUP_DISTANCE_MULTIPLIER = 3.5; // how many galaxy-radii away the close-up camera sits - shows overall shape (bulge/arms), not one oversized point
const CLOSEUP_FOLLOW_TIME_CONSTANT = 0.6; // per-frame damping speed while chasing a (possibly moving) selected galaxy in closeup mode

/** Cheap, one-time mobile heuristic — matches the project's own 640px CSS breakpoint. */
function isNarrowViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

export class GalaxyFormationScene extends BaseScene {
  enter(context) {
    const { camera, eventBus } = context;
    const narrow = isNarrowViewport();

    this._population = generateGalaxyPopulation({
      halfExtent: HALF_EXTENT,
      galaxySiteCount: narrow ? 8 : 12,
      filamentPointsPerUnit: narrow ? 3 : 6,
    });

    this._reusableVec = new THREE.Vector3(); // scratch, reused every frame — never reallocated
    this._camera = camera; // captured for use inside the tap handler, which fires outside update()'s normal per-frame context

    this._buildBackdrop();
    this._buildGalaxies();
    this._buildHaloEnvelopes();

    this._galaxyIndexById = new Map(this._population.galaxies.map((g, i) => [g.id, i]));
    this._raycaster = new THREE.Raycaster();
    this._raycaster.params.Points.threshold = RAYCASTER_POINTS_THRESHOLD;
    this._pointer = new THREE.Vector2();

    this._selectedGalaxyIndex = null;
    this._cameraMode = 'population'; // 'population' | 'closeup'

    // Stored so exit() can cleanly unsubscribe - the first scene in this
    // project that needs to. See "GALAXY INTERACTION" in the file header.
    this._eventBus = eventBus;
    this._unsubscribers = [
      eventBus.on('input:canvas-tap', (payload) => this._handleCanvasTap(payload)),
      eventBus.on('ui:galaxy-enter-view', () => this._handleEnterView()),
      eventBus.on('ui:galaxy-return-view', () => this._handleReturnView()),
    ];

    this._cameraStartPosition = camera.position.clone();
    this._cameraEaseElapsed = 0;
    this._elapsed = 0;
  }

  _buildBackdrop() {
    const points = this._population.backdropFilamentPoints;
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      // Static and faint — this structure is the same skeleton the
      // Cosmic Web epoch already showed fully formed; here it's context.
      const b = 0.07 + p.brightness * 0.09;
      colors[i * 3] = BACKDROP_COLOR.r * b;
      colors[i * 3 + 1] = BACKDROP_COLOR.g * b;
      colors[i * 3 + 2] = BACKDROP_COLOR.b * b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this._backdropPoints = new THREE.Points(geometry, material);
    this.root.add(this._backdropPoints);
  }

  _buildGalaxies() {
    // Per-galaxy render state, parallel to this._population.galaxies.
    this._galaxyPoints = [];
    this._galaxyOrigins = []; // Float32Array per galaxy - local-space scattered start positions
    this._galaxyTargets = []; // Float32Array per galaxy - local-space settled positions
    this._galaxyBasePositions = []; // THREE.Vector3 per galaxy - original site position, pre-allocated once
    this._galaxyMergerMidpoints = []; // THREE.Vector3 | null per galaxy, pre-allocated once

    for (const galaxy of this._population.galaxies) {
      const count = galaxy.stars.length;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const origins = new Float32Array(count * 3);
      const targets = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        const s = galaxy.stars[i];
        const i3 = i * 3;
        origins[i3] = s.originX;
        origins[i3 + 1] = s.originY;
        origins[i3 + 2] = s.originZ;
        targets[i3] = s.targetX;
        targets[i3 + 1] = s.targetY;
        targets[i3 + 2] = s.targetZ;
        positions[i3] = s.originX;
        positions[i3 + 1] = s.originY;
        positions[i3 + 2] = s.originZ;
        colors[i3] = s.r * s.brightness;
        colors[i3 + 1] = s.g * s.brightness;
        colors[i3 + 2] = s.b * s.brightness;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        size: 0.062,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        sizeAttenuation: true,
        depthWrite: false,
      });

      const points = new THREE.Points(geometry, material);
      points.position.set(galaxy.position.x, galaxy.position.y, galaxy.position.z);
      points.userData = { galaxyId: galaxy.id, type: galaxy.type, seed: galaxy.seed, massClass: galaxy.massClass, isMilkyWay: galaxy.isMilkyWay };

      this._galaxyPoints.push(points);
      this._galaxyOrigins.push(origins);
      this._galaxyTargets.push(targets);
      this._galaxyBasePositions.push(new THREE.Vector3(galaxy.position.x, galaxy.position.y, galaxy.position.z));
      this._galaxyMergerMidpoints.push(
        galaxy.mergerMidpoint ? new THREE.Vector3(galaxy.mergerMidpoint.x, galaxy.mergerMidpoint.y, galaxy.mergerMidpoint.z) : null
      );

      this.root.add(points);
    }
  }

  _buildHaloEnvelopes() {
    const galaxies = this._population.galaxies;
    // A genuinely round wireframe sphere, not a low-poly polyhedron -
    // see DarkAgesScene.js's _buildWells() for the full reasoning
    // (dark matter halos are diffuse/smooth, not faceted). Same
    // modest 16x12 segment counts, same one-shared-geometry-across-
    // all-instances cost profile via InstancedMesh below.
    const geometry = new THREE.SphereGeometry(1, 16, 12);
    const material = new THREE.MeshBasicMaterial({
      color: HALO_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.4, // scaled down further per-instance via color intensity in update()
      depthWrite: false,
    });

    this._haloMesh = new THREE.InstancedMesh(geometry, material, galaxies.length);
    this._haloMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(galaxies.length * 3), 3);
    this._haloDummy = new THREE.Object3D();

    galaxies.forEach((galaxy, i) => {
      this._haloDummy.position.set(galaxy.position.x, galaxy.position.y, galaxy.position.z);
      this._haloDummy.scale.setScalar(0.0001);
      this._haloDummy.updateMatrix();
      this._haloMesh.setMatrixAt(i, this._haloDummy.matrix);
    });
    this._haloMesh.instanceMatrix.needsUpdate = true;

    this.root.add(this._haloMesh);
  }

  _handleCanvasTap({ ndcX, ndcY }) {
    this._pointer.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._pointer, this._camera);

    const hits = this._raycaster.intersectObjects(this._galaxyPoints, false);
    // A hit is only accepted if that galaxy is CURRENTLY visible - an
    // unformed galaxy's Points object still exists in the scene graph
    // at opacity 0 (see _updateGalaxies()'s early `continue`), so
    // without this check it would still be "hittable" despite nothing
    // being visibly there yet. hits[] is already sorted nearest-first.
    const hit = hits.find((h) => {
      const idx = this._galaxyIndexById.get(h.object.userData.galaxyId);
      return idx !== undefined && this._phasesCache?.[idx]?.visible;
    });

    if (!hit) {
      if (this._selectedGalaxyIndex !== null) {
        this._selectedGalaxyIndex = null;
        if (this._cameraMode === 'closeup') this._resetPopulationCameraEase();
        this._cameraMode = 'population';
        this._eventBus.emit('galaxy:deselected');
      }
      return;
    }

    const galaxyIndex = this._galaxyIndexById.get(hit.object.userData.galaxyId);
    this._selectedGalaxyIndex = galaxyIndex;
    this._emitGalaxySelected();
  }

  _handleEnterView() {
    if (this._selectedGalaxyIndex === null) return;
    this._cameraMode = 'closeup';
    this._emitGalaxySelected();
  }

  _handleReturnView() {
    this._cameraMode = 'population';
    this._resetPopulationCameraEase();
    if (this._selectedGalaxyIndex !== null) this._emitGalaxySelected();
  }

  /** Starts the fixed start->end population-view ease fresh from wherever the camera actually is right now, so switching back from closeup never snaps. */
  _resetPopulationCameraEase() {
    this._cameraStartPosition = this._camera.position.clone();
    this._cameraEaseElapsed = 0;
  }

  /** Broadcasts the FULL current picture (galaxy info + view mode) - UIManager re-renders its panel from whatever this last said, no separate event types needed for "selected" vs "entered". */
  _emitGalaxySelected() {
    const galaxy = this._population.galaxies[this._selectedGalaxyIndex];
    const phase = this._phasesCache?.[this._selectedGalaxyIndex];
    if (!galaxy || !phase) return;
    this._eventBus.emit('galaxy:selected', {
      galaxyId: galaxy.id,
      type: galaxy.type,
      massClass: galaxy.massClass,
      starCount: galaxy.stars.length,
      isMilkyWay: galaxy.isMilkyWay,
      stageLabel: resolveFormationStageLabel(galaxy, phase),
      viewMode: this._cameraMode,
    });
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const progress = context.state.epochProgress;

    this._phasesCache = this._population.galaxies.map((galaxy) => resolveGalaxyPhase(galaxy, progress));

    this._updateGalaxies();
    this._updateHaloEnvelopes();
    this._updateCamera(deltaTime, context.camera);

    this.root.rotation.y = this._elapsed * 0.012; // slower than Cosmic Web/First Stars - this is the largest structure yet
  }

  _updateGalaxies() {
    const galaxies = this._population.galaxies;
    const phases = this._phasesCache;

    for (let g = 0; g < galaxies.length; g++) {
      const galaxy = galaxies[g];
      const phase = phases[g];
      const points = this._galaxyPoints[g];

      if (!phase.visible) {
        points.material.opacity = 0;
        continue;
      }

      // Position: settle within local space (handled via the star
      // buffer below) plus, for a merging pair, drift toward the
      // shared midpoint in scene space.
      const basePos = this._galaxyBasePositions[g];
      const midpoint = this._galaxyMergerMidpoints[g];
      if (midpoint && phase.mergerOffsetT > 0) {
        this._reusableVec.lerpVectors(basePos, midpoint, phase.mergerOffsetT);
        points.position.copy(this._reusableVec);
      } else {
        points.position.copy(basePos);
      }

      // Scale: overall growth, plus a transient non-directional stretch
      // pulse during the merger window as a simplified, honestly-
      // approximate stand-in for tidal distortion (not an oriented
      // physical calculation). A selected galaxy also gets a modest
      // highlight boost so it's visually obvious which one is picked.
      const isSelected = g === this._selectedGalaxyIndex;
      const highlight = isSelected ? 1.25 : 1;
      const sc = phase.scale * highlight;
      const stretch = phase.stretchT;
      points.scale.set(sc * (1 + stretch * 0.35), sc * (1 + stretch * 0.12), sc);

      points.material.opacity = Math.min(1, phase.brightness * (isSelected ? 1.3 : 1)) * (1 - phase.fadeOut);

      // Star positions: ease from scattered proto-galactic origin
      // toward the settled morphology-specific target.
      const posAttr = points.geometry.attributes.position;
      const pos = posAttr.array;
      const origins = this._galaxyOrigins[g];
      const targets = this._galaxyTargets[g];
      const t = phase.settleT;
      const count = pos.length / 3;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        pos[i3] = origins[i3] + (targets[i3] - origins[i3]) * t;
        pos[i3 + 1] = origins[i3 + 1] + (targets[i3 + 1] - origins[i3 + 1]) * t;
        pos[i3 + 2] = origins[i3 + 2] + (targets[i3 + 2] - origins[i3 + 2]) * t;
      }
      posAttr.needsUpdate = true;
    }
  }

  _updateHaloEnvelopes() {
    const galaxies = this._population.galaxies;
    const phases = this._phasesCache;
    const dummy = this._haloDummy;

    for (let g = 0; g < galaxies.length; g++) {
      const phase = phases[g];
      const points = this._galaxyPoints[g];
      // Halo envelope follows its galaxy's current position/scale so it
      // stays visually attached through formation and the merger drift
      // — simplified to share the galaxy's own visibility timeline
      // rather than a separate "halo exists before the galaxy" clock,
      // which would need a third independent timeline for a subtlety
      // that reads the same either way at this visual scale.
      dummy.position.copy(points.position);
      const envelopeScale = phase.visible ? this._population.galaxies[g].size * HALO_ENVELOPE_MULTIPLIER * phase.scale : 0.0001;
      dummy.scale.setScalar(envelopeScale);
      dummy.updateMatrix();
      this._haloMesh.setMatrixAt(g, dummy.matrix);

      // Extremely subtle regardless of galaxy brightness - dark matter
      // never reads as glowing luminous matter here.
      const haloBrightness = phase.visible ? 0.05 + phase.settleT * 0.03 : 0;
      this._reusableColorSet(this._haloMesh, g, haloBrightness);
    }
    this._haloMesh.instanceMatrix.needsUpdate = true;
    if (this._haloMesh.instanceColor) this._haloMesh.instanceColor.needsUpdate = true;
  }

  _reusableColorSet(instancedMesh, index, brightness) {
    const arr = instancedMesh.instanceColor.array;
    const i3 = index * 3;
    arr[i3] = HALO_COLOR.r * brightness;
    arr[i3 + 1] = HALO_COLOR.g * brightness;
    arr[i3 + 2] = HALO_COLOR.b * brightness;
  }

  _updateCamera(deltaTime, camera) {
    if (this._cameraMode === 'closeup' && this._selectedGalaxyIndex !== null) {
      // The target can be MOVING (a merging galaxy drifts toward its
      // midpoint), so this uses per-frame exponential damping toward
      // a freshly-computed live target every frame — not the fixed
      // start->end ease below, which assumes a stationary destination.
      const points = this._galaxyPoints[this._selectedGalaxyIndex];
      const galaxy = this._population.galaxies[this._selectedGalaxyIndex];
      const distance = galaxy.size * CLOSEUP_DISTANCE_MULTIPLIER;
      this._reusableVec.set(points.position.x + distance * 0.6, points.position.y + distance * 0.45, points.position.z + distance * 0.6);
      const followT = 1 - Math.exp(-deltaTime / CLOSEUP_FOLLOW_TIME_CONSTANT);
      camera.position.lerp(this._reusableVec, followT);
      camera.lookAt(points.position);
      return;
    }

    this._cameraEaseElapsed += deltaTime;
    const t = 1 - Math.exp(-this._cameraEaseElapsed / CAMERA_EASE_TIME_CONSTANT);
    camera.position.lerpVectors(this._cameraStartPosition, CAMERA_TARGET_POSITION, t);
    camera.lookAt(CAMERA_LOOKAT);
  }

  exit() {
    for (const unsubscribe of this._unsubscribers) unsubscribe();
    this._backdropPoints.geometry.dispose();
    this._backdropPoints.material.dispose();
    for (const points of this._galaxyPoints) {
      points.geometry.dispose();
      points.material.dispose();
    }
    this._haloMesh.geometry.dispose();
    this._haloMesh.material.dispose();
    // No textures were created.
  }
}
