/**
 * core/EventBus.js
 * ------------------------------------------------------------------
 * A minimal synchronous publish/subscribe bus. This is the only
 * channel through which unrelated modules (e.g. UIManager and
 * CosmicTimeController) talk to each other, so nothing needs a direct
 * reference to anything else. Keep this file generic — it must never
 * import Three.js, DOM APIs, or any cosmology code.
 *
 * Convention used across this project:
 *   - "ui:*"     events are intents raised BY the UI ("ui:play-toggle").
 *   - "state:*"  events are facts broadcast by SimulationState/controllers
 *                after something actually changed ("state:time-updated").
 *   - "epoch:*"  events are raised by the EpochStateMachine around
 *                transitions ("epoch:will-change", "epoch:changed").
 *   - "input:*"  raw pointer/tap events on the 3D viewport, emitted by
 *                main.js ("input:canvas-tap") — generic input, not a
 *                UI-widget-driven intent, so it doesn't fit "ui:*".
 *                Any scene MAY subscribe if it does its own picking;
 *                most scenes ignore it entirely.
 *   - "galaxy:*" facts about GalaxyFormationScene's own selection state
 *                ("galaxy:selected", "galaxy:deselected") — scene-owned
 *                data, not SimulationState, but broadcast the same way
 *                "state:*" is so UIManager can react without a direct
 *                reference to the scene.
 * Consumers should generally react to "state:*" / "epoch:*" and never
 * mutate state directly — see SimulationState.js for why.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /** Subscribe `handler` to `eventName`. Returns an unsubscribe function. */
  on(eventName, handler) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    this._listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  /** Subscribe for exactly one emission, then auto-unsubscribe. */
  once(eventName, handler) {
    const unsubscribe = this.on(eventName, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  off(eventName, handler) {
    this._listeners.get(eventName)?.delete(handler);
  }

  /** Emit `eventName` to every current subscriber, synchronously, in order. */
  emit(eventName, payload) {
    const handlers = this._listeners.get(eventName);
    if (!handlers) return;
    // Copy to an array first: a handler that unsubscribes itself (or
    // others) during emission must not corrupt the Set being iterated.
    for (const handler of Array.from(handlers)) {
      handler(payload);
    }
  }

  /** Remove every listener for one event, or every listener entirely. */
  clear(eventName) {
    if (eventName) this._listeners.delete(eventName);
    else this._listeners.clear();
  }
}
