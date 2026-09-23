/**
 * Motion presets — beginner vocabulary + Animate library.
 *
 * Each preset is a partial `MotionSpec` patch so applying one never clobbers
 * unrelated settings. Library categories map to how beginners think:
 * Entrance → Emphasis → Exit → Premium.
 */

import type {
  EntrancePreset,
  ExitPreset,
  IdlePreset,
  Layer,
  LayerType,
  MotionSpec,
  MovementFeel,
} from '../core/types';

export type MotionLibraryCategory = 'entrance' | 'emphasis' | 'exit' | 'premium';

export interface MotionPreset {
  id: string;
  label: string;
  /** Legacy chip groups in the inspector. */
  group: 'basic' | 'smooth' | 'cinematic' | 'energetic';
  /** Animate-library category. */
  category: MotionLibraryCategory;
  description: string;
  patch: Partial<MotionSpec>;
  /** Tiny CSS preview hint for the library card. */
  preview: 'fade' | 'rise' | 'slide' | 'scale' | 'pop' | 'blur' | 'float' | 'zoom' | 'pulse' | 'shake';
}

export const MOTION_PRESETS: MotionPreset[] = [
  // —— Entrance ——
  { id: 'none', label: 'None', group: 'basic', category: 'entrance', description: 'No movement.', patch: { entrance: 'none', exit: 'none', idle: 'none' }, preview: 'fade' },
  { id: 'fade', label: 'Fade In', group: 'basic', category: 'entrance', description: 'Smooth opacity fade.', patch: { entrance: 'fade', entranceDuration: 0.6, feel: 'smooth' }, preview: 'fade' },
  { id: 'rise', label: 'Rise', group: 'basic', category: 'entrance', description: 'Rises into place while fading in.', patch: { entrance: 'floatIn', entranceDuration: 0.7, feel: 'smooth' }, preview: 'rise' },
  { id: 'slideUp', label: 'Slide Up', group: 'basic', category: 'entrance', description: 'Smooth vertical entrance.', patch: { entrance: 'slideUp', entranceDuration: 0.55, feel: 'smooth' }, preview: 'slide' },
  { id: 'slideDown', label: 'Slide Down', group: 'basic', category: 'entrance', description: 'Enters from above.', patch: { entrance: 'slideDown', entranceDuration: 0.55, feel: 'smooth' }, preview: 'slide' },
  { id: 'slideLeft', label: 'Slide Left', group: 'basic', category: 'entrance', description: 'Enters from the right.', patch: { entrance: 'slideLeft', entranceDuration: 0.55, feel: 'smooth' }, preview: 'slide' },
  { id: 'slideRight', label: 'Slide Right', group: 'basic', category: 'entrance', description: 'Enters from the left.', patch: { entrance: 'slideRight', entranceDuration: 0.55, feel: 'smooth' }, preview: 'slide' },
  { id: 'scale', label: 'Scale In', group: 'basic', category: 'entrance', description: 'Grows gently into view.', patch: { entrance: 'scale', entranceDuration: 0.55, feel: 'smooth' }, preview: 'scale' },
  { id: 'pop', label: 'Pop', group: 'basic', category: 'entrance', description: 'Quick spring entrance.', patch: { entrance: 'pop', entranceDuration: 0.4, feel: 'snappy' }, preview: 'pop' },
  { id: 'blurIn', label: 'Blur In', group: 'smooth', category: 'entrance', description: 'Resolves from soft focus.', patch: { entrance: 'blurIn', entranceDuration: 0.8, feel: 'cinematic' }, preview: 'blur' },
  { id: 'floatIn', label: 'Float In', group: 'smooth', category: 'entrance', description: 'Soft upward settle.', patch: { entrance: 'floatIn', entranceDuration: 0.85, feel: 'smooth' }, preview: 'float' },
  { id: 'reveal', label: 'Reveal', group: 'smooth', category: 'entrance', description: 'Clean masked reveal.', patch: { entrance: 'reveal', entranceDuration: 0.7, feel: 'smooth' }, preview: 'scale' },

  // —— Emphasis (idle) ——
  { id: 'pulse', label: 'Pulse', group: 'energetic', category: 'emphasis', description: 'Subtle scale pulse.', patch: { idle: 'pulse', intensity: 1, feel: 'smooth' }, preview: 'pulse' },
  { id: 'float', label: 'Float', group: 'smooth', category: 'emphasis', description: 'Gentle vertical hover.', patch: { idle: 'float', intensity: 1, feel: 'smooth' }, preview: 'float' },
  { id: 'breathe', label: 'Breathe', group: 'smooth', category: 'emphasis', description: 'Very soft scale/opacity.', patch: { idle: 'breathe', intensity: 0.9, feel: 'smooth' }, preview: 'pulse' },
  { id: 'glow', label: 'Glow', group: 'cinematic', category: 'emphasis', description: 'Temporary soft glow.', patch: { idle: 'glow', intensity: 1, feel: 'cinematic' }, preview: 'blur' },
  { id: 'shake', label: 'Shake', group: 'energetic', category: 'emphasis', description: 'Short controlled shake.', patch: { idle: 'shake', intensity: 0.8, feel: 'snappy' }, preview: 'shake' },
  { id: 'bounce', label: 'Bounce', group: 'energetic', category: 'emphasis', description: 'Premium spring bounce.', patch: { idle: 'bounce', intensity: 0.9, feel: 'elastic' }, preview: 'pop' },
  { id: 'punch', label: 'Punch', group: 'energetic', category: 'emphasis', description: 'Brief scale emphasis.', patch: { idle: 'punchIn', intensity: 1.1, feel: 'snappy' }, preview: 'pop' },
  { id: 'highlight', label: 'Highlight', group: 'smooth', category: 'emphasis', description: 'Draws attention without moving much.', patch: { idle: 'highlight', intensity: 1, feel: 'smooth' }, preview: 'pulse' },

  // —— Exit ——
  { id: 'fadeOut', label: 'Fade Out', group: 'basic', category: 'exit', description: 'Smooth opacity fade.', patch: { exit: 'fade', exitDuration: 0.5, feel: 'smooth' }, preview: 'fade' },
  { id: 'drop', label: 'Drop', group: 'basic', category: 'exit', description: 'Drops gently while fading.', patch: { exit: 'slideDown', exitDuration: 0.55, feel: 'smooth' }, preview: 'slide' },
  { id: 'exitSlideUp', label: 'Slide Up', group: 'basic', category: 'exit', description: 'Exits upward.', patch: { exit: 'slideUp', exitDuration: 0.5, feel: 'smooth' }, preview: 'slide' },
  { id: 'exitSlideDown', label: 'Slide Down', group: 'basic', category: 'exit', description: 'Exits downward.', patch: { exit: 'slideDown', exitDuration: 0.5, feel: 'smooth' }, preview: 'slide' },
  { id: 'exitSlideLeft', label: 'Slide Left', group: 'basic', category: 'exit', description: 'Exits to the left.', patch: { exit: 'slideLeft', exitDuration: 0.5, feel: 'smooth' }, preview: 'slide' },
  { id: 'exitSlideRight', label: 'Slide Right', group: 'basic', category: 'exit', description: 'Exits to the right.', patch: { exit: 'slideRight', exitDuration: 0.5, feel: 'smooth' }, preview: 'slide' },
  { id: 'scaleOut', label: 'Scale Out', group: 'basic', category: 'exit', description: 'Shrinks away.', patch: { exit: 'scaleDown', exitDuration: 0.45, feel: 'smooth' }, preview: 'scale' },
  { id: 'blurOut', label: 'Blur Out', group: 'smooth', category: 'exit', description: 'Softens out of focus.', patch: { exit: 'blurOut', exitDuration: 0.55, feel: 'cinematic' }, preview: 'blur' },
  { id: 'softDisappear', label: 'Soft Disappear', group: 'smooth', category: 'exit', description: 'Quiet exit.', patch: { exit: 'softDisappear', exitDuration: 0.6, feel: 'smooth' }, preview: 'fade' },

  // —— Premium / product-demo packs ——
  { id: 'smoothZoom', label: 'Smooth Zoom', group: 'smooth', category: 'premium', description: 'Slow even push in.', patch: { entrance: 'fade', idle: 'smoothZoom', intensity: 1, feel: 'smooth' }, preview: 'zoom' },
  { id: 'cinematicZoom', label: 'Cinematic', group: 'cinematic', category: 'premium', description: 'Slow scale + pan.', patch: { entrance: 'blurIn', idle: 'cinematic', intensity: 1, feel: 'cinematic' }, preview: 'zoom' },
  { id: 'depth', label: 'Focus', group: 'cinematic', category: 'premium', description: 'Racks into sharp focus.', patch: { entrance: 'blurIn', entranceDuration: 1.0, idle: 'none', feel: 'cinematic' }, preview: 'blur' },
  { id: 'slowPush', label: 'Push', group: 'cinematic', category: 'premium', description: 'Steady creep toward the viewer.', patch: { entrance: 'fade', idle: 'slowPush', intensity: 0.85, feel: 'cinematic' }, preview: 'zoom' },
  { id: 'pullBack', label: 'Pull Back', group: 'cinematic', category: 'premium', description: 'Enters large, settles back.', patch: { entrance: 'scale', entranceDuration: 1.1, idle: 'none', feel: 'cinematic' }, preview: 'scale' },
  { id: 'uiShowcase', label: 'UI Showcase', group: 'smooth', category: 'premium', description: 'Small scale-up with presence.', patch: { entrance: 'reveal', idle: 'breathe', intensity: 0.7, feel: 'smooth' }, preview: 'scale' },
  { id: 'featureReveal', label: 'Feature Reveal', group: 'smooth', category: 'premium', description: 'Rise + soft hold.', patch: { entrance: 'floatIn', entranceDuration: 0.75, idle: 'highlight', intensity: 0.8, feel: 'smooth' }, preview: 'rise' },
  { id: 'quickZoom', label: 'Dynamic Focus', group: 'energetic', category: 'premium', description: 'Fast zoom that holds.', patch: { entrance: 'fade', entranceDuration: 0.25, idle: 'punchIn', intensity: 1.35, feel: 'snappy' }, preview: 'zoom' },

  // —— Mobile / Android app screen ——
  { id: 'appRise', label: 'App Rise', group: 'smooth', category: 'premium', description: 'App screen rises in with a soft fade.', patch: { entrance: 'floatIn', entranceDuration: 0.8, exit: 'fade', intensity: 0.9, feel: 'smooth' }, preview: 'rise' },
  { id: 'smoothMobileZoom', label: 'Smooth Mobile Zoom', group: 'smooth', category: 'premium', description: 'Gentle zoom toward the app UI.', patch: { entrance: 'fade', idle: 'smoothZoom', intensity: 0.85, feel: 'smooth' }, preview: 'zoom' },
  { id: 'featurePush', label: 'Feature Push', group: 'cinematic', category: 'premium', description: 'Subtle push toward a feature.', patch: { entrance: 'fade', idle: 'slowPush', intensity: 0.75, feel: 'cinematic' }, preview: 'zoom' },
  { id: 'mobileFloat', label: 'Mobile Float', group: 'smooth', category: 'emphasis', description: 'Very subtle floating motion.', patch: { idle: 'float', intensity: 0.5, feel: 'smooth' }, preview: 'float' },
  { id: 'cinematicApp', label: 'Cinematic App', group: 'cinematic', category: 'premium', description: 'Slow professional app showcase.', patch: { entrance: 'blurIn', entranceDuration: 1, idle: 'cinematic', intensity: 0.9, feel: 'cinematic' }, preview: 'zoom' },
  { id: 'appReveal', label: 'App Reveal', group: 'smooth', category: 'entrance', description: 'Masked reveal of the app screen.', patch: { entrance: 'reveal', entranceDuration: 0.75, feel: 'smooth' }, preview: 'scale' },
  { id: 'snapIn', label: 'Snap In', group: 'energetic', category: 'entrance', description: 'Fast but controlled entrance.', patch: { entrance: 'pop', entranceDuration: 0.38, feel: 'snappy' }, preview: 'pop' },
  { id: 'softPop', label: 'Soft Pop', group: 'smooth', category: 'entrance', description: 'Small spring settle.', patch: { entrance: 'pop', entranceDuration: 0.5, intensity: 0.7, feel: 'elastic' }, preview: 'pop' },
];

export const MOTION_GROUPS: { id: MotionPreset['group']; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'smooth', label: 'Smooth' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'energetic', label: 'Energetic' },
];

export const LIBRARY_CATEGORIES: { id: MotionLibraryCategory; label: string }[] = [
  { id: 'entrance', label: 'Entrance' },
  { id: 'emphasis', label: 'Emphasis' },
  { id: 'exit', label: 'Exit' },
  { id: 'premium', label: 'Premium' },
];

export const ENTRANCE_OPTIONS: { id: EntrancePreset; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slideUp', label: 'Slide Up' },
  { id: 'slideDown', label: 'Slide Down' },
  { id: 'slideLeft', label: 'Slide Left' },
  { id: 'slideRight', label: 'Slide Right' },
  { id: 'scale', label: 'Scale' },
  { id: 'pop', label: 'Pop' },
  { id: 'blurIn', label: 'Blur In' },
  { id: 'floatIn', label: 'Float In' },
  { id: 'reveal', label: 'Reveal' },
];

export const EXIT_OPTIONS: { id: ExitPreset; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slideUp', label: 'Slide Up' },
  { id: 'slideDown', label: 'Slide Down' },
  { id: 'slideLeft', label: 'Slide Left' },
  { id: 'slideRight', label: 'Slide Right' },
  { id: 'scaleDown', label: 'Scale Down' },
  { id: 'blurOut', label: 'Blur Out' },
  { id: 'softDisappear', label: 'Soft Disappear' },
];

export const IDLE_OPTIONS: { id: IdlePreset; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'smoothZoom', label: 'Smooth Zoom' },
  { id: 'punchIn', label: 'Punch In' },
  { id: 'float', label: 'Float' },
  { id: 'drift', label: 'Drift' },
  { id: 'slowPush', label: 'Slow Push' },
  { id: 'slide', label: 'Slide' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'breathe', label: 'Breathe' },
  { id: 'glow', label: 'Glow' },
  { id: 'shake', label: 'Shake' },
  { id: 'highlight', label: 'Highlight' },
];

export const FEEL_OPTIONS: { id: MovementFeel; label: string }[] = [
  { id: 'smooth', label: 'Smooth' },
  { id: 'snappy', label: 'Snappy' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'elastic', label: 'Spring' },
];

export const DURATION_PRESETS = [0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0] as const;

export function matchMotionPreset(motion: MotionSpec): string | null {
  for (const preset of MOTION_PRESETS) {
    const p = preset.patch;
    const same =
      (p.entrance === undefined || p.entrance === motion.entrance) &&
      (p.exit === undefined || p.exit === motion.exit) &&
      (p.idle === undefined || p.idle === motion.idle) &&
      (p.feel === undefined || p.feel === motion.feel);
    if (same) return preset.id;
  }
  return null;
}

/** Deterministic “Suggest Motion” — three presets by element type. */
export function suggestMotion(layer: Layer): MotionPreset[] {
  const byId = (ids: string[]) =>
    ids.map((id) => MOTION_PRESETS.find((p) => p.id === id)!).filter(Boolean);

  const map: Partial<Record<LayerType, string[]>> = {
    video: ['smoothMobileZoom', 'cinematicApp', 'appRise', 'smoothZoom', 'uiShowcase'],
    image: ['reveal', 'floatIn', 'fade'],
    text: ['rise', 'fade', 'pop'],
    shape: ['scale', 'fade', 'pulse'],
    callout: ['reveal', 'slideUp', 'highlight'],
    audio: ['fade'],
  };
  return byId(map[layer.type] ?? ['fade', 'rise', 'pop']);
}

export function applyMotionPreset(motion: MotionSpec, preset: MotionPreset, duration?: number): MotionSpec {
  const next = { ...motion, ...preset.patch };
  if (duration !== undefined) {
    if (preset.category === 'entrance' || preset.patch.entrance) next.entranceDuration = duration;
    if (preset.category === 'exit' || preset.patch.exit) next.exitDuration = duration;
  }
  return next;
}

export const TEXT_COPY_PRESETS = [
  'Introducing',
  'New Feature',
  'Built for speed',
  'Made simple',
  "Here's how it works",
  'Try it free',
  'Ship faster',
  'One click. Done.',
];

/* ------------------------------------------------------------------ local prefs */

const FAV_KEY = 'motiondeck.motionFavorites';
const RECENT_KEY = 'motiondeck.motionRecent';

export function loadFavoriteMotions(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function toggleFavoriteMotion(id: string): string[] {
  const current = loadFavoriteMotions();
  const next = current.includes(id) ? current.filter((x) => x !== id) : [id, ...current].slice(0, 24);
  localStorage.setItem(FAV_KEY, JSON.stringify(next));
  return next;
}

export function loadRecentMotions(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function pushRecentMotion(id: string): string[] {
  const next = [id, ...loadRecentMotions().filter((x) => x !== id)].slice(0, 12);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}
