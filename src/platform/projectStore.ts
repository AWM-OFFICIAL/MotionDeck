/**
 * Project persistence + crash recovery.
 *
 * Projects are small JSON documents (media lives in the vault), so they are written
 * to OPFS with a localStorage index for instant home-screen rendering. Every save also
 * updates a recovery slot that survives a hard crash.
 */

import type { FrameLayer, Project, ProjectSummary } from '../core/types';
import { SCHEMA_VERSION } from '../core/types';

const INDEX_KEY = 'motiondeck.projects.index.v1';
const RECOVERY_KEY = 'motiondeck.recovery.v1';
const LAST_OPEN_KEY = 'motiondeck.lastOpen.v1';
const DIR_NAME = 'projects';

let dirHandle: FileSystemDirectoryHandle | null = null;
let dirFailed = false;
const memoryProjects = new Map<string, string>();

async function getDir(): Promise<FileSystemDirectoryHandle | null> {
  if (dirHandle) return dirHandle;
  if (dirFailed) return null;
  try {
    const root = await navigator.storage.getDirectory();
    dirHandle = await root.getDirectoryHandle(DIR_NAME, { create: true });
    return dirHandle;
  } catch {
    dirFailed = true;
    return null;
  }
}

/* ------------------------------------------------------------------- index */

function readIndex(): ProjectSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: ProjectSummary[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('[MotionDeck] could not persist project index', err);
  }
}

export const projectDuration = (project: Project): number =>
  project.scenes.reduce((total, scene) => total + scene.duration, 0);

export function listProjects(): ProjectSummary[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

/* -------------------------------------------------------------------- CRUD */

export async function saveProject(project: Project, thumbnail?: string): Promise<void> {
  const payload = JSON.stringify({ ...project, schemaVersion: SCHEMA_VERSION });
  const dir = await getDir();
  if (dir) {
    const handle = await dir.getFileHandle(`${project.id}.json`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(payload);
    await writable.close();
  } else {
    memoryProjects.set(project.id, payload);
  }

  const index = readIndex();
  const summary: ProjectSummary = {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    duration: projectDuration(project),
    thumbnail: thumbnail ?? index.find((p) => p.id === project.id)?.thumbnail,
    isSample: project.isSample,
  };
  const next = index.filter((p) => p.id !== project.id);
  next.unshift(summary);
  writeIndex(next);

  try {
    localStorage.setItem(RECOVERY_KEY, payload);
    localStorage.setItem(LAST_OPEN_KEY, project.id);
  } catch {
    // Recovery is best-effort: a project too large for localStorage still saves to OPFS.
  }
}

export async function loadProject(id: string): Promise<Project | null> {
  const dir = await getDir();
  let raw: string | null = null;
  if (dir) {
    try {
      const handle = await dir.getFileHandle(`${id}.json`);
      raw = await (await handle.getFile()).text();
    } catch {
      raw = null;
    }
  }
  raw ??= memoryProjects.get(id) ?? null;
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw) as Project);
  } catch (err) {
    console.error('[MotionDeck] corrupt project file', id, err);
    return null;
  }
}

export async function deleteProject(id: string): Promise<void> {
  memoryProjects.delete(id);
  const dir = await getDir();
  if (dir) {
    try {
      await dir.removeEntry(`${id}.json`);
    } catch {
      /* already gone */
    }
  }
  writeIndex(readIndex().filter((p) => p.id !== id));
}

export async function renameProject(id: string, name: string): Promise<void> {
  const project = await loadProject(id);
  if (!project) return;
  project.name = name;
  project.updatedAt = Date.now();
  await saveProject(project);
}

export function updateThumbnail(id: string, thumbnail: string): void {
  const index = readIndex();
  const entry = index.find((p) => p.id === id);
  if (!entry) return;
  entry.thumbnail = thumbnail;
  writeIndex(index);
}

/* ---------------------------------------------------------------- recovery */

export function readRecovery(): Project | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    return raw ? migrate(JSON.parse(raw) as Project) : null;
  } catch {
    return null;
  }
}

export function clearRecovery(): void {
  try {
    localStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* ignore */
  }
}

export const lastOpenedProjectId = (): string | null => {
  try {
    return localStorage.getItem(LAST_OPEN_KEY);
  } catch {
    return null;
  }
};

/* --------------------------------------------------------------- migration */

/** Forward-compatible loader. Older documents are upgraded in place. */
export function migrateProject(project: Project): Project {
  return migrate(project);
}

function migrate(project: Project): Project {
  const version = project.schemaVersion ?? 0;
  if (version >= SCHEMA_VERSION) return project;
  // v0 -> v1: focusPoints and exportSettings became required.
  for (const scene of project.scenes ?? []) {
    for (const layer of scene.layers ?? []) {
      if (layer.type === 'video' && !layer.camera.focusPoints) layer.camera.focusPoints = [];
      // v1 -> v2: optional border/glow/motionBlur/cropTrack stay undefined until used.
      if (layer.type === 'video' && layer.appScreen && !layer.appScreen.cropTrack) {
        layer.appScreen.cropTrack = {
          mode: layer.appScreen.trackingEnabled ? 'tracked' : 'static',
          initialRect: { ...layer.crop },
          keyframes: [],
          status: 'idle',
          avgConfidence: 1,
        };
      }
      if (layer.type === 'frame') {
        const frame = layer as FrameLayer & { nestAppScreen?: boolean };
        if (frame.nestAppScreen === undefined) frame.nestAppScreen = true;
      }
    }
  }
  // v2 -> v3: imported (and other) video assets without a recording sidecar
  // get an empty one so Mark path / Focus / Auto Tap share recorded-clip paths.
  if (version < 3) {
    for (const asset of project.assets ?? []) {
      if (asset.kind === 'video' && !asset.recording) {
        asset.recording = {
          source: 'import',
          screen: {
            width: asset.width && asset.width >= 2 ? asset.width : 1920,
            height: asset.height && asset.height >= 2 ? asset.height : 1080,
          },
          cursor: [],
          cursorCaptured: false,
          hasSystemAudio: false,
          hasMicrophone: false,
          fps: asset.frameRate && asset.frameRate > 0 ? asset.frameRate : 30,
        };
      }
    }
  }
  project.schemaVersion = SCHEMA_VERSION;
  return project;
}

/** Every media key referenced by any known project — used to prune the vault. */
export async function collectReferencedMediaKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const summary of listProjects()) {
    const project = await loadProject(summary.id);
    for (const asset of project?.assets ?? []) keys.add(asset.storageKey);
  }
  return keys;
}
