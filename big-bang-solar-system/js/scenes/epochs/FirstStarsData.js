/**
 * scenes/epochs/FirstStarsData.js
 * ------------------------------------------------------------------
 * PROCEDURAL DATA MODEL for the First Stars scene — like
 * CosmicWebData.js, this has ZERO Three.js dependency so it can be
 * tested in a bare Node process, and FirstStarsScene.js is the only
 * place this data becomes geometry/materials.
 *
 * This epoch (index 4, ~150-400 Myr) comes BEFORE the dedicated
 * 'cosmic-web' epoch (index 5) in the simulation timeline — so rather
 * than duplicate CosmicWebData's node/filament generation, this file
 * REUSES it (see `generateCosmicWebData` import below) with sparser
 * parameters to stand in for how much less developed large-scale
 * structure is at this earlier point: dark-matter clustering has
 * already begun (per the Dark Ages epoch's own summary text) but
 * hasn't yet grown into the fully-developed web the later epoch
 * renders. This is a deliberate, explicit reuse — CosmicWebScene.js
 * and CosmicWebData.js are not modified or touched by this file.
 *
 * From that embryonic structure, a SMALL SUBSET of the densest nodes
 * (dark-matter halos) are deterministically chosen as star-forming
 * sites — not every halo produces a star, and sites are never
 * scattered randomly through empty space.
 *
 * SCIENTIFIC PURPOSE (stylized, not a hydrodynamic simulation):
 * Each star site carries a deterministic but individually-varied
 * lifecycle timeline (collapse -> ignition -> shining -> possible
 * supernova -> faint enriched remnant), staggered across the epoch's
 * progress so formation reads as continuous rather than stars
 * "spawning." Roughly three-quarters of sites are given a supernova
 * that completes within the epoch; the rest are still shining
 * massive stars when the epoch ends. This ratio is a storytelling
 * choice, not a literal statistical claim about real Population III
 * supernova rates, which remain an active area of research — see
 * `resolveStarPhase()`'s comment before treating these numbers as
 * anything more than "varied, not uniform, not certain."
 *
 * SPIRAL COLLAPSE — added for accuracy and visual richness, same
 * technique DarkAgesData.js uses for gas falling into a halo: each gas
 * point's collapse toward its protostar isn't a dead-straight radial
 * line — a perpendicular swirl (zero at both endpoints, peaking
 * partway through) is layered on top, the same angular-momentum-
 * motivated effect that makes real collapsing gas clouds form
 * rotating disks around a forming star. Swirl amplitude scales with
 * each point's own travel distance so points that barely need to move
 * don't swirl in an oversized loop. Basis/swirl parameters are
 * precomputed once per gas point below; FirstStarsScene.js inlines the
 * actual per-frame formula for performance (same reasoning as
 * DarkAgesScene.js — see that file's comment before touching one copy
 * without the other).
 *
 * PACING: collapse/main-sequence/death durations and the shell growth
 * rate were extended/slowed somewhat for this pass, for a calmer
 * default feel — see the specific constants below.
 *
 * VISUAL REDESIGN (stars/death sequence): the star, its glow, its
 * irregular halo, and its supernova remnant are no longer rendered as
 * faceted polygon meshes — see FirstStarsScene.js's file header for
 * the full rendering approach (soft glow-sprite Points layers). This
 * file only adds the DATA those layers need:
 *   - `haloPoints` per site: a handful of small, seeded, asymmetric
 *     offsets around the star's own position — an "irregular gaseous
 *     halo," not a perfect sphere.
 *   - `ejectaPoints` per site: many seeded points, each with its own
 *     outward direction, speed multiplier, and fade timing — an
 *     expanding supernova shell that's asymmetric and ragged (real
 *     ejecta doesn't form a smooth geometric sphere), not a single
 *     uniform shell.
 *   - `protostarT` (added to `resolveStarPhase()`'s 'collapsing'
 *     output): ramps in during the LAST part of collapse, before true
 *     ignition — a dim, warming glow standing in for "the compressed
 *     core is heating up," so the transition reads as
 *     gas-clump -> protostar -> full star rather than a cloud
 *     suddenly snapping to a bright dot.
 *
 * Shape of the returned FirstStarsData object:
 *   {
 *     seed, halfExtent,
 *     backdropFilamentPoints: [{ x, y, z, brightness }],   // static, faint
 *     starSites: [{
 *       id, nodeId, x, y, z, mass,
 *       collapseStart, ignition, deathStart, deathEnd,      // progress fractions, 0..1
 *       willReachSupernova,
 *       gasPoints: [{
 *         originX/Y/Z, targetX/Y/Z,
 *         basisUX/Y/Z, basisVX/Y/Z, swirlPhase, swirlDirection, swirlAmplitude,
 *         brightness,
 *       }],
 *       haloPoints: [{ offsetX/Y/Z, brightness, pulsePhase }],
 *       ejectaPoints: [{ dirX/Y/Z, speedMult, fadeOffset, brightness }],
 *     }],
 *   }
 */
import { generateCosmicWebData } from './CosmicWebData.js';
import { createSeededRandom } from '../../utils/seededRandom.js';

const DEFAULTS = {
  seed: 41500001, // distinct from CosmicWebScene's seed — different structure, same technique
  halfExtent: 9,
  backdropNodeCount: 12, // sparser than the later Cosmic Web epoch's 26 — less-developed structure
  backdropMinNodeSpacing: 3.6,
  backdropMaxFilamentsPerNode: 2,
  backdropMaxFilamentDistance: 7.0,
  backdropFilamentPointsPerUnit: 3, // sparser than Cosmic Web's 6 -> a fainter, thinner web
  starSiteCount: 7, // a deliberate minority of the backdrop's nodes — not every halo gets a star
  gasPointsPerSite: 45,
  gasScatterRadius: 2.4, // how far collapsing gas starts from its site's center
  protostarRadius: 0.3, // how compact the gas has become by ignition
  haloPointsPerSite: 6, // small, asymmetric offsets around the star - "irregular gaseous halo," not a perfect sphere
  ejectaPointsPerSite: 50, // supernova shell/ejecta particle count per site
};

// Spiral collapse tuning - see "SPIRAL COLLAPSE" above. Exported:
// FirstStarsScene.js inlines the same formula for performance (315 gas
// points/frame across 7 sites), so needs the same constant.
const SWIRL_AMPLITUDE_FRACTION = 0.22; // a bit more pronounced than Dark Ages' 0.16 — this is a much tighter, faster collapse
export const SWIRL_TURNS = 1.1;

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** Any two vectors perpendicular to `axis` and to each other, for placing the swirl around a gas point's own collapse direction. */
function orthonormalBasis(axis) {
  const ref = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(axis, ref));
  const v = normalize(cross(axis, u));
  return { u, v };
}

/**
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {object} FirstStarsData — see file header for shape.
 */
export function generateFirstStarsData(options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  // Reuse the existing, already-tested Cosmic Web generator for the
  // embryonic backdrop structure — sparser settings stand in for an
  // earlier, less-developed stage of the same physical process.
  // `galaxySitesPerNode: 0` is passed for clarity of intent, though
  // note the underlying generator has a floor of 1 site per node
  // regardless (see CosmicWebData.js) — harmless here since this file
  // never reads `backdrop.galaxySites` at all: no galaxies exist yet
  // at this epoch, so that part of the reused generator's output is
  // simply discarded rather than rendered.
  const backdrop = generateCosmicWebData({
    seed: cfg.seed,
    halfExtent: cfg.halfExtent,
    nodeCount: cfg.backdropNodeCount,
    minNodeSpacing: cfg.backdropMinNodeSpacing,
    maxFilamentsPerNode: cfg.backdropMaxFilamentsPerNode,
    maxFilamentDistance: cfg.backdropMaxFilamentDistance,
    filamentPointsPerUnit: cfg.backdropFilamentPointsPerUnit,
    galaxySitesPerNode: 0,
  });

  const rand = createSeededRandom(cfg.seed + 1); // separate stream from the backdrop's own internal RNG use

  // Star sites: the densest (highest-mass) backdrop nodes, deterministically
  // chosen — not a random scatter, and deliberately fewer sites than
  // there are nodes, so not every halo produces a star.
  const chosenNodes = [...backdrop.nodes].sort((a, b) => b.mass - a.mass).slice(0, cfg.starSiteCount);

  const starSites = chosenNodes.map((node, i) => {
    // Staggered lifecycle across the epoch's 0..1 progress. Randomized
    // per site (not a single shared timeline) so ignition and death
    // read as individually-varied events rather than a synchronized
    // wave — see the file header note on this being a storytelling
    // choice, not a precise statistical model.
    const collapseStart = 0.03 + rand() * 0.3;
    const collapseDuration = 0.14 + rand() * 0.16; // extended from 0.1+rand()*0.12 - a calmer default pace
    const ignition = collapseStart + collapseDuration;
    const mainSequenceDuration = 0.16 + rand() * 0.26; // extended from 0.12+rand()*0.22
    const deathStart = ignition + mainSequenceDuration;
    const deathDuration = 0.06 + rand() * 0.09; // extended from 0.05+rand()*0.08
    const deathEnd = deathStart + deathDuration;
    // Only reached if it fits within the epoch AND passes a per-site
    // roll — some sites are still shining, unresolved, when the epoch
    // ends, which is intentional (see file header).
    const willReachSupernova = deathEnd <= 1 && rand() < 0.75;

    const gasPoints = [];
    for (let g = 0; g < cfg.gasPointsPerSite; g++) {
      const dirX = rand() * 2 - 1;
      const dirY = rand() * 2 - 1;
      const dirZ = rand() * 2 - 1;
      const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
      const originRadius = cfg.gasScatterRadius * (0.5 + rand() * 0.5);
      const targetRadius = cfg.protostarRadius * (0.4 + rand() * 0.6);

      const originX = node.x + (dirX / dirLen) * originRadius;
      const originY = node.y + (dirY / dirLen) * originRadius;
      const originZ = node.z + (dirZ / dirLen) * originRadius;
      const targetX = node.x + (dirX / dirLen) * targetRadius;
      const targetY = node.y + (dirY / dirLen) * targetRadius;
      const targetZ = node.z + (dirZ / dirLen) * targetRadius;

      // Precomputed once (not per frame) - see "SPIRAL COLLAPSE" above.
      const travelDistance = Math.hypot(targetX - originX, targetY - originY, targetZ - originZ);
      const axis = normalize({ x: targetX - originX, y: targetY - originY, z: targetZ - originZ });
      const { u, v } = orthonormalBasis(axis);

      gasPoints.push({
        originX,
        originY,
        originZ,
        targetX,
        targetY,
        targetZ,
        basisUX: u.x,
        basisUY: u.y,
        basisUZ: u.z,
        basisVX: v.x,
        basisVY: v.y,
        basisVZ: v.z,
        swirlPhase: rand() * Math.PI * 2,
        swirlDirection: rand() < 0.5 ? 1 : -1,
        swirlAmplitude: travelDistance * SWIRL_AMPLITUDE_FRACTION,
        brightness: 0.4 + rand() * 0.6,
      });
    }

    // A handful of small, asymmetric offsets around the star's own
    // position - "irregular gaseous halo," not a perfect sphere. See
    // "VISUAL REDESIGN" in the file header.
    const haloPoints = [];
    for (let h = 0; h < cfg.haloPointsPerSite; h++) {
      const dirX = rand() * 2 - 1;
      const dirY = rand() * 2 - 1;
      const dirZ = rand() * 2 - 1;
      const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
      const offsetRadius = 0.15 + rand() * 0.25;
      haloPoints.push({
        offsetX: (dirX / dirLen) * offsetRadius,
        offsetY: (dirY / dirLen) * offsetRadius,
        offsetZ: (dirZ / dirLen) * offsetRadius,
        brightness: 0.3 + rand() * 0.4,
        pulsePhase: rand() * Math.PI * 2,
      });
    }

    // Supernova ejecta: each point gets its OWN outward direction,
    // speed, and fade timing, so the expanding shell reads as ragged
    // and asymmetric rather than one smooth uniform sphere - see
    // "VISUAL REDESIGN" in the file header.
    const ejectaPoints = [];
    for (let e = 0; e < cfg.ejectaPointsPerSite; e++) {
      const dirX = rand() * 2 - 1;
      const dirY = rand() * 2 - 1;
      const dirZ = rand() * 2 - 1;
      const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
      ejectaPoints.push({
        dirX: dirX / dirLen,
        dirY: dirY / dirLen,
        dirZ: dirZ / dirLen,
        speedMult: 0.55 + rand() * 0.7, // ragged shell front - some ejecta outruns the rest
        fadeOffset: rand() * 0.3, // this point starts dispersing at a slightly different moment than its neighbors
        brightness: 0.5 + rand() * 0.5,
      });
    }

    return {
      id: i,
      nodeId: node.id,
      x: node.x,
      y: node.y,
      z: node.z,
      mass: node.mass,
      collapseStart,
      ignition,
      deathStart,
      deathEnd,
      willReachSupernova,
      gasPoints,
      haloPoints,
      ejectaPoints,
    };
  });

  // Static backdrop points for rendering: flatten to plain {x,y,z,brightness}
  // (FirstStarsScene renders these as-is, unanimated — see its file header
  // for why the backdrop doesn't need its own progress animation here).
  const backdropFilamentPoints = backdrop.filamentPoints.map((p) => ({
    x: p.targetX,
    y: p.targetY,
    z: p.targetZ,
    brightness: p.brightness,
  }));

  return {
    seed: cfg.seed,
    halfExtent: cfg.halfExtent,
    backdropFilamentPoints,
    starSites,
  };
}

/**
 * Pure function: given one star site and the epoch's current progress
 * (0..1), resolve what phase it's in and the numeric parameters a
 * renderer needs. Kept separate from FirstStarsScene.js so the
 * lifecycle logic itself is independently testable without Three.js.
 *
 * Phases: 'pre-collapse' -> 'collapsing' -> 'shining' -> optionally
 * 'supernova' -> 'remnant'. A site that never reaches supernova within
 * the epoch (see `willReachSupernova`) simply stays 'shining' through
 * progress=1 — intentionally not resolved, not every star's fate needs
 * to be shown within this one epoch.
 *
 * @returns {{
 *   phase: string,
 *   collapseT: number,      // 0..1, gas-collapse progress toward the protostar
 *   protostarT: number,     // 0..1, dim warming glow in the last part of collapse, before true ignition
 *   starBrightness: number, // 0..~2.5 (briefly exceeds 1 during the supernova spike)
 *   shellRadius: number,    // current radiation/shock shell radius, in scene units
 *   shellOpacity: number,   // 0..1
 * }}
 */
const SHELL_GROWTH_RATE = 2.4; // scene units per unit of epoch progress, main-sequence phase - slowed from 3.2 for a more graceful expansion
const SUPERNOVA_SHELL_GROWTH = 2.0; // additional scene units the shell gains during the death window - slowed from 2.4, proportionally
const IGNITION_FLASH_WINDOW = 0.05; // how much progress the brief post-ignition brightness overshoot spans

export function resolveStarPhase(site, progress) {
  const p = progress;

  if (p < site.collapseStart) {
    return { phase: 'pre-collapse', collapseT: 0, protostarT: 0, starBrightness: 0, shellRadius: 0, shellOpacity: 0 };
  }

  if (p < site.ignition) {
    const t = (p - site.collapseStart) / (site.ignition - site.collapseStart);
    const collapseT = Math.min(1, Math.max(0, t));
    // Protostar glow: a dim, warming hint of light in the final part
    // of collapse - the compressed core beginning to heat, before
    // true ignition - so the transition reads as gas clump ->
    // protostar -> full star, not a cloud suddenly snapping to a
    // bright dot. Ramps 0->1 across the LAST 35% of the collapse window.
    const protostarT = Math.max(0, (collapseT - 0.65) / 0.35);
    return { phase: 'collapsing', collapseT, protostarT, starBrightness: 0, shellRadius: 0, shellOpacity: 0 };
  }

  const inSupernovaWindow = site.willReachSupernova && p >= site.deathStart && p < site.deathEnd;
  const pastSupernova = site.willReachSupernova && p >= site.deathEnd;

  if (!inSupernovaWindow && !pastSupernova) {
    // Shining: a brief brightness OVERSHOOT right after ignition (a
    // "spark to life" moment, not a physical claim — mirrors the
    // supernova's own spike below for narrative symmetry), then
    // settles to a sustained 1.0. sin(ft*PI) is 0 at both ends of the
    // flash window and peaks at its midpoint, so it layers cleanly on
    // top of the underlying linear ramp without a discontinuity.
    const sinceIgnition = p - site.ignition;
    const rampT = Math.min(1, Math.max(0, sinceIgnition / 0.05));
    const flashT = Math.min(1, Math.max(0, sinceIgnition / IGNITION_FLASH_WINDOW));
    const flashOvershoot = flashT < 1 ? Math.sin(flashT * Math.PI) * 0.6 : 0;
    return {
      phase: 'shining',
      collapseT: 1,
      protostarT: 1,
      starBrightness: rampT + flashOvershoot,
      shellRadius: sinceIgnition * SHELL_GROWTH_RATE,
      shellOpacity: 0.16 * rampT,
    };
  }

  if (inSupernovaWindow) {
    const t = (p - site.deathStart) / (site.deathEnd - site.deathStart);
    // Brief luminosity spike, then a rapid fade of the star itself.
    const starBrightness = t < 0.35 ? 1 + t * 1.6 : Math.max(0, 1 - ((t - 0.35) / 0.65) * 1.3);
    const preDeathRadius = (site.deathStart - site.ignition) * SHELL_GROWTH_RATE;
    return {
      phase: 'supernova',
      collapseT: 1,
      protostarT: 1,
      starBrightness,
      shellRadius: preDeathRadius + t * SUPERNOVA_SHELL_GROWTH,
      shellOpacity: 0.55 * (1 - t * 0.5),
    };
  }

  // pastSupernova: star gone, faint persistent low-metallicity remnant glow.
  const sinceDeath = p - site.deathEnd;
  const preDeathRadius = (site.deathStart - site.ignition) * SHELL_GROWTH_RATE;
  return {
    phase: 'remnant',
    collapseT: 1,
    protostarT: 1,
    starBrightness: 0,
    shellRadius: preDeathRadius + SUPERNOVA_SHELL_GROWTH,
    shellOpacity: Math.max(0.05, 0.14 - sinceDeath * 0.06),
  };
}
