import { uid } from './ids';
import type {
  AudioLayer,
  BackgroundSpec,
  BorderSpec,
  CalloutLayer,
  CameraSpec,
  CursorSpec,
  ExportSettings,
  FrameLayer,
  FrameSpec,
  GlowSpec,
  ImageLayer,
  MotionSpec,
  Project,
  Scene,
  ShadowSpec,
  ShapeLayer,
  Size,
  TextLayer,
  VideoLayer,
} from './types';
import { SCHEMA_VERSION } from './types';
import { getFrame } from '../render/frames';

export const ACCENT = '#22D3EE';

export const CANVAS_PRESETS: { id: string; label: string; size: Size; aspect: string }[] = [
  { id: 'landscape1080', label: '1080p Landscape', size: { width: 1920, height: 1080 }, aspect: '16:9' },
  { id: 'portrait1080', label: '1080p Portrait', size: { width: 1080, height: 1920 }, aspect: '9:16' },
  { id: 'androidPortrait', label: 'Android Portrait', size: { width: 1080, height: 1920 }, aspect: '9:16' },
  { id: 'androidLandscape', label: 'Android Landscape', size: { width: 1920, height: 1080 }, aspect: '16:9' },
  { id: 'socialVertical', label: 'Social Vertical', size: { width: 1080, height: 1920 }, aspect: '9:16' },
  { id: 'productDemo', label: 'Product Demo', size: { width: 1920, height: 1080 }, aspect: '16:9' },
  { id: 'square1080', label: 'Square', size: { width: 1080, height: 1080 }, aspect: '1:1' },
  { id: 'uhd4k', label: '4K', size: { width: 3840, height: 2160 }, aspect: '16:9' },
  { id: 'linkedin', label: 'LinkedIn', size: { width: 1200, height: 1200 }, aspect: '1:1' },
  { id: 'x', label: 'X', size: { width: 1600, height: 900 }, aspect: '16:9' },
];

export const defaultMotion = (): MotionSpec => ({
  entrance: 'none',
  entranceDuration: 0.6,
  exit: 'none',
  exitDuration: 0.5,
  idle: 'none',
  intensity: 1,
  feel: 'smooth',
});

export const defaultShadow = (): ShadowSpec => ({
  enabled: true,
  blur: 80,
  y: 28,
  opacity: 0.45,
  color: '#000000',
  spread: 0,
});

export const defaultBorder = (): BorderSpec => ({
  enabled: false,
  style: 'solid',
  thickness: 2,
  opacity: 0.85,
  color: '#FFFFFF',
});

export const defaultGlow = (): GlowSpec => ({
  enabled: false,
  intensity: 0.55,
  blur: 28,
  spread: 8,
  opacity: 0.45,
  color: '#22D3EE',
});

export const defaultCamera = (): CameraSpec => ({
  mode: 'none',
  zoom: 1.45,
  smoothing: 0.55,
  focusPoints: [],
});

export const defaultCursor = (): CursorSpec => ({
  style: 'standard',
  size: 1,
  smoothing: 0.5,
  shadow: true,
  highlightColor: '#FFE066',
  highlightRadius: 46,
  click: 'ripple',
  clickColor: ACCENT,
});

export const defaultFrame = (): FrameSpec => ({ kind: 'none', url: 'app.example.com' });

export const defaultBackground = (): BackgroundSpec => ({
  type: 'gradient',
  from: '#1B2735',
  to: '#0B0F14',
  angle: 135,
});

const baseLayer = (name: string, start: number, duration: number) => ({
  id: uid('ly'),
  name,
  start,
  duration,
  locked: false,
  hidden: false,
  position: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
  opacity: 1,
  motion: defaultMotion(),
  keyframes: {},
});

export function createVideoLayer(
  assetId: string,
  opts: { name?: string; duration?: number; start?: number } = {},
): VideoLayer {
  const duration = opts.duration ?? 5;
  return {
    ...baseLayer(opts.name ?? 'Screen Recording', opts.start ?? 0, duration),
    type: 'video',
    assetId,
    trimStart: 0,
    trimEnd: duration,
    playbackRate: 1,
    volume: 1,
    muted: false,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    cornerRadius: 18,
    shadow: defaultShadow(),
    background: { type: 'transparent' },
    frame: defaultFrame(),
    camera: defaultCamera(),
    cursor: defaultCursor(),
    autoFit: true,
    appScreen: undefined,
  };
}

export function createImageLayer(assetId: string, name = 'Image'): ImageLayer {
  return {
    ...baseLayer(name, 0, 4),
    type: 'image',
    assetId,
    cornerRadius: 12,
    shadow: { ...defaultShadow(), blur: 50, opacity: 0.35 },
  };
}

export function createTextLayer(text = 'Your headline', start = 0, duration = 3): TextLayer {
  return {
    ...baseLayer('Text', start, duration),
    type: 'text',
    text,
    fontFamily: 'Inter',
    fontSize: 84,
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'center',
    letterSpacing: -1.5,
    lineHeight: 1.15,
    maxWidth: 1400,
    animation: 'slideUp',
    motion: { ...defaultMotion(), entrance: 'slideUp', exit: 'fade' },
  };
}

export function createShapeLayer(shape: ShapeLayer['shape'] = 'rect'): ShapeLayer {
  return {
    ...baseLayer(shape === 'arrow' ? 'Arrow' : 'Shape', 0, 3),
    type: 'shape',
    shape,
    size: { width: 320, height: 200 },
    fill: shape === 'arrow' || shape === 'line' ? 'transparent' : ACCENT,
    stroke: ACCENT,
    strokeWidth: shape === 'arrow' || shape === 'line' ? 10 : 0,
    cornerRadius: 16,
    endPoint: shape === 'arrow' || shape === 'line' ? { x: 280, y: -160 } : undefined,
    motion: { ...defaultMotion(), entrance: 'pop' },
  };
}

export function createCalloutLayer(kind: CalloutLayer['callout'] = 'roundedRect'): CalloutLayer {
  return {
    ...baseLayer('Callout', 0, 3),
    type: 'callout',
    callout: kind,
    size: { width: 360, height: 120 },
    color: ACCENT,
    label: '',
    dim: kind === 'spotlight' || kind === 'highlight' ? 0.55 : 0,
    strokeWidth: 6,
    pulse: true,
    motion: { ...defaultMotion(), entrance: 'pop', exit: 'fade' },
  };
}

/** Independent phone / device chrome layer (not baked into the video). */
export function createFrameLayer(
  kind: Exclude<FrameSpec['kind'], 'none'> = 'phoneAndroid',
  opts: { name?: string; duration?: number; linkedLayerId?: string } = {},
): FrameLayer {
  const def = getFrame(kind);
  const height = 780;
  const width = def ? height * def.outerAspect : height * 0.48;
  return {
    ...baseLayer(opts.name ?? 'Phone Frame', 0, opts.duration ?? 8),
    type: 'frame',
    frame: { kind, url: 'app.example.com' },
    size: { width, height },
    shadow: { ...defaultShadow(), blur: 100, y: 36, opacity: 0.5 },
    linkedLayerId: opts.linkedLayerId,
    linkTransforms: true,
    nestAppScreen: true,
    border: defaultBorder(),
    glow: defaultGlow(),
    motion: { ...defaultMotion(), entrance: 'floatIn', entranceDuration: 0.8 },
  };
}

export function createAudioLayer(assetId: string, duration: number, name = 'Audio'): AudioLayer {
  return {
    ...baseLayer(name, 0, duration),
    type: 'audio',
    assetId,
    trimStart: 0,
    trimEnd: duration,
    volume: 0.8,
    muted: false,
    fadeIn: 0.5,
    fadeOut: 1,
  };
}

export function createScene(name = 'Scene 1', duration = 8): Scene {
  return {
    id: uid('sc'),
    name,
    duration,
    background: defaultBackground(),
    layers: [],
    transitionIn: { kind: 'none', duration: 0.4 },
  };
}

export const defaultExportSettings = (canvas: Size): ExportSettings => ({
  format: 'mp4',
  width: canvas.width,
  height: canvas.height,
  fps: 30,
  bitrateMbps: 12,
  quality: 'high',
});

export function createProject(name = 'Untitled Project', canvas: Size = { width: 1920, height: 1080 }): Project {
  const now = Date.now();
  return {
    id: uid('pr'),
    schemaVersion: SCHEMA_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
    canvas,
    fps: 30,
    background: defaultBackground(),
    scenes: [createScene('Scene 1', 8)],
    assets: [],
    exportSettings: defaultExportSettings(canvas),
  };
}
