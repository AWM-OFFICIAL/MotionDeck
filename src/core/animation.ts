import { EASING_FNS, FEEL_CURVES, clamp, ease, inverseLerp, lerp } from './easing';
import type {
  AnimatableProperty,
  EntrancePreset,
  ExitPreset,
  IdlePreset,
  Keyframe,
  Layer,
  MotionSpec,
} from './types';

/** Fully resolved visual state of a layer at one instant. */
export interface ResolvedTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  blur: number;
  cornerRadiusDelta: number;
  /** 0–1 reveal amount, driven by typewriter / word-reveal text animations. */
  reveal: number;
}

const IDENTITY: ResolvedTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  blur: 0,
  cornerRadiusDelta: 0,
  reveal: 1,
};

/* --------------------------------------------------------------- keyframes */

/** Samples a keyframe track. Returns `undefined` when the track can't drive the property. */
export function sampleTrack(track: Keyframe[] | undefined, time: number): number | undefined {
  if (!track || track.length === 0) return undefined;
  const sorted = track.length > 1 ? [...track].sort((a, b) => a.time - b.time) : track;
  if (time <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = inverseLerp(a.time, b.time, time);
      // The easing on the *outgoing* keyframe governs the segment, matching how
      // every mainstream animation tool behaves.
      return lerp(a.value, b.value, ease(b.easing ?? a.easing, t));
    }
  }
  return last.value;
}

export const hasKeyframes = (layer: Layer, prop: AnimatableProperty): boolean =>
  (layer.keyframes[prop]?.length ?? 0) > 0;

/* -------------------------------------------------------------- entrance/exit */

interface Offsets {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  blur: number;
}

const NO_OFFSET: Offsets = { x: 0, y: 0, scale: 1, opacity: 1, blur: 0 };

function entranceOffsets(preset: EntrancePreset, p: number, span: number): Offsets {
  const inv = 1 - p;
  // Keep a tiny bit of opacity so scrubbing to the first frame never looks like
  // a missing/broken layer (selection box over empty stage).
  const fade = Math.max(0.04, p);
  switch (preset) {
    case 'fade':
      return { ...NO_OFFSET, opacity: fade };
    case 'slideUp':
      return { ...NO_OFFSET, y: inv * span, opacity: fade };
    case 'slideDown':
      return { ...NO_OFFSET, y: -inv * span, opacity: fade };
    case 'slideLeft':
      return { ...NO_OFFSET, x: inv * span, opacity: fade };
    case 'slideRight':
      return { ...NO_OFFSET, x: -inv * span, opacity: fade };
    case 'scale':
      return { ...NO_OFFSET, scale: lerp(0.82, 1, p), opacity: fade };
    case 'pop':
      return { ...NO_OFFSET, scale: lerp(0.6, 1, p), opacity: clamp(p * 1.6, 0.04, 1) };
    case 'blurIn':
      return { ...NO_OFFSET, blur: inv * 26, opacity: fade, scale: lerp(1.04, 1, p) };
    case 'floatIn':
      return { ...NO_OFFSET, y: inv * span * 0.45, opacity: fade, scale: lerp(0.96, 1, p) };
    case 'reveal':
      return { ...NO_OFFSET, scale: lerp(0.92, 1, p), opacity: fade, blur: inv * 8 };
    default:
      return NO_OFFSET;
  }
}

function exitOffsets(preset: ExitPreset, p: number, span: number): Offsets {
  switch (preset) {
    case 'fade':
      return { ...NO_OFFSET, opacity: 1 - p };
    case 'slideUp':
      return { ...NO_OFFSET, y: -p * span, opacity: 1 - p };
    case 'slideDown':
      return { ...NO_OFFSET, y: p * span, opacity: 1 - p };
    case 'slideLeft':
      return { ...NO_OFFSET, x: -p * span, opacity: 1 - p };
    case 'slideRight':
      return { ...NO_OFFSET, x: p * span, opacity: 1 - p };
    case 'scaleDown':
      return { ...NO_OFFSET, scale: lerp(1, 0.86, p), opacity: 1 - p };
    case 'blurOut':
      return { ...NO_OFFSET, blur: p * 26, opacity: 1 - p };
    case 'softDisappear':
      return { ...NO_OFFSET, scale: lerp(1, 0.94, p), opacity: 1 - p, blur: p * 10 };
    default:
      return NO_OFFSET;
  }
}

/* ---------------------------------------------------------------- idle motion */

function idleOffsets(preset: IdlePreset, t: number, duration: number, intensity: number): Offsets {
  const p = duration > 0 ? clamp(t / duration, 0, 1) : 0;
  const k = intensity;
  switch (preset) {
    case 'smoothZoom':
      return { ...NO_OFFSET, scale: 1 + 0.08 * k * ease('easeInOut', p) };
    case 'punchIn': {
      // Fast push that settles in the first 20% and then holds.
      const punch = ease('easeOut', clamp(p / 0.2, 0, 1));
      return { ...NO_OFFSET, scale: 1 + 0.12 * k * punch };
    }
    case 'float':
      return { ...NO_OFFSET, y: Math.sin(t * 1.1) * 14 * k };
    case 'drift':
      return { ...NO_OFFSET, x: Math.sin(t * 0.55) * 26 * k, y: Math.cos(t * 0.4) * 12 * k };
    case 'slowPush':
      return { ...NO_OFFSET, scale: 1 + 0.16 * k * p, y: -p * 18 * k };
    case 'slide':
      return { ...NO_OFFSET, x: lerp(-40 * k, 40 * k, ease('easeInOut', p)) };
    case 'bounce': {
      const b = Math.abs(Math.sin(t * 2.4)) * Math.exp(-t * 0.35);
      return { ...NO_OFFSET, y: -b * 22 * k };
    }
    case 'cinematic':
      return {
        ...NO_OFFSET,
        scale: 1 + 0.1 * k * ease('easeInOut', p),
        x: lerp(18 * k, -18 * k, ease('easeInOut', p)),
      };
    case 'pulse': {
      const wave = (Math.sin(t * 4.2) + 1) / 2;
      return { ...NO_OFFSET, scale: 1 + 0.035 * k * wave };
    }
    case 'breathe': {
      const wave = (Math.sin(t * 1.4) + 1) / 2;
      return { ...NO_OFFSET, scale: 1 + 0.02 * k * wave, opacity: 1 - 0.06 * k * (1 - wave) };
    }
    case 'glow': {
      const wave = (Math.sin(t * 2.2) + 1) / 2;
      return { ...NO_OFFSET, blur: 4 * k * wave };
    }
    case 'shake':
      return { ...NO_OFFSET, x: Math.sin(t * 28) * 3.5 * k * Math.exp(-t * 0.15) };
    case 'highlight': {
      const wave = (Math.sin(t * 3.5) + 1) / 2;
      return { ...NO_OFFSET, opacity: 1 - 0.12 * k * (1 - wave), scale: 1 + 0.015 * k * wave };
    }
    default:
      return NO_OFFSET;
  }
}

/* ------------------------------------------------------------------ resolver */

export interface ResolveOptions {
  /** Canvas width, used to scale slide distances proportionally. */
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Computes the layer's transform at `localTime` (seconds from the layer's start).
 * Preset motion is composed first; explicit keyframes then override the properties
 * they cover, so an advanced user's keyframes always win over a beginner preset.
 */
export function resolveLayerTransform(
  layer: Layer,
  localTime: number,
  opts: ResolveOptions,
): ResolvedTransform {
  const motion: MotionSpec = layer.motion;
  const feel = FEEL_CURVES[motion.feel] ?? FEEL_CURVES.smooth;
  const curve = EASING_FNS[feel.easing] ?? EASING_FNS.smooth;
  const span = Math.min(opts.canvasWidth, opts.canvasHeight) * 0.22;
  const duration = layer.duration;

  const out: ResolvedTransform = { ...IDENTITY };

  // Idle
  if (motion.idle !== 'none') {
    const o = idleOffsets(motion.idle, localTime, duration, motion.intensity);
    out.x += o.x;
    out.y += o.y;
    out.scale *= o.scale;
    out.blur += o.blur;
  }

  // Entrance
  const inDur = Math.max(0.01, motion.entranceDuration * feel.durationScale);
  if (motion.entrance !== 'none' && localTime < inDur) {
    const o = entranceOffsets(motion.entrance, curve(clamp(localTime / inDur, 0, 1)), span);
    out.x += o.x;
    out.y += o.y;
    out.scale *= o.scale;
    out.opacity *= o.opacity;
    out.blur += o.blur;
  }

  // Exit
  const outDur = Math.max(0.01, motion.exitDuration * feel.durationScale);
  const exitStart = duration - outDur;
  if (motion.exit !== 'none' && localTime > exitStart) {
    const o = exitOffsets(motion.exit, curve(clamp((localTime - exitStart) / outDur, 0, 1)), span);
    out.x += o.x;
    out.y += o.y;
    out.scale *= o.scale;
    out.opacity *= o.opacity;
    out.blur += o.blur;
  }

  // Text reveal progress is driven by the entrance window.
  if (layer.type === 'text') {
    const revealDur = Math.max(0.15, inDur);
    out.reveal =
      layer.animation === 'typewriter' || layer.animation === 'wordReveal'
        ? clamp(localTime / revealDur, 0, 1)
        : 1;
  }

  // Keyframe overrides
  const kf = layer.keyframes;
  const kx = sampleTrack(kf.x, localTime);
  const ky = sampleTrack(kf.y, localTime);
  const ks = sampleTrack(kf.scale, localTime);
  const kr = sampleTrack(kf.rotation, localTime);
  const ko = sampleTrack(kf.opacity, localTime);
  const kb = sampleTrack(kf.blur, localTime);
  const kc = sampleTrack(kf.cornerRadius, localTime);

  // Tracks store absolute editor values. A tracked property replaces both the
  // base value and preset contribution; an untracked property composes normally.
  if (kx !== undefined) out.x = kx;
  else out.x += layer.position.x;
  if (ky !== undefined) out.y = ky;
  else out.y += layer.position.y;
  if (ks !== undefined) out.scale = ks;
  else out.scale *= layer.scale;
  if (kr !== undefined) out.rotation = kr;
  else out.rotation += layer.rotation;
  if (ko !== undefined) out.opacity = ko;
  else out.opacity *= layer.opacity;
  if (kb !== undefined) out.blur = kb;
  if (kc !== undefined) {
    const baseRadius = 'cornerRadius' in layer ? layer.cornerRadius : 0;
    out.cornerRadiusDelta = kc - baseRadius;
  }

  out.opacity = clamp(out.opacity, 0, 1);

  return out;
}

export const isLayerActive = (layer: Layer, sceneTime: number): boolean =>
  !layer.hidden && sceneTime >= layer.start - 1e-6 && sceneTime < layer.start + layer.duration;
