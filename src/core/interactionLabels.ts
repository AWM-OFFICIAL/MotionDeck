/**
 * Label detected tap interactions from the recording — never invents UI names.
 *
 * Prefer Chromium Text Detection API on a patch around each tap. If unavailable
 * or empty, fall back to a descriptive crop-relative position (e.g. "Upper centre"),
 * not fabricated button titles.
 */

import { cropAtTime } from '../core/cropTrack';
import type { DetectedInteraction } from '../library/autoTap';
import type { Rect, VideoLayer } from '../core/types';

type TextDetectorCtor = new () => {
  detect: (image: ImageBitmapSource) => Promise<Array<{ rawValue: string; boundingBox: DOMRectReadOnly }>>;
};

function getTextDetector(): InstanceType<TextDetectorCtor> | null {
  const Ctor = (globalThis as unknown as { TextDetector?: TextDetectorCtor }).TextDetector;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function cleanLabel(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 32) return '';
  // Reject pure noise / single symbols
  if (!/[A-Za-z0-9]/.test(t)) return '';
  return t;
}

function positionLabel(x: number, y: number, crop: Rect): string {
  const rx = (x - crop.x) / Math.max(crop.width, 1e-6);
  const ry = (y - crop.y) / Math.max(crop.height, 1e-6);
  const v = ry < 0.33 ? 'Upper' : ry > 0.66 ? 'Lower' : 'Mid';
  const h = rx < 0.33 ? 'left' : rx > 0.66 ? 'right' : 'centre';
  return `${v} ${h}`;
}

async function seekFrame(
  video: HTMLVideoElement,
  time: number,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.max(0, Math.min(time, (video.duration || time) - 0.05));
  });
}

/**
 * Enrich interaction labels using on-screen text near each tap when the browser
 * can read it. Mutates and returns the same array.
 */
export async function labelDetectedInteractions(
  interactions: DetectedInteraction[],
  opts: {
    videoUrl: string;
    layer: VideoLayer;
    signal?: AbortSignal;
  },
): Promise<DetectedInteraction[]> {
  if (interactions.length === 0) return interactions;

  const detector = getTextDetector();
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.src = opts.videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('decode'));
  });

  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const canvas = document.createElement('canvas');
  const patch = 160;
  canvas.width = patch;
  canvas.height = patch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return interactions.map((ix, i) => ({
      ...ix,
      label: positionLabel(ix.x, ix.y, cropAtTime(opts.layer, ix.time)) || `Tap ${i + 1}`,
    }));
  }

  for (let i = 0; i < interactions.length; i++) {
    if (opts.signal?.aborted) break;
    const ix = interactions[i];
    const crop = cropAtTime(opts.layer, ix.time);
    let label = positionLabel(ix.x, ix.y, crop);

    try {
      await seekFrame(video, opts.layer.trimStart + ix.time);
      const cx = ix.x * vw;
      const cy = ix.y * vh;
      const sx = Math.max(0, Math.min(vw - patch, cx - patch / 2));
      const sy = Math.max(0, Math.min(vh - patch, cy - patch / 2));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, patch, patch);
      ctx.drawImage(video, sx, sy, patch, patch, 0, 0, patch, patch);

      if (detector) {
        const hits = await detector.detect(canvas);
        // Prefer the box closest to the tap centre
        let best: { score: number; text: string } | null = null;
        for (const hit of hits) {
          const text = cleanLabel(hit.rawValue);
          if (!text) continue;
          const bx = hit.boundingBox.x + hit.boundingBox.width / 2;
          const by = hit.boundingBox.y + hit.boundingBox.height / 2;
          const dist = Math.hypot(bx - patch / 2, by - patch / 2);
          const score = 1 / (1 + dist);
          if (!best || score > best.score) best = { score, text };
        }
        if (best && best.score > 0.01) label = best.text;
      }
    } catch {
      /* keep position label */
    }

    interactions[i] = { ...ix, label };
  }

  video.removeAttribute('src');
  video.load();
  return interactions;
}

export function hasTextDetectionSupport(): boolean {
  return typeof (globalThis as unknown as { TextDetector?: unknown }).TextDetector === 'function';
}
