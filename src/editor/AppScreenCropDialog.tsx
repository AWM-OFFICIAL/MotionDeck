/**
 * Android App Screen crop editor.
 *
 * Non-destructive: only writes VideoLayer.crop + appScreen metadata.
 * Preview toggles between the full recording and the cropped app screen.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APP_SCREEN_ASPECTS,
  centeredAspectCrop,
  cropPresetRect,
  defaultAppScreen,
  detectAppScreenFromVideo,
  lockCropToAspect,
  normalizeCrop,
  radiusForShape,
  type DetectedAppScreen,
} from '../core/appScreen';
import { analyseCropTrack, emptyCropTrack, upsertManualCropKeyframe } from '../core/cropTrack';
import type { AppScreenCropMode, CropTrack, Rect, VideoLayer } from '../core/types';
import { getMediaUrl } from '../platform/mediaVault';
import { useEditor } from '../state/editorStore';
import { Button, Dialog, Segmented, Toggle } from '../ui/primitives';

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

interface Props {
  open: boolean;
  layerId: string | null;
  onClose: () => void;
}

const PRESETS: { id: AppScreenCropMode; label: string }[] = [
  { id: 'detected', label: 'App Screen' },
  { id: 'androidPortrait', label: 'Android Portrait' },
  { id: 'androidCompact', label: 'Android Compact' },
  { id: 'custom', label: 'Custom' },
];

/** Letterboxed video rect inside the stage (object-contain). */
function videoContentRect(
  stageW: number,
  stageH: number,
  videoW: number,
  videoH: number,
): { x: number; y: number; w: number; h: number } {
  if (stageW < 1 || stageH < 1 || videoW < 1 || videoH < 1) {
    return { x: 0, y: 0, w: stageW, h: stageH };
  }
  const stageAspect = stageW / stageH;
  const videoAspect = videoW / videoH;
  if (videoAspect > stageAspect) {
    const w = stageW;
    const h = w / videoAspect;
    return { x: 0, y: (stageH - h) / 2, w, h };
  }
  const h = stageH;
  const w = h * videoAspect;
  return { x: (stageW - w) / 2, y: 0, w, h };
}

/** Resize crop while keeping aspect, anchored to the opposite edge/corner. */
function resizeCropWithAspect(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  aspect: number,
): Rect {
  let { x, y, width, height } = start;
  const right = x + width;
  const bottom = y + height;

  if (handle === 'e' || handle === 'w') {
    if (handle === 'e') width = start.width + dx;
    else {
      x = start.x + dx;
      width = start.width - dx;
    }
    width = Math.max(0.05, width);
    height = width / aspect;
    // Keep vertical centre of the original box
    y = start.y + start.height / 2 - height / 2;
    if (handle === 'w') x = right - width;
  } else if (handle === 'n' || handle === 's') {
    if (handle === 's') height = start.height + dy;
    else {
      y = start.y + dy;
      height = start.height - dy;
    }
    height = Math.max(0.05, height);
    width = height * aspect;
    x = start.x + start.width / 2 - width / 2;
    if (handle === 'n') y = bottom - height;
  } else {
    // Corners: drive from the dominant delta, anchor opposite corner.
    const fromW = handle.includes('w');
    const fromN = handle.includes('n');
    let nextW = fromW ? start.width - dx : start.width + dx;
    let nextH = fromN ? start.height - dy : start.height + dy;
    // Pick the axis that moved more (in aspect-normalised space)
    if (Math.abs(dx) * aspect > Math.abs(dy)) {
      nextW = Math.max(0.05, nextW);
      nextH = nextW / aspect;
    } else {
      nextH = Math.max(0.05, nextH);
      nextW = nextH * aspect;
    }
    width = nextW;
    height = nextH;
    x = fromW ? right - width : start.x;
    y = fromN ? bottom - height : start.y;
  }

  return normalizeCrop({ x, y, width, height });
}

function resizeCropFree(start: Rect, handle: Handle, dx: number, dy: number): Rect {
  const next = { ...start };
  if (handle.includes('e')) next.width = start.width + dx;
  if (handle.includes('w')) {
    next.x = start.x + dx;
    next.width = start.width - dx;
  }
  if (handle.includes('s')) next.height = start.height + dy;
  if (handle.includes('n')) {
    next.y = start.y + dy;
    next.height = start.height - dy;
  }
  return normalizeCrop(next);
}

export function AppScreenCropDialog({ open, layerId, onClose }: Props) {
  const layer = useEditor((s) =>
    layerId ? (s.findLayer(layerId) as VideoLayer | undefined) : undefined,
  );
  const asset = useEditor((s) =>
    layer ? s.project.assets.find((a) => a.id === layer.assetId) : undefined,
  );
  const updateLayer = useEditor((s) => s.updateLayer<VideoLayer>);
  const showToast = useEditor((s) => s.showToast);

  const [url, setUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const [mode, setMode] = useState<AppScreenCropMode>('detected');
  const [lockedAspect, setLockedAspect] = useState(false);
  const [aspect, setAspect] = useState(APP_SCREEN_ASPECTS.androidPortrait);
  const [preview, setPreview] = useState<'original' | 'crop'>('original');
  const [detected, setDetected] = useState<DetectedAppScreen | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [videoSize, setVideoSize] = useState({ w: 16, h: 9 });
  const [cropMode, setCropMode] = useState<'static' | 'tracked'>('static');
  const [track, setTrack] = useState<CropTrack | null>(null);
  const [trackProgress, setTrackProgress] = useState<number | null>(null);
  const [contentBox, setContentBox] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const abortRef = useRef<AbortController | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const lockedRef = useRef(lockedAspect);
  lockedRef.current = lockedAspect;
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    startCrop: Rect;
    content: { x: number; y: number; w: number; h: number };
  } | null>(null);

  useEffect(() => {
    if (!open || !asset) return;
    let cancelled = false;
    void getMediaUrl(asset.storageKey).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [open, asset]);

  useEffect(() => {
    if (!open || !layer) return;
    setCrop(normalizeCrop(layer.crop));
    setMode(layer.appScreen?.mode ?? 'detected');
    // Default unlocked so edge handles work as users expect; presets can re-lock.
    setLockedAspect(layer.appScreen?.lockedAspect ?? false);
    setAspect(layer.appScreen?.aspectRatio ?? APP_SCREEN_ASPECTS.androidPortrait);
    setPreview('original');
    setCropMode(layer.appScreen?.cropTrack?.mode === 'tracked' ? 'tracked' : 'static');
    setTrack(layer.appScreen?.cropTrack ?? null);
    setTrackProgress(null);
  }, [open, layer]);

  // Keep content box in sync with stage + video size (object-contain).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !open) return;
    const update = () => {
      const r = stage.getBoundingClientRect();
      setContentBox(videoContentRect(r.width, r.height, videoSize.w, videoSize.h));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [open, videoSize.w, videoSize.h, url]);

  const runTracking = async () => {
    if (!url || !layer || !asset) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTrackProgress(0);
    setCropMode('tracked');
    try {
      const result = await analyseCropTrack(url, crop, layer.duration || asset.duration || 5, {
        sampleInterval: Math.max(0.35, Math.min(1.2, (layer.duration || 5) / 40)),
        signal: controller.signal,
        existingManual: track?.keyframes.filter((k) => k.manual),
        sourceMediaId: asset.id,
        onProgress: (p) => setTrackProgress(p.progress),
      });
      setTrack(result);
      if (result.keyframes[0]) setCrop(result.keyframes[0].rect);
      showToast(result.message ?? 'Tracking finished.', result.status === 'failed' ? 'info' : 'success');
    } catch {
      setTrack({
        ...emptyCropTrack(crop),
        mode: 'tracked',
        status: 'failed',
        avgConfidence: 0,
        message: "Tracking couldn't reliably follow this area. You can adjust the crop manually.",
      });
    } finally {
      setTrackProgress(null);
    }
  };

  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    setDetecting(true);
    void detectAppScreenFromVideo(url, 0.5)
      .then((result) => {
        if (cancelled) return;
        setDetected(result);
        if (result && (!layer?.appScreen?.enabled || layer.crop.width >= 0.99)) {
          setCrop(result.crop);
          setAspect(result.aspect);
          setMode('detected');
          // Only lock aspect when detection is a clear phone inset, not full-bleed.
          setLockedAspect(result.crop.width < 0.9 || result.crop.height < 0.9);
        }
      })
      .finally(() => {
        if (!cancelled) setDetecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, url, layer?.appScreen?.enabled, layer?.crop.width]);

  const applyPreset = (next: AppScreenCropMode) => {
    setMode(next);
    if (next === 'custom') {
      setLockedAspect(false);
      return;
    }
    const rect = cropPresetRect(next, detected?.crop);
    setCrop(rect);
    if (next === 'androidPortrait') {
      setAspect(APP_SCREEN_ASPECTS.androidPortrait);
      setLockedAspect(true);
    } else if (next === 'androidCompact') {
      setAspect(APP_SCREEN_ASPECTS.androidCompact);
      setLockedAspect(true);
    } else if (next === 'detected' && detected) {
      setAspect(detected.aspect);
      setLockedAspect(detected.crop.width < 0.9 || detected.crop.height < 0.9);
    }
  };

  const onPointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const content = videoContentRect(stageRect.width, stageRect.height, videoSize.w, videoSize.h);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...cropRef.current },
      content,
    };

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { content: c } = drag;
      if (c.w < 1 || c.h < 1) return;
      // Deltas in normalised *video* space (not stage space — object-contain aware).
      const dx = (ev.clientX - drag.startX) / c.w;
      const dy = (ev.clientY - drag.startY) / c.h;
      let next: Rect;
      if (drag.handle === 'move') {
        next = normalizeCrop({
          ...drag.startCrop,
          x: drag.startCrop.x + dx,
          y: drag.startCrop.y + dy,
        });
      } else if (lockedRef.current && aspectRef.current > 0) {
        next = resizeCropWithAspect(drag.startCrop, drag.handle, dx, dy, aspectRef.current);
      } else {
        next = resizeCropFree(drag.startCrop, drag.handle, dx, dy);
      }
      setCrop(next);
      setMode('custom');
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const apply = () => {
    if (!layer) return;
    const finalCrop =
      lockedAspect && aspect > 0 ? lockCropToAspect(crop, aspect) : normalizeCrop(crop);
    const originalCrop = layer.appScreen?.originalCrop ?? { ...layer.crop };
    const cropTrack = cropMode === 'tracked' && track ? track : emptyCropTrack(finalCrop);
    if (cropMode === 'static') {
      cropTrack.mode = 'static';
      cropTrack.keyframes = [];
      cropTrack.status = 'idle';
    }
    const appScreen = defaultAppScreen({
      ...layer.appScreen,
      enabled: true,
      mode,
      lockedAspect,
      aspectRatio: lockedAspect ? aspect : null,
      originalCrop,
      animateFullRecording: false,
      trackingEnabled: cropMode === 'tracked',
      cropTrack,
      shape: layer.appScreen?.shape ?? 'rounded',
      cornerPreset: layer.appScreen?.cornerPreset ?? 'android',
    });
    updateLayer(
      layer.id,
      {
        crop: finalCrop,
        name: layer.name.includes('App Screen') ? layer.name : 'App Screen',
        appScreen,
        cornerRadius: radiusForShape(appScreen.shape, appScreen.cornerPreset, layer.cornerRadius),
        frame: { kind: 'none', url: layer.frame.url },
        background:
          layer.background.type === 'transparent'
            ? { type: 'dynamic', blur: 48, scale: 1.35, brightness: 0.55 }
            : layer.background,
      },
      'Crop app screen',
    );
    showToast('App screen cropped. Add a phone frame or motion next.', 'success');
    onClose();
  };

  const aspectLabel = useMemo(() => {
    const a = crop.width / Math.max(crop.height, 1e-6);
    return a.toFixed(3);
  }, [crop]);

  // Overlay positions mapped into the letterboxed video content area.
  const overlayStyle = {
    left: contentBox.x + crop.x * contentBox.w,
    top: contentBox.y + crop.y * contentBox.h,
    width: crop.width * contentBox.w,
    height: crop.height * contentBox.h,
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Crop App Screen"
      description="Isolate the Android app display. The original recording stays untouched."
      width={760}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={apply} disabled={!layer}>
            Apply Crop
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={mode === p.id ? 'primary' : 'ghost'}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
          <div className="flex-1" />
          <Segmented
            value={preview}
            options={[
              { id: 'original', label: 'Original' },
              { id: 'crop', label: 'App Screen' },
            ]}
            onChange={(v) => setPreview(v as 'original' | 'crop')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-[var(--color-ink-900)] px-2.5 py-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-500)]">
            Crop mode
          </span>
          <Segmented
            value={cropMode}
            options={[
              { id: 'static', label: 'Static' },
              { id: 'tracked', label: 'Track' },
            ]}
            onChange={(v) => setCropMode(v as 'static' | 'tracked')}
          />
          {cropMode === 'tracked' && (
            <>
              <Button size="sm" onClick={() => void runTracking()} disabled={trackProgress !== null || !url}>
                {track?.status === 'ready' ? 'Re-track' : 'Track App Screen'}
              </Button>
              {track?.status === 'ready' && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPreview('crop');
                      showToast('Scrub the source in App Screen preview to review tracking.', 'info');
                    }}
                  >
                    Preview Tracking
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!track) return;
                      setTrack(upsertManualCropKeyframe(track, 0, crop));
                      showToast('Edit Tracking · correction keyframe at 0:00. Adjust the box and add more.', 'info');
                    }}
                  >
                    Edit Tracking
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!track) return;
                      setTrack(upsertManualCropKeyframe(track, 0, crop));
                      showToast('Correction keyframe added at the start.', 'info');
                    }}
                  >
                    Add correction
                  </Button>
                </>
              )}
            </>
          )}
        </div>
        {trackProgress !== null && (
          <div className="space-y-1">
            <p className="text-[12px] text-[var(--color-ink-300)]">Tracking App Screen…</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-ink-700)]">
              <div
                className="h-full bg-[var(--color-accent)] transition-all"
                style={{ width: `${Math.round(trackProgress * 100)}%` }}
              />
            </div>
          </div>
        )}
        {cropMode === 'tracked' && track && trackProgress === null && (
          <p className="text-[12px] text-[var(--color-ink-300)]">
            {track.status === 'ready' ? 'Tracking Complete. ' : ''}
            {track.message}
          </p>
        )}

        {detecting && (
          <p className="text-[12px] text-[var(--color-ink-400)]">Detecting mobile display…</p>
        )}
        {!detecting && detected && (
          <p className="text-[12px] text-[var(--color-ink-300)]">
            {detected.reason}{' '}
            <span className="text-[var(--color-ink-500)]">
              ({Math.round(detected.confidence * 100)}% confidence)
            </span>
          </p>
        )}

        <div
          ref={stageRef}
          className="relative overflow-hidden rounded-[10px] bg-[#08090b]"
          style={{ aspectRatio: `${videoSize.w} / ${videoSize.h}`, maxHeight: 420 }}
        >
          {url ? (
            <video
              src={url}
              muted
              playsInline
              className="pointer-events-none h-full w-full object-contain"
              style={
                preview === 'crop'
                  ? {
                      objectPosition: 'center',
                      clipPath: `inset(${crop.y * 100}% ${(1 - crop.x - crop.width) * 100}% ${(1 - crop.y - crop.height) * 100}% ${crop.x * 100}%)`,
                    }
                  : undefined
              }
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth > 0) setVideoSize({ w: v.videoWidth, h: v.videoHeight });
                v.currentTime = Math.min(0.5, (v.duration || 1) * 0.1);
              }}
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-[12px] text-[var(--color-ink-500)]">
              Loading recording…
            </div>
          )}

          {preview === 'original' && (
            <>
              {/* Dim outside the crop — four panels so we don't fight letterboxing */}
              <div
                className="pointer-events-none absolute bg-black/55"
                style={{ left: 0, top: 0, width: '100%', height: Math.max(0, overlayStyle.top) }}
              />
              <div
                className="pointer-events-none absolute bg-black/55"
                style={{
                  left: 0,
                  top: overlayStyle.top + overlayStyle.height,
                  width: '100%',
                  bottom: 0,
                }}
              />
              <div
                className="pointer-events-none absolute bg-black/55"
                style={{
                  left: 0,
                  top: overlayStyle.top,
                  width: Math.max(0, overlayStyle.left),
                  height: overlayStyle.height,
                }}
              />
              <div
                className="pointer-events-none absolute bg-black/55"
                style={{
                  left: overlayStyle.left + overlayStyle.width,
                  top: overlayStyle.top,
                  right: 0,
                  height: overlayStyle.height,
                }}
              />
              <div
                className="absolute border-2 border-[var(--color-accent)]"
                style={{
                  left: overlayStyle.left,
                  top: overlayStyle.top,
                  width: overlayStyle.width,
                  height: overlayStyle.height,
                  touchAction: 'none',
                }}
                onPointerDown={onPointerDown('move')}
              >
                {(['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as Handle[]).map((h) => (
                  <span
                    key={h}
                    onPointerDown={onPointerDown(h)}
                    className="absolute z-10 h-3.5 w-3.5 rounded-[2px] border border-[#0c0d10] bg-[var(--color-accent)]"
                    style={handleStyle(h)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Left" value={`${Math.round(crop.x * 100)}%`} />
          <Metric label="Top" value={`${Math.round(crop.y * 100)}%`} />
          <Metric label="Width" value={`${Math.round(crop.width * 100)}%`} />
          <Metric label="Height" value={`${Math.round(crop.height * 100)}%`} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12px] text-[var(--color-ink-300)]">
            Aspect ratio <span className="tabular text-[var(--color-ink-100)]">{aspectLabel}</span>
          </div>
          <Toggle
            label="Lock aspect ratio"
            checked={lockedAspect}
            onChange={(v) => {
              setLockedAspect(v);
              if (v) setCrop(lockCropToAspect(crop, aspect));
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (detected) {
                setCrop(detected.crop);
                setMode('detected');
              } else {
                setCrop(centeredAspectCrop(APP_SCREEN_ASPECTS.androidPortrait));
              }
            }}
          >
            Reset detection
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-[var(--color-ink-900)] px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-500)]">
        {label}
      </div>
      <div className="tabular text-[13px] text-[var(--color-ink-100)]">{value}</div>
    </div>
  );
}

function handleStyle(h: Handle): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    touchAction: 'none',
  };
  if (h === 'nw') return { ...base, left: 0, top: 0, cursor: 'nwse-resize' };
  if (h === 'ne') return { ...base, left: '100%', top: 0, cursor: 'nesw-resize' };
  if (h === 'sw') return { ...base, left: 0, top: '100%', cursor: 'nesw-resize' };
  if (h === 'se') return { ...base, left: '100%', top: '100%', cursor: 'nwse-resize' };
  if (h === 'n') return { ...base, left: '50%', top: 0, cursor: 'ns-resize' };
  if (h === 's') return { ...base, left: '50%', top: '100%', cursor: 'ns-resize' };
  if (h === 'e') return { ...base, left: '100%', top: '50%', cursor: 'ew-resize' };
  if (h === 'w') return { ...base, left: 0, top: '50%', cursor: 'ew-resize' };
  return base;
}

/** Helper for callers that only need to open the dialog for a layer. */
export function openAppScreenCrop(layerId: string) {
  window.dispatchEvent(new CustomEvent('motiondeck:crop-app-screen', { detail: { layerId } }));
}
