/**
 * Local media vault.
 *
 * Recordings and imported media are stored once, by key, and referenced from projects.
 * Nothing leaves the machine: OPFS in the WebView (which Tauri backs with a real
 * on-disk directory), with an in-memory fallback so the app still runs where OPFS is
 * unavailable instead of losing the user's recording without warning.
 */

const DIR_NAME = 'media';

let dirHandle: FileSystemDirectoryHandle | null = null;
let opfsUnavailableReason: string | null = null;

/** Fallback store — keeps the session working, but is not persistent. */
const memoryStore = new Map<string, Blob>();
const urlCache = new Map<string, string>();

export const isPersistent = () => dirHandle !== null;
export const persistenceWarning = () => opfsUnavailableReason;

async function getDir(): Promise<FileSystemDirectoryHandle | null> {
  if (dirHandle) return dirHandle;
  if (opfsUnavailableReason) return null;
  try {
    const root = await navigator.storage.getDirectory();
    dirHandle = await root.getDirectoryHandle(DIR_NAME, { create: true });
    return dirHandle;
  } catch (err) {
    opfsUnavailableReason =
      err instanceof Error ? err.message : 'Local media storage is unavailable.';
    console.warn('[MotionDeck] OPFS unavailable, using in-memory media store', err);
    return null;
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* non-fatal */
  }
  return false;
}

export async function writeMedia(key: string, data: Blob): Promise<void> {
  const dir = await getDir();
  if (!dir) {
    memoryStore.set(key, data);
    return;
  }
  const handle = await dir.getFileHandle(key, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function readMedia(key: string): Promise<Blob | null> {
  const dir = await getDir();
  if (!dir) return memoryStore.get(key) ?? null;
  try {
    const handle = await dir.getFileHandle(key);
    return await handle.getFile();
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

export async function deleteMedia(key: string): Promise<void> {
  memoryStore.delete(key);
  revokeMediaUrl(key);
  const dir = await getDir();
  if (!dir) return;
  try {
    await dir.removeEntry(key);
  } catch {
    /* already gone */
  }
}

/** Stable object URL per key — revoked explicitly, never leaked per render. */
export async function getMediaUrl(key: string): Promise<string | null> {
  const existing = urlCache.get(key);
  if (existing) return existing;
  const blob = await readMedia(key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export function revokeMediaUrl(key: string): void {
  const url = urlCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
}

export function revokeAllMediaUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

export async function listMediaKeys(): Promise<string[]> {
  const dir = await getDir();
  if (!dir) return [...memoryStore.keys()];
  const keys: string[] = [];
  // @ts-expect-error - async iteration over FileSystemDirectoryHandle is not yet in lib.dom
  for await (const [name] of dir.entries()) keys.push(name as string);
  return keys;
}

/** Removes vault entries no project references any more. */
export async function pruneMedia(referenced: Set<string>): Promise<number> {
  const keys = await listMediaKeys();
  let removed = 0;
  for (const key of keys) {
    if (!referenced.has(key)) {
      await deleteMedia(key);
      removed++;
    }
  }
  return removed;
}

export async function estimateUsage(): Promise<{ usage: number; quota: number }> {
  try {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return { usage: 0, quota: 0 };
  }
}
