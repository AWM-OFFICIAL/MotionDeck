/**
 * Right inspector.
 *
 * Contents follow the selection. Beginner controls (presets, one-click actions) sit
 * at the top and are always open; precise numeric controls live in collapsed sections.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../state/editorStore';
import type {
  AnimatableProperty,
  CalloutLayer,
  CameraMode,
  Layer,
  ShapeLayer,
  TextAnimation,
  TextLayer,
  VideoLayer,
} from '../core/types';
import {
  Button,
  Chip,
  Collapsible,
  ColorSwatch,
  EmptyState,
  Field,
  IconButton,
  NumberInput,
  PanelSection,
  Segmented,
  Select,
  Slider,
  StatusPill,
  TextInput,
  Toggle,
  Tooltip,
} from '../ui/primitives';
import {
  IconCamera,
  IconCursor,
  IconKeyframe,
  IconSparkle,
  IconTrash,
} from '../ui/icons';
import {
  ENTRANCE_OPTIONS,
  EXIT_OPTIONS,
  FEEL_OPTIONS,
  IDLE_OPTIONS,
  MOTION_GROUPS,
  MOTION_PRESETS,
  TEXT_COPY_PRESETS,
  matchMotionPreset,
} from '../library/motionPresets';
import {
  applyAppScreenShape,
  defaultAppScreen,
  FULL_CROP,
  isAppScreenActive,
  SHADOW_PRESETS,
} from '../core/appScreen';
import { createFrameLayer, defaultBorder, defaultGlow } from '../core/defaults';
import { AUTO_TAP_PACKS, buildAutoTapPack, createManualTap, listDetectedInteractions } from '../library/autoTap';
import type { DetectedInteraction } from '../library/autoTap';
import { labelDetectedInteractions, hasTextDetectionSupport } from '../core/interactionLabels';
import { getMediaUrl } from '../platform/mediaVault';
import { videoLayoutRect } from '../render/compositor';
import type { AutoTapPackId } from '../library/autoTap';
import type { BorderSpec, FrameLayer, GlowSpec, MotionBlurLevel } from '../core/types';
import { BACKGROUND_PRESETS } from '../render/background';
import { FRAME_OPTIONS, getFrame } from '../render/frames';
import { CLICK_EFFECT_OPTIONS, CURSOR_STYLE_OPTIONS } from '../render/cursor';
import { COMPOSITION_PRESETS, autoDesign } from '../library/autoDesign';
import { buildFocusPointsFromClicks } from '../core/camera';
import { resolveLayerTransform } from '../core/animation';
import { detectInteractionsFromVideo } from '../core/detectInteractions';
import { cropAtTime } from '../core/cropTrack';
import { mediaSourceLabel, importMedia, guessMime } from '../platform/mediaImport';
import type { CursorEvent, MotionSpec } from '../core/types';
import { DetectedTapsDialog } from './DetectedTapsDialog';
import { openAppScreenCrop } from './AppScreenCropDialog';

interface Props {
  focusPickMode: boolean;
  onToggleFocusPick: () => void;
  cursorMarkMode: boolean;
  onToggleCursorMark: () => void;
}

export function Inspector({ focusPickMode, onToggleFocusPick, cursorMarkMode, onToggleCursorMark }: Props) {
  const selectedIds = useEditor((s) => s.selectedLayerIds);
  const scene = useEditor((s) => s.project.scenes[s.activeSceneIndex]);
  const layer = useMemo(
    () => (selectedIds.length === 1 ? scene.layers.find((l) => l.id === selectedIds[0]) : undefined),
    [scene.layers, selectedIds],
  );

  return (
    <aside
      className="hairline-l flex w-[288px] shrink-0 flex-col overflow-hidden bg-[var(--color-ink-850)]"
      aria-label="Inspector"
    >
      <header className="hairline-b flex h-10 shrink-0 items-center px-3.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-400)]">
          {layer ? layer.name : selectedIds.length > 1 ? `${selectedIds.length} selected` : 'Scene'}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!layer && selectedIds.length === 0 && <SceneInspector />}
        {!layer && selectedIds.length > 1 && <MultiInspector ids={selectedIds} />}
        {layer && (
          <LayerInspector
            layer={layer}
            focusPickMode={focusPickMode}
            onToggleFocusPick={onToggleFocusPick}
            cursorMarkMode={cursorMarkMode}
            onToggleCursorMark={onToggleCursorMark}
          />
        )}
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------- scene */

function SceneInspector() {
  const index = useEditor((s) => s.activeSceneIndex);
  const scene = useEditor((s) => s.project.scenes[s.activeSceneIndex]);
  const updateScene = useEditor((s) => s.updateScene);
  const setSceneBackground = useEditor((s) => s.setSceneBackground);
  const layerCount = scene.layers.length;

  return (
    <div>
      {layerCount === 0 && (
        <PanelSection title="Start here">
          <p className="mb-2 text-[12px] leading-relaxed text-[var(--color-ink-300)]">
            Nothing is selected yet. Record or import a screen recording from the Create panel on
            the left, then click it on the canvas.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('motiondeck:open-guide'))}
            className="text-[11.5px] font-medium text-[var(--color-accent)] hover:opacity-80"
          >
            How do I…?
          </button>
        </PanelSection>
      )}

      <PanelSection title="Scene">
        <div className="space-y-3">
          <Field label="Name">
            <TextInput
              value={scene.name}
              onChange={(e) => updateScene(index, { name: e.target.value }, 'Rename scene')}
            />
          </Field>
          <Field label="Duration" inline>
            <NumberInput
              value={scene.duration}
              onChange={(v) => updateScene(index, { duration: Math.max(0.5, v) }, 'Change scene duration')}
              min={0.5}
              max={3600}
              step={0.5}
              precision={1}
              suffix="s"
            />
          </Field>
          <Field label="Transition in">
            <Select
              value={scene.transitionIn.kind}
              options={[
                { id: 'none', label: 'None' },
                { id: 'fade', label: 'Fade' },
                { id: 'slide', label: 'Slide' },
                { id: 'zoom', label: 'Zoom' },
                { id: 'blur', label: 'Blur' },
                { id: 'wipe', label: 'Wipe' },
              ]}
              onChange={(kind) =>
                updateScene(index, { transitionIn: { ...scene.transitionIn, kind } }, 'Change transition')
              }
            />
          </Field>
          {scene.transitionIn.kind !== 'none' && (
            <Field label="Transition duration">
              <Slider
                value={scene.transitionIn.duration}
                min={0.1}
                max={2}
                step={0.05}
                onChange={(duration) =>
                  updateScene(
                    index,
                    { transitionIn: { ...scene.transitionIn, duration } },
                    'Change transition duration',
                  )
                }
                format={(value) => `${value.toFixed(2)}s`}
              />
            </Field>
          )}
        </div>
      </PanelSection>

      <PanelSection title="Background">
        <div className="grid grid-cols-5 gap-1.5">
          {BACKGROUND_PRESETS.map((preset) => (
            <Tooltip key={preset.id} content={preset.label}>
              <button
                type="button"
                aria-label={preset.label}
                onClick={() => setSceneBackground(preset.spec)}
                className="h-9 rounded-[6px] border border-[var(--color-ink-700)] transition-transform hover:scale-[1.06] hover:border-[var(--color-ink-400)]"
                style={{ background: swatchCss(preset.id) }}
              />
            </Tooltip>
          ))}
        </div>

        {scene.background.type === 'solid' && (
          <div className="mt-3">
            <Field label="Colour">
              <ColorSwatch
                label="Background colour"
                value={scene.background.color}
                onChange={(color) => setSceneBackground({ type: 'solid', color })}
              />
            </Field>
          </div>
        )}
        {scene.background.type === 'gradient' && (
          <div className="mt-3 space-y-2.5">
            <Field label="From">
              <ColorSwatch
                label="Gradient start"
                value={scene.background.from}
                onChange={(from) =>
                  setSceneBackground({ ...(scene.background as { type: 'gradient'; from: string; to: string; angle: number }), from })
                }
              />
            </Field>
            <Field label="To">
              <ColorSwatch
                label="Gradient end"
                value={scene.background.to}
                onChange={(to) =>
                  setSceneBackground({ ...(scene.background as { type: 'gradient'; from: string; to: string; angle: number }), to })
                }
              />
            </Field>
            <Field label="Angle" inline>
              <NumberInput
                value={scene.background.angle}
                onChange={(angle) =>
                  setSceneBackground({ ...(scene.background as { type: 'gradient'; from: string; to: string; angle: number }), angle })
                }
                min={0}
                max={360}
                suffix="°"
              />
            </Field>
          </div>
        )}
      </PanelSection>
    </div>
  );
}

function swatchCss(id: string): string {
  const preset = BACKGROUND_PRESETS.find((p) => p.id === id);
  if (!preset) return '#222';
  const s = preset.spec;
  if (s.type === 'solid') return s.color;
  if (s.type === 'gradient') return `linear-gradient(${s.angle}deg, ${s.from}, ${s.to})`;
  if (s.type === 'mesh')
    return `radial-gradient(at 25% 25%, ${s.colors[1]}, transparent 60%), radial-gradient(at 75% 70%, ${s.colors[2]}, transparent 60%), ${s.colors[0]}`;
  if (s.type === 'dynamic') return 'linear-gradient(135deg,#2a3340,#0d1116)';
  return 'repeating-conic-gradient(#2a2d33 0% 25%, #191c20 0% 50%) 0 0/8px 8px';
}

/* ------------------------------------------------------------- multi */

function MultiInspector({ ids }: { ids: string[] }) {
  const removeLayers = useEditor((s) => s.removeLayers);
  const groupSelectedLayers = useEditor((s) => s.groupSelectedLayers);
  const ungroupSelectedLayers = useEditor((s) => s.ungroupSelectedLayers);
  const alignSelectedLayers = useEditor((s) => s.alignSelectedLayers);

  return (
    <PanelSection title="Selection">
      <p className="mb-3 text-[12px] leading-relaxed text-[var(--color-ink-300)]">
        {ids.length} layers selected.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Button size="sm" onClick={groupSelectedLayers}>
          Group
        </Button>
        <Button size="sm" variant="ghost" onClick={ungroupSelectedLayers}>
          Ungroup
        </Button>
      </div>
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-500)]">
        Align
      </p>
      <div className="mb-3 grid grid-cols-3 gap-1">
        {(
          [
            ['left', 'Left'],
            ['center', 'Center'],
            ['right', 'Right'],
            ['top', 'Top'],
            ['middle', 'Middle'],
            ['bottom', 'Bottom'],
          ] as const
        ).map(([mode, label]) => (
          <Button key={mode} size="sm" variant="ghost" onClick={() => alignSelectedLayers(mode)}>
            {label}
          </Button>
        ))}
      </div>
      <Button variant="danger" size="sm" icon={<IconTrash size={14} />} onClick={() => removeLayers(ids)}>
        Delete all
      </Button>
    </PanelSection>
  );
}

/* -------------------------------------------------------------- layer */

function LayerInspector({
  layer,
  focusPickMode,
  onToggleFocusPick,
  cursorMarkMode,
  onToggleCursorMark,
}: {
  layer: Layer;
  focusPickMode: boolean;
  onToggleFocusPick: () => void;
  cursorMarkMode: boolean;
  onToggleCursorMark: () => void;
}) {
  const mode = useEditor((s) => s.mode);
  const updateLayer = useEditor((s) => s.updateLayer);
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const removeLayers = useEditor((s) => s.removeLayers);

  return (
    <div>
      {layer.type === 'video' && (
        <VideoQuickActions
          layer={layer}
          focusPickMode={focusPickMode}
          onToggleFocusPick={onToggleFocusPick}
          cursorMarkMode={cursorMarkMode}
          onToggleCursorMark={onToggleCursorMark}
        />
      )}
      {layer.type === 'video' && <AppScreenPanel layer={layer} />}
      {layer.type === 'frame' && <FrameLayerInspector layer={layer} />}
      {layer.type !== 'video' && layer.type !== 'audio' && <AttachToAppScreen layer={layer} />}
      {(layer.type === 'video' || layer.type === 'frame' || layer.type === 'image') && (
        <EffectsInspector layer={layer} />
      )}

      <Collapsible title="Transform" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X" inline={false}>
            <NumberInput
              value={layer.position.x}
              onChange={(x) => updateLayer(layer.id, { position: { ...layer.position, x } }, 'Move layer', true)}
              step={1}
            />
          </Field>
          <Field label="Y">
            <NumberInput
              value={layer.position.y}
              onChange={(y) => updateLayer(layer.id, { position: { ...layer.position, y } }, 'Move layer', true)}
              step={1}
            />
          </Field>
        </div>
        <Field label="Scale">
          <Slider
            value={layer.scale}
            min={0.05}
            max={3}
            step={0.01}
            onChange={(scale) => updateLayer(layer.id, { scale }, 'Scale layer', true)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Field>
        <Field label="Rotation">
          <Slider
            value={layer.rotation}
            min={-180}
            max={180}
            step={0.5}
            onChange={(rotation) => updateLayer(layer.id, { rotation }, 'Rotate layer', true)}
            format={(v) => `${Math.round(v)}°`}
          />
        </Field>
        <Field label="Opacity">
          <Slider
            value={layer.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(opacity) => updateLayer(layer.id, { opacity }, 'Change opacity', true)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Field>
      </Collapsible>

      {layer.type === 'video' && <VideoAppearance layer={layer} />}
      {layer.type === 'text' && <TextInspector layer={layer} />}
      {layer.type === 'shape' && <ShapeInspector layer={layer} />}
      {layer.type === 'callout' && <CalloutInspector layer={layer} />}
      {layer.type === 'audio' && <AudioInspector layer={layer} />}

      <MotionInspector layer={layer} />

      {layer.type === 'video' && <CameraInspector layer={layer} focusPickMode={focusPickMode} onToggleFocusPick={onToggleFocusPick} />}
      {layer.type === 'video' && <CursorInspector layer={layer} />}

      {mode === 'advanced' && <KeyframeInspector layer={layer} />}

      <Collapsible title="Timing">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start">
            <NumberInput
              value={layer.start}
              onChange={(start) => updateLayer(layer.id, { start: Math.max(0, start) }, 'Change timing', true)}
              min={0}
              step={0.1}
              precision={2}
              suffix="s"
            />
          </Field>
          <Field label="Length">
            <NumberInput
              value={layer.duration}
              onChange={(duration) => updateLayer(layer.id, { duration: Math.max(0.1, duration) }, 'Change timing', true)}
              min={0.1}
              step={0.1}
              precision={2}
              suffix="s"
            />
          </Field>
        </div>
      </Collapsible>

      <div className="flex gap-2 p-3.5">
        <Button size="sm" fullWidth onClick={() => duplicateLayer(layer.id)}>
          Duplicate
        </Button>
        <Button size="sm" variant="danger" fullWidth onClick={() => removeLayers([layer.id])}>
          Delete
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------- app screen */

function AppScreenPanel({ layer }: { layer: VideoLayer }) {
  const update = useEditor((s) => s.updateLayer<VideoLayer>);
  const mutate = useEditor((s) => s.mutate);
  const sceneIndex = useEditor((s) => s.activeSceneIndex);
  const project = useEditor((s) => s.project);
  const showToast = useEditor((s) => s.showToast);
  const active = isAppScreenActive(layer);
  const app = layer.appScreen;
  const asset = project.assets.find((a) => a.id === layer.assetId);
  const baseInteractions = useMemo(
    () =>
      asset?.recording?.cursor ? listDetectedInteractions(layer, asset.recording.cursor) : [],
    // Recompute when crop / cursor log changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer.id, layer.crop, layer.appScreen?.cropTrack, asset?.recording?.cursor],
  );
  const [interactions, setInteractions] = useState<DetectedInteraction[]>(baseInteractions);

  useEffect(() => {
    setInteractions(baseInteractions);
    let cancelled = false;
    void (async () => {
      if (!asset || baseInteractions.length === 0) return;
      const url = await getMediaUrl(asset.storageKey);
      if (!url || cancelled) return;
      const labeled = await labelDetectedInteractions(baseInteractions, {
        videoUrl: url,
        layer,
      });
      if (!cancelled) setInteractions(labeled);
    })();
    return () => {
      cancelled = true;
    };
  }, [baseInteractions, asset, layer]);

  const addPhoneFrame = (kind: 'phoneAndroid' | 'phone' | 'phoneGeneric' | 'browserDark') => {
    const frame = createFrameLayer(kind, {
      duration: layer.duration,
      linkedLayerId: layer.id,
      name:
        kind === 'phoneAndroid'
          ? 'Android Phone'
          : kind === 'phone'
            ? 'Pixel-style'
            : kind === 'phoneGeneric'
              ? 'Generic Android'
              : 'Browser',
    });
    frame.start = layer.start;
    frame.position = { ...layer.position };
    frame.groupId = layer.groupId ?? layer.id;
    // Size the frame so its screen rect matches the current app-screen layout.
    const def = getFrame(kind);
    const layout = videoLayoutRect(layer, asset, project.canvas);
    if (def) {
      const screenH = layout.frameH;
      const outerH = screenH / Math.max(def.screenRect.height, 1e-6);
      const outerW = outerH * def.outerAspect;
      frame.size = { width: outerW, height: outerH };
      // Offset frame so its screen center sits on the app screen centre.
      const screenCx = (def.screenRect.x + def.screenRect.width / 2 - 0.5) * outerW;
      const screenCy = (def.screenRect.y + def.screenRect.height / 2 - 0.5) * outerH;
      frame.position = {
        x: layer.position.x - screenCx * layer.scale,
        y: layer.position.y - screenCy * layer.scale,
      };
      frame.scale = layer.scale;
    }
    mutate('Add phone frame', (draft) => {
      const scene = draft.scenes[sceneIndex];
      const idx = scene.layers.findIndex((l) => l.id === layer.id);
      const video = scene.layers.find((l) => l.id === layer.id);
      if (video?.type === 'video') {
        video.frame = { kind: 'none', url: video.frame.url };
        video.groupId = frame.groupId;
        // Nest owns world placement — app screen offsets become nest-local.
        video.position = { x: 0, y: 0 };
        video.rotation = 0;
        video.scale = 1;
      }
      scene.layers.splice(Math.max(0, idx), 0, frame);
    });
    showToast('Phone frame added — app screen is nested inside the bezel.', 'success');
  };

  const removePhoneFrames = () => {
    mutate('No Frame', (draft) => {
      const scene = draft.scenes[sceneIndex];
      scene.layers = scene.layers.filter(
        (l) => !(l.type === 'frame' && l.linkedLayerId === layer.id),
      );
      const video = scene.layers.find((l) => l.id === layer.id);
      if (video?.type === 'video') video.frame = { kind: 'none', url: video.frame.url };
    });
    showToast('Phone frame removed.', 'info');
  };

  const applyAutoTap = async (pack: AutoTapPackId) => {
    let cursor = asset?.recording?.cursor ?? [];
    if (!cursor.length && asset) {
      showToast('No tap data yet — detecting from video…', 'info');
      const url = await getMediaUrl(asset.storageKey);
      if (!url) {
        showToast('Could not load video for tap detection.', 'error');
        return;
      }
      try {
        const result = await detectInteractionsFromVideo(url, {
          duration: layer.duration || asset.duration || 5,
          crop: cropAtTime(layer, 0),
          sampleInterval: Math.min(0.22, Math.max(0.12, (layer.duration || 5) / 40)),
        });
        if (result.tapCount === 0) {
          showToast(result.message + ' Use Add Tap or Mark path.', 'info');
          return;
        }
        useEditor.getState().setCursorSamples(layer.assetId, result.events, {
          inferred: true,
          label: 'Detect taps from video',
        });
        cursor = result.events;
        setInteractions(listDetectedInteractions(layer, cursor));
        showToast(`${result.message} You can Review detected taps to edit them.`, 'success');
      } catch {
        showToast('Tap detection failed. Use Mark path or Add Tap.', 'error');
        return;
      }
    }
    if (!cursor.length) {
      showToast('No taps found. Use Add Tap or Mark path first.', 'info');
      return;
    }
    let labeled = listDetectedInteractions(layer, cursor);
    try {
      const url = await getMediaUrl(asset!.storageKey);
      if (url) {
        labeled = await labelDetectedInteractions(labeled, { videoUrl: url, layer });
        setInteractions(labeled);
      }
    } catch {
      /* position labels remain */
    }
    const layout = videoLayoutRect(layer, asset, project.canvas);
    const result = buildAutoTapPack(layer, cursor, pack, {
      width: layout.frameW,
      height: layout.frameH,
    });
    // Rename generated layers with enriched labels
    for (const gen of result.layers) {
      const match = labeled.find((ix) => Math.abs(layer.start + ix.time - gen.start) < 0.2);
      if (match) {
        gen.name = gen.name.replace(/Tap · .*/, `Tap · ${match.label}`).replace(
          /Highlight · .*/,
          `Highlight · ${match.label}`,
        );
        if (!gen.name.includes(match.label)) {
          gen.name =
            gen.type === 'callout' && gen.callout === 'highlight'
              ? `Highlight · ${match.label}`
              : `Tap · ${match.label}`;
        }
      }
    }
    if (result.layers.length === 0) {
      showToast('No taps landed inside the cropped app screen.', 'info');
      return;
    }
    mutate(`Auto Tap · ${pack}`, (draft) => {
      const scene = draft.scenes[sceneIndex];
      const video = scene.layers.find((l) => l.id === layer.id);
      if (video?.type === 'video' && result.focusPoints.length) {
        video.camera.focusPoints = [
          ...video.camera.focusPoints.filter((p) => !p.auto),
          ...result.focusPoints,
        ].sort((a, b) => a.time - b.time);
        if (video.camera.mode === 'none') video.camera.mode = 'smoothFocus';
      }
      scene.layers.push(...result.layers);
    });
    showToast(
      `Added ${result.layers.length} tap effect${result.layers.length === 1 ? '' : 's'}${
        hasTextDetectionSupport() ? '' : ' · labels use position (Text Detection unavailable)'
      }.`,
      'success',
    );
  };

  return (
    <PanelSection title="Android App Screen">
      <div className="space-y-2.5">
        <Button size="md" fullWidth variant="primary" onClick={() => openAppScreenCrop(layer.id)}>
          {active ? 'Edit Crop' : 'Crop App Screen'}
        </Button>
        <p className="text-[11px] leading-relaxed text-[var(--color-ink-400)]">
          Isolate the phone display from emulator chrome. Source video stays untouched.
        </p>

        {app?.enabled && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['rounded', 'android', 'Rounded'],
                  ['deviceScreen', 'android', 'Device'],
                  ['rect', 'edge', 'Rectangle'],
                  ['deviceScreen', 'iphone', 'iPhone-like'],
                ] as const
              ).map(([shape, preset, label]) => (
                <Chip
                  key={label}
                  active={app.shape === shape && app.cornerPreset === preset}
                  onClick={() =>
                    update(layer.id, applyAppScreenShape(layer, shape, preset), `Shape · ${label}`)
                  }
                >
                  {label}
                </Chip>
              ))}
            </div>

            <div>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-400)]">
                Add phone frame
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Chip onClick={() => addPhoneFrame('phoneAndroid')}>Android Phone</Chip>
                <Chip onClick={() => addPhoneFrame('phone')}>Pixel-style</Chip>
                <Chip onClick={() => addPhoneFrame('phoneGeneric')}>Generic Android</Chip>
                <Chip onClick={() => addPhoneFrame('browserDark')}>Browser</Chip>
                <Chip onClick={removePhoneFrames}>No Frame</Chip>
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-ink-500)]">
                Frame is a separate layer — move, scale, and animate it independently.
              </p>
            </div>

            <Field label="Shadow">
              <div className="flex flex-wrap gap-1.5">
                {SHADOW_PRESETS.map((preset) => (
                  <Chip
                    key={preset.id}
                    active={
                      preset.id === 'none'
                        ? !layer.shadow.enabled
                        : layer.shadow.enabled && Math.abs(layer.shadow.blur - (preset.patch.blur ?? 0)) < 2
                    }
                    onClick={() =>
                      update(
                        layer.id,
                        { shadow: { ...layer.shadow, ...preset.patch, color: layer.shadow.color } },
                        `Shadow · ${preset.label}`,
                      )
                    }
                  >
                    {preset.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <div>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-400)]">
                Auto Tap
              </p>
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {AUTO_TAP_PACKS.map((pack) => (
                  <Tooltip key={pack.id} content={pack.description}>
                    <span>
                      <Chip onClick={() => void applyAutoTap(pack.id)}>{pack.label}</Chip>
                    </span>
                  </Tooltip>
                ))}
              </div>
              {interactions.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[11px] text-[var(--color-ink-400)]">
                    Detected Interactions · {interactions.map((i) => i.label).join(', ')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip onClick={() => void applyAutoTap('premium')}>Apply Auto Tap</Chip>
                    <Chip onClick={() => void applyAutoTap('focus')}>Apply Focus</Chip>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-[var(--color-ink-500)]">
                  No taps detected inside the crop yet. Use Add Tap to place one manually.
                </p>
              )}
              <Button
                size="sm"
                fullWidth
                onClick={() => {
                  const playhead = useEditor.getState().playhead;
                  const layout = videoLayoutRect(layer, asset, project.canvas);
                  const tap = createManualTap(
                    layer.id,
                    { x: 0, y: layout.frameH * -0.12 },
                    Math.max(0, playhead - layer.start),
                    layer.start,
                  );
                  mutate('Add Tap', (draft) => {
                    draft.scenes[sceneIndex].layers.push(tap);
                  });
                  showToast('Tap added on the app screen. Drag it to the UI element.', 'success');
                }}
              >
                Add Tap
              </Button>
            </div>

            <Field label="Safe area guides" inline>
              <div className="flex justify-end">
                <Toggle
                  label="Safe area"
                  checked={!!app.showSafeArea}
                  onChange={(showSafeArea) =>
                    update(
                      layer.id,
                      { appScreen: { ...defaultAppScreen(app), showSafeArea } },
                      'Toggle safe area',
                    )
                  }
                />
              </div>
            </Field>

            <Field label="Animate full recording" inline>
              <div className="flex justify-end">
                <Toggle
                  label="Animate full recording"
                  checked={!!app.animateFullRecording}
                  onChange={(animateFullRecording) =>
                    update(
                      layer.id,
                      {
                        appScreen: { ...defaultAppScreen(app), animateFullRecording },
                      },
                      animateFullRecording ? 'Animate full recording' : 'Animate app screen only',
                    )
                  }
                />
              </div>
            </Field>

            <div className="flex gap-2">
              <Button
                size="sm"
                fullWidth
                onClick={() => {
                  update(
                    layer.id,
                    {
                      crop: app.originalCrop ?? FULL_CROP,
                      appScreen: {
                        ...defaultAppScreen(app),
                        enabled: false,
                        mode: 'none',
                        animateFullRecording: false,
                      },
                      name: layer.name === 'App Screen' ? 'Screen Recording' : layer.name,
                    },
                    'Restore original recording',
                  );
                  showToast('Restored the full recording. Crop is still available via Edit Crop.', 'info');
                }}
              >
                Restore Original
              </Button>
              <Button size="sm" fullWidth onClick={() => openAppScreenCrop(layer.id)}>
                Adjust
              </Button>
            </div>

            <div className="pt-1">
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-400)]">
                App Motion
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'appRise', label: 'App Rise', patch: { entrance: 'floatIn' as const, entranceDuration: 0.75, idle: 'none' as const, feel: 'smooth' as const } },
                  { id: 'mobileZoom', label: 'Mobile Zoom', patch: { entrance: 'fade' as const, idle: 'smoothZoom' as const, intensity: 0.9, feel: 'smooth' as const } },
                  { id: 'mobileFloat', label: 'Float', patch: { idle: 'float' as const, intensity: 0.55, feel: 'smooth' as const } },
                  { id: 'snapIn', label: 'Snap In', patch: { entrance: 'pop' as const, entranceDuration: 0.4, feel: 'snappy' as const } },
                  { id: 'cinematicApp', label: 'Cinematic', patch: { entrance: 'blurIn' as const, idle: 'cinematic' as const, feel: 'cinematic' as const } },
                ].map((preset) => (
                  <Chip
                    key={preset.id}
                    onClick={() =>
                      update(
                        layer.id,
                        { motion: { ...layer.motion, ...preset.patch } },
                        `App motion · ${preset.label}`,
                      )
                    }
                  >
                    {preset.label}
                  </Chip>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </PanelSection>
  );
}

function FrameLayerInspector({ layer }: { layer: FrameLayer }) {
  const update = useEditor((s) => s.updateLayer<FrameLayer>);
  const mutate = useEditor((s) => s.mutate);
  const sceneIndex = useEditor((s) => s.activeSceneIndex);

  return (
    <PanelSection title="Phone Frame">
      <Field label="Frame type">
        <Select
          value={layer.frame.kind}
          options={[
            { id: 'phoneAndroid', label: 'Android Phone' },
            { id: 'phone', label: 'Pixel-style' },
            { id: 'phoneGeneric', label: 'Generic Android' },
            { id: 'browserDark', label: 'Browser' },
            { id: 'browser', label: 'Browser Light' },
            { id: 'laptop', label: 'Laptop' },
            { id: 'desktop', label: 'Monitor' },
          ]}
          onChange={(kind) => update(layer.id, { frame: { ...layer.frame, kind } }, 'Change frame type')}
        />
      </Field>
      <Field label="Link to App Screen" inline>
        <div className="flex justify-end">
          <Toggle
            label="Link transforms"
            checked={layer.linkTransforms}
            onChange={(linkTransforms) => update(layer.id, { linkTransforms }, 'Toggle frame link')}
          />
        </div>
      </Field>
      <Field label="Nest App Screen" inline>
        <div className="flex justify-end">
          <Toggle
            label="Nest in frame"
            checked={layer.nestAppScreen !== false}
            onChange={(nestAppScreen) =>
              update(layer.id, { nestAppScreen }, nestAppScreen ? 'Nest app screen' : 'Un-nest app screen')
            }
          />
        </div>
      </Field>
      <p className="text-[11px] text-[var(--color-ink-500)]">
        Nest keeps the recording locked inside the bezel. Turn off only for free advanced composition.
      </p>
      {layer.linkedLayerId && layer.linkTransforms && (
        <Button
          size="sm"
          fullWidth
          onClick={() => {
            mutate('Unlink frame', (draft) => {
              const scene = draft.scenes[sceneIndex];
              const frame = scene.layers.find((l) => l.id === layer.id);
              if (frame?.type === 'frame') {
                frame.linkTransforms = false;
                delete frame.linkedLayerId;
              }
            });
          }}
        >
          Unlink
        </Button>
      )}
    </PanelSection>
  );
}

function EffectsInspector({
  layer,
}: {
  layer: Extract<Layer, { type: 'video' | 'frame' | 'image' }>;
}) {
  const updateLayer = useEditor((s) => s.updateLayer);
  const border = layer.border ?? defaultBorder();
  const glow = layer.glow ?? defaultGlow();
  const blur = layer.motionBlur ?? 'off';

  const setBorder = (patch: Partial<BorderSpec>, label: string) =>
    updateLayer(layer.id, { border: { ...border, ...patch } }, label, true);
  const setGlow = (patch: Partial<GlowSpec>, label: string) =>
    updateLayer(layer.id, { glow: { ...glow, ...patch } }, label, true);

  return (
    <Collapsible title="Border & Glow">
      <Field label="Border">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[
            { id: 'none', label: 'None' },
            { id: 'solid', label: 'Solid' },
            { id: 'soft', label: 'Soft' },
          ].map((preset) => (
            <Chip
              key={preset.id}
              active={preset.id === 'none' ? !border.enabled : border.enabled && border.style === preset.id}
              onClick={() =>
                setBorder(
                  preset.id === 'none'
                    ? { enabled: false }
                    : { enabled: true, style: preset.id as BorderSpec['style'] },
                  `Border · ${preset.label}`,
                )
              }
            >
              {preset.label}
            </Chip>
          ))}
        </div>
        {border.enabled && (
          <div className="space-y-2">
            <Slider
              value={border.thickness}
              min={1}
              max={12}
              step={0.5}
              onChange={(thickness) => setBorder({ thickness }, 'Border thickness')}
              format={(v) => `${v}px`}
            />
            <ColorSwatch
              label="Border colour"
              value={border.color}
              onChange={(color) => setBorder({ color }, 'Border colour')}
            />
          </div>
        )}
      </Field>
      <Field label="Glow">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[
            { id: 'off', label: 'Off', color: glow.color, enabled: false },
            { id: 'soft', label: 'Soft Glow', color: '#A5B4FC', enabled: true },
            { id: 'cyan', label: 'Cyan Glow', color: '#22D3EE', enabled: true },
            { id: 'white', label: 'White Glow', color: '#FFFFFF', enabled: true },
          ].map((preset) => (
            <Chip
              key={preset.id}
              active={preset.enabled ? glow.enabled && glow.color === preset.color : !glow.enabled}
              onClick={() =>
                setGlow(
                  preset.enabled
                    ? { enabled: true, color: preset.color, opacity: 0.45, blur: 28, intensity: 0.55 }
                    : { enabled: false },
                  `Glow · ${preset.label}`,
                )
              }
            >
              {preset.label}
            </Chip>
          ))}
        </div>
      </Field>
      {layer.type === 'video' && (
        <Field label="Motion blur">
          <Segmented
            value={blur}
            options={[
              { id: 'off', label: 'Off' },
              { id: 'low', label: 'Low' },
              { id: 'medium', label: 'Med' },
              { id: 'high', label: 'High' },
            ]}
            onChange={(motionBlur) =>
              updateLayer(layer.id, { motionBlur: motionBlur as MotionBlurLevel }, 'Motion blur')
            }
          />
        </Field>
      )}
    </Collapsible>
  );
}

function AttachToAppScreen({ layer }: { layer: Layer }) {
  const updateLayer = useEditor((s) => s.updateLayer);
  const scene = useEditor((s) => s.project.scenes[s.activeSceneIndex]);
  // Any video clip can be a parent — recorded or imported.
  const videos = scene.layers.filter(
    (l): l is VideoLayer => l.type === 'video' && l.id !== layer.id,
  );
  if (videos.length === 0) return null;
  const attached = layer.attachToLayerId ?? '';

  return (
    <PanelSection title="Attach to Video">
      <Select
        value={attached || 'none'}
        options={[
          { id: 'none', label: 'Off' },
          ...videos.map((l) => ({
            id: l.id,
            label: l.appScreen?.enabled ? `${l.name} (App Screen)` : l.name,
          })),
        ]}
        onChange={(id) =>
          updateLayer(
            layer.id,
            { attachToLayerId: id === 'none' ? undefined : id },
            id === 'none' ? 'Detach from video' : 'Attach to video',
          )
        }
      />
      <p className="mt-1.5 text-[11px] text-[var(--color-ink-400)]">
        When on, this overlay follows the video as it moves, scales, and rotates.
      </p>
    </PanelSection>
  );
}

/* --------------------------------------------------- video quick actions */

function VideoQuickActions({
  layer,
  focusPickMode,
  onToggleFocusPick,
  cursorMarkMode,
  onToggleCursorMark,
}: {
  layer: VideoLayer;
  focusPickMode: boolean;
  onToggleFocusPick: () => void;
  cursorMarkMode: boolean;
  onToggleCursorMark: () => void;
}) {
  const project = useEditor((s) => s.project);
  const mutate = useEditor((s) => s.mutate);
  const showToast = useEditor((s) => s.showToast);
  const sceneIndex = useEditor((s) => s.activeSceneIndex);
  const clearCursorSamples = useEditor((s) => s.clearCursorSamples);
  const setCursorSamples = useEditor((s) => s.setCursorSamples);
  const asset = project.assets.find((a) => a.id === layer.assetId);
  const clickCount = asset?.recording?.cursor.filter((e) => e.down).length ?? 0;
  const sampleCount = asset?.recording?.cursor.length ?? 0;
  const hasCursorData = sampleCount > 0;
  const inferred = Boolean(asset?.recording?.cursorInferred);
  const sourceLabel = mediaSourceLabel(asset);
  const [activeComposition, setActiveComposition] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewEvents, setReviewEvents] = useState<CursorEvent[]>([]);

  const detectTapsFromVideo = async () => {
    if (!asset || detecting) return;
    setDetecting(true);
    showToast('Scanning video for taps…', 'info');
    try {
      const url = await getMediaUrl(asset.storageKey);
      if (!url) {
        showToast('Could not load video.', 'error');
        return;
      }
      const result = await detectInteractionsFromVideo(url, {
        duration: layer.duration || asset.duration || 5,
        crop: cropAtTime(layer, 0),
        sampleInterval: Math.min(0.22, Math.max(0.12, (layer.duration || 5) / 40)),
      });
      setCursorSamples(layer.assetId, result.events, {
        inferred: true,
        label: 'Detect taps from video',
      });
      setReviewEvents(result.events);
      if (result.tapCount > 0) {
        setReviewOpen(true);
        showToast(`${result.message} Review and confirm them.`, 'success');
      } else {
        showToast(result.message, 'info');
      }
    } catch {
      showToast('Tap detection failed. Use Mark path instead.', 'error');
    } finally {
      setDetecting(false);
    }
  };

  const makeBeautiful = () => {
    const result = autoDesign(layer, asset, project.canvas);
    mutate('Make it beautiful', (draft) => {
      const scene = draft.scenes[sceneIndex];
      const index = scene.layers.findIndex((l) => l.id === layer.id);
      if (index === -1) return;
      scene.layers[index] = { ...result.layer, id: layer.id, start: layer.start, duration: layer.duration };
      scene.background = result.background;
    });
    // Park past the entrance so the recording is visible (t=0 is fully faded out).
    const revealAt = layer.start + Math.min(result.layer.motion.entranceDuration * 0.85, 0.6);
    useEditor.getState().setPlayhead(revealAt);
    useEditor.getState().pause();
    setActiveComposition(null);
    showToast(result.notes[0] ?? 'Applied a polished composition.', 'success');
  };

  const focusOnClicks = () => {
    if (!asset?.recording?.cursor.length) return;
    const points = buildFocusPointsFromClicks(layer, asset.recording.cursor);
    if (points.length === 0) {
      showToast('No clicks were recorded in this part of the clip.', 'info');
      return;
    }
    mutate('Focus on clicks', (draft) => {
      const scene = draft.scenes[sceneIndex];
      const target = scene.layers.find((l) => l.id === layer.id);
      if (target?.type === 'video') {
        // Replace previous auto points but keep anything the user placed by hand.
        target.camera.focusPoints = [
          ...target.camera.focusPoints.filter((p) => !p.auto),
          ...points,
        ].sort((a, b) => a.time - b.time);
        target.camera.mode = 'smoothFocus';
      }
    });
    showToast(`Created ${points.length} camera move${points.length === 1 ? '' : 's'} from your clicks.`, 'success');
  };

  return (
    <PanelSection title="Video">
      <div className="space-y-2">
        <p className="text-[11px] text-[var(--color-ink-500)]">
          Source · <span className="text-[var(--color-ink-300)]">{sourceLabel}</span>
          {inferred ? ' · taps need review' : null}
          {sourceLabel === 'Imported' && !hasCursorData
            ? ' · Detect Taps or Mark path'
            : null}
        </p>
        <Button
          variant="primary"
          size="md"
          fullWidth
          icon={<IconSparkle size={15} />}
          onClick={makeBeautiful}
        >
          Make It Beautiful
        </Button>

        <Button size="sm" fullWidth onClick={() => openAppScreenCrop(layer.id)}>
          Crop App Screen
        </Button>

        <div className="flex gap-2">
          <Tooltip
            content={
              hasCursorData
                ? `Build camera moves from ${clickCount} recorded clicks`
                : 'No click data yet — use Mark path or Pick point'
            }
          >
            <span className="flex-1">
              <Button
                size="sm"
                fullWidth
                disabled={clickCount === 0}
                icon={<IconCamera size={14} />}
                onClick={focusOnClicks}
              >
                Focus on Click
              </Button>
            </span>
          </Tooltip>
          <Button
            size="sm"
            variant={focusPickMode ? 'accentGhost' : 'secondary'}
            onClick={onToggleFocusPick}
          >
            {focusPickMode ? 'Picking…' : 'Pick point'}
          </Button>
        </div>

        {!hasCursorData && (
          <p className="text-[11px] leading-relaxed text-[var(--color-ink-400)]">
            {sourceLabel === 'Imported'
              ? 'Imported videos have no click metadata. Run Detect Taps to analyse the footage, or use Mark path / Add Interaction.'
              : 'No cursor data yet. Play the clip and use Mark path — or Detect Taps to infer presses from the video.'}
          </p>
        )}

        <Button size="sm" fullWidth disabled={detecting} onClick={() => void detectTapsFromVideo()}>
          {detecting ? 'Detecting…' : 'Detect Taps'}
        </Button>
        {hasCursorData && (
          <Button
            size="sm"
            fullWidth
            onClick={() => {
              setReviewEvents(asset?.recording?.cursor ?? []);
              setReviewOpen(true);
            }}
          >
            {inferred ? 'Review detected taps' : 'Edit taps'}
          </Button>
        )}

        <DetectedTapsDialog
          open={reviewOpen}
          layer={layer}
          assetId={layer.assetId}
          initialEvents={reviewEvents}
          onClose={() => setReviewOpen(false)}
        />

        <div className="flex gap-2">
          <Button
            size="sm"
            fullWidth
            variant={cursorMarkMode ? 'accentGhost' : 'secondary'}
            onClick={onToggleCursorMark}
          >
            {cursorMarkMode ? 'Marking path…' : 'Mark path'}
          </Button>
          {hasCursorData && (
            <Button
              size="sm"
              onClick={() => {
                clearCursorSamples(layer.assetId);
                showToast('Cursor path cleared.', 'info');
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <Button
          size="sm"
          fullWidth
          onClick={() => {
            const playhead = useEditor.getState().playhead;
            const tap = createManualTap(
              layer.id,
              { x: 0, y: 0 },
              Math.max(0, playhead - layer.start),
              layer.start,
            );
            mutate('Add Interaction', (draft) => {
              draft.scenes[sceneIndex].layers.push(tap);
            });
            showToast('Interaction marker added. Drag it onto the UI element.', 'success');
          }}
        >
          Add Interaction
        </Button>
        {hasCursorData && (
          <p className="text-[11px] text-[var(--color-ink-500)]">
            {sampleCount} samples · {clickCount} click{clickCount === 1 ? '' : 's'}
          </p>
        )}

        <div className="pt-1">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-400)]">
            Compositions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {COMPOSITION_PRESETS.map((preset) => (
              <Tooltip key={preset.id} content={preset.description}>
                <span>
                  <Chip
                    active={activeComposition === preset.id}
                    onClick={() => {
                      const result = preset.apply(layer, project.canvas);
                      const cursor = asset?.recording?.cursor ?? [];
                      if (
                        (result.layer.camera.mode === 'followClicks' ||
                          result.layer.camera.mode === 'smoothFocus') &&
                        result.layer.camera.focusPoints.length === 0 &&
                        cursor.some((event) => event.down)
                      ) {
                        result.layer.camera.focusPoints = buildFocusPointsFromClicks(
                          result.layer,
                          cursor,
                          { zoom: result.layer.camera.zoom },
                        );
                      }
                      mutate(`Apply ${preset.name}`, (draft) => {
                        const scene = draft.scenes[sceneIndex];
                        const index = scene.layers.findIndex((l) => l.id === layer.id);
                        if (index === -1) return;
                        scene.layers[index] = {
                          ...result.layer,
                          id: layer.id,
                          start: layer.start,
                          duration: layer.duration,
                        };
                        if (result.background) scene.background = result.background;
                      });
                      setActiveComposition(preset.id);
                      // Entrance animations start at opacity 0 — scrub past them so
                      // the recording is visible immediately.
                      const inDur = result.layer.motion.entranceDuration || 0.5;
                      useEditor.getState().setPlayhead(layer.start + Math.min(inDur * 0.85, 0.7));
                      useEditor.getState().pause();
                      showToast(`${preset.name} applied.`, 'success');
                    }}
                  >
                    {preset.name}
                  </Chip>
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
    </PanelSection>
  );
}

/* ------------------------------------------------------ video appearance */

function VideoAppearance({ layer }: { layer: VideoLayer }) {
  const update = useEditor((s) => s.updateVideoLayer);

  return (
    <>
      <Collapsible title="Appearance" defaultOpen>
        <Field label="Device frame">
          <Select
            value={layer.frame.kind}
            options={FRAME_OPTIONS}
            onChange={(kind) => update(layer.id, { frame: { ...layer.frame, kind } }, 'Change frame')}
          />
        </Field>
        {(layer.frame.kind === 'browser' || layer.frame.kind === 'browserDark') && (
          <Field label="Address bar">
            <TextInput
              value={layer.frame.url ?? ''}
              placeholder="app.example.com"
              onChange={(e) => update(layer.id, { frame: { ...layer.frame, url: e.target.value } }, 'Change URL', true)}
            />
          </Field>
        )}
        <Field label="Corner radius">
          <Slider
            value={layer.cornerRadius}
            min={0}
            max={80}
            step={1}
            onChange={(cornerRadius) => update(layer.id, { cornerRadius }, 'Change corner radius', true)}
            format={(v) => `${Math.round(v)}`}
          />
        </Field>
      </Collapsible>

      <Collapsible title="Shadow">
        <Field label="Enabled" inline>
          <div className="flex justify-end">
            <Toggle
              label="Shadow enabled"
              checked={layer.shadow.enabled}
              onChange={(enabled) => update(layer.id, { shadow: { ...layer.shadow, enabled } }, 'Toggle shadow')}
            />
          </div>
        </Field>
        <Field label="Blur">
          <Slider
            value={layer.shadow.blur}
            min={0}
            max={250}
            step={1}
            onChange={(blur) => update(layer.id, { shadow: { ...layer.shadow, blur } }, 'Change shadow', true)}
            format={(v) => `${Math.round(v)}`}
          />
        </Field>
        <Field label="Offset Y">
          <Slider
            value={layer.shadow.y}
            min={-100}
            max={150}
            step={1}
            onChange={(y) => update(layer.id, { shadow: { ...layer.shadow, y } }, 'Change shadow', true)}
            format={(v) => `${Math.round(v)}`}
          />
        </Field>
        <Field label="Strength">
          <Slider
            value={layer.shadow.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(opacity) => update(layer.id, { shadow: { ...layer.shadow, opacity } }, 'Change shadow', true)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Field>
        <Field label="Colour">
          <ColorSwatch
            label="Shadow colour"
            value={layer.shadow.color}
            onChange={(color) => update(layer.id, { shadow: { ...layer.shadow, color } }, 'Change shadow')}
          />
        </Field>
      </Collapsible>

      <Collapsible title="Layer background">
        <div className="grid grid-cols-5 gap-1.5">
          {BACKGROUND_PRESETS.map((preset) => (
            <Tooltip key={preset.id} content={preset.label}>
              <button
                type="button"
                aria-label={preset.label}
                onClick={() => update(layer.id, { background: preset.spec }, 'Change layer background')}
                className="h-8 rounded-[6px] border border-[var(--color-ink-700)] transition-transform hover:scale-[1.06]"
                style={{ background: swatchCss(preset.id) }}
              />
            </Tooltip>
          ))}
        </div>
        {layer.background.type === 'dynamic' && (
          <div className="mt-3 space-y-2.5">
            <Field label="Blur">
              <Slider
                value={layer.background.blur}
                min={0}
                max={160}
                step={1}
                onChange={(blur) =>
                  update(layer.id, { background: { ...layer.background, blur } as VideoLayer['background'] }, 'Change background', true)
                }
                format={(v) => `${Math.round(v)}`}
              />
            </Field>
            <Field label="Brightness">
              <Slider
                value={layer.background.brightness}
                min={0.1}
                max={1.4}
                step={0.01}
                onChange={(brightness) =>
                  update(layer.id, { background: { ...layer.background, brightness } as VideoLayer['background'] }, 'Change background', true)
                }
              />
            </Field>
          </div>
        )}
      </Collapsible>

      <Collapsible title="Clip">
        <Field label="Speed">
          <div className="mb-2 flex flex-wrap gap-1">
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <Chip
                key={rate}
                active={Math.abs(layer.playbackRate - rate) < 0.01}
                onClick={() => update(layer.id, { playbackRate: rate }, `Speed ${rate}×`)}
              >
                {rate}×
              </Chip>
            ))}
          </div>
          <Slider
            value={layer.playbackRate}
            min={0.25}
            max={4}
            step={0.05}
            onChange={(playbackRate) => update(layer.id, { playbackRate }, 'Change speed', true)}
            format={(v) => `${v.toFixed(2)}×`}
          />
        </Field>
        <Field label="Volume">
          <Slider
            value={layer.volume}
            min={0}
            max={1}
            step={0.01}
            onChange={(volume) => update(layer.id, { volume }, 'Change volume', true)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Field>
        <Field label="Mute" inline>
          <div className="flex justify-end">
            <Toggle label="Mute clip" checked={layer.muted} onChange={(muted) => update(layer.id, { muted }, 'Toggle mute')} />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <Button
            size="sm"
            onClick={() => {
              motionClipboard = {
                motion: { ...layer.motion },
                shadow: { ...layer.shadow },
                cornerRadius: layer.cornerRadius,
                border: layer.border ? { ...layer.border } : undefined,
                glow: layer.glow ? { ...layer.glow } : undefined,
                camera: { ...layer.camera, focusPoints: [...layer.camera.focusPoints] },
              };
              useEditor.getState().showToast('Motion & style copied. Select another clip and Paste Motion.', 'success');
            }}
          >
            Copy Motion
          </Button>
          <Button
            size="sm"
            disabled={!motionClipboard}
            onClick={() => {
              if (!motionClipboard) return;
              update(
                layer.id,
                {
                  motion: { ...motionClipboard.motion },
                  shadow: { ...motionClipboard.shadow },
                  cornerRadius: motionClipboard.cornerRadius,
                  border: motionClipboard.border ? { ...motionClipboard.border } : layer.border,
                  glow: motionClipboard.glow ? { ...motionClipboard.glow } : layer.glow,
                  camera: {
                    ...motionClipboard.camera,
                    focusPoints: motionClipboard.camera.focusPoints.map((p) => ({ ...p })),
                  },
                },
                'Paste motion',
              );
              useEditor.getState().showToast('Motion pasted.', 'success');
            }}
          >
            Paste Motion
          </Button>
        </div>
        <div className="pt-1.5">
          <ReplaceMediaButton layer={layer} />
        </div>
        <Field label="Crop" hint="Trim the edges of the source footage.">
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              value={layer.crop.x * 100}
              onChange={(v) => update(layer.id, { crop: { ...layer.crop, x: v / 100 } }, 'Crop clip', true)}
              min={0}
              max={90}
              suffix="L%"
            />
            <NumberInput
              value={layer.crop.width * 100}
              onChange={(v) => update(layer.id, { crop: { ...layer.crop, width: v / 100 } }, 'Crop clip', true)}
              min={10}
              max={100}
              suffix="W%"
            />
            <NumberInput
              value={layer.crop.y * 100}
              onChange={(v) => update(layer.id, { crop: { ...layer.crop, y: v / 100 } }, 'Crop clip', true)}
              min={0}
              max={90}
              suffix="T%"
            />
            <NumberInput
              value={layer.crop.height * 100}
              onChange={(v) => update(layer.id, { crop: { ...layer.crop, height: v / 100 } }, 'Crop clip', true)}
              min={10}
              max={100}
              suffix="H%"
            />
          </div>
        </Field>
      </Collapsible>
    </>
  );
}

/** In-memory clipboard for Copy / Paste Motion across video clips. */
let motionClipboard: {
  motion: MotionSpec;
  shadow: VideoLayer['shadow'];
  cornerRadius: number;
  border?: VideoLayer['border'];
  glow?: VideoLayer['glow'];
  camera: VideoLayer['camera'];
} | null = null;

function ReplaceMediaButton({ layer }: { layer: VideoLayer }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mutate = useEditor((s) => s.mutate);
  const addAssets = useEditor((s) => s.addAssets);
  const showToast = useEditor((s) => s.showToast);
  const project = useEditor((s) => s.project);
  const old = project.assets.find((a) => a.id === layer.assetId);

  return (
    <>
      <Button size="sm" fullWidth onClick={() => inputRef.current?.click()}>
        Replace Media
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void (async () => {
            try {
              const asset = await importMedia(file, {
                name: file.name,
                mimeType: file.type || guessMime(file.name),
              });
              addAssets([asset]);
              const oldW = old?.width ?? asset.width ?? 1;
              const oldH = old?.height ?? asset.height ?? 1;
              const newW = asset.width ?? oldW;
              const newH = asset.height ?? oldH;
              const aspectShift =
                Math.abs(oldW / Math.max(oldH, 1) - newW / Math.max(newH, 1)) > 0.12;
              mutate('Replace media', (draft) => {
                for (const scene of draft.scenes) {
                  const target = scene.layers.find((l) => l.id === layer.id);
                  if (target?.type === 'video') {
                    target.assetId = asset.id;
                    target.name = asset.name;
                    const dur = asset.duration > 0.2 ? asset.duration : target.duration;
                    target.duration = Math.min(target.duration, dur);
                    target.trimEnd = Math.min(target.trimEnd, dur);
                  }
                }
              });
              showToast(
                aspectShift
                  ? 'Media replaced. Aspect ratio changed — check crop and overlays.'
                  : 'Media replaced. Composition preserved.',
                aspectShift ? 'info' : 'success',
              );
            } catch {
              showToast('Could not replace media.', 'error');
            }
          })();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------- motion */

function MotionInspector({ layer }: { layer: Layer }) {
  const updateLayer = useEditor((s) => s.updateLayer);
  const active = matchMotionPreset(layer.motion);
  const [showDetails, setShowDetails] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const beginnerIds = ['none', 'fade', 'rise', 'smoothZoom', 'pop', 'cinematicZoom'];

  return (
    <Collapsible title="Motion" defaultOpen>
      <Button
        size="sm"
        fullWidth
        icon={<IconSparkle size={14} />}
        onClick={() => window.dispatchEvent(new CustomEvent('motiondeck:open-animate'))}
        className="mb-3"
      >
        Animate
      </Button>

      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-500)]">
        Quick
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {beginnerIds.map((id) => {
          const preset = MOTION_PRESETS.find((p) => p.id === id);
          if (!preset) return null;
          return (
            <Tooltip key={id} content={preset.description}>
              <span>
                <Chip
                  active={active === preset.id}
                  onClick={() =>
                    updateLayer(layer.id, { motion: { ...layer.motion, ...preset.patch } }, `Apply ${preset.label}`)
                  }
                >
                  {preset.label}
                </Chip>
              </span>
            </Tooltip>
          );
        })}
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <Field label="Duration">
          <Slider
            value={layer.motion.entranceDuration}
            min={0.2}
            max={2}
            step={0.1}
            onChange={(entranceDuration) =>
              updateLayer(layer.id, { motion: { ...layer.motion, entranceDuration } }, 'Change duration', true)
            }
            format={(v) => `${v.toFixed(1)}s`}
          />
        </Field>
        <Field label="Intensity">
          <Slider
            value={layer.motion.intensity}
            min={0}
            max={2}
            step={0.05}
            onChange={(intensity) =>
              updateLayer(layer.id, { motion: { ...layer.motion, intensity } }, 'Change intensity', true)
            }
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="mb-2 text-[11.5px] text-[var(--color-accent)] transition-opacity hover:opacity-80"
      >
        {advanced ? 'Hide advanced motion' : 'Advanced Motion'}
      </button>

      {advanced && (
        <div className="animate-in space-y-2">
          {MOTION_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-500)]">
                {group.label}
              </p>
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {MOTION_PRESETS.filter((p) => p.group === group.id).map((preset) => (
                  <Tooltip key={preset.id} content={preset.description}>
                    <span>
                      <Chip
                        active={active === preset.id}
                        onClick={() =>
                          updateLayer(
                            layer.id,
                            { motion: { ...layer.motion, ...preset.patch } },
                            `Apply ${preset.label}`,
                          )
                        }
                      >
                        {preset.label}
                      </Chip>
                    </span>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-[11.5px] text-[var(--color-accent)] transition-opacity hover:opacity-80"
          >
            {showDetails ? 'Hide details' : 'Fine-tune…'}
          </button>

          {showDetails && (
            <div className="animate-in space-y-2.5 pt-1">
              <Field label="Entrance">
                <Select
                  value={layer.motion.entrance}
                  options={ENTRANCE_OPTIONS}
                  onChange={(entrance) =>
                    updateLayer(layer.id, { motion: { ...layer.motion, entrance } }, 'Change entrance')
                  }
                />
              </Field>
              <Field label="Entrance length">
                <Slider
                  value={layer.motion.entranceDuration}
                  min={0.1}
                  max={3}
                  step={0.05}
                  onChange={(entranceDuration) =>
                    updateLayer(layer.id, { motion: { ...layer.motion, entranceDuration } }, 'Change entrance', true)
                  }
                  format={(v) => `${v.toFixed(2)}s`}
                />
              </Field>
              <Field label="Exit">
                <Select
                  value={layer.motion.exit}
                  options={EXIT_OPTIONS}
                  onChange={(exit) => updateLayer(layer.id, { motion: { ...layer.motion, exit } }, 'Change exit')}
                />
              </Field>
              <Field label="Idle movement">
                <Select
                  value={layer.motion.idle}
                  options={IDLE_OPTIONS}
                  onChange={(idle) =>
                    updateLayer(layer.id, { motion: { ...layer.motion, idle } }, 'Change idle motion')
                  }
                />
              </Field>
              <Field label="Feel">
                <Segmented
                  size="sm"
                  value={layer.motion.feel}
                  options={FEEL_OPTIONS}
                  onChange={(feel) => updateLayer(layer.id, { motion: { ...layer.motion, feel } }, 'Change feel')}
                />
              </Field>
            </div>
          )}
        </div>
      )}
    </Collapsible>
  );
}

/* ------------------------------------------------------------- camera */

const CAMERA_OPTIONS: { id: CameraMode; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'followCursor', label: 'Follow Cursor' },
  { id: 'followClicks', label: 'Follow Clicks' },
  { id: 'smoothFocus', label: 'Smooth Focus' },
  { id: 'dynamic', label: 'Dynamic' },
  { id: 'manual', label: 'Manual points' },
];

function CameraInspector({
  layer,
  focusPickMode,
  onToggleFocusPick,
}: {
  layer: VideoLayer;
  focusPickMode: boolean;
  onToggleFocusPick: () => void;
}) {
  const setCamera = useEditor((s) => s.setCamera);
  const setFocusPoints = useEditor((s) => s.setFocusPoints);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const assets = useEditor((s) => s.project.assets);
  const asset = assets.find((a) => a.id === layer.assetId);
  const hasCursor = (asset?.recording?.cursor.length ?? 0) > 0;

  const needsCursor = layer.camera.mode === 'followCursor' || layer.camera.mode === 'dynamic';

  return (
    <Collapsible title="Camera" defaultOpen accessory={<IconCamera size={13} className="text-[var(--color-ink-500)]" />}>
      <Field label="Mode">
        <Select
          value={layer.camera.mode}
          options={CAMERA_OPTIONS}
          onChange={(mode) => setCamera(layer.id, { mode })}
        />
      </Field>

      {needsCursor && !hasCursor && (
        <p className="rounded-[6px] bg-[rgba(251,191,36,0.08)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-warn)]">
          This mode needs a cursor path. Use Mark path while the clip plays, or switch to Smooth
          Focus / Manual points.
        </p>
      )}

      <Field label="Zoom">
        <Slider
          value={layer.camera.zoom}
          min={1}
          max={4}
          step={0.05}
          onChange={(zoom) => setCamera(layer.id, { zoom })}
          format={(v) => `${v.toFixed(2)}×`}
        />
      </Field>
      <Field label="Smoothing" hint="Higher values make the camera lag further behind.">
        <Slider
          value={layer.camera.smoothing}
          min={0}
          max={1}
          step={0.01}
          onChange={(smoothing) => setCamera(layer.id, { smoothing })}
        />
      </Field>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-[var(--color-ink-300)]">
            Focus points ({layer.camera.focusPoints.length})
          </span>
          <Button size="sm" variant={focusPickMode ? 'accentGhost' : 'ghost'} onClick={onToggleFocusPick}>
            {focusPickMode ? 'Cancel' : 'Add'}
          </Button>
        </div>

        {layer.camera.focusPoints.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-[var(--color-ink-500)]">
            No focus points. Use <span className="text-[var(--color-ink-300)]">Focus on Click</span> or add one by
            clicking the canvas.
          </p>
        ) : (
          <ul className="space-y-1">
            {layer.camera.focusPoints.map((point, index) => (
              <li
                key={point.id}
                className="flex items-center gap-1.5 rounded-[6px] bg-[var(--color-ink-900)] px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => setPlayhead(layer.start + point.time)}
                  className="tabular flex-1 text-left text-[11.5px] text-[var(--color-ink-200)] transition-colors hover:text-white"
                >
                  {index + 1}. {point.time.toFixed(2)}s · {point.zoom.toFixed(2)}×
                  {point.auto && <span className="ml-1 text-[var(--color-ink-500)]">auto</span>}
                </button>
                <IconButton
                  label="Remove focus point"
                  size="sm"
                  tone="danger"
                  onClick={() =>
                    setFocusPoints(
                      layer.id,
                      layer.camera.focusPoints.filter((p) => p.id !== point.id),
                      'Remove focus point',
                    )
                  }
                >
                  <IconTrash size={12} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Collapsible>
  );
}

/* ------------------------------------------------------------- cursor */

function CursorInspector({ layer }: { layer: VideoLayer }) {
  const setCursor = useEditor((s) => s.setCursor);
  const assets = useEditor((s) => s.project.assets);
  const asset = assets.find((a) => a.id === layer.assetId);
  const hasCursor = (asset?.recording?.cursor.length ?? 0) > 0;

  return (
    <Collapsible title="Cursor" accessory={<IconCursor size={13} className="text-[var(--color-ink-500)]" />}>
      {!hasCursor && (
        <p className="rounded-[6px] bg-[var(--color-ink-900)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-ink-400)]">
          No cursor path yet. Run Detect Taps on imported footage, or Mark path / Add Interaction
          so these styles have something to draw.
        </p>
      )}
      <Field label="Style">
        <Select value={layer.cursor.style} options={CURSOR_STYLE_OPTIONS} onChange={(style) => setCursor(layer.id, { style })} />
      </Field>
      <Field label="Size">
        <Slider
          value={layer.cursor.size}
          min={0.4}
          max={3}
          step={0.05}
          onChange={(size) => setCursor(layer.id, { size }, 'Change cursor size', true)}
          format={(v) => `${v.toFixed(2)}×`}
        />
      </Field>
      <Field label="Smooth Cursor" hint="Removes jitter from the recorded pointer path.">
        <Slider
          value={layer.cursor.smoothing}
          min={0}
          max={1}
          step={0.01}
          onChange={(smoothing) => setCursor(layer.id, { smoothing }, 'Smooth cursor', true)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </Field>
      <Field label="Shadow" inline>
        <div className="flex justify-end">
          <Toggle label="Cursor shadow" checked={layer.cursor.shadow} onChange={(shadow) => setCursor(layer.id, { shadow })} />
        </div>
      </Field>
      <Field label="Click effect">
        <Select value={layer.cursor.click} options={CLICK_EFFECT_OPTIONS} onChange={(click) => setCursor(layer.id, { click })} />
      </Field>
      <Field label="Click colour">
        <ColorSwatch label="Click colour" value={layer.cursor.clickColor} onChange={(clickColor) => setCursor(layer.id, { clickColor })} />
      </Field>
      {(layer.cursor.style === 'highlight' || layer.cursor.style === 'softCircle') && (
        <>
          <Field label="Highlight colour">
            <ColorSwatch
              label="Highlight colour"
              value={layer.cursor.highlightColor}
              onChange={(highlightColor) => setCursor(layer.id, { highlightColor })}
            />
          </Field>
          <Field label="Highlight size">
            <Slider
              value={layer.cursor.highlightRadius}
              min={10}
              max={160}
              step={1}
              onChange={(highlightRadius) => setCursor(layer.id, { highlightRadius }, 'Change highlight', true)}
              format={(v) => `${Math.round(v)}`}
            />
          </Field>
        </>
      )}
    </Collapsible>
  );
}

/* --------------------------------------------------------------- text */

const TEXT_ANIMATIONS: { id: TextAnimation; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slideUp', label: 'Slide Up' },
  { id: 'slideLeft', label: 'Slide Left' },
  { id: 'scale', label: 'Scale' },
  { id: 'pop', label: 'Pop' },
  { id: 'typewriter', label: 'Typewriter' },
  { id: 'blur', label: 'Blur' },
  { id: 'wordReveal', label: 'Word Reveal' },
];

function TextInspector({ layer }: { layer: TextLayer }) {
  const update = useEditor((s) => s.updateLayer<TextLayer>);

  return (
    <Collapsible title="Text" defaultOpen>
      <Field label="Content">
        <textarea
          value={layer.text}
          rows={2}
          onChange={(e) => update(layer.id, { text: e.target.value }, 'Edit text', true)}
          className="w-full resize-y rounded-[7px] border border-[var(--color-ink-600)] bg-[var(--color-ink-900)] px-2.5 py-1.5 text-[13px] text-[var(--color-ink-50)] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </Field>

      <div className="flex flex-wrap gap-1.5">
        {TEXT_COPY_PRESETS.slice(0, 5).map((copy) => (
          <Chip key={copy} onClick={() => update(layer.id, { text: copy }, 'Set text')}>
            {copy}
          </Chip>
        ))}
      </div>

      <Field label="Animation">
        <Select
          value={layer.animation}
          options={TEXT_ANIMATIONS}
          onChange={(animation) => {
            const entrance =
              animation === 'slideUp'
                ? 'slideUp'
                : animation === 'slideLeft'
                  ? 'slideLeft'
                  : animation === 'scale'
                    ? 'scale'
                    : animation === 'pop'
                      ? 'pop'
                      : animation === 'blur'
                        ? 'blurIn'
                        : animation === 'none'
                          ? 'none'
                          : 'fade';
            update(layer.id, { animation, motion: { ...layer.motion, entrance } }, 'Change text animation');
          }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Size">
          <NumberInput
            value={layer.fontSize}
            onChange={(fontSize) => update(layer.id, { fontSize }, 'Change font size', true)}
            min={8}
            max={400}
          />
        </Field>
        <Field label="Weight">
          <Select
            value={String(layer.fontWeight)}
            options={[
              { id: '300', label: 'Light' },
              { id: '400', label: 'Regular' },
              { id: '500', label: 'Medium' },
              { id: '600', label: 'Semibold' },
              { id: '700', label: 'Bold' },
              { id: '800', label: 'Black' },
            ]}
            onChange={(w) => update(layer.id, { fontWeight: Number(w) }, 'Change weight')}
          />
        </Field>
      </div>

      <Field label="Alignment">
        <Segmented
          size="sm"
          value={layer.align}
          options={[
            { id: 'left', label: 'Left' },
            { id: 'center', label: 'Center' },
            { id: 'right', label: 'Right' },
          ]}
          onChange={(align) => update(layer.id, { align }, 'Change alignment')}
        />
      </Field>

      <Field label="Colour">
        <ColorSwatch label="Text colour" value={layer.color} onChange={(color) => update(layer.id, { color }, 'Change colour')} />
      </Field>

      <Field label="Letter spacing">
        <Slider
          value={layer.letterSpacing}
          min={-10}
          max={20}
          step={0.5}
          onChange={(letterSpacing) => update(layer.id, { letterSpacing }, 'Change spacing', true)}
          format={(v) => v.toFixed(1)}
        />
      </Field>
      <Field label="Line height">
        <Slider
          value={layer.lineHeight}
          min={0.8}
          max={2.4}
          step={0.05}
          onChange={(lineHeight) => update(layer.id, { lineHeight }, 'Change line height', true)}
        />
      </Field>
      <Field label="Max width">
        <NumberInput
          value={layer.maxWidth}
          onChange={(maxWidth) => update(layer.id, { maxWidth }, 'Change width', true)}
          min={100}
          max={6000}
          step={10}
          suffix="px"
        />
      </Field>
    </Collapsible>
  );
}

/* -------------------------------------------------------------- shape */

function ShapeInspector({ layer }: { layer: ShapeLayer }) {
  const update = useEditor((s) => s.updateLayer<ShapeLayer>);
  return (
    <Collapsible title="Shape" defaultOpen>
      <Field label="Type">
        <Select
          value={layer.shape}
          options={[
            { id: 'rect', label: 'Rectangle' },
            { id: 'ellipse', label: 'Ellipse' },
            { id: 'triangle', label: 'Triangle' },
            { id: 'line', label: 'Line' },
            { id: 'arrow', label: 'Arrow' },
          ]}
          onChange={(shape) => update(layer.id, { shape }, 'Change shape')}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <NumberInput
            value={layer.size.width}
            onChange={(width) => update(layer.id, { size: { ...layer.size, width } }, 'Resize shape', true)}
            min={2}
          />
        </Field>
        <Field label="Height">
          <NumberInput
            value={layer.size.height}
            onChange={(height) => update(layer.id, { size: { ...layer.size, height } }, 'Resize shape', true)}
            min={2}
          />
        </Field>
      </div>
      {(layer.shape === 'arrow' || layer.shape === 'line') && layer.endPoint && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="End X">
            <NumberInput
              value={layer.endPoint.x}
              onChange={(x) => update(layer.id, { endPoint: { ...layer.endPoint!, x } }, 'Move arrow', true)}
            />
          </Field>
          <Field label="End Y">
            <NumberInput
              value={layer.endPoint.y}
              onChange={(y) => update(layer.id, { endPoint: { ...layer.endPoint!, y } }, 'Move arrow', true)}
            />
          </Field>
        </div>
      )}
      <Field label="Fill">
        <ColorSwatch label="Fill colour" value={layer.fill} onChange={(fill) => update(layer.id, { fill }, 'Change fill')} />
      </Field>
      <Field label="Stroke">
        <ColorSwatch label="Stroke colour" value={layer.stroke} onChange={(stroke) => update(layer.id, { stroke }, 'Change stroke')} />
      </Field>
      <Field label="Stroke width">
        <Slider
          value={layer.strokeWidth}
          min={0}
          max={40}
          step={1}
          onChange={(strokeWidth) => update(layer.id, { strokeWidth }, 'Change stroke', true)}
          format={(v) => `${Math.round(v)}`}
        />
      </Field>
      <Field label="Corner radius">
        <Slider
          value={layer.cornerRadius}
          min={0}
          max={120}
          step={1}
          onChange={(cornerRadius) => update(layer.id, { cornerRadius }, 'Change radius', true)}
          format={(v) => `${Math.round(v)}`}
        />
      </Field>
    </Collapsible>
  );
}

/* ------------------------------------------------------------ callout */

function CalloutInspector({ layer }: { layer: CalloutLayer }) {
  const update = useEditor((s) => s.updateLayer<CalloutLayer>);
  return (
    <Collapsible title="Callout" defaultOpen>
      <Field label="Type">
        <Select
          value={layer.callout}
          options={[
            { id: 'circle', label: 'Circle' },
            { id: 'roundedRect', label: 'Rounded rectangle' },
            { id: 'highlight', label: 'Highlight' },
            { id: 'spotlight', label: 'Spotlight' },
            { id: 'number', label: 'Number' },
            { id: 'label', label: 'Label' },
          ]}
          onChange={(callout) => update(layer.id, { callout }, 'Change callout')}
        />
      </Field>
      <Field label="Label">
        <TextInput
          value={layer.label}
          placeholder="Optional text"
          onChange={(e) => update(layer.id, { label: e.target.value }, 'Edit label', true)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <NumberInput value={layer.size.width} onChange={(width) => update(layer.id, { size: { ...layer.size, width } }, 'Resize callout', true)} min={20} />
        </Field>
        <Field label="Height">
          <NumberInput value={layer.size.height} onChange={(height) => update(layer.id, { size: { ...layer.size, height } }, 'Resize callout', true)} min={20} />
        </Field>
      </div>
      <Field label="Colour">
        <ColorSwatch label="Callout colour" value={layer.color} onChange={(color) => update(layer.id, { color }, 'Change colour')} />
      </Field>
      <Field label="Dim background">
        <Slider
          value={layer.dim}
          min={0}
          max={0.95}
          step={0.01}
          onChange={(dim) => update(layer.id, { dim }, 'Change dimming', true)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </Field>
      <Field label="Pulse" inline>
        <div className="flex justify-end">
          <Toggle label="Pulse" checked={layer.pulse} onChange={(pulse) => update(layer.id, { pulse }, 'Toggle pulse')} />
        </div>
      </Field>
    </Collapsible>
  );
}

/* -------------------------------------------------------------- audio */

function AudioInspector({ layer }: { layer: Extract<Layer, { type: 'audio' }> }) {
  const update = useEditor((s) => s.updateLayer<Extract<Layer, { type: 'audio' }>>);
  return (
    <Collapsible title="Audio" defaultOpen>
      <Field label="Volume">
        <Slider
          value={layer.volume}
          min={0}
          max={1}
          step={0.01}
          onChange={(volume) => update(layer.id, { volume }, 'Change volume', true)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </Field>
      <Field label="Mute" inline>
        <div className="flex justify-end">
          <Toggle label="Mute" checked={layer.muted} onChange={(muted) => update(layer.id, { muted }, 'Toggle mute')} />
        </div>
      </Field>
      <Field label="Fade in">
        <Slider
          value={layer.fadeIn}
          min={0}
          max={6}
          step={0.1}
          onChange={(fadeIn) => update(layer.id, { fadeIn }, 'Change fade', true)}
          format={(v) => `${v.toFixed(1)}s`}
        />
      </Field>
      <Field label="Fade out">
        <Slider
          value={layer.fadeOut}
          min={0}
          max={6}
          step={0.1}
          onChange={(fadeOut) => update(layer.id, { fadeOut }, 'Change fade', true)}
          format={(v) => `${v.toFixed(1)}s`}
        />
      </Field>
    </Collapsible>
  );
}

/* ---------------------------------------------------------- keyframes */

const KEYFRAME_PROPERTIES: { id: AnimatableProperty; label: string; get: (l: Layer) => number }[] = [
  { id: 'x', label: 'X', get: (l) => l.position.x },
  { id: 'y', label: 'Y', get: (l) => l.position.y },
  { id: 'scale', label: 'Scale', get: (l) => l.scale },
  { id: 'rotation', label: 'Rotation', get: (l) => l.rotation },
  { id: 'opacity', label: 'Opacity', get: (l) => l.opacity },
  { id: 'blur', label: 'Blur', get: () => 0 },
  { id: 'cornerRadius', label: 'Corner radius', get: (l) => ('cornerRadius' in l ? l.cornerRadius : 0) },
];

function KeyframeInspector({ layer }: { layer: Layer }) {
  const addKeyframe = useEditor((s) => s.addKeyframe);
  const removeKeyframe = useEditor((s) => s.removeKeyframe);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const playhead = useEditor((s) => s.playhead);
  const canvas = useEditor((s) => s.project.canvas);

  return (
    <Collapsible title="Animate" accessory={<IconKeyframe size={12} className="text-[var(--color-ink-500)]" />}>
      <p className="text-[11px] leading-relaxed text-[var(--color-ink-400)]">
        Add a keyframe to take manual control of a property. Keyframes override the motion preset
        for that property only.
      </p>
      {KEYFRAME_PROPERTIES.map((prop) => {
        const track = layer.keyframes[prop.id] ?? [];
        return (
          <div key={prop.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-[var(--color-ink-200)]">{prop.label}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const localTime = Math.max(0, playhead - layer.start);
                  const value =
                    prop.id === 'blur'
                      ? resolveLayerTransform(layer, localTime, {
                          canvasWidth: canvas.width,
                          canvasHeight: canvas.height,
                        }).blur
                      : prop.get(layer);
                  addKeyframe(layer.id, prop.id, value);
                }}
              >
                + Keyframe
              </Button>
            </div>
            {track.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {track.map((kf) => (
                  <button
                    key={kf.id}
                    type="button"
                    onDoubleClick={() => removeKeyframe(layer.id, prop.id, kf.id)}
                    onClick={() => setPlayhead(layer.start + kf.time)}
                    title="Click to jump here, double-click to remove"
                    className="tabular rounded-[5px] bg-[var(--color-ink-900)] px-1.5 py-0.5 text-[10.5px] text-[var(--color-ink-300)] transition-colors hover:text-white"
                  >
                    {kf.time.toFixed(2)}s · {kf.value.toFixed(2)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <StatusPill tone="muted">Playhead at {Math.max(0, playhead - layer.start).toFixed(2)}s</StatusPill>
    </Collapsible>
  );
}

export { EmptyState };
