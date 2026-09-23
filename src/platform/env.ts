/**
 * Runtime capability detection.
 *
 * MotionDeck runs identically in a browser dev server and inside the Tauri WebView.
 * Native-only powers (global cursor sampling, filesystem export targets) are detected
 * here and surfaced to the UI so unsupported controls are disabled with an explanation
 * rather than failing silently.
 */

export interface Capabilities {
  /** Running inside the Tauri desktop shell. */
  isDesktop: boolean;
  platform: string;
  /** `getDisplayMedia` — screen/window/monitor capture. */
  screenCapture: boolean;
  /** Browsers gate system audio capture; Chromium on Windows supports it. */
  systemAudio: boolean;
  microphone: boolean;
  camera: boolean;
  /** WebCodecs hardware/software H.264 encoding for MP4 export. */
  webCodecs: boolean;
  /** Global cursor + click sampling outside the app window. */
  nativeCursorCapture: boolean;
  /** Origin Private File System for the local media vault. */
  opfs: boolean;
  ffmpeg: boolean;
  ffmpegPath?: string;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

let cached: Capabilities | null = null;

async function detectSystemAudio(): Promise<boolean> {
  // There is no feature query for system audio; Chromium-family engines on
  // Windows/ChromeOS support it, everything else silently drops the track.
  const ua = navigator.userAgent;
  const chromium = /Chrome|Chromium|Edg/.test(ua);
  const windows = /Windows/.test(ua);
  return chromium && windows;
}

export async function detectCapabilities(): Promise<Capabilities> {
  if (cached) return cached;

  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  const base: Capabilities = {
    isDesktop: isTauri(),
    platform: navigator.userAgent.includes('Mac')
      ? 'macos'
      : navigator.userAgent.includes('Linux')
        ? 'linux'
        : 'windows',
    screenCapture: typeof md?.getDisplayMedia === 'function',
    systemAudio: await detectSystemAudio(),
    microphone: typeof md?.getUserMedia === 'function',
    camera: typeof md?.getUserMedia === 'function',
    webCodecs: typeof globalThis.VideoEncoder === 'function',
    nativeCursorCapture: false,
    opfs: typeof navigator?.storage?.getDirectory === 'function',
    ffmpeg: false,
  };

  if (base.isDesktop) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const native = await invoke<{
        platform: string;
        native_cursor_capture: boolean;
        ffmpeg: boolean;
        ffmpeg_path?: string | null;
      }>('native_capabilities');
      base.platform = native.platform;
      base.nativeCursorCapture = native.native_cursor_capture;
      base.ffmpeg = native.ffmpeg;
      base.ffmpegPath = native.ffmpeg_path ?? undefined;
    } catch (err) {
      console.warn('[MotionDeck] native capability probe failed', err);
    }
  }

  cached = base;
  return base;
}

/** Synchronous read for render paths. Returns null until `detectCapabilities` resolves. */
export const peekCapabilities = (): Capabilities | null => cached;

export function isEncoderConfigSupported(): boolean {
  return typeof globalThis.VideoEncoder === 'function';
}
