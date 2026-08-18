/**
 * scenes/epochs/MilkyWayData.js
 * ------------------------------------------------------------------
 * Pure procedural data model for the 'milky-way' epoch (index 7,
 * ~4 to ~9.2 Gyr). Zero Three.js dependency — same convention as every
 * other epochs/*Data.js file, testable in plain Node.
 *
 * REUSE, NOT REINVENTION: star positions come directly from
 * `generateSpiralPositions()` in `galaxies/SpiralGalaxy.js` — the exact
 * same bulge+disk+spiral-arm generator GalaxyFormationScene.js already
 * uses for every spiral galaxy in its population (including the one it
 * marks `isMilkyWay: true`). This file does NOT regenerate that exact
 * same galaxy instance (its specific seed/arm parameters aren't
 * threaded through from GalaxyGenerator.js — see the "KNOWN
 * SIMPLIFICATION" note below); it generates a fresh, richer, close-up
 * view of "our galaxy" using its own seed and a much higher star count,
 * appropriate for being the sole subject of an entire epoch rather
 * than one of twelve population members.
 *
 * SOLAR SYSTEM SITE: a single illustrative point marking roughly where
 * our Solar System will eventually form — NOT a claim about the Sun's
 * precise real galactic coordinates (an active area of ongoing
 * measurement), just a stylized "out in a spiral arm, well away from
 * the crowded center" marker, consistent with the real qualitative
 * picture (the Sun orbits roughly 2/3 of the way out from the
 * galactic center, not near the core). Computed with the SAME
 * `angle = armBaseAngle + armTightness * radius` formula
 * `generateSpiralPositions()` uses internally (duplicated here
 * deliberately — see that function's own header for the r = a + bθ
 * shape), so the marker sits precisely ON a generated arm, not just
 * near one.
 *
 * KNOWN SIMPLIFICATION: this is a freshly-generated spiral galaxy, not
 * literally the same procedural instance GalaxyFormationScene.js
 * designates `isMilkyWay: true` in its own population (that would
 * require threading that galaxy's exact seed/arm-count/tightness
 * across epoch boundaries, which isn't currently plumbed through the
 * architecture). Both are large spirals, thematically consistent, but
 * not pixel-identical — a reasonable trade-off, not an oversight.
 *
 * Shape of the returned object:
 *   {
 *     seed, diskRadius,
 *     stars: [{
 *       originX/Y/Z,   // scattered "still assembling" starting position
 *       targetX/Y/Z,   // final position on the settled spiral
 *       region: 'bulge'|'disk',
 *       brightness,
 *     }],
 *     solarSite: { x, y, z },
 *   }
 */
import { generateSpiralPositions } from '../galaxies/SpiralGalaxy.js';
import { createSeededRandom } from '../../utils/seededRandom.js';
import { clamp, easeInOutCubic } from '../../utils/mathUtils.js';

const DEFAULTS = {
  seed: 77300001,
  starCount: 5000,
  diskRadius: 4.2,
  armCount: 4,
  armTightness: 0.42,
};

// Solar System site tuning - see "SOLAR SYSTEM SITE" above.
const SOLAR_SITE_RADIUS_FRACTION = 0.62; // roughly 2/3 of the way out, not near the center
const SOLAR_SITE_ARM_INDEX = 0; // which of the generated arms it sits on

/**
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {{ seed, diskRadius, stars, solarSite }}
 */
export function generateMilkyWayField(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const rand = createSeededRandom(cfg.seed);

  const bulgeSize = cfg.diskRadius * 0.16;
  const targetStars = generateSpiralPositions({
    rand,
    starCount: cfg.starCount,
    diskRadius: cfg.diskRadius,
    diskThickness: cfg.diskRadius * 0.06,
    armCount: cfg.armCount,
    armTightness: cfg.armTightness,
    bulgeSize,
  });

  // Each star also gets a scattered ORIGIN to ease FROM as
  // epochProgress advances - the same "clumpy -> settled" reveal
  // technique GalaxyFormationScene.js uses for every galaxy, applied
  // here to this epoch's own single, richer galaxy.
  const stars = targetStars.map((star) => {
    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = rand() * 2 - 1;
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
    const scatterRadius = cfg.diskRadius * (0.5 + rand() * 0.6);
    return {
      originX: (dirX / dirLen) * scatterRadius,
      originY: (dirY / dirLen) * scatterRadius,
      originZ: (dirZ / dirLen) * scatterRadius,
      targetX: star.x,
      targetY: star.y,
      targetZ: star.z,
      region: star.region,
      brightness: star.region === 'bulge' ? 0.75 + rand() * 0.4 : 0.4 + rand() * 0.5,
    };
  });

  // Same r = a + b*theta shape generateSpiralPositions() uses
  // internally, evaluated once at a chosen radius/arm - see "SOLAR
  // SYSTEM SITE" above.
  const armBaseAngle = SOLAR_SITE_ARM_INDEX * ((Math.PI * 2) / cfg.armCount);
  const solarRadius = cfg.diskRadius * SOLAR_SITE_RADIUS_FRACTION;
  const solarAngle = armBaseAngle + cfg.armTightness * solarRadius;
  const solarSite = {
    x: Math.cos(solarAngle) * solarRadius,
    y: Math.sin(solarAngle) * solarRadius,
    z: 0,
  };

  return { seed: cfg.seed, diskRadius: cfg.diskRadius, stars, solarSite };
}

/**
 * Pure function: given the epoch's current progress (0..1), resolve
 * what a renderer needs this frame. Mirrors the resolve*Phase()
 * pattern from every other epochs/*Data.js file.
 *
 * Two things happen on their own timelines within this one epoch:
 *   1. The galaxy settles from scattered to its final spiral shape
 *      across roughly the first half (`settleT`).
 *   2. Only once mostly settled does the camera begin drifting toward
 *      the Solar System site (`zoomT`) — the viewer sees the whole
 *      assembled galaxy first, then the story narrows to "and here's
 *      roughly where we'd be."
 *
 * @returns {{ settleT: number, zoomT: number, markerGlowT: number }}
 */
export function resolveMilkyWayPhase(progress) {
  const settleT = easeInOutCubic(clamp(progress / 0.55, 0, 1));
  const zoomT = easeInOutCubic(clamp((progress - 0.45) / 0.55, 0, 1));
  return { settleT, zoomT, markerGlowT: zoomT };
}
