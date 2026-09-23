import { describe, expect, it } from 'vitest';
import { createFrameLayer, createScene, createVideoLayer } from '../defaults';
import { findNestHost, frameScreenLocal, nestedAppScreenWorld, nestedVideoIds } from '../frameNest';
import { motionPathSamples, peakVelocity, shouldMotionBlur } from '../../render/motionBlur';
import { listDetectedInteractions } from '../../library/autoTap';
import { defaultAppScreen } from '../appScreen';

describe('frame nest', () => {
  it('reports nested video ids when nestAppScreen is on', () => {
    const video = createVideoLayer('a', { duration: 6 });
    const frame = createFrameLayer('phoneAndroid', { linkedLayerId: video.id, duration: 6 });
    frame.nestAppScreen = true;
    const scene = createScene('s', 6);
    scene.layers = [frame, video];
    expect(nestedVideoIds(scene, 1).has(video.id)).toBe(true);
    expect(findNestHost(scene, video.id)?.id).toBe(frame.id);
  });

  it('disables nesting when nestAppScreen is false', () => {
    const video = createVideoLayer('a', { duration: 6 });
    const frame = createFrameLayer('phoneAndroid', { linkedLayerId: video.id, duration: 6 });
    frame.nestAppScreen = false;
    const scene = createScene('s', 6);
    scene.layers = [frame, video];
    expect(nestedVideoIds(scene, 1).size).toBe(0);
  });

  it('keeps screen local rect inside the frame', () => {
    const frame = createFrameLayer('phoneAndroid', { duration: 6 });
    frame.size = { width: 400, height: 800 };
    const screen = frameScreenLocal(frame);
    expect(screen.w).toBeLessThan(frame.size.width);
    expect(screen.h).toBeLessThan(frame.size.height);
    expect(screen.x).toBeGreaterThan(-frame.size.width / 2);
  });

  it('places nested app screen at the host screen centre', () => {
    const video = createVideoLayer('a', { duration: 6 });
    video.position = { x: 0, y: 0 };
    const frame = createFrameLayer('phoneAndroid', { linkedLayerId: video.id, duration: 6 });
    frame.position = { x: 40, y: -20 };
    frame.nestAppScreen = true;
    const world = nestedAppScreenWorld(frame, video, 1, { width: 1280, height: 720 });
    const screen = frameScreenLocal(frame);
    // World centre ≈ frame position + rotated screen centre
    expect(Math.abs(world.x - (frame.position.x + screen.x + screen.w / 2))).toBeLessThan(1);
    expect(Math.abs(world.y - (frame.position.y + screen.y + screen.h / 2))).toBeLessThan(1);
  });
});

describe('motion blur path', () => {
  it('skips text layers', () => {
    const video = createVideoLayer('a');
    video.motionBlur = 'high';
    expect(shouldMotionBlur(video)).toBe(true);
  });

  it('builds shutter samples with rising weights', () => {
    const layer = createVideoLayer('a', { duration: 4 });
    layer.motionBlur = 'medium';
    layer.motion = {
      ...layer.motion,
      entrance: 'slideUp',
      entranceDuration: 1,
      idle: 'smoothZoom',
      intensity: 1.2,
    };
    const samples = motionPathSamples(layer, 0.4, { width: 1280, height: 720 }, 'medium');
    expect(samples.length).toBeGreaterThan(3);
    expect(samples[samples.length - 1].weight).toBeGreaterThan(samples[0].weight);
    expect(peakVelocity(samples, 0.55)).toBeGreaterThan(0);
  });
});

describe('interaction labels', () => {
  it('uses crop-relative position labels instead of Tap N', () => {
    const layer = createVideoLayer('a', { duration: 6 });
    layer.crop = { x: 0.3, y: 0.1, width: 0.4, height: 0.8 };
    layer.appScreen = defaultAppScreen({ enabled: true });
    const events = [
      { t: 0.5, x: 0.5, y: 0.2, down: true },
      { t: 1.5, x: 0.5, y: 0.75, down: true },
    ];
    const listed = listDetectedInteractions(layer, events);
    expect(listed[0].label).toMatch(/Upper|Mid|Lower/);
    expect(listed[0].label).not.toMatch(/^Tap \d+$/);
  });
});
