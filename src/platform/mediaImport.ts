/**
 * Media probing and import.
 *
 * WebM produced by `MediaRecorder` has no duration in its header, so duration is
 * measured by seeking rather than trusted from metadata — otherwise every recording
 * would report `Infinity` and break the timeline.
 */

import { uid } from '../core/ids';
import type { MediaAsset, MediaKind, RecordingMetadata } from '../core/types';
import { writeMedia } from './mediaVault';

export interface ProbeResult {
  duration: number;
  width?: number;
  height?: number;
  thumbnail?: string;
}

const VIDEO_EXT = /\.(mp4|webm|mov|mkv|m4v|avi)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;

export function kindForFile(file: { name: string; type: string }): MediaKind | null {
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) return 'video';
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)) return 'audio';
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  return null;
}

/** Forces a real duration out of a stream-recorded file. */
export function measureDuration(el: HTMLMediaElement): Promise<number> {
  return new Promise((resolve) => {
    if (Number.isFinite(el.duration) && el.duration > 0) {
      resolve(el.duration);
      return;
    }
    const onSeeked = () => {
      el.removeEventListener('seeked', onSeeked);
      const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : el.currentTime;
      el.currentTime = 0;
      resolve(d);
    };
    el.addEventListener('seeked', onSeeked);
    // Seeking past the end makes the browser scan for the true end timestamp.
    el.currentTime = 1e9;
    setTimeout(() => {
      el.removeEventListener('seeked', onSeeked);
      resolve(Number.isFinite(el.duration) ? el.duration : 0);
    }, 4000);
  });
}

export async function probeVideo(blob: Blob): Promise<ProbeResult> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('This video file could not be read.'));
      setTimeout(() => reject(new Error('Timed out reading this video.')), 20000);
    });

    // WebM from MediaRecorder often reports 0×0 until a frame is decoded.
    if (video.videoWidth < 2 || video.videoHeight < 2) {
      await new Promise<void>((resolve) => {
        const done = () => {
          video.removeEventListener('loadeddata', done);
          resolve();
        };
        video.addEventListener('loadeddata', done);
        setTimeout(done, 4000);
      });
    }
    if (video.videoWidth < 2 || video.videoHeight < 2) {
      await grabFrame(video, 0.05);
    }

    const duration = await measureDuration(video);
    const thumbnail = await grabFrame(video, Math.min(duration * 0.15, 2));

    return {
      duration,
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
      thumbnail,
    };
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

export async function probeAudio(blob: Blob): Promise<ProbeResult> {
  const url = URL.createObjectURL(blob);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error('This audio file could not be read.'));
      setTimeout(() => reject(new Error('Timed out reading this audio file.')), 15000);
    });
    return { duration: await measureDuration(audio) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function probeImage(blob: Blob): Promise<ProbeResult> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 320 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const result = {
    duration: 0,
    width: bitmap.width,
    height: bitmap.height,
    thumbnail: canvas.toDataURL('image/jpeg', 0.7),
  };
  bitmap.close();
  return result;
}

/** Captures a single frame as a small JPEG data URL for the media bin. */
export async function grabFrame(video: HTMLVideoElement, time: number): Promise<string | undefined> {
  try {
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = Math.max(0, time);
      setTimeout(resolve, 3000);
    });

    const width = 320;
    const height = Math.round((video.videoHeight / Math.max(video.videoWidth, 1)) * width) || 180;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.66);
  } catch {
    return undefined;
  }
}

export interface ImportOptions {
  name: string;
  mimeType: string;
  sourcePath?: string;
  recording?: RecordingMetadata;
  fps?: number;
}

/** Stores a blob in the vault and returns the asset descriptor to add to a project. */
export async function importMedia(blob: Blob, opts: ImportOptions): Promise<MediaAsset> {
  const kind = kindForFile({ name: opts.name, type: opts.mimeType }) ?? 'video';

  let working = blob;
  let mimeType = opts.mimeType || blob.type;
  let name = opts.name;
  let probe: ProbeResult;

  if (kind === 'video') {
    const { normalizeVideoBlob, formatImportError, isExoticVideoContainer, UnsupportedMediaError } =
      await import('./normalizeMedia');

    const tryNormalize = async (force = false) => {
      const normalized = await normalizeVideoBlob(working, { name, mimeType, force });
      working = normalized.blob;
      mimeType = normalized.mimeType;
      name = normalized.name;
    };

    if (isExoticVideoContainer(name, mimeType)) {
      try {
        await tryNormalize(false);
      } catch (err) {
        throw err instanceof UnsupportedMediaError
          ? err
          : new Error(formatImportError(err, opts.name));
      }
    }

    try {
      probe = await probeVideo(working);
    } catch (firstErr) {
      try {
        await tryNormalize(true);
        probe = await probeVideo(working);
      } catch (secondErr) {
        throw secondErr instanceof UnsupportedMediaError
          ? secondErr
          : new Error(formatImportError(firstErr, opts.name));
      }
    }
  } else if (kind === 'audio') {
    probe = await probeAudio(working);
  } else {
    probe = await probeImage(working);
  }

  const id = uid('as');
  const ext = extensionFor(mimeType, name);
  const storageKey = `${id}${ext}`;
  await writeMedia(storageKey, working);

  // Imported videos are first-class clips. Seed empty recording metadata so
  // Mark path / Focus / Auto Tap share the same code paths as MotionDeck captures.
  let recording = opts.recording;
  if (kind === 'video' && !recording) {
    recording = emptyImportRecording({
      width: probe.width,
      height: probe.height,
      fps: opts.fps,
    });
  }

  return {
    id,
    kind,
    name,
    storageKey,
    sourcePath: opts.sourcePath,
    mimeType: mimeType || working.type,
    byteSize: working.size,
    duration: probe.duration,
    width: probe.width,
    height: probe.height,
    frameRate: opts.fps ?? recording?.fps,
    createdAt: Date.now(),
    thumbnail: probe.thumbnail,
    recording,
  };
}

/** Sidecar for file imports — same shape as a capture, without cursor samples. */
export function emptyImportRecording(opts: {
  width?: number;
  height?: number;
  fps?: number;
}): RecordingMetadata {
  return {
    source: 'import',
    screen: {
      width: opts.width && opts.width >= 2 ? opts.width : 1920,
      height: opts.height && opts.height >= 2 ? opts.height : 1080,
    },
    cursor: [],
    cursorCaptured: false,
    hasSystemAudio: false,
    hasMicrophone: false,
    fps: opts.fps && opts.fps > 0 ? opts.fps : 30,
  };
}

/** User-facing source label — does not gate editor features. */
export function mediaSourceLabel(asset: MediaAsset | undefined): 'Recorded' | 'Imported' | 'Video' {
  if (!asset) return 'Video';
  if (!asset.recording) return 'Video';
  if (asset.recording.source === 'import') return 'Imported';
  return 'Recorded';
}

function extensionFor(mime: string, name: string): string {
  const fromName = /\.[a-z0-9]{2,5}$/i.exec(name)?.[0];
  if (fromName) return fromName.toLowerCase();
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('quicktime') || mime.includes('mov')) return '.mov';
  if (mime.includes('matroska') || mime.includes('mkv')) return '.mkv';
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.startsWith('audio/')) return '.audio';
  return '.bin';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

/** Best-effort MIME when the OS leaves File.type empty (common for .webm/.mkv). */
export function guessMime(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith('.mp4') || n.endsWith('.m4v')) return 'video/mp4';
  if (n.endsWith('.webm')) return 'video/webm';
  if (n.endsWith('.mov')) return 'video/quicktime';
  if (n.endsWith('.mkv')) return 'video/x-matroska';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.mp3')) return 'audio/mpeg';
  if (n.endsWith('.wav')) return 'audio/wav';
  return 'application/octet-stream';
}
