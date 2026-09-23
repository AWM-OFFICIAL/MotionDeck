/**
 * Device mockups.
 *
 * Each frame declares its outer aspect ratio and where the screen sits inside it, in
 * normalised units. The compositor uses `screenRect` to place footage and then calls
 * `draw` to paint the chrome, so the footage and the frame can never drift apart.
 */

import type { DeviceFrame, Rect } from '../core/types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FrameDefinition {
  id: DeviceFrame;
  label: string;
  /** Aspect ratio the *screen area* must have; footage is letterboxed to fit. */
  screenAspect: number;
  /** Screen position within the frame, normalised to frame width/height. */
  screenRect: Rect;
  /** Frame outer aspect ratio (width / height). */
  outerAspect: number;
  /** Corner radius of the screen area, normalised to frame width. */
  screenRadius: number;
  draw: (ctx: Ctx, w: number, h: number, opts: { url?: string; dark?: boolean }) => void;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export { roundRect };

/* ------------------------------------------------------------------ browser */

function drawBrowser(ctx: Ctx, w: number, h: number, opts: { url?: string; dark?: boolean }) {
  const dark = opts.dark ?? true;
  const barH = h * BROWSER.screenRect.y;
  const radius = w * 0.016;

  ctx.fillStyle = dark ? '#1C1F26' : '#EDEFF3';
  roundRect(ctx, 0, 0, w, h, radius);
  ctx.fill();

  // Traffic lights
  const dotR = barH * 0.115;
  const dotY = barH * 0.5;
  const colors = ['#FF5F57', '#FEBC2E', '#28C840'];
  colors.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(barH * 0.62 + i * dotR * 3.1, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });

  // Address pill
  const pillX = barH * 3.3;
  const pillW = w - pillX - barH * 1.2;
  const pillH = barH * 0.52;
  ctx.fillStyle = dark ? '#0F1115' : '#FFFFFF';
  roundRect(ctx, pillX, dotY - pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();

  if (opts.url) {
    ctx.fillStyle = dark ? '#8A9099' : '#5B6068';
    ctx.font = `500 ${pillH * 0.46}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(opts.url, pillX + pillH * 0.6, dotY, pillW - pillH * 1.2);
  }
}

const BROWSER: FrameDefinition = {
  id: 'browser',
  label: 'Browser',
  screenAspect: 16 / 9,
  screenRect: { x: 0.006, y: 0.062, width: 0.988, height: 0.932 },
  outerAspect: 16 / 10,
  screenRadius: 0.008,
  draw: (ctx, w, h, opts) => drawBrowser(ctx, w, h, { ...opts, dark: false }),
};

const BROWSER_DARK: FrameDefinition = {
  ...BROWSER,
  id: 'browserDark',
  label: 'Browser (Dark)',
  draw: (ctx, w, h, opts) => drawBrowser(ctx, w, h, { ...opts, dark: true }),
};

/* -------------------------------------------------------------------- phone */

const PHONE: FrameDefinition = {
  id: 'phone',
  label: 'iPhone',
  screenAspect: 9 / 19.5,
  screenRect: { x: 0.038, y: 0.019, width: 0.924, height: 0.962 },
  outerAspect: 0.472,
  screenRadius: 0.1,
  draw: (ctx, w, h) => {
    const radius = w * 0.135;
    // Body
    ctx.fillStyle = '#0A0A0C';
    roundRect(ctx, 0, 0, w, h, radius);
    ctx.fill();
    // Rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(1, w * 0.006);
    roundRect(ctx, w * 0.003, h * 0.0015, w * 0.994, h * 0.997, radius);
    ctx.stroke();
    // Dynamic island
    const iw = w * 0.3;
    const ih = h * 0.0175;
    ctx.fillStyle = '#000000';
    roundRect(ctx, (w - iw) / 2, h * 0.028, iw, ih, ih / 2);
    ctx.fill();
  },
};

const PHONE_ANDROID: FrameDefinition = {
  ...PHONE,
  id: 'phoneAndroid',
  label: 'Android',
  screenRect: { x: 0.03, y: 0.015, width: 0.94, height: 0.97 },
  screenRadius: 0.07,
  draw: (ctx, w, h) => {
    const radius = w * 0.095;
    ctx.fillStyle = '#131416';
    roundRect(ctx, 0, 0, w, h, radius);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, w * 0.005);
    roundRect(ctx, w * 0.003, h * 0.0015, w * 0.994, h * 0.997, radius);
    ctx.stroke();
    // Punch-hole camera
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.033, w * 0.022, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
  },
};

/** Flat bezel without punch-hole — generic Android chrome. */
const PHONE_GENERIC: FrameDefinition = {
  ...PHONE_ANDROID,
  id: 'phoneGeneric',
  label: 'Generic Android',
  screenRect: { x: 0.04, y: 0.035, width: 0.92, height: 0.93 },
  screenRadius: 0.04,
  draw: (ctx, w, h) => {
    const radius = w * 0.08;
    ctx.fillStyle = '#1A1C20';
    roundRect(ctx, 0, 0, w, h, radius);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = Math.max(1, w * 0.0045);
    roundRect(ctx, w * 0.004, h * 0.002, w * 0.992, h * 0.996, radius);
    ctx.stroke();
    // Thin status strip
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(w * 0.04, h * 0.012, w * 0.92, h * 0.018);
  },
};

/* ------------------------------------------------------------------- laptop */

const LAPTOP: FrameDefinition = {
  id: 'laptop',
  label: 'MacBook',
  screenAspect: 16 / 10,
  screenRect: { x: 0.078, y: 0.032, width: 0.844, height: 0.826 },
  outerAspect: 1.44,
  screenRadius: 0.006,
  draw: (ctx, w, h) => {
    const lidH = h * 0.9;
    ctx.fillStyle = '#26282D';
    roundRect(ctx, w * 0.068, 0, w * 0.864, lidH, w * 0.016);
    ctx.fill();
    ctx.fillStyle = '#0B0C0E';
    roundRect(ctx, w * 0.074, h * 0.008, w * 0.852, lidH - h * 0.016, w * 0.012);
    ctx.fill();
    // Camera dot
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.019, w * 0.0035, 0, Math.PI * 2);
    ctx.fillStyle = '#1B1D21';
    ctx.fill();
    // Base
    const baseY = lidH;
    ctx.fillStyle = '#313338';
    roundRect(ctx, 0, baseY, w, h - baseY, h * 0.02);
    ctx.fill();
    // Notch in the base
    ctx.fillStyle = '#24262A';
    roundRect(ctx, w * 0.435, baseY, w * 0.13, (h - baseY) * 0.34, (h - baseY) * 0.17);
    ctx.fill();
  },
};

const DESKTOP: FrameDefinition = {
  id: 'desktop',
  label: 'Monitor',
  screenAspect: 16 / 9,
  screenRect: { x: 0.022, y: 0.022, width: 0.956, height: 0.79 },
  outerAspect: 1.36,
  screenRadius: 0.006,
  draw: (ctx, w, h) => {
    const panelH = h * 0.834;
    ctx.fillStyle = '#202227';
    roundRect(ctx, 0, 0, w, panelH, w * 0.012);
    ctx.fill();
    ctx.fillStyle = '#0A0B0D';
    roundRect(ctx, w * 0.016, h * 0.016, w * 0.968, panelH - h * 0.032, w * 0.006);
    ctx.fill();
    // Stand
    ctx.fillStyle = '#2A2C31';
    ctx.fillRect(w * 0.42, panelH, w * 0.16, h * 0.11);
    roundRect(ctx, w * 0.3, h * 0.955, w * 0.4, h * 0.045, h * 0.022);
    ctx.fill();
  },
};

export const FRAME_DEFINITIONS: Record<Exclude<DeviceFrame, 'none'>, FrameDefinition> = {
  browser: BROWSER,
  browserDark: BROWSER_DARK,
  phone: PHONE,
  phoneAndroid: PHONE_ANDROID,
  phoneGeneric: PHONE_GENERIC,
  laptop: LAPTOP,
  desktop: DESKTOP,
};

export const FRAME_OPTIONS: { id: DeviceFrame; label: string }[] = [
  { id: 'none', label: 'No Frame' },
  { id: 'phoneAndroid', label: 'Android Phone' },
  { id: 'phone', label: 'Pixel-style' },
  { id: 'phoneGeneric', label: 'Generic Android' },
  { id: 'browser', label: 'Browser' },
  { id: 'browserDark', label: 'Browser Dark' },
  { id: 'laptop', label: 'Laptop' },
  { id: 'desktop', label: 'Desktop' },
];

export const getFrame = (kind: DeviceFrame): FrameDefinition | null =>
  kind === 'none' ? null : (FRAME_DEFINITIONS[kind] ?? null);
