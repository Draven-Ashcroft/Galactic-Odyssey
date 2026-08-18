/**
 * scenes/galaxies/IrregularGalaxy.js
 * ------------------------------------------------------------------
 * Procedural star-position generator for irregular galaxies: clumpy,
 * asymmetric, no rotational symmetry — a handful of randomly placed
 * star-forming clumps rather than an organized disk or spheroid.
 *
 * Zero Three.js dependency (pure math on a seeded RNG), so it's
 * testable in plain Node — same convention as CosmicWebData.js and
 * FirstStarsData.js. Coordinates are LOCAL to the galaxy (centered on
 * its own origin); GalaxyGenerator.js positions the whole galaxy in
 * scene space afterward.
 *
 * DOUBLE DUTY, DELIBERATELY: this same generator is also used by
 * GalaxyGenerator.js as the shared "proto-galactic" starting state for
 * EVERY galaxy, not just ones whose final type is 'irregular'. That's
 * not a shortcut — early galaxies of any eventual type are themselves
 * thought to have been clumpy and irregular before settling into more
 * organized shapes, so reusing this exact algorithm for "what a galaxy
 * looks like before it has a settled morphology" is scientifically
 * apt, not just convenient. See GalaxyGenerator.js for how origin vs.
 * target positions are assembled per star.
 */

/**
 * @param {object} params
 * @param {() => number} params.rand - seeded RNG, next() in [0, 1)
 * @param {number} params.starCount
 * @param {number} params.radius - overall extent of the galaxy
 * @param {number} [params.clumpCount]
 * @returns {Array<{x:number,y:number,z:number,region:string}>}
 */
export function generateIrregularPositions({ rand, starCount, radius, clumpCount }) {
  const count = clumpCount ?? 3 + Math.floor(rand() * 4); // 3-6 clumps, asymmetric by construction

  // Clump centers scattered without any symmetry — each at a random
  // direction and distance from the galaxy's nominal center, with its
  // own random size. Nothing here balances clumps against each other.
  const clumps = [];
  for (let i = 0; i < count; i++) {
    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = (rand() * 2 - 1) * 0.4; // flatten slightly - even irregulars aren't perfectly spherical
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
    const dist = radius * (0.15 + rand() * 0.75);
    clumps.push({
      x: (dirX / dirLen) * dist,
      y: (dirY / dirLen) * dist,
      z: (dirZ / dirLen) * dist,
      spread: radius * (0.12 + rand() * 0.22),
      weight: 0.4 + rand() * 0.6, // relative star share, not normalized - just biases the pick below
    });
  }
  const totalWeight = clumps.reduce((sum, c) => sum + c.weight, 0);

  const stars = [];
  for (let i = 0; i < starCount; i++) {
    // Pick a clump weighted by its share, biasing more stars into
    // "denser" clumps rather than splitting evenly.
    let pick = rand() * totalWeight;
    let clump = clumps[clumps.length - 1];
    for (const c of clumps) {
      if (pick < c.weight) {
        clump = c;
        break;
      }
      pick -= c.weight;
    }

    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = rand() * 2 - 1;
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
    const localRadius = clump.spread * Math.pow(rand(), 1.4); // denser toward each clump's own center

    stars.push({
      x: clump.x + (dirX / dirLen) * localRadius,
      y: clump.y + (dirY / dirLen) * localRadius,
      z: clump.z + (dirZ / dirLen) * localRadius,
      region: 'clump',
    });
  }
  return stars;
}
