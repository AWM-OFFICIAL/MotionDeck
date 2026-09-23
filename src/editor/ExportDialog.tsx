/**
 * Export dialog.
 *
 * Rendering runs on the main thread (it needs `HTMLVideoElement` seeking) but yields
 * between frames, so the dialog stays interactive and cancellable throughout.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../state/editorStore';
import type { ExportSettings } from '../core/types';
import { CANVAS_PRESETS } from '../core/defaults';
import { ExportError, estimateFileSize, runExport, saveExport, type ExportProgress } from '../export/exporter';
import type { MediaPool } from '../render/mediaPool';
import { formatBytes } from '../platform/mediaImport';
import { detectCapabilities, type Capabilities } from '../platform/env';
import {
  Button,
  Dialog,
  Field,
  Segmented,
  Select,
  Slider,
  StatusPill,
  Toggle,
} from '../ui/primitives';
import { IconAlert, IconCheck, IconExport } from '../ui/icons';
import { usePrefersReducedMotion } from './useReducedMotion';

interface Props {
  open: boolean;
  onClose: () => void;
  pool: MediaPool;
}

const FORMATS: { id: ExportSettings['format']; label: string; blurb: string }[] = [
  { id: 'mp4', label: 'MP4', blurb: 'Best for sharing anywhere.' },
  { id: 'webm', label: 'WebM', blurb: 'Smaller files, web-native.' },
  { id: 'gif', label: 'GIF', blurb: 'Looping, no audio.' },
  { id: 'png', label: 'PNG', blurb: 'Single frame, lossless.' },
  { id: 'jpg', label: 'JPG', blurb: 'Single frame, small.' },
];

export function ExportDialog({ open, onClose, pool }: Props) {
  const project = useEditor((s) => s.project);
  const settings = useEditor((s) => s.project.exportSettings);
  const setExportSettings = useEditor((s) => s.setExportSettings);
  const activeSceneIndex = useEditor((s) => s.activeSceneIndex);
  const playhead = useEditor((s) => s.playhead);
  const showToast = useEditor((s) => s.showToast);
  const reducedMotion = usePrefersReducedMotion();

  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);
  const [done, setDone] = useState<{ path: string; size: number } | null>(null);
  const [wholeProject, setWholeProject] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) void detectCapabilities().then(setCaps);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setProgress(null);
      setError(null);
      setDone(null);
    }
  }, [open]);

  const duration = useMemo(() => {
    const scenes = wholeProject ? project.scenes : [project.scenes[activeSceneIndex]];
    return scenes.reduce(
      (sum, s) => sum + Math.max(s.duration, ...s.layers.map((l) => l.start + l.duration), 0.1),
      0,
    );
  }, [project.scenes, activeSceneIndex, wholeProject]);

  const isVideo = settings.format === 'mp4' || settings.format === 'webm';
  const isStill = settings.format === 'png' || settings.format === 'jpg';
  const estimated = estimateFileSize(settings, duration);
  const mp4Unavailable = settings.format === 'mp4' && caps !== null && !caps.webCodecs;

  const start = async () => {
    setError(null);
    setDone(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await runExport({
        project,
        settings,
        pool,
        sceneIndex: isStill || !wholeProject ? activeSceneIndex : undefined,
        playhead,
        reducedMotion,
        signal: controller.signal,
        onProgress: setProgress,
      });
      const path = await saveExport(result.blob, result.filename);
      if (path) {
        setDone({ path, size: result.blob.size });
        showToast('Export complete.', 'success');
      } else {
        setProgress(null);
      }
    } catch (err) {
      if (err instanceof ExportError) setError({ message: err.message, hint: err.hint });
      else {
        console.error('[MotionDeck] export failed', err);
        setError({
          message: "We couldn't export this video.",
          hint: 'Try a lower resolution or the WebM format. If it keeps failing, export a shorter scene.',
        });
      }
      setProgress(null);
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
  };

  const running = progress !== null && progress.phase !== 'done';

  return (
    <Dialog
      open={open}
      onClose={running ? cancel : onClose}
      title="Export"
      description={`${duration.toFixed(1)} seconds · ${wholeProject ? project.scenes.length : 1} scene${wholeProject && project.scenes.length !== 1 ? 's' : ''}`}
      width={560}
      footer={
        running ? (
          <Button variant="danger" onClick={cancel}>
            Cancel export
          </Button>
        ) : done ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={<IconExport size={14} />} onClick={start} disabled={mp4Unavailable}>
              Export {settings.format.toUpperCase()}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col items-center py-8 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(52,211,153,0.12)] text-[var(--color-ok)]">
            <IconCheck size={24} />
          </span>
          <p className="text-[14px] font-semibold text-[var(--color-ink-50)]">Export complete</p>
          <p className="mt-1 max-w-[380px] break-all text-[12px] text-[var(--color-ink-400)]">{done.path}</p>
          <p className="mt-1 text-[12px] text-[var(--color-ink-500)]">{formatBytes(done.size)}</p>
        </div>
      ) : running ? (
        <div className="py-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[13px] text-[var(--color-ink-100)]">{progress.message}</span>
            <span className="tabular text-[12px] text-[var(--color-ink-400)]">
              {Math.round(progress.progress * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-ink-700)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-200"
              style={{ width: `${Math.max(2, progress.progress * 100)}%` }}
            />
          </div>
          {progress.etaSeconds !== null && progress.etaSeconds > 1 && (
            <p className="mt-2 text-[11.5px] text-[var(--color-ink-500)]">
              About {formatEta(progress.etaSeconds)} remaining. You can keep working — this window
              stays responsive.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="flex gap-2.5 rounded-[8px] border border-[#5c2a2e] bg-[#2a1416] px-3 py-2.5">
              <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
              <div>
                <p className="text-[12.5px] font-medium text-[var(--color-danger)]">{error.message}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--color-ink-300)]">{error.hint}</p>
              </div>
            </div>
          )}

          {mp4Unavailable && (
            <div className="flex gap-2.5 rounded-[8px] border border-[#5c4a1e] bg-[#251e10] px-3 py-2.5">
              <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--color-warn)]" />
              <p className="text-[11.5px] leading-relaxed text-[var(--color-ink-200)]">
                MP4 encoding is unavailable in this environment. Choose WebM or GIF, or use the
                MotionDeck desktop app.
              </p>
            </div>
          )}

          {caps?.ffmpeg && (
            <p className="text-[11px] leading-relaxed text-[var(--color-ink-500)]">
              System FFmpeg is available for converting unusual imports. This export is rendered
              in MotionDeck with WebCodecs.
            </p>
          )}

          {duration > 600 && (
            <p className="text-[11px] leading-relaxed text-[var(--color-ink-400)]">
              This project is {Math.round(duration / 60)} minutes long. Export stays cancellable and
              yields to the UI between frames — expect several minutes for a full render.
            </p>
          )}

          <div>
            <p className="mb-2 text-[11px] font-medium text-[var(--color-ink-300)]">Format</p>
            <div className="grid grid-cols-5 gap-1.5">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  title={f.blurb}
                  onClick={() => setExportSettings({ format: f.id })}
                  className={
                    settings.format === f.id
                      ? 'rounded-[8px] border border-[var(--color-accent)] bg-[rgba(34,211,238,0.1)] py-2 text-[12px] font-semibold text-[var(--color-accent)]'
                      : 'rounded-[8px] border border-[var(--color-ink-700)] py-2 text-[12px] text-[var(--color-ink-300)] transition-colors hover:border-[var(--color-ink-500)] hover:text-[var(--color-ink-100)]'
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--color-ink-500)]">
              {FORMATS.find((f) => f.id === settings.format)?.blurb}
            </p>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-medium text-[var(--color-ink-300)]">Size</p>
            <div className="grid grid-cols-3 gap-1.5">
              {CANVAS_PRESETS.slice(0, 6).map((preset) => {
                const active = settings.width === preset.size.width && settings.height === preset.size.height;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setExportSettings({ width: preset.size.width, height: preset.size.height })}
                    className={
                      active
                        ? 'rounded-[8px] border border-[var(--color-accent)] bg-[rgba(34,211,238,0.1)] px-2 py-2 text-left'
                        : 'rounded-[8px] border border-[var(--color-ink-700)] px-2 py-2 text-left transition-colors hover:border-[var(--color-ink-500)]'
                    }
                  >
                    <span
                      className={
                        active
                          ? 'block text-[12px] font-medium text-[var(--color-accent)]'
                          : 'block text-[12px] font-medium text-[var(--color-ink-100)]'
                      }
                    >
                      {preset.label}
                    </span>
                    <span className="tabular block text-[10.5px] text-[var(--color-ink-500)]">
                      {preset.size.width} × {preset.size.height}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {!isStill && (
            <div className="grid grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Frame rate">
                <Segmented
                  size="sm"
                  value={String(settings.fps)}
                  options={[
                    { id: '24', label: '24' },
                    { id: '30', label: '30' },
                    { id: '60', label: '60' },
                  ]}
                  onChange={(v) => setExportSettings({ fps: Number(v) })}
                />
              </Field>

              {isVideo && (
                <Field label="Quality">
                  <Select
                    value={settings.quality}
                    options={[
                      { id: 'draft', label: 'Draft — fast' },
                      { id: 'good', label: 'Good' },
                      { id: 'high', label: 'High' },
                    ]}
                    onChange={(quality) => setExportSettings({ quality })}
                  />
                </Field>
              )}

              {isVideo && (
                <div className="col-span-2">
                  <Field label="Bitrate">
                    <Slider
                      value={settings.bitrateMbps}
                      min={2}
                      max={60}
                      step={1}
                      onChange={(bitrateMbps) => setExportSettings({ bitrateMbps })}
                      format={(v) => `${Math.round(v)} Mbps`}
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          {project.scenes.length > 1 && (
            <label className="flex items-center justify-between gap-3 rounded-[9px] bg-[var(--color-ink-900)] px-3.5 py-3">
              <span>
                <span className="block text-[12.5px] text-[var(--color-ink-100)]">
                  Export all {project.scenes.length} scenes
                </span>
                <span className="block text-[11px] text-[var(--color-ink-500)]">
                  Turn this off to export only the scene you are editing.
                </span>
              </span>
              <Toggle label="Export all scenes" checked={wholeProject} onChange={setWholeProject} />
            </label>
          )}

          <div className="flex items-center justify-between rounded-[9px] bg-[var(--color-ink-900)] px-3.5 py-3">
            <span className="text-[12px] text-[var(--color-ink-300)]">Estimated size</span>
            <StatusPill tone="muted">≈ {formatBytes(estimated)}</StatusPill>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
  const m = Math.ceil(seconds / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}
