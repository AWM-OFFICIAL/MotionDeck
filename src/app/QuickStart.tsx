/**
 * Quick Mode wizard — the easiest path through MotionDeck.
 *
 * Five short questions, then a finished composition. Every answer maps onto real
 * template/composition data; nothing here is decorative.
 */

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { Project, TemplateCategory, TemplateDefinition } from '../core/types';
import { createProject } from '../core/defaults';
import { TEMPLATES, applyTemplate } from '../library/templates';
import { BACKGROUND_PRESETS } from '../render/background';
import { Button, Dialog, Field, TextInput } from '../ui/primitives';
import { IconChevron } from '../ui/icons';

export type QuickGoal = 'appDemo' | 'social' | 'launch' | 'tutorial' | 'feature';

const GOALS: { id: QuickGoal; label: string; blurb: string; category: TemplateCategory }[] = [
  { id: 'appDemo', label: 'App Demo', blurb: 'Show your product in action.', category: 'appDemo' },
  { id: 'social', label: 'Social Media', blurb: 'Vertical, fast, feed-ready.', category: 'social' },
  { id: 'launch', label: 'Product Launch', blurb: 'Brand, product, feature, CTA.', category: 'showcase' },
  { id: 'tutorial', label: 'Tutorial', blurb: 'Walk someone through a flow.', category: 'appDemo' },
  { id: 'feature', label: 'Feature Showcase', blurb: 'Spotlight one thing.', category: 'showcase' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with a ready-to-edit project. */
  onCreate: (project: Project, next: 'record' | 'import' | 'editor') => void;
}

export function QuickStart({ open, onClose, onCreate }: Props) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<QuickGoal>('appDemo');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [source, setSource] = useState<'record' | 'import' | 'later'>('record');

  const goalConfig = GOALS.find((g) => g.id === goal)!;
  const candidates = useMemo(
    () => TEMPLATES.filter((t) => t.category === goalConfig.category).slice(0, 6),
    [goalConfig.category],
  );

  const template: TemplateDefinition | null =
    TEMPLATES.find((t) => t.id === templateId) ?? candidates[0] ?? null;

  const reset = () => {
    setStep(0);
    setTemplateId(null);
    setTitle('');
    setBackgroundId(null);
  };

  const create = () => {
    if (!template) return;
    const base = createProject(title.trim() || `${goalConfig.label} video`, template.canvas);

    const values: Record<string, string> = {};
    if (title.trim()) {
      for (const slot of template.textSlots) {
        // Fill the first text slot with the user's title; leave the rest as designed.
        if (slot.key === 'title' || slot.key === 'brand' || template.textSlots.length === 1) {
          values[slot.key] = title.trim();
          break;
        }
      }
    }

    const result = applyTemplate(template, { scenes: base.scenes, canvas: base.canvas }, values);
    const background = BACKGROUND_PRESETS.find((b) => b.id === backgroundId);

    const project: Project = {
      ...base,
      canvas: result.canvas,
      fps: template.fps,
      templateId: template.id,
      scenes: background
        ? result.scenes.map((scene) => ({ ...scene, background: background.spec }))
        : result.scenes,
      exportSettings: {
        ...base.exportSettings,
        width: result.canvas.width,
        height: result.canvas.height,
      },
    };

    onCreate(project, source === 'later' ? 'editor' : source);
    reset();
  };

  const steps = ['What are you making?', 'Choose a template', 'Add a title', 'Choose a background', 'Add your footage'];

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Quick Edit"
      description={`Step ${step + 1} of ${steps.length} · ${steps[step]}`}
      width={640}
      footer={
        <>
          <Button onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < steps.length - 1 ? (
            <Button variant="primary" icon={<IconChevron size={14} />} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={create}>
              Create Video
            </Button>
          )}
        </>
      }
    >
      <div className="mb-5 flex gap-1">
        {steps.map((_, i) => (
          <span
            key={i}
            className={clsx(
              'h-1 flex-1 rounded-full transition-colors',
              i <= step ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-ink-700)]',
            )}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="grid grid-cols-2 gap-2">
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setGoal(g.id);
                setTemplateId(null);
              }}
              className={clsx(
                'rounded-[10px] border px-3.5 py-3 text-left transition-colors',
                goal === g.id
                  ? 'border-[var(--color-accent)] bg-[rgba(34,211,238,0.08)]'
                  : 'border-[var(--color-ink-700)] hover:border-[var(--color-ink-500)]',
              )}
            >
              <span
                className={clsx(
                  'block text-[13px] font-semibold',
                  goal === g.id ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-50)]',
                )}
              >
                {g.label}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-[var(--color-ink-400)]">{g.blurb}</span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-3 gap-2">
          {candidates.map((t) => {
            const active = (templateId ?? candidates[0]?.id) === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={clsx(
                  'overflow-hidden rounded-[9px] border text-left transition-colors',
                  active ? 'border-[var(--color-accent)]' : 'border-[var(--color-ink-700)] hover:border-[var(--color-ink-500)]',
                )}
              >
                <span
                  className="block"
                  style={{
                    aspectRatio: String(t.canvas.width / t.canvas.height),
                    background:
                      t.background.type === 'gradient'
                        ? `linear-gradient(${t.background.angle}deg, ${t.background.from}, ${t.background.to})`
                        : t.background.type === 'solid'
                          ? t.background.color
                          : '#12151a',
                  }}
                />
                <span className="block px-2 py-1.5">
                  <span className="block text-[12px] font-medium text-[var(--color-ink-50)]">{t.name}</span>
                  <span className="block text-[10.5px] text-[var(--color-ink-500)]">
                    {t.aspectLabel} · {t.duration}s
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <div className="py-2">
          <Field label="Title" hint="This becomes the headline in your video. You can change it later.">
            <TextInput
              value={title}
              autoFocus
              placeholder={template?.textSlots[0]?.placeholder ?? 'Introducing our new app'}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="grid grid-cols-5 gap-2">
          {BACKGROUND_PRESETS.filter((b) => b.id !== 'transparent').map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setBackgroundId(backgroundId === preset.id ? null : preset.id)}
              className={clsx(
                'overflow-hidden rounded-[9px] border transition-transform hover:scale-[1.03]',
                backgroundId === preset.id ? 'border-[var(--color-accent)]' : 'border-[var(--color-ink-700)]',
              )}
            >
              <span
                className="block h-14"
                style={{
                  background:
                    preset.spec.type === 'solid'
                      ? preset.spec.color
                      : preset.spec.type === 'gradient'
                        ? `linear-gradient(${preset.spec.angle}deg, ${preset.spec.from}, ${preset.spec.to})`
                        : preset.spec.type === 'mesh'
                          ? `radial-gradient(at 25% 25%, ${preset.spec.colors[1]}, transparent 60%), radial-gradient(at 75% 70%, ${preset.spec.colors[2]}, transparent 60%), ${preset.spec.colors[0]}`
                          : 'linear-gradient(135deg,#2a3340,#0d1116)',
                }}
              />
              <span className="block px-1 py-1 text-center text-[10.5px] text-[var(--color-ink-300)]">
                {preset.label}
              </span>
            </button>
          ))}
          <p className="col-span-5 mt-1 text-[11.5px] text-[var(--color-ink-500)]">
            Leave this unselected to keep the template's own background.
          </p>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2">
          {(
            [
              { id: 'record', label: 'Record my screen now', blurb: 'Opens the recorder as soon as the project is ready.' },
              { id: 'import', label: 'Import a recording', blurb: 'Pick an existing video file.' },
              { id: 'later', label: 'Add footage later', blurb: 'Go straight to the editor.' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSource(option.id)}
              className={clsx(
                'block w-full rounded-[10px] border px-3.5 py-3 text-left transition-colors',
                source === option.id
                  ? 'border-[var(--color-accent)] bg-[rgba(34,211,238,0.08)]'
                  : 'border-[var(--color-ink-700)] hover:border-[var(--color-ink-500)]',
              )}
            >
              <span
                className={clsx(
                  'block text-[13px] font-medium',
                  source === option.id ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-50)]',
                )}
              >
                {option.label}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-[var(--color-ink-400)]">{option.blurb}</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
