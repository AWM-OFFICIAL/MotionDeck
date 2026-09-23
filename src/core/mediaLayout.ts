/**
 * Shared media geometry — layout and draw must use the same source size, otherwise
 * a portrait recording is stretched into a 16:9 box (or the reverse).
 */

import type { Size } from './types';
import { CANVAS_PRESETS } from './defaults';

/** 0 is a real number, so `value ?? fallback` is wrong for video metadata. */
export function usableDimension(...candidates: Array<number | undefined>): number {
  for (const n of candidates) {
    if (typeof n === 'number' && Number.isFinite(n) && n >= 2) return n;
  }
  return 0;
}

export function mediaSize(
  ...sources: Array<{ width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined>
): Size {
  let width = 0;
  let height = 0;
  for (const src of sources) {
    if (!src) continue;
    width = usableDimension(width, src.videoWidth, src.width);
    height = usableDimension(height, src.videoHeight, src.height);
    if (width >= 2 && height >= 2) break;
  }
  return {
    width: width || 1920,
    height: height || 1080,
  };
}

/** Letterbox `src` inside `dest` without stretching. */
export function containRect(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): { x: number; y: number; w: number; h: number } {
  const srcAspect = srcW / Math.max(srcH, 1);
  const destAspect = destW / Math.max(destH, 1);
  if (srcAspect > destAspect) {
    const w = destW;
    const h = w / srcAspect;
    return { x: 0, y: (destH - h) / 2, w, h };
  }
  const h = destH;
  const w = h * srcAspect;
  return { x: (destW - w) / 2, y: 0, w, h };
}

/** Pick a project canvas that matches the footage, so a phone recording does not
 * sit as a thin strip on a 16:9 stage. */
export function suggestedCanvas(width: number, height: number): Size {
  const aspect = width / Math.max(height, 1);
  if (aspect < 0.8) {
    return CANVAS_PRESETS.find((p) => p.id === 'portrait1080')!.size;
  }
  if (aspect > 0.9 && aspect < 1.15) {
    return CANVAS_PRESETS.find((p) => p.id === 'square1080')!.size;
  }
  return CANVAS_PRESETS.find((p) => p.id === 'landscape1080')!.size;
}

export function aspectsClash(a: Size, b: Size): boolean {
  const aa = a.width / Math.max(a.height, 1);
  const bb = b.width / Math.max(b.height, 1);
  const portraitVsLandscape = (aa < 0.85 && bb > 1.2) || (bb < 0.85 && aa > 1.2);
  return portraitVsLandscape;
}
