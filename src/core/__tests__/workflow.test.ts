/**
 * Smoke: record → template → camera → export-path readiness.
 * Does not drive the UI; exercises the same data path a beginner workflow uses.
 */

import { describe, expect, it } from 'vitest';
import { createProject, createVideoLayer, defaultCamera } from '../defaults';
import { buildFocusPointsFromClicks } from '../camera';
import type { CursorEvent, MediaAsset, VideoLayer } from '../types';
import { TEMPLATES, applyTemplate } from '../../library/templates';
import { autoDesign } from '../../library/autoDesign';
import { estimateFileSize } from '../../export/exporter';

describe('beginner workflow smoke', () => {
  it('applies a template over imported footage and prepares focus + export', () => {
    const template = TEMPLATES.find((t) => t.id === 'clean-app-demo')!;
    const base = createProject('Smoke Demo', template.canvas);

    const layer = createVideoLayer('rec-1', { duration: 12 }) as VideoLayer;
    layer.trimEnd = 12;
    base.scenes[0].layers.push(layer);

    const asset: MediaAsset = {
      id: 'rec-1',
      kind: 'video',
      name: 'Recording',
      storageKey: 'smoke',
      mimeType: 'video/webm',
      byteSize: 1_000_000,
      duration: 12,
      width: 1920,
      height: 1080,
      createdAt: Date.now(),
      recording: {
        source: 'window',
        screen: { width: 1920, height: 1080 },
        cursor: [
          { t: 1.2, x: 0.3, y: 0.4, down: true, button: 0 },
          { t: 1.3, x: 0.3, y: 0.4 },
          { t: 4.1, x: 0.7, y: 0.55, down: true, button: 0 },
          { t: 4.2, x: 0.7, y: 0.55 },
        ] satisfies CursorEvent[],
        cursorCaptured: true,
        hasSystemAudio: false,
        hasMicrophone: false,
        fps: 30,
      },
    };
    base.assets.push(asset);

    const applied = applyTemplate(template, { scenes: base.scenes, canvas: base.canvas }, {
      title: 'Ship faster',
    });
    expect(applied.scenes.length).toBeGreaterThan(0);

    const video = applied.scenes
      .flatMap((s) => s.layers)
      .find((l): l is VideoLayer => l.type === 'video');
    expect(video).toBeTruthy();

    const designed = autoDesign(video!, asset, applied.canvas);
    expect(designed.layer.shadow.enabled).toBe(true);

    const points = buildFocusPointsFromClicks(designed.layer, asset.recording!.cursor);
    expect(points.length).toBeGreaterThan(0);
    designed.layer.camera = {
      ...defaultCamera(),
      mode: 'smoothFocus',
      focusPoints: points,
    };

    const est = estimateFileSize(
      { ...base.exportSettings, width: applied.canvas.width, height: applied.canvas.height, format: 'mp4' },
      12,
    );
    expect(est).toBeGreaterThan(100_000);
  });
});
