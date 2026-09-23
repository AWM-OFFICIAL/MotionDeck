/**
 * Screen recording.
 *
 * Capture runs through `getDisplayMedia`, which in both Chromium and the Tauri WebView
 * opens the OS picker for "entire screen / window / monitor". Audio tracks are mixed in
 * a WebAudio graph so system audio and a microphone can be recorded together.
 *
 * Global cursor sampling is only possible natively; `cursorCaptured` on the result tells
 * the editor whether the smart-camera features have data to work with.
 */

import type { CursorEvent, RecordingMetadata, Size } from '../core/types';
import { isTauri } from './env';

export type CaptureSource = 'fullscreen' | 'window' | 'region';

export interface RecordingOptions {
  source: CaptureSource;
  fps: 30 | 60;
  /** Target height; `native` keeps the capture surface's own resolution. */
  resolution: 720 | 1080 | 1440 | 'native';
  systemAudio: boolean;
  microphoneId: string | null;
  cameraId: string | null;
  showCursor: boolean;
  /** Crop applied after capture, in normalised surface coordinates. */
  region?: { x: number; y: number; width: number; height: number };
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  duration: number;
  metadata: RecordingMetadata;
  cameraBlob?: Blob;
}

export class RecordingError extends Error {
  constructor(
    message: string,
    /** A concrete next step the UI can show the user. */
    readonly hint: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RecordingError';
  }
}

export interface DeviceOption {
  id: string;
  label: string;
}

export async function listAudioInputs(): Promise<DeviceOption[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  } catch {
    return [];
  }
}

export async function listVideoInputs(): Promise<DeviceOption[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  } catch {
    return [];
  }
}

/** Device labels are blank until the user has granted permission once. */
export async function primeDevicePermissions(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

const heightFor = (r: RecordingOptions['resolution']) => (r === 'native' ? undefined : r);

export class ScreenRecorder {
  private recorder: MediaRecorder | null = null;
  private cameraRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private cameraChunks: Blob[] = [];
  private displayStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private startedAt = 0;
  private pausedTotal = 0;
  private pausedAt = 0;
  private options: RecordingOptions | null = null;
  private surface: Size = { width: 1920, height: 1080 };
  private nativeCursorActive = false;

  /** Fires when the user stops sharing from the browser/OS chrome. */
  onExternalStop?: () => void;

  get state(): 'idle' | 'recording' | 'paused' {
    if (!this.recorder) return 'idle';
    return this.recorder.state === 'paused' ? 'paused' : 'recording';
  }

  /** Elapsed recording seconds, excluding paused time. */
  elapsed(): number {
    if (!this.startedAt) return 0;
    const now = this.pausedAt || performance.now();
    return Math.max(0, (now - this.startedAt - this.pausedTotal) / 1000);
  }

  async start(options: RecordingOptions): Promise<void> {
    if (this.recorder) throw new RecordingError('A recording is already running.', 'Stop the current recording first.');
    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
      throw new RecordingError(
        'Screen capture is not available in this environment.',
        'Run MotionDeck as the desktop app, or use a Chromium-based browser.',
      );
    }

    this.options = options;
    const height = heightFor(options.resolution);

    try {
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: options.fps, max: options.fps },
          ...(height ? { height: { ideal: height } } : {}),
          // A hint only — the OS picker always has the final say.
          displaySurface: options.source === 'window' ? 'window' : 'monitor',
        } as MediaTrackConstraints,
        audio: options.systemAudio,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError') {
        throw new RecordingError('Screen recording was cancelled.', 'Pick a screen or window to start recording.', err);
      }
      throw new RecordingError(
        'Could not start screen capture.',
        'Check that MotionDeck has screen-recording permission in your system settings.',
        err,
      );
    }

    const videoTrack = this.displayStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    this.surface = { width: settings.width ?? 1920, height: settings.height ?? 1080 };
    videoTrack.addEventListener('ended', () => this.onExternalStop?.());

    // Cursor visibility: the capture API draws the cursor into the frames. When the
    // user wants a stylised cursor we ask the OS to omit it and draw our own.
    try {
      await videoTrack.applyConstraints({
        // @ts-expect-error - `cursor` is a display-capture-only constraint
        cursor: options.showCursor ? 'always' : 'never',
      });
    } catch {
      // Not every platform honours this; the editor's cursor overlay still works.
    }

    const tracks: MediaStreamTrack[] = [videoTrack];

    if (options.microphoneId) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: options.microphoneId },
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (err) {
        console.warn('[MotionDeck] microphone unavailable', err);
      }
    }

    const systemAudioTracks = this.displayStream.getAudioTracks();
    const micTracks = this.micStream?.getAudioTracks() ?? [];

    if (systemAudioTracks.length > 0 && micTracks.length > 0) {
      // Two sources: mix them down to a single track so the result plays everywhere.
      this.audioContext = new AudioContext();
      const destination = this.audioContext.createMediaStreamDestination();
      for (const src of [this.displayStream, this.micStream!]) {
        const node = this.audioContext.createMediaStreamSource(src);
        const gain = this.audioContext.createGain();
        gain.gain.value = src === this.micStream ? 1.0 : 0.8;
        node.connect(gain).connect(destination);
      }
      tracks.push(...destination.stream.getAudioTracks());
    } else {
      tracks.push(...systemAudioTracks, ...micTracks);
    }

    if (options.cameraId) {
      try {
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: options.cameraId }, width: 1280, height: 720 },
        });
        this.cameraRecorder = new MediaRecorder(this.cameraStream, { mimeType: pickMimeType() });
        this.cameraRecorder.ondataavailable = (e) => e.data.size > 0 && this.cameraChunks.push(e.data);
        this.cameraRecorder.start(1000);
      } catch (err) {
        console.warn('[MotionDeck] camera unavailable', err);
      }
    }

    const mimeType = pickMimeType();
    const bitsPerSecond = Math.round(
      (this.surface.width * this.surface.height * options.fps) / 160,
    );
    const combined = new MediaStream(tracks);
    this.recorder = new MediaRecorder(combined, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: Math.min(Math.max(bitsPerSecond, 4_000_000), 40_000_000),
    });
    this.chunks = [];
    this.recorder.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
    // 1s timeslices keep memory bounded on 30-minute recordings.
    this.recorder.start(1000);

    this.startedAt = performance.now();
    this.pausedTotal = 0;
    this.pausedAt = 0;

    this.nativeCursorActive = await startNativeCursorCapture();
  }

  pause(): void {
    if (this.recorder?.state === 'recording') {
      this.recorder.pause();
      this.cameraRecorder?.pause();
      this.pausedAt = performance.now();
    }
  }

  resume(): void {
    if (this.recorder?.state === 'paused') {
      this.recorder.resume();
      this.cameraRecorder?.resume();
      this.pausedTotal += performance.now() - this.pausedAt;
      this.pausedAt = 0;
    }
  }

  async stop(): Promise<RecordingResult> {
    const recorder = this.recorder;
    const options = this.options;
    if (!recorder || !options) throw new RecordingError('Nothing is recording.', 'Start a recording first.');

    const duration = this.elapsed();

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () =>
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'video/webm' }));
      recorder.onerror = (e) => reject(e);
      recorder.stop();
    });

    let cameraBlob: Blob | undefined;
    if (this.cameraRecorder) {
      const camRecorder = this.cameraRecorder;
      cameraBlob = await new Promise<Blob>((resolve) => {
        camRecorder.onstop = () =>
          resolve(new Blob(this.cameraChunks, { type: camRecorder.mimeType || 'video/webm' }));
        camRecorder.stop();
      });
    }

    const rawCursor = await stopNativeCursorCapture();
    const cursor = normaliseCursorEvents(rawCursor, this.surface, options.region);

    const metadata: RecordingMetadata = {
      source: options.source,
      screen: this.surface,
      region: options.region
        ? {
            x: options.region.x * this.surface.width,
            y: options.region.y * this.surface.height,
            width: options.region.width * this.surface.width,
            height: options.region.height * this.surface.height,
          }
        : undefined,
      cursor,
      cursorCaptured: this.nativeCursorActive && cursor.length > 0,
      hasSystemAudio: options.systemAudio && this.displayStream!.getAudioTracks().length > 0,
      hasMicrophone: (this.micStream?.getAudioTracks().length ?? 0) > 0,
      fps: options.fps,
    };

    this.cleanup();

    return { blob, mimeType: blob.type, duration, metadata, cameraBlob };
  }

  cancel(): void {
    try {
      this.recorder?.stop();
      this.cameraRecorder?.stop();
    } catch {
      /* already stopped */
    }
    void stopNativeCursorCapture();
    this.cleanup();
  }

  /** Live preview of the capture surface, for the pre-flight dialog. */
  previewStream(): MediaStream | null {
    return this.displayStream;
  }

  private cleanup(): void {
    this.displayStream?.getTracks().forEach((t) => t.stop());
    this.cameraStream?.getTracks().forEach((t) => t.stop());
    this.micStream?.getTracks().forEach((t) => t.stop());
    void this.audioContext?.close();
    this.recorder = null;
    this.cameraRecorder = null;
    this.displayStream = null;
    this.cameraStream = null;
    this.micStream = null;
    this.audioContext = null;
    this.chunks = [];
    this.cameraChunks = [];
    this.startedAt = 0;
    this.options = null;
  }
}

/* --------------------------------------------------------- native cursor */

interface NativeCursorSample {
  t: number;
  x: number;
  y: number;
  down: boolean;
  button: number;
}

async function startNativeCursorCapture(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<boolean>('start_cursor_capture', { hz: 120 });
  } catch (err) {
    console.warn('[MotionDeck] native cursor capture unavailable', err);
    return false;
  }
}

async function stopNativeCursorCapture(): Promise<NativeCursorSample[]> {
  if (!isTauri()) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<NativeCursorSample[]>('stop_cursor_capture');
  } catch {
    return [];
  }
}

/** Converts screen-pixel samples into normalised, region-relative, second-based events. */
export function normaliseCursorEvents(
  samples: NativeCursorSample[],
  surface: Size,
  region?: { x: number; y: number; width: number; height: number },
): CursorEvent[] {
  if (samples.length === 0) return [];
  const rx = region?.x ?? 0;
  const ry = region?.y ?? 0;
  const rw = region?.width ?? 1;
  const rh = region?.height ?? 1;

  return samples.map((s) => {
    const nx = (s.x / surface.width - rx) / rw;
    const ny = (s.y / surface.height - ry) / rh;
    return {
      t: s.t / 1000,
      x: Math.min(1, Math.max(0, nx)),
      y: Math.min(1, Math.max(0, ny)),
      ...(s.down ? { down: true, button: s.button } : {}),
    };
  });
}
