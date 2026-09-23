/**
 * Normalize exotic / browser-hostile video containers into something MotionDeck
 * can decode (MP4 or WebM) before vaulting.
 *
 * Order:
 * 1. Pass-through when already friendly
 * 2. Desktop system FFmpeg (fast, full codec set)
 * 3. In-browser ffmpeg.wasm (no PATH / Desktop required)
 * 4. MediaRecorder re-wrap when the browser can already decode
 */

import { detectCapabilities } from './env';
import { uid } from '../core/ids';
import { canUseFfmpegWasm, transcodeWithWasm } from './ffmpegWasm';

export class UnsupportedMediaError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'unsupported_container'
      | 'decode_failed'
      | 'ffmpeg_missing'
      | 'normalize_failed'
      | 'too_large' = 'decode_failed',
  ) {
    super(message);
    this.name = 'UnsupportedMediaError';
  }
}

const EXOTIC_VIDEO = /\.(mkv|avi|flv|wmv|ts|m2ts|mpg|mpeg|3gp)$/i;
const PREFERRED_BROWSER = /\.(mp4|m4v|webm|mov)$/i;

export function isExoticVideoContainer(name: string, mime: string): boolean {
  if (EXOTIC_VIDEO.test(name)) return true;
  if (/matroska|x-msvideo|avi|mpegts|x-flv|x-ms-wmv/i.test(mime)) return true;
  return false;
}

export function needsVideoNormalization(name: string, mime: string): boolean {
  return isExoticVideoContainer(name, mime) || (!PREFERRED_BROWSER.test(name) && mime.startsWith('video/'));
}

export interface NormalizeResult {
  blob: Blob;
  mimeType: string;
  name: string;
  note?: string;
}

/**
 * Ensure a video blob is playable in the WebView.
 */
export async function normalizeVideoBlob(
  blob: Blob,
  opts: {
    name: string;
    mimeType: string;
    /** Force conversion even for friendly extensions (e.g. after probe failed). */
    force?: boolean;
    onProgress?: (message: string, ratio?: number) => void;
  },
): Promise<NormalizeResult> {
  const mime = opts.mimeType || blob.type || 'application/octet-stream';
  const exotic = isExoticVideoContainer(opts.name, mime);

  if (!exotic && !opts.force) {
    return { blob, mimeType: mime || guessVideoMime(opts.name), name: opts.name };
  }

  const caps = await detectCapabilities();

  // 1) Native system FFmpeg on Desktop
  if (caps.isDesktop && caps.ffmpeg) {
    try {
      opts.onProgress?.('Converting with system FFmpeg…');
      const remuxed = await remuxWithFfmpeg(blob, opts.name);
      return {
        blob: remuxed,
        mimeType: 'video/mp4',
        name: replaceExt(opts.name, '.mp4'),
        note: 'Converted to MP4 (system FFmpeg).',
      };
    } catch (err) {
      console.warn('[MotionDeck] system ffmpeg remux failed', err);
    }
  }

  // 2) In-browser ffmpeg.wasm — works in web + Desktop without PATH
  if (canUseFfmpegWasm()) {
    try {
      opts.onProgress?.('Loading in-app converter…', 0);
      const remuxed = await transcodeWithWasm(blob, opts.name, (ratio) => {
        opts.onProgress?.('Converting video…', ratio);
      });
      return {
        blob: remuxed,
        mimeType: 'video/mp4',
        name: replaceExt(opts.name, '.mp4'),
        note: 'Converted to MP4 in-app.',
      };
    } catch (err) {
      console.warn('[MotionDeck] ffmpeg.wasm convert failed', err);
      if (err instanceof Error && /too large/i.test(err.message)) {
        throw new UnsupportedMediaError(err.message, 'too_large');
      }
    }
  }

  // 3) Browser can decode → re-wrap to WebM
  try {
    opts.onProgress?.('Re-encoding in the browser…');
    const reencoded = await reencodeViaMediaRecorder(blob);
    return {
      blob: reencoded,
      mimeType: reencoded.type || 'video/webm',
      name: replaceExt(opts.name, '.webm'),
      note: 'Converted to WebM for playback.',
    };
  } catch {
    /* fall through */
  }

  throw new UnsupportedMediaError(
    `Could not convert ${opts.name}. MotionDeck tried system FFmpeg, in-app conversion, and browser re-encode. ` +
      `Export as MP4 (H.264 + AAC) from your capture tool, or use a smaller file.`,
    'normalize_failed',
  );
}

function guessVideoMime(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith('.mp4') || n.endsWith('.m4v')) return 'video/mp4';
  if (n.endsWith('.webm')) return 'video/webm';
  if (n.endsWith('.mov')) return 'video/quicktime';
  if (n.endsWith('.mkv')) return 'video/x-matroska';
  return 'video/mp4';
}

function extOf(name: string): string {
  return /\.[a-z0-9]+$/i.exec(name)?.[0]?.toLowerCase() ?? '';
}

function replaceExt(name: string, ext: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '') + ext;
}

async function remuxWithFfmpeg(blob: Blob, name: string): Promise<Blob> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { writeFile, readFile, remove } = await import('@tauri-apps/plugin-fs');
  const { tempDir, join } = await import('@tauri-apps/api/path');

  const id = uid('ff');
  const inExt = (extOf(name) || '.bin').replace('.', '');
  const base = await tempDir();
  const inputPath = await join(base, `motiondeck-in-${id}.${inExt}`);
  const outputPath = await join(base, `motiondeck-out-${id}.mp4`);

  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(inputPath, bytes);

  try {
    await invoke('remux_video_file', { inputPath, outputPath });
    const out = await readFile(outputPath);
    return new Blob([out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)], {
      type: 'video/mp4',
    });
  } finally {
    try {
      await remove(inputPath);
    } catch {
      /* ignore */
    }
    try {
      await remove(outputPath);
    } catch {
      /* ignore */
    }
  }
}

/** Re-encode a decodable video through MediaRecorder → WebM. */
async function reencodeViaMediaRecorder(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('decode'));
      setTimeout(() => reject(new Error('timeout')), 15000);
    });

    if (video.videoWidth < 2) throw new Error('no frames');

    type CaptureVideo = HTMLVideoElement & { captureStream?: () => MediaStream };
    const v = video as CaptureVideo;
    let stream: MediaStream;
    if (typeof v.captureStream === 'function') {
      stream = v.captureStream();
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      const capture = canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
      if (!capture.captureStream) throw new Error('canvas');
      stream = capture.captureStream(30);
      const draw = () => {
        if (video.ended || video.paused) return;
        ctx.drawImage(video, 0, 0);
        requestAnimationFrame(draw);
      };
      video.addEventListener('play', () => draw(), { once: true });
    }

    const mime =
      MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
          ? 'video/webm;codecs=vp8'
          : 'video/webm';

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      recorder.onerror = () => reject(new Error('recorder'));
    });

    recorder.start(200);
    await video.play();
    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
      setTimeout(resolve, Math.min((video.duration || 30) * 1000 + 2000, 10 * 60 * 1000));
    });
    if (recorder.state !== 'inactive') recorder.stop();
    video.pause();

    const out = await done;
    if (out.size < 1000) throw new Error('empty output');
    return out;
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

export function formatImportError(err: unknown, fileName: string): string {
  if (err instanceof UnsupportedMediaError) return err.message;
  if (err instanceof Error && /could not be read|Timed out|decode/i.test(err.message)) {
    return (
      `Could not decode ${fileName}. MotionDeck will try in-app conversion for MKV/AVI. ` +
      `If this keeps failing, export as MP4 (H.264 + AAC) from your capture tool.`
    );
  }
  return `Could not import ${fileName}.`;
}
