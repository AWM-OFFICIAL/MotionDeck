/**
 * MotionDeck document model.
 *
 * Everything the renderer, timeline, inspector and exporter read comes from here.
 * The model is intentionally plain-JSON serialisable: a project file is this object
 * plus a manifest of media references (never the media bytes themselves).
 */

export const SCHEMA_VERSION = 3;

/* ------------------------------------------------------------------ geometry */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Vec2, Size {}

/* -------------------------------------------------------------------- easing */

export const EASINGS = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'spring',
  'smooth',
  'elastic',
  'bounce',
] as const;
export type EasingName = (typeof EASINGS)[number];

/* ------------------------------------------------------------------- media */

export type MediaKind = 'video' | 'audio' | 'image';

/**
 * A reference to a media file. `storageKey` points at the local media vault
 * (OPFS in the WebView, app-data directory under Tauri) — the project never inlines
 * or duplicates the bytes.
 */
export interface MediaAsset {
  id: string;
  kind: MediaKind;
  name: string;
  storageKey: string;
  /** Original on-disk path when imported from the filesystem. */
  sourcePath?: string;
  mimeType: string;
  byteSize: number;
  /** Seconds. */
  duration: number;
  width?: number;
  height?: number;
  frameRate?: number;
  createdAt: number;
  /** Data-URL poster used for media bin thumbnails. Small, cached. */
  thumbnail?: string;
  /** Present when the asset came from MotionDeck's own recorder. */
  recording?: RecordingMetadata;
}

/** Pointer activity captured alongside a recording, in *source video* pixel space. */
export interface CursorEvent {
  /** Seconds from the start of the recording. */
  t: number;
  x: number;
  y: number;
  down?: boolean;
  button?: number;
}

export interface RecordingMetadata {
  source: 'fullscreen' | 'window' | 'region' | 'import';
  /** Capture surface size in device pixels. */
  screen: Size;
  /** Crop applied for region recordings, in source pixels. */
  region?: Rect;
  cursor: CursorEvent[];
  /** True when cursor data came from native sampling rather than being unavailable. */
  cursorCaptured: boolean;
  /** True when cursor clicks were inferred from frame analysis (imported video). */
  cursorInferred?: boolean;
  hasSystemAudio: boolean;
  hasMicrophone: boolean;
  fps: number;
}

/* ---------------------------------------------------------------- background */

export type BackgroundSpec =
  | { type: 'transparent' }
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string; angle: number }
  | { type: 'mesh'; colors: [string, string, string, string]; seed: number }
  | { type: 'image'; assetId: string; blur: number; scale: number }
  /** Enlarged + blurred copy of the layer's own footage sitting behind it. */
  | { type: 'dynamic'; blur: number; scale: number; brightness: number };

/* ----------------------------------------------------------------- keyframes */

export type AnimatableProperty =
  | 'x'
  | 'y'
  | 'scale'
  | 'rotation'
  | 'opacity'
  | 'blur'
  | 'cornerRadius';

export interface Keyframe {
  id: string;
  /** Seconds, relative to the layer's start on the timeline. */
  time: number;
  value: number;
  easing: EasingName;
}

export type KeyframeTracks = Partial<Record<AnimatableProperty, Keyframe[]>>;

/* -------------------------------------------------------------------- motion */

export type EntrancePreset =
  | 'none'
  | 'fade'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'scale'
  | 'pop'
  | 'blurIn'
  | 'floatIn'
  | 'reveal';

export type ExitPreset =
  | 'none'
  | 'fade'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'scaleDown'
  | 'blurOut'
  | 'softDisappear';

export type IdlePreset =
  | 'none'
  | 'smoothZoom'
  | 'punchIn'
  | 'float'
  | 'drift'
  | 'slowPush'
  | 'slide'
  | 'bounce'
  | 'cinematic'
  | 'pulse'
  | 'breathe'
  | 'glow'
  | 'shake'
  | 'highlight';

export type MovementFeel = 'smooth' | 'snappy' | 'cinematic' | 'elastic';

export interface MotionSpec {
  entrance: EntrancePreset;
  entranceDuration: number;
  exit: ExitPreset;
  exitDuration: number;
  idle: IdlePreset;
  /** Strength multiplier for the idle preset, 0–2. */
  intensity: number;
  feel: MovementFeel;
}

/* -------------------------------------------------------------------- camera */

export type CameraMode =
  | 'none'
  | 'followCursor'
  | 'followClicks'
  | 'smoothFocus'
  | 'dynamic'
  | 'manual';

/** An explicit "look here, this big, for this long" instruction. */
export interface FocusPoint {
  id: string;
  /** Seconds relative to layer start. */
  time: number;
  /**
   * Normalised 0–1 focus target.
   * When `coordinateSpace` is `'crop'` (default for app-screen workflows), x/y are
   * relative to the active app-screen crop. `'source'` means full-frame footage space.
   */
  x: number;
  y: number;
  /** Defaults to `'source'` for legacy documents; new app-screen points use `'crop'`. */
  coordinateSpace?: 'source' | 'crop';
  zoom: number;
  /** Seconds the camera stays parked before easing back out. */
  hold: number;
  /** Seconds each of the push-in / pull-out ramps take. */
  ramp: number;
  easing: EasingName;
  /** Auto-generated points are replaced whenever clicks are re-analysed. */
  auto?: boolean;
}

export interface CameraSpec {
  mode: CameraMode;
  /** Base zoom for followCursor / dynamic modes. */
  zoom: number;
  /** 0–1: how tightly the camera tracks. Lower is lazier and more cinematic. */
  smoothing: number;
  focusPoints: FocusPoint[];
}

/* -------------------------------------------------------------------- cursor */

export type CursorStyle = 'hidden' | 'standard' | 'highlight' | 'softCircle' | 'dot';
export type ClickEffect = 'none' | 'ripple' | 'pulse' | 'ring' | 'shockwave' | 'highlight';

export interface CursorSpec {
  style: CursorStyle;
  size: number;
  /** 0–1 blend towards a smoothed path; removes hand jitter from the recording. */
  smoothing: number;
  shadow: boolean;
  highlightColor: string;
  highlightRadius: number;
  click: ClickEffect;
  clickColor: string;
}

/* -------------------------------------------------------------------- frames */

export type DeviceFrame =
  | 'none'
  | 'browser'
  | 'browserDark'
  | 'phone'
  | 'phoneAndroid'
  | 'phoneGeneric'
  | 'laptop'
  | 'desktop';

export interface FrameSpec {
  kind: DeviceFrame;
  /** Address bar text for browser frames. */
  url?: string;
}

/* -------------------------------------------------------------------- shadow / border / glow */

export interface ShadowSpec {
  enabled: boolean;
  blur: number;
  y: number;
  opacity: number;
  color: string;
  spread: number;
}

export interface BorderSpec {
  enabled: boolean;
  style: 'solid' | 'soft';
  thickness: number;
  opacity: number;
  color: string;
}

export interface GlowSpec {
  enabled: boolean;
  intensity: number;
  blur: number;
  spread: number;
  opacity: number;
  color: string;
}

export type MotionBlurLevel = 'off' | 'low' | 'medium' | 'high';

/* -------------------------------------------------------------------- layers */

export interface BaseLayer {
  id: string;
  name: string;
  /** Seconds on the scene timeline. */
  start: number;
  duration: number;
  locked: boolean;
  hidden: boolean;
  /** Shared id when layers are grouped for transform / animate-together. */
  groupId?: string;
  /**
   * When set, this layer's position/scale/rotation are relative to the named
   * parent layer (typically a cropped app screen) so overlays follow it.
   */
  attachToLayerId?: string;
  /** Canvas-space centre position, in project pixels. */
  position: Vec2;
  scale: number;
  rotation: number;
  opacity: number;
  motion: MotionSpec;
  keyframes: KeyframeTracks;
  border?: BorderSpec;
  glow?: GlowSpec;
  motionBlur?: MotionBlurLevel;
}

/** Non-destructive Android / mobile app-screen isolation metadata. */
export type AppScreenShape = 'rect' | 'rounded' | 'deviceScreen' | 'custom';
export type AppScreenCornerPreset = 'subtle' | 'standard' | 'iphone' | 'android' | 'edge';
export type AppScreenCropMode =
  | 'none'
  | 'androidPortrait'
  | 'androidCompact'
  | 'detected'
  | 'custom';

export interface CropTrackKeyframe {
  id: string;
  /** Seconds relative to the layer start. */
  time: number;
  rect: Rect;
  confidence: number;
  /** User-authored correction (never overwritten by re-track). */
  manual?: boolean;
}

export interface CropTrack {
  mode: 'static' | 'tracked';
  /** Media asset the track was analysed against. */
  sourceMediaId?: string;
  initialRect: Rect;
  keyframes: CropTrackKeyframe[];
  status: 'idle' | 'tracking' | 'ready' | 'failed';
  avgConfidence: number;
  message?: string;
}

export interface AppScreenSpec {
  /** True once the user has applied an app-screen crop (even if later restored). */
  enabled: boolean;
  mode: AppScreenCropMode;
  lockedAspect: boolean;
  /** width / height of the locked crop; null when free. */
  aspectRatio: number | null;
  shape: AppScreenShape;
  cornerPreset: AppScreenCornerPreset;
  /** Optional asymmetric radii for device-screen shape (project pixels at layout size). */
  topRadius?: number;
  bottomRadius?: number;
  /** @deprecated Prefer cropTrack.mode === 'tracked' */
  trackingEnabled: boolean;
  /** Time-varying crop when tracking / manual corrections are used. */
  cropTrack?: CropTrack;
  /**
   * When true, motion/camera operate on the full source instead of the crop.
   * Default false — once cropped, animate the app screen only.
   */
  animateFullRecording: boolean;
  /** Crop snapshot before app-screen mode, used by Restore Original. */
  originalCrop?: Rect;
  /** Editor-only safe-area guides (never exported). */
  showSafeArea: boolean;
}

export interface VideoLayer extends BaseLayer {
  type: 'video';
  assetId: string;
  /** Seconds into the source video where this clip begins. */
  trimStart: number;
  trimEnd: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  /** Crop in normalised source coordinates (non-destructive). Static fallback. */
  crop: Rect;
  cornerRadius: number;
  shadow: ShadowSpec;
  background: BackgroundSpec;
  /** Legacy baked frame — prefer a separate FrameLayer. */
  frame: FrameSpec;
  camera: CameraSpec;
  cursor: CursorSpec;
  /** Fit the footage to the canvas on load rather than using an absolute scale. */
  autoFit: boolean;
  /** Android emulator / mobile app-screen workflow state. */
  appScreen?: AppScreenSpec;
}

/**
 * Independent device chrome. Renders behind/around a linked App Screen so frame
 * and footage can be transformed and animated separately.
 */
export interface FrameLayer extends BaseLayer {
  type: 'frame';
  frame: FrameSpec;
  /** Outer size in canvas pixels (before layer scale). */
  size: Size;
  shadow: ShadowSpec;
  /** Linked VideoLayer (app screen) id. */
  linkedLayerId?: string;
  /** When true, transforming this frame also transforms the linked app screen. */
  linkTransforms: boolean;
  /**
   * When true (default) and `linkedLayerId` is set, the app screen is drawn into
   * this frame's screen rect so nesting stays pixel-perfect even if the two layers
   * animate independently. Turn off for free advanced composition.
   */
  nestAppScreen: boolean;
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  assetId: string;
  cornerRadius: number;
  shadow: ShadowSpec;
}

export type TextAnimation =
  | 'none'
  | 'fade'
  | 'slideUp'
  | 'slideLeft'
  | 'scale'
  | 'pop'
  | 'typewriter'
  | 'blur'
  | 'wordReveal';

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  maxWidth: number;
  animation: TextAnimation;
  background?: { color: string; padding: number; radius: number };
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'triangle';

export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  shape: ShapeKind;
  size: Size;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  /** Arrow/line endpoint relative to `position`. */
  endPoint?: Vec2;
}

export type CalloutKind =
  | 'circle'
  | 'roundedRect'
  | 'highlight'
  | 'spotlight'
  | 'number'
  | 'label';

export interface CalloutLayer extends BaseLayer {
  type: 'callout';
  callout: CalloutKind;
  size: Size;
  color: string;
  label: string;
  /** 0–1 darkening of everything outside the callout. */
  dim: number;
  strokeWidth: number;
  pulse: boolean;
}

export interface AudioLayer extends BaseLayer {
  type: 'audio';
  assetId: string;
  trimStart: number;
  trimEnd: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
}

export type Layer =
  | VideoLayer
  | ImageLayer
  | TextLayer
  | ShapeLayer
  | CalloutLayer
  | FrameLayer
  | AudioLayer;

export type LayerType = Layer['type'];

/* -------------------------------------------------------------------- scenes */

export type TransitionKind = 'none' | 'fade' | 'slide' | 'zoom' | 'blur' | 'wipe';

export interface Scene {
  id: string;
  name: string;
  duration: number;
  background: BackgroundSpec;
  layers: Layer[];
  transitionIn: { kind: TransitionKind; duration: number };
}

/* ------------------------------------------------------------------- project */

export interface ExportSettings {
  format: 'mp4' | 'webm' | 'gif' | 'png' | 'jpg';
  width: number;
  height: number;
  fps: number;
  /** Megabits per second for video formats. */
  bitrateMbps: number;
  quality: 'draft' | 'good' | 'high';
}

export interface Project {
  id: string;
  schemaVersion: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  canvas: Size;
  /** Frames per second the composition is authored at. */
  fps: number;
  background: BackgroundSpec;
  scenes: Scene[];
  assets: MediaAsset[];
  exportSettings: ExportSettings;
  /** Set when the project was seeded from the bundled demo. */
  isSample?: boolean;
  templateId?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  duration: number;
  thumbnail?: string;
  isSample?: boolean;
}

/* ----------------------------------------------------------------- templates */

export type TemplateCategory =
  | 'appDemo'
  | 'social'
  | 'showcase'
  | 'cinematic'
  | 'quick';

export interface TemplateTextSlot {
  /** Matches a `{{slot}}` marker inside a text layer's content. */
  key: string;
  label: string;
  placeholder: string;
}

/**
 * Templates are data, never components. A template produces scenes; the editor
 * merges any existing footage into the slot marked `isFootageSlot`.
 */
export interface TemplateDefinition {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  canvas: Size;
  aspectLabel: string;
  duration: number;
  fps: number;
  background: BackgroundSpec;
  accent: string;
  textSlots: TemplateTextSlot[];
  /** Builds the scenes. Receives the footage layer to place, when one exists. */
  build: (ctx: TemplateBuildContext) => Scene[];
}

export interface TemplateBuildContext {
  /** Existing footage carried over from the current project, if any. */
  footage?: VideoLayer;
  canvas: Size;
  values: Record<string, string>;
  makeId: () => string;
}
