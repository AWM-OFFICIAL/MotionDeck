import type { BackgroundSpec, Size } from '../core/types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Deterministic PRNG so mesh gradients look identical in preview and export. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawBackground(ctx: Ctx, spec: BackgroundSpec, size: Size): void {
  const { width, height } = size;

  switch (spec.type) {
    case 'transparent':
      return;

    case 'solid':
      ctx.fillStyle = spec.color;
      ctx.fillRect(0, 0, width, height);
      return;

    case 'gradient': {
      const rad = (spec.angle * Math.PI) / 180;
      // Project the gradient axis onto the canvas so the angle reads correctly
      // regardless of aspect ratio.
      const len = Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad));
      const cx = width / 2;
      const cy = height / 2;
      const dx = (Math.cos(rad) * len) / 2;
      const dy = (Math.sin(rad) * len) / 2;
      const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      grad.addColorStop(0, spec.from);
      grad.addColorStop(1, spec.to);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      return;
    }

    case 'mesh': {
      ctx.fillStyle = spec.colors[0];
      ctx.fillRect(0, 0, width, height);
      const rng = mulberry32(spec.seed);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < spec.colors.length; i++) {
        const x = (0.2 + rng() * 0.6) * width;
        const y = (0.15 + rng() * 0.7) * height;
        const r = (0.35 + rng() * 0.45) * Math.max(width, height);
        const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
        blob.addColorStop(0, spec.colors[i]);
        blob.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = blob;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
      return;
    }

    case 'image':
    case 'dynamic':
      // Both need the layer's own media, so the compositor draws them. Fill with a
      // neutral base first so a missing asset never shows through as garbage.
      ctx.fillStyle = '#0B0F14';
      ctx.fillRect(0, 0, width, height);
      return;
  }
}

export interface BackgroundPreset {
  id: string;
  label: string;
  spec: BackgroundSpec;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'midnight', label: 'Midnight', spec: { type: 'gradient', from: '#1B2735', to: '#0B0F14', angle: 135 } },
  { id: 'charcoal', label: 'Charcoal', spec: { type: 'solid', color: '#16181D' } },
  { id: 'paper', label: 'Paper', spec: { type: 'solid', color: '#F4F4F5' } },
  { id: 'aurora', label: 'Aurora', spec: { type: 'gradient', from: '#0EA5E9', to: '#6366F1', angle: 120 } },
  { id: 'sunset', label: 'Sunset', spec: { type: 'gradient', from: '#F97316', to: '#DB2777', angle: 150 } },
  { id: 'mint', label: 'Mint', spec: { type: 'gradient', from: '#34D399', to: '#0E7490', angle: 140 } },
  {
    id: 'meshCool',
    label: 'Mesh Cool',
    spec: { type: 'mesh', colors: ['#0B0F14', '#1E3A8A', '#0891B2', '#4C1D95'], seed: 7 },
  },
  {
    id: 'meshWarm',
    label: 'Mesh Warm',
    spec: { type: 'mesh', colors: ['#140B0B', '#7C2D12', '#BE185D', '#4C1D95'], seed: 21 },
  },
  { id: 'dynamic', label: 'Dynamic', spec: { type: 'dynamic', blur: 60, scale: 1.35, brightness: 0.55 } },
  { id: 'transparent', label: 'Transparent', spec: { type: 'transparent' } },
];
