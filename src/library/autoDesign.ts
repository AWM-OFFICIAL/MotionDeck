/**
 * "Make It Beautiful" — one-click composition.
 *
 * Inspects the footage (aspect ratio, length, whether cursor data exists) and picks a
 * composition that suits it, rather than applying a fixed look. This is the feature
 * that makes MotionDeck useful to someone who has never opened a motion tool.
 */

import { buildFocusPointsFromClicks } from '../core/camera';
import { defaultBorder, defaultGlow, defaultShadow } from '../core/defaults';
import { mediaSize } from '../core/mediaLayout';
import type { BackgroundSpec, MediaAsset, Size, VideoLayer } from '../core/types';

export interface AutoDesignResult {
  layer: VideoLayer;
  background: BackgroundSpec;
  notes: string[];
}

const DARK_STAGE: BackgroundSpec = { type: 'gradient', from: '#1B2735', to: '#0B0F14', angle: 135 };
const MESH_STAGE: BackgroundSpec = {
  type: 'mesh',
  colors: ['#0B0F14', '#1E3A8A', '#0891B2', '#4C1D95'],
  seed: 7,
};

/**
 * Chooses and applies the composition. Pure — returns a new layer rather than
 * mutating, so the caller controls the history entry.
 */
export function autoDesign(
  layer: VideoLayer,
  asset: MediaAsset | undefined,
  canvas: Size,
): AutoDesignResult {
  const notes: string[] = [];
  const next: VideoLayer = JSON.parse(JSON.stringify(layer));

  const src = mediaSize(asset);
  const srcW = src.width;
  const srcH = src.height;
  const sourceAspect = srcW / Math.max(srcH, 1);
  const canvasAspect = canvas.width / canvas.height;
  const portraitSource = sourceAspect < 0.85;
  const cursor = asset?.recording?.cursor ?? [];
  const clicks = cursor.filter((e) => e.down);

  /* ---------------------------------------------------------- framing */

  if (portraitSource && canvas.width > canvas.height * 1.1) {
    next.frame = { kind: 'phoneAndroid' };
    notes.push('Wrapped the portrait recording in an Android phone frame');
  } else if (Math.abs(sourceAspect - 16 / 9) < 0.14) {
    // Same treatment for MotionDeck window captures and imported 16:9 demos.
    next.frame = { kind: 'browserDark', url: next.frame.url ?? 'app.example.com' };
    notes.push('Added a browser frame');
  } else {
    next.frame = { kind: 'none', url: next.frame.url };
  }

  next.autoFit = true;
  next.scale = canvasAspect > 1.4 && portraitSource ? 0.9 : 0.92;
  next.rotation = 0;
  next.position = { x: 0, y: 0 };
  // Clear effects that can hide footage if left over from earlier experiments.
  next.glow = defaultGlow();
  next.motionBlur = 'off';
  next.border = defaultBorder();

  /* ------------------------------------------------------ surface look */

  next.cornerRadius = next.frame.kind === 'none' ? 20 : 12;
  next.shadow = { ...defaultShadow(), blur: 120, y: 40, opacity: 0.52 };
  notes.push('Rounded the corners and added a soft shadow');

  /* -------------------------------------------------------- background */

  // Calm stage — a loud mesh behind an invisible entrance frame looks like a
  // broken glow. Portrait phone recordings get a soft dark wash instead.
  const background: BackgroundSpec = portraitSource
    ? { type: 'gradient', from: '#151B24', to: '#0B0F14', angle: 160 }
    : DARK_STAGE;
  next.background = { type: 'transparent' };

  /* ------------------------------------------------------------ motion */

  const clipLength = next.duration;
  if (clipLength > 18) {
    next.motion = {
      entrance: 'fade',
      entranceDuration: 0.7,
      exit: 'fade',
      exitDuration: 0.7,
      idle: 'slowPush',
      intensity: 0.35,
      feel: 'cinematic',
    };
    notes.push('Added a slow cinematic push for the long recording');
  } else if (clipLength < 6) {
    next.motion = {
      entrance: 'fade',
      entranceDuration: 0.4,
      exit: 'fade',
      exitDuration: 0.35,
      idle: 'punchIn',
      intensity: 0.8,
      feel: 'snappy',
    };
    notes.push('Added a snappy entrance to suit the short clip');
  } else {
    next.motion = {
      entrance: 'fade',
      entranceDuration: 0.55,
      exit: 'fade',
      exitDuration: 0.5,
      idle: 'smoothZoom',
      intensity: 0.55,
      feel: 'smooth',
    };
    notes.push('Added a smooth fade-in and gentle zoom');
  }

  /* ------------------------------------------------------------ camera */

  if (clicks.length >= 2) {
    const points = buildFocusPointsFromClicks(next, cursor, {
      zoom: portraitSource ? 1.45 : 1.75,
      hold: clipLength > 20 ? 1.4 : 1.1,
      ramp: 0.7,
    });
    next.camera = { mode: 'smoothFocus', zoom: 1.6, smoothing: 0.65, focusPoints: points };
    notes.push(`Created ${points.length} automatic camera move${points.length === 1 ? '' : 's'} from your clicks`);
  } else if (cursor.length > 8) {
    next.camera = { mode: 'dynamic', zoom: 1.35, smoothing: 0.75, focusPoints: [] };
    notes.push('Set the camera to follow your cursor');
  } else {
    next.camera = { mode: 'none', zoom: 1.4, smoothing: 0.6, focusPoints: [] };
  }

  /* ------------------------------------------------------------ cursor */

  if (cursor.length > 0) {
    next.cursor = {
      style: 'softCircle',
      size: 1.05,
      smoothing: 0.65,
      shadow: true,
      highlightColor: '#FFE066',
      highlightRadius: 48,
      click: 'ripple',
      clickColor: '#22D3EE',
    };
    notes.push('Smoothed the cursor and added click ripples');
  } else {
    // Without a cursor log there is nothing to draw — keep controls ready for Mark path.
    next.cursor = { ...next.cursor, style: 'hidden' };
    if ((asset?.recording?.cursor.length ?? 0) === 0) {
      notes.push('No click data — use Mark path or Pick point to add focus and taps');
    }
  }

  return { layer: next, background, notes };
}

/* ------------------------------------------------- preset compositions */

export interface CompositionPreset {
  id: string;
  name: string;
  description: string;
  apply: (layer: VideoLayer, canvas: Size) => { layer: VideoLayer; background?: BackgroundSpec };
}

const clone = (l: VideoLayer): VideoLayer => JSON.parse(JSON.stringify(l));

export const COMPOSITION_PRESETS: CompositionPreset[] = [
  {
    id: 'floating-app',
    name: 'Floating App',
    description: 'Recording floating above a clean background.',
    apply: (layer) => {
      const l = clone(layer);
      l.frame = { kind: 'none', url: l.frame.url };
      l.cornerRadius = 22;
      l.scale = 0.88;
      l.shadow = { ...defaultShadow(), blur: 130, y: 46, opacity: 0.55 };
      l.motion = { entrance: 'scale', entranceDuration: 0.8, exit: 'fade', exitDuration: 0.5, idle: 'float', intensity: 0.6, feel: 'smooth' };
      return { layer: l, background: DARK_STAGE };
    },
  },
  {
    id: 'browser-showcase',
    name: 'Browser Showcase',
    description: 'Inside a browser frame with clicks driving the camera.',
    apply: (layer) => {
      const l = clone(layer);
      l.frame = { kind: 'browserDark', url: l.frame.url ?? 'app.example.com' };
      l.cornerRadius = 12;
      l.scale = 1;
      l.camera = { ...l.camera, mode: 'followClicks', zoom: 1.7 };
      l.motion = { entrance: 'slideUp', entranceDuration: 0.8, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'smooth' };
      return { layer: l, background: MESH_STAGE };
    },
  },
  {
    id: 'phone-showcase',
    name: 'Phone Showcase',
    description: 'Mobile recording inside a phone, gently floating.',
    apply: (layer) => {
      const l = clone(layer);
      l.frame = { kind: 'phoneAndroid' };
      l.scale = 1;
      l.motion = { entrance: 'slideUp', entranceDuration: 0.9, exit: 'fade', exitDuration: 0.5, idle: 'float', intensity: 0.7, feel: 'smooth' };
      return { layer: l, background: { type: 'gradient', from: '#312E81', to: '#0B0F14', angle: 160 } };
    },
  },
  {
    id: 'cinematic-app',
    name: 'Cinematic App',
    description: 'Large window, deep shadow, slow camera, near-black stage.',
    apply: (layer) => {
      const l = clone(layer);
      l.frame = { kind: 'none', url: l.frame.url };
      l.scale = 1;
      l.cornerRadius = 14;
      l.shadow = { enabled: true, blur: 200, y: 80, opacity: 0.85, color: '#000000', spread: 0 };
      l.camera = { ...l.camera, mode: 'smoothFocus', zoom: 1.3, smoothing: 0.85 };
      l.motion = { entrance: 'blurIn', entranceDuration: 1.5, exit: 'blurOut', exitDuration: 1, idle: 'cinematic', intensity: 0.7, feel: 'cinematic' };
      return { layer: l, background: { type: 'solid', color: '#050507' } };
    },
  },
  {
    id: 'feature-focus',
    name: 'Feature Focus',
    description: 'Automatic zoom toward whatever you clicked.',
    apply: (layer) => {
      const l = clone(layer);
      l.camera = { ...l.camera, mode: 'smoothFocus', zoom: 1.8, smoothing: 0.55 };
      l.cursor = { ...l.cursor, style: 'highlight', click: 'ring' };
      l.motion = { ...l.motion, entrance: 'fade', idle: 'none' };
      return { layer: l };
    },
  },
  {
    id: 'split-screen',
    name: 'Split Screen',
    description: 'Recording on the right, room for text on the left.',
    apply: (layer, canvas) => {
      const l = clone(layer);
      l.scale = 0.58;
      l.position = { x: canvas.width * 0.21, y: 0 };
      l.cornerRadius = 16;
      l.motion = { entrance: 'slideLeft', entranceDuration: 0.8, exit: 'fade', exitDuration: 0.5, idle: 'none', intensity: 1, feel: 'smooth' };
      return { layer: l, background: { type: 'solid', color: '#0B0F14' } };
    },
  },
];
