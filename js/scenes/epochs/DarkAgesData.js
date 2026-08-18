/**
 * scenes/epochs/DarkAgesData.js
 * ------------------------------------------------------------------
 * Pure procedural data model for the 'dark-ages' epoch (index 3,
 * ~380,000 yr to ~150 Myr). Zero Three.js dependency — same
 * convention as every other epochs/*Data.js file, testable in plain
 * Node.
 *
 * SCIENTIFIC PURPOSE (stylized, not a gravity simulation):
 * No stars exist yet — there is no light source anywhere in this
 * epoch. The only thing happening is gravity slowly pulling slightly
 * denser pockets of gas together, seeding the halos that will host the
 * First Stars. Visually, that's the literal INVERSE of the expanding
 * radiation shells FirstStarsScene.js uses once stars ignite: instead
 * of a shell growing outward from a point, this epoch shows a
 * boundary CONTRACTING inward, and instead of gas being blown apart by
 * radiation, gas is being gradually drawn together by gravity — see
 * DarkAgesScene.js's file header for exactly how that contraction is
 * rendered.
 *
 * DARK MATTER LEADS, GAS FOLLOWS: the shrinking boundary and the
 * visible gas particles are deliberately NOT on the same timeline.
 * Dark matter doesn't interact electromagnetically, so it free-falls
 * into a gravitational potential efficiently and settles first; the
 * boundary here (see `contractionT`/`shellRadiusT` below) represents
 * that dark-matter-dominated potential well, tightening on its own
 * schedule. Baryonic gas, by contrast, has to shed energy
 * (radiatively) before it can fall in, so it genuinely lags behind —
 * `gasContractionT` uses the SAME per-node timeline shifted later by
 * `GAS_LAG_FRACTION` of that node's own duration, and an ACCELERATING
 * (ease-in, not the well's smooth ease-in-out) curve, since infalling
 * matter speeds up as it approaches a mass concentration rather than
 * gently decelerating into place. This is the standard qualitative
 * picture of hierarchical structure formation — not a claim that this
 * models the actual gas/dark-matter dynamics quantitatively.
 *
 * CONTINUITY WITH FIRST STARS: the gravity-well positions below reuse
 * `generateCosmicWebData()` with the EXACT SAME seed and node
 * parameters `FirstStarsData.js` uses for its own backdrop — not just
 * the same technique, the same 12 positions. By the end of this
 * epoch's contraction, matter has gathered at precisely the halo sites
 * First Stars starts from, so the two epochs connect seamlessly rather
 * than each inventing its own independent structure.
 *
 * NOT A SINGLE CENTRAL VORTEX — this is a hard constraint, not a
 * preference. All twelve gravity wells are spatially distributed
 * across the full volume (same backdrop node layout used everywhere
 * else in this project); nothing here ever computes a single shared
 * "center of the universe" for particles to converge on. Every
 * particle falls toward whichever of the 12 wells is nearest to where
 * IT started, independently. Filaments (below) connect PAIRS of
 * nearby wells, not one node to all others. If a future edit adds
 * anything that computes a single global target position, it violates
 * this constraint — don't.
 *
 * SPIRAL INFALL — added for accuracy and visual richness: gas falling
 * straight toward a mass concentration along a dead-straight line is a
 * simplification; real infalling matter carries some angular momentum,
 * which is exactly why accretion disks form. Each particle's path
 * (`resolveParticlePosition()` below) is the straight origin->target
 * line PLUS a perpendicular swirl that's zero at both endpoints and
 * peaks partway through the journey (`4*t*(1-t)`, a smooth bump), with
 * the swirl angle winding continuously as t advances — so particles
 * visibly curl around their infall path rather than sliding along a
 * ruler-straight line, arriving exactly on target either way. Swirl
 * amplitude scales with each particle's own straight-line travel
 * distance (SWIRL_AMPLITUDE_FRACTION), not a fixed size, so particles
 * that barely need to move don't swirl in an oversized loop. The
 * perpendicular basis and swirl parameters are precomputed once per
 * particle in generateDarkAgesField() (they don't change frame to
 * frame) — resolveParticlePosition() itself is then pure arithmetic,
 * safe to call every particle, every frame. DarkAgesScene.js also
 * scales the rendered swirl by that node's own `wellStrength` (weaker
 * early, more pronounced as a node matures) — see that file's comment.
 *
 * FILAMENTS — reused, not reinvented: `generateCosmicWebData()`
 * already returns `filamentPoints`, each carrying BOTH a scattered
 * `origin` position and a settled `target` position on the line
 * between two nodes (see CosmicWebData.js's own file header — this is
 * the exact same "gravitational amplification" story CosmicWebScene.js
 * already tells for the LATER 'cosmic-web' epoch). Dark Ages reuses
 * that same data, un-modified, and reveals it on ITS OWN timeline
 * instead: each filament's reveal window is the AVERAGE of its two
 * endpoint nodes' own accretionStart/matureAt (`buildFilamentTimelines()`
 * below), so filament formation is naturally staggered in step with
 * the SAME halo-accretion process driving the gas, not a disconnected
 * second timeline. By progress=1, every filament point sits exactly
 * on its settled target — precisely the static positions
 * FirstStarsData.js's OWN backdrop already renders, so Dark Ages
 * visually organizes INTO exactly the structure First Stars begins
 * with, rather than resetting between epochs.
 *
 * PROTO-STELLAR HINTS: a small number of the highest-MASS nodes
 * (`PROTO_STAR_NODE_COUNT`, sorted the same way FirstStarsData.js
 * sorts its own star-site candidates — since both files share the
 * same seed, these ARE a subset of the nodes First Stars will actually
 * ignite, not an unrelated guess) get a marked
 * `isProtoStarCandidate: true`. DarkAgesScene.js gives those nodes a
 * very faint, small glow that ramps in only once THAT node's own
 * `wellStrength` is already most of the way to fully settled — tied to
 * that specific node's own maturity, not a single global time cutoff,
 * so it naturally reads as "the densest few regions, once they're far
 * enough along" rather than a synchronized flourish.
 *
 * PACING: node accretion durations were extended somewhat for this
 * pass (see the duration formula in generateDarkAgesField()) for a
 * calmer, less rushed default feel — on top of, not instead of, last
 * pass's fix to the gas easing curve's SHAPE (GAS_EASE_ACCEL_BLEND).
 * Those two fixes address different things: curve shape controls
 * whether motion feels like a sudden snap; duration controls how much
 * of the epoch's fixed real-time window a node's contraction spans.
 *
 * Shape of the returned object:
 *   {
 *     seed, halfExtent,
 *     nodes: [{ id, x, y, z, accretionStart, matureAt, isProtoStarCandidate }],
 *     particles: [{
 *       ownerNodeId,
 *       originX/Y/Z,   // widely-scattered starting position (diffuse gas)
 *       targetX/Y/Z,   // where it ends up, clustered near its owner node
 *       basisUX/Y/Z, basisVX/Y/Z,  // precomputed perpendicular basis for the swirl
 *       swirlPhase, swirlDirection, swirlAmplitude,
 *       brightness,
 *     }],
 *     filamentPoints: [{
 *       originX/Y/Z, targetX/Y/Z,   // reused verbatim from CosmicWebData.js
 *       accretionStart, matureAt,   // THIS filament's own reveal window (averaged from its 2 endpoint nodes)
 *       brightness,
 *     }],
 *   }
 */
import { generateCosmicWebData } from './CosmicWebData.js';
import { createSeededRandom } from '../../utils/seededRandom.js';
import { clamp, easeInOutCubic } from '../../utils/mathUtils.js';

// Deliberately IDENTICAL to FirstStarsData.js's own backdrop config —
// see the file header. Any change here should be made in both places
// at once, or the continuity between the two epochs breaks.
const BACKDROP_SEED = 41500001;
const BACKDROP_HALF_EXTENT = 9;
const BACKDROP_NODE_COUNT = 12;
const BACKDROP_MIN_NODE_SPACING = 3.6;
const BACKDROP_MAX_FILAMENTS_PER_NODE = 2;
const BACKDROP_MAX_FILAMENT_DISTANCE = 7.0;
const BACKDROP_FILAMENT_POINTS_PER_UNIT = 3;

const DEFAULTS = {
  particleCount: 1500,
  haloClusterRadius: 0.55, // how tightly matter has gathered near a node by the time it's "mature"
};

// How far behind the dark-matter-dominated potential well the visible
// gas particles trail, as a fraction of each node's own accretion
// duration - see "DARK MATTER LEADS, GAS FOLLOWS" above.
const GAS_LAG_FRACTION = 0.18;
// How much of gas's easing curve is the accelerating (ease-in) cubic
// vs. the well's own smooth ease-in-out - see the long comment inside
// resolveDarkAgesPhase() before raising this back toward 1.
const GAS_EASE_ACCEL_BLEND = 0.35;

// Spiral infall tuning - see "SPIRAL INFALL" above. SWIRL_TURNS is
// exported: DarkAgesScene.js inlines this same formula directly in
// its hot per-particle loop (1500 particles/frame - too many to call
// resolveParticlePosition() and allocate a return object per particle
// without it showing up as real per-frame allocation pressure, unlike
// AtomFormationScene's comet trails at only 13 electrons), so it needs
// the same constant, not a second hardcoded copy of it.
const SWIRL_AMPLITUDE_FRACTION = 0.16; // peak perpendicular bulge, as a fraction of a particle's own straight-line travel distance
export const SWIRL_TURNS = 0.8; // how many full rotations the swirl winds through over one particle's whole infall

// A minority of the 12 nodes get a proto-stellar hint late in the
// epoch - see "PROTO-STELLAR HINTS" above.
const PROTO_STAR_NODE_COUNT = 3;

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** Any two vectors perpendicular to `axis` and to each other, for placing the swirl around a particle's own infall direction. */
function orthonormalBasis(axis) {
  const ref = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(axis, ref));
  const v = normalize(cross(axis, u));
  return { u, v };
}

/**
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {{ seed, halfExtent, nodes, particles }}
 */
export function generateDarkAgesField(options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  // Same seed/params as FirstStarsData.js's backdrop, on purpose - see
  // file header. Deliberately NOT reading FirstStarsData.js's own
  // DEFAULTS object (that would couple two unrelated files just to
  // save six literals); duplicated here, called out clearly instead.
  const backdrop = generateCosmicWebData({
    seed: BACKDROP_SEED,
    halfExtent: BACKDROP_HALF_EXTENT,
    nodeCount: BACKDROP_NODE_COUNT,
    minNodeSpacing: BACKDROP_MIN_NODE_SPACING,
    maxFilamentsPerNode: BACKDROP_MAX_FILAMENTS_PER_NODE,
    maxFilamentDistance: BACKDROP_MAX_FILAMENT_DISTANCE,
    filamentPointsPerUnit: BACKDROP_FILAMENT_POINTS_PER_UNIT,
    galaxySitesPerNode: 0,
  });

  const rand = createSeededRandom(BACKDROP_SEED + 3); // separate stream from the backdrop's own internal RNG use

  // Same "sort by mass, take the top N" selection FirstStarsData.js
  // uses for its own star sites - since both files share the same
  // seed/nodes, these ARE guaranteed to be a subset of the nodes First
  // Stars will actually ignite. See "PROTO-STELLAR HINTS" above.
  const protoStarNodeIds = new Set(
    [...backdrop.nodes].sort((a, b) => b.mass - a.mass).slice(0, PROTO_STAR_NODE_COUNT).map((n) => n.id)
  );

  const nodes = backdrop.nodes.map((n) => {
    // Staggered per node - different pockets of gas accrete on
    // slightly different schedules, not a single synchronized wave.
    // Duration extended somewhat from the previous pass (was
    // 0.3+rand()*0.35) for a calmer, less rushed default feel - see
    // "PACING" in the file header.
    const accretionStart = 0.04 + rand() * 0.28;
    const matureAt = accretionStart + 0.34 + rand() * 0.4;
    return { id: n.id, x: n.x, y: n.y, z: n.z, accretionStart, matureAt, isProtoStarCandidate: protoStarNodeIds.has(n.id) };
  });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const particles = new Array(cfg.particleCount);
  for (let i = 0; i < cfg.particleCount; i++) {
    // Diffuse gas: uniform-in-volume, same homogeneous seeding
    // technique used for the early universe's particle field -
    // nothing clustered or biased toward any point at the start.
    const originX = (rand() * 2 - 1) * BACKDROP_HALF_EXTENT;
    const originY = (rand() * 2 - 1) * BACKDROP_HALF_EXTENT;
    const originZ = (rand() * 2 - 1) * BACKDROP_HALF_EXTENT;

    // Gravity's pull: each particle drifts toward whichever node is
    // nearest to where it started - not toward a single shared center.
    let nearest = nodes[0];
    let nearestDist = Infinity;
    for (const node of nodes) {
      const d = distance({ x: originX, y: originY, z: originZ }, node);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = node;
      }
    }

    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = rand() * 2 - 1;
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
    const clusterR = cfg.haloClusterRadius * Math.pow(rand(), 0.7); // denser toward the node's own center

    const targetX = nearest.x + (dirX / dirLen) * clusterR;
    const targetY = nearest.y + (dirY / dirLen) * clusterR;
    const targetZ = nearest.z + (dirZ / dirLen) * clusterR;

    // Precomputed once (not per frame) - see "SPIRAL INFALL" above.
    const travelDistance = distance({ x: originX, y: originY, z: originZ }, { x: targetX, y: targetY, z: targetZ });
    const axis = normalize({ x: targetX - originX, y: targetY - originY, z: targetZ - originZ });
    const { u, v } = orthonormalBasis(axis);

    particles[i] = {
      ownerNodeId: nearest.id,
      originX,
      originY,
      originZ,
      targetX,
      targetY,
      targetZ,
      basisUX: u.x,
      basisUY: u.y,
      basisUZ: u.z,
      basisVX: v.x,
      basisVY: v.y,
      basisVZ: v.z,
      swirlPhase: rand() * Math.PI * 2,
      swirlDirection: rand() < 0.5 ? 1 : -1,
      swirlAmplitude: travelDistance * SWIRL_AMPLITUDE_FRACTION,
      brightness: 0.5 + rand() * 0.5,
    };
  }

  // Filaments: reused verbatim from the backdrop (same origin/target
  // pairs CosmicWebScene.js would use for the later epoch), revealed
  // on a timeline averaged from each filament's own two endpoint
  // nodes - see "FILAMENTS" above.
  const filamentById = new Map(backdrop.filaments.map((f) => [f.id, f]));
  const filamentPoints = backdrop.filamentPoints.map((fp) => {
    const filament = filamentById.get(fp.filamentId);
    const nodeA = nodeById.get(filament.aId);
    const nodeB = nodeById.get(filament.bId);
    return {
      originX: fp.originX,
      originY: fp.originY,
      originZ: fp.originZ,
      targetX: fp.targetX,
      targetY: fp.targetY,
      targetZ: fp.targetZ,
      accretionStart: (nodeA.accretionStart + nodeB.accretionStart) / 2,
      matureAt: (nodeA.matureAt + nodeB.matureAt) / 2,
      brightness: fp.brightness,
    };
  });

  return { seed: BACKDROP_SEED, halfExtent: BACKDROP_HALF_EXTENT, nodes, particles, filamentPoints };
}

/**
 * Pure function: given one particle and its own gas-contraction
 * fraction t (0..1, from resolveDarkAgesPhase's gasContractionT),
 * resolve its current position. The straight origin->target line plus
 * a perpendicular swirl that's zero at both ends and peaks partway
 * through — see "SPIRAL INFALL" in the file header. All the expensive
 * per-particle setup (basis vectors, swirl amplitude) was already
 * precomputed once in generateDarkAgesField(); this is pure arithmetic,
 * safe to call for every particle, every frame.
 *
 * @param {object} particle - one entry from field.particles
 * @param {number} t - that particle's own gasContractionT, 0..1
 * @returns {{x:number, y:number, z:number}}
 */
export function resolveParticlePosition(particle, t) {
  const baseX = particle.originX + (particle.targetX - particle.originX) * t;
  const baseY = particle.originY + (particle.targetY - particle.originY) * t;
  const baseZ = particle.originZ + (particle.targetZ - particle.originZ) * t;

  const bump = 4 * t * (1 - t); // 0 at t=0 and t=1, peaks at t=0.5
  const windAngle = particle.swirlPhase + particle.swirlDirection * t * SWIRL_TURNS * Math.PI * 2;
  const swirlR = particle.swirlAmplitude * bump;
  const cosA = Math.cos(windAngle);
  const sinA = Math.sin(windAngle);

  return {
    x: baseX + (cosA * particle.basisUX + sinA * particle.basisVX) * swirlR,
    y: baseY + (cosA * particle.basisUY + sinA * particle.basisVY) * swirlR,
    z: baseZ + (cosA * particle.basisUZ + sinA * particle.basisVZ) * swirlR,
  };
}

/**
 * Pure function: given one filament point and the epoch's current
 * progress, resolve how far it's progressed from its scattered origin
 * toward its settled position on the filament line. Same
 * eased-fraction-of-a-window shape as resolveDarkAgesPhase(), just
 * driven by the filament's own (endpoint-averaged) timeline rather
 * than a single node's.
 *
 * @param {object} filamentPoint - one entry from field.filamentPoints
 * @param {number} progress - epochProgress, 0..1
 * @returns {number} revealT, 0..1 - 0 = still at origin, 1 = fully settled
 */
export function resolveFilamentRevealT(filamentPoint, progress) {
  const duration = Math.max(0.001, filamentPoint.matureAt - filamentPoint.accretionStart);
  const t = clamp((progress - filamentPoint.accretionStart) / duration, 0, 1);
  return easeInOutCubic(t);
}

/**
 * Pure function: given one node and the epoch's current progress
 * (0..1), resolve what a renderer needs this frame. Mirrors the
 * resolveStarPhase()/resolveGalaxyPhase()/resolveAtomPhase() pattern
 * from the other epochs/*Data.js files.
 *
 * @returns {{
 *   contractionT: number,   // 0..1, eased - the dark-matter-dominated well's own timeline
 *   shellRadiusT: number,   // 1..0 as contractionT proceeds - drives a SHRINKING boundary, the inverse of an expanding one
 *   wellStrength: number,   // 0..1, how prominent the gravity-well marker should read
 *   gasContractionT: number,// 0..1, the visible gas's own LAGGED, ACCELERATING timeline - see file header
 * }}
 */
export function resolveDarkAgesPhase(node, progress) {
  const duration = Math.max(0.001, node.matureAt - node.accretionStart);
  const t = clamp((progress - node.accretionStart) / duration, 0, 1);
  const eased = easeInOutCubic(t);

  // Gas trails the well by GAS_LAG_FRACTION of this node's own
  // duration - infalling matter genuinely speeds up as it nears a mass
  // concentration, so this blends in some of that accelerating (ease-
  // in) character rather than using the well's fully symmetric
  // ease-in-out. IMPORTANT: blended, not pure t^3 - a pure cubic
  // ease-in concentrates ~39% of the ENTIRE motion into just the final
  // 15% of the timeline (verified numerically), which reads as a
  // sudden, too-fast snap into place rather than a gradual speed-up.
  // Blending 65% smooth / 35% accelerating brings that down to ~14%,
  // keeping a real but no longer abrupt acceleration bias. If this
  // still reads as too fast, lower GAS_EASE_ACCEL_BLEND further before
  // reverting to a pure easeInOutCubic (which would erase the
  // "gas accelerates as it falls in" cue entirely).
  const gasT = clamp((progress - GAS_LAG_FRACTION * duration - node.accretionStart) / duration, 0, 1);
  const gasEased = (1 - GAS_EASE_ACCEL_BLEND) * easeInOutCubic(gasT) + GAS_EASE_ACCEL_BLEND * (gasT * gasT * gasT);

  return {
    contractionT: eased,
    shellRadiusT: 1 - eased,
    wellStrength: eased,
    gasContractionT: gasEased,
  };
}
