/**
 * scenes/galaxies/SpiralGalaxy.js
 * ------------------------------------------------------------------
 * Procedural star-position generator for spiral galaxies: a compact
 * central bulge plus a flattened disk whose density concentrates
 * along a small number of spiral arms and decreases with radius.
 *
 * Zero Three.js dependency — see IrregularGalaxy.js's header for the
 * shared rationale. Coordinates are LOCAL to the galaxy.
 *
 * This is a stylized approximation, not a fit to any specific real
 * surface-brightness law (e.g. Freeman's exponential disk or a
 * Sersic bulge profile) — radius sampling uses a simple power-law
 * bias toward the center, and arm structure uses a log-spiral-style
 * angle offset with scatter, chosen because they read correctly at a
 * glance (denser center, decreasing outward, visible but not razor-
 * thin arms) without claiming quantitative accuracy.
 */

/**
 * @param {object} params
 * @param {() => number} params.rand
 * @param {number} params.starCount
 * @param {number} params.diskRadius
 * @param {number} params.diskThickness
 * @param {number} params.armCount
 * @param {number} params.armTightness - radians of extra winding per unit radius
 * @param {number} params.bulgeSize
 * @param {number} [params.bulgeFraction] - share of stars in the bulge, default 0.18
 * @returns {Array<{x:number,y:number,z:number,region:string}>}
 */
export function generateSpiralPositions({
  rand,
  starCount,
  diskRadius,
  diskThickness,
  armCount,
  armTightness,
  bulgeSize,
  bulgeFraction = 0.18,
}) {
  const stars = [];
  const bulgeCount = Math.round(starCount * bulgeFraction);

  // --- Bulge: compact, roughly spherical, strongly center-concentrated. ---
  for (let i = 0; i < bulgeCount; i++) {
    const dirX = rand() * 2 - 1;
    const dirY = rand() * 2 - 1;
    const dirZ = rand() * 2 - 1;
    const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
    const r = bulgeSize * Math.pow(rand(), 1.6); // strong central concentration
    stars.push({
      x: (dirX / dirLen) * r,
      y: (dirY / dirLen) * r,
      z: (dirZ / dirLen) * r * 0.8, // very slightly flattened, not a perfect sphere
      region: 'bulge',
    });
  }

  // --- Disk: flattened, decreasing density outward, concentrated near
  // a small number of spiral arms with some inter-arm scatter so it
  // doesn't read as unnaturally thin lines. ---------------------------
  const diskCount = starCount - bulgeCount;
  for (let i = 0; i < diskCount; i++) {
    const radius = diskRadius * Math.pow(rand(), 1.5); // denser toward center, thins outward

    const armIndex = Math.floor(rand() * armCount);
    const armBaseAngle = armIndex * ((Math.PI * 2) / armCount);
    const spiralAngle = armBaseAngle + armTightness * radius;
    // Scatter shrinks for tighter arms, widens for looser ones, plus a
    // baseline so some stars always fall between arms.
    const scatterWidth = 0.35 + 1 / (1 + armTightness * 4);
    const angle = spiralAngle + (rand() - 0.5) * scatterWidth;

    const thicknessFalloff = 1 - (radius / diskRadius) * 0.4; // slightly thinner toward the edge
    const z = (rand() - 0.5) * diskThickness * Math.max(0.3, thicknessFalloff);

    stars.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z,
      region: 'disk',
    });
  }

  return stars;
}
