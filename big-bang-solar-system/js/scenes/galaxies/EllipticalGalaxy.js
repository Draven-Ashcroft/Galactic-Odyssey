/**
 * scenes/galaxies/EllipticalGalaxy.js
 * ------------------------------------------------------------------
 * Procedural star-position generator for elliptical galaxies: a
 * smooth, roughly spheroidal (optionally flattened) distribution with
 * a strongly concentrated center and no spiral structure.
 *
 * Zero Three.js dependency — see IrregularGalaxy.js's header for the
 * shared rationale. Coordinates are LOCAL to the galaxy.
 *
 * Like SpiralGalaxy.js, this is a stylized approximation (a power-law
 * radius bias), not a fit to a real profile such as de Vaucouleurs' or
 * a Sersic law — chosen for a correct-at-a-glance look (smooth,
 * center-heavy, no substructure) without claiming quantitative
 * accuracy.
 */

/**
 * @param {object} params
 * @param {() => number} params.rand
 * @param {number} params.starCount
 * @param {number} params.radius
 * @param {number} [params.ellipticity] - 0 (spherical) to ~0.6 (flattened), default randomized
 * @returns {Array<{x:number,y:number,z:number,region:string}>}
 */
export function generateEllipticalPositions({ rand, starCount, radius, ellipticity }) {
  const flatten = ellipticity ?? rand() * 0.5; // most ellipticals shown here are mildly-to-moderately flattened
  const stars = [];

  for (let i = 0; i < starCount; i++) {
    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = rand() * 2 - 1;
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
    // Stronger central concentration than the spiral bulge — ellipticals
    // read as smoother and more center-heavy, with no separate disk/arm
    // population to break up the falloff.
    const r = radius * Math.pow(rand(), 1.9);

    stars.push({
      x: (dirX / dirLen) * r,
      y: (dirY / dirLen) * r * (1 - flatten),
      z: (dirZ / dirLen) * r,
      region: 'spheroid',
    });
  }
  return stars;
}
