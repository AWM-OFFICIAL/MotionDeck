/**
 * Infer tap / click candidates from baked video by sampling frame differences.
 * Used when MotionDeck recording metadata is unavailable (imported MP4/MOV/etc.).
 *
 * Heuristic: localized luminance spikes inside the crop = likely UI press / ripple.
 * Full-frame cuts are ignored. Results are written as CursorEvent samples so the
 * existing Auto Tap / Focus / cursor pipelines work unchanged.
 */

import { clamp } from './easing';
import type { CursorEvent, Rect } from './types';

export interface DetectInteractionsOptions {
  duration: number;
  /** Normalized source crop (0–1). Defaults to full frame. */
  crop?: Rect;
  sampleInterval?: number;
  maxTaps?: number;
  onProgress?: (progress: number, message: string) => void;
  signal?: AbortSignal;
}

export interface DetectInteractionsResult {
  events: CursorEvent[];
  tapCount: number;
  sampledFrames: number;
  message: string;
}

const FULL: Rect = { x: 0, y: 0, width: 1, height: 1 };

/** Core detector — works on pre-sampled grayscale frames (unit-testable). */
export function detectTapsFromGrayFrames(
  frames: { t: number; gray: Float32Array; width: number; height: number }[],
  crop: Rect = FULL,
  opts: { maxTaps?: number; minGap?: number } = {},
): CursorEvent[] {
  const maxTaps = opts.maxTaps ?? 12;
  const minGap = opts.minGap ?? 0.45;
  if (frames.length < 2) return [];

  const scores: { t: number; score: number; x: number; y: number; local: number }[] = [];

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const cur = frames[i];
    if (prev.width !== cur.width || prev.height !== cur.height) continue;

    const hit = scoreFrameDiff(prev.gray, cur.gray, cur.width, cur.height, crop);
    if (hit) scores.push({ t: cur.t, ...hit });
  }

  // Keep local peaks above a relative threshold.
  const peakScores = scores.map((s) => s.score).sort((a, b) => a - b);
  const median = peakScores[Math.floor(peakScores.length * 0.5)] ?? 0;
  const p75 = peakScores[Math.floor(peakScores.length * 0.75)] ?? median;
  // With few samples, avoid over-thresholding (median*2 would drop the only peak).
  const threshold =
    scores.length < 5
      ? Math.max(0.015, median * 0.35)
      : Math.max(p75 * 0.5, median * 1.15, 0.012);

  const peaks = scores
    .filter((s) => s.score >= threshold && s.local >= 1.35)
    .sort((a, b) => b.score - a.score);

  const picked: typeof peaks = [];
  for (const p of peaks) {
    if (picked.length >= maxTaps) break;
    if (picked.some((q) => Math.abs(q.t - p.t) < minGap)) continue;
    // Prefer taps inside crop (already enforced) with local concentration.
    picked.push(p);
  }

  picked.sort((a, b) => a.t - b.t);

  const events: CursorEvent[] = [];
  for (const p of picked) {
    events.push({ t: p.t, x: p.x, y: p.y, down: true, button: 0 });
    events.push({ t: Number((p.t + 0.06).toFixed(3)), x: p.x, y: p.y });
  }
  return events;
}

function scoreFrameDiff(
  prev: Float32Array,
  cur: Float32Array,
  w: number,
  h: number,
  crop: Rect,
): { score: number; x: number; y: number; local: number } | null {
  const x0 = Math.floor(clamp(crop.x, 0, 1) * w);
  const y0 = Math.floor(clamp(crop.y, 0, 1) * h);
  const x1 = Math.ceil(clamp(crop.x + crop.width, 0, 1) * w);
  const y1 = Math.ceil(clamp(crop.y + crop.height, 0, 1) * h);

  let sum = 0;
  let max = 0;
  let maxX = x0;
  let maxY = y0;
  let count = 0;
  // Accumulate centroid of high-diff pixels for tap location.
  let cx = 0;
  let cy = 0;
  let cWeight = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const d = Math.abs(cur[i] - prev[i]);
      sum += d;
      count++;
      if (d > max) {
        max = d;
        maxX = x;
        maxY = y;
      }
      if (d > 0.08) {
        const wt = d * d;
        cx += x * wt;
        cy += y * wt;
        cWeight += wt;
      }
    }
  }

  if (count === 0) return null;
  const mean = sum / count;
  // Global cut: most of the crop changed — not a tap.
  if (mean > 0.14) return null;
  // Quiet frame.
  if (mean < 0.004 && max < 0.12) return null;

  const tapX = cWeight > 0 ? cx / cWeight : maxX;
  const tapY = cWeight > 0 ? cy / cWeight : maxY;
  const local = max / Math.max(mean, 1e-4);

  // Score favors sharp local spikes over soft global drift.
  const score = mean * 0.35 + max * 0.65;
  return {
    score,
    local,
    x: clamp((tapX + 0.5) / w, 0, 1),
    y: clamp((tapY + 0.5) / h, 0, 1),
  };
}

/** Convert ImageData RGB to grayscale luminance 0–1. */
export function imageDataToGray(data: ImageData): Float32Array {
  const { width, height } = data;
  const out = new Float32Array(width * height);
  const px = data.data;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    out[j] = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
  }
  return out;
}

/**
 * Sample a video URL and return inferred cursor click events.
 * Runs entirely in the browser (same pattern as cropTrack analysis).
 */
export async function detectInteractionsFromVideo(
  src: string,
  opts: DetectInteractionsOptions,
): Promise<DetectInteractionsResult> {
  const sampleInterval = opts.sampleInterval ?? 0.18;
  const crop = opts.crop ?? FULL;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Could not decode video for tap detection.'));
      setTimeout(() => reject(new Error('Timed out loading video for tap detection.')), 20000);
    });

    const duration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : opts.duration;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw < 16 || vh < 16) {
      return {
        events: [],
        tapCount: 0,
        sampledFrames: 0,
        message: 'Video frames are too small to analyse.',
      };
    }

    const maxW = 160;
    const scale = Math.min(1, maxW / vw);
    const cw = Math.max(32, Math.round(vw * scale));
    const ch = Math.max(32, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        events: [],
        tapCount: 0,
        sampledFrames: 0,
        message: 'Canvas unavailable for tap detection.',
      };
    }

    const seek = (t: number) =>
      new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = clamp(t, 0, Math.max(0, duration - 0.04));
        setTimeout(resolve, 2500);
      });

    const times: number[] = [];
    for (let t = 0.05; t <= duration; t += sampleInterval) times.push(Number(t.toFixed(3)));
    if (times.length === 0) times.push(0.05);

    const frames: { t: number; gray: Float32Array; width: number; height: number }[] = [];
    for (let i = 0; i < times.length; i++) {
      if (opts.signal?.aborted) {
        return {
          events: [],
          tapCount: 0,
          sampledFrames: frames.length,
          message: 'Tap detection cancelled.',
        };
      }
      opts.onProgress?.(i / Math.max(times.length - 1, 1), 'Detecting taps…');
      await seek(times[i]);
      ctx.drawImage(video, 0, 0, cw, ch);
      const image = ctx.getImageData(0, 0, cw, ch);
      frames.push({
        t: times[i],
        gray: imageDataToGray(image),
        width: cw,
        height: ch,
      });
    }

    const events = detectTapsFromGrayFrames(frames, crop, { maxTaps: opts.maxTaps ?? 12 });
    const tapCount = events.filter((e) => e.down).length;
    return {
      events,
      tapCount,
      sampledFrames: frames.length,
      message:
        tapCount > 0
          ? `Detected ${tapCount} tap${tapCount === 1 ? '' : 's'} from the video.`
          : 'No clear taps found. Use Mark path or Add Interaction.',
    };
  } finally {
    video.src = '';
  }
}
