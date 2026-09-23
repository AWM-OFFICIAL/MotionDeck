import { describe, expect, it } from 'vitest';
import { cropAtTime, emptyCropTrack, upsertManualCropKeyframe } from '../cropTrack';
import { createVideoLayer } from '../defaults';
import { defaultAppScreen } from '../appScreen';
import { buildAutoTapPack, listDetectedInteractions } from '../../library/autoTap';

describe('crop tracking', () => {
  it('interpolates between manual crop keyframes', () => {
    const layer = createVideoLayer('a');
    layer.crop = { x: 0.2, y: 0.1, width: 0.4, height: 0.7 };
    let track = emptyCropTrack(layer.crop);
    track = upsertManualCropKeyframe(track, 0, { x: 0.1, y: 0.1, width: 0.4, height: 0.7 });
    track = upsertManualCropKeyframe(track, 2, { x: 0.3, y: 0.1, width: 0.4, height: 0.7 });
    layer.appScreen = defaultAppScreen({ enabled: true, cropTrack: track, trackingEnabled: true });
    const mid = cropAtTime(layer, 1);
    expect(mid.x).toBeGreaterThan(0.15);
    expect(mid.x).toBeLessThan(0.25);
  });

  it('falls back to static crop when track is idle', () => {
    const layer = createVideoLayer('a');
    layer.crop = { x: 0.2, y: 0.2, width: 0.5, height: 0.6 };
    layer.appScreen = defaultAppScreen({
      enabled: true,
      cropTrack: emptyCropTrack(layer.crop),
    });
    expect(cropAtTime(layer, 1.5)).toEqual(layer.crop);
  });
});

describe('auto tap', () => {
  it('builds tap layers from click events inside the crop', () => {
    const layer = createVideoLayer('a', { duration: 6 });
    layer.crop = { x: 0.3, y: 0.1, width: 0.4, height: 0.8 };
    layer.appScreen = defaultAppScreen({ enabled: true });
    const events = [
      { t: 0.5, x: 0.5, y: 0.4, down: true },
      { t: 1.5, x: 0.55, y: 0.5, down: true },
      { t: 2.0, x: 0.05, y: 0.05, down: true }, // outside crop
    ];
    const listed = listDetectedInteractions(layer, events);
    expect(listed.length).toBeGreaterThanOrEqual(1);
    const pack = buildAutoTapPack(layer, events, 'focus', { width: 400, height: 700 });
    expect(pack.layers.length).toBeGreaterThan(0);
    expect(pack.layers.every((l) => l.attachToLayerId === layer.id)).toBe(true);
    expect(pack.focusPoints.length).toBeGreaterThan(0);
  });
});
