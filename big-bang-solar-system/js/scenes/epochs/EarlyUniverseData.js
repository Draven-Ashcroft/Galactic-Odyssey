/**
 * scenes/epochs/EarlyUniverseData.js
 * ------------------------------------------------------------------
 * Pure procedural generator for the hot early-universe particle field
 * shared by 'early-universe' and 'expansion-cooling'. Zero Three.js
 * dependency — same convention as CosmicWebData.js/FirstStarsData.js,
 * testable in plain Node.
 *
 * IMPORTANT SCIENTIFIC RULE — READ BEFORE EDITING:
 * Every particle is seeded at a random position UNIFORMLY THROUGHOUT
 * the whole volume (homogeneous, isotropic) — never emitted from, or
 * clustered toward, a shared origin point. That's what makes the
 * "position = comoving position * scaleFactor" technique in
 * EarlyUniverseScene.js physically honest rather than a repackaged
 * explosion: every particle already exists throughout the volume from
 * the start, and expansion scales EVERY particle's own position from
 * ITS OWN coordinate, not from a shared center with an individual
 * outward velocity. See EarlyUniverseScene.js's header for the full
 * explanation of why that distinction matters and how it's preserved
 * frame to frame.
 *
 * Each particle also carries a small deterministic jitter phase/axis
 * used by the scene to animate "particle activity" (visual stand-in
 * for thermal motion) — purely a rendering detail, not a physics
 * simulation of individual particle velocities.
 */
import { createSeededRandom } from '../../utils/seededRandom.js';

const DEFAULTS = {
  seed: 90000001,
  halfExtent: 6,
  particleCount: 2200,
};

/**
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {Array<{x:number,y:number,z:number,jitterPhase:number,jitterAxisX:number,jitterAxisY:number,jitterAxisZ:number,brightness:number}>}
 */
export function generateEarlyUniverseField(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const rand = createSeededRandom(cfg.seed);

  const particles = new Array(cfg.particleCount);
  for (let i = 0; i < cfg.particleCount; i++) {
    // Uniform-in-volume: fills the whole cube from the start, no bias
    // toward or away from the origin. This IS the "homogeneous and
    // isotropic" requirement, not just a rendering convenience.
    const x = (rand() * 2 - 1) * cfg.halfExtent;
    const y = (rand() * 2 - 1) * cfg.halfExtent;
    const z = (rand() * 2 - 1) * cfg.halfExtent;

    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = rand() * 2 - 1;
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;

    particles[i] = {
      x,
      y,
      z,
      jitterPhase: rand() * Math.PI * 2,
      jitterAxisX: dirX / dirLen,
      jitterAxisY: dirY / dirLen,
      jitterAxisZ: dirZ / dirLen,
      brightness: 0.6 + rand() * 0.4,
    };
  }
  return particles;
}
