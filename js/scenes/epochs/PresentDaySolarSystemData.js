/**
 * scenes/epochs/PresentDaySolarSystemData.js
 * ------------------------------------------------------------------
 * PROCEDURAL DATA MODEL for the final epoch — like every other
 * epochs/*Data.js file, zero Three.js dependency, testable in a bare
 * Node process. PresentDaySolarSystemScene.js is the only place this
 * data becomes geometry/materials.
 *
 * SCIENTIFIC PURPOSE (an educational visual approximation, explicitly
 * NOT a physically accurate N-body accretion simulation — see the
 * spec's own repeated emphasis on this): planetesimals left over from
 * the previous epoch grow into planetary bodies through collisions
 * and accretion (never an explosion), settling into the eight-planet
 * Solar System we see today. One continuous, single-timeline story
 * (like SolarNebulaData.js/ProtoplanetaryDiskData.js), driven entirely
 * by `resolvePresentDayPhase()` below — no second clock.
 *
 * FOUR PARTICLE POPULATIONS:
 *   1. `planetSeeds` — exactly 8, one per real planet (Mercury
 *      through Neptune, ordered by orbital radius with a deliberate
 *      radius GAP between Mars and Jupiter for the asteroid belt).
 *      Each starts as a small planetesimal-scale body and grows to
 *      its own final size — smaller/rockier for the four inner
 *      ("terrestrial") seeds, larger/lighter-toned for the four outer
 *      ("giant") seeds. This is a stylized size/color distinction for
 *      educational clarity, not a scaled model of the real planets.
 *   2. `feedPlanetesimals` — smaller bodies, each weighted toward its
 *      nearest seed, that gradually drift inward and merge during the
 *      growth phase (see "ACCRETION, NOT TELEPORTATION" below) — the
 *      visible mass source for each growing seed.
 *   3. `beltPlanetesimals` — seeded specifically in the radius gap
 *      between Mars and Jupiter, and deliberately NEVER assigned to
 *      any seed to merge into — this is the asteroid belt, and it's
 *      still there at the end for exactly the reason the real one is.
 *   4. `scatteredDebris` — everywhere else, tied to no seed and no
 *      belt, that fades out over the epoch's later phases — "reduce
 *      remaining debris... gradually clean up the scene."
 *
 * ACCRETION, NOT TELEPORTATION: a feed planetesimal's rendered
 * position blends smoothly from its own free Kepler orbit toward a
 * small residual scatter around its seed's CURRENT (still-orbiting)
 * position as that seed's own growth progresses — the exact same
 * "blend toward a moving target, never snap" technique
 * PlanetesimalFormationData.js's "DUST CAPTURE" note already
 * established, reused here (independently duplicated, not imported —
 * this project's standing precedent for keeping scenes independent).
 *
 * INTERNAL HEATING, NOT AN EXPLOSION: `resolveSeedPhase()`'s
 * `heatT` rises through the growth phase and falls again through the
 * transition phase — a smooth rise-and-fall, at no point a spike or a
 * discontinuity. The rendering side (PresentDaySolarSystemScene.js)
 * turns this into a warm color blend and a small interior glow-sprite,
 * never a particle burst or a scale spike — see that file's own
 * "INTERNAL HEATING" note for exactly how "not a fireball" is enforced
 * on the rendering side too.
 *
 * KEPLERIAN ORBITAL MOTION: every population uses the same
 * `omega = KEPLER_CONSTANT / radius^1.5` formula
 * ProtoplanetaryDiskData.js/PlanetesimalFormationData.js already
 * established and validated (Kepler's third law in angular-rate
 * form) — independently duplicated here, not imported, per this
 * project's standing precedent.
 *
 * Shape of the returned object:
 *   {
 *     seed, innerRadius, outerRadius, beltInnerRadius, beltOuterRadius,
 *     planetSeeds: [{
 *       id, name, orbitalRadius, angle0, angularVelocity, isGiant,
 *       targetSizeScale, rockSeed,
 *     }],
 *     feedPlanetesimals: [{
 *       orbitalRadius, angle0, angularVelocity, y0, brightness,
 *       seedIndex, captureScatterX/Y/Z,
 *     }],
 *     beltPlanetesimals: [{ orbitalRadius, angle0, angularVelocity, y0, brightness }],
 *     scatteredDebris: [{ orbitalRadius, angle0, angularVelocity, y0, brightness }],
 *   }
 */
import { createSeededRandom } from '../../utils/seededRandom.js';
import { clamp, easeInOutCubic } from '../../utils/mathUtils.js';

const DEFAULTS = {
  seed: 71100001, // distinct from every other scene's seed
  feedCountPerSeed: 9, // desktop; scaled down on mobile by the scene
  beltCount: 110, // denser than the original 70 - the belt read as fairly sparse before; Points are cheap
  debrisCount: 40,
};

const INNER_RADIUS = 0.7;
const OUTER_RADIUS = 9.2;
const BELT_INNER_RADIUS = 3.35; // between Mars (2.85) and Jupiter (5.0)
const BELT_OUTER_RADIUS = 3.95;
const KEPLER_CONSTANT = 0.5; // same technique/formula as ProtoplanetaryDiskData.js, independently tuned here
export const ORBIT_DIRECTION = 1;

// Eight seeds, ordered by orbital radius, with a deliberate gap
// between Mars and Jupiter for the belt above. Sizes/colors are a
// stylized terrestrial-vs-giant distinction for educational clarity,
// not a scaled model of the real planets — see the file header's
// "not to scale" framing, matched in the epoch's own UI copy (a
// visible "not to scale" caption is shown alongside the scene itself
// - see PresentDaySolarSystemScene.js). Even so, sizes are
// deliberately more DRAMATIC than a literal average would suggest
// (terrestrial-to-giant contrast here is roughly 8x, vs. real
// Mercury-to-Jupiter diameter ratio of roughly 28x) — compressed for
// framing/readability within this scene's own orbital radii, not
// flattened into near-uniformity the way the previous, more modest
// (~3x) contrast did.
//
// axialTilt (radians) is each planet's REAL tilt (Earth 23.5°, Mars
// 25°, Jupiter 3°, Saturn 27°, Uranus ~98° - the dramatic standout
// that famously rotates almost on its side, Neptune 28°) EXCEPT
// Venus: its real tilt is ~177° (retrograde - it spins backward
// relative to its orbit), which would look visually almost identical
// to "no tilt" while being scientifically backward in a way this
// scene has no explanatory text to clarify, so it's simplified to a
// moderate stylized value instead rather than risk implying an error.
const PLANET_DEFS = [
  { name: 'Mercury', orbitalRadius: 1.05, isGiant: false, targetSizeScale: 0.32, axialTilt: 0.02 },
  { name: 'Venus', orbitalRadius: 1.65, isGiant: false, targetSizeScale: 0.5, axialTilt: 0.5 },
  { name: 'Earth', orbitalRadius: 2.25, isGiant: false, targetSizeScale: 0.52, axialTilt: 0.41 },
  { name: 'Mars', orbitalRadius: 2.85, isGiant: false, targetSizeScale: 0.4, axialTilt: 0.44 },
  { name: 'Jupiter', orbitalRadius: 5.0, isGiant: true, targetSizeScale: 2.6, axialTilt: 0.05 },
  { name: 'Saturn', orbitalRadius: 6.25, isGiant: true, targetSizeScale: 2.2, axialTilt: 0.47 },
  { name: 'Uranus', orbitalRadius: 7.5, isGiant: true, targetSizeScale: 1.4, axialTilt: 1.71 },
  { name: 'Neptune', orbitalRadius: 8.7, isGiant: true, targetSizeScale: 1.35, axialTilt: 0.49 },
];
const EARTH_ORBITAL_RADIUS = 2.25; // matches PLANET_DEFS above - used only for the relative-orbital-period calculation below

function keplerAngularVelocity(radius) {
  return (KEPLER_CONSTANT / Math.pow(radius, 1.5)) * ORBIT_DIRECTION;
}

/**
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {object} PresentDaySolarSystemData — see file header for shape.
 */
export function generatePresentDaySolarSystemData(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const rand = createSeededRandom(cfg.seed);

  const planetSeeds = PLANET_DEFS.map((def, i) => ({
    id: i,
    name: def.name,
    orbitalRadius: def.orbitalRadius,
    angle0: rand() * Math.PI * 2,
    angularVelocity: keplerAngularVelocity(def.orbitalRadius),
    isGiant: def.isGiant,
    targetSizeScale: def.targetSizeScale,
    axialTilt: def.axialTilt,
    // Kepler's third law (period^2 proportional to radius^3, i.e.
    // period proportional to radius^1.5) applied directly - genuinely
    // derived from the same orbital mechanics driving the motion
    // itself, not a separate made-up number. Expressed relative to
    // Earth's own period (=1.0) since that's a unit a viewer already
    // has an intuition for.
    relativeOrbitalPeriodYears: Math.pow(def.orbitalRadius / EARTH_ORBITAL_RADIUS, 1.5),
    rockSeed: Math.floor(rand() * 1e9),
  }));

  // Feed planetesimals: scattered NEAR each seed's own orbital radius
  // (not uniformly across the whole disk), so each seed's growth draws
  // from material that plausibly started nearby.
  const feedPlanetesimals = [];
  for (let s = 0; s < planetSeeds.length; s++) {
    const seed = planetSeeds[s];
    for (let i = 0; i < cfg.feedCountPerSeed; i++) {
      const radiusJitter = seed.orbitalRadius * (0.12 + rand() * 0.22) * (rand() < 0.5 ? -1 : 1);
      const orbitalRadius = clamp(seed.orbitalRadius + radiusJitter, INNER_RADIUS, OUTER_RADIUS);
      const thicknessHere = orbitalRadius * 0.05;
      feedPlanetesimals.push({
        orbitalRadius,
        angle0: rand() * Math.PI * 2,
        angularVelocity: keplerAngularVelocity(orbitalRadius),
        y0: (rand() * 2 - 1) * thicknessHere,
        brightness: 0.4 + rand() * 0.4,
        seedIndex: s,
        captureScatterX: (rand() * 2 - 1) * 0.3,
        captureScatterY: (rand() * 2 - 1) * 0.12,
        captureScatterZ: (rand() * 2 - 1) * 0.3,
      });
    }
  }

  // Belt planetesimals: seeded specifically in the Mars-Jupiter gap,
  // never assigned to any seed - this population persists to the end.
  const beltPlanetesimals = [];
  for (let i = 0; i < cfg.beltCount; i++) {
    const orbitalRadius = BELT_INNER_RADIUS + rand() * (BELT_OUTER_RADIUS - BELT_INNER_RADIUS);
    const thicknessHere = orbitalRadius * 0.06;
    beltPlanetesimals.push({
      orbitalRadius,
      angle0: rand() * Math.PI * 2,
      angularVelocity: keplerAngularVelocity(orbitalRadius),
      y0: (rand() * 2 - 1) * thicknessHere,
      brightness: 0.35 + rand() * 0.35,
    });
  }

  // Scattered debris: everywhere else, fades out over the epoch's
  // later phases - see resolvePresentDayPhase()'s debrisT.
  const scatteredDebris = [];
  for (let i = 0; i < cfg.debrisCount; i++) {
    let orbitalRadius;
    do {
      orbitalRadius = INNER_RADIUS + rand() * (OUTER_RADIUS - INNER_RADIUS);
    } while (orbitalRadius > BELT_INNER_RADIUS - 0.2 && orbitalRadius < BELT_OUTER_RADIUS + 0.2);
    const thicknessHere = orbitalRadius * 0.05;
    scatteredDebris.push({
      orbitalRadius,
      angle0: rand() * Math.PI * 2,
      angularVelocity: keplerAngularVelocity(orbitalRadius),
      y0: (rand() * 2 - 1) * thicknessHere,
      brightness: 0.3 + rand() * 0.35,
    });
  }

  return {
    seed: cfg.seed,
    innerRadius: INNER_RADIUS,
    outerRadius: OUTER_RADIUS,
    beltInnerRadius: BELT_INNER_RADIUS,
    beltOuterRadius: BELT_OUTER_RADIUS,
    planetSeeds,
    feedPlanetesimals,
    beltPlanetesimals,
    scatteredDebris,
  };
}

/**
 * Pure function: given the epoch's current progress (0..1), resolve
 * the overall narrative phase. Mirrors the resolve*Phase() pattern
 * from every other epochs/*Data.js file.
 *
 * Phase windows (all eased, all continuous - no jumps at boundaries):
 *   0.00-0.15  planetesimal disk, echoing where Planetesimal
 *              Formation left off - see "diskT" below.
 *   0.15-0.45  growth/accretion - seeds grow, feed material merges,
 *              internal heating rises then begins falling.
 *   0.45-0.65  early Solar System - grown bodies, belt + debris
 *              still visible, "dynamically active."
 *   0.65-0.90  cinematic transition - debris clears, heating fully
 *              cools, motion settles.
 *   0.90-1.00  present-day stable state - orbital rings appear,
 *              ready for interaction.
 *
 * @returns {{
 *   diskT: number,        // 0..1, disk-echo prominence, fades out early
 *   growthT: number,      // 0..1, how far seeds have grown toward their final size
 *   settleT: number,      // 0..1, residual turbulence fading - 1 early, 0 by present-day
 *   debrisT: number,       // 1..0, scattered-debris visibility - present early, fades late
 *   ringsT: number,        // 0..1, orbital-path-ring visibility, only appears near the very end
 * }}
 */
export function resolvePresentDayPhase(progress) {
  const diskT = 1 - easeInOutCubic(clamp(progress / 0.15, 0, 1));
  const growthT = easeInOutCubic(clamp((progress - 0.1) / 0.35, 0, 1)); // 0.1-0.45
  const settleT = 1 - easeInOutCubic(clamp((progress - 0.45) / 0.45, 0, 1)); // fades 0.45-0.90
  const debrisT = 1 - easeInOutCubic(clamp((progress - 0.55) / 0.35, 0, 1)); // fades 0.55-0.90
  const ringsT = easeInOutCubic(clamp((progress - 0.85) / 0.15, 0, 1)); // 0.85-1.0
  return { diskT, growthT, settleT, debrisT, ringsT };
}

/**
 * Pure function: a single seed's own heating curve - rises through
 * the growth window, falls again through the transition window. A
 * smooth rise-and-fall at every point, never a spike - see the file
 * header's "INTERNAL HEATING, NOT AN EXPLOSION" note.
 *
 * @returns {{ heatT: number }} 0..1
 */
export function resolveSeedHeat(progress) {
  const rise = easeInOutCubic(clamp((progress - 0.12) / 0.28, 0, 1)); // 0.12-0.40
  const fall = 1 - easeInOutCubic(clamp((progress - 0.55) / 0.35, 0, 1)); // 0.55-0.90
  return { heatT: Math.min(rise, fall) };
}
