/**
 * Lightweight peak envelopes for audio / video-with-audio clips.
 * Cached by storage key so scrubbing the timeline never re-decodes.
 */

import { readMedia } from '../platform/mediaVault';

const cache = new Map<string, Float32Array>();
const inflight = new Map<string, Promise<Float32Array>>();

const decodeCtx =
  typeof AudioContext !== 'undefined'
    ? new AudioContext({ sampleRate: 22050 })
    : null;

/**
 * Returns ~N peak samples in 0–1. Empty array if the asset has no audio or
 * decoding fails — callers should fall back to a flat tint.
 */
export async function getWaveformPeaks(
  storageKey: string,
  buckets = 128,
): Promise<Float32Array> {
  const cached = cache.get(storageKey);
  if (cached && cached.length === buckets) return cached;

  let pending = inflight.get(storageKey);
  if (!pending) {
    pending = decodePeaks(storageKey, buckets).finally(() => inflight.delete(storageKey));
    inflight.set(storageKey, pending);
  }
  return pending;
}

async function decodePeaks(storageKey: string, buckets: number): Promise<Float32Array> {
  const empty = new Float32Array(buckets);
  if (!decodeCtx) {
    cache.set(storageKey, empty);
    return empty;
  }

  try {
    const blob = await readMedia(storageKey);
    if (!blob) {
      cache.set(storageKey, empty);
      return empty;
    }
    const buffer = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const peaks = new Float32Array(buckets);
    const block = Math.max(1, Math.floor(channel.length / buckets));

    for (let i = 0; i < buckets; i++) {
      let peak = 0;
      const start = i * block;
      const end = Math.min(channel.length, start + block);
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > peak) peak = v;
      }
      peaks[i] = peak;
    }

    // Normalise so quiet voiceovers still read as a shape.
    let max = 0;
    for (let i = 0; i < peaks.length; i++) max = Math.max(max, peaks[i]);
    if (max > 0) {
      for (let i = 0; i < peaks.length; i++) peaks[i] /= max;
    }

    cache.set(storageKey, peaks);
    return peaks;
  } catch (err) {
    console.warn('[MotionDeck] waveform decode failed', storageKey, err);
    cache.set(storageKey, empty);
    return empty;
  }
}

export function clearWaveformCache(storageKey?: string): void {
  if (storageKey) {
    cache.delete(storageKey);
    inflight.delete(storageKey);
  } else {
    cache.clear();
    inflight.clear();
  }
}
