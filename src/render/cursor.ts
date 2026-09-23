/**
 * Cursor rendering and click effects.
 *
 * Drawn on top of the footage in canvas space so the cursor stays crisp at any zoom,
 * unlike the low-resolution cursor baked into the source recording.
 */

import { clamp } from '../core/easing';
import type { CursorEvent, CursorSpec } from '../core/types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Standard macOS-style arrow, drawn as a path so it scales cleanly. */
function drawArrow(ctx: Ctx, size: number) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, size * 0.76);
  ctx.lineTo(size * 0.2, size * 0.58);
  ctx.lineTo(size * 0.33, size * 0.9);
  ctx.lineTo(size * 0.47, size * 0.84);
  ctx.lineTo(size * 0.34, size * 0.53);
  ctx.lineTo(size * 0.57, size * 0.52);
  ctx.closePath();
}

export interface CursorDrawContext {
  /** Canvas-space pixel position of the cursor. */
  x: number;
  y: number;
  /** Seconds since the most recent click, or null when there has been none. */
  sinceClick: number | null;
  /** Scale factor from source pixels to canvas pixels; keeps the cursor proportionate. */
  displayScale: number;
}

const CLICK_DURATION = 0.62;

export function drawCursor(ctx: Ctx, spec: CursorSpec, c: CursorDrawContext): void {
  if (spec.style === 'hidden') return;

  // Cursor size is anchored to a 22px system cursor and kept readable when the
  // camera is zoomed in.
  const base = 26 * spec.size * clamp(c.displayScale, 0.55, 2.2);

  ctx.save();
  ctx.translate(c.x, c.y);

  // Ambient highlight behind the pointer
  if (spec.style === 'highlight' || spec.style === 'softCircle') {
    const r = spec.highlightRadius * spec.size * clamp(c.displayScale, 0.55, 2.2);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const soft = spec.style === 'softCircle';
    grad.addColorStop(0, withAlpha(spec.highlightColor, soft ? 0.34 : 0.5));
    grad.addColorStop(soft ? 0.55 : 0.72, withAlpha(spec.highlightColor, soft ? 0.14 : 0.22));
    grad.addColorStop(1, withAlpha(spec.highlightColor, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }

  drawClickEffect(ctx, spec, c, base);

  if (spec.style === 'dot') {
    if (spec.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = base * 0.4;
      ctx.shadowOffsetY = base * 0.1;
    }
    ctx.beginPath();
    ctx.arc(0, 0, base * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = base * 0.07;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.stroke();
  } else {
    if (spec.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = base * 0.35;
      ctx.shadowOffsetY = base * 0.09;
    }
    drawArrow(ctx, base);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = base * 0.055;
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.stroke();
  }

  ctx.restore();
}

function drawClickEffect(ctx: Ctx, spec: CursorSpec, c: CursorDrawContext, base: number): void {
  if (spec.click === 'none' || c.sinceClick === null) return;
  const p = c.sinceClick / CLICK_DURATION;
  if (p < 0 || p > 1) return;

  const eased = 1 - Math.pow(1 - p, 3);
  const scale = clamp(c.displayScale, 0.55, 2.2);

  ctx.save();
  switch (spec.click) {
    case 'ripple': {
      const r = base * (0.4 + eased * 2.6);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(spec.clickColor, (1 - eased) * 0.85);
      ctx.lineWidth = base * 0.16 * (1 - eased * 0.6);
      ctx.stroke();
      break;
    }
    case 'pulse': {
      const r = base * (1.6 - eased * 0.5);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, withAlpha(spec.clickColor, (1 - eased) * 0.6));
      grad.addColorStop(1, withAlpha(spec.clickColor, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ring': {
      // Two staggered rings read better than one at speed.
      for (const delay of [0, 0.22]) {
        const rp = clamp((p - delay) / (1 - delay), 0, 1);
        if (rp <= 0) continue;
        const re = 1 - Math.pow(1 - rp, 3);
        ctx.beginPath();
        ctx.arc(0, 0, base * (0.35 + re * 2.1), 0, Math.PI * 2);
        ctx.strokeStyle = withAlpha(spec.clickColor, (1 - re) * 0.7);
        ctx.lineWidth = base * 0.1;
        ctx.stroke();
      }
      break;
    }
    case 'shockwave': {
      const r = base * (0.3 + eased * 3.4);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(spec.clickColor, (1 - eased) * 0.5);
      ctx.lineWidth = base * 0.45 * (1 - eased);
      ctx.stroke();
      break;
    }
    case 'highlight': {
      const r = base * 1.5 * scale;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(spec.clickColor, (1 - eased) * 0.35);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Seconds since the last click at or before `t`, or null when out of range. */
export function timeSinceClick(events: CursorEvent[], t: number): number | null {
  let best: number | null = null;
  for (const e of events) {
    if (!e.down) continue;
    if (e.t > t) break;
    best = t - e.t;
  }
  return best !== null && best <= CLICK_DURATION ? best : null;
}

export function withAlpha(color: string, alpha: number): string {
  const a = clamp(alpha, 0, 1);
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : hex.slice(0, 6);
    const num = parseInt(full, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${a})`;
  }
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
  return color;
}

export const CURSOR_STYLE_OPTIONS: { id: CursorSpec['style']; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'softCircle', label: 'Soft Circle' },
  { id: 'dot', label: 'Dot' },
  { id: 'hidden', label: 'Hidden' },
];

export const CLICK_EFFECT_OPTIONS: { id: CursorSpec['click']; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'ripple', label: 'Ripple' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'ring', label: 'Ring' },
  { id: 'shockwave', label: 'Shockwave' },
  { id: 'highlight', label: 'Highlight' },
];
