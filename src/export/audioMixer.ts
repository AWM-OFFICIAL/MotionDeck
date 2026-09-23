/**
 * Offline audio mixdown.
 *
 * Renders every audio-bearing layer (audio clips plus the audio inside screen
 * recordings) into a single buffer at the export sample rate, honouring trims,
 * volume, mute and fades. Runs in an `OfflineAudioContext`, so it is faster than
 * real time and never plays out of the speakers during export.
 */

import type { Project, Scene } from '../core/types';
import { readMedia } from '../platform/mediaVault';

export const EXPORT_SAMPLE_RATE = 48000;

interface AudioSourceSpec {
  storageKey: string;
  /** Seconds on the composition timeline. */
  timelineStart: number;
  sourceStart: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  playbackRate: number;
}

function collectSources(project: Project, scenes: Scene[]): AudioSourceSpec[] {
  const specs: AudioSourceSpec[] = [];
  let offset = 0;

  for (const scene of scenes) {
    for (const layer of scene.layers) {
      if (layer.type === 'audio') {
        if (layer.muted || layer.hidden || layer.volume <= 0) continue;
        const asset = project.assets.find((a) => a.id === layer.assetId);
        if (!asset) continue;
        specs.push({
          storageKey: asset.storageKey,
          timelineStart: offset + layer.start,
          sourceStart: layer.trimStart,
          duration: layer.duration,
          volume: layer.volume,
          fadeIn: layer.fadeIn,
          fadeOut: layer.fadeOut,
          playbackRate: 1,
        });
      } else if (layer.type === 'video') {
        if (layer.muted || layer.hidden || layer.volume <= 0) continue;
        const asset = project.assets.find((a) => a.id === layer.assetId);
        // Only recordings that actually captured audio contribute a track.
        if (!asset) continue;
        const rec = asset.recording;
        if (rec && !rec.hasSystemAudio && !rec.hasMicrophone) continue;
        specs.push({
          storageKey: asset.storageKey,
          timelineStart: offset + layer.start,
          sourceStart: layer.trimStart,
          duration: layer.duration,
          volume: layer.volume,
          fadeIn: 0,
          fadeOut: 0,
          playbackRate: layer.playbackRate,
        });
      }
    }
    // Keep offsets identical to the video exporter when clips extend the
    // scene's nominal duration.
    offset += Math.max(
      scene.duration,
      ...scene.layers.map((layer) => layer.start + layer.duration),
      0.1,
    );
  }

  return specs;
}

const decodeCache = new Map<string, AudioBuffer | null>();

async function decode(ctx: BaseAudioContext, storageKey: string): Promise<AudioBuffer | null> {
  if (decodeCache.has(storageKey)) return decodeCache.get(storageKey)!;
  try {
    const blob = await readMedia(storageKey);
    if (!blob) return null;
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    decodeCache.set(storageKey, buffer);
    return buffer;
  } catch {
    // Video files with no audio track throw here; that is expected, not an error.
    decodeCache.set(storageKey, null);
    return null;
  }
}

export const clearAudioCache = () => decodeCache.clear();

/** Returns null when the composition has no audible content. */
export async function renderAudioMix(
  project: Project,
  scenes: Scene[],
  totalDuration: number,
): Promise<AudioBuffer | null> {
  const specs = collectSources(project, scenes);
  if (specs.length === 0 || totalDuration <= 0) return null;

  const probeCtx = new AudioContext({ sampleRate: EXPORT_SAMPLE_RATE });
  const buffers = await Promise.all(specs.map((s) => decode(probeCtx, s.storageKey)));
  await probeCtx.close();

  const usable = specs.filter((_, i) => buffers[i] !== null);
  if (usable.length === 0) return null;

  const offline = new OfflineAudioContext(
    2,
    Math.ceil(totalDuration * EXPORT_SAMPLE_RATE),
    EXPORT_SAMPLE_RATE,
  );

  specs.forEach((spec, i) => {
    const buffer = buffers[i];
    if (!buffer) return;

    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = spec.playbackRate;

    const gain = offline.createGain();
    const start = Math.max(0, spec.timelineStart);
    const end = Math.min(totalDuration, start + spec.duration);
    if (end <= start) return;

    gain.gain.setValueAtTime(spec.fadeIn > 0 ? 0 : spec.volume, start);
    if (spec.fadeIn > 0) {
      gain.gain.linearRampToValueAtTime(spec.volume, Math.min(end, start + spec.fadeIn));
    }
    if (spec.fadeOut > 0) {
      gain.gain.setValueAtTime(spec.volume, Math.max(start, end - spec.fadeOut));
      gain.gain.linearRampToValueAtTime(0, end);
    }

    source.connect(gain).connect(offline.destination);
    source.start(start, Math.max(0, spec.sourceStart), end - start);
  });

  return offline.startRendering();
}

/** Interleaves an AudioBuffer into the planar-f32 layout WebCodecs expects. */
export function bufferToF32Planar(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const out = new Float32Array(frames * channels);
  for (let c = 0; c < channels; c++) {
    out.set(buffer.getChannelData(c), c * frames);
  }
  return out;
}
