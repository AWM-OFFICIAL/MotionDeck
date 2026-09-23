import { uid } from './ids';
import { clamp, ease, lerp } from './easing';
import type { CameraSpec, CursorEvent, FocusPoint, Rect, Size, VideoLayer } from './types';

/**
 * Camera state expressed in the *visible crop's* normalised space.
 * `zoom` = 1 means the whole cropped region is visible; `x`/`y` are the 0–1
 * coordinates the camera is centred on inside that crop.
 */
export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export const NEUTRAL_CAMERA: CameraState = { x: 0.5, y: 0.5, zoom: 1 };

const FULL_CROP: Rect = { x: 0, y: 0, width: 1, height: 1 };

/** Map a point from full-source 0–1 space into crop-relative 0–1 space. */
export function sourcePointToCropSpace(x: number, y: number, crop: Rect = FULL_CROP): { x: number; y: number } {
  return {
    x: clamp((x - crop.x) / Math.max(crop.width, 1e-6), 0, 1),
    y: clamp((y - crop.y) / Math.max(crop.height, 1e-6), 0, 1),
  };
}

export function pointInCrop(x: number, y: number, crop: Rect = FULL_CROP): boolean {
  return x >= crop.x && x <= crop.x + crop.width && y >= crop.y && y <= crop.y + crop.height;
}

/** Cursor position (normalised) sampled from the recording's event log. */
export function sampleCursor(events: CursorEvent[], t: number): CursorEvent | undefined {
  if (events.length === 0) return undefined;
  if (t <= events[0].t) return events[0];
  const last = events[events.length - 1];
  if (t >= last.t) return last;

  // Events are stored sorted; binary search keeps this cheap for long recordings.
  let lo = 0;
  let hi = events.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = events[lo];
  const b = events[hi];
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { t, x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
}

/**
 * Applies a moving-average to the cursor path. Hand-held mouse movement is jittery
 * at 60fps; this is what the one-click "Smooth Cursor" control drives.
 */
export function smoothCursorPath(events: CursorEvent[], amount: number): CursorEvent[] {
  if (events.length < 3 || amount <= 0) return events;
  const window = Math.max(1, Math.round(amount * 12));
  const out: CursorEvent[] = new Array(events.length);

  for (let i = 0; i < events.length; i++) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(events.length - 1, i + window); j++) {
      // Weight by distance in the window so the path stays responsive to real moves.
      const w = 1 - Math.abs(i - j) / (window + 1);
      sx += events[j].x * w;
      sy += events[j].y * w;
      n += w;
    }
    const e = events[i];
    out[i] = {
      t: e.t,
      // Clicks must land exactly where the user clicked, so they are never smoothed.
      x: e.down ? e.x : lerp(e.x, sx / n, amount),
      y: e.down ? e.y : lerp(e.y, sy / n, amount),
      down: e.down,
      button: e.button,
    };
  }
  return out;
}

/** Click events within the layer's trimmed range, rebased to layer-local time. */
export function clicksInRange(layer: VideoLayer, events: CursorEvent[]): CursorEvent[] {
  return events
    .filter((e) => e.down && e.t >= layer.trimStart && e.t <= layer.trimEnd)
    .map((e) => ({ ...e, t: (e.t - layer.trimStart) / Math.max(layer.playbackRate, 0.01) }));
}

export interface AutoFocusOptions {
  zoom?: number;
  hold?: number;
  ramp?: number;
  /** Clicks closer together than this (seconds) collapse into one focus point. */
  mergeWindow?: number;
  maxPoints?: number;
}

/**
 * Turns recorded clicks into camera focus points — the "Focus on Click" feature.
 * Nearby clicks are merged so a burst of typing doesn't produce a strobing camera.
 */
export function buildFocusPointsFromClicks(
  layer: VideoLayer,
  events: CursorEvent[],
  opts: AutoFocusOptions = {},
): FocusPoint[] {
  const zoom = opts.zoom ?? 1.8;
  const hold = opts.hold ?? 1.1;
  const ramp = opts.ramp ?? 0.7;
  const mergeWindow = opts.mergeWindow ?? 1.6;
  const maxPoints = opts.maxPoints ?? 24;

  const clicks = clicksInRange(layer, events);
  if (clicks.length === 0) return [];

  // When an app-screen crop is active, prefer clicks that land inside it.
  const crop = layer.appScreen?.animateFullRecording ? FULL_CROP : layer.crop;
  const croppedClicks =
    crop.width < 0.995 || crop.height < 0.995 || crop.x > 0.002 || crop.y > 0.002
      ? clicks.filter((c) => pointInCrop(c.x, c.y, crop))
      : clicks;
  const usable = croppedClicks.length > 0 ? croppedClicks : clicks;

  const clusters: { t: number; x: number; y: number; n: number }[] = [];
  for (const c of usable) {
    const prev = clusters[clusters.length - 1];
    const near =
      prev &&
      c.t - prev.t < mergeWindow &&
      Math.hypot(c.x - prev.x, c.y - prev.y) < 0.12;
    if (near) {
      prev.x = (prev.x * prev.n + c.x) / (prev.n + 1);
      prev.y = (prev.y * prev.n + c.y) / (prev.n + 1);
      prev.n += 1;
    } else {
      clusters.push({ t: c.t, x: c.x, y: c.y, n: 1 });
    }
  }

  return clusters.slice(0, maxPoints).map((c) => {
    const mapped = sourcePointToCropSpace(c.x, c.y, crop);
    const useCrop =
      crop.width < 0.995 || crop.height < 0.995 || crop.x > 0.002 || crop.y > 0.002;
    return {
      id: uid('fp'),
      // Start the push slightly before the click so the viewer is already looking there.
      time: Math.max(0, c.t - ramp * 0.55),
      x: clamp(useCrop ? mapped.x : c.x, 0, 1),
      y: clamp(useCrop ? mapped.y : c.y, 0, 1),
      coordinateSpace: useCrop ? ('crop' as const) : ('source' as const),
      zoom,
      hold,
      ramp,
      easing: 'smooth' as const,
      auto: true,
    };
  });
}

/** Contribution of a single focus point at time `t`: 0 = ignored, 1 = fully parked. */
function focusWeight(fp: FocusPoint, t: number): number {
  const inStart = fp.time;
  const inEnd = fp.time + fp.ramp;
  const outStart = inEnd + fp.hold;
  const outEnd = outStart + fp.ramp;
  if (t <= inStart || t >= outEnd) return 0;
  if (t < inEnd) return ease(fp.easing, (t - inStart) / Math.max(fp.ramp, 1e-4));
  if (t <= outStart) return 1;
  return 1 - ease(fp.easing, (t - outStart) / Math.max(fp.ramp, 1e-4));
}

export interface CameraEvalContext {
  /** Layer-local time in seconds. */
  time: number;
  cursor: CursorEvent[];
  /** Source footage dimensions, used to keep the viewport inside the frame. */
  source: Size;
  /**
   * Active source crop (normalised). Focus points and cursor events are stored in
   * full-source space; the compositor pans in crop space, so we remap here.
   */
  crop?: Rect;
}

/**
 * Evaluates the camera to a concrete viewport. Deterministic: given the same time it
 * always returns the same state, so scrubbing, playback and export stay identical.
 */
export function evaluateCamera(spec: CameraSpec, ctx: CameraEvalContext): CameraState {
  const { time } = ctx;
  const crop = ctx.crop ?? FULL_CROP;

  // Focus points apply to every mode except 'none'; they are additive on top of
  // whatever the base mode is doing. Remap source-space points into crop space.
  const applyFocus = (base: CameraState): CameraState => {
    let x = base.x;
    let y = base.y;
    let zoom = base.zoom;
    for (const fp of spec.focusPoints) {
      const w = focusWeight(fp, time);
      if (w <= 0) continue;
      const mapped =
        fp.coordinateSpace === 'crop'
          ? { x: fp.x, y: fp.y }
          : sourcePointToCropSpace(fp.x, fp.y, crop);
      x = lerp(x, mapped.x, w);
      y = lerp(y, mapped.y, w);
      zoom = lerp(zoom, fp.zoom, w);
    }
    return { x, y, zoom };
  };

  if (spec.mode === 'none') {
    return spec.focusPoints.length > 0 ? clampCamera(applyFocus(NEUTRAL_CAMERA)) : NEUTRAL_CAMERA;
  }

  if (spec.mode === 'manual') {
    return clampCamera(applyFocus(NEUTRAL_CAMERA));
  }

  if (spec.mode === 'followCursor' || spec.mode === 'dynamic') {
    // Average the cursor over a trailing window so the camera lags gracefully
    // instead of mirroring every twitch.
    const lag = lerp(0.05, 0.85, spec.smoothing);
    const samples = 6;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < samples; i++) {
      const s = sampleCursor(ctx.cursor, time - (lag * i) / samples);
      if (s) {
        const mapped = sourcePointToCropSpace(s.x, s.y, crop);
        const w = 1 - i / (samples + 1);
        sx += mapped.x * w;
        sy += mapped.y * w;
        n += w;
      }
    }
    if (n === 0) return clampCamera(applyFocus({ ...NEUTRAL_CAMERA, zoom: spec.zoom }));

    let zoom = spec.zoom;
    if (spec.mode === 'dynamic') {
      // Pull back while the cursor is travelling fast, push in when it settles.
      const a = sampleCursor(ctx.cursor, time - 0.18);
      const b = sampleCursor(ctx.cursor, time);
      const speed = a && b ? Math.hypot(b.x - a.x, b.y - a.y) / 0.18 : 0;
      zoom = lerp(spec.zoom, 1.06, clamp(speed * 1.8, 0, 1));
    }
    return clampCamera(applyFocus({ x: sx / n, y: sy / n, zoom }));
  }

  if (spec.mode === 'followClicks' || spec.mode === 'smoothFocus') {
    // These modes are driven entirely by focus points, which the editor generates
    // from the click log. Without points they are a no-op rather than a silent failure.
    return clampCamera(applyFocus(NEUTRAL_CAMERA));
  }

  return NEUTRAL_CAMERA;
}

/** Keeps the camera viewport fully inside the footage so no empty edges show. */
export function clampCamera(state: CameraState): CameraState {
  const zoom = Math.max(1, state.zoom);
  const half = 1 / (2 * zoom);
  return {
    zoom,
    x: clamp(state.x, half, 1 - half),
    y: clamp(state.y, half, 1 - half),
  };
}
