/**
 * Render/export pipeline.
 *
 * Frames are composited with exactly the same `renderScene` the preview uses, then
 * handed to a WebCodecs encoder and muxed. The loop yields to the event loop between
 * frames, so the UI stays responsive and the job stays cancellable.
 */

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';

import type { ExportSettings, Project } from '../core/types';
import { renderScene } from '../render/compositor';
import type { MediaPool } from '../render/mediaPool';
import { EXPORT_SAMPLE_RATE, renderAudioMix } from './audioMixer';
import { GifEncoder } from './gifEncoder';

export interface ExportProgress {
  phase: 'preparing' | 'audio' | 'rendering' | 'encoding' | 'finalising' | 'done';
  /** 0–1. */
  progress: number;
  frame: number;
  totalFrames: number;
  /** Seconds, estimated from throughput so far. */
  etaSeconds: number | null;
  message: string;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  durationSeconds: number;
  frames: number;
}

export class ExportError extends Error {
  constructor(
    message: string,
    readonly hint: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export interface ExportJobOptions {
  project: Project;
  settings: ExportSettings;
  pool: MediaPool;
  /** Export only this scene index; omit for the whole project. */
  sceneIndex?: number;
  /** Scene-local time used for still-image exports. */
  playhead?: number;
  reducedMotion?: boolean;
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
}

const QUALITY_BITRATE: Record<ExportSettings['quality'], number> = {
  draft: 0.55,
  good: 1,
  high: 1.6,
};

/** Rough size estimate shown before the user commits to a render. */
export function estimateFileSize(settings: ExportSettings, durationSeconds: number): number {
  if (settings.format === 'png' || settings.format === 'jpg') {
    return settings.width * settings.height * (settings.format === 'png' ? 3.2 : 0.55);
  }
  if (settings.format === 'gif') {
    // GIF is roughly linear in pixels × frames at ~0.42 bytes/pixel after LZW.
    const frames = Math.min(settings.fps, 20) * durationSeconds;
    return settings.width * settings.height * frames * 0.08;
  }
  const mbps = settings.bitrateMbps * QUALITY_BITRATE[settings.quality];
  return (mbps * 1_000_000 * durationSeconds) / 8;
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function renderExportFrame(
  ctx: CanvasRenderingContext2D,
  project: Project,
  scene: Project['scenes'][number],
  time: number,
  pool: MediaPool,
  width: number,
  height: number,
  reducedMotion?: boolean,
) {
  const scale = Math.min(width / project.canvas.width, height / project.canvas.height);
  const offsetX = (width - project.canvas.width * scale) / 2;
  const offsetY = (height - project.canvas.height * scale) / 2;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  renderScene(ctx, project, scene, time, pool, { reducedMotion });
  ctx.restore();
}

/** Longer exports yield more often so the UI stays responsive on 10–30 minute jobs. */
function yieldBudget(totalFrames: number): number {
  if (totalFrames > 18_000) return 1; // ~10+ min @ 30fps
  if (totalFrames > 9_000) return 2;
  if (totalFrames > 3_600) return 3;
  return 4;
}

/** Picks a codec string the platform can actually encode at this resolution. */
async function pickH264Codec(width: number, height: number, fps: number, bitrate: number) {
  const candidates = ['avc1.640033', 'avc1.640028', 'avc1.4d0034', 'avc1.42E01E'];
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        framerate: fps,
        bitrate,
      });
      if (support.supported) return codec;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

export async function runExport(options: ExportJobOptions): Promise<ExportResult> {
  const { project, settings, pool, onProgress, signal } = options;

  const scenes =
    options.sceneIndex !== undefined ? [project.scenes[options.sceneIndex]] : project.scenes;
  if (scenes.length === 0 || !scenes[0]) {
    throw new ExportError('There is nothing to export.', 'Add a scene or a recording first.');
  }

  const totalDuration = scenes.reduce(
    (sum, s) => sum + Math.max(s.duration, ...s.layers.map((l) => l.start + l.duration), 0.1),
    0,
  );

  // Even-sized dimensions are required by H.264.
  const width = Math.round(settings.width / 2) * 2;
  const height = Math.round(settings.height / 2) * 2;
  const fps = settings.format === 'gif' ? Math.min(settings.fps, 20) : settings.fps;

  const report = (p: Partial<ExportProgress> & Pick<ExportProgress, 'phase' | 'message'>) =>
    onProgress?.({
      progress: 0,
      frame: 0,
      totalFrames: 0,
      etaSeconds: null,
      ...p,
    });

  report({ phase: 'preparing', message: 'Preparing the composition…' });

  if (settings.format === 'png' || settings.format === 'jpg') {
    return exportStill(project, scenes[0], settings, pool, width, height, options);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) throw new ExportError('Could not create a rendering surface.', 'Try restarting MotionDeck.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const totalFrames = Math.max(1, Math.round(totalDuration * fps));

  if (settings.format === 'gif') {
    return exportGif(ctx, canvas, project, scenes, { width, height, fps, totalFrames, totalDuration }, options);
  }

  /* ------------------------------------------------------- video encode */

  if (typeof VideoEncoder !== 'function') {
    throw new ExportError(
      'Video encoding is not available in this environment.',
      'Use the MotionDeck desktop app, or export a GIF instead.',
    );
  }

  const bitrate = Math.round(settings.bitrateMbps * QUALITY_BITRATE[settings.quality] * 1_000_000);
  const isMp4 = settings.format === 'mp4';
  const codec = isMp4 ? await pickH264Codec(width, height, fps, bitrate) : 'vp09.00.10.08';

  if (isMp4 && !codec) {
    throw new ExportError(
      'This system cannot encode H.264 at that resolution.',
      'Try 1080p instead of 4K, or export WebM.',
    );
  }

  report({ phase: 'audio', message: 'Mixing audio…' });
  let audioBuffer: AudioBuffer | null = null;
  try {
    audioBuffer = await renderAudioMix(project, scenes, totalDuration);
  } catch (err) {
    console.warn('[MotionDeck] audio mixdown failed, exporting silent video', err);
  }
  if (signal?.aborted) throw new ExportError('Export cancelled.', 'Start the export again when you are ready.');

  const hasAudio = audioBuffer !== null && typeof AudioEncoder === 'function';

  const target = isMp4 ? new Mp4Target() : new WebmTarget();
  const muxer = isMp4
    ? new Mp4Muxer({
        target: target as Mp4Target,
        video: { codec: 'avc', width, height, frameRate: fps },
        ...(hasAudio
          ? { audio: { codec: 'aac' as const, numberOfChannels: 2, sampleRate: EXPORT_SAMPLE_RATE } }
          : {}),
        fastStart: 'in-memory',
      })
    : new WebmMuxer({
        target: target as WebmTarget,
        video: { codec: 'V_VP9', width, height, frameRate: fps },
        ...(hasAudio
          ? { audio: { codec: 'A_OPUS' as const, numberOfChannels: 2, sampleRate: EXPORT_SAMPLE_RATE } }
          : {}),
      });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      // Muxer typings differ slightly between the mp4 and webm packages.
      (muxer as { addVideoChunk: (c: EncodedVideoChunk, m?: unknown) => void }).addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  encoder.configure({
    codec: codec!,
    width,
    height,
    bitrate,
    framerate: fps,
    ...(isMp4 ? { avc: { format: 'avc' as const } } : {}),
    latencyMode: 'quality',
  });

  const startedAt = performance.now();
  let frameIndex = 0;

  try {
    let sceneOffset = 0;
    for (const scene of scenes) {
      const sceneDuration = Math.max(
        scene.duration,
        ...scene.layers.map((l) => l.start + l.duration),
        0.1,
      );
      const sceneFrames = Math.round(sceneDuration * fps);

      for (let i = 0; i < sceneFrames; i++) {
        if (signal?.aborted) throw new ExportError('Export cancelled.', 'Start the export again when you are ready.');
        if (encoderError) throw encoderError;

        const sceneTime = i / fps;
        await seekSceneMedia(pool, scene, sceneTime);
        renderExportFrame(ctx as CanvasRenderingContext2D, project, scene, sceneTime, pool, width, height, options.reducedMotion);

        const timestamp = Math.round(((sceneOffset + sceneTime) * 1_000_000));
        const frame = new VideoFrame(canvas, {
          timestamp,
          duration: Math.round(1_000_000 / fps),
        });
        // A keyframe every two seconds keeps seeking responsive in players.
        encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
        frame.close();
        frameIndex++;

        // Back-pressure: let the encoder drain rather than queueing thousands of frames.
        while (encoder.encodeQueueSize > 8) await yieldToUi();

        const cadence = yieldBudget(totalFrames);
        if (frameIndex % cadence === 0 || frameIndex === totalFrames) {
          const elapsed = (performance.now() - startedAt) / 1000;
          const rate = frameIndex / Math.max(elapsed, 0.001);
          onProgress?.({
            phase: 'rendering',
            progress: frameIndex / totalFrames,
            frame: frameIndex,
            totalFrames,
            etaSeconds: rate > 0 ? (totalFrames - frameIndex) / rate : null,
            message: `Rendering frame ${frameIndex} of ${totalFrames}`,
          });
          await yieldToUi();
        }
      }
      sceneOffset += sceneDuration;
    }

    report({ phase: 'encoding', progress: 0.94, message: 'Finishing the video track…' });
    await encoder.flush();
    if (encoderError) throw encoderError;

    if (hasAudio && audioBuffer) {
      report({ phase: 'encoding', progress: 0.96, message: 'Encoding audio…' });
      await encodeAudio(audioBuffer, muxer, isMp4, signal);
    }

    report({ phase: 'finalising', progress: 0.99, message: 'Writing the file…' });
    muxer.finalize();

    const buffer = (target as Mp4Target | WebmTarget).buffer;
    const blob = new Blob([buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' });

    report({ phase: 'done', progress: 1, message: 'Export complete.' });

    return {
      blob,
      filename: `${safeName(project.name)}.${isMp4 ? 'mp4' : 'webm'}`,
      durationSeconds: totalDuration,
      frames: frameIndex,
    };
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

/* -------------------------------------------------------------- audio */

async function encodeAudio(
  buffer: AudioBuffer,
  muxer: Mp4Muxer<Mp4Target> | WebmMuxer<WebmTarget>,
  isMp4: boolean,
  signal?: AbortSignal,
): Promise<void> {
  const channels = Math.min(2, buffer.numberOfChannels);
  const codec = isMp4 ? 'mp4a.40.2' : 'opus';

  let error: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      (muxer as { addAudioChunk: (c: EncodedAudioChunk, m?: unknown) => void }).addAudioChunk(chunk, meta);
    },
    error: (err) => {
      error = err instanceof Error ? err : new Error(String(err));
    },
  });

  encoder.configure({
    codec,
    sampleRate: buffer.sampleRate,
    numberOfChannels: channels,
    bitrate: 192_000,
  });

  // 0.2s slices keep peak memory low on long exports.
  const chunkFrames = Math.floor(buffer.sampleRate * 0.2);
  for (let offset = 0; offset < buffer.length; offset += chunkFrames) {
    if (signal?.aborted) break;
    if (error) throw error;

    const frames = Math.min(chunkFrames, buffer.length - offset);
    const planar = new Float32Array(frames * channels);
    for (let c = 0; c < channels; c++) {
      planar.set(buffer.getChannelData(c).subarray(offset, offset + frames), c * frames);
    }

    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: buffer.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / buffer.sampleRate) * 1_000_000),
      data: planar,
    });
    encoder.encode(data);
    data.close();

    while (encoder.encodeQueueSize > 12) await yieldToUi();
  }

  await encoder.flush();
  encoder.close();
  if (error) throw error;
}

/* ---------------------------------------------------------------- gif */

async function exportGif(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  project: Project,
  scenes: Project['scenes'],
  dims: { width: number; height: number; fps: number; totalFrames: number; totalDuration: number },
  options: ExportJobOptions,
): Promise<ExportResult> {
  const { width, height, fps, totalFrames, totalDuration } = dims;
  const encoder = new GifEncoder(width, height, 128);
  const delay = 1000 / fps;
  const startedAt = performance.now();
  let frameIndex = 0;

  for (const scene of scenes) {
    const sceneDuration = Math.max(scene.duration, ...scene.layers.map((l) => l.start + l.duration), 0.1);
    const sceneFrames = Math.round(sceneDuration * fps);

    for (let i = 0; i < sceneFrames; i++) {
      if (options.signal?.aborted) throw new ExportError('Export cancelled.', 'Start the export again when you are ready.');
      const sceneTime = i / fps;
      await seekSceneMedia(options.pool, scene, sceneTime);
      renderExportFrame(ctx, project, scene, sceneTime, options.pool, width, height, options.reducedMotion);
      encoder.addFrame(ctx.getImageData(0, 0, width, height), delay);
      frameIndex++;

      const elapsed = (performance.now() - startedAt) / 1000;
      const rate = frameIndex / Math.max(elapsed, 0.001);
      options.onProgress?.({
        phase: 'rendering',
        progress: frameIndex / totalFrames,
        frame: frameIndex,
        totalFrames,
        etaSeconds: rate > 0 ? (totalFrames - frameIndex) / rate : null,
        message: `Building GIF frame ${frameIndex} of ${totalFrames}`,
      });
      await yieldToUi();
    }
  }

  options.onProgress?.({
    phase: 'finalising',
    progress: 0.99,
    frame: frameIndex,
    totalFrames,
    etaSeconds: 0,
    message: 'Writing the GIF…',
  });

  const blob = encoder.finish();
  canvas.width = 0;
  return {
    blob,
    filename: `${safeName(project.name)}.gif`,
    durationSeconds: totalDuration,
    frames: frameIndex,
  };
}

/* -------------------------------------------------------------- still */

async function exportStill(
  project: Project,
  scene: Project['scenes'][number],
  settings: ExportSettings,
  pool: MediaPool,
  width: number,
  height: number,
  options: ExportJobOptions,
): Promise<ExportResult> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ExportError('Could not create a rendering surface.', 'Try restarting MotionDeck.');

  // Stills are captured at the current playhead so "what you see" is what you get.
  const time = Math.max(0, options.playhead ?? 0);
  await seekSceneMedia(pool, scene, time);
  renderExportFrame(ctx, project, scene, time, pool, width, height, options.reducedMotion);

  const mime = settings.format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.94));
  if (!blob) throw new ExportError('Could not create the image.', 'Try a smaller resolution.');

  options.onProgress?.({
    phase: 'done',
    progress: 1,
    frame: 1,
    totalFrames: 1,
    etaSeconds: 0,
    message: 'Export complete.',
  });

  return {
    blob,
    filename: `${safeName(project.name)}.${settings.format}`,
    durationSeconds: 0,
    frames: 1,
  };
}

/* -------------------------------------------------------------- shared */

/** Seeks every video layer in the scene to the exact frame before compositing. */
async function seekSceneMedia(
  pool: MediaPool,
  scene: Project['scenes'][number],
  sceneTime: number,
): Promise<void> {
  const seeks: Promise<void>[] = [];
  for (const layer of scene.layers) {
    if (layer.type !== 'video' || layer.hidden) continue;
    const local = sceneTime - layer.start;
    if (local < 0 || local >= layer.duration) continue;
    seeks.push(pool.seekExact(layer.assetId, layer.trimStart + local * layer.playbackRate));
  }
  await Promise.all(seeks);
}

export const safeName = (name: string): string =>
  name.replace(/[^\w\-. ]+/g, '').trim().replace(/\s+/g, '-') || 'motiondeck-export';

/** Saves through the native dialog on desktop, or a download in the browser. */
export async function saveExport(blob: Blob, filename: string): Promise<string | null> {
  const { isTauri } = await import('../platform/env');

  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      const ext = filename.split('.').pop() ?? 'mp4';
      const path = await save({
        defaultPath: filename,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (!path) return null;
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      return path;
    } catch (err) {
      console.error('[MotionDeck] native save failed, falling back to download', err);
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return filename;
}
