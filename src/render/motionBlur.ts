/**
 * Velocity-based optical motion blur for the shared preview/export compositor.
 *
 * Samples the layer along its motion path (position + rotation + scale) rather
 * than only fading camera zoom ghosts. Text layers skip blur so captions stay
 * readable.
 */

import { resolveLayerTransform, type ResolvedTransform } from '../core/animation';
import type { Layer, MotionBlurLevel, Size } from '../core/types';

export interface MotionSample {
  /** 0–1 weight (more recent = higher). */
  weight: number;
  transform: ResolvedTransform;
}

const LEVEL: Record<Exclude<MotionBlurLevel, 'off'>, { samples: number; shutter: number }> = {
  low: { samples: 4, shutter: 0.35 },
  medium: { samples: 7, shutter: 0.55 },
  high: { samples: 11, shutter: 0.8 },
};

export function motionBlurConfig(level: MotionBlurLevel | undefined) {
  if (!level || level === 'off') return null;
  return LEVEL[level];
}

/** True when the layer should receive optical motion blur. */
export function shouldMotionBlur(layer: Layer): boolean {
  if (layer.type === 'text' || layer.type === 'audio') return false;
  return (layer.motionBlur ?? 'off') !== 'off';
}

/**
 * Build shutter samples ending at `localTime`, looking back `shutter` seconds
 * of layer-local time. Weights favour the present (film-like shutter).
 */
export function motionPathSamples(
  layer: Layer,
  localTime: number,
  canvas: Size,
  level: MotionBlurLevel,
): MotionSample[] {
  const cfg = motionBlurConfig(level);
  if (!cfg) return [];
  const out: MotionSample[] = [];
  const n = cfg.samples;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const t = Math.max(0, localTime - cfg.shutter * (1 - f));
    const transform = resolveLayerTransform(layer, t, {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });
    // Triangle-ish shutter: peak at present.
    const weight = 0.15 + 0.85 * f * f;
    out.push({ weight, transform });
  }
  // Normalise
  const sum = out.reduce((s, p) => s + p.weight, 0) || 1;
  for (const p of out) p.weight /= sum;
  return out;
}

/** Peak spatial velocity (px/s) across samples — used to skip blur when still. */
export function peakVelocity(samples: MotionSample[], shutter: number): number {
  if (samples.length < 2 || shutter <= 1e-4) return 0;
  let peak = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].transform;
    const b = samples[i].transform;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const dScale = Math.abs(b.scale - a.scale) * 400;
    const dRot = Math.abs(b.rotation - a.rotation) * 3;
    peak = Math.max(peak, (dist + dScale + dRot) / shutter);
  }
  return peak;
}
