/**
 * Imported videos are first-class VideoLayer clips — same transform, motion,
 * crop, camera, and overlay paths as MotionDeck-recorded footage.
 */

import { describe, expect, it } from 'vitest';
import { resolveLayerTransform } from '../animation';
import { defaultAppScreen } from '../appScreen';
import { buildFocusPointsFromClicks } from '../camera';
import {
  createCalloutLayer,
  createFrameLayer,
  createProject,
  createVideoLayer,
  defaultBorder,
  defaultCamera,
  defaultGlow,
  defaultMotion,
  defaultShadow,
} from '../defaults';
import type { MediaAsset, MotionSpec, VideoLayer } from '../types';
import { SCHEMA_VERSION } from '../types';
import { applyMotionPreset, MOTION_PRESETS } from '../../library/motionPresets';
import { createManualTap } from '../../library/autoTap';
import { emptyImportRecording, mediaSourceLabel } from '../../platform/mediaImport';

function importedAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  const width = overrides.width ?? 1280;
  const height = overrides.height ?? 720;
  return {
    id: 'imp-1',
    kind: 'video',
    name: 'obs-emulator.mp4',
    storageKey: 'imp-1.mp4',
    mimeType: 'video/mp4',
    byteSize: 2_000_000,
    duration: 8,
    width,
    height,
    frameRate: 30,
    createdAt: Date.now(),
    recording: emptyImportRecording({ width, height, fps: 30 }),
    ...overrides,
  };
}

describe('imported video as VideoClip', () => {
  it('seeds import recording metadata and labels source without gating features', () => {
    const asset = importedAsset();
    expect(asset.recording?.source).toBe('import');
    expect(asset.recording?.cursor).toEqual([]);
    expect(mediaSourceLabel(asset)).toBe('Imported');

    const layer = createVideoLayer(asset.id, { name: asset.name, duration: asset.duration });
    expect(layer.type).toBe('video');
    expect(layer.motion).toBeDefined();
    expect(layer.camera).toBeDefined();
    expect(layer.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(layer.shadow).toBeDefined();
  });

  it('applies the same animation presets as recorded clips', () => {
    const layer = createVideoLayer('imp-1', { duration: 6 });
    const fade = MOTION_PRESETS.find((p) => p.id === 'fade')!;
    const zoom = MOTION_PRESETS.find((p) => p.id === 'smoothZoom')!;
    layer.motion = applyMotionPreset(layer.motion, fade, 0.7);
    expect(layer.motion.entrance).not.toBe('none');

    layer.motion = applyMotionPreset(layer.motion, zoom, 0.8);
    const canvas = { canvasWidth: 1280, canvasHeight: 720 };
    const atEntrance = resolveLayerTransform(layer, 0.1, canvas);
    const mid = resolveLayerTransform(layer, 2, canvas);
    expect(atEntrance.opacity).toBeLessThan(1);
    expect(mid.opacity).toBeGreaterThan(0.9);
  });

  it('persists crop, transform, camera, and style through project serialization', () => {
    const asset = importedAsset();
    const project = createProject('Import parity', { width: 1280, height: 720 });
    project.schemaVersion = SCHEMA_VERSION;
    project.assets.push(asset);

    const layer = createVideoLayer(asset.id, { duration: 8 }) as VideoLayer;
    layer.crop = { x: 0.35, y: 0.12, width: 0.3, height: 0.7 };
    layer.appScreen = defaultAppScreen({ enabled: true, mode: 'androidPortrait' });
    layer.position = { x: 12, y: -8 };
    layer.scale = 0.88;
    layer.rotation = 2;
    layer.cornerRadius = 28;
    layer.shadow = { ...defaultShadow(), enabled: true, blur: 60 };
    layer.border = { ...defaultBorder(), enabled: true, style: 'soft' };
    layer.glow = { ...defaultGlow(), enabled: true };
    layer.motionBlur = 'medium';
    layer.motion = {
      ...defaultMotion(),
      entrance: 'floatIn',
      entranceDuration: 0.65,
      idle: 'smoothZoom',
    };
    layer.camera = {
      ...defaultCamera(),
      mode: 'smoothFocus',
      focusPoints: [
        {
          id: 'fp1',
          time: 1.2,
          x: 0.5,
          y: 0.4,
          coordinateSpace: 'crop',
          zoom: 1.6,
          hold: 0.8,
          ramp: 0.4,
          easing: 'smooth',
        },
      ],
    };
    project.scenes[0].layers.push(layer);

    const frame = createFrameLayer('phoneAndroid', {
      duration: 8,
      linkedLayerId: layer.id,
      name: 'Android Phone',
    });
    frame.nestAppScreen = true;
    project.scenes[0].layers.unshift(frame);

    const highlight = createCalloutLayer('highlight');
    highlight.attachToLayerId = layer.id;
    highlight.position = { x: 10, y: -40 };
    project.scenes[0].layers.push(highlight);

    const roundTrip = JSON.parse(JSON.stringify(project)) as typeof project;
    const restored = roundTrip.scenes[0].layers.find((l) => l.type === 'video') as VideoLayer;
    const restoredAsset = roundTrip.assets[0];
    const restoredOverlay = roundTrip.scenes[0].layers.find((l) => l.type === 'callout');

    expect(restoredAsset.recording?.source).toBe('import');
    expect(restored.crop.width).toBeCloseTo(0.3);
    expect(restored.scale).toBe(0.88);
    expect(restored.motion.idle).toBe('smoothZoom');
    expect(restored.camera.mode).toBe('smoothFocus');
    expect(restored.camera.focusPoints).toHaveLength(1);
    expect(restored.border?.enabled).toBe(true);
    expect(restored.glow?.enabled).toBe(true);
    expect(restored.motionBlur).toBe('medium');
    expect(restoredOverlay?.attachToLayerId).toBe(layer.id);
    expect(roundTrip.scenes[0].layers.some((l) => l.type === 'frame')).toBe(true);
  });

  it('supports manual interactions when import has no cursor metadata', () => {
    const asset = importedAsset();
    const layer = createVideoLayer(asset.id, { duration: 5 });
    expect(asset.recording?.cursor.length).toBe(0);

    const tap = createManualTap(layer.id, { x: 0, y: 20 }, 1.5, layer.start);
    expect(tap.attachToLayerId).toBe(layer.id);
    expect(tap.start).toBeCloseTo(1.5);

    // After Mark path, focus-from-clicks works the same as recorded clips.
    const withClicks: MediaAsset = {
      ...asset,
      recording: {
        ...asset.recording!,
        cursor: [
          { t: 1, x: 0.5, y: 0.4, down: true },
          { t: 1.1, x: 0.5, y: 0.4 },
        ],
        cursorCaptured: true,
      },
    };
    const points = buildFocusPointsFromClicks(layer, withClicks.recording!.cursor);
    expect(points.length).toBeGreaterThan(0);
  });

  it('Copy Motion clipboard fields are source-agnostic', () => {
    const recorded = createVideoLayer('rec', { duration: 4 });
    recorded.motion = applyMotionPreset(recorded.motion, MOTION_PRESETS.find((p) => p.id === 'pop')!, 0.5);
    recorded.cornerRadius = 24;
    recorded.shadow = { ...defaultShadow(), blur: 90 };

    const imported = createVideoLayer('imp', { duration: 4 });
    const clipboard: {
      motion: MotionSpec;
      shadow: VideoLayer['shadow'];
      cornerRadius: number;
    } = {
      motion: { ...recorded.motion },
      shadow: { ...recorded.shadow },
      cornerRadius: recorded.cornerRadius,
    };
    imported.motion = { ...clipboard.motion };
    imported.shadow = { ...clipboard.shadow };
    imported.cornerRadius = clipboard.cornerRadius;

    expect(imported.motion.entrance).toBe(recorded.motion.entrance);
    expect(imported.cornerRadius).toBe(24);
    expect(imported.shadow.blur).toBe(90);
  });
});
