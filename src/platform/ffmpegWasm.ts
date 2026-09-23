/**
 * In-browser FFmpeg (wasm) for converting exotic containers without a system
 * FFmpeg install. Lazy-loaded on first exotic import.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { uid } from '../core/ids';

let instance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const MAX_BYTES = 180 * 1024 * 1024; // ~180 MB — wasm memory / UX ceiling

export function canUseFfmpegWasm(): boolean {
  return typeof WebAssembly === 'object' && typeof Worker !== 'undefined';
}

async function getFfmpeg(): Promise<FFmpeg> {
  if (instance?.loaded) return instance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    // Single-threaded core works with COEP: credentialless (no SharedArrayBuffer).
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    instance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

export async function transcodeWithWasm(
  blob: Blob,
  inputName: string,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  if (blob.size > MAX_BYTES) {
    throw new Error(
      `File is too large for in-app conversion (${Math.round(blob.size / (1024 * 1024))} MB). ` +
        `Use a file under ~180 MB, or install system FFmpeg for Desktop conversion.`,
    );
  }
  if (!canUseFfmpegWasm()) {
    throw new Error('WebAssembly is not available in this environment.');
  }

  const ffmpeg = await getFfmpeg();
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(1, Math.max(0, progress)));
  };
  ffmpeg.on('progress', progressHandler);

  const inExt = (/\.[a-z0-9]+$/i.exec(inputName)?.[0] ?? '.bin').replace('.', '') || 'bin';
  const inFile = `in-${uid('w')}.${inExt}`;
  const outFile = `out-${uid('w')}.mp4`;

  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await ffmpeg.writeFile(inFile, bytes);

    // Prefer stream copy into MP4 when codecs allow it.
    let ok = false;
    try {
      await ffmpeg.exec([
        '-i',
        inFile,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        outFile,
      ]);
      const copied = await ffmpeg.readFile(outFile);
      if (copied instanceof Uint8Array && copied.byteLength > 1024) {
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      try {
        await ffmpeg.deleteFile(outFile);
      } catch {
        /* may not exist */
      }
      await ffmpeg.exec([
        '-i',
        inFile,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outFile,
      ]);
    }

    const data = await ffmpeg.readFile(outFile);
    if (!(data instanceof Uint8Array) || data.byteLength < 1024) {
      throw new Error('Conversion produced an empty file.');
    }
    // Copy into a fresh buffer — FFmpeg FS memory is reused.
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy.buffer], { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', progressHandler);
    try {
      await ffmpeg.deleteFile(inFile);
    } catch {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile(outFile);
    } catch {
      /* ignore */
    }
  }
}
