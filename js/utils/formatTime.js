/**
 * formatTime.js
 * ------------------------------------------------------------------
 * Converts a raw "seconds after the Big Bang" number into a human
 * readable label (e.g. "380,000 yr", "1.2 ms", "13.8 Gyr"). This is
 * presentation-only logic — the simulation core always works in
 * seconds so that CosmicTimeController and TemperatureModel never
 * have to think about display units.
 */

const YEAR_IN_SECONDS = 365.25 * 24 * 3600;

/** Format a cosmic-time value (seconds since t=0) for the HUD. */
export function formatCosmicTime(seconds) {
  if (seconds < 1e-6) return `${seconds.toExponential(2)} s`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(2)} ms`;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;

  const years = seconds / YEAR_IN_SECONDS;
  if (years < 1) return `${(seconds / 3600 / 24).toFixed(1)} days`;
  if (years < 1e3) return `${years.toFixed(0)} yr`;
  if (years < 1e6) return `${(years / 1e3).toFixed(1)} kyr`;
  if (years < 1e9) return `${(years / 1e6).toFixed(1)} Myr`;
  // 3 decimals, not 2: two of the late Solar-System-formation epochs
  // (protoplanetary-disk, planetesimal-formation) each span under
  // 0.005 Gyr in total - at 2 decimals, this value could show ZERO
  // visible change for an entire epoch's playback, reading as a
  // frozen clock even though the simulation is advancing correctly.
  // 3 decimals resolves down to 0.5 Myr, comfortably inside both
  // epochs' own durations (3.17 Myr and 4.75 Myr respectively).
  return `${(years / 1e9).toFixed(3)} Gyr`;
}

/** Format a temperature in Kelvin for the HUD. */
export function formatTemperature(kelvin) {
  if (kelvin >= 1e6) return `${kelvin.toExponential(2)} K`;
  if (kelvin >= 1) return `${kelvin.toFixed(kelvin < 100 ? 1 : 0)} K`;
  return `${kelvin.toExponential(2)} K`;
}
