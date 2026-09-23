/**
 * Beginner guides — how to use MotionDeck without reading a manual.
 *
 * Three surfaces:
 *  1. Help dialog (always available from the top bar)
 *  2. Tip strip under the top bar (dismissible, first sessions)
 *  3. Empty-canvas coach when the scene has no layers yet
 */

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useEditor } from '../state/editorStore';
import { Button, Dialog } from '../ui/primitives';
import { IconHelp, IconRecord, IconSparkle, IconImport, IconText } from '../ui/icons';

const TIP_KEY = 'motiondeck.beginnerTipsDismissed';
const GUIDE_SEEN_KEY = 'motiondeck.beginnerGuideSeen';

export const WORKFLOW_STEPS = [
  {
    id: 'record',
    title: 'Record or import',
    body: 'Open Create on the left. Record your screen, or drop in an existing MP4 / WebM.',
  },
  {
    id: 'arrange',
    title: 'Arrange on the canvas',
    body: 'Click anything to select it. Drag to move. Use the corner handles to resize, and the top handle to rotate.',
  },
  {
    id: 'animate',
    title: 'Animate in one click',
    body: 'With an element selected, press Animate (or A). Pick Fade, Rise, Smooth Zoom — no keyframes needed.',
  },
  {
    id: 'preview',
    title: 'Preview & export',
    body: 'Press Space to play. When it looks right, hit Export in the top right.',
  },
] as const;

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '?', action: 'Open help guide' },
  { keys: 'Space', action: 'Play / pause' },
  { keys: 'V', action: 'Select tool' },
  { keys: 'T', action: 'Add text' },
  { keys: 'R', action: 'Add rectangle' },
  { keys: 'A', action: 'Open Animate library' },
  { keys: 'G', action: 'Group selection' },
  { keys: 'Shift + G', action: 'Ungroup' },
  { keys: 'Delete', action: 'Delete selected' },
  { keys: 'Ctrl + D', action: 'Duplicate' },
  { keys: 'Ctrl + Z', action: 'Undo' },
  { keys: 'Ctrl + Shift + Z', action: 'Redo' },
  { keys: 'Ctrl + S', action: 'Save' },
  { keys: 'Ctrl + E', action: 'Export' },
  { keys: 'S', action: 'Split clip at playhead' },
];

export const HOW_TO: { title: string; steps: string[] }[] = [
  {
    title: 'Crop an Android emulator recording',
    steps: [
      'Import or record your emulator session.',
      'Select the recording, then click Crop App Screen.',
      'Review the Detected App Screen preview — drag edges if the crop needs a tweak.',
      'Apply Crop, then pick a Mobile Showcase template or App Motion preset.',
      'Use Focus / Pick point to zoom into UI, then export.',
    ],
  },
  {
    title: 'Move & resize something',
    steps: [
      'Click the element on the canvas.',
      'Drag inside the blue box to move it — guides appear when you align to centre or edges.',
      'Drag a corner handle to resize. Drag the round handle above to rotate.',
      'Hold Shift while dragging to lock horizontal or vertical movement.',
    ],
  },
  {
    title: 'Add text, shapes, or callouts',
    steps: [
      'Open Elements on the left (or press T / R).',
      'Pick Headline, Arrow, Highlight, Spotlight, and so on.',
      'The new element is selected automatically — edit it in the right inspector.',
    ],
  },
  {
    title: 'Apply a polished animation',
    steps: [
      'Select an element.',
      'Click Animate on the selection bar, in the inspector, or press A.',
      'Browse Suggested, Entrance, Emphasis, Exit, or Premium.',
      'Hover a card to preview, then click to apply. Adjust Duration if you like.',
    ],
  },
  {
    title: 'Focus the camera on a UI button',
    steps: [
      'Select your screen recording.',
      'In the inspector, open Camera and choose Focus or Follow Clicks.',
      'Use Pick point (or Focus on Click) and click the button inside the recording.',
      'MotionDeck adds a smooth zoom toward that spot.',
    ],
  },
  {
    title: 'Use a template',
    steps: [
      'Open Templates on the left.',
      'Pick something like Premium App Demo.',
      'Your recording (if any) drops into the footage slot with motion already applied.',
      'Edit or delete any animation — templates are never locked.',
    ],
  },
];

/* ------------------------------------------------------------------ dialog */

interface GuideDialogProps {
  open: boolean;
  onClose: () => void;
}

export function BeginnerGuideDialog({ open, onClose }: GuideDialogProps) {
  const [tab, setTab] = useState<'flow' | 'howto' | 'keys'>('flow');

  useEffect(() => {
    if (open) localStorage.setItem(GUIDE_SEEN_KEY, '1');
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="How to use MotionDeck"
      description="Record. Arrange. Animate. Done."
      width={560}
      footer={<Button onClick={onClose}>Got it</Button>}
    >
      <div className="mb-4 flex gap-1 rounded-[8px] border border-white/8 bg-white/[0.03] p-0.5">
        {(
          [
            ['flow', 'The flow'],
            ['howto', 'How do I…'],
            ['keys', 'Shortcuts'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              'flex-1 rounded-[6px] py-1.5 text-[12px] font-medium transition-colors',
              tab === id ? 'bg-[var(--color-accent)] text-[#04222b]' : 'text-[var(--color-ink-300)] hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'flow' && (
        <ol className="space-y-3">
          {WORKFLOW_STEPS.map((step, i) => (
            <li key={step.id} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(34,211,238,0.15)] text-[12px] font-semibold text-[var(--color-accent)]">
                {i + 1}
              </span>
              <div>
                <p className="text-[13px] font-semibold text-[var(--color-ink-50)]">{step.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-ink-400)]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {tab === 'howto' && (
        <div className="space-y-4">
          {HOW_TO.map((item) => (
            <div key={item.title}>
              <p className="mb-1.5 text-[12.5px] font-semibold text-[var(--color-ink-100)]">{item.title}</p>
              <ol className="list-decimal space-y-1 pl-4 text-[12px] leading-relaxed text-[var(--color-ink-400)]">
                {item.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {tab === 'keys' && (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SHORTCUTS.map((row) => (
            <li
              key={row.keys}
              className="flex items-center justify-between gap-2 rounded-[7px] bg-white/[0.03] px-2.5 py-1.5"
            >
              <kbd className="rounded-[5px] border border-white/10 bg-[var(--color-ink-900)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-ink-200)]">
                {row.keys}
              </kbd>
              <span className="text-[11.5px] text-[var(--color-ink-400)]">{row.action}</span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/* --------------------------------------------------------------- tip strip */

interface TipStripProps {
  onOpenGuide: () => void;
}

export function BeginnerTipStrip({ onOpenGuide }: TipStripProps) {
  const [visible, setVisible] = useState(false);
  const layerCount = useEditor((s) => s.project.scenes[s.activeSceneIndex]?.layers.length ?? 0);
  const selected = useEditor((s) => s.selectedLayerIds.length);

  useEffect(() => {
    try {
      if (localStorage.getItem(TIP_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const tip =
    layerCount === 0
      ? 'Start on the left: Record Screen or Import a Recording.'
      : selected === 0
        ? 'Click your recording on the canvas, then drag it where you want.'
        : 'Press Animate (or A) to add a polished motion preset.';

  return (
    <div className="hairline-b flex items-center gap-3 bg-[rgba(34,211,238,0.06)] px-3 py-2">
      <IconHelp size={14} className="shrink-0 text-[var(--color-accent)]" />
      <p className="min-w-0 flex-1 text-[12px] text-[var(--color-ink-200)]">
        <span className="font-medium text-[var(--color-ink-50)]">Tip · </span>
        {tip}
      </p>
      <button
        type="button"
        onClick={onOpenGuide}
        className="shrink-0 text-[11.5px] font-medium text-[var(--color-accent)] hover:opacity-80"
      >
        Full guide
      </button>
      <button
        type="button"
        aria-label="Dismiss tips"
        onClick={() => {
          localStorage.setItem(TIP_KEY, '1');
          setVisible(false);
        }}
        className="shrink-0 rounded-[5px] px-1.5 text-[11px] text-[var(--color-ink-400)] hover:bg-white/5 hover:text-white"
      >
        Dismiss
      </button>
    </div>
  );
}

/* ---------------------------------------------------------- empty canvas */

interface EmptyGuideProps {
  onRecord: () => void;
  onImport: () => void;
  onOpenGuide: () => void;
}

export function CanvasEmptyGuide({ onRecord, onImport, onOpenGuide }: EmptyGuideProps) {
  const layerCount = useEditor((s) => s.project.scenes[s.activeSceneIndex]?.layers.length ?? 0);
  if (layerCount > 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="pointer-events-auto w-full max-w-[420px] rounded-[14px] border border-white/10 bg-[var(--color-ink-850)]/95 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-accent)]">
          Getting started
        </p>
        <h3 className="mt-1.5 text-[17px] font-semibold tracking-tight text-[var(--color-ink-50)]">
          Record. Arrange. Animate. Done.
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-400)]">
          This canvas is empty. Add a screen recording, then drag and animate it — no keyframes
          required.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button variant="primary" fullWidth icon={<IconRecord size={15} />} onClick={onRecord}>
            Record screen
          </Button>
          <Button fullWidth icon={<IconImport size={15} />} onClick={onImport}>
            Import video
          </Button>
        </div>

        <ul className="mt-4 space-y-2 border-t border-white/8 pt-3">
          {[
            { icon: IconText, text: 'Press T to add a headline anytime.' },
            { icon: IconSparkle, text: 'Select something → Animate for Fade, Rise, Zoom…' },
            { icon: IconHelp, text: 'Open Help anytime for steps and shortcuts.' },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2 text-[11.5px] text-[var(--color-ink-400)]">
              <Icon size={14} className="mt-0.5 shrink-0 text-[var(--color-ink-500)]" />
              {text}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onOpenGuide}
          className="mt-3 text-[12px] font-medium text-[var(--color-accent)] hover:opacity-80"
        >
          Open the full beginner guide →
        </button>
      </div>
    </div>
  );
}

/** Whether we should auto-open the guide once for brand-new users. */
export function shouldAutoOpenGuide(): boolean {
  try {
    return localStorage.getItem(GUIDE_SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}
