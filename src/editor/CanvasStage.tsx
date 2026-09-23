/**
 * The preview canvas — the centre of the application.
 *
 * Rendering is driven by a single rAF loop that reads the store imperatively, so
 * dragging the playhead or a layer never triggers a React render of this component's
 * compositor. Selection handles use React for accessibility; transform writes coalesce
 * into one history entry per gesture.
 */

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEditor } from '../state/editorStore';
import { renderScene, videoLayoutRect } from '../render/compositor';
import { cropAtTime } from '../core/cropTrack';
import type { MediaPool } from '../render/mediaPool';
import { getFrame } from '../render/frames';
import { clamp } from '../core/easing';
import { isLayerActive } from '../core/animation';
import type { Layer, VideoLayer } from '../core/types';
import { IconButton, Tooltip } from '../ui/primitives';
import { IconFit, IconPause, IconPlay, IconZoomIn, IconZoomOut } from '../ui/icons';
import { usePrefersReducedMotion } from './useReducedMotion';
import { mediaSize } from '../core/mediaLayout';
import { layerBoxFromBounds, snapPosition, type GuideLine } from './snapGuides';
import { MOTION_PRESETS, applyMotionPreset, pushRecentMotion } from '../library/motionPresets';

interface Props {
  pool: MediaPool;
  /** Set while the user is placing a camera focus point by clicking the canvas. */
  focusPickMode: boolean;
  onFocusPicked: (layerId: string, x: number, y: number) => void;
  /** Browser fallback: scrub + move the pointer over the clip to rebuild a cursor path. */
  cursorMarkMode?: boolean;
  /** Optional coach card for an empty scene. */
  emptyGuide?: ReactNode;
}

const formatTime = (seconds: number) => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(2).padStart(5, '0')}`;
};

type DragMode = 'move' | 'resize' | 'rotate';

interface DragSession {
  mode: DragMode;
  layerId: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originScale: number;
  originRotation: number;
  originW: number;
  originH: number;
  handle?: string;
  /** Peer centres for snap, captured at pointer-down. */
  peers: ReturnType<typeof layerBoxFromBounds>[];
  groupOffsets?: { id: string; dx: number; dy: number }[];
}

export function CanvasStage({
  pool,
  focusPickMode,
  onFocusPicked,
  cursorMarkMode = false,
  emptyGuide,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const reducedMotion = usePrefersReducedMotion();

  const canvasSize = useEditor((s) => s.project.canvas);
  const canvasZoom = useEditor((s) => s.canvasZoom);
  const canvasFit = useEditor((s) => s.canvasFit);
  const canvasPan = useEditor((s) => s.canvasPan);
  const isPlaying = useEditor((s) => s.isPlaying);
  const setCanvasZoom = useEditor((s) => s.setCanvasZoom);
  const setCanvasFit = useEditor((s) => s.setCanvasFit);
  const setCanvasPan = useEditor((s) => s.setCanvasPan);
  const togglePlay = useEditor((s) => s.togglePlay);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    if (viewport.width === 0 || viewport.height === 0) return 0.5;
    const pad = 56;
    return Math.min(
      (viewport.width - pad) / canvasSize.width,
      (viewport.height - pad) / canvasSize.height,
    );
  }, [viewport, canvasSize]);

  const scale = canvasFit ? fitScale : canvasZoom;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let lastSignature = '';
    let lastProject = useEditor.getState().project;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const state = useEditor.getState();
      const scene = state.project.scenes[state.activeSceneIndex];
      if (!scene) return;

      const signature = `${state.playhead.toFixed(4)}|${state.project.updatedAt}|${state.activeSceneIndex}|${state.selectedLayerIds.join(',')}`;
      // Project object identity is the reliable revision marker. `updatedAt` has
      // millisecond precision, so two quick button presses can share a timestamp.
      // That previously made composition/inspector changes appear unresponsive.
      if (!state.isPlaying && signature === lastSignature && state.project === lastProject) return;
      lastSignature = signature;
      lastProject = state.project;

      renderScene(ctx, state.project, scene, state.playhead, pool, {
        reducedMotion,
        overlays: { selectedLayerId: state.selectedLayerIds[0] ?? null },
      });
    };

    raf = requestAnimationFrame(draw);
    pool.onReady = () => {
      lastSignature = '';
    };
    return () => {
      cancelAnimationFrame(raf);
      pool.onReady = undefined;
    };
  }, [pool, reducedMotion]);

  const selectedLayerIds = useEditor((s) => s.selectedLayerIds);

  const canvasPointFromEvent = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: ((e.clientX - rect.left) / rect.width) * canvasSize.width,
        y: ((e.clientY - rect.top) / rect.height) * canvasSize.height,
      };
    },
    [canvasSize],
  );

  const layerAtPoint = useCallback((px: number, py: number): Layer | null => {
    const state = useEditor.getState();
    const scene = state.project.scenes[state.activeSceneIndex];
    const time = state.playhead;
    for (let i = scene.layers.length - 1; i >= 0; i--) {
      const layer = scene.layers[i];
      if (layer.type === 'audio' || layer.locked || !isLayerActive(layer, time)) continue;
      if (hitTestLayer(layer, state, px, py)) return layer;
    }
    return null;
  }, []);

  const drag = useRef<DragSession | null>(null);
  const pan = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const cursorMarkActive = useRef(false);
  const lastCursorSampleAt = useRef(0);

  const sampleCursorMark = (e: React.PointerEvent, down: boolean) => {
    if (!cursorMarkMode) return;
    const point = canvasPointFromEvent(e);
    if (!point) return;
    const state = useEditor.getState();
    const scene = state.project.scenes[state.activeSceneIndex];
    const video = scene.layers.find(
      (l): l is VideoLayer => l.type === 'video' && selectedLayerIds.includes(l.id),
    );
    if (!video) return;
    const normalised = canvasPointToSource(video, state, point.x, point.y);
    if (!normalised) return;
    const now = performance.now();
    if (!down && now - lastCursorSampleAt.current < 32) return;
    lastCursorSampleAt.current = now;
    const localT = Math.max(0, state.playhead - video.start) * video.playbackRate + video.trimStart;
    state.appendCursorSamples(video.assetId, [
      { t: localT, x: normalised.x, y: normalised.y, ...(down ? { down: true, button: 0 } : {}) },
    ]);
  };

  const beginMove = (layer: Layer, e: React.PointerEvent) => {
    const state = useEditor.getState();
    const scene = state.project.scenes[state.activeSceneIndex];
    let target = layer;

    if (e.altKey) {
      state.duplicateLayer(layer.id);
      const copy = state.selectedLayers()[0];
      if (copy) target = copy;
    }

    const box = approximateBounds(target, state.project.assets, state.project.canvas);
    const peers = scene.layers
      .filter((l) => l.id !== target.id && l.type !== 'audio' && !l.hidden)
      .map((l) => {
        const b = approximateBounds(l, state.project.assets, state.project.canvas);
        return layerBoxFromBounds(l, state.project.canvas, b.w, b.h);
      });

    let groupOffsets: DragSession['groupOffsets'];
    if (target.groupId) {
      groupOffsets = scene.layers
        .filter((l) => l.groupId === target.groupId && l.id !== target.id)
        .map((l) => ({
          id: l.id,
          dx: l.position.x - target.position.x,
          dy: l.position.y - target.position.y,
        }));
    }
    if (target.type === 'frame' && target.linkTransforms && target.linkedLayerId) {
      const linked = scene.layers.find((l) => l.id === target.linkedLayerId);
      if (linked) {
        const entry = {
          id: linked.id,
          dx: linked.position.x - target.position.x,
          dy: linked.position.y - target.position.y,
        };
        groupOffsets = [...(groupOffsets ?? []), entry].filter(
          (g, i, arr) => arr.findIndex((x) => x.id === g.id) === i,
        );
      }
    }

    drag.current = {
      mode: 'move',
      layerId: target.id,
      startX: e.clientX,
      startY: e.clientY,
      originX: target.position.x,
      originY: target.position.y,
      originScale: target.scale,
      originRotation: target.rotation,
      originW: box.w,
      originH: box.h,
      peers,
      groupOffsets,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const point = canvasPointFromEvent(e);
    if (!point) return;

    if (e.button === 1) {
      pan.current = { startX: e.clientX, startY: e.clientY, originX: canvasPan.x, originY: canvasPan.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (focusPickMode) {
      const state = useEditor.getState();
      const scene = state.project.scenes[state.activeSceneIndex];
      const video = scene.layers.find(
        (l): l is VideoLayer => l.type === 'video' && selectedLayerIds.includes(l.id),
      );
      if (video) {
        const normalised = canvasPointToSource(video, state, point.x, point.y);
        if (normalised) onFocusPicked(video.id, normalised.x, normalised.y);
      }
      return;
    }

    if (cursorMarkMode) {
      cursorMarkActive.current = true;
      sampleCursorMark(e, true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    const hit = layerAtPoint(point.x, point.y);
    if (!hit) {
      useEditor.getState().selectLayers([]);
      setGuides([]);
      return;
    }

    if (e.metaKey || e.ctrlKey) useEditor.getState().toggleLayerSelected(hit.id);
    else if (!selectedLayerIds.includes(hit.id)) useEditor.getState().selectLayers([hit.id]);

    beginMove(hit, e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const applyDrag = useCallback(
    (clientX: number, clientY: number, shiftKey: boolean, ctrlKey: boolean) => {
      const session = drag.current;
      if (!session) return;

      const dx = (clientX - session.startX) / scale;
      const dy = (clientY - session.startY) / scale;
      const store = useEditor.getState();

      if (session.mode === 'move') {
        let nx = session.originX + dx;
        let ny = session.originY + dy;
        if (shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) ny = session.originY;
          else nx = session.originX;
        }
        const snapped = snapPosition(
          nx,
          ny,
          session.originW / 2,
          session.originH / 2,
          store.project.canvas,
          session.peers,
          !ctrlKey,
        );
        setGuides(snapped.guides);
        store.updateLayer(
          session.layerId,
          { position: { x: Math.round(snapped.x), y: Math.round(snapped.y) } },
          'Move layer',
          true,
        );
        if (session.groupOffsets) {
          for (const g of session.groupOffsets) {
            store.updateLayer(
              g.id,
              { position: { x: Math.round(snapped.x + g.dx), y: Math.round(snapped.y + g.dy) } },
              'Move layer',
              true,
            );
          }
        }
        return;
      }

      if (session.mode === 'resize') {
        const along = session.handle?.includes('e') || session.handle?.includes('w') ? dx : dy;
        const outward =
          session.handle === 'se' || session.handle === 'ne' || session.handle === 'e'
            ? along
            : session.handle === 'sw' || session.handle === 'nw'
              ? -along
              : along;
        const factor = clamp(1 + outward / Math.max(session.originW, 40), 0.05, 4);
        store.updateLayer(session.layerId, { scale: session.originScale * factor }, 'Scale layer', true);
        return;
      }

      if (session.mode === 'rotate') {
        const layer = store.findLayer(session.layerId);
        if (!layer) return;
        const canvas = store.project.canvas;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const px = ((clientX - rect.left) / rect.width) * canvas.width;
        const py = ((clientY - rect.top) / rect.height) * canvas.height;
        const cx = canvas.width / 2 + layer.position.x;
        const cy = canvas.height / 2 + layer.position.y;
        const angle = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
        const rotation = shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle);
        store.updateLayer(session.layerId, { rotation }, 'Rotate layer', true);
      }
    },
    [scale],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
    pan.current = null;
    cursorMarkActive.current = false;
    setGuides([]);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (pan.current) {
        setCanvasPan({
          x: pan.current.originX + (e.clientX - pan.current.startX),
          y: pan.current.originY + (e.clientY - pan.current.startY),
        });
        return;
      }
      if (drag.current) applyDrag(e.clientX, e.clientY, e.shiftKey, e.ctrlKey || e.metaKey);
    };
    const onUp = () => endDrag();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [applyDrag, endDrag, setCanvasPan]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (cursorMarkMode && cursorMarkActive.current) {
      sampleCursorMark(e, false);
    }
  };

  const startHandleDrag = (mode: DragMode, layerId: string, e: React.PointerEvent, handle?: string) => {
    e.stopPropagation();
    e.preventDefault();
    const state = useEditor.getState();
    const layer = state.findLayer(layerId);
    if (!layer || layer.locked) return;
    const box = approximateBounds(layer, state.project.assets, state.project.canvas);
    const scene = state.project.scenes[state.activeSceneIndex];
    const peers = scene.layers
      .filter((l) => l.id !== layerId && l.type !== 'audio' && !l.hidden)
      .map((l) => {
        const b = approximateBounds(l, state.project.assets, state.project.canvas);
        return layerBoxFromBounds(l, state.project.canvas, b.w, b.h);
      });
    drag.current = {
      mode,
      layerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: layer.position.x,
      originY: layer.position.y,
      originScale: layer.scale,
      originRotation: layer.rotation,
      originW: box.w,
      originH: box.h,
      handle,
      peers,
    };
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setCanvasZoom(clamp(scale * (e.deltaY > 0 ? 0.92 : 1.08), 0.1, 4));
  };

  const playhead = useEditor((s) => s.playhead);
  const duration = useEditor((s) => s.sceneDuration());

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-ink-900)]">
      <div
        ref={wrapRef}
        className="checkerboard relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        onWheel={onWheel}
      >
        {emptyGuide}
        <div
          style={{
            width: canvasSize.width * scale,
            height: canvasSize.height * scale,
            transform: `translate(${canvasPan.x}px, ${canvasPan.y}px)`,
          }}
          className="relative shrink-0 shadow-[0_18px_60px_rgba(0,0,0,0.55)] transition-[width,height] duration-150"
        >
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-motiondeck-preset')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(e) => {
              const presetId = e.dataTransfer.getData('application/x-motiondeck-preset');
              if (!presetId) return;
              e.preventDefault();
              const point = canvasPointFromEvent(e);
              const store = useEditor.getState();
              const hit = point ? layerAtPoint(point.x, point.y) : null;
              const target = hit ?? store.findLayer(store.selectedLayerIds[0] ?? '');
              if (!target) {
                store.showToast('Drop onto an element to apply the animation.', 'info');
                return;
              }
              const preset = MOTION_PRESETS.find((p) => p.id === presetId);
              if (!preset) return;
              store.updateLayer(
                target.id,
                { motion: applyMotionPreset(target.motion, preset) },
                `Animate · ${preset.label}`,
              );
              pushRecentMotion(preset.id);
              store.selectLayers([target.id]);
              store.showToast(`Applied ${preset.label}.`, 'success');
            }}
            className={clsx(
              'h-full w-full rounded-[2px]',
              focusPickMode || cursorMarkMode ? 'cursor-crosshair' : 'cursor-default',
            )}
            style={{ imageRendering: scale > 1.6 ? 'pixelated' : 'auto' }}
          />
          <SelectionOverlay scale={scale} onHandleDown={startHandleDrag} />
          {guides.map((g, i) =>
            g.axis === 'x' ? (
              <div
                key={`gx-${i}`}
                className="pointer-events-none absolute top-0 z-20 w-px bg-[var(--color-accent)]/80"
                style={{ left: g.at * scale, height: '100%' }}
              />
            ) : (
              <div
                key={`gy-${i}`}
                className="pointer-events-none absolute left-0 z-20 h-px bg-[var(--color-accent)]/80"
                style={{ top: g.at * scale, width: '100%' }}
              />
            ),
          )}
          {focusPickMode && (
            <div className="pointer-events-none absolute inset-0 rounded-[2px] border-2 border-dashed border-[var(--color-accent)]">
              <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-[var(--color-accent)] px-3 py-1 text-[11.5px] font-semibold text-[#04262c]">
                Click where the camera should focus
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="hairline-t flex h-11 shrink-0 items-center gap-2 bg-[var(--color-ink-850)] px-3">
        <IconButton label={isPlaying ? 'Pause (Space)' : 'Play (Space)'} onClick={togglePlay} active={isPlaying}>
          {isPlaying ? <IconPause size={15} /> : <IconPlay size={15} />}
        </IconButton>
        <span className="tabular ml-1 text-[12px] text-[var(--color-ink-200)]">
          {formatTime(playhead)}
          <span className="text-[var(--color-ink-500)]"> / {formatTime(duration)}</span>
        </span>

        <div className="flex-1" />

        <Tooltip content="Zoom out">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setCanvasZoom(scale * 0.85)}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--color-ink-300)] transition-colors hover:bg-[var(--color-ink-750)] hover:text-white"
          >
            <IconZoomOut size={15} />
          </button>
        </Tooltip>
        <button
          type="button"
          onClick={() => setCanvasFit(true)}
          className="tabular min-w-[52px] rounded-[6px] px-1.5 py-1 text-[11.5px] text-[var(--color-ink-200)] transition-colors hover:bg-[var(--color-ink-750)]"
        >
          {Math.round(scale * 100)}%
        </button>
        <Tooltip content="Zoom in">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setCanvasZoom(scale * 1.18)}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--color-ink-300)] transition-colors hover:bg-[var(--color-ink-750)] hover:text-white"
          >
            <IconZoomIn size={15} />
          </button>
        </Tooltip>
        <IconButton label="Fit to screen" size="sm" active={canvasFit} onClick={() => setCanvasFit(true)}>
          <IconFit size={15} />
        </IconButton>
        <span className="ml-1.5 text-[11px] text-[var(--color-ink-500)]">
          {canvasSize.width}×{canvasSize.height}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- selection */

function SelectionOverlay({
  scale,
  onHandleDown,
}: {
  scale: number;
  onHandleDown: (mode: DragMode, layerId: string, e: React.PointerEvent, handle?: string) => void;
}) {
  const selectedIds = useEditor((s) => s.selectedLayerIds);
  const scene = useEditor((s) => s.project.scenes[s.activeSceneIndex]);
  const playhead = useEditor((s) => s.playhead);
  const canvas = useEditor((s) => s.project.canvas);
  const assets = useEditor((s) => s.project.assets);
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const removeLayers = useEditor((s) => s.removeLayers);

  if (selectedIds.length === 0) return null;

  return (
    <div className="absolute inset-0">
      {selectedIds.map((id) => {
        const layer = scene.layers.find((l) => l.id === id);
        if (!layer || layer.type === 'audio' || !isLayerActive(layer, playhead)) return null;
        const box = approximateBounds(layer, assets, canvas);
        const left = (canvas.width / 2 + layer.position.x - box.w / 2) * scale;
        const top = (canvas.height / 2 + layer.position.y - box.h / 2) * scale;
        const w = box.w * scale;
        const h = box.h * scale;
        const primary = selectedIds[0] === id;

        return (
          <div
            key={id}
            className="pointer-events-none absolute border border-[var(--color-accent)]"
            style={{
              left,
              top,
              width: w,
              height: h,
              transform: `rotate(${layer.rotation}deg)`,
            }}
          >
            <span className="absolute -top-[19px] left-0 whitespace-nowrap rounded-t-[4px] bg-[var(--color-accent)] px-1.5 py-[1px] text-[10px] font-semibold text-[#04262c]">
              {layer.name}
              {layer.groupId ? ' · group' : ''}
            </span>

            {primary && !layer.locked && (
              <>
                {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                  <button
                    key={corner}
                    type="button"
                    aria-label={`Resize ${corner}`}
                    onPointerDown={(e) => onHandleDown('resize', id, e, corner)}
                    className={clsx(
                      'pointer-events-auto absolute h-2.5 w-2.5 rounded-[2px] border border-[var(--color-accent)] bg-white shadow-sm',
                      corner === 'nw' && '-left-1.5 -top-1.5 cursor-nwse-resize',
                      corner === 'ne' && '-right-1.5 -top-1.5 cursor-nesw-resize',
                      corner === 'sw' && '-bottom-1.5 -left-1.5 cursor-nesw-resize',
                      corner === 'se' && '-bottom-1.5 -right-1.5 cursor-nwse-resize',
                    )}
                  />
                ))}
                <button
                  type="button"
                  aria-label="Rotate"
                  onPointerDown={(e) => onHandleDown('rotate', id, e)}
                  className="pointer-events-auto absolute -top-7 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-[var(--color-accent)] bg-white"
                />
                <div className="pointer-events-auto absolute -bottom-9 left-1/2 flex -translate-x-1/2 gap-1">
                  <QuickAction
                    label="Animate"
                    onClick={() => window.dispatchEvent(new CustomEvent('motiondeck:open-animate'))}
                  />
                  <QuickAction label="Duplicate" onClick={() => duplicateLayer(id)} />
                  <QuickAction label="Delete" danger onClick={() => removeLayers([id])} />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QuickAction({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        'rounded-[5px] px-2 py-0.5 text-[10.5px] font-semibold shadow-md',
        danger ? 'bg-[#3a1f24] text-[#fca5a5]' : 'bg-[var(--color-ink-800)] text-[var(--color-ink-100)] hover:bg-[var(--color-ink-700)]',
      )}
    >
      {label}
    </button>
  );
}

/* ----------------------------------------------------------- geometry */

type Bounds = { w: number; h: number };

export function approximateBounds(
  layer: Layer,
  assets: { id: string; width?: number; height?: number }[],
  canvas: { width: number; height: number },
): Bounds {
  switch (layer.type) {
    case 'video': {
      const asset = assets.find((a) => a.id === layer.assetId);
      const live = mediaSize(asset);
      const layout = videoLayoutRect(layer, { ...asset, ...live } as never, canvas, live);
      return { w: layout.frameW * layer.scale, h: layout.frameH * layer.scale };
    }
    case 'image': {
      const asset = assets.find((a) => a.id === layer.assetId);
      return { w: (asset?.width ?? 600) * layer.scale, h: (asset?.height ?? 400) * layer.scale };
    }
    case 'text': {
      const lines = layer.text.split('\n').length;
      return {
        w: Math.min(layer.maxWidth, Math.max(80, layer.text.length * layer.fontSize * 0.52)) * layer.scale,
        h: lines * layer.fontSize * layer.lineHeight * layer.scale,
      };
    }
    case 'shape':
    case 'callout':
      return { w: layer.size.width * layer.scale, h: layer.size.height * layer.scale };
    case 'frame':
      return { w: layer.size.width * layer.scale, h: layer.size.height * layer.scale };
    default:
      return { w: 100, h: 100 };
  }
}

function hitTestLayer(
  layer: Layer,
  state: ReturnType<typeof useEditor.getState>,
  px: number,
  py: number,
): boolean {
  const canvas = state.project.canvas;
  const box = approximateBounds(layer, state.project.assets, canvas);
  const cx = canvas.width / 2 + layer.position.x;
  const cy = canvas.height / 2 + layer.position.y;
  // Rotate point into layer local space for accurate hit-testing.
  const rad = (-layer.rotation * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return lx >= -box.w / 2 && lx <= box.w / 2 && ly >= -box.h / 2 && ly <= box.h / 2;
}

/** Converts a canvas click into normalised coordinates inside a video layer's footage. */
function canvasPointToSource(
  layer: VideoLayer,
  state: ReturnType<typeof useEditor.getState>,
  px: number,
  py: number,
): { x: number; y: number } | null {
  const canvas = state.project.canvas;
  const asset = state.project.assets.find((a) => a.id === layer.assetId);
  const layout = videoLayoutRect(layer, asset, canvas, mediaSize(asset));
  const frame = getFrame(layer.frame.kind);

  const frameW = layout.frameW * layer.scale;
  const frameH = layout.frameH * layer.scale;
  const screenW = frame ? frameW * frame.screenRect.width : frameW;
  const screenH = frame ? frameH * frame.screenRect.height : frameH;
  const left =
    canvas.width / 2 + layer.position.x - frameW / 2 + (frame ? frameW * frame.screenRect.x : 0);
  const top =
    canvas.height / 2 + layer.position.y - frameH / 2 + (frame ? frameH * frame.screenRect.y : 0);

  const rx = (px - left) / screenW;
  const ry = (py - top) / screenH;
  if (rx < -0.05 || rx > 1.05 || ry < -0.05 || ry > 1.05) return null;

  const crop = cropAtTime(layer, 0);
  return {
    x: clamp(crop.x + rx * crop.width, 0, 1),
    y: clamp(crop.y + ry * crop.height, 0, 1),
  };
}
