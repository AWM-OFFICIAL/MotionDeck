/**
 * Crop tracking — samples the recording and follows the app-screen region over time.
 *
 * Practical approach (not ML): template-match a downscaled patch of the initial crop
 * inside a search window around the previous position. Manual keyframes always win.
 */

import { uid } from './ids';
import { clamp, lerp } from './easing';
import type { CropTrack, CropTrackKeyframe, Rect, VideoLayer } from './types';
import { detectAppScreenFromImageData, normalizeCrop } from './appScreen';

export function emptyCropTrack(initial: Rect): CropTrack {
  return {
    mode: 'static',
    initialRect: normalizeCrop(initial),
    keyframes: [],
    status: 'idle',
    avgConfidence: 1,
  };
}

/** Interpolate crop rect at layer-local time from track keyframes + static crop. */
export function cropAtTime(layer: VideoLayer, localTime: number): Rect {
  if (layer.appScreen?.animateFullRecording) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const track = layer.appScreen?.cropTrack;
  if (!track || track.mode === 'static' || track.keyframes.length === 0) {
    return layer.crop;
  }

  const kfs = [...track.keyframes].sort((a, b) => a.time - b.time);
  if (localTime <= kfs[0].time) return normalizeCrop(kfs[0].rect);
  const last = kfs[kfs.length - 1];
  if (localTime >= last.time) return normalizeCrop(last.rect);

  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].time < localTime) i++;
  const a = kfs[i];
  const b = kfs[i + 1];
  const t = (localTime - a.time) / Math.max(b.time - a.time, 1e-6);
  const ease = t * t * (3 - 2 * t); // smoothstep
  return normalizeCrop({
    x: lerp(a.rect.x, b.rect.x, ease),
    y: lerp(a.rect.y, b.rect.y, ease),
    width: lerp(a.rect.width, b.rect.width, ease),
    height: lerp(a.rect.height, b.rect.height, ease),
  });
}

function patchScore(
  frame: ImageData,
  template: Float32Array,
  tw: number,
  th: number,
  left: number,
  top: number,
): number {
  const { width: w, data } = frame;
  let err = 0;
  let n = 0;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = left + x;
      const sy = top + y;
      if (sx < 0 || sy < 0 || sx >= w || sy >= frame.height) {
        err += 80;
        n++;
        continue;
      }
      const o = (sy * w + sx) * 4;
      const lum = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
      const d = lum - template[y * tw + x];
      err += d * d;
      n++;
    }
  }
  return n ? err / n : 1e9;
}

function extractTemplate(frame: ImageData, rect: Rect): { data: Float32Array; tw: number; th: number } {
  const x0 = Math.round(rect.x * frame.width);
  const y0 = Math.round(rect.y * frame.height);
  const tw = Math.max(8, Math.round(rect.width * frame.width));
  const th = Math.max(8, Math.round(rect.height * frame.height));
  const data = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = clamp(x0 + x, 0, frame.width - 1);
      const sy = clamp(y0 + y, 0, frame.height - 1);
      const o = (sy * frame.width + sx) * 4;
      data[y * tw + x] = 0.2126 * frame.data[o] + 0.7152 * frame.data[o + 1] + 0.0722 * frame.data[o + 2];
    }
  }
  return { data, tw, th };
}

/** Search near the previous rect for the best template match. */
export function trackRectInFrame(
  frame: ImageData,
  template: Float32Array,
  tw: number,
  th: number,
  prev: Rect,
): { rect: Rect; confidence: number } {
  const w = frame.width;
  const h = frame.height;
  const prevX = Math.round(prev.x * w);
  const prevY = Math.round(prev.y * h);
  const search = Math.max(8, Math.round(Math.min(w, h) * 0.08));
  const step = Math.max(1, Math.floor(search / 10));

  let best = Infinity;
  let bestX = prevX;
  let bestY = prevY;

  for (let dy = -search; dy <= search; dy += step) {
    for (let dx = -search; dx <= search; dx += step) {
      const x = prevX + dx;
      const y = prevY + dy;
      if (x < 0 || y < 0 || x + tw > w || y + th > h) continue;
      const score = patchScore(frame, template, tw, th, x, y);
      if (score < best) {
        best = score;
        bestX = x;
        bestY = y;
      }
    }
  }

  // Refine around best with step 1
  for (let dy = -step; dy <= step; dy++) {
    for (let dx = -step; dx <= step; dx++) {
      const x = bestX + dx;
      const y = bestY + dy;
      if (x < 0 || y < 0 || x + tw > w || y + th > h) continue;
      const score = patchScore(frame, template, tw, th, x, y);
      if (score < best) {
        best = score;
        bestX = x;
        bestY = y;
      }
    }
  }

  // Confidence: lower SSD → higher confidence (heuristic on 0–255 luminance).
  const confidence = clamp(1 - best / (55 * 55), 0.05, 0.98);
  return {
    rect: normalizeCrop({
      x: bestX / w,
      y: bestY / h,
      width: tw / w,
      height: th / h,
    }),
    confidence,
  };
}

export interface TrackProgress {
  progress: number;
  message: string;
}

/**
 * Analyse a video URL and produce crop track keyframes.
 * Preserves any existing manual keyframes by merging after analysis.
 */
export async function analyseCropTrack(
  src: string,
  initialRect: Rect,
  durationSeconds: number,
  opts: {
    sampleInterval?: number;
    onProgress?: (p: TrackProgress) => void;
    signal?: AbortSignal;
    existingManual?: CropTrackKeyframe[];
    sourceMediaId?: string;
  } = {},
): Promise<CropTrack> {
  const sampleInterval = opts.sampleInterval ?? 0.5;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('decode'));
  });

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : durationSeconds;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw < 16 || vh < 16) {
    return {
      mode: 'tracked',
      initialRect,
      keyframes: [],
      status: 'failed',
      avgConfidence: 0,
      message: "Tracking couldn't reliably follow this area. You can adjust the crop manually.",
    };
  }

  const maxW = 240;
  const scale = Math.min(1, maxW / vw);
  const cw = Math.max(32, Math.round(vw * scale));
  const ch = Math.max(32, Math.round(vh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      mode: 'tracked',
      initialRect,
      keyframes: [],
      status: 'failed',
      avgConfidence: 0,
      message: "Tracking couldn't reliably follow this area. You can adjust the crop manually.",
    };
  }

  const seek = (t: number) =>
    new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = clamp(t, 0, Math.max(0, duration - 0.05));
    });

  await seek(0.05);
  ctx.drawImage(video, 0, 0, cw, ch);
  let frame = ctx.getImageData(0, 0, cw, ch);

  // Prefer the user crop; if it's full-frame, try detection first.
  let rect = normalizeCrop(initialRect);
  if (rect.width > 0.95 && rect.height > 0.95) {
    const detected = detectAppScreenFromImageData(frame);
    if (detected) rect = detected.crop;
  }

  const template = extractTemplate(frame, rect);
  const times: number[] = [];
  for (let t = 0; t <= duration; t += sampleInterval) times.push(Number(t.toFixed(3)));
  if (times[times.length - 1] < duration - 0.05) times.push(Number(duration.toFixed(3)));

  const keyframes: CropTrackKeyframe[] = [];
  let prev = rect;
  let confSum = 0;
  let lowCount = 0;

  for (let i = 0; i < times.length; i++) {
    if (opts.signal?.aborted) {
      return {
        mode: 'tracked',
        initialRect: rect,
        keyframes,
        status: 'failed',
        avgConfidence: keyframes.length ? confSum / keyframes.length : 0,
        message: 'Tracking cancelled.',
      };
    }
    const t = times[i];
    opts.onProgress?.({
      progress: i / Math.max(times.length - 1, 1),
      message: 'Tracking App Screen…',
    });
    await seek(t);
    ctx.drawImage(video, 0, 0, cw, ch);
    frame = ctx.getImageData(0, 0, cw, ch);
    const hit = trackRectInFrame(frame, template.data, template.tw, template.th, prev);
    prev = hit.rect;
    confSum += hit.confidence;
    if (hit.confidence < 0.35) lowCount++;
    keyframes.push({
      id: uid('ct'),
      time: t,
      rect: hit.rect,
      confidence: hit.confidence,
    });
  }

  const avg = keyframes.length ? confSum / keyframes.length : 0;
  const failed = avg < 0.28 || lowCount / Math.max(keyframes.length, 1) > 0.55;

  // Merge manual corrections (keep manual times, replace nearby auto).
  const manuals = opts.existingManual ?? [];
  const merged = keyframes.filter(
    (kf) => !manuals.some((m) => Math.abs(m.time - kf.time) < sampleInterval * 0.6),
  );
  for (const m of manuals) merged.push(m);
  merged.sort((a, b) => a.time - b.time);

  return {
    mode: 'tracked',
    sourceMediaId: opts.sourceMediaId,
    initialRect: rect,
    keyframes: merged,
    status: failed ? 'failed' : 'ready',
    avgConfidence: avg,
    message: failed
      ? "Tracking couldn't reliably follow this area. You can adjust the crop manually."
      : `Tracking complete · ${Math.round(avg * 100)}% confidence`,
  };
}

export function upsertManualCropKeyframe(
  track: CropTrack,
  time: number,
  rect: Rect,
): CropTrack {
  const keyframes = track.keyframes.filter((k) => !(k.manual && Math.abs(k.time - time) < 0.08));
  keyframes.push({
    id: uid('ct'),
    time,
    rect: normalizeCrop(rect),
    confidence: 1,
    manual: true,
  });
  keyframes.sort((a, b) => a.time - b.time);
  return {
    ...track,
    mode: 'tracked',
    status: 'ready',
    keyframes,
    message: 'Manual correction added.',
  };
}
