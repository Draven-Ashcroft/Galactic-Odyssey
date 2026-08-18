/**
 * scenes/epochs/SolarNebulaData.js
 * ------------------------------------------------------------------
 * PROCEDURAL DATA MODEL for the Solar Nebula Formation scene — like
 * every other epochs/*Data.js file, zero Three.js dependency, testable
 * in a bare Node process. SolarNebulaScene.js is the only place this
 * data becomes geometry/materials.
 *
 * SCIENTIFIC PURPOSE (stylized, not a hydrodynamic simulation):
 * A diffuse, irregular molecular-cloud fragment collapses under its
 * own gravity. As it contracts, conservation of angular momentum makes
 * it spin increasingly fast and flatten into a broad rotating
 * structure — the solar nebula — with most of the infalling material
 * concentrating into a dense central protosun while the rest settles
 * into the surrounding disk. This is one continuous, single-object
 * process (unlike Dark Ages/First Stars/Galaxy Formation, which each
 * generate a whole POPULATION of independently-staggered sites) — the
 * whole epoch's progress drives one shared collapse timeline.
 *
 * IRREGULAR CLOUD SHAPE: real molecular clouds are not spheres. A
 * handful of seeded, off-center "lobes" (`LOBE_COUNT`) are generated
 * first; every particle is scattered around ONE of those lobes (not
 * around a single shared center), so the combined cloud reads as
 * lumpy and asymmetric rather than a perfect ball — see
 * `generateSolarNebulaData()` below.
 *
 * TWO PARTICLE ROLES: most particles are 'disk' particles, whose
 * target position contracts moderately and flattens toward a thin
 * plane (the forming nebula); a minority are 'core' particles
 * (`CORE_FEED_FRACTION`, weighted toward whichever particles started
 * closest to the center — material already near the middle falls in
 * fastest), whose target is very close to the center — this infalling
 * material IS the "subtle accretion-like material" feeding the
 * protosun, rather than a separate decorative layer.
 *
 * SPIRAL COLLAPSE: reuses the same perpendicular-swirl technique
 * DarkAgesData.js/FirstStarsData.js use for gas falling under gravity
 * — zero at both endpoints of a particle's own journey, peaking
 * partway through — layered UNDERNEATH the nebula's own bulk rotation
 * (see "BULK ROTATION" below), representing turbulent infall on top
 * of the larger organized spin.
 *
 * BULK ROTATION (the actual "increasing rotation" concept): rather
 * than trying to bake a precise angular-momentum distribution into
 * each particle's static target position, the WHOLE nebula spins as a
 * unit around one axis (Y), at a rate that increases with collapse —
 * see `resolveNebulaPhase()`'s `angularVelocity`. SolarNebulaScene.js
 * integrates this rate over real elapsed time into one accumulated
 * rotation angle, then applies it to every particle's position AFTER
 * the origin->target+swirl motion — a clean separation between "where
 * a particle sits within the nebula's own frame" and "how far the
 * whole nebula has spun so far." This is a visually convincing
 * simplified model, not a physically exact L = mvr calculation — see
 * the file-wide "stylized, not a hydrodynamic simulation" note above.
 *
 * Shape of the returned object:
 *   {
 *     seed, cloudRadius,
 *     particles: [{
 *       role: 'disk' | 'core',
 *       originX/Y/Z,   // scattered position within one of the cloud's lobes
 *       targetX/Y/Z,   // flattened-disk position (role='disk') or near-center (role='core')
 *       basisUX/Y/Z, basisVX/Y/Z,  // precomputed perpendicular basis for the turbulent swirl
 *       swirlPhase, swirlDirection, swirlAmplitude,
 *       brightness,
 *     }],
 *     backdropStars: [{ x, y, z, brightness }],  // faint, static — the wider galactic environment this cloud sits within
 *   }
 */
import { createSeededRandom } from '../../utils/seededRandom.js';
import { clamp, easeInOutCubic } from '../../utils/mathUtils.js';

const DEFAULTS = {
  seed: 29100001, // distinct from every other scene's seed
  cloudParticleCount: 2200,
  cloudRadius: 6,
  lobeCount: 4, // off-center sub-clusters - see "IRREGULAR CLOUD SHAPE" above
  backdropStarCount: 90,
  backdropRadius: 16, // well outside the cloud - distant galactic context, not part of the cloud itself
};

const CORE_FEED_FRACTION = 0.16; // fraction of particles that fall all the way into the protosun rather than settling into the disk
const NEBULA_DISK_RADIUS_FRACTION = 0.5; // how much the disk's XZ-radius contracts relative to the original cloud, at full collapse
const DISK_THICKNESS_FRACTION = 0.08; // residual Y-thickness at full flattening - never a mathematical zero-thickness plane
const PROTOSUN_TARGET_RADIUS = 0.35; // how close to the very center 'core' particles end up

// Bulk rotation tuning - see "BULK ROTATION" above. Exported: both
// values are needed by SolarNebulaScene.js to integrate the same
// angular-velocity curve over real elapsed time.
export const BASE_ANGULAR_VELOCITY = 0.05; // rad/s, at the very start of collapse - barely perceptible
export const ROTATION_SPEEDUP = 16; // how much faster the spin becomes by full collapse (multiplicative, on top of the base rate)

// Spiral collapse tuning - see "SPIRAL COLLAPSE" above. Exported:
// SolarNebulaScene.js inlines this same formula in its hot per-particle
// loop (2200 particles/frame - too many to call a per-particle
// function that allocates a return object without real per-frame
// allocation pressure, same reasoning as DarkAgesScene.js/
// FirstStarsScene.js), so it needs the same constant.
const SWIRL_AMPLITUDE_FRACTION = 0.14;
export const SWIRL_TURNS = 0.7;

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
 * @returns {object} SolarNebulaData — see file header for shape.
 */
export function generateSolarNebulaData(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const rand = createSeededRandom(cfg.seed);

  // Off-center lobes - see "IRREGULAR CLOUD SHAPE" above. Each lobe
  // gets its own center offset (within the overall cloud volume) and
  // its own radius, so the combined shape is lumpy, not a sphere.
  const lobes = [];
  for (let i = 0; i < cfg.lobeCount; i++) {
    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = rand() * 2 - 1;
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
    const offsetDistance = cfg.cloudRadius * (0.15 + rand() * 0.4);
    lobes.push({
      x: (dirX / dirLen) * offsetDistance,
      y: (dirY / dirLen) * offsetDistance,
      z: (dirZ / dirLen) * offsetDistance,
      radius: cfg.cloudRadius * (0.35 + rand() * 0.35),
    });
  }

  const particles = new Array(cfg.cloudParticleCount);
  for (let i = 0; i < cfg.cloudParticleCount; i++) {
    const lobe = lobes[Math.floor(rand() * lobes.length)];

    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = rand() * 2 - 1;
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
    // Denser toward the lobe's own center, like real gas concentration.
    const r = lobe.radius * Math.pow(rand(), 0.6);

    const originX = lobe.x + (dirX / dirLen) * r;
    const originY = lobe.y + (dirY / dirLen) * r;
    const originZ = lobe.z + (dirZ / dirLen) * r;

    const originRadiusFromCenter = Math.hypot(originX, originY, originZ);
    const normalizedDistance = clamp(originRadiusFromCenter / cfg.cloudRadius, 0, 1);
    // Material already near the center is more likely to fall all the
    // way in and feed the protosun, rather than settle into the disk -
    // see "TWO PARTICLE ROLES" above.
    const coreFeedChance = CORE_FEED_FRACTION * (1.6 - normalizedDistance);
    const role = rand() < coreFeedChance ? 'core' : 'disk';

    let targetX, targetY, targetZ;
    if (role === 'core') {
      const cDirX = rand() * 2 - 1;
      const cDirY = rand() * 2 - 1;
      const cDirZ = rand() * 2 - 1;
      const cDirLen = Math.hypot(cDirX, cDirY, cDirZ) || 1;
      const cR = PROTOSUN_TARGET_RADIUS * rand();
      targetX = (cDirX / cDirLen) * cR;
      targetY = (cDirY / cDirLen) * cR;
      targetZ = (cDirZ / cDirLen) * cR;
    } else {
      // Flatten toward the XZ plane (Y is the rotation axis) and
      // contract the in-plane radius - preserves the particle's own
      // original angle around the axis, so the disk still reflects
      // where its material actually came from, not a randomized shuffle.
      const xzRadius = Math.hypot(originX, originZ);
      const angle = Math.atan2(originZ, originX);
      const targetXZRadius = xzRadius * NEBULA_DISK_RADIUS_FRACTION;
      targetX = Math.cos(angle) * targetXZRadius;
      targetZ = Math.sin(angle) * targetXZRadius;
      targetY = originY * DISK_THICKNESS_FRACTION;
    }

    // Precomputed once (not per frame) - see "SPIRAL COLLAPSE" above.
    const travelDistance = Math.hypot(targetX - originX, targetY - originY, targetZ - originZ);
    const axis = normalize({ x: targetX - originX, y: targetY - originY, z: targetZ - originZ });
    const { u, v } = orthonormalBasis(axis);

    particles[i] = {
      role,
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
      brightness: 0.35 + rand() * 0.55,
    };
  }

  // Faint, static backdrop - the wider galactic environment this
  // cloud sits within, never re-animated (matches the established
  // "static backdrop, context not subject" pattern from Dark
  // Ages/First Stars/Galaxy Formation).
  const backdropStars = new Array(cfg.backdropStarCount);
  for (let i = 0; i < cfg.backdropStarCount; i++) {
    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = rand() * 2 - 1;
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
    const r = cfg.backdropRadius * (0.5 + rand() * 0.5);
    backdropStars[i] = {
      x: (dirX / dirLen) * r,
      y: (dirY / dirLen) * r,
      z: (dirZ / dirLen) * r,
      brightness: 0.3 + rand() * 0.5,
    };
  }

  return { seed: cfg.seed, cloudRadius: cfg.cloudRadius, particles, backdropStars };
}

/**
 * Pure function: given the epoch's current progress (0..1), resolve
 * what a renderer needs this frame. Mirrors the resolve*Phase()
 * pattern from every other epochs/*Data.js file — but unlike those
 * (one call per SITE), this scene has a single shared subject, so this
 * takes just `progress`.
 *
 * @returns {{
 *   collapseT: number,        // 0..1, eased - drives both the origin->target particle motion and the disk flattening
 *   angularVelocity: number,  // current bulk-rotation rate, rad/s - increases with collapseT, see "BULK ROTATION" in the file header
 *   protosunBrightness: number, // 0..1, grows with collapseT
 *   protosunScale: number,      // 0..1, grows with collapseT
 * }}
 */
export function resolveNebulaPhase(progress) {
  const collapseT = easeInOutCubic(progress);
  const angularVelocity = BASE_ANGULAR_VELOCITY * (1 + collapseT * collapseT * ROTATION_SPEEDUP);
  const protosunBrightness = Math.pow(collapseT, 1.6);
  const protosunScale = 0.05 + Math.pow(collapseT, 1.3) * 0.95;
  return { collapseT, angularVelocity, protosunBrightness, protosunScale };
}
