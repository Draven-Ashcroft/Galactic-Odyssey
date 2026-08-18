/**
 * scenes/epochs/AtomFormationData.js
 * ------------------------------------------------------------------
 * Pure procedural data model for the 'atom-formation' epoch (index 2,
 * ~1s to ~380,000 yr — nucleosynthesis through recombination). Zero
 * Three.js dependency — same convention as every other epochs/*Data.js
 * file, testable in plain Node.
 *
 * VISUAL STYLE — READ BEFORE EDITING:
 * This file was previously built around diffuse probability CLOUDS
 * (s/p-orbital-shaped point scatters) specifically to avoid any
 * resemblance to "electrons on planetary orbits." That approach was
 * deliberately replaced, on explicit request, with a classic 3-plane
 * revolving-electron model — closer to the Bohr-style diagrams
 * actually used in NCERT Class 11/12 chemistry as a simplified
 * stepping stone before quantum-mechanical orbitals. This is a
 * DELIBERATE, EXPLICITLY-REQUESTED exception to the "no fixed circular
 * paths" principle used elsewhere in this project (see
 * CosmicWebScene.js, EarlyUniverseScene.js, etc. for scenes where that
 * principle still fully applies) — not an inconsistency introduced by
 * accident. Because the visual now DOES show electrons on rotating
 * paths, the epoch summary (data/epochs.js) carries an explicit
 * caveat: electrons are actually described by quantum orbitals, not
 * fixed planetary-like paths, and what's shown here is a simplified
 * visualization. Don't drop that caveat if this file changes again.
 *
 * Six electrons are distributed across three MUTUALLY PERPENDICULAR
 * circular paths, each pinned to one coordinate plane:
 *   'horizontal' = XY plane (z always 0)
 *   'vertical'   = XZ plane (y always 0)
 *   'transverse' = YZ plane (x always 0)
 * Two electrons per active plane, one clockwise and one
 * counter-clockwise, each with its own slightly different angular
 * speed and starting phase so the six never move in lockstep.
 *
 * SHELL STRUCTURE — added for realism, not just visual variety:
 * Electrons aren't all at the same distance from the nucleus. The
 * first 2 (which always land in the 'horizontal' plane, by
 * construction of PLANE_FILL_ORDER below) belong to an inner shell —
 * smaller radius, faster — and any remaining electrons (which always
 * land in 'vertical'/'transverse') belong to an outer shell — larger
 * radius, slower. That inner-faster/outer-slower relationship mirrors
 * the real Bohr model (orbital speed falls off with shell radius) and
 * is the same reason real electron shells are drawn as concentric
 * rings, not one ring. As a bonus, capping the inner shell at 2
 * electrons (SHELL_CAPACITY below) happens to match how light real
 * elements actually fill shells: 1 electron = hydrogen-like, 2 = a
 * filled inner shell (helium-like), 2+2 and 2+4 = an inner shell plus
 * a partially-filled outer one (beryllium-like, carbon-like) — this
 * wasn't hand-tuned per atom, it falls out of the same capacity rule
 * applied to every electron count. Still an illustrative
 * simplification, not a periodic table — see the note above.
 *
 * Nucleon counts on the four illustrative atoms below are chosen for
 * visual variety only — NOT meant to identify specific elements or
 * isotopes, even where a count happens to coincide with a real one.
 * "Do not attempt to represent every element" — this is a Class 12
 * conceptual visualization (nucleus + electrons occupying orbitals =
 * atom), not a periodic table.
 *
 * Shape of one entry in the returned `atoms` array:
 *   {
 *     id, protons, neutrons, position: {x,y,z}, isPrimary,
 *     formationStart, matureAt,             // electron-system timeline
 *     nucleons: [{ x,y,z, isProton }],       // local to the atom's own position
 *     electrons: [{
 *       plane: 'horizontal'|'vertical'|'transverse',
 *       shellIndex: 0|1,                     // 0 = inner/faster, 1 = outer/slower
 *       direction: 1|-1,                     // 1 = clockwise, -1 = counter-clockwise
 *       angularSpeed,                        // radians/sec
 *       phaseOffset,                         // radians
 *       radius,
 *     }],
 *   }
 */
import { createSeededRandom } from '../../utils/seededRandom.js';
import { clamp, easeInOutCubic } from '../../utils/mathUtils.js';

const DEFAULTS = {
  seed: 12000003,
};

const NUCLEUS_RADIUS = 0.07; // tiny relative to even the inner shell's radius, on purpose
const BASE_ANGULAR_SPEED = 0.62; // rad/s - inner shell's speed; one revolution roughly every 10 seconds - deliberately unhurried and easy to visually track, not a fast toy-like spin

// Two concentric shells rather than one ring at a fixed distance - see
// "SHELL STRUCTURE" above. SHELL_CAPACITY[0]=2 is a hard rule (not
// tunable per atom): the first 2 electrons of ANY atom fill the inner
// shell, everything past that fills the outer one.
const SHELL_CAPACITY = [2, 4];
const SHELL_RADII = [0.32, 0.58]; // inner smaller, outer larger
const SHELL_SPEED_SCALE = [1, 1 / Math.SQRT2]; // outer shell orbits slower - same qualitative trend as v ~ 1/n in the real Bohr model

// Plane fill order: horizontal pair first, then vertical, then
// transverse — an atom with fewer electrons simply doesn't reach the
// later planes yet, rather than needing a separate "fewer planes"
// config per atom. Because SHELL_CAPACITY[0] is also 2, the
// 'horizontal' pair and the inner shell are always the same two
// electrons - plane and shell align by construction, not by accident.
const PLANE_FILL_ORDER = ['horizontal', 'horizontal', 'vertical', 'vertical', 'transverse', 'transverse'];

// Four illustrative atoms of increasing complexity, the last one being
// the full 6-electron / 3-plane showcase the visual design centers on.
const ATOM_CONFIGS = [
  { id: 'atom-0', protons: 1, neutrons: 0, electronCount: 1, position: { x: -4.5, y: 0.3, z: 0.3 }, isPrimary: false },
  { id: 'atom-1', protons: 2, neutrons: 2, electronCount: 2, position: { x: -3.0, y: -0.4, z: -0.5 }, isPrimary: false },
  { id: 'atom-2', protons: 4, neutrons: 5, electronCount: 4, position: { x: -1.5, y: 0.4, z: 0.2 }, isPrimary: false },
  { id: 'atom-3', protons: 6, neutrons: 6, electronCount: 6, position: { x: 0, y: 0, z: 0 }, isPrimary: true },
];

function generateNucleons(rand, protons, neutrons) {
  const total = protons + neutrons;
  const nucleons = new Array(total);
  for (let i = 0; i < total; i++) {
    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = rand() * 2 - 1;
    const len = Math.hypot(dirX, dirY, dirZ) || 1;
    const r = NUCLEUS_RADIUS * Math.pow(rand(), 0.6); // fills the small cluster, mildly denser toward center
    nucleons[i] = { x: (dirX / len) * r, y: (dirY / len) * r, z: (dirZ / len) * r, isProton: i < protons };
  }
  return nucleons;
}

function generateElectrons(rand, electronCount) {
  const electrons = [];
  for (let i = 0; i < electronCount; i++) {
    const plane = PLANE_FILL_ORDER[i];
    const shellIndex = i < SHELL_CAPACITY[0] ? 0 : 1;
    const direction = i % 2 === 0 ? 1 : -1; // each plane's pair: one clockwise, one counter-clockwise
    const speedJitter = 0.85 + rand() * 0.3; // "slightly different angular velocities" so pairs don't stay mirrored forever
    electrons.push({
      plane,
      shellIndex,
      direction,
      angularSpeed: BASE_ANGULAR_SPEED * SHELL_SPEED_SCALE[shellIndex] * speedJitter,
      phaseOffset: rand() * Math.PI * 2,
      radius: SHELL_RADII[shellIndex],
    });
  }
  return electrons;
}

/**
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {{ seed, atoms }}
 */
export function generateAtomPopulation(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const rand = createSeededRandom(cfg.seed);

  const atoms = ATOM_CONFIGS.map((config, index) => {
    const nucleons = generateNucleons(rand, config.protons, config.neutrons);
    const electrons = generateElectrons(rand, config.electronCount);

    // Staggered per atom - electrons bind progressively across the
    // epoch, not all at once.
    const formationStart = 0.16 + index * 0.1 + rand() * 0.05;
    const matureAt = formationStart + 0.16 + rand() * 0.12;

    return {
      id: config.id,
      protons: config.protons,
      neutrons: config.neutrons,
      position: config.position,
      isPrimary: config.isPrimary,
      nucleons,
      electrons,
      formationStart,
      matureAt,
    };
  });

  return { seed: cfg.seed, atoms };
}

// Shared across every atom: nucleosynthesis is fast relative to the
// epoch's full span, so all nuclei appear together, early, rather than
// staggered like the (much slower) electron-binding step per atom.
export const NUCLEUS_APPEAR_START = 0.0;
export const NUCLEUS_APPEAR_END = 0.06;

/**
 * Pure function: given one atom and the epoch's current progress
 * (0..1), resolve what a renderer needs this frame. Mirrors the
 * resolveStarPhase()/resolveGalaxyPhase()/resolveDarkAgesPhase()
 * pattern from the other epochs/*Data.js files.
 *
 * @returns {{ nucleusScale: number, electronSystemT: number }}
 *   nucleusScale: 0..1, eases in once nucleosynthesis "happens"
 *   electronSystemT: 0..1, eases in as this atom's electrons become
 *     bound — drives electron/trail/label opacity, NOT their angle
 *     (angle is continuous real-time rotation, handled entirely in
 *     the scene — see AtomFormationScene.js)
 */
export function resolveAtomPhase(atom, progress) {
  const p = progress;
  const nucleusT = clamp((p - NUCLEUS_APPEAR_START) / Math.max(0.001, NUCLEUS_APPEAR_END - NUCLEUS_APPEAR_START), 0, 1);

  if (p < atom.formationStart) {
    return { nucleusScale: easeInOutCubic(nucleusT), electronSystemT: 0 };
  }
  const electronSystemT = clamp((p - atom.formationStart) / Math.max(0.001, atom.matureAt - atom.formationStart), 0, 1);
  return { nucleusScale: easeInOutCubic(nucleusT), electronSystemT: easeInOutCubic(electronSystemT) };
}

/**
 * Pure function: given one electron and elapsed real time (seconds,
 * NOT epoch progress - see the file header), return its current local
 * position within its plane. Kept here, alongside the electron data
 * itself, so the angle math is testable without Three.js.
 *
 * @param {object} electron - one entry from atom.electrons
 * @param {number} elapsedSec
 * @returns {{x:number, y:number, z:number}}
 */
export function resolveElectronPosition(electron, elapsedSec) {
  const angle = electron.phaseOffset + electron.direction * electron.angularSpeed * elapsedSec;
  const r = electron.radius;
  switch (electron.plane) {
    case 'horizontal': // XY plane
      return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, z: 0 };
    case 'vertical': // XZ plane
      return { x: Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r };
    case 'transverse': // YZ plane
    default:
      return { x: 0, y: Math.cos(angle) * r, z: Math.sin(angle) * r };
  }
}

// Comet-tail trail: TRAIL_SEGMENT_COUNT points sampled at successively
// earlier moments, fading with age. Reuses resolveElectronPosition
// itself (evaluated at slightly-earlier elapsedSec values) rather than
// re-deriving the angle math or keeping a rolling position history —
// the trail is always exactly consistent with the electron's own
// motion because it's computed from the SAME formula, just sampled a
// few times in the recent past.
export const TRAIL_SEGMENT_COUNT = 10;
export const TRAIL_STEP_SEC = 0.045; // ~0.4s of recent motion, total

/**
 * @param {object} electron
 * @param {number} elapsedSec
 * @returns {Array<{x:number,y:number,z:number,ageT:number}>} oldest first, newest (current position) last; ageT: 0 = oldest/faintest, 1 = current/brightest
 */
export function resolveElectronTrail(electron, elapsedSec) {
  const points = new Array(TRAIL_SEGMENT_COUNT);
  for (let i = 0; i < TRAIL_SEGMENT_COUNT; i++) {
    const stepsAgo = TRAIL_SEGMENT_COUNT - 1 - i;
    const pos = resolveElectronPosition(electron, elapsedSec - stepsAgo * TRAIL_STEP_SEC);
    points[i] = { x: pos.x, y: pos.y, z: pos.z, ageT: i / (TRAIL_SEGMENT_COUNT - 1) };
  }
  return points;
}

// A brief, tasteful brightness flourish as an atom's electron system
// finishes forming - not a physical claim (nothing "flashes" when an
// electron becomes bound), just a professional-feeling "settle" cue,
// the same storytelling role FirstStarsScene's supernova brightness
// spike plays for a very different, physically real event. Peaks
// around electronSystemT=0.9, back to 0 by electronSystemT=1.
export function resolveSettlePulse(electronSystemT) {
  const t = clamp(electronSystemT, 0, 1);
  if (t < 0.75 || t >= 1) return 0;
  const local = (t - 0.75) / 0.25; // 0..1 across the pulse window
  return Math.sin(local * Math.PI); // smooth rise and fall, 0 at both ends
}
