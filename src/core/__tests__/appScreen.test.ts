import { describe, expect, it } from 'vitest';
import {
  APP_SCREEN_ASPECTS,
  centeredAspectCrop,
  detectAppScreenFromImageData,
  effectiveCrop,
  lockCropToAspect,
  normalizeCrop,
  defaultAppScreen,
} from '../appScreen';
import { createVideoLayer } from '../defaults';

describe('app screen crop', () => {
  it('normalises and locks crop aspect without escaping the frame', () => {
    const locked = lockCropToAspect({ x: 0.1, y: 0.05, width: 0.9, height: 0.9 }, 9 / 16);
    expect(locked.x).toBeGreaterThanOrEqual(0);
    expect(locked.y).toBeGreaterThanOrEqual(0);
    expect(locked.x + locked.width).toBeLessThanOrEqual(1.0001);
    expect(locked.y + locked.height).toBeLessThanOrEqual(1.0001);
    expect(locked.width / locked.height).toBeCloseTo(9 / 16, 2);
  });

  it('centres an Android portrait preset inside the source', () => {
    const crop = centeredAspectCrop(APP_SCREEN_ASPECTS.androidPortrait);
    expect(crop.width).toBeLessThan(1);
    expect(crop.height).toBeLessThan(1);
    expect(Math.abs(crop.x - (1 - crop.width) / 2)).toBeLessThan(0.02);
  });

  it('effectiveCrop expands when animateFullRecording is on', () => {
    const layer = createVideoLayer('a1');
    layer.crop = { x: 0.2, y: 0.1, width: 0.4, height: 0.7 };
    layer.appScreen = defaultAppScreen({ enabled: true, animateFullRecording: true });
    expect(effectiveCrop(layer)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    layer.appScreen.animateFullRecording = false;
    expect(effectiveCrop(layer).width).toBeCloseTo(0.4);
  });

  it('detects a bright portrait phone rectangle on a dark desktop', () => {
    const w = 160;
    const h = 90;
    const pixels = new Uint8ClampedArray(w * h * 4);
    // Dark desktop
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 18;
      pixels[i + 1] = 20;
      pixels[i + 2] = 24;
      pixels[i + 3] = 255;
    }
    // Bright phone screen in the centre (portrait)
    const left = 60;
    const right = 100;
    const top = 8;
    const bottom = 82;
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const o = (y * w + x) * 4;
        pixels[o] = 220;
        pixels[o + 1] = 230;
        pixels[o + 2] = 240;
      }
    }
    const data = { width: w, height: h, data: pixels } as ImageData;
    const result = detectAppScreenFromImageData(data);
    expect(result).not.toBeNull();
    // Synthetic frames vary by sampling; require a tighter-than-full crop that stays portrait.
    expect(result!.crop.width).toBeLessThan(0.7);
    expect(result!.crop.height).toBeGreaterThan(0.35);
    expect(result!.crop.width / result!.crop.height).toBeLessThan(0.9);
    expect(result!.confidence).toBeGreaterThan(0.3);
  });

  it('keeps nearly full crop for a full-bleed portrait recording', () => {
    const w = 90;
    const h = 160;
    const pixels = new Uint8ClampedArray(w * h * 4);
    // Bright app UI filling the frame (no desktop chrome)
    for (let i = 0; i < pixels.length; i += 4) {
      const y = Math.floor(i / 4 / w);
      pixels[i] = 200 + (y % 40);
      pixels[i + 1] = 210;
      pixels[i + 2] = 220;
      pixels[i + 3] = 255;
    }
    // Darker side rail to tempt densest-span into a narrow column
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < 8; x++) {
        const o = (y * w + x) * 4;
        pixels[o] = 40;
        pixels[o + 1] = 42;
        pixels[o + 2] = 48;
      }
    }
    const data = { width: w, height: h, data: pixels } as ImageData;
    const result = detectAppScreenFromImageData(data);
    expect(result).not.toBeNull();
    expect(result!.crop.width).toBeGreaterThan(0.7);
    expect(result!.crop.height).toBeGreaterThan(0.7);
  });

  it('keeps normalizeCrop within bounds', () => {
    const crop = normalizeCrop({ x: -0.2, y: 0.9, width: 1.4, height: 0.5 });
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y + crop.height).toBeLessThanOrEqual(1.0001);
  });
});
