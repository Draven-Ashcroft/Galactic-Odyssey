/**
 * scenes/epochs/AtomFormationScene.js
 * ------------------------------------------------------------------
 * The dedicated scene for 'atom-formation' (index 2), replacing
 * PlaceholderScene. Follows the standard enter()/update()/exit()
 * contract from BaseScene exactly — `this.root` is the THREE.Group
 * BaseScene's constructor already creates; nothing here creates a
 * second THREE.Scene or THREE.Camera, and SceneManager remains solely
 * responsible for adding/removing `this.root`.
 *
 * EDUCATIONAL PURPOSE (Class 12 level, explicitly simplified):
 * Shows nucleus + six electrons revolving across three mutually
 * perpendicular planes (horizontal/XY, vertical/XZ, transverse/YZ) as
 * the primary, camera-centered atom, plus three smaller illustrative
 * atoms of increasing complexity (1, 2, then 4 electrons) for the
 * "several atoms form" narrative. Nucleon counts are for visual
 * variety only, not specific elements — see AtomFormationData.js.
 *
 * WHY ELECTRONS ARE ON ROTATING PATHS HERE (unlike other scenes):
 * Earlier this scene used diffuse probability clouds specifically to
 * avoid the "planets on fixed orbits" look. That was deliberately
 * replaced, on explicit request, with this classic 3-plane revolving
 * model — closer to the simplified Bohr-style diagrams actually used
 * in NCERT Class 11/12 chemistry as a stepping stone before quantum
 * orbitals. This is a conscious, explicitly-requested exception to
 * the "no fixed circular paths" principle other scenes in this
 * project still follow (CosmicWebScene, EarlyUniverseScene, etc.) —
 * not an inconsistency. It's why the epoch summary (data/epochs.js)
 * carries an explicit caveat about quantum orbitals vs. fixed paths;
 * don't remove that caveat if this file changes again.
 *
 * COSMIC-TIME BEHAVIOR vs. REAL-TIME BEHAVIOR — two separate clocks,
 * on purpose:
 *   - `context.state.epochProgress` (the scientific timeline) drives
 *     `resolveAtomPhase()`: whether an atom's nucleus/electron-system
 *     has "formed" yet, and their overall opacity/scale.
 *   - A local `this._elapsed` (real seconds, accumulated every frame
 *     regardless of play/pause — the same technique every scene in
 *     this project already uses for camera easing and ambient
 *     rotation) drives each electron's ANGLE via
 *     `resolveElectronPosition()`. Electrons keep revolving smoothly
 *     once visible; nothing about their angle is tied to cosmic time.
 *
 * PERFORMANCE:
 * Nucleons (~19 total across 4 atoms) and electrons (13 total) each
 * use one shared THREE.InstancedMesh — no per-particle Mesh objects.
 * Static orbital guide rings are THREE.LineLoop geometry (built once,
 * never re-tessellated), at most 6 total across all 4 atoms, now kept
 * quite faint — the dynamic comet-tail trail (`_trailPoints`, ONE
 * shared THREE.Points buffer covering every electron's recent path,
 * ~130 points total) is what actually reads as motion; the ring is
 * just a faint guide to the full path. All typed arrays are allocated
 * once in enter() and mutated in place in update().
 *
 * PROFESSIONAL-POLISH ADDITIONS (see AtomFormationData.js for the math):
 *  - Comet-tail trails: each electron's last ~0.4s of motion, fading
 *    with age, computed fresh every frame from the SAME position
 *    formula the electron itself uses (`resolveElectronTrail()`) — no
 *    history buffer, so it can never drift out of sync with the
 *    electron's actual path.
 *  - Settle pulse: a brief, tasteful brightness rise as each atom's
 *    electron system finishes forming (`resolveSettlePulse()`) — a
 *    storytelling flourish, not a physical claim that anything
 *    actually flashes when an electron becomes bound.
 *  - Electron revolution speed was slowed for this pass (see
 *    BASE_ANGULAR_SPEED in AtomFormationData.js) — easier to visually
 *    track, less "fast toy spin," more documentary-paced.
 *
 * ARCHITECTURAL BOUNDARIES:
 * This scene never calls simulationState.set(...), never reaches into
 * another scene, and keeps no module-level/global state — everything
 * it owns lives on `this`, created in enter() and disposed in exit().
 */
import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { generateAtomPopulation, resolveAtomPhase, resolveElectronPosition, resolveElectronTrail, resolveSettlePulse, TRAIL_SEGMENT_COUNT } from './AtomFormationData.js';

const PROTON_COLOR = new THREE.Color('#ff9d5c'); // warm - distinguishable from neutrons at a glance
const NEUTRON_COLOR = new THREE.Color('#c9ccd6'); // neutral grey-white
const ELECTRON_COLOR = new THREE.Color('#5fb4ff'); // "small bright blue glowing particle" per the brief
const TRAIL_COLOR = new THREE.Color('#3d7aa8'); // dimmer than the electrons themselves - subtle, not thick/bright

const CAMERA_TARGET_POSITION = new THREE.Vector3(1.3, 0.95, 2.5); // close, framing the primary atom clearly on a phone screen
const CAMERA_LOOKAT = new THREE.Vector3(0, 0, 0); // the primary atom sits at the origin
const CAMERA_EASE_TIME_CONSTANT = 1.3;

function buildTrailRing(plane, radius) {
  const segments = 64;
  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    let px, py, pz;
    if (plane === 'horizontal') {
      px = x; py = y; pz = 0;
    } else if (plane === 'vertical') {
      px = x; py = 0; pz = y;
    } else {
      px = 0; py = x; pz = y;
    }
    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: TRAIL_COLOR, transparent: true, opacity: 0 });
  return new THREE.LineLoop(geometry, material);
}

export class AtomFormationScene extends BaseScene {
  enter(context) {
    const { camera } = context;

    this._population = generateAtomPopulation();

    this._buildNucleons();
    this._buildElectrons();
    this._buildTrails();
    this._buildTrailArcs();

    this._cameraStartPosition = camera.position.clone();
    this._cameraEaseElapsed = 0;
    this._elapsed = 0;
  }

  _buildNucleons() {
    const atoms = this._population.atoms;
    let totalNucleons = 0;
    for (const atom of atoms) totalNucleons += atom.nucleons.length;

    const geometry = new THREE.SphereGeometry(0.026, 8, 8);
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 });
    this._nucleonMesh = new THREE.InstancedMesh(geometry, material, totalNucleons);
    this._nucleonMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(totalNucleons * 3), 3);
    this._nucleonDummy = new THREE.Object3D();

    this._nucleonAtomIndex = new Int32Array(totalNucleons);
    this._nucleonLocalPos = new Float32Array(totalNucleons * 3);
    this._nucleonIsProton = new Uint8Array(totalNucleons);

    let cursor = 0;
    atoms.forEach((atom, atomIndex) => {
      for (const nucleon of atom.nucleons) {
        this._nucleonAtomIndex[cursor] = atomIndex;
        this._nucleonLocalPos[cursor * 3] = nucleon.x;
        this._nucleonLocalPos[cursor * 3 + 1] = nucleon.y;
        this._nucleonLocalPos[cursor * 3 + 2] = nucleon.z;
        this._nucleonIsProton[cursor] = nucleon.isProton ? 1 : 0;
        cursor++;
      }
    });

    this.root.add(this._nucleonMesh);
  }

  _buildElectrons() {
    const atoms = this._population.atoms;
    let totalElectrons = 0;
    for (const atom of atoms) totalElectrons += atom.electrons.length;

    // Small bright glowing spheres, distinct from the (smaller, dimmer) nucleons.
    const geometry = new THREE.SphereGeometry(0.045, 10, 10);
    const material = new THREE.MeshBasicMaterial({ color: ELECTRON_COLOR, transparent: true, opacity: 0.95 });
    this._electronMesh = new THREE.InstancedMesh(geometry, material, totalElectrons);
    this._electronDummy = new THREE.Object3D();

    this._electronAtomIndex = new Int32Array(totalElectrons);
    this._electronRefs = new Array(totalElectrons); // the electron data record itself, for angle resolution

    let cursor = 0;
    atoms.forEach((atom, atomIndex) => {
      for (const electron of atom.electrons) {
        this._electronAtomIndex[cursor] = atomIndex;
        this._electronRefs[cursor] = electron;
        cursor++;
      }
    });

    this.root.add(this._electronMesh);
  }

  _buildTrails() {
    // One ring per DISTINCT plane actually used by each atom (not per
    // electron - a plane's two electrons share one ring). Radius comes
    // from an actual electron on that plane, not a hardcoded constant,
    // so a ring is always correct for whichever shell uses that plane.
    // Kept faint - a "this is the full path" guide now that the
    // brighter comet-tail trail (_buildTrailArcs below) is the
    // prominent, moving element.
    this._trails = []; // { line, atomIndex }
    this._population.atoms.forEach((atom, atomIndex) => {
      const planesUsed = [...new Set(atom.electrons.map((e) => e.plane))];
      for (const plane of planesUsed) {
        const radius = atom.electrons.find((e) => e.plane === plane).radius;
        const ring = buildTrailRing(plane, radius);
        const atomPos = atom.position;
        ring.position.set(atomPos.x, atomPos.y, atomPos.z);
        this._trails.push({ line: ring, atomIndex });
        this.root.add(ring);
      }
    });
  }

  _buildTrailArcs() {
    // One shared Points buffer for every electron's comet-tail trail -
    // TRAIL_SEGMENT_COUNT points per electron, fading with age.
    // Positions/colors are fully recomputed each frame in
    // _updateTrailArcs() via resolveElectronTrail(), so only the
    // buffer sizing happens here.
    const atoms = this._population.atoms;
    let totalElectrons = 0;
    for (const atom of atoms) totalElectrons += atom.electrons.length;
    const totalPoints = totalElectrons * TRAIL_SEGMENT_COUNT;

    const positions = new Float32Array(totalPoints * 3);
    const colors = new Float32Array(totalPoints * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.032,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // reads as a glow trailing the electron, not a dim dot train
    });

    this._trailPoints = new THREE.Points(geometry, material);
    this.root.add(this._trailPoints);
  }

  update(deltaTime, context) {
    this._elapsed += deltaTime;
    const progress = context.state.epochProgress;

    this._phasesCache = this._population.atoms.map((atom) => resolveAtomPhase(atom, progress));

    this._updateNucleons();
    this._updateElectrons();
    this._updateTrails();
    this._updateTrailArcs();
    this._updateCamera(deltaTime, context.camera);

    this.root.rotation.y = this._elapsed * 0.01; // slow ambient rotation for depth cues, subtle
  }

  _updateNucleons() {
    const atoms = this._population.atoms;
    const dummy = this._nucleonDummy;
    const count = this._nucleonAtomIndex.length;

    for (let i = 0; i < count; i++) {
      const atomIndex = this._nucleonAtomIndex[i];
      const atom = atoms[atomIndex];
      const phase = this._phasesCache[atomIndex];
      const i3 = i * 3;

      // A very subtle breathing pulse once formed - purely a liveliness
      // cue (nuclei don't literally pulse), kept small so it never
      // reads as the nucleus "growing" after it's already settled.
      const breathe = phase.nucleusScale >= 0.999 ? 1 + Math.sin(this._elapsed * 1.6 + atomIndex) * 0.035 : 1;

      dummy.position.set(
        atom.position.x + this._nucleonLocalPos[i3],
        atom.position.y + this._nucleonLocalPos[i3 + 1],
        atom.position.z + this._nucleonLocalPos[i3 + 2]
      );
      dummy.scale.setScalar(Math.max(0.0001, phase.nucleusScale) * breathe);
      dummy.updateMatrix();
      this._nucleonMesh.setMatrixAt(i, dummy.matrix);

      const isProton = this._nucleonIsProton[i] === 1;
      this._nucleonMesh.setColorAt(i, isProton ? PROTON_COLOR : NEUTRON_COLOR);
    }
    this._nucleonMesh.instanceMatrix.needsUpdate = true;
    if (this._nucleonMesh.instanceColor) this._nucleonMesh.instanceColor.needsUpdate = true;
  }

  _updateElectrons() {
    const atoms = this._population.atoms;
    const dummy = this._electronDummy;
    const count = this._electronAtomIndex.length;
    const elapsed = this._elapsed;

    for (let i = 0; i < count; i++) {
      const atomIndex = this._electronAtomIndex[i];
      const atom = atoms[atomIndex];
      const phase = this._phasesCache[atomIndex];
      const electron = this._electronRefs[i];

      // The continuous real-time revolution - see file header for why
      // this uses `elapsed` (real seconds) rather than epochProgress.
      const local = resolveElectronPosition(electron, elapsed);
      dummy.position.set(atom.position.x + local.x, atom.position.y + local.y, atom.position.z + local.z);
      // Reveal via SCALE, not material opacity - this InstancedMesh's
      // single material is shared across all 4 atoms, so a shared
      // opacity would incorrectly tie every atom's reveal timing to
      // whichever atom's phase was read last. Scale is per-instance,
      // so each electron correctly reveals on its OWN atom's timeline
      // (same technique the nucleon InstancedMesh already uses). A
      // brief settle-pulse adds a small scale bump as formation
      // finishes - see resolveSettlePulse()'s comment in the data file.
      const pulse = resolveSettlePulse(phase.electronSystemT);
      dummy.scale.setScalar(Math.max(0.0001, phase.electronSystemT) * (1 + pulse * 0.4));
      dummy.updateMatrix();
      this._electronMesh.setMatrixAt(i, dummy.matrix);
    }
    this._electronMesh.instanceMatrix.needsUpdate = true;
  }

  _updateTrails() {
    for (const { line, atomIndex } of this._trails) {
      const phase = this._phasesCache[atomIndex];
      // Kept faint - a path guide, not the prominent moving element
      // now that the comet-tail trail exists (see _updateTrailArcs).
      line.material.opacity = phase.electronSystemT * 0.18;
    }
  }

  _updateTrailArcs() {
    const posAttr = this._trailPoints.geometry.attributes.position;
    const colAttr = this._trailPoints.geometry.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;
    const electronRefs = this._electronRefs;
    const electronAtomIndex = this._electronAtomIndex;
    const atoms = this._population.atoms;
    const elapsed = this._elapsed;

    // One resolveElectronTrail() call per electron (13, not per point) -
    // reuses the exact same tested formula the electron itself moves
    // by, rather than duplicating that math here.
    let cursor = 0;
    for (let e = 0; e < electronRefs.length; e++) {
      const electron = electronRefs[e];
      const atom = atoms[electronAtomIndex[e]];
      const phase = this._phasesCache[electronAtomIndex[e]];
      const trail = resolveElectronTrail(electron, elapsed);

      for (let s = 0; s < trail.length; s++) {
        const point = trail[s];
        const i3 = cursor * 3;
        pos[i3] = atom.position.x + point.x;
        pos[i3 + 1] = atom.position.y + point.y;
        pos[i3 + 2] = atom.position.z + point.z;

        const b = point.ageT * point.ageT * phase.electronSystemT * 0.55; // fades faster near the tail's oldest end, gated by this atom's own reveal
        col[i3] = ELECTRON_COLOR.r * b;
        col[i3 + 1] = ELECTRON_COLOR.g * b;
        col[i3 + 2] = ELECTRON_COLOR.b * b;
        cursor++;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  _updateCamera(deltaTime, camera) {
    this._cameraEaseElapsed += deltaTime;
    const t = 1 - Math.exp(-this._cameraEaseElapsed / CAMERA_EASE_TIME_CONSTANT);
    camera.position.lerpVectors(this._cameraStartPosition, CAMERA_TARGET_POSITION, t);
    camera.lookAt(CAMERA_LOOKAT);
  }

  exit() {
    this._nucleonMesh.geometry.dispose();
    this._nucleonMesh.material.dispose();
    this._electronMesh.geometry.dispose();
    this._electronMesh.material.dispose();
    this._trailPoints.geometry.dispose();
    this._trailPoints.material.dispose();
    for (const { line } of this._trails) {
      line.geometry.dispose();
      line.material.dispose();
    }
    // No eventBus listeners were registered by this scene, so there is
    // nothing to unsubscribe.
  }
}
