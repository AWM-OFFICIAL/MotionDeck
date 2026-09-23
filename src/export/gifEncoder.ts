/**
 * Minimal GIF89a encoder.
 *
 * Written inline rather than pulled from a dependency because the requirements are
 * narrow (fixed palette per frame, LZW, looping) and it avoids shipping a large,
 * unmaintained library into a desktop bundle.
 */

/** Median-cut colour quantisation down to `maxColors`. */
function quantize(pixels: Uint8ClampedArray, maxColors: number): { palette: number[][]; lookup: Map<number, number> } {
  interface Box {
    colors: number[][];
  }

  // Sample rather than reading every pixel: 1/4 of a 1080p frame is plenty to
  // build a stable palette and keeps encoding interactive.
  const sampled: number[][] = [];
  const stride = Math.max(4, Math.floor(pixels.length / 4 / 20000) * 4);
  for (let i = 0; i < pixels.length; i += stride) {
    sampled.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (sampled.length === 0) sampled.push([0, 0, 0]);

  let boxes: Box[] = [{ colors: sampled }];
  while (boxes.length < maxColors) {
    // Split the box with the widest channel range.
    let bestIndex = -1;
    let bestRange = -1;
    let bestChannel = 0;
    boxes.forEach((box, index) => {
      if (box.colors.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let min = 255;
        let max = 0;
        for (const color of box.colors) {
          if (color[c] < min) min = color[c];
          if (color[c] > max) max = color[c];
        }
        if (max - min > bestRange) {
          bestRange = max - min;
          bestIndex = index;
          bestChannel = c;
        }
      }
    });
    if (bestIndex === -1 || bestRange <= 0) break;

    const box = boxes[bestIndex];
    box.colors.sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = box.colors.length >> 1;
    boxes = [
      ...boxes.slice(0, bestIndex),
      { colors: box.colors.slice(0, mid) },
      { colors: box.colors.slice(mid) },
      ...boxes.slice(bestIndex + 1),
    ];
  }

  const palette = boxes.map((box) => {
    const sum = [0, 0, 0];
    for (const color of box.colors) {
      sum[0] += color[0];
      sum[1] += color[1];
      sum[2] += color[2];
    }
    const n = Math.max(1, box.colors.length);
    return [Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n)];
  });
  while (palette.length < 2) palette.push([0, 0, 0]);

  return { palette, lookup: new Map() };
}

function nearest(palette: number[][], lookup: Map<number, number>, r: number, g: number, b: number): number {
  // Quantise the cache key to 5 bits per channel — imperceptible, big speedup.
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  const hit = lookup.get(key);
  if (hit !== undefined) return hit;

  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = palette[i][0] - r;
    const dg = palette[i][1] - g;
    const db = palette[i][2] - b;
    const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  lookup.set(key, best);
  return best;
}

class ByteWriter {
  private parts: Uint8Array[] = [];
  private buf = new Uint8Array(8192);
  private len = 0;

  byte(v: number) {
    if (this.len === this.buf.length) this.flush();
    this.buf[this.len++] = v & 0xff;
  }

  bytes(values: number[] | Uint8Array) {
    for (const v of values) this.byte(v);
  }

  short(v: number) {
    this.byte(v & 0xff);
    this.byte((v >> 8) & 0xff);
  }

  string(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }

  private flush() {
    this.parts.push(this.buf.slice(0, this.len));
    this.buf = new Uint8Array(8192);
    this.len = 0;
  }

  toBlob(): Blob {
    this.flush();
    return new Blob(this.parts as BlobPart[], { type: 'image/gif' });
  }
}

/** LZW compression with the sub-block framing GIF requires. */
function lzwEncode(w: ByteWriter, indices: Uint8Array, minCodeSize: number) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let dict = new Map<string, number>();

  const block: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const emitBlock = () => {
    if (block.length === 0) return;
    w.byte(block.length);
    w.bytes(block);
    block.length = 0;
  };

  const writeCode = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      block.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
      if (block.length === 255) emitBlock();
    }
  };

  const resetDict = () => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  w.byte(minCodeSize);
  writeCode(clearCode);
  resetDict();

  let current = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const next = indices[i];
    const candidate = `${current},${next}`;
    if (dict.has(candidate)) {
      current = candidate;
      continue;
    }
    writeCode(current.includes(',') ? dict.get(current)! : Number(current));
    dict.set(candidate, nextCode++);
    if (nextCode > 1 << codeSize) {
      if (codeSize < 12) codeSize++;
      else {
        writeCode(clearCode);
        resetDict();
      }
    }
    current = String(next);
  }

  writeCode(current.includes(',') ? dict.get(current)! : Number(current));
  writeCode(eoiCode);

  if (bitCount > 0) {
    block.push(bitBuffer & 0xff);
    if (block.length === 255) emitBlock();
  }
  emitBlock();
  w.byte(0);
}

export class GifEncoder {
  private w = new ByteWriter();
  private started = false;

  constructor(
    private width: number,
    private height: number,
    private colors = 128,
  ) {}

  /** `delayMs` is rounded to GIF's 10ms resolution. */
  addFrame(data: ImageData, delayMs: number): void {
    if (!this.started) {
      this.writeHeader();
      this.started = true;
    }

    const { palette, lookup } = quantize(data.data, this.colors);
    const paletteBits = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))));
    const paletteSize = 1 << paletteBits;

    const pixels = data.data;
    const indices = new Uint8Array(this.width * this.height);
    for (let i = 0, p = 0; i < indices.length; i++, p += 4) {
      indices[i] = nearest(palette, lookup, pixels[p], pixels[p + 1], pixels[p + 2]);
    }

    // Graphic control extension
    this.w.bytes([0x21, 0xf9, 0x04, 0x00]);
    this.w.short(Math.max(2, Math.round(delayMs / 10)));
    this.w.bytes([0x00, 0x00]);

    // Image descriptor with a local colour table
    this.w.byte(0x2c);
    this.w.short(0);
    this.w.short(0);
    this.w.short(this.width);
    this.w.short(this.height);
    this.w.byte(0x80 | (paletteBits - 1));

    for (let i = 0; i < paletteSize; i++) {
      const c = palette[i] ?? [0, 0, 0];
      this.w.bytes(c);
    }

    lzwEncode(this.w, indices, Math.max(2, paletteBits));
  }

  finish(): Blob {
    if (!this.started) this.writeHeader();
    this.w.byte(0x3b);
    return this.w.toBlob();
  }

  private writeHeader() {
    this.w.string('GIF89a');
    this.w.short(this.width);
    this.w.short(this.height);
    this.w.bytes([0x70, 0x00, 0x00]);
    // Netscape looping extension
    this.w.bytes([0x21, 0xff, 0x0b]);
    this.w.string('NETSCAPE2.0');
    this.w.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);
  }
}
