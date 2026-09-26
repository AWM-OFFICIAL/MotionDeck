import { describe, expect, it } from 'vitest';
import { snapPosition } from '../../editor/snapGuides';
import {
  applyMotionPreset,
  MOTION_PRESETS,
  suggestMotion,
} from '../../library/motionPresets';
import { createTextLayer, createVideoLayer, defaultMotion } from '../defaults';
import { resolveLayerTransform } from '../animation';
import { aspectsClash, containRect, mediaSize, suggestedCanvas, usableDimension } from '../mediaLayout';
import { videoLayoutRect } from '../../render/compositor';

describe('snapPosition', () => {
  const canvas = { width: 1920, height: 1080 };

  it('snaps to canvas centre', () => {
    const result = snapPosition(3, -2, 100, 80, canvas, []);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.guides.length).toBeGreaterThan(0);
  });

  it('snaps to peer centres', () => {
    const peers = [
      { id: 'a', cx: 200, cy: 0, left: 100, right: 300, top: -40, bottom: 40 },
    ];
    const result = snapPosition(205, 4, 50, 40, canvas, peers);
    expect(result.x).toBe(200);
    expect(result.y).toBe(0);
  });

  it('can be disabled', () => {
    const result = snapPosition(3, 3, 10, 10, canvas, [], false);
    expect(result.x).toBe(3);
    expect(result.guides).toHaveLength(0);
  });
});

describe('motion presets', () => {
  it('covers entrance emphasis exit premium categories', () => {
    const cats = new Set(MOTION_PRESETS.map((p) => p.category));
    expect(cats.has('entrance')).toBe(true);
    expect(cats.has('emphasis')).toBe(true);
    expect(cats.has('exit')).toBe(true);
    expect(cats.has('premium')).toBe(true);
  });

  it('every preset patches implemented motion ids', () => {
    const layer = createTextLayer('Hi', 0, 3);
    for (const preset of MOTION_PRESETS) {
      const next = applyMotionPreset(defaultMotion(), preset);
      expect(next.entrance).toBeTruthy();
      expect(next.idle).toBeTruthy();
      expect(next.exit).toBeTruthy();
      const start = resolveLayerTransform(
        { ...layer, motion: next },
        0,
        { canvasWidth: 1920, canvasHeight: 1080 },
      );
      const mid = resolveLayerTransform(
        { ...layer, motion: next },
        0.4,
        { canvasWidth: 1920, canvasHeight: 1080 },
      );
      expect(Number.isFinite(start.opacity + start.scale + start.x + mid.opacity)).toBe(true);
    }
  });

  it('suggests product-demo presets for video', () => {
    const layer = createVideoLayer('asset', { duration: 5 });
    const suggested = suggestMotion(layer);
    expect(suggested.map((p) => p.id)).toContain('smoothZoom');
  });

  it('suggests rise/fade for text', () => {
    const suggested = suggestMotion(createTextLayer('Hello'));
    expect(suggested.length).toBe(3);
    expect(suggested[0].id).toBe('rise');
  });

  it('applyMotionPreset patches duration for entrances', () => {
    const preset = MOTION_PRESETS.find((p) => p.id === 'fade')!;
    const next = applyMotionPreset(defaultMotion(), preset, 1.2);
    expect(next.entrance).toBe('fade');
    expect(next.entranceDuration).toBe(1.2);
  });

  it('resolveLayerTransform animates fade entrance', () => {
    const layer = createTextLayer('Hi', 0, 3);
    layer.motion = applyMotionPreset(layer.motion, MOTION_PRESETS.find((p) => p.id === 'fade')!, 0.6);
    const start = resolveLayerTransform(layer, 0, { canvasWidth: 1920, canvasHeight: 1080 });
    const mid = resolveLayerTransform(layer, 0.3, { canvasWidth: 1920, canvasHeight: 1080 });
    const end = resolveLayerTransform(layer, 0.6, { canvasWidth: 1920, canvasHeight: 1080 });
    expect(start.opacity).toBeLessThan(mid.opacity);
    expect(mid.opacity).toBeLessThanOrEqual(end.opacity + 0.01);
    expect(end.opacity).toBeCloseTo(1, 1);
  });

  it('smooth zoom scales during idle', () => {
    const layer = createVideoLayer('a', { duration: 4 });
    layer.motion = applyMotionPreset(
      layer.motion,
      MOTION_PRESETS.find((p) => p.id === 'smoothZoom')!,
    );
    const a = resolveLayerTransform(layer, 0, { canvasWidth: 1920, canvasHeight: 1080 });
    const b = resolveLayerTransform(layer, 2, { canvasWidth: 1920, canvasHeight: 1080 });
    expect(b.scale).toBeGreaterThan(a.scale);
  });
});

describe('media layout', () => {
  it('treats 0 as missing metadata', () => {
    expect(usableDimension(0, undefined, 1920)).toBe(1920);
    expect(mediaSize({ width: 0, height: 0 }).width).toBe(1920);
    expect(mediaSize({ videoWidth: 1080, videoHeight: 1920, width: 0, height: 0 })).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it('letterboxes without stretching', () => {
    const box = containRect(1920, 1080, 400, 800);
    expect(box.w).toBe(400);
    expect(box.h).toBeCloseTo(225);
    expect(box.y).toBeGreaterThan(0);
  });

  it('picks a portrait canvas for phone recordings', () => {
    expect(suggestedCanvas(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(suggestedCanvas(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(aspectsClash({ width: 1920, height: 1080 }, { width: 1080, height: 1920 })).toBe(true);
  });

  it('lays out portrait footage as a tall box, not a 16:9 strip', () => {
    const layer = createVideoLayer('a', { duration: 4 });
    const zeroMeta = videoLayoutRect(layer, { width: 0, height: 0 } as never, { width: 1920, height: 1080 });
    const live = videoLayoutRect(
      layer,
      { width: 0, height: 0 } as never,
      { width: 1920, height: 1080 },
      { videoWidth: 1080, videoHeight: 1920 },
    );
    expect(live.frameH).toBeGreaterThan(live.frameW);
    expect(live.aspect).toBeCloseTo(1080 / 1920);
    expect(zeroMeta.aspect).toBeCloseTo(16 / 9);
  });
});
