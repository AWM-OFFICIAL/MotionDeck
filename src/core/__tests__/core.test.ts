import { describe, expect, it } from 'vitest';
import { clamp, cubicBezier, ease, lerp, springEase } from '../easing';
import {
  buildFocusPointsFromClicks,
  evaluateCamera,
  sampleCursor,
  smoothCursorPath,
} from '../camera';
import { createProject, createVideoLayer, defaultCamera } from '../defaults';
import type { CursorEvent, MediaAsset } from '../types';
import { resolveLayerTransform } from '../animation';
import { TEMPLATES, applyTemplate } from '../../library/templates';
import { autoDesign } from '../../library/autoDesign';

describe('easing', () => {
  it('clamps to the unit interval', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it('lerps linearly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(2, 8, 0)).toBe(2);
    expect(lerp(2, 8, 1)).toBe(8);
  });

  it('cubic bezier endpoints are exact', () => {
    const fn = cubicBezier(0.42, 0, 0.58, 1);
    expect(fn(0)).toBe(0);
    expect(fn(1)).toBe(1);
    expect(fn(0.5)).toBeGreaterThan(0.3);
    expect(fn(0.5)).toBeLessThan(0.7);
  });

  it('named easings are finite at sample points', () => {
    for (const name of ['easeIn', 'easeOut', 'easeInOut', 'spring', 'elastic', 'bounce'] as const) {
      for (let i = 0; i <= 20; i++) {
        const v = ease(name, i / 20);
        expect(Number.isFinite(v)).toBe(true);
      }
    }
    expect(ease('easeOut', 0)).toBe(0);
    expect(ease('easeOut', 1)).toBe(1);
  });

  it('spring settles at 1', () => {
    expect(springEase()(1)).toBe(1);
  });
});

describe('camera', () => {
  const events: CursorEvent[] = [
    { t: 0, x: 0.1, y: 0.2 },
    { t: 1, x: 0.5, y: 0.5 },
    { t: 2, x: 0.9, y: 0.8, down: true, button: 0 },
    { t: 3, x: 0.9, y: 0.8 },
  ];

  it('samples cursor between events', () => {
    const mid = sampleCursor(events, 0.5)!;
    expect(mid.x).toBeCloseTo(0.3, 5);
    expect(mid.y).toBeCloseTo(0.35, 5);
  });

  it('smoothCursorPath preserves clicks', () => {
    const smoothed = smoothCursorPath(events, 0.8);
    const click = smoothed.find((e) => e.down)!;
    expect(click.x).toBe(0.9);
    expect(click.y).toBe(0.8);
  });

  it('builds focus points from clicks', () => {
    const layer = createVideoLayer('a', { duration: 5 });
    const points = buildFocusPointsFromClicks(layer, events, { maxPoints: 4 });
    expect(points.length).toBeGreaterThan(0);
    expect(points[0].zoom).toBeGreaterThan(1);
  });

  it('followClicks zooms around a focus point', () => {
    const layer = createVideoLayer('a', { duration: 5 });
    const spec = {
      ...defaultCamera(),
      mode: 'followClicks' as const,
      focusPoints: [
        {
          id: 'f1',
          time: 1,
          x: 0.7,
          y: 0.3,
          zoom: 2,
          hold: 1,
          ramp: 0.4,
          easing: 'easeInOut' as const,
        },
      ],
    };
    layer.camera = spec;
    const state = evaluateCamera(spec, {
      time: 1.2,
      cursor: events,
      source: { width: 1920, height: 1080 },
    });
    expect(state.zoom).toBeGreaterThan(1.2);
    expect(state.x).toBeGreaterThan(0.55);
    expect(state.x).toBeLessThan(0.75);
  });

  it('remaps focus points from source space into the active crop', () => {
    const state = evaluateCamera(
      {
        mode: 'smoothFocus',
        zoom: 1.5,
        smoothing: 0.5,
        focusPoints: [
          {
            id: 'fp1',
            time: 0,
            x: 0.5, // mid of full source → mid of crop when crop is centred
            y: 0.5,
            zoom: 2,
            hold: 2,
            ramp: 0.1,
            easing: 'linear',
          },
        ],
      },
      {
        time: 0.5,
        cursor: [],
        source: { width: 1920, height: 1080 },
        crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 },
      },
    );
    expect(state.x).toBeCloseTo(0.5, 2);
    expect(state.y).toBeCloseTo(0.5, 2);
    expect(state.zoom).toBeCloseTo(2, 1);
  });
});

describe('animation', () => {
  it('fades a layer in on entrance', () => {
    const layer = createVideoLayer('a', { duration: 4 });
    layer.motion = {
      entrance: 'fade',
      exit: 'none',
      idle: 'none',
      feel: 'smooth',
      entranceDuration: 0.6,
      exitDuration: 0.4,
      intensity: 1,
    };
    const early = resolveLayerTransform(layer, 0.05, { canvasWidth: 1920, canvasHeight: 1080 });
    const late = resolveLayerTransform(layer, 0.8, { canvasWidth: 1920, canvasHeight: 1080 });
    expect(early.opacity).toBeLessThan(late.opacity);
    expect(late.opacity).toBeCloseTo(1, 1);
  });
});

describe('templates', () => {
  it('ships a non-empty library across categories', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(15);
    const cats = new Set(TEMPLATES.map((t) => t.category));
    expect(cats.has('appDemo')).toBe(true);
    expect(cats.has('social')).toBe(true);
    expect(cats.has('cinematic')).toBe(true);
  });

  it('applyTemplate produces scenes with content', () => {
    const template = TEMPLATES.find((t) => t.id === 'clean-app-demo')!;
    const base = createProject('Test', template.canvas);
    const result = applyTemplate(template, { scenes: base.scenes, canvas: base.canvas }, {
      title: 'Hello MotionDeck',
    });
    expect(result.scenes.length).toBeGreaterThan(0);
    const hasContent = result.scenes.some((s) => s.layers.length > 0);
    expect(hasContent).toBe(true);
  });
});

describe('autoDesign', () => {
  it('produces a polished video layer', () => {
    const layer = createVideoLayer('asset-1', { duration: 6 });
    const asset: MediaAsset = {
      id: 'asset-1',
      name: 'clip',
      kind: 'video',
      mimeType: 'video/webm',
      storageKey: 'k',
      byteSize: 1024,
      width: 1920,
      height: 1080,
      duration: 6,
      createdAt: Date.now(),
    };
    const result = autoDesign(layer, asset, { width: 1920, height: 1080 });
    expect(result.layer.cornerRadius).toBeGreaterThan(0);
    expect(result.layer.shadow.enabled).toBe(true);
    expect(result.background.type).not.toBe('transparent');
    expect(result.notes.length).toBeGreaterThan(0);
  });
});
