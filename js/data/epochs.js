/**
 * data/epochs.js
 * ------------------------------------------------------------------
 * SCIENTIFIC DATA MODEL
 *
 * This is the only file that should contain cosmological/astrophysical
 * numbers (times, temperatures, colors used to encode them). Every
 * other module — TemperatureModel, CosmicTimeController, scenes, the
 * UI — reads from here rather than embedding its own constants. That
 * way a scientific correction is a one-line edit in one file, not a
 * hunt through render code.
 *
 * TEMPERATURE HAS TWO DISTINCT CONTEXTS — READ THIS BEFORE EDITING:
 * A single "temperature" field used to span the whole 13-epoch journey,
 * which quietly conflated two different physical quantities: the
 * cosmic microwave background / homogeneous-universe temperature, and
 * the local temperature inside a forming star system. Interpolating
 * between them (e.g. "5 K" cosmic background sliding straight into
 * "1500 K" solar-nebula collapse) implied the whole universe warmed up
 * when the Solar System formed, which is wrong — the Sun's formation
 * is a local event; the cosmic background kept right on cooling,
 * unaffected, in the background (literally). So every epoch now
 * carries up to two separate temperature tracks:
 *
 *   cosmicBackgroundTempStartK / cosmicBackgroundTempEndK
 *     The homogeneous background temperature of the universe as a
 *     whole. Defined and populated for ALL 13 epochs — the CMB didn't
 *     stop existing once stars and planets formed, it just became a
 *     faint, cold, no-longer-interesting ~3-5 K bath in the background.
 *
 *   localTempStartK / localTempEndK
 *     The temperature of a specific local structure — the collapsing
 *     nebula, the protoplanetary disk, the accreting protoplanets.
 *     Only meaningful, and only populated (non-null), from
 *     'solar-nebula' onward: before a star system exists to be "local"
 *     to, this field is `null`.
 *
 *   temperatureContext: 'cosmic-background' | 'local-environment'
 *     Which of the two tracks is the epoch's FEATURED reading — this
 *     is what drives the HUD label switching between "Cosmic
 *     Background Temperature" and "Local Environment Temperature".
 *     Cosmological epochs (0-7) feature the cosmic background, since
 *     no distinct local structure exists yet. Solar-System epochs
 *     (8-12) feature the local reading, since that's the physically
 *     interesting number there — the cosmic background is still
 *     computed for those epochs too, just not the headline value.
 *
 * See core/TemperatureModel.js for how these two tracks are resolved
 * into SimulationState.cosmicBackgroundTemperatureK / localTemperatureK
 * each frame, and core/UIManager.js for how the HUD label switches.
 *
 * Field notes:
 *  - id                    kebab-case identifier, used as the FSM state
 *                           name and the sceneRegistry lookup key.
 *  - tStartSec/tEndSec      cosmic time boundaries, in seconds after t=0,
 *                           on a strictly increasing timeline across the
 *                           whole array (epoch[i].tEndSec === epoch[i+1].tStartSec
 *                           is the design invariant — see console assertion
 *                           at the bottom of this file).
 *  - cosmicBackgroundTemp*  see "TEMPERATURE HAS TWO DISTINCT CONTEXTS" above.
 *  - localTemp*             see above. `null` for epochs before 'solar-nebula'.
 *  - temperatureContext     see above.
 *  - color                  a single hex accent used for this epoch's
 *                           timeline tick, HUD accent, and placeholder
 *                           scene tint. Chosen to roughly track the
 *                           epoch's FEATURED temperature/character
 *                           (white-hot -> ember -> cooling deep blues
 *                           for the cosmic epochs; nebula-orange ->
 *                           dusty tan -> rocky terracotta for the local
 *                           Solar-System epochs) so the color itself
 *                           carries information rather than being
 *                           decorative.
 *  - summary                one or two short, plain sentences for the UI
 *                           description panel — deliberately simplified for
 *                           a Class 12 audience (concise over comprehensive;
 *                           deeper detail belongs in each scene module, not
 *                           here). Each still keeps the ONE misconception
 *                           each epoch most needs to correct: the earliest
 *                           epoch, "not an explosion — space itself
 *                           stretched"; dark ages / cosmic web / galaxy
 *                           formation, gravity building MANY separate
 *                           structures, never one central collapse; galaxy
 *                           formation, a dark-matter clump only becomes a
 *                           galaxy once gas cools and forms stars in it;
 *                           the Milky Way epoch, that star/planet
 *                           formation (including our own Solar System) is
 *                           a separate, much later, local process.
 *
 * These figures are standard-cosmology order-of-magnitude values
 * intended for a *stylized* visualization, not a precision N-body/
 * FRW solver. Anyone tightening the numbers later only needs to edit
 * this file.
 */

export const EPOCHS = [
  {
    id: 'early-universe',
    index: 0,
    name: 'Early Hot, Dense Universe',
    tStartSec: 1e-43,
    tEndSec: 1e-32,
    cosmicBackgroundTempStartK: 1.4e32,
    cosmicBackgroundTempEndK: 1e27,
    localTempStartK: null,
    localTempEndK: null,
    temperatureContext: 'cosmic-background',
    color: '#f5f0e6',
    summary:
      'The Universe began in an extremely hot, dense state. ' +
      'Fundamental particles formed as it expanded and rapidly cooled.',
  },
  {
    id: 'expansion-cooling',
    index: 1,
    name: 'Expansion and Cooling',
    tStartSec: 1e-32,
    tEndSec: 1,
    cosmicBackgroundTempStartK: 1e27,
    cosmicBackgroundTempEndK: 1e10,
    localTempStartK: null,
    localTempEndK: null,
    temperatureContext: 'cosmic-background',
    color: '#ffb27a',
    summary:
      'Space expanded, causing the Universe to cool. As temperatures ' +
      'fell, particles combined into protons, neutrons and light ' +
      'atomic nuclei.',
  },
  {
    id: 'atom-formation',
    index: 2,
    name: 'Formation of Atoms',
    tStartSec: 1,
    tEndSec: 1.2e13, // ~380,000 years
    cosmicBackgroundTempStartK: 1e10,
    cosmicBackgroundTempEndK: 3000,
    localTempStartK: null,
    localTempEndK: null,
    temperatureContext: 'cosmic-background',
    color: '#ff8a5c',
    summary:
      'About 380,000 years after the Big Bang, electrons combined ' +
      'with nuclei to form neutral atoms. Light could then travel ' +
      'freely through space, creating the Cosmic Microwave Background.',
  },
  {
    id: 'dark-ages',
    index: 3,
    name: 'Dark Ages',
    tStartSec: 1.2e13,
    tEndSec: 4.7e15, // ~150 million years
    cosmicBackgroundTempStartK: 3000,
    cosmicBackgroundTempEndK: 60,
    localTempStartK: null,
    localTempEndK: null,
    temperatureContext: 'cosmic-background',
    color: '#3b3550',
    summary:
      'With no stars yet, the Universe stayed dark. But gravity was ' +
      'already at work, slowly pulling denser pockets of gas ' +
      'together into the clumps that would soon seed the first stars.',
  },
  {
    id: 'first-stars',
    index: 4,
    name: 'First Stars',
    tStartSec: 4.7e15,
    tEndSec: 1.26e16, // ~400 million years
    cosmicBackgroundTempStartK: 60,
    cosmicBackgroundTempEndK: 40,
    localTempStartK: null,
    localTempEndK: null,
    temperatureContext: 'cosmic-background',
    color: '#bfe4ff',
    summary:
      'Gravity gathered dense pockets of primordial gas until the ' +
      'first stars ignited. Massive and short-lived, they soon died ' +
      'in explosions that seeded the Universe with its first heavier ' +
      'elements.',
  },
  {
    id: 'cosmic-web',
    index: 5,
    name: 'Cosmic Web',
    tStartSec: 1.26e16,
    tEndSec: 3.15e16, // ~1 billion years
    cosmicBackgroundTempStartK: 40,
    cosmicBackgroundTempEndK: 20,
    localTempStartK: null,
    localTempEndK: null,
    temperatureContext: 'cosmic-background',
    color: '#7a8cff',
    summary:
      'Gravity amplified tiny differences in matter density, with ' +
      'dark matter (invisible matter that exerts gravity) forming the ' +
      'underlying structure. Gas accumulated along this vast network ' +
      'of filaments, sheets and dense nodes.',
  },
  {
    id: 'galaxy-formation',
    index: 6,
    name: 'Galaxy Formation',
    tStartSec: 3.15e16,
    tEndSec: 1.26e17, // ~4 billion years
    cosmicBackgroundTempStartK: 20,
    cosmicBackgroundTempEndK: 10,
    localTempStartK: null,
    localTempEndK: null,
    temperatureContext: 'cosmic-background',
    color: '#ffcf7a',
    summary:
      'Gas gathered within dark-matter halos (regions dominated by ' +
      'dark matter), allowing the first galaxies to form. Continued ' +
      'gas accretion, star formation and galaxy mergers shaped ' +
      'increasingly complex galactic systems.',
  },
  {
    id: 'milky-way',
    index: 7,
    name: 'Milky Way',
    tStartSec: 1.26e17,
    tEndSec: 2.9e17, // ~9.2 billion years
    cosmicBackgroundTempStartK: 10,
    cosmicBackgroundTempEndK: 5,
    localTempStartK: null,
    localTempEndK: null,
    temperatureContext: 'cosmic-background',
    color: '#ffe3b0',
    summary:
      'Our home galaxy, the Milky Way, took shape as a huge spinning ' +
      'spiral of hundreds of billions of stars. Our Solar System ' +
      'would form much later, in one arm of this already-existing ' +
      'galaxy.',
  },
  {
    id: 'solar-nebula',
    index: 8,
    name: 'Solar-Nebula Formation',
    tStartSec: 2.9e17,
    tEndSec: 2.911e17,
    cosmicBackgroundTempStartK: 5,
    cosmicBackgroundTempEndK: 4.99, // negligible change: this epoch spans ~35,000 years, far too short for the cosmic background to shift noticeably
    localTempStartK: 15, // a cold molecular-cloud fragment, typical of dense cores that go on to form stars
    localTempEndK: 1500, // the collapsing core heats sharply as it concentrates into a protosun
    temperatureContext: 'local-environment',
    color: '#ff9d5c',
    summary:
      'About 4.6 billion years ago, a region of gas and dust within ' +
      'the Milky Way collapsed under gravity. This formed the ' +
      'rotating Solar Nebula surrounding the young Sun.',
  },
  {
    id: 'protoplanetary-disk',
    index: 9,
    name: 'Protoplanetary Disk',
    tStartSec: 2.911e17,
    tEndSec: 2.912e17,
    cosmicBackgroundTempStartK: 4.99,
    cosmicBackgroundTempEndK: 4.98,
    localTempStartK: 1500,
    localTempEndK: 300,
    temperatureContext: 'local-environment',
    color: '#d9a066',
    summary:
      'The Solar Nebula flattened into a rotating disk of gas and ' +
      'dust around the young Sun. Material closer to the Sun orbits ' +
      'faster than material farther out, following Kepler\u2019s laws ' +
      'of motion.',
  },
  {
    id: 'planetesimal-formation',
    index: 10,
    name: 'Planetesimal Formation',
    tStartSec: 2.912e17,
    tEndSec: 2.9135e17,
    cosmicBackgroundTempStartK: 4.98,
    cosmicBackgroundTempEndK: 4.95,
    localTempStartK: 300,
    localTempEndK: 250,
    temperatureContext: 'local-environment',
    color: '#a9876b',
    summary:
      'Dust and solid particles gradually grew into larger bodies ' +
      'through collisions and gravitational interactions. These ' +
      'planetesimals became the building blocks of planets.',
  },
  {
    id: 'present-day',
    index: 11,
    name: 'Present-Day Solar System',
    tStartSec: 2.9135e17,
    tEndSec: 4.355e17, // ~13.8 billion years
    cosmicBackgroundTempStartK: 4.95,
    cosmicBackgroundTempEndK: 2.725, // CMB temperature today
    localTempStartK: 250,
    localTempEndK: 255, // Earth's approximate blackbody-equilibrium surface temperature
    temperatureContext: 'local-environment',
    color: '#6fd6c9',
    summary:
      'Solid particles within the protoplanetary disk grew into ' +
      'larger aggregates and planetesimals, providing building ' +
      'blocks for planetary growth. Over time, collisions and ' +
      'gravitational interactions shaped these materials into the ' +
      'present Solar System of the Sun, eight planets and smaller ' +
      'bodies.',
  },
];

/** Convenience lookup: epoch id -> epoch object. */
export const EPOCH_BY_ID = Object.fromEntries(EPOCHS.map((e) => [e.id, e]));

/** Total simulated cosmic-time span, used by anything that needs the full range. */
export const COSMIC_TIME_START_SEC = EPOCHS[0].tStartSec;
export const COSMIC_TIME_END_SEC = EPOCHS[EPOCHS.length - 1].tEndSec;

// Design-time sanity check: epochs must be contiguous and strictly ordered.
// This runs once at module load and only logs — it deliberately never
// throws, so a future data edit that's briefly inconsistent doesn't crash
// the whole app while it's being worked on.
(function assertContiguous() {
  for (let i = 1; i < EPOCHS.length; i++) {
    if (EPOCHS[i].tStartSec !== EPOCHS[i - 1].tEndSec) {
      console.warn(
        `[epochs.js] Gap/overlap between "${EPOCHS[i - 1].id}" and "${EPOCHS[i].id}": ` +
          `${EPOCHS[i - 1].id} ends at ${EPOCHS[i - 1].tEndSec}s but ` +
          `${EPOCHS[i].id} starts at ${EPOCHS[i].tStartSec}s.`
      );
    }
  }
})();
