/**
 * Auto Tap packs — generate editable tap overlays + optional focus from click data.
 */

import { createCalloutLayer, defaultMotion } from '../core/defaults';
import { uid } from '../core/ids';
import { clicksInRange, pointInCrop } from '../core/camera';
import { cropAtTime } from '../core/cropTrack';
import type { CalloutLayer, CursorEvent, FocusPoint, Layer, Rect, VideoLayer } from '../core/types';

export type AutoTapPackId = 'minimal' | 'premium' | 'focus' | 'showcase';

export const AUTO_TAP_PACKS: {
  id: AutoTapPackId;
  label: string;
  description: string;
}[] = [
  { id: 'minimal', label: 'Minimal Tap', description: 'Small ripple only.' },
  { id: 'premium', label: 'Premium Tap', description: 'Ripple + subtle scale.' },
  { id: 'focus', label: 'Focus Tap', description: 'Ripple + camera focus.' },
  { id: 'showcase', label: 'Showcase Tap', description: 'Ripple + focus + highlight.' },
];

export interface DetectedInteraction {
  id: string;
  time: number;
  x: number;
  y: number;
  label: string;
}

function positionLabel(x: number, y: number, crop: Rect): string {
  const rx = (x - crop.x) / Math.max(crop.width, 1e-6);
  const ry = (y - crop.y) / Math.max(crop.height, 1e-6);
  const v = ry < 0.33 ? 'Upper' : ry > 0.66 ? 'Lower' : 'Mid';
  const h = rx < 0.33 ? 'left' : rx > 0.66 ? 'right' : 'centre';
  return `${v} ${h}`;
}

/** List click clusters inside the active crop for the Detected Interactions UI. */
export function listDetectedInteractions(
  layer: VideoLayer,
  events: CursorEvent[],
): DetectedInteraction[] {
  const clicks = clicksInRange(layer, events);
  const crop = cropAtTime(layer, 0);
  const inside = clicks.filter((c) => pointInCrop(c.x, c.y, crop));
  const clusters: DetectedInteraction[] = [];
  for (const c of inside) {
    const prev = clusters[clusters.length - 1];
    if (prev && c.t - prev.time < 1.4 && Math.hypot(c.x - prev.x, c.y - prev.y) < 0.1) {
      prev.time = (prev.time + c.t) / 2;
      prev.x = (prev.x + c.x) / 2;
      prev.y = (prev.y + c.y) / 2;
      continue;
    }
    const at = cropAtTime(layer, c.t);
    clusters.push({
      id: uid('ix'),
      time: c.t,
      x: c.x,
      y: c.y,
      label: positionLabel(c.x, c.y, at),
    });
  }
  return clusters.slice(0, 16);
}

function sourceToAppLocal(
  layer: VideoLayer,
  x: number,
  y: number,
  layoutW: number,
  layoutH: number,
  time: number,
): { x: number; y: number } {
  const crop = cropAtTime(layer, time);
  const rx = (x - crop.x) / Math.max(crop.width, 1e-6);
  const ry = (y - crop.y) / Math.max(crop.height, 1e-6);
  return {
    x: (rx - 0.5) * layoutW,
    y: (ry - 0.5) * layoutH,
  };
}

export interface AutoTapResult {
  layers: Layer[];
  focusPoints: FocusPoint[];
}

/** Build editable tap callouts (+ optional focus points) attached to the app screen. */
export function buildAutoTapPack(
  layer: VideoLayer,
  events: CursorEvent[],
  pack: AutoTapPackId,
  layoutSize: { width: number; height: number },
): AutoTapResult {
  const interactions = listDetectedInteractions(layer, events);
  const layers: CalloutLayer[] = [];
  const focusPoints: FocusPoint[] = [];

  for (const ix of interactions) {
    const local = sourceToAppLocal(layer, ix.x, ix.y, layoutSize.width, layoutSize.height, ix.time);
    const tap = createCalloutLayer('circle');
    tap.id = uid('ly');
    tap.name = `Tap · ${ix.label}`;
    tap.start = Math.max(0, layer.start + ix.time - 0.05);
    tap.duration = pack === 'minimal' ? 0.55 : 0.85;
    tap.attachToLayerId = layer.id;
    tap.position = local;
    tap.size = { width: pack === 'minimal' ? 56 : 72, height: pack === 'minimal' ? 56 : 72 };
    tap.color = '#22D3EE';
    tap.dim = 0;
    tap.pulse = true;
    tap.strokeWidth = pack === 'minimal' ? 2 : 2.5;
    tap.motion = {
      ...defaultMotion(),
      entrance: 'pop',
      entranceDuration: 0.25,
      exit: 'fade',
      exitDuration: 0.35,
      idle: pack === 'premium' || pack === 'showcase' ? 'punchIn' : 'none',
      intensity: 0.7,
      feel: 'snappy',
    };
    layers.push(tap);

    if (pack === 'showcase') {
      const hi = createCalloutLayer('highlight');
      hi.id = uid('ly');
      hi.name = `Highlight · ${ix.label}`;
      hi.start = tap.start;
      hi.duration = 1.1;
      hi.attachToLayerId = layer.id;
      hi.position = local;
      hi.size = { width: 140, height: 48 };
      hi.color = '#FFE066';
      hi.dim = 0.25;
      hi.pulse = false;
      hi.motion = {
        ...defaultMotion(),
        entrance: 'fade',
        entranceDuration: 0.2,
        exit: 'fade',
        exitDuration: 0.3,
        idle: 'none',
        intensity: 1,
        feel: 'smooth',
      };
      layers.push(hi);
    }

    if (pack === 'focus' || pack === 'showcase') {
      const crop = cropAtTime(layer, ix.time);
      const mapped = {
        x: (ix.x - crop.x) / Math.max(crop.width, 1e-6),
        y: (ix.y - crop.y) / Math.max(crop.height, 1e-6),
      };
      focusPoints.push({
        id: uid('fp'),
        time: ix.time,
        x: mapped.x,
        y: mapped.y,
        coordinateSpace: 'crop',
        zoom: 1.65,
        hold: 0.9,
        ramp: 0.55,
        easing: 'smooth',
        auto: true,
      });
    }
  }

  return { layers, focusPoints };
}

/** Manual tap at app-screen-relative canvas offset (already in parent space). */
export function createManualTap(
  appScreenId: string,
  position: { x: number; y: number },
  time: number,
  layerStart: number,
): CalloutLayer {
  const tap = createCalloutLayer('circle');
  tap.id = uid('ly');
  tap.name = 'Tap';
  tap.start = Math.max(0, layerStart + time);
  tap.duration = 0.7;
  tap.attachToLayerId = appScreenId;
  tap.position = position;
  tap.size = { width: 64, height: 64 };
  tap.color = '#22D3EE';
  tap.dim = 0;
  tap.pulse = true;
  tap.strokeWidth = 2.5;
  tap.motion = {
    ...defaultMotion(),
    entrance: 'pop',
    entranceDuration: 0.22,
    exit: 'fade',
    exitDuration: 0.3,
    idle: 'none',
    intensity: 1,
    feel: 'snappy',
  };
  return tap;
}
