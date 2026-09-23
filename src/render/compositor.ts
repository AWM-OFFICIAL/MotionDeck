/**
 * Scene compositor.
 *
 * One pure function draws a scene at a given time. Preview and export both call it,
 * which is what guarantees "what you see is what you export". The only difference
 * between the two is where the video frames come from (`FrameProvider`).
 */

import { clamp, ease, lerp } from '../core/easing';
import { isLayerActive, resolveLayerTransform } from '../core/animation';
import { evaluateCamera, sampleCursor, smoothCursorPath } from '../core/camera';
import { containRect, mediaSize } from '../core/mediaLayout';
import {
  findNestHost,
  frameScreenLocal,
  nestedAppScreenWorld,
  nestedVideoIds,
} from '../core/frameNest';
import type {
  BorderSpec,
  CalloutLayer,
  CursorEvent,
  FrameLayer,
  GlowSpec,
  ImageLayer,
  Layer,
  MediaAsset,
  Project,
  Scene,
  ShapeLayer,
  Size,
  TextLayer,
  VideoLayer,
} from '../core/types';
import { drawBackground } from './background';
import { drawCursor, timeSinceClick, withAlpha } from './cursor';
import { cropAtTime } from '../core/cropTrack';
import { getFrame, roundRect } from './frames';
import { motionBlurConfig, motionPathSamples, peakVelocity, shouldMotionBlur } from './motionBlur';

type Ctx = CanvasRenderingContext2D;

export type FrameImage = CanvasImageSource & { width?: number; height?: number };

/** Supplies decoded frames for a layer at a specific source time. */
export interface FrameProvider {
  getFrame(layer: VideoLayer, sourceTime: number): FrameImage | null;
  getImage(assetId: string): FrameImage | null;
  getAsset(assetId: string): MediaAsset | undefined;
}

export interface RenderOptions {
  /** Draw selection handles and focus-point markers. Preview only. */
  overlays?: { selectedLayerId?: string | null; showSafeArea?: boolean };
  /** Disables time-varying idle motion for users who prefer reduced motion. */
  reducedMotion?: boolean;
}

/* ------------------------------------------------------------- cursor cache */

// Smoothing a 30-minute cursor log is expensive; cache per (asset, amount).
const smoothCache = new Map<string, CursorEvent[]>();

export function getSmoothedCursor(asset: MediaAsset | undefined, amount: number): CursorEvent[] {
  const events = asset?.recording?.cursor;
  if (!events || events.length === 0) return [];
  if (amount <= 0.001) return events;
  const key = `${asset.id}:${amount.toFixed(2)}`;
  const hit = smoothCache.get(key);
  if (hit) return hit;
  const result = smoothCursorPath(events, amount);
  if (smoothCache.size > 12) smoothCache.clear();
  smoothCache.set(key, result);
  return result;
}

export const clearCursorCache = () => smoothCache.clear();

/* --------------------------------------------------------------- scene draw */

export function renderScene(
  ctx: Ctx,
  project: Project,
  scene: Scene,
  sceneTime: number,
  provider: FrameProvider,
  options: RenderOptions = {},
): void {
  const canvas: Size = project.canvas;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(ctx, scene.background, canvas);

  // Scene transition-in affects everything in the scene.
  const trans = scene.transitionIn;
  let sceneAlpha = 1;
  let sceneScale = 1;
  let sceneShiftX = 0;
  let sceneBlur = 0;
  if (trans.kind !== 'none' && sceneTime < trans.duration) {
    const p = ease('easeOut', clamp(sceneTime / Math.max(trans.duration, 1e-4), 0, 1));
    switch (trans.kind) {
      case 'fade':
        sceneAlpha = p;
        break;
      case 'slide':
        sceneShiftX = (1 - p) * canvas.width * 0.12;
        sceneAlpha = p;
        break;
      case 'zoom':
        sceneScale = lerp(1.08, 1, p);
        sceneAlpha = p;
        break;
      case 'blur':
        sceneBlur = (1 - p) * 20;
        sceneAlpha = p;
        break;
      case 'wipe':
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width * p, canvas.height);
        ctx.clip();
        break;
    }
  }

  ctx.globalAlpha = sceneAlpha;
  if (sceneBlur > 0) ctx.filter = `blur(${sceneBlur}px)`;
  if (sceneScale !== 1 || sceneShiftX !== 0) {
    ctx.translate(canvas.width / 2 + sceneShiftX, canvas.height / 2);
    ctx.scale(sceneScale, sceneScale);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }

  // Audio layers have no visual representation.
  const visible = scene.layers.filter((l) => l.type !== 'audio' && isLayerActive(l, sceneTime));
  const nested = nestedVideoIds(scene, sceneTime);

  for (const layer of visible) {
    // Nested app screens are painted inside their host frame (pixel-perfect bezels).
    if (layer.type === 'video' && nested.has(layer.id)) continue;
    drawLayer(ctx, layer, sceneTime - layer.start, project, scene, provider, options, sceneTime);
  }

  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawLayer(
  ctx: Ctx,
  layer: Layer,
  localTime: number,
  project: Project,
  scene: Scene,
  provider: FrameProvider,
  options: RenderOptions,
  sceneTime: number,
): void {
  const canvas = project.canvas;

  // Overlays attached to a nested app screen must follow the nest world transform.
  let parentX = 0;
  let parentY = 0;
  let parentScale = 1;
  let parentRot = 0;
  if (layer.attachToLayerId) {
    const parent = scene.layers.find((l) => l.id === layer.attachToLayerId);
    if (parent?.type === 'video') {
      const host = findNestHost(scene, parent.id);
      if (host) {
        const nest = nestedAppScreenWorld(host, parent, sceneTime, canvas);
        parentX = nest.x;
        parentY = nest.y;
        parentScale = nest.scale;
        parentRot = nest.rotation;
      } else {
        const parentLocal = Math.max(0, sceneTime - parent.start);
        const pt = resolveLayerTransform(parent, parentLocal, {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        });
        parentX = pt.x;
        parentY = pt.y;
        parentScale = pt.scale;
        parentRot = pt.rotation;
      }
    } else if (parent && parent.type !== 'audio') {
      const parentLocal = Math.max(0, sceneTime - parent.start);
      const pt = resolveLayerTransform(parent, parentLocal, {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      });
      parentX = pt.x;
      parentY = pt.y;
      parentScale = pt.scale;
      parentRot = pt.rotation;
    }
  }

  const paintOnce = (opacityMul: number, xOff: number, yOff: number, scaleMul: number, rotOff: number) => {
    const t = resolveLayerTransform(
      options.reducedMotion ? { ...layer, motion: { ...layer.motion, idle: 'none' } } : layer,
      localTime,
      { canvasWidth: canvas.width, canvasHeight: canvas.height },
    );
    if (t.opacity * opacityMul <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = t.opacity * opacityMul;
    if (t.blur > 0.2) ctx.filter = `blur(${t.blur}px)`;

    const cx = canvas.width / 2 + parentX + (t.x + xOff) * parentScale;
    const cy = canvas.height / 2 + parentY + (t.y + yOff) * parentScale;
    ctx.translate(cx, cy);
    if (parentRot) ctx.rotate((parentRot * Math.PI) / 180);
    if (t.rotation + rotOff) ctx.rotate(((t.rotation + rotOff) * Math.PI) / 180);
    ctx.scale(t.scale * parentScale * scaleMul, t.scale * parentScale * scaleMul);

    switch (layer.type) {
      case 'video':
        drawVideoLayer(ctx, layer, localTime, project, provider, t.cornerRadiusDelta, options);
        break;
      case 'image':
        drawImageLayer(ctx, layer, provider, t.cornerRadiusDelta);
        break;
      case 'text':
        drawTextLayer(ctx, layer, t.reveal);
        break;
      case 'shape':
        drawShapeLayer(ctx, layer);
        break;
      case 'callout':
        drawCalloutLayer(ctx, layer, localTime, canvas, cx, cy, t.scale * scaleMul);
        break;
      case 'frame':
        drawFrameLayer(ctx, layer, localTime, project, scene, provider, options, sceneTime);
        break;
      default:
        break;
    }

    ctx.filter = 'none';
    ctx.restore();
  };

  // Optical motion blur along the transform path (skip text — kept readable).
  if (!options.reducedMotion && shouldMotionBlur(layer) && layer.type !== 'frame') {
    const level = layer.motionBlur!;
    const cfg = motionBlurConfig(level)!;
    const samples = motionPathSamples(layer, localTime, canvas, level);
    const vel = peakVelocity(samples, cfg.shutter);
    if (vel > 8 && samples.length > 1) {
      const present = samples[samples.length - 1].transform;
      for (let i = 0; i < samples.length - 1; i++) {
        const s = samples[i];
        paintOnce(
          s.weight * 0.85,
          s.transform.x - present.x,
          s.transform.y - present.y,
          s.transform.scale / Math.max(present.scale, 1e-4),
          s.transform.rotation - present.rotation,
        );
      }
      paintOnce(samples[samples.length - 1].weight + 0.35, 0, 0, 1, 0);
      return;
    }
  }

  paintOnce(1, 0, 0, 1, 0);
}

/* --------------------------------------------------------------- video layer */

/** Where a video layer's footage lands on the canvas, before camera zoom. */
export function videoLayoutRect(
  layer: VideoLayer,
  asset: MediaAsset | undefined,
  canvas: Size,
  live?: { width?: number; height?: number; videoWidth?: number; videoHeight?: number },
  localTime = 0,
) {
  const src = mediaSize(live, asset);
  const crop = cropAtTime(layer, localTime);
  const srcW = src.width * crop.width;
  const srcH = src.height * crop.height;
  const aspect = srcW / Math.max(srcH, 1);

  const frame = getFrame(layer.frame.kind);
  // Leave breathing room so shadows and frames aren't clipped by the canvas edge.
  const margin = layer.frame.kind === 'none' ? 0.86 : 0.8;
  const maxW = canvas.width * margin;
  const maxH = canvas.height * margin;

  if (frame) {
    // Fit the *frame* inside the canvas, then derive the screen rect from it.
    let fw = maxW;
    let fh = fw / frame.outerAspect;
    if (fh > maxH) {
      fh = maxH;
      fw = fh * frame.outerAspect;
    }
    return { frameW: fw, frameH: fh, aspect, frame };
  }

  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { frameW: w, frameH: h, aspect, frame: null };
}

function drawVideoLayer(
  ctx: Ctx,
  layer: VideoLayer,
  localTime: number,
  project: Project,
  provider: FrameProvider,
  radiusDelta: number,
  options: RenderOptions = {},
  nestScreen?: { w: number; h: number; radius: number },
): void {
  const asset = provider.getAsset(layer.assetId);
  const canvas = project.canvas;
  const sourceTime = layer.trimStart + localTime * layer.playbackRate;
  const image = provider.getFrame(layer, sourceTime);

  let screenW: number;
  let screenH: number;
  let screenX: number;
  let screenY: number;
  let radius: number;
  let frame = getFrame(layer.frame.kind);

  if (nestScreen) {
    // Nested into a Phone Frame — fill the host screenRect exactly.
    screenW = nestScreen.w;
    screenH = nestScreen.h;
    screenX = -nestScreen.w / 2;
    screenY = -nestScreen.h / 2;
    radius = Math.max(0, nestScreen.radius + radiusDelta);
    frame = null;
  } else {
    const layout = videoLayoutRect(
      layer,
      asset,
      canvas,
      image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined,
      localTime,
    );
    frame = layout.frame;
    screenW = frame ? layout.frameW * frame.screenRect.width : layout.frameW;
    screenH = frame ? layout.frameH * frame.screenRect.height : layout.frameH;
    screenX = frame
      ? -layout.frameW / 2 + layout.frameW * frame.screenRect.x
      : -layout.frameW / 2;
    screenY = frame
      ? -layout.frameH / 2 + layout.frameH * frame.screenRect.y
      : -layout.frameH / 2;
    radius = frame
      ? layout.frameW * frame.screenRadius
      : Math.max(0, layer.cornerRadius + radiusDelta);

    if (frame) frameChrome(ctx, frame, layout.frameW, layout.frameH, layer.frame.url);
  }

  // Dynamic / image background sits behind the footage but inside the layer transform.
  if (layer.background.type === 'dynamic' && image) {
    ctx.save();
    ctx.filter = `blur(${layer.background.blur}px) brightness(${layer.background.brightness})`;
    const bw = canvas.width * layer.background.scale;
    const bh = canvas.height * layer.background.scale;
    ctx.drawImage(image as CanvasImageSource, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  } else if (layer.background.type !== 'transparent' && !nestScreen) {
    ctx.save();
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    drawBackground(ctx, layer.background, canvas);
    ctx.restore();
  }

  // Shadow is painted as a filled rounded rect behind the footage, because a
  // canvas shadow on a clipped drawImage is unreliable across engines.
  if (layer.shadow.enabled && layer.shadow.opacity > 0) {
    ctx.save();
    ctx.shadowColor = withAlpha(layer.shadow.color, layer.shadow.opacity);
    ctx.shadowBlur = layer.shadow.blur;
    ctx.shadowOffsetY = layer.shadow.y;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const s = layer.shadow.spread;
    roundRect(ctx, screenX - s, screenY - s, screenW + s * 2, screenH + s * 2, radius + s);
    ctx.fill();
    ctx.restore();
  }

  // Camera
  const cursorEvents = getSmoothedCursor(asset, layer.cursor.smoothing);
  const cropRect = cropAtTime(layer, localTime);
  const cam = evaluateCamera(layer.camera, {
    time: localTime,
    cursor: cursorEvents,
    source: { width: asset?.width ?? 1920, height: asset?.height ?? 1080 },
    crop: cropRect,
  });

  ctx.save();
  roundRect(ctx, screenX, screenY, screenW, screenH, radius);
  ctx.clip();

  if (image) {
    const src = mediaSize(
      image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number },
      asset,
    );
    const iw = src.width;
    const ih = src.height;
    const cropX = cropRect.x * iw;
    const cropY = cropRect.y * ih;
    const cropW = cropRect.width * iw;
    const cropH = cropRect.height * ih;

    const viewW = cropW / cam.zoom;
    const viewH = cropH / cam.zoom;
    const sx = clamp(cropX + cam.x * cropW - viewW / 2, 0, Math.max(0, iw - viewW));
    const sy = clamp(cropY + cam.y * cropH - viewH / 2, 0, Math.max(0, ih - viewH));

    // Optical camera motion blur — samples along zoom/pan shutter path.
    const blurLevel = layer.motionBlur;
    const camCfg = motionBlurConfig(blurLevel);
    if (camCfg && !options.reducedMotion && (cam.zoom > 1.01 || blurLevel === 'high')) {
      const shutter = camCfg.shutter;
      const n = camCfg.samples;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        const past = evaluateCamera(layer.camera, {
          time: Math.max(0, localTime - shutter * (1 - f)),
          cursor: cursorEvents,
          source: { width: asset?.width ?? 1920, height: asset?.height ?? 1080 },
          crop: cropRect,
        });
        const z = past.zoom;
        const gViewW = cropW / z;
        const gViewH = cropH / z;
        const gsx = clamp(cropX + past.x * cropW - gViewW / 2, 0, Math.max(0, iw - gViewW));
        const gsy = clamp(cropY + past.y * cropH - gViewH / 2, 0, Math.max(0, ih - gViewH));
        const gFitted = containRect(gViewW, gViewH, screenW, screenH);
        ctx.save();
        ctx.globalAlpha = (0.08 + 0.14 * f) / n;
        ctx.drawImage(
          image as CanvasImageSource,
          gsx,
          gsy,
          gViewW,
          gViewH,
          screenX + gFitted.x,
          screenY + gFitted.y,
          gFitted.w,
          gFitted.h,
        );
        ctx.restore();
      }
    }

    const fitted = containRect(viewW, viewH, screenW, screenH);
    if (fitted.w < screenW - 1 || fitted.h < screenH - 1) {
      ctx.fillStyle = '#0c0f14';
      ctx.fillRect(screenX, screenY, screenW, screenH);
    }
    ctx.drawImage(
      image as CanvasImageSource,
      sx,
      sy,
      viewW,
      viewH,
      screenX + fitted.x,
      screenY + fitted.y,
      fitted.w,
      fitted.h,
    );
  } else {
    ctx.fillStyle = '#101317';
    ctx.fillRect(screenX, screenY, screenW, screenH);
  }

  if (layer.cursor.style !== 'hidden' && cursorEvents.length > 0) {
    const sample = sampleCursor(cursorEvents, sourceTime);
    if (sample) {
      const relX = (sample.x - cropRect.x) / Math.max(cropRect.width, 1e-4);
      const relY = (sample.y - cropRect.y) / Math.max(cropRect.height, 1e-4);
      const half = 1 / (2 * cam.zoom);
      const viewLeft = cam.x - half;
      const viewTop = cam.y - half;
      const px = screenX + ((relX - viewLeft) / (2 * half)) * screenW;
      const py = screenY + ((relY - viewTop) / (2 * half)) * screenH;

      if (px >= screenX - 60 && px <= screenX + screenW + 60) {
        drawCursor(ctx, layer.cursor, {
          x: px,
          y: py,
          sinceClick: timeSinceClick(cursorEvents, sourceTime),
          displayScale: (screenW / Math.max(asset?.width ?? 1920, 1)) * cam.zoom,
        });
      }
    }
  }

  if (options.overlays && layer.appScreen?.showSafeArea) {
    ctx.save();
    ctx.strokeStyle = 'rgba(34,211,238,0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    const top = screenH * 0.06;
    const bottom = screenH * 0.08;
    ctx.strokeRect(screenX + 2, screenY + top, screenW - 4, screenH - top - bottom);
    ctx.fillStyle = 'rgba(34,211,238,0.08)';
    ctx.fillRect(screenX, screenY, screenW, top);
    ctx.fillRect(screenX, screenY + screenH - bottom, screenW, bottom);
    ctx.restore();
  }

  paintGlow(ctx, layer.glow, screenX, screenY, screenW, screenH, radius);
  paintBorder(ctx, layer.border, screenX, screenY, screenW, screenH, radius);

  ctx.restore();
}

function paintGlow(
  ctx: Ctx,
  glow: GlowSpec | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  if (!glow?.enabled || glow.opacity <= 0) return;
  ctx.save();
  ctx.shadowColor = withAlpha(glow.color, glow.opacity * glow.intensity);
  ctx.shadowBlur = glow.blur;
  ctx.fillStyle = withAlpha(glow.color, 0.001);
  const s = glow.spread;
  roundRect(ctx, x - s, y - s, w + s * 2, h + s * 2, radius + s);
  ctx.fill();
  ctx.restore();
}

function paintBorder(
  ctx: Ctx,
  border: BorderSpec | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  if (!border?.enabled || border.opacity <= 0 || border.thickness <= 0) return;
  ctx.save();
  ctx.strokeStyle = withAlpha(border.color, border.opacity);
  ctx.lineWidth = border.thickness;
  if (border.style === 'soft') ctx.shadowBlur = border.thickness * 1.8;
  if (border.style === 'soft') ctx.shadowColor = withAlpha(border.color, border.opacity * 0.6);
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();
  ctx.restore();
}

function drawFrameLayer(
  ctx: Ctx,
  layer: FrameLayer,
  localTime: number,
  project: Project,
  scene: Scene,
  provider: FrameProvider,
  options: RenderOptions,
  sceneTime: number,
): void {
  const def = getFrame(layer.frame.kind);
  if (!def) return;
  const w = layer.size.width;
  const h = layer.size.height;
  const radius = w * def.screenRadius;

  // Optical blur on the frame chrome when moving.
  if (!options.reducedMotion && shouldMotionBlur(layer)) {
    const cfg = motionBlurConfig(layer.motionBlur!);
    if (cfg) {
      const samples = motionPathSamples(layer, localTime, project.canvas, layer.motionBlur!);
      if (peakVelocity(samples, cfg.shutter) > 8) {
        const present = samples[samples.length - 1].transform;
        for (let i = 0; i < samples.length - 1; i++) {
          const s = samples[i];
          ctx.save();
          ctx.globalAlpha = s.weight * 0.7;
          ctx.translate(s.transform.x - present.x, s.transform.y - present.y);
          paintFrameChrome(ctx, layer, w, h, radius);
          ctx.restore();
        }
      }
    }
  }

  paintFrameChrome(ctx, layer, w, h, radius);

  // Nest linked app screen into the screenRect (pixel-perfect).
  if (layer.nestAppScreen !== false && layer.linkedLayerId) {
    const video = scene.layers.find((l) => l.id === layer.linkedLayerId);
    if (video?.type === 'video' && isLayerActive(video, sceneTime)) {
      const screen = frameScreenLocal(layer);
      const videoLocal = Math.max(0, sceneTime - video.start);
      const vt = resolveLayerTransform(
        options.reducedMotion ? { ...video, motion: { ...video.motion, idle: 'none' } } : video,
        videoLocal,
        { canvasWidth: project.canvas.width, canvasHeight: project.canvas.height },
      );
      ctx.save();
      // Local nest offsets from the video's own animation (independent of frame).
      ctx.translate(screen.x + screen.w / 2 + vt.x, screen.y + screen.h / 2 + vt.y);
      if (vt.rotation) ctx.rotate((vt.rotation * Math.PI) / 180);
      ctx.scale(vt.scale, vt.scale);
      ctx.globalAlpha *= vt.opacity;
      drawVideoLayer(ctx, video, videoLocal, project, provider, vt.cornerRadiusDelta, options, {
        w: screen.w,
        h: screen.h,
        radius: screen.radius,
      });
      ctx.restore();
    }
  }
}

function paintFrameChrome(ctx: Ctx, layer: FrameLayer, w: number, h: number, radius: number) {
  paintGlow(ctx, layer.glow, -w / 2, -h / 2, w, h, radius);
  if (layer.shadow.enabled && layer.shadow.opacity > 0) {
    ctx.save();
    ctx.shadowColor = withAlpha(layer.shadow.color, layer.shadow.opacity);
    ctx.shadowBlur = layer.shadow.blur;
    ctx.shadowOffsetY = layer.shadow.y;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const s = layer.shadow.spread;
    roundRect(ctx, -w / 2 - s, -h / 2 - s, w + s * 2, h + s * 2, w * 0.12 + s);
    ctx.fill();
    ctx.restore();
  }
  frameChrome(ctx, getFrame(layer.frame.kind)!, w, h, layer.frame.url);
  paintBorder(ctx, layer.border, -w / 2, -h / 2, w, h, w * 0.12);
}

function frameChrome(
  ctx: Ctx,
  frame: NonNullable<ReturnType<typeof getFrame>>,
  w: number,
  h: number,
  url?: string,
): void {
  ctx.save();
  ctx.translate(-w / 2, -h / 2);
  frame.draw(ctx, w, h, { url });
  ctx.restore();
}

/* --------------------------------------------------------------- image layer */

function drawImageLayer(ctx: Ctx, layer: ImageLayer, provider: FrameProvider, radiusDelta: number) {
  const image = provider.getImage(layer.assetId);
  const asset = provider.getAsset(layer.assetId);
  if (!image) return;

  const w = asset?.width ?? (image.width as number) ?? 600;
  const h = asset?.height ?? (image.height as number) ?? 400;
  const radius = Math.max(0, layer.cornerRadius + radiusDelta);

  if (layer.shadow.enabled) {
    ctx.save();
    ctx.shadowColor = withAlpha(layer.shadow.color, layer.shadow.opacity);
    ctx.shadowBlur = layer.shadow.blur;
    ctx.shadowOffsetY = layer.shadow.y;
    ctx.fillStyle = '#000';
    roundRect(ctx, -w / 2, -h / 2, w, h, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.clip();
  ctx.drawImage(image as CanvasImageSource, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/* ---------------------------------------------------------------- text layer */

export function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawTextLayer(ctx: Ctx, layer: TextLayer, reveal: number) {
  ctx.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}", Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = layer.align;
  ctx.letterSpacing = `${layer.letterSpacing}px`;

  let content = layer.text;
  if (layer.animation === 'typewriter') {
    content = layer.text.slice(0, Math.ceil(layer.text.length * reveal));
  } else if (layer.animation === 'wordReveal') {
    const words = layer.text.split(' ');
    content = words.slice(0, Math.ceil(words.length * reveal)).join(' ');
  }

  const lines = wrapText(ctx, content, layer.maxWidth);
  const lineH = layer.fontSize * layer.lineHeight;
  const totalH = lines.length * lineH;
  const startY = -totalH / 2 + lineH / 2;
  const anchorX = layer.align === 'left' ? -layer.maxWidth / 2 : layer.align === 'right' ? layer.maxWidth / 2 : 0;

  if (layer.background) {
    const widest = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
    const pad = layer.background.padding;
    ctx.fillStyle = layer.background.color;
    roundRect(
      ctx,
      anchorX - (layer.align === 'left' ? 0 : layer.align === 'right' ? widest : widest / 2) - pad,
      -totalH / 2 - pad,
      widest + pad * 2,
      totalH + pad * 2,
      layer.background.radius,
    );
    ctx.fill();
  }

  ctx.fillStyle = layer.color;
  lines.forEach((line, i) => ctx.fillText(line, anchorX, startY + i * lineH));
  ctx.letterSpacing = '0px';
}

/* --------------------------------------------------------------- shape layer */

function drawShapeLayer(ctx: Ctx, layer: ShapeLayer) {
  const { width: w, height: h } = layer.size;
  ctx.fillStyle = layer.fill;
  ctx.strokeStyle = layer.stroke;
  ctx.lineWidth = layer.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (layer.shape) {
    case 'rect':
      roundRect(ctx, -w / 2, -h / 2, w, h, layer.cornerRadius);
      if (layer.fill !== 'transparent') ctx.fill();
      if (layer.strokeWidth > 0) ctx.stroke();
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (layer.fill !== 'transparent') ctx.fill();
      if (layer.strokeWidth > 0) ctx.stroke();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath();
      if (layer.fill !== 'transparent') ctx.fill();
      if (layer.strokeWidth > 0) ctx.stroke();
      break;
    case 'line': {
      const end = layer.endPoint ?? { x: w, y: 0 };
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      break;
    }
    case 'arrow': {
      const end = layer.endPoint ?? { x: w, y: 0 };
      ctx.beginPath();
      ctx.moveTo(0, 0);
      // Gentle arc reads better than a straight line for pointing at UI.
      ctx.quadraticCurveTo(end.x * 0.35, end.y * 0.9, end.x, end.y);
      ctx.stroke();
      const angle = Math.atan2(end.y - end.y * 0.9, end.x - end.x * 0.35);
      const head = Math.max(18, layer.strokeWidth * 3.2);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - head * Math.cos(angle - 0.42), end.y - head * Math.sin(angle - 0.42));
      ctx.lineTo(end.x - head * Math.cos(angle + 0.42), end.y - head * Math.sin(angle + 0.42));
      ctx.closePath();
      ctx.fillStyle = layer.stroke;
      ctx.fill();
      break;
    }
  }
}

/* ------------------------------------------------------------- callout layer */

function drawCalloutLayer(
  ctx: Ctx,
  layer: CalloutLayer,
  localTime: number,
  canvas: Size,
  cx: number,
  cy: number,
  scale: number,
) {
  const { width: w, height: h } = layer.size;
  const pulse = layer.pulse ? 1 + Math.sin(localTime * 3.4) * 0.035 : 1;

  // Dimming must cover the whole canvas, so it is drawn in canvas space.
  if (layer.dim > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = layer.dim;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.translate(cx, cy);
    ctx.scale(scale * pulse, scale * pulse);
    if (layer.callout === 'spotlight') {
      const r = Math.max(w, h) / 2;
      const grad = ctx.createRadialGradient(0, 0, r * 0.45, 0, 0, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#000';
      roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.14);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = layer.color;
  ctx.lineWidth = layer.strokeWidth;

  switch (layer.callout) {
    case 'circle':
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'roundedRect':
    case 'highlight':
    case 'spotlight':
      roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.14);
      if (layer.callout === 'highlight') {
        ctx.fillStyle = withAlpha(layer.color, 0.16);
        ctx.fill();
      }
      if (layer.callout !== 'spotlight') ctx.stroke();
      break;
    case 'number': {
      const r = Math.min(w, h) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = layer.color;
      ctx.fill();
      ctx.fillStyle = '#0B0F14';
      ctx.font = `700 ${r * 1.1}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(layer.label || '1', 0, r * 0.04);
      break;
    }
    case 'label': {
      ctx.font = `600 ${Math.max(20, h * 0.42)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textW = ctx.measureText(layer.label || 'Label').width;
      const pad = h * 0.36;
      const boxW = textW + pad * 2;
      ctx.fillStyle = layer.color;
      roundRect(ctx, -boxW / 2, -h / 2, boxW, h, h / 2);
      ctx.fill();
      ctx.fillStyle = '#0B0F14';
      ctx.fillText(layer.label || 'Label', 0, 1);
      break;
    }
  }

  if (layer.label && (layer.callout === 'circle' || layer.callout === 'roundedRect' || layer.callout === 'highlight')) {
    ctx.font = `600 ${Math.max(22, h * 0.26)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textW = ctx.measureText(layer.label).width;
    const padX = 22;
    const boxH = Math.max(40, h * 0.34);
    ctx.fillStyle = layer.color;
    roundRect(ctx, -(textW + padX * 2) / 2, -h / 2 - boxH - 14, textW + padX * 2, boxH, boxH / 2);
    ctx.fill();
    ctx.fillStyle = '#0B0F14';
    ctx.fillText(layer.label, 0, -h / 2 - boxH / 2 - 13);
  }

  ctx.restore();
}
