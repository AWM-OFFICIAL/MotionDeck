/**
 * Frame ↔ App Screen nesting helpers.
 *
 * When a FrameLayer has nestAppScreen + linkedLayerId, the video is drawn into
 * the frame's screenRect so bezels and footage stay locked even under independent
 * motion (local offsets still apply relative to the nest).
 */

import { resolveLayerTransform, type ResolvedTransform } from './animation';
import type { FrameLayer, Layer, Scene, Size, VideoLayer } from './types';
import { getFrame } from '../render/frames';

export function findNestHost(scene: Scene, videoId: string): FrameLayer | undefined {
  return scene.layers.find(
    (l): l is FrameLayer =>
      l.type === 'frame' &&
      l.linkedLayerId === videoId &&
      l.nestAppScreen !== false &&
      !!l.linkedLayerId,
  );
}

export function nestedVideoIds(scene: Scene, sceneTime: number): Set<string> {
  const ids = new Set<string>();
  for (const l of scene.layers) {
    if (l.type !== 'frame') continue;
    if (!l.linkedLayerId || l.nestAppScreen === false) continue;
    if (l.hidden) continue;
    if (sceneTime < l.start || sceneTime > l.start + l.duration) continue;
    ids.add(l.linkedLayerId);
  }
  return ids;
}

/** Screen rect of a frame in frame-local centred coordinates. */
export function frameScreenLocal(frame: FrameLayer): {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
} {
  const def = getFrame(frame.frame.kind);
  const w = frame.size.width;
  const h = frame.size.height;
  if (!def) {
    return { x: -w / 2, y: -h / 2, w, h, radius: Math.min(w, h) * 0.08 };
  }
  return {
    x: -w / 2 + w * def.screenRect.x,
    y: -h / 2 + h * def.screenRect.y,
    w: w * def.screenRect.width,
    h: h * def.screenRect.height,
    radius: w * def.screenRadius,
  };
}

/**
 * World-space centre offset (from canvas centre) for a nested app screen,
 * including the host frame transform and the screen-rect centre.
 */
export function nestedAppScreenWorld(
  host: FrameLayer,
  video: VideoLayer,
  sceneTime: number,
  canvas: Size,
): ResolvedTransform & { screenW: number; screenH: number; screenRadius: number } {
  const hostLocal = Math.max(0, sceneTime - host.start);
  const videoLocal = Math.max(0, sceneTime - video.start);
  const ht = resolveLayerTransform(host, hostLocal, {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  });
  const vt = resolveLayerTransform(video, videoLocal, {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  });
  const screen = frameScreenLocal(host);
  const screenCx = screen.x + screen.w / 2;
  const screenCy = screen.y + screen.h / 2;

  // Host places the frame; screen centre is offset in host-local space;
  // video's own x/y/scale/rotation act as *local nest offsets* (independent motion).
  const cos = Math.cos((ht.rotation * Math.PI) / 180);
  const sin = Math.sin((ht.rotation * Math.PI) / 180);
  const nestOx = (screenCx + vt.x) * ht.scale;
  const nestOy = (screenCy + vt.y) * ht.scale;
  const worldX = ht.x + nestOx * cos - nestOy * sin;
  const worldY = ht.y + nestOx * sin + nestOy * cos;

  return {
    x: worldX,
    y: worldY,
    scale: ht.scale * vt.scale,
    rotation: ht.rotation + vt.rotation,
    opacity: ht.opacity * vt.opacity,
    blur: ht.blur + vt.blur,
    cornerRadiusDelta: vt.cornerRadiusDelta,
    reveal: 1,
    screenW: screen.w,
    screenH: screen.h,
    screenRadius: screen.radius,
  };
}

export function isNestedAppScreen(layer: Layer, scene: Scene): boolean {
  return layer.type === 'video' && !!findNestHost(scene, layer.id);
}
