import type { EasingName, MovementFeel } from './types';

export type EasingFn = (t: number) => number;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Cubic bezier solver for (0,0)–(p1x,p1y)–(p2x,p2y)–(1,1) curves.
 * Newton-Raphson with a bisection fallback, the same approach browsers use.
 */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): EasingFn {
  const ax = 3 * p1x - 3 * p2x + 1;
  const bx = 3 * p2x - 6 * p1x;
  const cx = 3 * p1x;
  const ay = 3 * p1y - 3 * p2y + 1;
  const by = 3 * p2y - 6 * p1y;
  const cy = 3 * p1y;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    const target = clamp01(x);
    if (target === 0 || target === 1) return target;

    let t = target;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - target;
      if (Math.abs(err) < 1e-6) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }

    let lo = 0;
    let hi = 1;
    t = target;
    for (let i = 0; i < 24; i++) {
      const value = sampleX(t);
      if (Math.abs(value - target) < 1e-6) break;
      if (value > target) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

/** Critically-damped-ish spring approximated in closed form so it stays deterministic. */
export function springEase(stiffness = 8, damping = 0.62): EasingFn {
  return (t: number) => {
    const x = clamp01(t);
    if (x === 1) return 1;
    const decay = Math.exp(-damping * stiffness * x);
    const freq = stiffness * Math.sqrt(Math.max(1 - damping * damping, 0.0001));
    return 1 - decay * Math.cos(freq * x);
  };
}

const elastic: EasingFn = (t) => {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return 1 + Math.pow(2, -11 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3));
};

const bounce: EasingFn = (t) => {
  const x = clamp01(t);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x - 1.5 / d1) ** 2 + 0.75;
  if (x < 2.5 / d1) return n1 * (x - 2.25 / d1) ** 2 + 0.9375;
  return n1 * (x - 2.625 / d1) ** 2 + 0.984375;
};

export const EASING_FNS: Record<EasingName, EasingFn> = {
  linear: clamp01,
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
  // Deliberately soft — this is the default for camera moves so they never snap.
  smooth: cubicBezier(0.33, 0, 0.16, 1),
  spring: springEase(),
  elastic,
  bounce,
};

export function ease(name: EasingName, t: number): number {
  return (EASING_FNS[name] ?? EASING_FNS.easeInOut)(t);
}

/** Maps the beginner-facing "feel" control onto a concrete curve + duration scale. */
export const FEEL_CURVES: Record<MovementFeel, { easing: EasingName; durationScale: number }> = {
  smooth: { easing: 'smooth', durationScale: 1 },
  snappy: { easing: 'easeOut', durationScale: 0.62 },
  cinematic: { easing: 'easeInOut', durationScale: 1.55 },
  elastic: { easing: 'elastic', durationScale: 1.15 },
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

export const inverseLerp = (a: number, b: number, v: number) =>
  a === b ? 0 : clamp01((v - a) / (b - a));

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  if (smoothing <= 0) return target;
  const factor = 1 - Math.exp(-dt / (smoothing * 0.35));
  return current + (target - current) * clamp01(factor);
}
