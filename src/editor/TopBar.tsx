import clsx from 'clsx';
import { useEditor } from '../state/editorStore';
import { Button, IconButton, Segmented, Spinner, Tooltip } from '../ui/primitives';
import { IconBack, IconExport, IconHelp, IconPlay, IconRedo, IconUndo } from '../ui/icons';

interface Props {
  onExit: () => void;
  onExport: () => void;
  onPreview: () => void;
  onHelp: () => void;
}

export function TopBar({ onExit, onExport, onPreview, onHelp }: Props) {
  const name = useEditor((s) => s.project.name);
  const renameProject = useEditor((s) => s.renameProject);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const historyVersion = useEditor((s) => s.historyVersion);
  const saveState = useEditor((s) => s.saveState);
  const mode = useEditor((s) => s.mode);
  const setMode = useEditor((s) => s.setMode);
  const isSample = useEditor((s) => s.project.isSample);

  // `canUndo` reads the history object, which is outside the store's reactive graph;
  // `historyVersion` is what tells React the buttons need re-evaluating.
  void historyVersion;
  const canUndo = useEditor.getState().canUndo();
  const canRedo = useEditor.getState().canRedo();

  return (
    <header className="hairline-b flex h-12 shrink-0 items-center gap-3 bg-[var(--color-ink-850)] px-3">
      <Tooltip content="Back to projects">
        <button
          type="button"
          aria-label="Back to projects"
          onClick={onExit}
          className="flex h-8 items-center gap-2 rounded-[8px] pl-1 pr-2.5 transition-colors hover:bg-[var(--color-ink-750)]"
        >
          <IconBack size={15} className="text-[var(--color-ink-400)]" />
          <img src="/logo-mark.png" alt="" className="h-7 w-auto object-contain" />
          <span className="text-[13px] font-semibold tracking-tight text-[var(--color-ink-50)]">
            MotionDeck
          </span>
        </button>
      </Tooltip>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <input
          value={name}
          onChange={(e) => renameProject(e.target.value)}
          aria-label="Project name"
          className="max-w-[320px] truncate rounded-[7px] border border-transparent bg-transparent px-2.5 py-1 text-center text-[13px] font-medium text-[var(--color-ink-100)] transition-colors hover:border-[var(--color-ink-700)] focus:border-[var(--color-accent)] focus:bg-[var(--color-ink-900)] focus:outline-none"
        />
        {isSample && (
          <span className="shrink-0 rounded-full bg-[rgba(251,191,36,0.12)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-warn)]">
            DEMO
          </span>
        )}
        <SaveIndicator state={saveState} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="w-[176px]">
          <Segmented
            size="sm"
            value={mode}
            options={[
              { id: 'quick', label: 'Quick' },
              { id: 'advanced', label: 'Advanced' },
            ]}
            onChange={setMode}
          />
        </div>

        <div className="mx-1 h-5 w-px bg-[var(--color-ink-700)]" />

        <IconButton label="Help — how to use MotionDeck" onClick={onHelp}>
          <IconHelp size={15} />
        </IconButton>

        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <IconUndo size={15} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <IconRedo size={15} />
        </IconButton>

        <Button size="sm" icon={<IconPlay size={13} />} onClick={onPreview}>
          Preview
        </Button>
        <Button size="sm" variant="primary" icon={<IconExport size={14} />} onClick={onExport}>
          Export
        </Button>
      </div>
    </header>
  );
}

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  const label = {
    idle: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'Saved',
    error: "Couldn't save",
  }[state];

  return (
    <span
      className={clsx(
        'flex shrink-0 items-center gap-1.5 text-[11.5px]',
        state === 'error' ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink-500)]',
      )}
    >
      {state === 'saving' ? (
        <Spinner size={10} />
      ) : (
        <span
          className={clsx(
            'h-1.5 w-1.5 rounded-full',
            state === 'saved'
              ? 'bg-[var(--color-ok)]'
              : state === 'error'
                ? 'bg-[var(--color-danger)]'
                : 'bg-[var(--color-ink-500)]',
          )}
        />
      )}
      {label}
    </span>
  );
}
