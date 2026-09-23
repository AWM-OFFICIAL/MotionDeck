/**
 * Timeline.
 *
 * Deliberately simpler than a pro NLE: one lane per layer type, drag to move,
 * edge-drag to trim, snapping to neighbours and the playhead. Keyframes appear as
 * diamonds only once a layer actually has them, so beginners never see them.
 */

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../state/editorStore';
import type { AnimatableProperty, Layer } from '../core/types';
import { clamp } from '../core/easing';
import { getWaveformPeaks } from '../platform/waveform';
import { IconButton, Tooltip } from '../ui/primitives';
import {
  IconAudio,
  IconCallout,
  IconCamera,
  IconEye,
  IconEyeOff,
  IconLock,
  IconMedia,
  IconShape,
  IconSplit,
  IconText,
  IconTrash,
  IconUnlock,
} from '../ui/icons';

const LANE_HEIGHT = 34;
const HEADER_WIDTH = 168;
const RULER_HEIGHT = 26;

const LAYER_ICON: Record<Layer['type'], typeof IconMedia> = {
  video: IconMedia,
  image: IconMedia,
  text: IconText,
  shape: IconShape,
  callout: IconCallout,
  frame: IconMedia,
  audio: IconAudio,
};

const LAYER_TINT: Record<Layer['type'], string> = {
  video: 'bg-[#1c4a56] border-[#2b7488] hover:bg-[#215a68]',
  image: 'bg-[#1c4a56] border-[#2b7488] hover:bg-[#215a68]',
  text: 'bg-[#3a3560] border-[#544b8a] hover:bg-[#443d70]',
  shape: 'bg-[#2c4a34] border-[#3f6b4a] hover:bg-[#345840]',
  callout: 'bg-[#5a4320] border-[#87642f] hover:bg-[#6a5026]',
  frame: 'bg-[#2f3540] border-[#4b5563] hover:bg-[#3a4250]',
  audio: 'bg-[#4a2f45] border-[#6f4667] hover:bg-[#583753]',
};

type DragKind = 'move' | 'trimStart' | 'trimEnd';

interface DragState {
  kind: DragKind;
  layerId: string;
  startX: number;
  origStart: number;
  origDuration: number;
  origTrimStart: number;
}

export function Timeline() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const scene = useEditor((s) => s.project.scenes[s.activeSceneIndex]);
  const playhead = useEditor((s) => s.playhead);
  const pxPerSecond = useEditor((s) => s.timelinePxPerSecond);
  const setPxPerSecond = useEditor((s) => s.setTimelinePxPerSecond);
  const selectedIds = useEditor((s) => s.selectedLayerIds);
  const selectLayers = useEditor((s) => s.selectLayers);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const updateLayer = useEditor((s) => s.updateLayer);
  const removeLayers = useEditor((s) => s.removeLayers);
  const splitLayer = useEditor((s) => s.splitLayerAtPlayhead);
  const mode = useEditor((s) => s.mode);

  const duration = useMemo(
    () => Math.max(scene.duration, ...scene.layers.map((l) => l.start + l.duration), 2),
    [scene],
  );
  const contentWidth = duration * pxPerSecond + 120;

  /* ------------------------------------------------------- scrubbing */

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const scroll = scrollRef.current?.scrollLeft ?? 0;
      return clamp((clientX - rect.left + scroll) / pxPerSecond, 0, duration);
    },
    [pxPerSecond, duration],
  );

  const scrubbing = useRef(false);
  const startScrub = (e: React.PointerEvent) => {
    scrubbing.current = true;
    useEditor.getState().pause();
    setPlayhead(timeFromClientX(e.clientX));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  /* ---------------------------------------------------- clip dragging */

  useEffect(() => {
    if (!drag) return;

    const snapTargets = [
      0,
      duration,
      ...scene.layers.filter((l) => l.id !== drag.layerId).flatMap((l) => [l.start, l.start + l.duration]),
    ];
    const snap = (value: number, threshold: number) => {
      let best = value;
      let bestDist = threshold;
      for (const target of [...snapTargets, useEditor.getState().playhead]) {
        const dist = Math.abs(target - value);
        if (dist < bestDist) {
          bestDist = dist;
          best = target;
        }
      }
      return best;
    };

    const move = (e: PointerEvent) => {
      const deltaSeconds = (e.clientX - drag.startX) / pxPerSecond;
      const threshold = 8 / pxPerSecond;
      const layer = scene.layers.find((l) => l.id === drag.layerId);
      if (!layer) return;

      if (drag.kind === 'move') {
        const start = Math.max(0, e.shiftKey ? drag.origStart + deltaSeconds : snap(drag.origStart + deltaSeconds, threshold));
        updateLayer(drag.layerId, { start }, 'Move clip', true);
        return;
      }

      if (drag.kind === 'trimStart') {
        const rawStart = clamp(drag.origStart + deltaSeconds, 0, drag.origStart + drag.origDuration - 0.15);
        const start = e.shiftKey ? rawStart : snap(rawStart, threshold);
        const delta = start - drag.origStart;
        const patch: Partial<Layer> & { trimStart?: number } = {
          start,
          duration: drag.origDuration - delta,
        };
        // Trimming the head of a media clip must advance its in-point too.
        if (layer.type === 'video' || layer.type === 'audio') {
          patch.trimStart = Math.max(0, drag.origTrimStart + delta);
        }
        updateLayer(drag.layerId, patch as Partial<Layer>, 'Trim clip', true);
        return;
      }

      const rawEnd = Math.max(drag.origStart + 0.15, drag.origStart + drag.origDuration + deltaSeconds);
      const end = e.shiftKey ? rawEnd : snap(rawEnd, threshold);
      updateLayer(drag.layerId, { duration: end - drag.origStart }, 'Trim clip', true);
    };

    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, duration, pxPerSecond, scene.layers, updateLayer]);

  /* ------------------------------------------------------------ ruler */

  const tickStep = useMemo(() => {
    const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    return candidates.find((c) => c * pxPerSecond >= 62) ?? 600;
  }, [pxPerSecond]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= duration + tickStep; t += tickStep) out.push(Number(t.toFixed(3)));
    return out;
  }, [duration, tickStep]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-ink-850)]">
      {/* toolbar */}
      <div className="hairline-b flex h-9 shrink-0 items-center gap-1 px-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-400)]">
          Timeline
        </span>
        <div className="mx-2 h-4 w-px bg-[var(--color-ink-700)]" />
        <IconButton label="Split at playhead (S)" size="sm" onClick={splitLayer}>
          <IconSplit size={15} />
        </IconButton>
        <IconButton
          label="Delete selected (Del)"
          size="sm"
          tone="danger"
          disabled={selectedIds.length === 0}
          onClick={() => removeLayers(selectedIds)}
        >
          <IconTrash size={15} />
        </IconButton>

        <div className="flex-1" />

        <span className="text-[11px] text-[var(--color-ink-500)]">Zoom</span>
        <input
          type="range"
          aria-label="Timeline zoom"
          min={12}
          max={420}
          step={1}
          value={pxPerSecond}
          onChange={(e) => setPxPerSecond(Number(e.target.value))}
          className="w-28"
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* lane headers */}
        <div
          className="hairline-r shrink-0 overflow-hidden bg-[var(--color-ink-850)]"
          style={{ width: HEADER_WIDTH }}
        >
          <div className="hairline-b" style={{ height: RULER_HEIGHT }} />
          <div className="overflow-y-auto" style={{ maxHeight: `calc(100% - ${RULER_HEIGHT}px)` }}>
            {scene.layers.length === 0 && (
              <p className="px-3 py-4 text-[11.5px] leading-relaxed text-[var(--color-ink-500)]">
                Record or import to add your first clip.
              </p>
            )}
            {[...scene.layers].reverse().map((layer) => {
              const Icon = LAYER_ICON[layer.type];
              return (
                <div
                  key={layer.id}
                  onClick={() => selectLayers([layer.id])}
                  className={clsx(
                    'group flex cursor-pointer items-center gap-1.5 px-2.5',
                    selectedIds.includes(layer.id) && 'bg-[rgba(34,211,238,0.07)]',
                  )}
                  style={{ height: LANE_HEIGHT }}
                >
                  <Icon size={13} className="shrink-0 text-[var(--color-ink-400)]" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-ink-200)]">
                    {layer.name}
                  </span>
                  <button
                    type="button"
                    aria-label={layer.hidden ? `Show ${layer.name}` : `Hide ${layer.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, { hidden: !layer.hidden }, 'Toggle visibility');
                    }}
                    className="shrink-0 text-[var(--color-ink-500)] opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    {layer.hidden ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                  </button>
                  <button
                    type="button"
                    aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, { locked: !layer.locked }, 'Toggle lock');
                    }}
                    className="shrink-0 text-[var(--color-ink-500)] opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    {layer.locked ? <IconLock size={13} /> : <IconUnlock size={13} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* tracks */}
        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-auto">
          <div ref={trackRef} className="relative" style={{ width: contentWidth }}>
            {/* ruler */}
            <div
              className="hairline-b sticky top-0 z-20 cursor-ew-resize bg-[var(--color-ink-850)]"
              style={{ height: RULER_HEIGHT }}
              onPointerDown={startScrub}
              onPointerMove={(e) => scrubbing.current && setPlayhead(timeFromClientX(e.clientX))}
              onPointerUp={() => (scrubbing.current = false)}
            >
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: t * pxPerSecond }}>
                  <div className="h-2 w-px bg-[var(--color-ink-600)]" />
                  <span className="tabular absolute left-1 top-1.5 text-[10px] text-[var(--color-ink-500)]">
                    {formatTick(t)}
                  </span>
                </div>
              ))}
            </div>

            {/* lanes */}
            <div className="relative">
              {[...scene.layers].reverse().map((layer, index) => (
                <div
                  key={layer.id}
                  className={clsx('relative', index % 2 === 1 && 'bg-[rgba(255,255,255,0.012)]')}
                  style={{ height: LANE_HEIGHT }}
                >
                  <Clip
                    layer={layer}
                    pxPerSecond={pxPerSecond}
                    selected={selectedIds.includes(layer.id)}
                    showKeyframes={mode === 'advanced'}
                    onSelect={(additive) => {
                      if (additive) useEditor.getState().toggleLayerSelected(layer.id);
                      else selectLayers([layer.id]);
                    }}
                    onDragStart={(kind, clientX) =>
                      setDrag({
                        kind,
                        layerId: layer.id,
                        startX: clientX,
                        origStart: layer.start,
                        origDuration: layer.duration,
                        origTrimStart:
                          layer.type === 'video' || layer.type === 'audio' ? layer.trimStart : 0,
                      })
                    }
                  />
                </div>
              ))}

              {/* scene end marker */}
              <div
                className="pointer-events-none absolute top-0 h-full w-px bg-[var(--color-ink-600)]"
                style={{ left: scene.duration * pxPerSecond }}
              />
            </div>

            {/* playhead */}
            <div
              className="pointer-events-none absolute top-0 z-30 h-full"
              style={{ left: playhead * pxPerSecond }}
            >
              <div className="h-full w-px bg-[var(--color-accent)]" />
              <div className="absolute -left-[5px] top-0 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-[var(--color-accent)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ clip */

function Clip({
  layer,
  pxPerSecond,
  selected,
  showKeyframes,
  onSelect,
  onDragStart,
}: {
  layer: Layer;
  pxPerSecond: number;
  selected: boolean;
  showKeyframes: boolean;
  onSelect: (additive: boolean) => void;
  onDragStart: (kind: DragKind, clientX: number) => void;
}) {
  const left = layer.start * pxPerSecond;
  const width = Math.max(14, layer.duration * pxPerSecond);
  const keyframeEntries = showKeyframes
    ? (Object.entries(layer.keyframes) as [AnimatableProperty, { id: string; time: number }[]][])
    : [];

  const motionBands: { label: string; start: number; end: number; color: string }[] = [];
  if (layer.motion.entrance !== 'none') {
    motionBands.push({
      label: 'In',
      start: 0,
      end: Math.min(layer.duration, layer.motion.entranceDuration),
      color: 'bg-[#22d3ee]/70',
    });
  }
  if (layer.motion.idle !== 'none') {
    const inEnd = layer.motion.entrance !== 'none' ? layer.motion.entranceDuration : 0;
    const outStart =
      layer.motion.exit !== 'none' ? Math.max(0, layer.duration - layer.motion.exitDuration) : layer.duration;
    if (outStart > inEnd) {
      motionBands.push({
        label: 'Emp',
        start: inEnd,
        end: outStart,
        color: 'bg-[#a78bfa]/55',
      });
    }
  }
  if (layer.motion.exit !== 'none') {
    motionBands.push({
      label: 'Out',
      start: Math.max(0, layer.duration - layer.motion.exitDuration),
      end: layer.duration,
      color: 'bg-[#fb7185]/65',
    });
  }

  const assetId = layer.type === 'video' || layer.type === 'audio' ? layer.assetId : null;
  const storageKey = useEditor((s) =>
    assetId ? s.project.assets.find((a) => a.id === assetId)?.storageKey : undefined,
  );
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    if (!storageKey || (layer.type !== 'audio' && layer.type !== 'video')) {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    const buckets = Math.max(24, Math.min(160, Math.round(width / 3)));
    void getWaveformPeaks(storageKey, buckets).then((data) => {
      if (!cancelled) setPeaks(data);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey, layer.type, width]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${layer.name}, ${layer.duration.toFixed(1)} seconds`}
      onPointerDown={(e) => {
        if (layer.locked) return;
        onSelect(e.metaKey || e.ctrlKey);
        onDragStart('move', e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(false);
        }
      }}
      className={clsx(
        'absolute top-1 flex h-[26px] items-center overflow-hidden rounded-[5px] border text-[11.5px] transition-colors',
        LAYER_TINT[layer.type],
        layer.locked ? 'cursor-not-allowed opacity-60' : 'cursor-grab active:cursor-grabbing',
        layer.hidden && 'opacity-40',
        selected && 'ring-1 ring-[var(--color-accent)] ring-offset-0',
      )}
      style={{ left, width }}
    >
      {peaks && peaks.some((v) => v > 0) && (
        <WaveformSvg peaks={peaks} className="pointer-events-none absolute inset-0 opacity-55" />
      )}
      <span className="pointer-events-none relative z-[1] truncate px-2 text-[var(--color-ink-100)]">
        {layer.name}
      </span>

      {motionBands.map((band) => (
        <Tooltip key={band.label} content={`${band.label} · ${layer.motion.entrance}/${layer.motion.idle}/${layer.motion.exit}`}>
          <span
            className={clsx('pointer-events-none absolute bottom-0 z-[1] h-[3px] rounded-sm', band.color)}
            style={{
              left: (band.start / Math.max(layer.duration, 0.01)) * width,
              width: Math.max(2, ((band.end - band.start) / Math.max(layer.duration, 0.01)) * width),
            }}
          />
        </Tooltip>
      ))}

      {keyframeEntries.map(([property, track]) =>
        track.map((kf) => (
          <Tooltip key={kf.id} content={`${property} keyframe at ${kf.time.toFixed(2)}s`}>
            <span
              className="pointer-events-none absolute top-1/2 z-[1] h-1.5 w-1.5 -translate-y-1/2 rotate-45 bg-[var(--color-warn)]"
              style={{ left: kf.time * pxPerSecond - 3 }}
            />
          </Tooltip>
        )),
      )}

      {layer.type === 'video' &&
        layer.camera.focusPoints.map((fp, index) => (
          <Tooltip key={fp.id} content={`Focus ${index + 1} · ${fp.time.toFixed(2)}s`}>
            <button
              type="button"
              className="absolute top-0.5 z-[2] h-2 w-2 -translate-x-1/2 rounded-full border border-[#0c0d10] bg-[var(--color-accent)]"
              style={{ left: fp.time * pxPerSecond }}
              onPointerDown={(e) => {
                e.stopPropagation();
                useEditor.getState().setPlayhead(layer.start + fp.time);
                useEditor.getState().selectLayers([layer.id]);
              }}
              aria-label={`Focus ${index + 1}`}
            />
          </Tooltip>
        ))}

      {!layer.locked && (
        <>
          <span
            role="separator"
            aria-label="Trim start"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDragStart('trimStart', e.clientX);
            }}
            className="absolute left-0 top-0 z-[2] h-full w-1.5 cursor-ew-resize hover:bg-white/25"
          />
          <span
            role="separator"
            aria-label="Trim end"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDragStart('trimEnd', e.clientX);
            }}
            className="absolute right-0 top-0 z-[2] h-full w-1.5 cursor-ew-resize hover:bg-white/25"
          />
        </>
      )}
    </div>
  );
}

function WaveformSvg({ peaks, className }: { peaks: Float32Array; className?: string }) {
  const mid = 13;
  const path = Array.from(peaks, (v, i) => {
    const x = (i / Math.max(peaks.length - 1, 1)) * 100;
    const h = Math.max(1, v * 10);
    return `M${x} ${mid - h} V${mid + h}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" className={className} aria-hidden>
      <path d={path} stroke="rgba(255,255,255,0.55)" strokeWidth={0.6} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function formatTick(seconds: number): string {
  if (seconds < 60) return `${Number(seconds.toFixed(2))}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export { IconCamera };
