/**
 * Undo/redo.
 *
 * Snapshots of the immutable project document. Because every mutation goes through
 * Immer and produces a new frozen object, snapshots are structurally shared and cheap.
 *
 * Rapid, continuous edits (dragging a slider) are coalesced by `label` within a short
 * window so one drag is one undo step rather than two hundred.
 */

import type { Project } from '../core/types';

export interface HistoryEntry {
  project: Project;
  label: string;
  at: number;
}

const MAX_ENTRIES = 120;
const COALESCE_MS = 550;

export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private lastLabel = '';
  private lastAt = 0;

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | null {
    return this.past.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future.at(-1)?.label ?? null;
  }

  /** Records the state *before* a mutation. Returns false when coalesced. */
  push(previous: Project, label: string, coalesce = false): boolean {
    const now = Date.now();
    if (coalesce && label === this.lastLabel && now - this.lastAt < COALESCE_MS) {
      this.lastAt = now;
      this.future = [];
      return false;
    }

    this.past.push({ project: previous, label, at: now });
    if (this.past.length > MAX_ENTRIES) this.past.shift();
    this.future = [];
    this.lastLabel = label;
    this.lastAt = now;
    return true;
  }

  undo(current: Project): Project | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push({ project: current, label: entry.label, at: Date.now() });
    // Break the coalescing window so the next edit always starts a fresh step.
    this.lastLabel = '';
    return entry.project;
  }

  redo(current: Project): Project | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push({ project: current, label: entry.label, at: Date.now() });
    this.lastLabel = '';
    return entry.project;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.lastLabel = '';
  }
}
