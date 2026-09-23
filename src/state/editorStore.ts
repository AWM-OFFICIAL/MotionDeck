/**
 * Editor state.
 *
 * Deliberately split in two:
 *   - `project`   the document. Undoable, autosaved, exported.
 *   - everything else  ephemeral UI state (playhead, selection, zoom, panels).
 *
 * Components subscribe to narrow slices so dragging the playhead never re-renders
 * the inspector or the template grid.
 */

import { create } from 'zustand';
import { produce } from 'immer';
import type {
  AnimatableProperty,
  BackgroundSpec,
  CameraSpec,
  CursorEvent,
  CursorSpec,
  ExportSettings,
  FocusPoint,
  Layer,
  LayerType,
  MediaAsset,
  Project,
  Scene,
  Size,
  VideoLayer,
} from '../core/types';
import { createProject, createScene, defaultExportSettings } from '../core/defaults';
import { emptyImportRecording } from '../platform/mediaImport';
import { uid } from '../core/ids';
import { clamp } from '../core/easing';
import { aspectsClash, suggestedCanvas } from '../core/mediaLayout';
import { History } from './history';
import { clearCursorCache } from '../render/compositor';
import { saveProject } from '../platform/projectStore';

export type EditorMode = 'quick' | 'advanced';
export type SidebarSection = 'create' | 'templates' | 'elements' | 'project';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

interface EditorState {
  /* document */
  project: Project;
  activeSceneIndex: number;

  /* selection + playback */
  selectedLayerIds: string[];
  playhead: number;
  isPlaying: boolean;
  loop: boolean;

  /* ui */
  mode: EditorMode;
  sidebarSection: SidebarSection;
  canvasZoom: number;
  canvasFit: boolean;
  canvasPan: { x: number; y: number };
  timelineHeight: number;
  timelinePxPerSecond: number;
  saveState: SaveState;
  lastSavedAt: number | null;
  historyVersion: number;
  /** Non-blocking user-facing message, e.g. "Camera added to 6 clicks". */
  toast: { id: string; message: string; tone: 'info' | 'error' | 'success' } | null;
}

interface EditorActions {
  /* document lifecycle */
  loadProject: (project: Project) => void;
  newProject: (name?: string, canvas?: Size) => void;
  renameProject: (name: string) => void;
  setCanvasSize: (size: Size) => void;
  setExportSettings: (patch: Partial<ExportSettings>) => void;

  /* generic mutation */
  mutate: (label: string, recipe: (draft: Project) => void, coalesce?: boolean) => void;
  replaceProject: (label: string, next: Project) => void;

  /* history */
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  /* scenes */
  activeScene: () => Scene;
  setActiveScene: (index: number) => void;
  addScene: () => void;
  duplicateScene: (index: number) => void;
  deleteScene: (index: number) => void;
  moveScene: (from: number, to: number) => void;
  updateScene: (index: number, patch: Partial<Scene>, label?: string) => void;
  setSceneBackground: (spec: BackgroundSpec) => void;

  /* layers */
  addLayer: (layer: Layer, label?: string) => void;
  updateLayer: <T extends Layer = Layer>(id: string, patch: Partial<T>, label?: string, coalesce?: boolean) => void;
  updateVideoLayer: (id: string, patch: Partial<VideoLayer>, label?: string, coalesce?: boolean) => void;
  removeLayers: (ids: string[]) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, delta: number) => void;
  /** Absolute z-index move — `toIndex` is the destination index in scene.layers. */
  moveLayerToIndex: (id: string, toIndex: number) => void;
  groupSelectedLayers: () => void;
  ungroupSelectedLayers: () => void;
  alignSelectedLayers: (mode: AlignMode) => void;
  splitLayerAtPlayhead: () => void;
  selectLayers: (ids: string[]) => void;
  toggleLayerSelected: (id: string) => void;
  selectedLayers: () => Layer[];
  findLayer: (id: string) => Layer | undefined;

  /* camera + cursor */
  setCamera: (layerId: string, patch: Partial<CameraSpec>, label?: string) => void;
  setCursor: (layerId: string, patch: Partial<CursorSpec>, label?: string, coalesce?: boolean) => void;
  setFocusPoints: (layerId: string, points: FocusPoint[], label: string) => void;
  addFocusPointAtPlayhead: (layerId: string, x: number, y: number) => void;

  /* keyframes */
  addKeyframe: (layerId: string, property: AnimatableProperty, value: number) => void;
  removeKeyframe: (layerId: string, property: AnimatableProperty, keyframeId: string) => void;
  moveKeyframe: (layerId: string, property: AnimatableProperty, keyframeId: string, time: number) => void;

  /* assets */
  addAssets: (assets: MediaAsset[]) => void;
  removeAsset: (assetId: string) => void;
  /** Fill in width/height once a video actually decodes. Not undoable. */
  updateAssetDimensions: (assetId: string, width: number, height: number) => void;
  /** Append pointer samples to a recording asset — browser fallback for native cursor capture. */
  appendCursorSamples: (assetId: string, samples: CursorEvent[]) => void;
  /** Replace the cursor track (Detect Taps from imported video). */
  setCursorSamples: (
    assetId: string,
    samples: CursorEvent[],
    opts?: { inferred?: boolean; label?: string },
  ) => void;
  clearCursorSamples: (assetId: string) => void;

  /* playback */
  setPlayhead: (time: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setLoop: (loop: boolean) => void;
  sceneDuration: () => number;

  /* ui */
  setMode: (mode: EditorMode) => void;
  setSidebarSection: (section: SidebarSection) => void;
  setCanvasZoom: (zoom: number) => void;
  setCanvasFit: (fit: boolean) => void;
  setCanvasPan: (pan: { x: number; y: number }) => void;
  setTimelineHeight: (h: number) => void;
  setTimelinePxPerSecond: (px: number) => void;
  showToast: (message: string, tone?: 'info' | 'error' | 'success') => void;
  dismissToast: () => void;

  /* persistence */
  save: (thumbnail?: string) => Promise<void>;
  markDirty: () => void;
}

export type EditorStore = EditorState & EditorActions;

const history = new History();

/* --------------------------------------------------------------- autosave */

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const AUTOSAVE_DELAY = 1200;

function scheduleAutosave(get: () => EditorStore, set: (partial: Partial<EditorState>) => void) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void (async () => {
      set({ saveState: 'saving' });
      try {
        await saveProject(get().project);
        set({ saveState: 'saved', lastSavedAt: Date.now() });
      } catch (err) {
        console.error('[MotionDeck] autosave failed', err);
        set({ saveState: 'error' });
      }
    })();
  }, AUTOSAVE_DELAY);
}

const totalSceneDuration = (scene: Scene): number =>
  Math.max(scene.duration, ...scene.layers.map((l) => l.start + l.duration), 0.5);

export const useEditor = create<EditorStore>((set, get) => ({
  project: createProject(),
  activeSceneIndex: 0,
  selectedLayerIds: [],
  playhead: 0,
  isPlaying: false,
  loop: true,
  mode: 'quick',
  sidebarSection: 'create',
  canvasZoom: 1,
  canvasFit: true,
  canvasPan: { x: 0, y: 0 },
  timelineHeight: 232,
  timelinePxPerSecond: 78,
  saveState: 'idle',
  lastSavedAt: null,
  historyVersion: 0,
  toast: null,

  /* ------------------------------------------------------------- lifecycle */

  loadProject: (project) => {
    history.clear();
    clearCursorCache();
    set({
      project,
      activeSceneIndex: 0,
      selectedLayerIds: [],
      playhead: 0,
      isPlaying: false,
      saveState: 'saved',
      lastSavedAt: project.updatedAt,
      historyVersion: get().historyVersion + 1,
      canvasFit: true,
    });
  },

  newProject: (name, canvas) => {
    get().loadProject(createProject(name, canvas));
  },

  renameProject: (name) => get().mutate('Rename project', (d) => void (d.name = name), true),

  setCanvasSize: (size) =>
    get().mutate('Change canvas size', (d) => {
      d.canvas = size;
      d.exportSettings = { ...d.exportSettings, width: size.width, height: size.height };
    }),

  setExportSettings: (patch) =>
    get().mutate('Change export settings', (d) => {
      d.exportSettings = { ...d.exportSettings, ...patch };
    }),

  /* --------------------------------------------------------------- mutate */

  mutate: (label, recipe, coalesce = false) => {
    const previous = get().project;
    const next = produce(previous, (draft) => {
      recipe(draft);
      draft.updatedAt = Date.now();
    });
    if (next === previous) return;
    const pushed = history.push(previous, label, coalesce);
    set({
      project: next,
      saveState: 'idle',
      historyVersion: pushed ? get().historyVersion + 1 : get().historyVersion,
    });
    scheduleAutosave(get, set);
  },

  replaceProject: (label, next) => {
    const previous = get().project;
    history.push(previous, label);
    clearCursorCache();
    set({
      project: { ...next, updatedAt: Date.now() },
      activeSceneIndex: clamp(get().activeSceneIndex, 0, next.scenes.length - 1),
      selectedLayerIds: [],
      historyVersion: get().historyVersion + 1,
      saveState: 'idle',
    });
    scheduleAutosave(get, set);
  },

  /* -------------------------------------------------------------- history */

  undo: () => {
    const restored = history.undo(get().project);
    if (!restored) return;
    clearCursorCache();
    set({
      project: restored,
      activeSceneIndex: clamp(get().activeSceneIndex, 0, restored.scenes.length - 1),
      selectedLayerIds: get().selectedLayerIds.filter((id) =>
        restored.scenes.some((s) => s.layers.some((l) => l.id === id)),
      ),
      historyVersion: get().historyVersion + 1,
      saveState: 'idle',
    });
    scheduleAutosave(get, set);
  },

  redo: () => {
    const restored = history.redo(get().project);
    if (!restored) return;
    clearCursorCache();
    set({
      project: restored,
      activeSceneIndex: clamp(get().activeSceneIndex, 0, restored.scenes.length - 1),
      historyVersion: get().historyVersion + 1,
      saveState: 'idle',
    });
    scheduleAutosave(get, set);
  },

  canUndo: () => history.canUndo,
  canRedo: () => history.canRedo,

  /* --------------------------------------------------------------- scenes */

  activeScene: () => {
    const { project, activeSceneIndex } = get();
    return project.scenes[clamp(activeSceneIndex, 0, project.scenes.length - 1)];
  },

  setActiveScene: (index) => {
    const max = get().project.scenes.length - 1;
    set({ activeSceneIndex: clamp(index, 0, max), playhead: 0, isPlaying: false, selectedLayerIds: [] });
  },

  addScene: () => {
    const count = get().project.scenes.length;
    get().mutate('Add scene', (d) => {
      d.scenes.push(createScene(`Scene ${count + 1}`, 6));
    });
    set({ activeSceneIndex: count, playhead: 0 });
  },

  duplicateScene: (index) => {
    get().mutate('Duplicate scene', (d) => {
      const source = d.scenes[index];
      if (!source) return;
      const copy: Scene = JSON.parse(JSON.stringify(source));
      copy.id = uid('sc');
      copy.name = `${source.name} copy`;
      copy.layers = copy.layers.map((l) => ({ ...l, id: uid('ly') }));
      d.scenes.splice(index + 1, 0, copy);
    });
    set({ activeSceneIndex: index + 1 });
  },

  deleteScene: (index) => {
    if (get().project.scenes.length <= 1) {
      get().showToast('A project needs at least one scene.', 'info');
      return;
    }
    get().mutate('Delete scene', (d) => void d.scenes.splice(index, 1));
    set({ activeSceneIndex: clamp(index - 1, 0, get().project.scenes.length - 1), playhead: 0 });
  },

  moveScene: (from, to) => {
    get().mutate('Reorder scenes', (d) => {
      if (to < 0 || to >= d.scenes.length) return;
      const [moved] = d.scenes.splice(from, 1);
      d.scenes.splice(to, 0, moved);
    });
    set({ activeSceneIndex: to });
  },

  updateScene: (index, patch, label = 'Update scene') =>
    get().mutate(label, (d) => {
      const scene = d.scenes[index];
      if (scene) Object.assign(scene, patch);
    }),

  setSceneBackground: (spec) =>
    get().updateScene(get().activeSceneIndex, { background: spec }, 'Change background'),

  /* --------------------------------------------------------------- layers */

  addLayer: (layer, label = 'Add layer') => {
    get().mutate(label, (d) => {
      const scene = d.scenes[get().activeSceneIndex];
      if (!scene) return;
      scene.layers.push(layer);
      scene.duration = Math.max(scene.duration, layer.start + layer.duration);
    });
    set({ selectedLayerIds: [layer.id] });
  },

  updateLayer: (id, patch, label = 'Update layer', coalesce = false) =>
    get().mutate(
      label,
      (d) => {
        for (const scene of d.scenes) {
          const layer = scene.layers.find((l) => l.id === id);
          if (layer) {
            Object.assign(layer, patch);
            scene.duration = Math.max(scene.duration, layer.start + layer.duration);
            return;
          }
        }
      },
      coalesce,
    ),

  updateVideoLayer: (id, patch, label = 'Update clip', coalesce = false) =>
    get().updateLayer<VideoLayer>(id, patch, label, coalesce),

  removeLayers: (ids) => {
    if (ids.length === 0) return;
    get().mutate(ids.length > 1 ? 'Delete layers' : 'Delete layer', (d) => {
      for (const scene of d.scenes) {
        scene.layers = scene.layers.filter((l) => !ids.includes(l.id));
      }
    });
    set({ selectedLayerIds: [] });
  },

  duplicateLayer: (id) => {
    const newId = uid('ly');
    get().mutate('Duplicate layer', (d) => {
      for (const scene of d.scenes) {
        const index = scene.layers.findIndex((l) => l.id === id);
        if (index === -1) continue;
        const copy: Layer = JSON.parse(JSON.stringify(scene.layers[index]));
        copy.id = newId;
        copy.name = `${copy.name} copy`;
        copy.position = { x: copy.position.x + 40, y: copy.position.y + 40 };
        scene.layers.splice(index + 1, 0, copy);
        return;
      }
    });
    set({ selectedLayerIds: [newId] });
  },

  reorderLayer: (id, delta) =>
    get().mutate('Reorder layer', (d) => {
      for (const scene of d.scenes) {
        const index = scene.layers.findIndex((l) => l.id === id);
        if (index === -1) continue;
        const target = clamp(index + delta, 0, scene.layers.length - 1);
        if (target === index) return;
        const [moved] = scene.layers.splice(index, 1);
        scene.layers.splice(target, 0, moved);
        return;
      }
    }),

  moveLayerToIndex: (id, toIndex) =>
    get().mutate('Reorder layer', (d) => {
      const scene = d.scenes[get().activeSceneIndex];
      if (!scene) return;
      const index = scene.layers.findIndex((l) => l.id === id);
      if (index === -1) return;
      const target = clamp(toIndex, 0, scene.layers.length - 1);
      if (target === index) return;
      const [moved] = scene.layers.splice(index, 1);
      scene.layers.splice(target, 0, moved);
    }),

  groupSelectedLayers: () => {
    const ids = get().selectedLayerIds.filter((id) => {
      const layer = get().findLayer(id);
      return layer && layer.type !== 'audio';
    });
    if (ids.length < 2) {
      get().showToast('Select two or more layers to group.', 'info');
      return;
    }
    const groupId = uid('grp');
    get().mutate('Group layers', (d) => {
      const scene = d.scenes[get().activeSceneIndex];
      for (const layer of scene.layers) {
        if (ids.includes(layer.id)) layer.groupId = groupId;
      }
    });
    get().showToast('Grouped. Move or animate any member to move them together.', 'success');
  },

  ungroupSelectedLayers: () => {
    const ids = get().selectedLayerIds;
    if (ids.length === 0) return;
    get().mutate('Ungroup layers', (d) => {
      const scene = d.scenes[get().activeSceneIndex];
      const groupIds = new Set(
        scene.layers.filter((l) => ids.includes(l.id) && l.groupId).map((l) => l.groupId!),
      );
      for (const layer of scene.layers) {
        if (layer.groupId && (ids.includes(layer.id) || groupIds.has(layer.groupId))) {
          delete layer.groupId;
        }
      }
    });
  },

  alignSelectedLayers: (mode) => {
    const layers = get()
      .selectedLayers()
      .filter((l) => l.type !== 'audio' && !l.locked);
    if (layers.length === 0) return;
    const canvas = get().project.canvas;
    get().mutate(`Align ${mode}`, (d) => {
      const scene = d.scenes[get().activeSceneIndex];
      for (const source of layers) {
        const layer = scene.layers.find((l) => l.id === source.id);
        if (!layer) continue;
        const next = { ...layer.position };
        if (mode === 'left') next.x = -canvas.width / 4;
        else if (mode === 'center') next.x = 0;
        else if (mode === 'right') next.x = canvas.width / 4;
        else if (mode === 'top') next.y = -canvas.height / 4;
        else if (mode === 'middle') next.y = 0;
        else if (mode === 'bottom') next.y = canvas.height / 4;
        layer.position = next;
      }
    });
  },

  splitLayerAtPlayhead: () => {
    const { playhead, selectedLayerIds, activeSceneIndex } = get();
    const scene = get().project.scenes[activeSceneIndex];
    const targets = scene.layers.filter(
      (l) =>
        (selectedLayerIds.length === 0 || selectedLayerIds.includes(l.id)) &&
        playhead > l.start + 0.05 &&
        playhead < l.start + l.duration - 0.05,
    );
    if (targets.length === 0) {
      get().showToast('Move the playhead over a clip to split it.', 'info');
      return;
    }

    const newIds: string[] = [];
    get().mutate('Split clip', (d) => {
      const target = d.scenes[activeSceneIndex];
      for (const source of targets) {
        const index = target.layers.findIndex((l) => l.id === source.id);
        const layer = target.layers[index];
        const offset = playhead - layer.start;

        const right: Layer = JSON.parse(JSON.stringify(layer));
        right.id = uid('ly');
        right.start = playhead;
        right.duration = layer.duration - offset;
        // Media layers must also advance their in-point, or the right half repeats.
        if (right.type === 'video' || right.type === 'audio') {
          right.trimStart = right.trimStart + offset * (right.type === 'video' ? right.playbackRate : 1);
        }
        layer.duration = offset;
        if (layer.type === 'video' || layer.type === 'audio') {
          layer.trimEnd = layer.trimStart + offset * (layer.type === 'video' ? layer.playbackRate : 1);
        }
        target.layers.splice(index + 1, 0, right);
        newIds.push(right.id);
      }
    });
    set({ selectedLayerIds: newIds });
  },

  selectLayers: (ids) => set({ selectedLayerIds: ids }),

  toggleLayerSelected: (id) =>
    set((s) => ({
      selectedLayerIds: s.selectedLayerIds.includes(id)
        ? s.selectedLayerIds.filter((x) => x !== id)
        : [...s.selectedLayerIds, id],
    })),

  selectedLayers: () => {
    const { selectedLayerIds } = get();
    return get()
      .activeScene()
      .layers.filter((l) => selectedLayerIds.includes(l.id));
  },

  findLayer: (id) => {
    for (const scene of get().project.scenes) {
      const layer = scene.layers.find((l) => l.id === id);
      if (layer) return layer;
    }
    return undefined;
  },

  /* ------------------------------------------------------- camera + cursor */

  setCamera: (layerId, patch, label = 'Change camera') =>
    get().mutate(label, (d) => {
      for (const scene of d.scenes) {
        const layer = scene.layers.find((l) => l.id === layerId);
        if (layer?.type === 'video') {
          layer.camera = { ...layer.camera, ...patch };
          return;
        }
      }
    }),

  setCursor: (layerId, patch, label = 'Change cursor', coalesce = false) =>
    get().mutate(
      label,
      (d) => {
        for (const scene of d.scenes) {
          const layer = scene.layers.find((l) => l.id === layerId);
          if (layer?.type === 'video') {
            layer.cursor = { ...layer.cursor, ...patch };
            return;
          }
        }
      },
      coalesce,
    ),

  setFocusPoints: (layerId, points, label) =>
    get().mutate(label, (d) => {
      for (const scene of d.scenes) {
        const layer = scene.layers.find((l) => l.id === layerId);
        if (layer?.type === 'video') {
          layer.camera.focusPoints = points;
          return;
        }
      }
    }),

  addFocusPointAtPlayhead: (layerId, x, y) => {
    const layer = get().findLayer(layerId);
    if (!layer || layer.type !== 'video') return;
    const time = Math.max(0, get().playhead - layer.start);
    get().mutate('Add focus point', (d) => {
      for (const scene of d.scenes) {
        const target = scene.layers.find((l) => l.id === layerId);
        if (target?.type === 'video') {
          target.camera.focusPoints.push({
            id: uid('fp'),
            time,
            x,
            y,
            coordinateSpace: target.appScreen?.enabled ? 'crop' : 'source',
            zoom: 1.8,
            hold: 1.2,
            ramp: 0.7,
            easing: 'smooth',
          });
          target.camera.focusPoints.sort((a, b) => a.time - b.time);
          if (target.camera.mode === 'none') target.camera.mode = 'smoothFocus';
          return;
        }
      }
    });
  },

  /* ------------------------------------------------------------ keyframes */

  addKeyframe: (layerId, property, value) => {
    const layer = get().findLayer(layerId);
    if (!layer) return;
    const time = Math.max(0, get().playhead - layer.start);
    get().mutate('Add keyframe', (d) => {
      for (const scene of d.scenes) {
        const target = scene.layers.find((l) => l.id === layerId);
        if (!target) continue;
        const track = (target.keyframes[property] ??= []);
        const existing = track.find((k) => Math.abs(k.time - time) < 0.02);
        if (existing) existing.value = value;
        else track.push({ id: uid('kf'), time, value, easing: 'easeInOut' });
        track.sort((a, b) => a.time - b.time);
        return;
      }
    });
  },

  removeKeyframe: (layerId, property, keyframeId) =>
    get().mutate('Remove keyframe', (d) => {
      for (const scene of d.scenes) {
        const target = scene.layers.find((l) => l.id === layerId);
        if (!target) continue;
        const track = target.keyframes[property];
        if (!track) return;
        target.keyframes[property] = track.filter((k) => k.id !== keyframeId);
        if (target.keyframes[property]!.length === 0) delete target.keyframes[property];
        return;
      }
    }),

  moveKeyframe: (layerId, property, keyframeId, time) =>
    get().mutate(
      'Move keyframe',
      (d) => {
        for (const scene of d.scenes) {
          const target = scene.layers.find((l) => l.id === layerId);
          const track = target?.keyframes[property];
          if (!track) continue;
          const kf = track.find((k) => k.id === keyframeId);
          if (kf) {
            kf.time = Math.max(0, time);
            track.sort((a, b) => a.time - b.time);
          }
          return;
        }
      },
      true,
    ),

  /* --------------------------------------------------------------- assets */

  addAssets: (assets) =>
    get().mutate(assets.length > 1 ? 'Import media' : 'Import file', (d) => {
      for (const asset of assets) {
        if (!d.assets.some((a) => a.id === asset.id)) d.assets.push(asset);
      }
    }),

  updateAssetDimensions: (assetId, width, height) => {
    if (width < 2 || height < 2) return;
    const { project } = get();
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    if (asset.width === width && asset.height === height) return;

    const next = produce(project, (d) => {
      const a = d.assets.find((x) => x.id === assetId);
      if (!a) return;
      a.width = width;
      a.height = height;
      d.updatedAt = Date.now();
    });
    set({ project: next });
    scheduleAutosave(get, set);

    const videos = project.scenes.flatMap((s) => s.layers.filter((l) => l.type === 'video'));
    if (
      videos.length === 1 &&
      videos[0]?.type === 'video' &&
      videos[0].assetId === assetId &&
      aspectsClash(project.canvas, { width, height })
    ) {
      get().setCanvasSize(suggestedCanvas(width, height));
    }
  },

  removeAsset: (assetId) =>
    get().mutate('Remove media', (d) => {
      d.assets = d.assets.filter((a) => a.id !== assetId);
      for (const scene of d.scenes) {
        scene.layers = scene.layers.filter(
          (l) => !('assetId' in l) || (l as { assetId: string }).assetId !== assetId,
        );
      }
    }),

  appendCursorSamples: (assetId, samples) => {
    if (samples.length === 0) return;
    get().mutate(
      'Record cursor path',
      (d) => {
        const asset = d.assets.find((a) => a.id === assetId);
        if (!asset) return;
        if (!asset.recording) {
          asset.recording = emptyImportRecording({
            width: asset.width,
            height: asset.height,
            fps: asset.frameRate,
          });
        }
        asset.recording.cursor = [...asset.recording.cursor, ...samples].sort((a, b) => a.t - b.t);
        asset.recording.cursorCaptured = true;
        asset.recording.cursorInferred = false;
      },
      true,
    );
  },

  /** Replace cursor track (used by Detect Taps from imported video). */
  setCursorSamples: (assetId, samples, opts?: { inferred?: boolean; label?: string }) => {
    get().mutate(opts?.label ?? 'Set cursor path', (d) => {
      const asset = d.assets.find((a) => a.id === assetId);
      if (!asset) return;
      if (!asset.recording) {
        asset.recording = emptyImportRecording({
          width: asset.width,
          height: asset.height,
          fps: asset.frameRate,
        });
      }
      asset.recording.cursor = [...samples].sort((a, b) => a.t - b.t);
      asset.recording.cursorCaptured = samples.length > 0;
      asset.recording.cursorInferred = Boolean(opts?.inferred) && samples.length > 0;
    });
  },

  clearCursorSamples: (assetId) =>
    get().mutate('Clear cursor path', (d) => {
      const asset = d.assets.find((a) => a.id === assetId);
      if (asset?.recording) {
        asset.recording.cursor = [];
        asset.recording.cursorCaptured = false;
        asset.recording.cursorInferred = false;
      }
    }),

  /* ------------------------------------------------------------- playback */

  sceneDuration: () => totalSceneDuration(get().activeScene()),

  setPlayhead: (time) => set({ playhead: clamp(time, 0, get().sceneDuration()) }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setLoop: (loop) => set({ loop }),

  /* ------------------------------------------------------------------- ui */

  setMode: (mode) => set({ mode }),
  setSidebarSection: (sidebarSection) => set({ sidebarSection }),
  setCanvasZoom: (canvasZoom) => set({ canvasZoom: clamp(canvasZoom, 0.1, 4), canvasFit: false }),
  setCanvasFit: (canvasFit) => set({ canvasFit, canvasPan: { x: 0, y: 0 } }),
  setCanvasPan: (canvasPan) => set({ canvasPan }),
  setTimelineHeight: (h) => set({ timelineHeight: clamp(h, 140, 480) }),
  setTimelinePxPerSecond: (px) => set({ timelinePxPerSecond: clamp(px, 12, 420) }),

  showToast: (message, tone = 'info') => set({ toast: { id: uid('t'), message, tone } }),
  dismissToast: () => set({ toast: null }),

  /* ---------------------------------------------------------- persistence */

  save: async (thumbnail) => {
    if (saveTimer) clearTimeout(saveTimer);
    set({ saveState: 'saving' });
    try {
      await saveProject(get().project, thumbnail);
      set({ saveState: 'saved', lastSavedAt: Date.now() });
    } catch (err) {
      console.error('[MotionDeck] save failed', err);
      set({ saveState: 'error' });
      get().showToast('Could not save this project.', 'error');
    }
  },

  markDirty: () => {
    set({ saveState: 'idle' });
    scheduleAutosave(get, set);
  },
}));

/* --------------------------------------------------------------- selectors */

export const selectActiveScene = (s: EditorStore): Scene =>
  s.project.scenes[clamp(s.activeSceneIndex, 0, s.project.scenes.length - 1)];

export const selectSelectedLayer = (s: EditorStore): Layer | null => {
  if (s.selectedLayerIds.length !== 1) return null;
  return selectActiveScene(s).layers.find((l) => l.id === s.selectedLayerIds[0]) ?? null;
};

export const selectSceneDuration = (s: EditorStore): number =>
  totalSceneDuration(selectActiveScene(s));

export const layerTypeLabel: Record<LayerType, string> = {
  video: 'Recording',
  image: 'Image',
  text: 'Text',
  shape: 'Shape',
  callout: 'Callout',
  frame: 'Frame',
  audio: 'Audio',
};

export { defaultExportSettings };
