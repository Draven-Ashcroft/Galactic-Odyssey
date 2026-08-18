/**
 * core/UIManager.js
 * ------------------------------------------------------------------
 * Owns the DOM overlay (epoch label, description, log-scaled epoch
 * timeline, play/pause + speed controls, and the Galaxy Formation
 * epoch's galaxy info panel). UIManager never mutates SimulationState
 * directly — it only emits "ui:*" intent events; some other module
 * (wired up in main.js) is responsible for turning those into actual
 * state/controller changes. This keeps the UI swappable (e.g. for a
 * future React overlay) without touching simulation logic.
 *
 * The galaxy panel is the one place this file also reacts to a
 * non-"state:*"/"epoch:*" bus event ("galaxy:selected"/
 * "galaxy:deselected", emitted by GalaxyFormationScene.js) — but the
 * same rule still holds: UIManager has no galaxy-domain knowledge of
 * its own, it only renders whatever payload it's given (see
 * `_renderGalaxyPanel()`) and turns its buttons into "ui:galaxy-*"
 * intents, exactly like every other control in this file.
 *
 * Expects the DOM structure defined in index.html (see the element ids
 * referenced in _queryElements below).
 */
import { EPOCHS } from '../data/epochs.js';
import { formatCosmicTime, formatTemperature } from '../utils/formatTime.js';

export class UIManager {
  /** @param {import('./EventBus.js').EventBus} eventBus */
  constructor(eventBus) {
    this._eventBus = eventBus;
    this._queryElements();
    this._buildTimelineTicks();
    this._bindDomEvents();
    this._bindBusEvents();
    this._bindCardToggles();
  }

  _queryElements() {
    this.epochIndexEl = document.getElementById('hud-epoch-index');
    this.epochNameEl = document.getElementById('hud-epoch-name');
    this.epochSummaryEl = document.getElementById('hud-epoch-summary');
    this.cosmicTimeEl = document.getElementById('hud-cosmic-time');
    this.temperatureLabelEl = document.getElementById('hud-temperature-label');
    this.temperatureEl = document.getElementById('hud-temperature');
    this.epochBlockEl = document.getElementById('hud-epoch-block');
    this.epochToggleEl = document.getElementById('hud-epoch-toggle');
    this.readoutsCardEl = document.getElementById('hud-readouts-card');
    this.readoutsToggleEl = document.getElementById('hud-readouts-toggle');
    this.timelineEl = document.getElementById('hud-timeline');
    this.timelineFillEl = document.getElementById('hud-timeline-fill');
    this.playToggleEl = document.getElementById('hud-play-toggle');
    this.speedSelectEl = document.getElementById('hud-speed-select');
    this.prevButtonEl = document.getElementById('hud-prev-epoch');
    this.nextButtonEl = document.getElementById('hud-next-epoch');
    this.galaxyPanelEl = document.getElementById('hud-galaxy-panel');
    this.galaxyTitleEl = document.getElementById('hud-galaxy-title');
    this.galaxyTypeEl = document.getElementById('hud-galaxy-type');
    this.galaxySizeEl = document.getElementById('hud-galaxy-size');
    this.galaxyPopulationEl = document.getElementById('hud-galaxy-population');
    this.galaxyStageEl = document.getElementById('hud-galaxy-stage');
    this.galaxyEnterButtonEl = document.getElementById('hud-galaxy-enter');
    this.galaxyReturnButtonEl = document.getElementById('hud-galaxy-return');
    this.galaxyContinueButtonEl = document.getElementById('hud-galaxy-continue');
    this.formPlanetsButtonEl = document.getElementById('hud-form-planets');
    this.scaleInfoButtonEl = document.getElementById('hud-scale-info-button');
    this.planetLabelEl = document.getElementById('hud-planet-label');
    this.planetLabelNameEl = document.getElementById('hud-planet-label-name');
    this.scaleNoteEl = document.getElementById('hud-scale-note');
  }

  _buildTimelineTicks() {
    // One tick per epoch, colored by that epoch's data-driven accent —
    // the color encodes real information (see data/epochs.js), it's
    // not a decorative choice made here.
    EPOCHS.forEach((epoch) => {
      const tick = document.createElement('button');
      tick.className = 'hud-timeline-tick';
      tick.style.setProperty('--tick-color', epoch.color);
      tick.title = epoch.name;
      tick.setAttribute('aria-label', `Jump to ${epoch.name}`);
      tick.addEventListener('click', () => {
        this._eventBus.emit('ui:seek-epoch', { index: epoch.index });
      });
      this.timelineEl.appendChild(tick);
    });
  }

  _bindDomEvents() {
    this.playToggleEl.addEventListener('click', () => {
      this._eventBus.emit('ui:play-toggle');
    });
    this.prevButtonEl.addEventListener('click', () => {
      this._eventBus.emit('ui:prev-epoch');
    });
    this.nextButtonEl.addEventListener('click', () => {
      this._eventBus.emit('ui:next-epoch');
    });
    this.speedSelectEl.addEventListener('change', (event) => {
      this._eventBus.emit('ui:speed-change', { speed: Number(event.target.value) });
    });
    this.galaxyEnterButtonEl.addEventListener('click', () => {
      this._eventBus.emit('ui:galaxy-enter-view');
    });
    this.galaxyReturnButtonEl.addEventListener('click', () => {
      this._eventBus.emit('ui:galaxy-return-view');
    });
    this.galaxyContinueButtonEl.addEventListener('click', () => {
      // Reuses the SAME transition path the timeline ticks already use
      // — no second state machine, no galaxy-specific epoch logic here.
      const milkyWayIndex = EPOCHS.findIndex((epoch) => epoch.id === 'milky-way');
      if (milkyWayIndex !== -1) this._eventBus.emit('ui:seek-epoch', { index: milkyWayIndex });
    });
    this.formPlanetsButtonEl.addEventListener('click', () => {
      this._eventBus.emit('ui:form-planets');
    });
    this.scaleInfoButtonEl.addEventListener('click', (event) => {
      event.stopPropagation(); // don't let the immediate document click-outside listener below close it right after opening
      this._toggleScaleNote();
    });
    document.addEventListener('click', (event) => {
      if (this.scaleNoteEl.classList.contains('is-visible') && !this.scaleNoteEl.contains(event.target)) {
        this._hideScaleNote();
      }
    });
  }

  _bindBusEvents() {
    this._eventBus.on('state:changed', ({ state }) => this._render(state));
    this._eventBus.on('epoch:changed', ({ epoch }) => {
      this._renderEpochText(epoch);
      this._hideGalaxyPanel(); // a selection from Galaxy Formation shouldn't linger into a different epoch
      this._hidePlanetLabel(); // same rule for a planet selection from the final epoch
    });
    this._eventBus.on('galaxy:selected', (payload) => this._renderGalaxyPanel(payload));
    this._eventBus.on('galaxy:deselected', () => this._hideGalaxyPanel());
    this._eventBus.on('planet:selected', (payload) => this._renderPlanetLabel(payload));
    this._eventBus.on('planet:deselected', () => this._hidePlanetLabel());
    this._eventBus.on('planet:label-position', (payload) => this._updatePlanetLabelPosition(payload));
  }

  /**
   * Wires the two header cards' collapse toggles. This is purely local
   * DOM/presentation state — collapsing a card doesn't affect the
   * simulation, the active scene, or anything else in the app, so
   * unlike every other interaction in this file it does NOT go through
   * "ui:*" events or SimulationState. It's the one place UIManager
   * changes its own DOM off its own click handler, deliberately, because
   * there is nothing for another module to react to.
   */
  _bindCardToggles() {
    this._bindCardToggle(this.epochToggleEl, this.epochBlockEl, 'Collapse epoch description', 'Expand epoch description');
    this._bindCardToggle(this.readoutsToggleEl, this.readoutsCardEl, 'Collapse readout values', 'Expand readout values');
  }

  _bindCardToggle(buttonEl, cardEl, collapseLabel, expandLabel) {
    buttonEl.addEventListener('click', () => {
      const collapsed = cardEl.classList.toggle('is-collapsed');
      buttonEl.setAttribute('aria-expanded', String(!collapsed));
      buttonEl.setAttribute('aria-label', collapsed ? expandLabel : collapseLabel);
    });
  }

  _render(state) {
    this.cosmicTimeEl.textContent = formatCosmicTime(state.cosmicTimeSec);

    // The HUD features exactly one temperature reading at a time, and its
    // label switches with it — never label a local reading (e.g. the
    // solar nebula collapsing to ~1500 K) as if it were the temperature
    // of the whole universe. See the "TEMPERATURE HAS TWO DISTINCT
    // CONTEXTS" note in data/epochs.js for the full rationale.
    const isLocal = state.temperatureContext === 'local-environment';
    this.temperatureLabelEl.textContent = isLocal ? 'Local environment temperature' : 'Cosmic background temperature';
    this.temperatureEl.textContent = formatTemperature(
      isLocal ? state.localTemperatureK : state.cosmicBackgroundTemperatureK
    );
    // Icon-only per the Material You transport redesign (css/style.css's
    // .hud-play-toggle) - never the word "Play"/"Pause" as visible text.
    // aria-label still describes the action (what clicking DOES), same
    // convention as the icon-only prev/next buttons already use.
    this.playToggleEl.textContent = state.isPlaying ? '\u2161' : '\u25B6'; // Ⅱ (pause) / ▶ (play)
    this.playToggleEl.setAttribute('aria-label', state.isPlaying ? 'Pause' : 'Play');
    this.playToggleEl.setAttribute('aria-pressed', String(state.isPlaying));

    const epoch = EPOCHS[state.currentEpochIndex];
    if (epoch) {
      const overallProgress = (epoch.index + state.epochProgress) / EPOCHS.length;
      this.timelineFillEl.style.width = `${overallProgress * 100}%`;

      [...this.timelineEl.querySelectorAll('.hud-timeline-tick')].forEach((tick, i) => {
        tick.classList.toggle('is-active', i === state.currentEpochIndex);
      });
    }
  }

  _renderEpochText(epoch) {
    this.epochIndexEl.textContent = `${String(epoch.index + 1).padStart(2, '0')} / ${EPOCHS.length}`;
    this.epochNameEl.textContent = epoch.name;
    this.epochSummaryEl.textContent = epoch.summary;
    document.documentElement.style.setProperty('--epoch-accent', epoch.color);
    // Only meaningful during the final epoch - see PresentDaySolarSystemScene.js's own "INTERACTIVE CAMERA FOCUS" note.
    this.formPlanetsButtonEl.classList.toggle('is-hidden', epoch.id !== 'present-day');
    this.scaleInfoButtonEl.classList.toggle('is-hidden', epoch.id !== 'present-day');
    this.scaleNoteEl.classList.toggle('is-hidden', epoch.id !== 'present-day');
    this._hideScaleNote(); // always start closed on a fresh epoch visit, never auto-reopened
  }

  /**
   * Renders whatever GalaxyFormationScene's "galaxy:selected" payload
   * says — this method has no galaxy-domain knowledge beyond
   * capitalizing a label and picking which buttons to show; all the
   * actual interpretation (type, stage, whether this is the Milky Way)
   * already happened in GalaxyGenerator.js/GalaxyFormationScene.js.
   */
  _renderGalaxyPanel({ type, massClass, starCount, isMilkyWay, stageLabel, viewMode }) {
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    this.galaxyTitleEl.textContent = isMilkyWay ? 'Milky Way' : 'Galaxy';
    this.galaxyTypeEl.textContent = capitalize(type);
    this.galaxySizeEl.textContent = capitalize(massClass);
    this.galaxyPopulationEl.textContent = `~${starCount} rendered stars (a simulated sample, not a literal count)`;
    this.galaxyStageEl.textContent = stageLabel;

    const inCloseup = viewMode === 'closeup';
    this.galaxyEnterButtonEl.classList.toggle('is-hidden', inCloseup);
    this.galaxyEnterButtonEl.textContent = isMilkyWay ? 'Enter Galaxy' : 'Explore Galaxy';
    this.galaxyReturnButtonEl.classList.toggle('is-hidden', !inCloseup);
    this.galaxyContinueButtonEl.classList.toggle('is-hidden', !(inCloseup && isMilkyWay));

    this.galaxyPanelEl.classList.remove('is-hidden');
  }

  _hideGalaxyPanel() {
    this.galaxyPanelEl.classList.add('is-hidden');
  }

  /**
   * Renders PresentDaySolarSystemScene's "planet:selected" payload —
   * deliberately minimal (name only, no facts list) per the spec's own
   * "do not create a large popup" requirement. Positioned near the tap
   * point initially (converted from the scene's NDC coordinates) and
   * clamped to stay fully on-screen — "the label should automatically
   * reposition if necessary so it remains visible on mobile screens."
   * The scene emits a continuous stream of "planet:label-position"
   * updates every frame after this (see _updatePlanetLabelPosition()
   * below) so the label keeps tracking the planet as it orbits, not
   * just this one initial position.
   */
  _renderPlanetLabel({ name, relativeOrbitalPeriodYears, ndcX, ndcY }) {
    // Compact - name plus one short fact, not a facts list ("do not
    // create a large popup" still applies). The "not to scale"
    // caption elsewhere in this same view already sets the context
    // that this is a relative figure, not a literal year count.
    this.planetLabelNameEl.textContent = `${name} · ${relativeOrbitalPeriodYears.toFixed(1)}y`;
    this.planetLabelEl.classList.remove('is-hidden');
    this._positionPlanetLabel(ndcX, ndcY);
  }

  /**
   * Position-only update for the already-visible label - called every
   * frame while a planet is selected (see
   * PresentDaySolarSystemScene.js's own
   * _updateSelectedPlanetLabelPosition()) so the label visibly follows
   * its planet's continued orbital motion. Deliberately does NOT touch
   * textContent or the is-hidden class - only _renderPlanetLabel()
   * above and _hidePlanetLabel() below own those.
   */
  _updatePlanetLabelPosition({ ndcX, ndcY }) {
    if (this.planetLabelEl.classList.contains('is-hidden')) return; // nothing selected right now - ignore stray/late position updates
    this._positionPlanetLabel(ndcX, ndcY);
  }

  _positionPlanetLabel(ndcX, ndcY) {
    const labelWidthEstimate = 170;
    const labelHeightEstimate = 40;
    const margin = 12;
    let left = ((ndcX + 1) / 2) * window.innerWidth + 16; // small offset so the label doesn't sit directly under a finger/cursor
    let top = ((1 - ndcY) / 2) * window.innerHeight - labelHeightEstimate - 16;
    left = Math.min(Math.max(left, margin), window.innerWidth - labelWidthEstimate - margin);
    top = Math.min(Math.max(top, margin), window.innerHeight - labelHeightEstimate - margin);
    this.planetLabelEl.style.left = `${left}px`;
    this.planetLabelEl.style.top = `${top}px`;
  }

  _hidePlanetLabel() {
    this.planetLabelEl.classList.add('is-hidden');
  }

  /**
   * Toggles the "not to scale" popup (see #hud-scale-note in
   * css/style.css) open/closed - separate from that element's
   * is-hidden class, which only gates per-epoch relevance. Using a
   * distinct is-visible class here (rather than reusing is-hidden)
   * lets the popup's appearance animate via CSS transition
   * (opacity/transform), which display:none can't do.
   */
  _toggleScaleNote() {
    const isOpen = this.scaleNoteEl.classList.toggle('is-visible');
    this.scaleInfoButtonEl.setAttribute('aria-expanded', String(isOpen));
  }

  _hideScaleNote() {
    this.scaleNoteEl.classList.remove('is-visible');
    this.scaleInfoButtonEl.setAttribute('aria-expanded', 'false');
  }
}
