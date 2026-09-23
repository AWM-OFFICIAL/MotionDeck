/**
 * Canvas snap guides — centre, edges, and peer layer centres.
 * Pure helpers so the drag loop never re-renders React for geometry.
 */

import type { Layer, Size } from '../core/types';

export interface GuideLine {
  axis: 'x' | 'y';
  /** Canvas-space coordinate of the guide. */
  at: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: GuideLine[];
}

const THRESHOLD = 8;

export interface LayerBox {
  id: string;
  cx: number;
  cy: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Snap a layer centre (canvas coords relative to canvas centre = 0,0) toward guides. */
export function snapPosition(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  canvas: Size,
  peers: LayerBox[],
  enabled = true,
): SnapResult {
  if (!enabled) return { x, y, guides: [] };

  const guides: GuideLine[] = [];
  let sx = x;
  let sy = y;

  const targetsX = [0, -canvas.width / 2 + halfW, canvas.width / 2 - halfW];
  const targetsY = [0, -canvas.height / 2 + halfH, canvas.height / 2 - halfH];

  for (const peer of peers) {
    targetsX.push(peer.cx, peer.left + halfW, peer.right - halfW);
    targetsY.push(peer.cy, peer.top + halfH, peer.bottom - halfH);
  }

  let bestDx = THRESHOLD + 1;
  let bestX = x;
  let guideX: number | null = null;
  for (const t of targetsX) {
    const d = Math.abs(x - t);
    if (d < bestDx) {
      bestDx = d;
      bestX = t;
      guideX = t;
    }
  }
  if (bestDx <= THRESHOLD && guideX !== null) {
    sx = bestX;
    guides.push({ axis: 'x', at: canvas.width / 2 + guideX });
  }

  let bestDy = THRESHOLD + 1;
  let bestY = y;
  let guideY: number | null = null;
  for (const t of targetsY) {
    const d = Math.abs(y - t);
    if (d < bestDy) {
      bestDy = d;
      bestY = t;
      guideY = t;
    }
  }
  if (bestDy <= THRESHOLD && guideY !== null) {
    sy = bestY;
    guides.push({ axis: 'y', at: canvas.height / 2 + guideY });
  }

  return { x: sx, y: sy, guides };
}

export function layerBoxFromBounds(
  layer: Layer,
  _canvas: Size,
  w: number,
  h: number,
): LayerBox {
  const cx = layer.position.x;
  const cy = layer.position.y;
  return {
    id: layer.id,
    cx,
    cy,
    left: cx - w / 2,
    right: cx + w / 2,
    top: cy - h / 2,
    bottom: cy + h / 2,
  };
}
