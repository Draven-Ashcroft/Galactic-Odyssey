/**
 * scenes/epochs/PlanetesimalFormationData.js
 * ------------------------------------------------------------------
 * PROCEDURAL DATA MODEL for the Planetesimal Formation scene — like
 * every other epochs/*Data.js file, zero Three.js dependency, testable
 * in a bare Node process. PlanetesimalFormationScene.js is the only
 * place this data becomes geometry/materials.
 *
 * SCIENTIFIC PURPOSE (stylized, not an N-body/collisional simulation):
 * within the young protoplanetary disk, small solid particles
 * gradually accumulate into progressively larger bodies — dust grains
 * -> loose aggregates -> planetesimals. This is a PROCEDURAL
 * APPROXIMATION of that growth, not a claim that planetesimals form
 * simply because particles happen to randomly collide on screen — the
 * real process (collisional sticking, gravitational focusing, and
 * other mechanisms still under active research) is far more complex
 * than any particle-count animation could show. See
 * `resolveClusterPhase()`'s comment before treating the specific
 * growth curve as anything more than an illustrative "gradual, not
 * sudden" story.
 *
 * REUSES Protoplanetary Disk's established techniques (continuous
 * Keplerian orbital motion, radial density/temperature bias) rather
 * than reinventing them — see "CONTINUOUS ORBITAL MOTION" below. This
 * file does NOT read from or duplicate ProtoplanetaryDiskData.js
 * directly (a fresh, independently-seeded disk, same technique) —
 * same established precedent as Dark Ages/First Stars/Solar Nebula
 * each duplicating a shared TECHNIQUE without literally coupling
 * their generators together.
 *
 * CLUSTER SITES: a small, seeded set of locations within the disk
 * (`clusterSiteCount`) that will grow into planetesimals — NOT random
 * dust bumping into other dust: these sites, and which dust particles
 * eventually join them, are entirely deterministic and precomputed.
 * Each site orbits the young Sun exactly like everything else (same
 * Kepler formula), and carries a slightly staggered onset
 * (`formationOffset`) so growth doesn't read as perfectly
 * synchronized across the whole disk.
 *
 * DUST CAPTURE: a minority of dust particles (`CAPTURED_FRACTION`,
 * weighted toward whichever cluster site is nearest) are marked
 * `captured: true` — their orbital motion gradually blends toward
 * matching their site's own orbit as that site's aggregation
 * progresses, visually reading as "this material is being gathered
 * into the forming clump." The rest stay ordinary free-orbiting dust
 * for the whole epoch — the disk should still visibly have abundant
 * loose material, not empty out.
 *
 * INNER (ROCKY) VS OUTER (ICY): each cluster site's composition
 * (`isIcy`) is determined purely by its orbital radius relative to a
 * fixed threshold — no condensation chemistry, just the simple
 * visual/educational distinction the spec asks for (rockier tones
 * inside, paler/icier tones outside).
 *
 * ROCK GEOMETRY VARIANTS: `rockVariantIndex` (0, 1, or 2) picks which
 * of PlanetesimalFormationScene.js's three irregular rock geometries a
 * site uses — gives visual variety across a bounded, small number of
 * InstancedMesh draw calls rather than either (a) every planetesimal
 * looking identical or (b) one Mesh per planetesimal.
 *
 * Shape of the returned object:
 *   {
 *     seed, innerRadius, outerRadius,
 *     clusterSites: [{
 *       id, orbitalRadius, angle0, angularVelocity, inclination,
 *       formationOffset, targetSize, isIcy, rockVariantIndex, rockSeed,
 *     }],
 *     dustParticles: [{
 *       orbitalRadius, angle0, angularVelocity, y0, brightness,
 *       captured: boolean, capturedSiteIndex: number | null,
 *       captureScatterX/Y/Z,  // small residual offset once fully drawn toward its site
 *     }],
 *     backdropStars: [{ x, y, z, brightness }],
 *   }
 */
import { createSeededRandom } from '../../utils/seededRandom.js';
import { clamp, easeInOutCubic } from '../../utils/mathUtils.js';

const DEFAULTS = {
  seed: 52900001, // distinct from every other scene's seed
  dustParticleCount: 2600,
  clusterSiteCount: 13,
  backdropStarCount: 70,
  innerRadius: 0.6,
  outerRadius: 7.5,
  backdropRadius: 18,
};

const CAPTURED_FRACTION = 0.28; // fraction of dust particles gradually drawn into a nearby forming cluster
const RADIUS_DENSITY_POWER = 2.0; // >1 biases particle/site radii toward the inner disk, same technique as Protoplanetary Disk
const DISK_THICKNESS_FRACTION = 0.05;
const INCLINATION_SPREAD = 0.05;
const ICE_LINE_FRACTION = 0.55; // sites beyond this normalized radius are 'icy' rather than 'rocky' - a simple threshold, not a condensation calculation

// Kepler orbital tuning - SAME formula/constant as
// ProtoplanetaryDiskData.js (reused technique, not a shared import -
// see file header). Exported: PlanetesimalFormationScene.js integrates
// `angularVelocity` over real elapsed time each frame.
const KEPLER_CONSTANT = 0.55;
export const ORBIT_DIRECTION = 1;

function sampleBiasedRadius(rand, innerRadius, radiusSpan) {
  return innerRadius + radiusSpan * Math.pow(rand(), RADIUS_DENSITY_POWER);
}

/**
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {object} PlanetesimalFormationData — see file header for shape.
 */
export function generatePlanetesimalFormationData(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const rand = createSeededRandom(cfg.seed);
  const radiusSpan = cfg.outerRadius - cfg.innerRadius;

  // Cluster sites - see "CLUSTER SITES" above.
  const clusterSites = new Array(cfg.clusterSiteCount);
  for (let i = 0; i < cfg.clusterSiteCount; i++) {
    const orbitalRadius = sampleBiasedRadius(rand, cfg.innerRadius, radiusSpan);
    const angularVelocity = (KEPLER_CONSTANT / Math.pow(orbitalRadius, 1.5)) * ORBIT_DIRECTION;
    const normalizedR = radiusSpan > 0 ? (orbitalRadius - cfg.innerRadius) / radiusSpan : 0;
    clusterSites[i] = {
      id: i,
      orbitalRadius,
      angle0: rand() * Math.PI * 2,
      angularVelocity,
      inclination: (rand() * 2 - 1) * INCLINATION_SPREAD,
      formationOffset: rand() * 0.18, // slight stagger - see "CLUSTER SITES" above
      targetSize: 0.7 + rand() * 0.6, // relative size variation across sites - "numerous... distributed... different regions"
      isIcy: normalizedR > ICE_LINE_FRACTION,
      rockVariantIndex: Math.floor(rand() * 3),
      rockSeed: Math.floor(rand() * 1e9),
    };
  }

  // Dust particles - most stay ordinary free-orbiting dust for the
  // whole epoch; a minority are captured by their nearest site.
  const dustParticles = new Array(cfg.dustParticleCount);
  for (let i = 0; i < cfg.dustParticleCount; i++) {
    const orbitalRadius = sampleBiasedRadius(rand, cfg.innerRadius, radiusSpan);
    const angularVelocity = (KEPLER_CONSTANT / Math.pow(orbitalRadius, 1.5)) * ORBIT_DIRECTION;
    const thicknessHere = orbitalRadius * DISK_THICKNESS_FRACTION;
    const y0 = (rand() * 2 - 1) * thicknessHere * Math.pow(rand(), 0.7);
    const angle0 = rand() * Math.PI * 2;

    let captured = false;
    let capturedSiteIndex = null;
    let captureScatterX = 0, captureScatterY = 0, captureScatterZ = 0;
    if (rand() < CAPTURED_FRACTION) {
      // Weighted toward whichever site is nearest in orbital radius
      // (a cheap, deterministic stand-in for "this material is close
      // enough to be gravitationally gathered in") - not a literal
      // proximity-in-3D calculation, see file header's scientific note.
      let nearest = 0;
      let nearestDist = Infinity;
      for (let s = 0; s < clusterSites.length; s++) {
        const d = Math.abs(clusterSites[s].orbitalRadius - orbitalRadius);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = s;
        }
      }
      captured = true;
      capturedSiteIndex = nearest;
      // Small residual scatter around the site once fully drawn in -
      // orbiting NEAR the forming clump, not collapsed to one exact
      // point.
      captureScatterX = (rand() * 2 - 1) * 0.35;
      captureScatterY = (rand() * 2 - 1) * 0.15;
      captureScatterZ = (rand() * 2 - 1) * 0.35;
    }

    dustParticles[i] = {
      orbitalRadius,
      angle0,
      angularVelocity,
      y0,
      brightness: 0.35 + rand() * 0.45,
      captured,
      capturedSiteIndex,
      captureScatterX,
      captureScatterY,
      captureScatterZ,
    };
  }

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

  return { seed: cfg.seed, innerRadius: cfg.innerRadius, outerRadius: cfg.outerRadius, clusterSites, dustParticles, backdropStars };
}

/**
 * Pure function: given one cluster site and the epoch's current
 * progress (0..1), resolve its own aggregation state — staggered per
 * site via `formationOffset`. Mirrors the resolve*Phase() pattern
 * from every other epochs/*Data.js file.
 *
 * The loose-point-cluster and the solid rock CROSSFADE around the
 * midpoint of the growth window rather than one instantly replacing
 * the other — see `pointsOpacity`/`rockScale`.
 *
 * @returns {{
 *   aggregationT: number,   // 0..1, this site's own eased growth progress
 *   pointsOpacity: number,  // 0..1, the loose aggregate-points layer's visibility
 *   rockScale: number,      // 0..1, the solid planetesimal rock's visibility/size
 * }}
 */
export function resolveClusterPhase(site, progress) {
  const local = clamp((progress - site.formationOffset) / (1 - site.formationOffset), 0, 1);
  const aggregationT = easeInOutCubic(local);
  // Smoothstep-style crossfade: points fade out across 0.5-0.78,
  // rock scales in across 0.55-0.85 - overlapping, not an instant swap.
  const pointsOpacity = 1 - smoothstep(0.5, 0.78, aggregationT);
  const rockScale = smoothstep(0.55, 0.85, aggregationT);
  return { aggregationT, pointsOpacity, rockScale };
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Pure function: epoch-wide (not per-site) values a renderer needs
 * every frame - primarily the camera's three-phase journey (wide ->
 * close on one representative site -> wide again).
 *
 * @returns {{ cameraFocusT: number }} 0..1, a bump shape: 0 early and
 *   late in the epoch, rising to 1 in the middle while aggregation is
 *   most visually active.
 */
export function resolveEpochPhase(progress) {
  const risingT = smoothstep(0.32, 0.5, progress);
  const fallingT = 1 - smoothstep(0.72, 0.9, progress);
  const cameraFocusT = Math.min(risingT, fallingT);
  return { cameraFocusT };
}
