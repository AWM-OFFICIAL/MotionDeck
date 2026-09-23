/**
 * Animate library — visual preset picker for beginners.
 * Hover previews a lightweight CSS animation; Apply writes a real MotionSpec.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { Layer, MotionSpec, MovementFeel } from '../core/types';
import {
  DURATION_PRESETS,
  FEEL_OPTIONS,
  LIBRARY_CATEGORIES,
  MOTION_PRESETS,
  applyMotionPreset,
  loadFavoriteMotions,
  loadRecentMotions,
  pushRecentMotion,
  suggestMotion,
  toggleFavoriteMotion,
  type MotionLibraryCategory,
  type MotionPreset,
} from '../library/motionPresets';
import { useEditor } from '../state/editorStore';
import { Button, Dialog, Segmented } from '../ui/primitives';

interface Props {
  open: boolean;
  layer: Layer | null;
  onClose: () => void;
}

export function AnimateDialog({ open, layer, onClose }: Props) {
  const updateLayer = useEditor((s) => s.updateLayer);
  const showToast = useEditor((s) => s.showToast);
  const [category, setCategory] = useState<MotionLibraryCategory | 'suggest' | 'favorites' | 'recent'>('suggest');
  const [duration, setDuration] = useState(0.6);
  const [feel, setFeel] = useState<MovementFeel>('smooth');
  const [favorites, setFavorites] = useState<string[]>(() => loadFavoriteMotions());
  const [recent, setRecent] = useState<string[]>(() => loadRecentMotions());
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFavorites(loadFavoriteMotions());
      setRecent(loadRecentMotions());
      setCategory('suggest');
    }
  }, [open]);

  const suggested = useMemo(() => (layer ? suggestMotion(layer) : []), [layer]);

  const presets = useMemo(() => {
    if (!layer) return [];
    if (category === 'suggest') return suggested;
    if (category === 'favorites')
      return favorites.map((id) => MOTION_PRESETS.find((p) => p.id === id)!).filter(Boolean);
    if (category === 'recent')
      return recent.map((id) => MOTION_PRESETS.find((p) => p.id === id)!).filter(Boolean);
    return MOTION_PRESETS.filter((p) => p.category === category && p.id !== 'none');
  }, [category, favorites, recent, suggested, layer]);

  const apply = (preset: MotionPreset) => {
    if (!layer) return;
    const motion: MotionSpec = applyMotionPreset(
      { ...layer.motion, feel },
      preset,
      duration,
    );
    updateLayer(layer.id, { motion }, `Animate · ${preset.label}`);
    setRecent(pushRecentMotion(preset.id));
    showToast(`Applied ${preset.label}.`, 'success');
    onClose();
  };

  return (
    <Dialog
      open={open && layer !== null}
      onClose={onClose}
      title="Animate"
      description={layer ? `Choose a motion for “${layer.name}”.` : undefined}
      width={640}
      footer={
        <Button onClick={onClose}>Close</Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <TabChip active={category === 'suggest'} onClick={() => setCategory('suggest')}>
            Suggested
          </TabChip>
          {LIBRARY_CATEGORIES.map((c) => (
            <TabChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              {c.label}
            </TabChip>
          ))}
          <TabChip active={category === 'favorites'} onClick={() => setCategory('favorites')}>
            Favorites
          </TabChip>
          <TabChip active={category === 'recent'} onClick={() => setCategory('recent')}>
            Recent
          </TabChip>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-motiondeck-preset', preset.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onMouseEnter={() => setHoverId(preset.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => apply(preset)}
              className="group overflow-hidden rounded-[12px] border border-white/10 bg-white/[0.03] text-left transition-all hover:border-[rgba(34,211,238,0.45)] hover:bg-white/[0.05]"
            >
              <div className="relative flex h-[72px] items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,0.12),transparent_65%),#0e1116]">
                <PreviewPip kind={preset.preview} active={hoverId === preset.id} />
                <button
                  type="button"
                  aria-label={favorites.includes(preset.id) ? 'Unfavorite' : 'Favorite'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFavorites(toggleFavoriteMotion(preset.id));
                  }}
                  className="absolute right-1.5 top-1.5 rounded-[5px] px-1.5 text-[12px] text-[var(--color-ink-400)] hover:text-[var(--color-warn)]"
                >
                  {favorites.includes(preset.id) ? '★' : '☆'}
                </button>
              </div>
              <div className="px-2.5 py-2">
                <p className="text-[12.5px] font-semibold text-[var(--color-ink-50)]">{preset.label}</p>
                <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-relaxed text-[var(--color-ink-400)]">
                  {preset.description}
                </p>
              </div>
            </button>
          ))}
          {presets.length === 0 && (
            <p className="col-span-full py-6 text-center text-[12.5px] text-[var(--color-ink-400)]">
              Nothing here yet — apply a few presets to fill Recent and Favorites.
            </p>
          )}
        </div>

        <div className="grid gap-3 border-t border-white/8 pt-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-500)]">
              Duration
            </p>
            <div className="flex flex-wrap gap-1">
              {DURATION_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={clsx(
                    'rounded-[6px] px-2 py-1 text-[11.5px] tabular',
                    duration === d
                      ? 'bg-[var(--color-accent)] font-semibold text-[#04222b]'
                      : 'bg-white/5 text-[var(--color-ink-300)] hover:bg-white/10',
                  )}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-500)]">
              Easing
            </p>
            <Segmented
              value={feel}
              options={FEEL_OPTIONS.map((f) => ({ id: f.id, label: f.label }))}
              onChange={(id) => setFeel(id as MovementFeel)}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function TabChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors',
        active
          ? 'bg-[var(--color-accent)] text-[#04222b]'
          : 'bg-white/5 text-[var(--color-ink-300)] hover:bg-white/10 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

function PreviewPip({
  kind,
  active,
}: {
  kind: MotionPreset['preview'];
  active: boolean;
}) {
  return (
    <span
      className={clsx(
        'block h-8 w-8 rounded-[8px] bg-[var(--color-accent)]/90 shadow-[0_0_20px_rgba(34,211,238,0.35)]',
        active && `md-preview-${kind}`,
      )}
    />
  );
}
