/**
 * scenes/epochs/ProtoplanetaryDiskData.js
 * ------------------------------------------------------------------
 * PROCEDURAL DATA MODEL for the Protoplanetary Disk scene — like every
 * other epochs/*Data.js file, zero Three.js dependency, testable in a
 * bare Node process. ProtoplanetaryDiskScene.js is the only place this
 * data becomes geometry/materials.
 *
 * SCIENTIFIC PURPOSE (stylized, not a hydrodynamic/radiative-transfer
 * simulation): a young Sun surrounded by a thin, rotating disk of gas
 * and dust — the material left over from the solar nebula's collapse,
 * now settling into the flattened, Keplerian-orbiting structure that
 * will eventually build planetesimals and planets. Inspired by real
 * ALMA observations of young stellar systems (e.g. HL Tau's visible
 * ring-like substructure), not a literal reproduction of any one
 * system.
 *
 * THREE SPATIAL SCALES ("fine dust -> clumpy dust -> diffuse gas ->
 * denser bands"): every disk particle is one of two roles —
 * `'dust'` (the smooth density backbone) or `'clump'` (a minority,
 * concentrated at a handful of seeded radial "bands" rather than
 * scattered uniformly — real disks show exactly this kind of
 * substructure). A separate, sparser `diffuseGas` population (larger,
 * softer, dimmer) renders UNDERNEATH the dust in the scene for
 * volumetric depth. See "RADIAL DENSITY PROFILE" below for how bands
 * are generated.
 *
 * RADIAL DENSITY PROFILE: particle radii are NOT uniform-in-area
 * (which would look like a flat, uniform ring) — most particles are
 * biased toward the inner disk via a power-law
 * (`RADIUS_DENSITY_POWER`), and a handful of seeded band radii pull
 * additional particles toward themselves, creating natural-looking
 * radial substructure (denser concentrations at specific radii, never
 * a hard-edged ring) on top of the general inner-dense/outer-sparse
 * gradient.
 *
 * TEMPERATURE / COLOR GRADIENT: purely radial, three warm-toned
 * stops — inner (hot, orange-yellow) -> middle (cooler, reddish-brown)
 * -> outer (cold, dark grey-brown) — see
 * `resolveRadialTemperatureColor()`. Deliberately NEVER touches blue,
 * green, or purple hues anywhere in this gradient — a real thermal
 * disk gradient is warm-to-neutral, not a rainbow.
 *
 * KEPLERIAN ORBITAL MOTION: each particle gets a fixed orbital radius
 * and a precomputed angular velocity following
 * `omega = KEPLER_CONSTANT / radius^1.5` (Kepler's third law in
 * angular-rate form — inner material genuinely orbits faster than
 * outer material, not just visually "faster looking"). This file only
 * precomputes that per-particle constant; ProtoplanetaryDiskScene.js
 * integrates it into an accumulated per-particle angle over real
 * elapsed time each frame (same "precompute the rate here, integrate
 * it in the scene" split SolarNebulaData.js's bulk rotation already
 * established — see that file's "BULK ROTATION" note — except here
 * the rate varies PER PARTICLE by radius, not once for the whole
 * structure). All particles share the same rotation SIGN (a single
 * `ORBIT_DIRECTION` constant) so the whole disk turns as one coherent
 * sense, never a per-particle-random scatter.
 *
 * FORMATION ANIMATION: this epoch doesn't restart the solar nebula's
 * own collapse from scratch (that story already belongs to the
 * previous epoch — see SolarNebulaScene.js and its own file header's
 * "Solar Nebula != mature Protoplanetary Disk" framing) — it picks up
 * from roughly where that epoch left off (a flattening, still
 * somewhat turbulent structure with a growing protostar) and MATURES
 * into the clean, organized, Keplerian-orbiting disk this epoch is
 * actually about. See `resolveDiskPhase()`'s `settleT` (residual
 * settling turbulence, decays early) and `maturityT` (how sharp the
 * radial density/color gradients read, sharpens through the epoch).
 *
 * FINAL TRANSITION: `resolveDiskPhase()`'s `clumpVisibility` rises in
 * the LATE portion of the epoch — the seeded dust clumps become
 * somewhat more prominent, foreshadowing the next epoch
 * (Planetesimal Formation) without ever forming anything that reads
 * as a discrete planet-like object here.
 *
 * KNOWN SIMPLIFICATION: "subtle self-shadowing" and true volumetric
 * scattering are NOT attempted — accurately shadowing a Points-based
 * cloud would need a custom shader / deferred-lighting pass, which
 * was judged too expensive for a GPU-friendly, mobile-smooth scene
 * built entirely from THREE.Points. Visual depth instead comes from
 * the radial density/color gradient and per-particle brightness
 * variation, not directional shadowing.
 *
 * Shape of the returned object:
 *   {
 *     seed, innerRadius, outerRadius,
 *     diskParticles: [{
 *       role: 'dust' | 'clump',
 *       orbitalRadius, angle0, angularVelocity, inclination, y0,
 *       brightness,
 *     }],
 *     diffuseGasParticles: [{ orbitalRadius, angle0, angularVelocity, y0, brightness }],
 *     backdropStars: [{ x, y, z, brightness }],
 *   }
 */
import { createSeededRandom } from '../../utils/seededRandom.js';
import { clamp, easeInOutCubic } from '../../utils/mathUtils.js';

const DEFAULTS = {
  seed: 41800001, // distinct from every other scene's seed
  diskParticleCount: 3000,
  diffuseGasCount: 800,
  backdropStarCount: 80,
  innerRadius: 0.6, // proto-Sun sits well inside this - see "small fraction of disk diameter" in the scene's own file header
  outerRadius: 7.5,
  bandCount: 4, // seeded radial density concentrations - see "RADIAL DENSITY PROFILE" above
  backdropRadius: 18,
};

const CLUMP_FRACTION = 0.14; // fraction of disk particles belonging to a localized band-clump rather than smooth background dust
const RADIUS_DENSITY_POWER = 2.2; // >1 biases particle radii toward the INNER disk - denser center, thinning outward
const DISK_THICKNESS_FRACTION = 0.055; // thin, but never a mathematical zero-thickness plane
const INCLINATION_SPREAD = 0.06; // radians - small per-particle orbital-plane tilt variation, avoids a perfectly flat/symmetrical look

// Kepler orbital tuning - exported: ProtoplanetaryDiskScene.js
// integrates `angularVelocity` (precomputed here, per particle) over
// real elapsed time each frame - see "KEPLERIAN ORBITAL MOTION" above.
const KEPLER_CONSTANT = 0.55; // tuned so the innermost disk material completes a visible fraction of an orbit within one epoch's real-time window, without looking frantic
export const ORBIT_DIRECTION = 1; // single shared rotation sign - the whole disk turns one coherent way, never per-particle-random

/**
 * Radial temperature/color gradient - warm-to-neutral only, see
 * "TEMPERATURE / COLOR GRADIENT" in the file header. `t` is the
 * particle's own radius normalized to [0, 1] across [innerRadius,
 * outerRadius]. Returns a plain {r,g,b} in 0..1 (not a THREE.Color -
 * this file has zero Three.js dependency by design), which the scene
 * converts to a THREE.Color once.
 */
export function resolveRadialTemperatureColor(t) {
  const c = clamp(t, 0, 1);
  // Three warm-toned stops: inner hot orange-yellow -> middle
  // reddish-brown -> outer cold dark grey-brown. Interpolated in two
  // segments rather than one single lerp, so the MIDDLE stop is an
  // actual visible waypoint, not just a midpoint average of the other two.
  const stops = [
    { at: 0, r: 1.0, g: 0.82, b: 0.42 }, // hot inner - orange-yellow
    { at: 0.5, r: 0.72, g: 0.42, b: 0.3 }, // middle - reddish-brown
    { at: 1, r: 0.32, g: 0.28, b: 0.26 }, // outer - cold dark grey-brown
  ];
  let a = stops[0];
  let b = stops[1];
  if (c > 0.5) {
    a = stops[1];
    b = stops[2];
  }
  const span = b.at - a.at;
  const localT = span > 0 ? (c - a.at) / span : 0;
  return {
    r: a.r + (b.r - a.r) * localT,
    g: a.g + (b.g - a.g) * localT,
    b: a.b + (b.b - a.b) * localT,
  };
}

/**
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {object} ProtoplanetaryDiskData — see file header for shape.
 */
export function generateProtoplanetaryDiskData(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const rand = createSeededRandom(cfg.seed);
  const radiusSpan = cfg.outerRadius - cfg.innerRadius;

  // Seeded band radii - see "RADIAL DENSITY PROFILE" above. Spread
  // across the disk, never right at the very inner or outer edge.
  const bandRadii = [];
  for (let i = 0; i < cfg.bandCount; i++) {
    bandRadii.push(cfg.innerRadius + radiusSpan * (0.2 + rand() * 0.65));
  }

  function sampleRadius() {
    // Power-law bias toward the inner disk (general gradient).
    return cfg.innerRadius + radiusSpan * Math.pow(rand(), RADIUS_DENSITY_POWER);
  }

  function sampleBandRadius() {
    // A clump particle scatters around ONE seeded band, not the whole disk.
    const band = bandRadii[Math.floor(rand() * bandRadii.length)];
    const bandWidth = radiusSpan * 0.05;
    return clamp(band + (rand() * 2 - 1) * bandWidth, cfg.innerRadius, cfg.outerRadius);
  }

  const diskParticles = new Array(cfg.diskParticleCount);
  for (let i = 0; i < cfg.diskParticleCount; i++) {
    const role = rand() < CLUMP_FRACTION ? 'clump' : 'dust';
    const orbitalRadius = role === 'clump' ? sampleBandRadius() : sampleRadius();
    const angularVelocity = (KEPLER_CONSTANT / Math.pow(orbitalRadius, 1.5)) * ORBIT_DIRECTION;
    // Denser near the midplane (Y=0), thinning above/below - see
    // DISK_THICKNESS_FRACTION above.
    const thicknessHere = orbitalRadius * DISK_THICKNESS_FRACTION;
    const y0 = (rand() * 2 - 1) * thicknessHere * Math.pow(rand(), 0.7);

    diskParticles[i] = {
      role,
      orbitalRadius,
      angle0: rand() * Math.PI * 2,
      angularVelocity,
      inclination: (rand() * 2 - 1) * INCLINATION_SPREAD,
      y0,
      brightness: role === 'clump' ? 0.6 + rand() * 0.4 : 0.35 + rand() * 0.45,
    };
  }

  const diffuseGasParticles = new Array(cfg.diffuseGasCount);
  for (let i = 0; i < cfg.diffuseGasCount; i++) {
    const orbitalRadius = sampleRadius();
    const angularVelocity = (KEPLER_CONSTANT / Math.pow(orbitalRadius, 1.5)) * ORBIT_DIRECTION;
    const thicknessHere = orbitalRadius * DISK_THICKNESS_FRACTION * 1.6; // gas puffs slightly thicker than the dust layer
    diffuseGasParticles[i] = {
      orbitalRadius,
      angle0: rand() * Math.PI * 2,
      angularVelocity,
      y0: (rand() * 2 - 1) * thicknessHere,
      brightness: 0.15 + rand() * 0.25,
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

  return { seed: cfg.seed, innerRadius: cfg.innerRadius, outerRadius: cfg.outerRadius, diskParticles, diffuseGasParticles, backdropStars };
}

/**
 * Pure function: given the epoch's current progress (0..1), resolve
 * what a renderer needs this frame. Mirrors the resolve*Phase()
 * pattern from every other epochs/*Data.js file — a single shared
 * timeline, since (like SolarNebulaData.js) this is one continuous
 * object, not a population of staggered sites.
 *
 * @returns {{
 *   maturityT: number,       // 0..1, eased - how organized/sharp the disk's structure reads
 *   settleT: number,         // 1..0 - residual settling turbulence inherited from Solar Nebula, decays early
 *   protostarBrightness: number, // 0..1
 *   protostarScale: number,      // 0..1
 *   clumpVisibility: number,     // 0..1, rises late - "FINAL TRANSITION" in the file header
 * }}
 */
export function resolveDiskPhase(progress) {
  const maturityT = easeInOutCubic(progress);
  // Residual turbulence, echoing where Solar Nebula left off - mostly
  // gone by ~40% progress, not the whole epoch.
  const settleT = 1 - easeInOutCubic(clamp(progress / 0.4, 0, 1));
  // Protostar is already fairly formed at the start of this epoch
  // (Solar Nebula already built it up) - reaches full, stable
  // brightness by ~35% progress, then holds.
  const protostarBrightness = 0.55 + easeInOutCubic(clamp(progress / 0.35, 0, 1)) * 0.45;
  const protostarScale = 0.6 + easeInOutCubic(clamp(progress / 0.35, 0, 1)) * 0.4;
  // Clumps become somewhat more visible in the final quarter - see
  // "FINAL TRANSITION" above.
  const clumpVisibility = 0.55 + easeInOutCubic(clamp((progress - 0.75) / 0.25, 0, 1)) * 0.45;
  return { maturityT, settleT, protostarBrightness, protostarScale, clumpVisibility };
}
