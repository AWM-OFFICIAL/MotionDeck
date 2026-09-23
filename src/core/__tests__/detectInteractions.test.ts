import { describe, expect, it } from 'vitest';
import { detectTapsFromGrayFrames, imageDataToGray } from '../detectInteractions';
import { isExoticVideoContainer, formatImportError, UnsupportedMediaError } from '../../platform/normalizeMedia';

describe('detectTapsFromGrayFrames', () => {
  it('finds a localized flash as a tap', () => {
    const w = 40;
    const h = 40;
    const quiet = new Float32Array(w * h);
    quiet.fill(0.2);

    const flash = new Float32Array(quiet);
    // Bright spot in lower-right of crop
    for (let y = 28; y < 34; y++) {
      for (let x = 28; x < 34; x++) {
        flash[y * w + x] = 0.95;
      }
    }

    const events = detectTapsFromGrayFrames(
      [
        { t: 0.5, gray: quiet, width: w, height: h },
        { t: 0.7, gray: flash, width: w, height: h },
        { t: 0.9, gray: quiet, width: w, height: h },
      ],
      { x: 0, y: 0, width: 1, height: 1 },
      { maxTaps: 4, minGap: 0.3 },
    );

    const downs = events.filter((e) => e.down);
    expect(downs.length).toBeGreaterThanOrEqual(1);
    expect(downs[0].x).toBeGreaterThan(0.5);
    expect(downs[0].y).toBeGreaterThan(0.5);
  });

  it('ignores full-frame cuts', () => {
    const w = 32;
    const h = 32;
    const a = new Float32Array(w * h);
    a.fill(0.1);
    const b = new Float32Array(w * h);
    b.fill(0.9);

    const events = detectTapsFromGrayFrames(
      [
        { t: 1, gray: a, width: w, height: h },
        { t: 1.2, gray: b, width: w, height: h },
      ],
      undefined,
      { maxTaps: 4 },
    );
    expect(events.filter((e) => e.down)).toHaveLength(0);
  });

  it('imageDataToGray averages luminance', () => {
    const raw = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
    } as ImageData;
    const gray = imageDataToGray(raw);
    expect(gray[0]).toBeCloseTo(0.299, 2);
    expect(gray[1]).toBeCloseTo(0.587, 2);
  });
});

describe('normalize media helpers', () => {
  it('flags exotic containers', () => {
    expect(isExoticVideoContainer('clip.mkv', 'video/x-matroska')).toBe(true);
    expect(isExoticVideoContainer('clip.avi', 'video/avi')).toBe(true);
    expect(isExoticVideoContainer('clip.mp4', 'video/mp4')).toBe(false);
    expect(isExoticVideoContainer('clip.webm', 'video/webm')).toBe(false);
  });

  it('formats unsupported errors clearly', () => {
    const err = new UnsupportedMediaError('Convert to MP4', 'unsupported_container');
    expect(formatImportError(err, 'a.mkv')).toContain('Convert to MP4');
    expect(formatImportError(new Error('This video file could not be read.'), 'x.mp4')).toMatch(
      /MP4|convert|decode/i,
    );
  });
});
