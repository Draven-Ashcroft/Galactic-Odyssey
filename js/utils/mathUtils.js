/**
 * mathUtils.js
 * ------------------------------------------------------------------
 * Small, dependency-free numeric helpers. Nothing in this file knows
 * about cosmology, Three.js, or the DOM — keep it that way so it can
 * be unit-tested in isolation and reused by any future module.
 */

/** Clamp `value` into the inclusive range [min, max]. */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Standard linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Logarithmic interpolation between two positive quantities.
 *
 * Cosmic time and temperature both swing across dozens of orders of
 * magnitude within a single epoch (e.g. 1e-32 s -> 1 s). A linear
 * lerp would spend 99.999...% of the animation on the last instant,
 * so every epoch that spans large ranges should interpolate in log
 * space instead. `a` and `b` must be > 0.
 */
export function logLerp(a, b, t) {
  if (a <= 0 || b <= 0) {
    throw new Error(`logLerp requires positive values, got a=${a}, b=${b}`);
  }
  const logA = Math.log(a);
  const logB = Math.log(b);
  return Math.exp(lerp(logA, logB, t));
}

/** Inverse of logLerp: given a value between a and b, return t in [0, 1]. */
export function inverseLogLerp(a, b, value) {
  if (a <= 0 || b <= 0 || value <= 0) {
    throw new Error('inverseLogLerp requires positive values');
  }
  return (Math.log(value) - Math.log(a)) / (Math.log(b) - Math.log(a));
}

/**
 * Smoothstep-style ease, cubic in/out. `t` is clamped to [0, 1] first.
 * For visual/UI transitions (camera eases, reveal fades) — never use
 * this to bend the *scientific* epoch-progress value itself, only how
 * something visually responds to it.
 */
export function easeInOutCubic(t) {
  const c = clamp(t, 0, 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}
