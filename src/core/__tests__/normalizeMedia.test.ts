import { describe, expect, it } from 'vitest';
import { canUseFfmpegWasm } from '../../platform/ffmpegWasm';
import { isExoticVideoContainer, formatImportError, UnsupportedMediaError } from '../../platform/normalizeMedia';

describe('in-app conversion helpers', () => {
  it('reports wasm availability in node test env', () => {
    // Vitest/node may or may not expose WebAssembly + Worker; just ensure the helper is callable.
    expect(typeof canUseFfmpegWasm()).toBe('boolean');
  });

  it('does not claim Desktop-only FFmpeg in import errors', () => {
    const msg = formatImportError(new Error('This video file could not be read.'), 'demo.mkv');
    expect(msg).toMatch(/in-app conversion|MP4/i);
    expect(msg).not.toMatch(/install FFmpeg and open MotionDeck Desktop/i);
  });

  it('surfaces too_large codes', () => {
    const err = new UnsupportedMediaError('File is too large for in-app conversion', 'too_large');
    expect(formatImportError(err, 'big.mkv')).toContain('too large');
  });

  it('still flags exotic containers', () => {
    expect(isExoticVideoContainer('a.mkv', '')).toBe(true);
    expect(isExoticVideoContainer('a.mp4', 'video/mp4')).toBe(false);
  });
});
