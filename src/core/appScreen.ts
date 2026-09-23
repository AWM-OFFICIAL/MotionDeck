/**
 * Android App Screen — non-destructive crop helpers, detection, and shape presets.
 *
 * The source video is never rewritten. Crop lives on VideoLayer.crop as normalised
 * source coordinates; appScreen metadata describes how the user arrived there.
 */

import type {
  AppScreenCornerPreset,
  AppScreenCropMode,
  AppScreenSpec,
  Rect,
  VideoLayer,
} from './types';
import { clamp } from './easing';

export const FULL_CROP: Rect = { x: 0, y: 0, width: 1, height: 1 };

export const APP_SCREEN_ASPECTS = {
  androidPortrait: 9 / 16,
  androidCompact: 9 / 19.5,
  socialVertical: 9 / 16,
} as const;

export const CORNER_PRESET_RADIUS: Record<AppScreenCornerPreset, number> = {
  subtle: 12,
  standard: 28,
  iphone: 48,
  android: 36,
  edge: 4,
};

export function defaultAppScreen(partial: Partial<AppScreenSpec> = {}): AppScreenSpec {
  return {
    enabled: false,
    mode: 'none',
    lockedAspect: true,
    aspectRatio: APP_SCREEN_ASPECTS.androidPortrait,
    shape: 'rounded',
    cornerPreset: 'android',
    trackingEnabled: false,
    animateFullRecording: false,
    showSafeArea: false,
    ...partial,
  };
}

export function isAppScreenActive(layer: VideoLayer): boolean {
  const app = layer.appScreen;
  if (!app?.enabled) return false;
  if (app.animateFullRecording) return false;
  return layer.crop.width < 0.995 || layer.crop.height < 0.995 || layer.crop.x > 0.002 || layer.crop.y > 0.002;
}

export function effectiveCrop(layer: VideoLayer): Rect {
  if (layer.appScreen?.animateFullRecording) return FULL_CROP;
  return layer.crop;
}

export function normalizeCrop(crop: Rect): Rect {
  const width = clamp(crop.width, 0.05, 1);
  const height = clamp(crop.height, 0.05, 1);
  const x = clamp(crop.x, 0, 1 - width);
  const y = clamp(crop.y, 0, 1 - height);
  return { x, y, width, height };
}

/** Fit a crop rectangle to a target aspect (width/height), keeping its centre. */
export function lockCropToAspect(crop: Rect, aspect: number): Rect {
  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;
  let width = crop.width;
  let height = crop.height;
  const current = width / Math.max(height, 1e-6);
  if (current > aspect) {
    width = height * aspect;
  } else {
    height = width / aspect;
  }
  if (width > 1) {
    width = 1;
    height = width / aspect;
  }
  if (height > 1) {
    height = 1;
    width = height * aspect;
  }
  return normalizeCrop({
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  });
}

export function centeredAspectCrop(aspect: number, coverage = 0.72): Rect {
  let width = coverage;
  let height = coverage / aspect;
  if (height > 0.92) {
    height = 0.92;
    width = height * aspect;
  }
  if (width > 0.92) {
    width = 0.92;
    height = width / aspect;
  }
  return normalizeCrop({
    x: (1 - width) / 2,
    y: (1 - height) / 2,
    width,
    height,
  });
}

export function cropPresetRect(mode: AppScreenCropMode, detected?: Rect | null): Rect {
  switch (mode) {
    case 'androidPortrait':
      return centeredAspectCrop(APP_SCREEN_ASPECTS.androidPortrait);
    case 'androidCompact':
      return centeredAspectCrop(APP_SCREEN_ASPECTS.androidCompact, 0.7);
    case 'detected':
      return detected ? normalizeCrop(detected) : centeredAspectCrop(APP_SCREEN_ASPECTS.androidPortrait);
    case 'custom':
    case 'none':
    default:
      return FULL_CROP;
  }
}

export function radiusForShape(
  shape: AppScreenSpec['shape'],
  preset: AppScreenCornerPreset,
  customRadius: number,
): number {
  if (shape === 'rect') return 0;
  if (shape === 'deviceScreen' || shape === 'rounded') return CORNER_PRESET_RADIUS[preset];
  return customRadius;
}

export interface DetectedAppScreen {
  crop: Rect;
  confidence: number;
  aspect: number;
  reason: string;
}

/**
 * Detect a portrait mobile display inside an emulator recording frame.
 * Uses a background-vs-content scan — no ML, works offline.
 */
export function detectAppScreenFromImageData(data: ImageData): DetectedAppScreen | null {
  const { width: w, height: h, data: px } = data;
  if (w < 32 || h < 32) return null;

  const lum = (i: number) => {
    const o = i * 4;
    return 0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2];
  };

  // Sample corner patches as "desktop / chrome" background.
  const patch = Math.max(2, Math.floor(Math.min(w, h) * 0.04));
  const samples: number[] = [];
  const pushPatch = (sx: number, sy: number) => {
    for (let y = sy; y < sy + patch; y++) {
      for (let x = sx; x < sx + patch; x++) {
        samples.push(lum(y * w + x));
      }
    }
  };
  pushPatch(0, 0);
  pushPatch(w - patch, 0);
  pushPatch(0, h - patch);
  pushPatch(w - patch, h - patch);
  samples.sort((a, b) => a - b);
  const bg = samples[Math.floor(samples.length / 2)] ?? 30;

  // Row / column activity relative to background.
  const rowScore = new Float32Array(h);
  const colScore = new Float32Array(w);
  const step = Math.max(1, Math.floor(Math.min(w, h) / 180));
  for (let y = 0; y < h; y += step) {
    let sum = 0;
    let n = 0;
    for (let x = 0; x < w; x += step) {
      const d = Math.abs(lum(y * w + x) - bg);
      sum += d;
      n++;
      colScore[x] += d;
    }
    rowScore[y] = n ? sum / n : 0;
  }
  for (let x = 0; x < w; x += step) {
    colScore[x] /= Math.max(1, Math.ceil(h / step));
  }

  const threshold = Math.max(14, bg * 0.18 + 10);
  const activeRows: number[] = [];
  const activeCols: number[] = [];
  for (let y = 0; y < h; y += step) {
    if (rowScore[y] > threshold) activeRows.push(y);
  }
  for (let x = 0; x < w; x += step) {
    if (colScore[x] > threshold) activeCols.push(x);
  }

  if (activeRows.length < 4 || activeCols.length < 4) {
    // Portrait source with weak boundaries → almost certainly a full-bleed app recording.
    if (w / h < 0.85) {
      return {
        crop: normalizeCrop({ x: 0.01, y: 0.01, width: 0.98, height: 0.98 }),
        confidence: 0.8,
        aspect: w / h,
        reason: 'Portrait recording with no emulator chrome — using the full display.',
      };
    }
    return {
      crop: centeredAspectCrop(APP_SCREEN_ASPECTS.androidPortrait),
      confidence: 0.25,
      aspect: APP_SCREEN_ASPECTS.androidPortrait,
      reason: 'No strong screen boundary — suggested a centred Android portrait crop.',
    };
  }

  let top = activeRows[0];
  let bottom = activeRows[activeRows.length - 1];
  let left = activeCols[0];
  let right = activeCols[activeCols.length - 1];

  // Only shrink chrome strips when the active region looks like a large window
  // with a denser phone inside — NOT when the frame is already a full-bleed
  // portrait app recording (densest-span would collapse onto a bright column).
  const activeW = right - left;
  const activeH = bottom - top;
  const coverW = activeW / w;
  const coverH = activeH / h;
  const activeAspect = activeW / Math.max(activeH, 1);
  const sourcePortrait = w / h < 0.85;
  // Full-bleed phone recordings: the whole frame is the app. Never densest-span these.
  const alreadyPortraitApp =
    (sourcePortrait && coverH > 0.55 && coverW > 0.4) ||
    (activeAspect < 0.85 && coverW > 0.55 && coverH > 0.7);

  if (!alreadyPortraitApp && !sourcePortrait && (coverW > 0.55 || coverH > 0.75)) {
    const densestSpan = (scores: Float32Array, start: number, end: number, stepN: number) => {
      let bestStart = start;
      let bestEnd = end;
      let best = -1;
      const len = end - start;
      const minLen = Math.max(stepN * 8, len * 0.45);
      for (let a = start; a < end; a += stepN) {
        let acc = 0;
        for (let b = a; b < end; b += stepN) {
          acc += scores[b] ?? 0;
          const span = b - a;
          if (span >= minLen) {
            const score = acc / Math.max(1, span / stepN);
            if (score > best) {
              best = score;
              bestStart = a;
              bestEnd = b;
            }
          }
        }
      }
      return { start: bestStart, end: bestEnd };
    };
    const rowSpan = densestSpan(rowScore, top, bottom, step);
    const colSpan = densestSpan(colScore, left, right, step);
    // Reject densest spans that collapse more than ~35% — prefer the outer bound.
    if ((colSpan.end - colSpan.start) / Math.max(activeW, 1) > 0.65) {
      left = colSpan.start;
      right = colSpan.end;
    }
    if ((rowSpan.end - rowSpan.start) / Math.max(activeH, 1) > 0.65) {
      top = rowSpan.start;
      bottom = rowSpan.end;
    }
  }

  // Pad slightly so UI chrome at edges isn't clipped.
  const padX = (right - left) * 0.01;
  const padY = (bottom - top) * 0.008;
  left = Math.max(0, left - padX);
  right = Math.min(w - 1, right + padX);
  top = Math.max(0, top - padY);
  bottom = Math.min(h - 1, bottom + padY);

  let crop = normalizeCrop({
    x: left / w,
    y: top / h,
    width: (right - left) / w,
    height: (bottom - top) / h,
  });

  // Guard against pathological narrow columns (bright UI lanes).
  if (crop.width < 0.35 && crop.height > 0.45) {
    if (sourcePortrait) {
      crop = normalizeCrop({ x: 0.01, y: 0.01, width: 0.98, height: 0.98 });
    } else {
      crop = lockCropToAspect(
        {
          x: crop.x + crop.width / 2 - 0.2,
          y: crop.y,
          width: 0.4,
          height: crop.height,
        },
        APP_SCREEN_ASPECTS.androidPortrait,
      );
    }
  }

  // Full-bleed portrait recordings: keep nearly the whole frame.
  if (
    sourcePortrait ||
    alreadyPortraitApp ||
    (crop.width > 0.82 && crop.height > 0.82 && crop.width / crop.height < 0.85)
  ) {
    if (sourcePortrait || alreadyPortraitApp) {
      crop = normalizeCrop({
        x: 0.01,
        y: 0.01,
        width: 0.98,
        height: 0.98,
      });
    }
  }

  const aspect = crop.width / Math.max(crop.height, 1e-6);
  const portrait = aspect < 0.85;
  let confidence = portrait ? 0.72 : 0.45;
  if (crop.width > 0.35 && crop.height > 0.45) confidence += 0.1;
  if (alreadyPortraitApp) confidence = Math.max(confidence, 0.88);
  if (Math.abs(aspect - APP_SCREEN_ASPECTS.androidPortrait) < 0.08) confidence += 0.08;
  if (Math.abs(aspect - APP_SCREEN_ASPECTS.androidCompact) < 0.08) confidence += 0.08;
  confidence = clamp(confidence, 0, 0.97);

  // Prefer locking near Android portrait when detection is wide (window chrome).
  if (aspect > 0.7 && aspect < 1.2 && confidence < 0.6) {
    crop = lockCropToAspect(crop, APP_SCREEN_ASPECTS.androidPortrait);
  }

  return {
    crop,
    confidence,
    aspect: crop.width / Math.max(crop.height, 1e-6),
    reason: alreadyPortraitApp
      ? 'Recording looks like a full-bleed app screen — crop covers the display.'
      : portrait
        ? 'Detected a portrait app display inside the recording.'
        : 'Detected content region — adjust if the emulator chrome is still visible.',
  };
}

/** Grab one frame from a video blob/URL and run detection. */
export async function detectAppScreenFromVideo(
  src: string | Blob,
  atSeconds = 0.4,
): Promise<DetectedAppScreen | null> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  const revoke = typeof src !== 'string';
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Could not decode video for crop detection.'));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 1;
    const t = clamp(atSeconds, 0, Math.max(0, duration - 0.05));
    video.currentTime = t;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      // Some WebM files fire loadeddata already at the target frame.
      if (Math.abs(video.currentTime - t) < 0.05) resolve();
    });

    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (vw < 8 || vh < 8) return null;

    const maxW = 320;
    const scale = Math.min(1, maxW / vw);
    const cw = Math.max(32, Math.round(vw * scale));
    const ch = Math.max(32, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, cw, ch);
    return detectAppScreenFromImageData(ctx.getImageData(0, 0, cw, ch));
  } finally {
    if (revoke) URL.revokeObjectURL(url);
  }
}

export const SHADOW_PRESETS: { id: string; label: string; patch: Partial<VideoLayer['shadow']> }[] = [
  { id: 'none', label: 'None', patch: { enabled: false, opacity: 0 } },
  { id: 'soft', label: 'Soft', patch: { enabled: true, blur: 48, y: 16, opacity: 0.32, spread: 0 } },
  { id: 'medium', label: 'Medium', patch: { enabled: true, blur: 80, y: 28, opacity: 0.45, spread: 0 } },
  { id: 'floating', label: 'Floating', patch: { enabled: true, blur: 110, y: 42, opacity: 0.55, spread: 4 } },
  { id: 'cinematic', label: 'Cinematic', patch: { enabled: true, blur: 140, y: 56, opacity: 0.62, spread: 8 } },
];

export function applyAppScreenShape(layer: VideoLayer, shape: AppScreenSpec['shape'], preset: AppScreenCornerPreset): Partial<VideoLayer> {
  const app = defaultAppScreen({ ...layer.appScreen, shape, cornerPreset: preset, enabled: true });
  return {
    appScreen: app,
    cornerRadius: radiusForShape(shape, preset, layer.cornerRadius),
  };
}
