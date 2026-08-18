/**
 * scenes/epochs/CosmicWebData.js
 * ------------------------------------------------------------------
 * PROCEDURAL DATA MODEL for the Cosmic Web scene — deliberately has
 * ZERO Three.js dependency. This module only produces plain numbers
 * and plain objects; CosmicWebScene.js is the only place that turns
 * this data into geometry/materials. Keeping the split lets this file
 * be tested in a bare Node process (no browser/WebGL needed) and reused
 * if a later scene wants the same structure without the rendering.
 *
 * This is an EDUCATIONAL, STYLIZED visualization of how large-scale
 * cosmic structure is believed to have formed — small density
 * fluctuations amplified by gravity into a filamentary "cosmic web"
 * with dense nodes, long filaments, and large voids, with galaxies
 * concentrated in and around the densest regions. It is NOT a
 * cosmological N-body simulation: there is no gravity solver, no
 * particle-particle physics, and no attempt at matching real large-
 * scale-structure statistics (correlation functions, void size
 * distributions, etc.). The geometry is generated to look and behave
 * like the real thing at a glance, not to reproduce it quantitatively.
 *
 * Determinism: everything below is driven by a single seeded PRNG
 * (see utils/seededRandom.js). The same `seed` always produces the
 * exact same nodes/filaments/voids/galaxySites.
 *
 * Shape of the returned CosmicWebData object:
 *   {
 *     seed, halfExtent,
 *     nodes:         [{ id, x, y, z, mass }],
 *     filaments:     [{ id, aId, bId, length }],
 *     filamentPoints:[{ filamentId, targetX/Y/Z, originX/Y/Z, brightness }],
 *     galaxySites:   [{ id, nodeId, x, y, z, revealProgress }],
 *     voids:         [{ id, x, y, z, radius }],
 *   }
 *
 * `filamentPoints` carry BOTH a `target` position (on the settled
 * filament, where the structure ends up) and an `origin` position (a
 * more scattered, disorganized placement standing in for the "weak
 * density fluctuation" starting state). CosmicWebScene interpolates
 * every point from origin -> target as the epoch's cosmic-time
 * progress advances, which is what visually reads as gravitational
 * amplification pulling matter into filaments — not a literal N-body
 * integration, but a stylized stand-in for the same story.
 */
import { createSeededRandom } from '../../utils/seededRandom.js';

const DEFAULTS = {
  seed: 20260809,
  halfExtent: 9, // scene spans roughly a cube of [-9, 9] on each axis
  nodeCount: 26,
  minNodeSpacing: 3.2,
  maxNodeSampleAttempts: 4000,
  maxFilamentsPerNode: 3,
  maxFilamentDistance: 7.5,
  filamentPointsPerUnit: 6,
  filamentJitter: 0.22,
  galaxySitesPerNode: 3,
  voidSampleCount: 400,
  voidCount: 8,
};

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {object} CosmicWebData — see file header for shape.
 */
export function generateCosmicWebData(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const rand = createSeededRandom(cfg.seed);
  const randomAxis = () => (rand() * 2 - 1) * cfg.halfExtent;

  // --- 1. Nodes: rejection ("Poisson-disc-ish") sampling so nodes
  // never crowd each other — the resulting gaps ARE the voids,
  // emerging naturally from the spacing rule rather than being
  // painted in separately. -----------------------------------------
  const nodes = [];
  let attempts = 0;
  while (nodes.length < cfg.nodeCount && attempts < cfg.maxNodeSampleAttempts) {
    attempts++;
    const candidate = { x: randomAxis(), y: randomAxis(), z: randomAxis() };
    const tooClose = nodes.some((n) => distance(n, candidate) < cfg.minNodeSpacing);
    if (!tooClose) {
      nodes.push({ id: nodes.length, ...candidate, mass: 0.6 + rand() * 0.9 });
    }
  }

  // --- 2. Filaments: each node links to its nearest few neighbors
  // within range, deduplicated — a sparse graph, not a dense mesh. --
  const seenPairs = new Set();
  const filaments = [];
  for (const node of nodes) {
    const nearest = nodes
      .filter((other) => other.id !== node.id)
      .map((other) => ({ other, d: distance(node, other) }))
      .filter((entry) => entry.d <= cfg.maxFilamentDistance)
      .sort((a, b) => a.d - b.d)
      .slice(0, cfg.maxFilamentsPerNode);

    for (const { other, d } of nearest) {
      const key = node.id < other.id ? `${node.id}:${other.id}` : `${other.id}:${node.id}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      filaments.push({ id: filaments.length, aId: node.id, bId: other.id, length: d });
    }
  }

  // --- 3. Filament matter points: sampled along each filament, with
  // an origin (scattered) and target (settled) position for each. --
  const filamentPoints = [];
  for (const filament of filaments) {
    const a = nodes[filament.aId];
    const b = nodes[filament.bId];
    const pointCount = Math.max(4, Math.round(filament.length * cfg.filamentPointsPerUnit));

    for (let i = 0; i < pointCount; i++) {
      const t = (i + 0.5) / pointCount; // offset half a step so points don't sit exactly on node centers
      const baseX = a.x + (b.x - a.x) * t;
      const baseY = a.y + (b.y - a.y) * t;
      const baseZ = a.z + (b.z - a.z) * t;

      // Widest jitter mid-filament, tapering to ~0 at the node ends,
      // so the diffuse strand visually meets its nodes cleanly.
      const taper = Math.sin(Math.PI * t);
      const jitterMag = cfg.filamentJitter * (0.4 + 0.6 * taper);
      const targetX = baseX + (rand() * 2 - 1) * jitterMag;
      const targetY = baseY + (rand() * 2 - 1) * jitterMag;
      const targetZ = baseZ + (rand() * 2 - 1) * jitterMag;

      // Origin: the same point, displaced by a much larger random
      // offset — stands in for the "weak, undeveloped" early state.
      const scatterMag = cfg.halfExtent * 0.35;
      const originX = targetX + (rand() * 2 - 1) * scatterMag;
      const originY = targetY + (rand() * 2 - 1) * scatterMag;
      const originZ = targetZ + (rand() * 2 - 1) * scatterMag;

      filamentPoints.push({
        filamentId: filament.id,
        targetX,
        targetY,
        targetZ,
        originX,
        originY,
        originZ,
        brightness: 0.5 + rand() * 0.5,
      });
    }
  }

  // --- 4. Galaxy sites: small offsets clustered around nodes, biased
  // toward higher-mass nodes, each with its own reveal threshold so
  // they appear staggered across the epoch rather than all at once. -
  const galaxySites = [];
  for (const node of nodes) {
    const count = Math.max(1, Math.round(cfg.galaxySitesPerNode * (0.5 + node.mass * 0.5)));
    for (let i = 0; i < count; i++) {
      const dirX = rand() * 2 - 1;
      const dirY = rand() * 2 - 1;
      const dirZ = rand() * 2 - 1;
      const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
      const offset = 0.5 + rand() * 0.9;
      galaxySites.push({
        id: galaxySites.length,
        nodeId: node.id,
        x: node.x + (dirX / dirLen) * offset,
        y: node.y + (dirY / dirLen) * offset,
        z: node.z + (dirZ / dirLen) * offset,
        // Spread across most of the epoch, biased so early progress
        // reveals almost nothing — "very few galaxy sites visible" at first.
        revealProgress: 0.1 + rand() * 0.8,
      });
    }
  }

  // --- 5. Voids: data-only. Sample candidate points and keep the ones
  // farthest from every node — approximate void centers, not rendered
  // as geometry (voids should just stay visibly empty), but useful
  // data for anything that wants to know where the empty regions are
  // (e.g. future camera framing or labeling). ------------------------
  const voidCandidates = [];
  for (let i = 0; i < cfg.voidSampleCount; i++) {
    const candidate = { x: randomAxis(), y: randomAxis(), z: randomAxis() };
    let nearestNodeDist = Infinity;
    for (const node of nodes) {
      const d = distance(candidate, node);
      if (d < nearestNodeDist) nearestNodeDist = d;
    }
    voidCandidates.push({ ...candidate, nearestNodeDist });
  }
  voidCandidates.sort((a, b) => b.nearestNodeDist - a.nearestNodeDist);
  const voids = voidCandidates.slice(0, cfg.voidCount).map((v, i) => ({
    id: i,
    x: v.x,
    y: v.y,
    z: v.z,
    radius: v.nearestNodeDist * 0.6,
  }));

  return {
    seed: cfg.seed,
    halfExtent: cfg.halfExtent,
    nodes,
    filaments,
    filamentPoints,
    galaxySites,
    voids,
  };
}
