/**
 * Review / edit taps inferred from video so heuristic detection is not final.
 */

import { useEffect, useMemo, useState } from 'react';
import type { CursorEvent, VideoLayer } from '../core/types';
import { useEditor } from '../state/editorStore';
import { Button, Dialog, Field, NumberInput, Slider } from '../ui/primitives';
import { IconTrash } from '../ui/icons';

export interface DetectedTap {
  id: string;
  time: number;
  x: number;
  y: number;
}

function downsToTaps(events: CursorEvent[]): DetectedTap[] {
  return events
    .filter((e) => e.down)
    .map((e, i) => ({
      id: `tap-${i}-${e.t.toFixed(3)}`,
      time: e.t,
      x: e.x,
      y: e.y,
    }));
}

function tapsToEvents(taps: DetectedTap[]): CursorEvent[] {
  const sorted = [...taps].sort((a, b) => a.time - b.time);
  const events: CursorEvent[] = [];
  for (const t of sorted) {
    events.push({ t: t.time, x: t.x, y: t.y, down: true, button: 0 });
    events.push({ t: Number((t.time + 0.06).toFixed(3)), x: t.x, y: t.y });
  }
  return events;
}

interface Props {
  open: boolean;
  layer: VideoLayer;
  assetId: string;
  initialEvents: CursorEvent[];
  onClose: () => void;
}

export function DetectedTapsDialog({ open, layer, assetId, initialEvents, onClose }: Props) {
  const setCursorSamples = useEditor((s) => s.setCursorSamples);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const playhead = useEditor((s) => s.playhead);
  const showToast = useEditor((s) => s.showToast);
  const [taps, setTaps] = useState<DetectedTap[]>(() => downsToTaps(initialEvents));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const next = downsToTaps(initialEvents);
      setTaps(next);
      setSelectedId(next[0]?.id ?? null);
    }
  }, [open, initialEvents]);

  const selected = useMemo(
    () => taps.find((t) => t.id === selectedId) ?? null,
    [taps, selectedId],
  );

  const updateTap = (id: string, patch: Partial<DetectedTap>) => {
    setTaps((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const removeTap = (id: string) => {
    setTaps((list) => {
      const next = list.filter((t) => t.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };

  const addAtPlayhead = () => {
    const time = Math.max(0, playhead - layer.start);
    const id = `tap-manual-${Date.now()}`;
    const tap: DetectedTap = { id, time, x: 0.5, y: 0.5 };
    setTaps((list) => [...list, tap].sort((a, b) => a.time - b.time));
    setSelectedId(id);
    setPlayhead(layer.start + time);
  };

  const apply = (confirmed: boolean) => {
    const events = tapsToEvents(taps);
    setCursorSamples(assetId, events, {
      inferred: !confirmed && events.some((e) => e.down),
      label: confirmed ? 'Confirm detected taps' : 'Edit detected taps',
    });
    showToast(
      confirmed
        ? `Confirmed ${taps.length} tap${taps.length === 1 ? '' : 's'}.`
        : `Saved ${taps.length} tap${taps.length === 1 ? '' : 's'}.`,
      'success',
    );
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Review detected taps"
      description="Detection finds UI flashes, not a real OS cursor. Delete false positives, nudge positions, then Confirm."
      width={520}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => apply(false)}>Save draft</Button>
          <Button variant="primary" onClick={() => apply(true)}>
            Confirm taps
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Button size="sm" onClick={addAtPlayhead}>
            Add at playhead
          </Button>
          <p className="self-center text-[11px] text-[var(--color-ink-500)]">
            {taps.length} tap{taps.length === 1 ? '' : 's'}
          </p>
        </div>

        {taps.length === 0 ? (
          <p className="rounded-[6px] bg-[var(--color-ink-900)] px-3 py-3 text-[12px] text-[var(--color-ink-400)]">
            No taps left. Add one at the playhead, or cancel and use Mark path.
          </p>
        ) : (
          <ul className="max-h-44 space-y-1 overflow-y-auto rounded-[6px] border border-[var(--color-ink-700)] p-1">
            {taps.map((tap, index) => (
              <li key={tap.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(tap.id);
                    setPlayhead(layer.start + tap.time);
                  }}
                  className={`flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[12px] transition-colors ${
                    selectedId === tap.id
                      ? 'bg-[var(--color-ink-800)] text-white'
                      : 'text-[var(--color-ink-300)] hover:bg-[var(--color-ink-900)]'
                  }`}
                >
                  <span className="tabular w-6 text-[var(--color-ink-500)]">{index + 1}</span>
                  <span className="tabular flex-1">{tap.time.toFixed(2)}s</span>
                  <span className="tabular text-[11px] text-[var(--color-ink-500)]">
                    {Math.round(tap.x * 100)}%, {Math.round(tap.y * 100)}%
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded p-1 text-[var(--color-ink-500)] hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTap(tap.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        removeTap(tap.id);
                      }
                    }}
                  >
                    <IconTrash size={12} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="space-y-2 rounded-[6px] bg-[var(--color-ink-900)] p-3">
            <Field label="Time">
              <NumberInput
                value={selected.time}
                min={0}
                max={Math.max(layer.duration, 0.1)}
                step={0.05}
                suffix="s"
                onChange={(time) => {
                  updateTap(selected.id, { time });
                  setPlayhead(layer.start + time);
                }}
              />
            </Field>
            <Field label="Horizontal">
              <Slider
                value={selected.x}
                min={0}
                max={1}
                step={0.01}
                onChange={(x) => updateTap(selected.id, { x })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </Field>
            <Field label="Vertical">
              <Slider
                value={selected.y}
                min={0}
                max={1}
                step={0.01}
                onChange={(y) => updateTap(selected.id, { y })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </Field>
          </div>
        )}
      </div>
    </Dialog>
  );
}
