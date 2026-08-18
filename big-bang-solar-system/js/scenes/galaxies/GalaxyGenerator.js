/**
 * scenes/galaxies/GalaxyGenerator.js
 * ------------------------------------------------------------------
 * Top-level procedural galaxy population generator, and the pure
 * per-frame phase resolver GalaxyFormationScene.js drives from. Zero
 * Three.js dependency — see IrregularGalaxy.js's header for the
 * shared rationale; this file only produces plain data.
 *
 * IMPORTANT SCIENTIFIC RULE — READ BEFORE EDITING:
 * A dark-matter halo is NOT a galaxy. A galaxy only exists once a
 * halo's gravity has pulled in and cooled enough baryonic gas for
 * that gas to collapse and start forming stars — halo + gas + cooling
 * + collapse + star formation -> galaxy. This file reflects that in
 * two ways: (1) only a MINORITY of the backdrop's dark-matter halos
 * (`galaxySiteCount` out of `nodeCount`, deterministically the
 * highest-mass ones) are chosen to host a galaxy at all — most halos
 * in the backdrop remain just structure, exactly as most Population
 * III star sites in FirstStarsData.js don't reach every backdrop
 * node either; (2) every galaxy passes through a `formationStart` ->
 * `matureAt` window before it has a settled morphology — nothing
 * "appears" as a finished spiral/elliptical/irregular galaxy from the
 * moment its halo exists. This is a stylized visualization of
 * hierarchical galaxy assembly, not a cosmological simulation, and
 * the earliest stages of real galaxy formation remain an active
 * research area — the specific timings and ratios here are
 * storytelling choices, not literal statistics.
 *
 * CONTINUITY WITH STEP 2 (Cosmic Web): the backdrop below reuses
 * `generateCosmicWebData()` with the SAME seed and node parameters
 * CosmicWebScene.js itself uses, so the large-scale skeleton (halo
 * positions, filaments) is literally the same one shown in the Cosmic
 * Web epoch — galaxies are shown forming AT that already-established
 * structure, not inside a freshly randomized one.
 *
 * MILKY WAY: exactly one galaxy in the population gets `isMilkyWay:
 * true` — deterministically, not randomly picked each load. Preference
 * order: the largest 'spiral' galaxy of massClass 'large', falling
 * back to any 'spiral', falling back to the largest galaxy of any type
 * if (astronomically unlikely, given the type weighting below, but
 * handled defensively) no spiral exists at all in a given generation.
 * Every OTHER galaxy explicitly gets `isMilkyWay: false` — never left
 * undefined — so a consumer can rely on the field always being present.
 *
 * Shape of one entry in the returned `galaxies` array:
 *   {
 *     id, type ('spiral'|'elliptical'|'irregular'), seed, massClass,
 *     size, position: {x,y,z}, formationStart, matureAt,
 *     starFormationActivity, mergerRole ('none'|'a'|'b'),
 *     mergerWindow: {start,end} | null, mergerMidpoint: {x,y,z} | null,
 *     isMilkyWay: boolean,
 *     stars: [{ originX/Y/Z, targetX/Y/Z, r, g, b }],
 *   }
 * `userData`-style metadata (id/type/seed/massClass/isMilkyWay) is
 * deliberately flat on the galaxy record so GalaxyFormationScene.js can
 * copy it straight onto each THREE.Points' `userData`, and so it can be
 * broadcast directly as the payload of a "galaxy:selected" event
 * without UIManager needing any galaxy-domain knowledge of its own.
 */
import { generateCosmicWebData } from '../epochs/CosmicWebData.js';
import { createSeededRandom } from '../../utils/seededRandom.js';
import { clamp, easeInOutCubic } from '../../utils/mathUtils.js';
import { generateSpiralPositions } from './SpiralGalaxy.js';
import { generateEllipticalPositions } from './EllipticalGalaxy.js';
import { generateIrregularPositions } from './IrregularGalaxy.js';

const DEFAULTS = {
  seed: 20260809, // SAME seed CosmicWebScene.js uses, on purpose - see file header
  halfExtent: 9,
  nodeCount: 26,
  minNodeSpacing: 3.2,
  maxFilamentsPerNode: 3,
  maxFilamentDistance: 7.5,
  filamentPointsPerUnit: 6,
  galaxySiteCount: 12, // a MINORITY of nodeCount - not every halo hosts a galaxy
};

const MASS_CLASSES = {
  small: { starCount: 180, radiusScale: 0.55, bulgeScale: 0.16 },
  medium: { starCount: 280, radiusScale: 0.85, bulgeScale: 0.22 },
  large: { starCount: 380, radiusScale: 1.15, bulgeScale: 0.28 },
};
const GALAXY_RADIUS_UNIT = 1.2; // base scene-unit radius before massClass scaling
const DISK_THICKNESS_FRACTION = 0.22; // relative to radius

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function pickWeighted(rand, weightedOptions) {
  const total = weightedOptions.reduce((sum, [, w]) => sum + w, 0);
  let pick = rand() * total;
  for (const [value, w] of weightedOptions) {
    if (pick < w) return value;
    pick -= w;
  }
  return weightedOptions[weightedOptions.length - 1][0];
}

/** Simplified, deliberately non-technical stand-in for population age/activity - see file header point 6 disclaimer in GalaxyFormationScene.js. */
function regionColor(region) {
  switch (region) {
    case 'clump': // active star-forming region - young, hot, bright
      return { r: 0.78, g: 0.86, b: 1.0, baseBrightness: 0.85 };
    case 'disk': // mixed population, skews younger/bluer than the bulge
      return { r: 0.86, g: 0.9, b: 1.0, baseBrightness: 0.65 };
    case 'bulge': // older, cooler population
      return { r: 1.0, g: 0.82, b: 0.6, baseBrightness: 0.55 };
    case 'spheroid': // ellipticals: uniformly older population
      return { r: 1.0, g: 0.86, b: 0.68, baseBrightness: 0.5 };
    default:
      return { r: 0.9, g: 0.9, b: 0.9, baseBrightness: 0.6 };
  }
}

function generateGalaxyStars({ rand, type, starCount, radius }) {
  // Every galaxy's ORIGIN state uses the same clumpy irregular
  // generator, regardless of final type - see IrregularGalaxy.js's
  // header for why that's scientifically apt, not just convenient.
  const originStars = generateIrregularPositions({
    rand,
    starCount,
    radius: radius * 1.4, // proto-galactic gas is more diffuse/spread out than the settled result
    clumpCount: 4 + Math.floor(rand() * 3),
  });

  let targetStars;
  if (type === 'spiral') {
    targetStars = generateSpiralPositions({
      rand,
      starCount,
      diskRadius: radius,
      diskThickness: radius * DISK_THICKNESS_FRACTION,
      armCount: 2 + Math.floor(rand() * 3), // 2-4 arms
      armTightness: 0.35 + rand() * 0.5,
      bulgeSize: radius * (0.18 + rand() * 0.1),
    });
  } else if (type === 'elliptical') {
    targetStars = generateEllipticalPositions({ rand, starCount, radius });
  } else {
    targetStars = generateIrregularPositions({ rand, starCount, radius, clumpCount: 3 + Math.floor(rand() * 4) });
  }

  const stars = new Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const origin = originStars[i];
    const target = targetStars[i];
    const color = regionColor(target.region);
    const jitter = 0.85 + rand() * 0.3;
    stars[i] = {
      originX: origin.x,
      originY: origin.y,
      originZ: origin.z,
      targetX: target.x,
      targetY: target.y,
      targetZ: target.z,
      r: color.r,
      g: color.g,
      b: color.b,
      brightness: color.baseBrightness * jitter,
    };
  }
  return stars;
}

/**
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {{ seed, halfExtent, backdropFilamentPoints, galaxies }}
 */
export function generateGalaxyPopulation(options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  const backdrop = generateCosmicWebData({
    seed: cfg.seed,
    halfExtent: cfg.halfExtent,
    nodeCount: cfg.nodeCount,
    minNodeSpacing: cfg.minNodeSpacing,
    maxFilamentsPerNode: cfg.maxFilamentsPerNode,
    maxFilamentDistance: cfg.maxFilamentDistance,
    filamentPointsPerUnit: cfg.filamentPointsPerUnit,
    galaxySitesPerNode: 0, // unused here - see CosmicWebData.js note on its floor of 1
  });

  const rand = createSeededRandom(cfg.seed + 47); // separate stream from the backdrop's own internal RNG use

  // Deterministically pick the densest (highest-mass) halos as galaxy
  // sites - a minority of the total, per the scientific rule above.
  const chosenNodes = [...backdrop.nodes].sort((a, b) => b.mass - a.mass).slice(0, cfg.galaxySiteCount);

  const galaxies = chosenNodes.map((node, i) => {
    const type = pickWeighted(rand, [
      ['spiral', 0.4],
      ['elliptical', 0.35],
      ['irregular', 0.25],
    ]);
    const massClass = pickWeighted(rand, [
      ['small', 0.3],
      ['medium', 0.45],
      ['large', 0.25],
    ]);
    const massConfig = MASS_CLASSES[massClass];
    const radius = GALAXY_RADIUS_UNIT * massConfig.radiusScale;
    const galaxySeed = cfg.seed + 1009 + node.id;
    const galaxyRand = createSeededRandom(galaxySeed);

    const formationStart = 0.02 + rand() * 0.35;
    const matureAt = formationStart + (0.2 + rand() * 0.3);
    const starFormationActivity = type === 'irregular' ? 0.6 + rand() * 0.4 : 0.2 + rand() * 0.5;

    return {
      id: `galaxy-${i}`,
      type,
      seed: galaxySeed,
      massClass,
      size: radius,
      position: { x: node.x, y: node.y, z: node.z },
      formationStart,
      matureAt,
      starFormationActivity,
      mergerRole: 'none',
      mergerWindow: null,
      mergerMidpoint: null,
      isMilkyWay: false, // exactly one galaxy below gets this flipped to true
      stars: generateGalaxyStars({ rand: galaxyRand, type, starCount: massConfig.starCount, radius }),
    };
  });

  // One limited, visually meaningful merger: the closest pair among the
  // CHOSEN galaxy sites - not every galaxy collides, per the spec.
  if (galaxies.length >= 2) {
    let bestPair = null;
    let bestDist = Infinity;
    for (let i = 0; i < galaxies.length; i++) {
      for (let j = i + 1; j < galaxies.length; j++) {
        const d = distance(galaxies[i].position, galaxies[j].position);
        if (d < bestDist) {
          bestDist = d;
          bestPair = [i, j];
        }
      }
    }
    if (bestPair) {
      const [ia, ib] = bestPair;
      const a = galaxies[ia];
      const b = galaxies[ib];
      const midpoint = {
        x: (a.position.x + b.position.x) / 2,
        y: (a.position.y + b.position.y) / 2,
        z: (a.position.z + b.position.z) / 2,
      };
      const mergerWindow = { start: 0.6, end: 0.82 };
      a.mergerRole = 'a';
      b.mergerRole = 'b';
      a.mergerWindow = mergerWindow;
      b.mergerWindow = mergerWindow;
      a.mergerMidpoint = midpoint;
      b.mergerMidpoint = midpoint;
    }
  }

  // Exactly one galaxy is the Milky Way - see "MILKY WAY" in the file
  // header for the preference order and why it's deterministic, not
  // random, each load.
  const milkyWayCandidate =
    galaxies.find((g) => g.type === 'spiral' && g.massClass === 'large') ??
    galaxies.find((g) => g.type === 'spiral') ??
    galaxies.reduce((best, g) => (g.size > best.size ? g : best), galaxies[0]);
  if (milkyWayCandidate) milkyWayCandidate.isMilkyWay = true;

  return {
    seed: cfg.seed,
    halfExtent: cfg.halfExtent,
    backdropFilamentPoints: backdrop.filamentPoints.map((p) => ({ x: p.targetX, y: p.targetY, z: p.targetZ, brightness: p.brightness })),
    galaxies,
  };
}

/**
 * Pure function: given one galaxy and the epoch's current progress
 * (0..1), resolve what a renderer needs this frame. Kept separate from
 * GalaxyFormationScene.js so it's testable without Three.js — mirrors
 * FirstStarsData.js's `resolveStarPhase()`.
 *
 * @returns {{
 *   visible: boolean,
 *   settleT: number,      // 0..1, origin -> target star-position blend
 *   scale: number,
 *   brightness: number,
 *   mergerOffsetT: number, // 0..1, position blend toward mergerMidpoint
 *   stretchT: number,      // 0..1, transient tidal-distortion cue (peaks mid-merger)
 *   fadeOut: number,       // 0..1, this galaxy (merger role 'b' only) fading after merging
 * }}
 */
export function resolveGalaxyPhase(galaxy, progress) {
  const p = progress;

  if (p < galaxy.formationStart) {
    return { visible: false, settleT: 0, scale: 0, brightness: 0, mergerOffsetT: 0, stretchT: 0, fadeOut: 0 };
  }

  const settleT = clamp((p - galaxy.formationStart) / Math.max(0.001, galaxy.matureAt - galaxy.formationStart), 0, 1);
  const eased = easeInOutCubic(settleT);
  let scale = 0.15 + eased * 0.85;
  let brightness = 0.25 + eased * 0.75;
  let mergerOffsetT = 0;
  let stretchT = 0;
  let fadeOut = 0;

  if (galaxy.mergerRole !== 'none' && galaxy.mergerWindow) {
    const { start, end } = galaxy.mergerWindow;
    if (p >= start && p < end) {
      const mt = (p - start) / (end - start);
      mergerOffsetT = easeInOutCubic(mt);
      stretchT = Math.sin(mt * Math.PI); // peaks mid-merger, back to 0 by the end
      brightness += 0.3 * Math.sin(mt * Math.PI); // temporary star-formation enhancement
    } else if (p >= end) {
      mergerOffsetT = 1;
      if (galaxy.mergerRole === 'b') {
        fadeOut = clamp((p - end) / 0.06, 0, 1);
      } else if (galaxy.mergerRole === 'a') {
        scale *= 1.15; // merged remnant reads as modestly larger
        brightness *= 1.1;
      }
    }
  }

  return { visible: true, settleT: eased, scale, brightness, mergerOffsetT, stretchT, fadeOut };
}

/**
 * Pure function: a short, human-readable label for a galaxy's current
 * formation stage, derived entirely from resolveGalaxyPhase()'s own
 * output — no new state, no separate stage tracking. Used by the
 * galaxy info panel (see "galaxy:selected" in GalaxyFormationScene.js).
 *
 * @param {object} galaxy - one entry from generateGalaxyPopulation()'s galaxies array
 * @param {ReturnType<typeof resolveGalaxyPhase>} phase
 * @returns {string}
 */
export function resolveFormationStageLabel(galaxy, phase) {
  if (!phase.visible) return 'Not yet formed';
  if (galaxy.mergerRole !== 'none' && phase.mergerOffsetT > 0 && phase.mergerOffsetT < 1) return 'Merging with a neighbor';
  if (galaxy.mergerRole === 'b' && phase.fadeOut > 0) return 'Merged into a neighbor';
  if (galaxy.mergerRole === 'a' && phase.mergerOffsetT >= 1) return 'Merged remnant';
  if (phase.settleT < 0.35) return 'Proto-galactic';
  if (phase.settleT < 0.85) return 'Assembling';
  return 'Settled';
}
