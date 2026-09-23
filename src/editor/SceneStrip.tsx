/** Horizontal scene strip. Scenes play in order; this is the storyboard view. */

import clsx from 'clsx';
import { useEditor } from '../state/editorStore';
import { IconButton } from '../ui/primitives';
import { IconDuplicate, IconPlus, IconTrash } from '../ui/icons';
import type { BackgroundSpec } from '../core/types';

function backgroundCss(spec: BackgroundSpec): string {
  switch (spec.type) {
    case 'solid':
      return spec.color;
    case 'gradient':
      return `linear-gradient(${spec.angle}deg, ${spec.from}, ${spec.to})`;
    case 'mesh':
      return `radial-gradient(at 20% 25%, ${spec.colors[1]}, transparent 55%), radial-gradient(at 75% 70%, ${spec.colors[2]}, transparent 55%), ${spec.colors[0]}`;
    case 'dynamic':
    case 'image':
      return '#14181d';
    default:
      return 'repeating-conic-gradient(#1a1d23 0% 25%, #141619 0% 50%) 0 0/12px 12px';
  }
}

export function SceneStrip() {
  const scenes = useEditor((s) => s.project.scenes);
  const activeIndex = useEditor((s) => s.activeSceneIndex);
  const setActive = useEditor((s) => s.setActiveScene);
  const addScene = useEditor((s) => s.addScene);
  const duplicateScene = useEditor((s) => s.duplicateScene);
  const deleteScene = useEditor((s) => s.deleteScene);
  const moveScene = useEditor((s) => s.moveScene);

  return (
    <div className="hairline-t flex h-[78px] shrink-0 items-center gap-2 overflow-x-auto bg-[var(--color-ink-900)] px-3">
      {scenes.map((scene, index) => (
        <div
          key={scene.id}
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/scene-index', String(index))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData('text/scene-index'));
            if (Number.isInteger(from) && from !== index) moveScene(from, index);
          }}
          className="group relative shrink-0"
        >
          <button
            type="button"
            onClick={() => setActive(index)}
            aria-current={index === activeIndex}
            className={clsx(
              'flex h-[54px] w-[104px] flex-col justify-end overflow-hidden rounded-[8px] border p-1.5 text-left transition-all duration-120',
              index === activeIndex
                ? 'border-[var(--color-accent)] ring-1 ring-[rgba(34,211,238,0.35)]'
                : 'border-[var(--color-ink-700)] hover:border-[var(--color-ink-500)]',
            )}
            style={{ background: backgroundCss(scene.background) }}
          >
            <span className="truncate rounded-[4px] bg-black/55 px-1.5 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-sm">
              {scene.name}
            </span>
          </button>
          <span className="tabular absolute right-1.5 top-1.5 rounded-[3px] bg-black/60 px-1 text-[9.5px] text-white/85">
            {scene.duration.toFixed(1)}s
          </span>
          <div className="pointer-events-none absolute -top-1 left-0 flex gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
            <IconButton label={`Duplicate ${scene.name}`} size="sm" onClick={() => duplicateScene(index)}>
              <IconDuplicate size={12} />
            </IconButton>
            <IconButton label={`Delete ${scene.name}`} size="sm" tone="danger" onClick={() => deleteScene(index)}>
              <IconTrash size={12} />
            </IconButton>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addScene}
        className="flex h-[54px] w-[54px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[8px] border border-dashed border-[var(--color-ink-600)] text-[var(--color-ink-400)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        <IconPlus size={15} />
        <span className="text-[10px]">Scene</span>
      </button>
    </div>
  );
}
