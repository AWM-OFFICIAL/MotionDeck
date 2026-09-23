/** Editor layout: top bar, sidebar, canvas, inspector, scene strip, timeline. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useEditor } from '../state/editorStore';
import { MediaPool } from '../render/mediaPool';
import { importMedia } from '../platform/mediaImport';
import type { RecordingResult } from '../platform/recorder';
import { CanvasStage } from './CanvasStage';
import { Inspector } from './Inspector';
import { Sidebar, useMediaImport } from './Sidebar';
import { SceneStrip } from './SceneStrip';
import { Timeline } from './Timeline';
import { TopBar } from './TopBar';
import { RecordDialog } from './RecordDialog';
import { ExportDialog } from './ExportDialog';
import { AnimateDialog } from './AnimateDialog';
import { AppScreenCropDialog } from './AppScreenCropDialog';
import {
  BeginnerGuideDialog,
  BeginnerTipStrip,
  CanvasEmptyGuide,
  shouldAutoOpenGuide,
} from './BeginnerGuide';
import { placeVideoAsset } from './placeFootage';
import { usePlayback } from './usePlayback';
import { useShortcuts } from './useShortcuts';
import { Toasts } from '../ui/Toasts';
import { clamp } from '../core/easing';

interface Props {
  onExit: () => void;
}

export function EditorShell({ onExit }: Props) {
  const pool = useMemo(() => new MediaPool(), []);
  const assets = useEditor((s) => s.project.assets);
  const mode = useEditor((s) => s.mode);
  const timelineHeight = useEditor((s) => s.timelineHeight);
  const setTimelineHeight = useEditor((s) => s.setTimelineHeight);
  const addAssets = useEditor((s) => s.addAssets);
  const showToast = useEditor((s) => s.showToast);
  const addFocusPointAtPlayhead = useEditor((s) => s.addFocusPointAtPlayhead);

  const animateLayer = useEditor((s) => {
    const id = s.selectedLayerIds[0];
    return id ? s.findLayer(id) ?? null : null;
  });

  const [recordOpen, setRecordOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropLayerId, setCropLayerId] = useState<string | null>(null);
  const [focusPickMode, setFocusPickMode] = useState(false);
  const [cursorMarkMode, setCursorMarkMode] = useState(false);

  usePlayback(pool);
  useShortcuts({
    onExport: () => setExportOpen(true),
    onRecord: () => setRecordOpen(true),
  });

  useEffect(() => {
    pool.syncAssets(assets);
  }, [assets, pool]);

  useEffect(() => {
    pool.onMediaInfo = (id, info) => {
      useEditor.getState().updateAssetDimensions(id, info.width, info.height);
    };
    return () => {
      pool.onMediaInfo = undefined;
    };
  }, [pool]);

  useEffect(() => () => pool.dispose(), [pool]);

  // Home and Quick Start can ask the editor to open the recorder or file picker
  // as soon as it mounts, without either of them importing editor internals.
  const importInputRef = useRef<HTMLInputElement>(null);
  const { importFiles } = useMediaImport();
  useEffect(() => {
    if (shouldAutoOpenGuide()) {
      const t = window.setTimeout(() => setGuideOpen(true), 600);
      return () => window.clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const openAnimate = () => {
      if (useEditor.getState().selectedLayerIds.length > 0) setAnimateOpen(true);
      else showToast('Select an element to animate.', 'info');
    };
    const openGuide = () => setGuideOpen(true);
    const openCrop = (e: Event) => {
      const detail = (e as CustomEvent<{ layerId?: string }>).detail;
      const id =
        detail?.layerId ??
        useEditor.getState().selectedLayerIds.find((lid) => {
          const layer = useEditor.getState().findLayer(lid);
          return layer?.type === 'video';
        });
      if (!id) {
        showToast('Select a screen recording first.', 'info');
        return;
      }
      setCropLayerId(id);
      setCropOpen(true);
    };
    window.addEventListener('motiondeck:open-animate', openAnimate);
    window.addEventListener('motiondeck:open-guide', openGuide);
    window.addEventListener('motiondeck:crop-app-screen', openCrop);
    return () => {
      window.removeEventListener('motiondeck:open-animate', openAnimate);
      window.removeEventListener('motiondeck:open-guide', openGuide);
      window.removeEventListener('motiondeck:crop-app-screen', openCrop);
    };
  }, [showToast]);

  useEffect(() => {
    const openRecord = () => setRecordOpen(true);
    const openImport = () => importInputRef.current?.click();
    window.addEventListener('motiondeck:open-record', openRecord);
    window.addEventListener('motiondeck:open-import', openImport);
    return () => {
      window.removeEventListener('motiondeck:open-record', openRecord);
      window.removeEventListener('motiondeck:open-import', openImport);
    };
  }, []);

  /* ---------------------------------------------------- recording */

  const onRecordingComplete = useCallback(
    async (result: RecordingResult) => {
      try {
        const asset = await importMedia(result.blob, {
          name: `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          mimeType: result.mimeType,
          recording: result.metadata,
          fps: result.metadata.fps,
        });
        // MediaRecorder's own duration is authoritative when the container lacks one.
        const duration = asset.duration > 0.2 ? asset.duration : result.duration;
        addAssets([{ ...asset, duration }]);
        placeVideoAsset({ ...asset, duration }, 'Screen Recording');

        const clicks = result.metadata.cursor.filter((e) => e.down).length;
        if (result.metadata.cursorCaptured && clicks > 0) {
          showToast(
            `Recording added. ${clicks} clicks captured — try Crop App Screen or Focus on Click.`,
            'success',
          );
        } else {
          showToast(
            'Recording added. For emulator demos, click Crop App Screen to isolate the phone.',
            'info',
          );
        }
        // Offer the app-screen crop workflow after any screen capture.
        window.setTimeout(() => {
          const video = useEditor
            .getState()
            .project.scenes.flatMap((s) => s.layers)
            .find((l) => l.type === 'video');
          if (video) {
            setCropLayerId(video.id);
            setCropOpen(true);
          }
        }, 400);
      } catch (err) {
        console.error('[MotionDeck] could not save recording', err);
        showToast("We couldn't save that recording. Try recording a shorter clip.", 'error');
      }
    },
    [addAssets, showToast],
  );

  /* ------------------------------------------------ timeline resize */

  const resizing = useRef(false);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!resizing.current) return;
      setTimelineHeight(clamp(window.innerHeight - e.clientY, 140, window.innerHeight * 0.6));
    };
    const up = () => (resizing.current = false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [setTimelineHeight]);

  const showTimeline = mode === 'advanced';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-ink-900)]">
      <TopBar
        onExit={onExit}
        onHelp={() => setGuideOpen(true)}
        onExport={() => setExportOpen(true)}
        onPreview={() => {
          useEditor.getState().setPlayhead(0);
          useEditor.getState().play();
        }}
      />
      <BeginnerTipStrip onOpenGuide={() => setGuideOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <Sidebar onRecord={() => setRecordOpen(true)} />

        <main className="flex min-w-0 flex-1 flex-col">
          <CanvasStage
            pool={pool}
            focusPickMode={focusPickMode}
            cursorMarkMode={cursorMarkMode}
            onFocusPicked={(layerId, x, y) => {
              addFocusPointAtPlayhead(layerId, x, y);
              setFocusPickMode(false);
              showToast('Focus point added. The camera will push in here.', 'success');
            }}
            emptyGuide={
              <CanvasEmptyGuide
                onRecord={() => setRecordOpen(true)}
                onImport={() => importInputRef.current?.click()}
                onOpenGuide={() => setGuideOpen(true)}
              />
            }
          />
          <SceneStrip />

          {showTimeline && (
            <>
              <div
                role="separator"
                aria-label="Resize timeline"
                onPointerDown={() => (resizing.current = true)}
                className="h-1 shrink-0 cursor-ns-resize bg-[var(--color-ink-800)] transition-colors hover:bg-[var(--color-accent)]"
              />
              <div className="shrink-0 overflow-hidden" style={{ height: timelineHeight }}>
                <Timeline />
              </div>
            </>
          )}

          {!showTimeline && <QuickHint />}
        </main>

        <Inspector
          focusPickMode={focusPickMode}
          onToggleFocusPick={() => {
            setFocusPickMode((v) => !v);
            setCursorMarkMode(false);
          }}
          cursorMarkMode={cursorMarkMode}
          onToggleCursorMark={() => {
            setCursorMarkMode((v) => !v);
            setFocusPickMode(false);
          }}
        />
      </div>

      <RecordDialog
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onComplete={(result) => void onRecordingComplete(result)}
      />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} pool={pool} />
      <AnimateDialog
        open={animateOpen}
        layer={animateLayer}
        onClose={() => setAnimateOpen(false)}
      />
      <AppScreenCropDialog
        open={cropOpen}
        layerId={cropLayerId}
        onClose={() => {
          setCropOpen(false);
          setCropLayerId(null);
        }}
      />
      <BeginnerGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
      <input
        ref={importInputRef}
        type="file"
        accept="video/*,image/*,audio/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void importFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <Toasts />
    </div>
  );
}

/** Quick Mode replaces the timeline with a compact strip of the scene's layers. */
function QuickHint() {
  const scene = useEditor((s) => s.project.scenes[s.activeSceneIndex]);
  const selectedIds = useEditor((s) => s.selectedLayerIds);
  const selectLayers = useEditor((s) => s.selectLayers);
  const setMode = useEditor((s) => s.setMode);

  return (
    <div className="hairline-t flex h-[52px] shrink-0 items-center gap-2 overflow-x-auto bg-[var(--color-ink-850)] px-3">
      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-500)]">
        Layers
      </span>
      {scene.layers.length === 0 ? (
        <span className="text-[12px] text-[var(--color-ink-500)]">
          Nothing here yet — record or import to begin.
        </span>
      ) : (
        [...scene.layers].reverse().map((layer) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => selectLayers([layer.id])}
            className={clsx(
              'shrink-0 rounded-[7px] border px-2.5 py-1.5 text-[12px] transition-colors',
              selectedIds.includes(layer.id)
                ? 'border-[var(--color-accent)] bg-[rgba(34,211,238,0.1)] text-[var(--color-accent)]'
                : 'border-[var(--color-ink-700)] text-[var(--color-ink-200)] hover:border-[var(--color-ink-500)]',
            )}
          >
            {layer.name}
          </button>
        ))
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setMode('advanced')}
        className="shrink-0 text-[11.5px] text-[var(--color-accent)] hover:opacity-80"
      >
        Show timeline
      </button>
    </div>
  );
}
