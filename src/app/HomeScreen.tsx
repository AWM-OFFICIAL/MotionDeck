/** Project home — brand-led studio lobby, not a card dashboard. */

import { useRef, useState } from 'react';
import clsx from 'clsx';
import type { Project, ProjectSummary } from '../core/types';
import {
  deleteProject,
  listProjects,
  loadProject,
  renameProject,
  saveProject,
} from '../platform/projectStore';
import { createProject } from '../core/defaults';
import { uid } from '../core/ids';
import { Button, Dialog, IconButton, TextInput, Tooltip } from '../ui/primitives';
import { IconDuplicate, IconImport, IconPlus, IconRecord, IconTemplates, IconTrash } from '../ui/icons';
import { Atmosphere } from '../ui/Atmosphere';

interface Props {
  onOpen: (project: Project, next?: 'record' | 'import') => void;
  onQuickStart: () => void;
  onBrowseTemplates: () => void;
}

export function HomeScreen({ onOpen, onQuickStart, onBrowseTemplates }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>(() => listProjects());
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ProjectSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => setProjects(listProjects());

  const open = async (summary: ProjectSummary, next?: 'record' | 'import') => {
    setBusy(true);
    const project = await loadProject(summary.id);
    setBusy(false);
    if (project) onOpen(project, next);
  };

  const duplicate = async (summary: ProjectSummary) => {
    const project = await loadProject(summary.id);
    if (!project) return;
    const copy: Project = {
      ...structuredClone(project),
      id: uid('pr'),
      name: `${project.name} copy`,
      isSample: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveProject(copy, summary.thumbnail);
    refresh();
  };

  return (
    <Atmosphere>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.04] bg-[rgba(8,9,11,0.55)] px-7 backdrop-blur-xl lg:px-10">
        <div className="flex items-center gap-3">
          <img src="/logo-mark.png" alt="" className="h-9 w-auto object-contain drop-shadow-[0_0_18px_rgba(34,211,238,0.35)]" />
          <span className="font-display text-[17px] font-semibold tracking-[-0.03em] text-[var(--color-ink-50)]">
            Motion<span className="text-[var(--color-accent)]">Deck</span>
          </span>
        </div>
        <p className="hidden text-[11.5px] tracking-wide text-[var(--color-ink-400)] sm:block">
          Local studio · nothing leaves this machine
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1120px] px-7 pb-16 pt-6 lg:px-10 lg:pt-10">
          {/* One composition: brand + line + primary CTA + studio preview */}
          <section className="animate-rise grid items-center gap-10 md:grid-cols-[minmax(0,1.05fr)_minmax(240px,0.9fr)] md:gap-8 lg:gap-12">
            <div className="max-w-[640px]">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                Motion graphics studio
              </p>
              <h1 className="font-display text-[clamp(2.1rem,4.2vw,3.35rem)] font-semibold leading-[1.05] tracking-[-0.045em] text-[var(--color-ink-50)]">
                Screen recordings that look
                <span className="block bg-gradient-to-r from-[var(--color-ink-50)] via-white to-[var(--color-accent)] bg-clip-text text-transparent">
                  designed, not captured.
                </span>
              </h1>
              <p className="mt-4 max-w-[34rem] text-[15px] leading-relaxed text-[var(--color-ink-300)]">
                Record your app, pick a look, add motion — export a polished demo in minutes.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpen(createProject('Untitled Project'), 'record')}
                  className="md-cta group inline-flex h-12 items-center gap-2.5 rounded-[12px] bg-[var(--color-accent)] px-6 text-[14px] font-semibold tracking-tight text-[#04222b] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.99]"
                >
                  <IconRecord size={17} />
                  Record Screen
                </button>
                <button
                  type="button"
                  onClick={onBrowseTemplates}
                  className="inline-flex h-12 items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.04] px-5 text-[13.5px] font-medium text-[var(--color-ink-100)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/[0.07]"
                >
                  <IconTemplates size={15} />
                  Templates
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(createProject('Untitled Project'), 'import')}
                  className="inline-flex h-12 items-center gap-2 rounded-[12px] px-4 text-[13.5px] font-medium text-[var(--color-ink-300)] transition-colors hover:text-white"
                >
                  <IconImport size={15} />
                  Import
                </button>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
                <button
                  type="button"
                  onClick={onQuickStart}
                  className="text-[var(--color-accent)] transition-opacity hover:opacity-80"
                >
                  Quick Edit — five questions
                </button>
                <span className="text-[var(--color-ink-600)]">·</span>
                <button
                  type="button"
                  onClick={() => onOpen(createProject('Untitled Project'))}
                  className="inline-flex items-center gap-1.5 text-[var(--color-ink-400)] transition-colors hover:text-[var(--color-ink-100)]"
                >
                  <IconPlus size={13} />
                  Blank project
                </button>
              </div>
            </div>

            <StudioPreview />
          </section>

          <section className="mt-14 lg:mt-16">
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 className="font-display text-[13px] font-semibold tracking-[0.04em] text-[var(--color-ink-200)]">
                Recent
              </h2>
              {projects.length > 0 && (
                <p className="text-[11.5px] text-[var(--color-ink-500)]">
                  {projects.length} project{projects.length === 1 ? '' : 's'} on this computer
                </p>
              )}
            </div>

            {projects.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
                <p className="font-display text-[16px] font-medium tracking-tight text-[var(--color-ink-100)]">
                  Your projects will appear here.
                </p>
                <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--color-ink-400)]">
                  Everything stays local. Record once, then shape it into something worth sharing.
                </p>
                <Button
                  variant="primary"
                  className="mt-5"
                  onClick={() => onOpen(createProject('Untitled Project'), 'record')}
                >
                  Record your first clip
                </Button>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project, i) => (
                  <li
                    key={project.id}
                    className="group animate-rise"
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void open(project)}
                      className="relative block w-full overflow-hidden rounded-[14px] border border-white/[0.07] bg-[rgba(16,18,22,0.75)] text-left shadow-[0_20px_50px_rgba(0,0,0,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(34,211,238,0.35)] hover:shadow-[0_24px_60px_rgba(0,0,0,0.45),0_0_0_1px_rgba(34,211,238,0.12)] disabled:opacity-60"
                    >
                      <span
                        className={clsx(
                          'relative block aspect-[16/10] overflow-hidden',
                          !project.thumbnail && 'md-project-empty',
                        )}
                        style={
                          project.thumbnail
                            ? {
                                backgroundImage: `url(${project.thumbnail})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                              }
                            : undefined
                        }
                      >
                        {!project.thumbnail && <ProjectPlaceholder />}
                        <span className="absolute inset-0 bg-gradient-to-t from-[rgba(8,9,11,0.95)] via-[rgba(8,9,11,0.15)] to-transparent" />
                        {project.isSample && (
                          <span className="absolute left-3 top-3 rounded-full border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.12)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--color-warn)] backdrop-blur-sm">
                            DEMO
                          </span>
                        )}
                      </span>
                      <span className="relative block px-4 pb-3.5 pt-2">
                        <span className="block truncate font-display text-[14px] font-semibold tracking-tight text-[var(--color-ink-50)]">
                          {project.name}
                        </span>
                        <span className="tabular mt-0.5 block text-[11.5px] text-[var(--color-ink-400)]">
                          {formatRelative(project.updatedAt)} · {project.duration.toFixed(1)}s
                        </span>
                      </span>
                    </button>

                    <div className="mt-1.5 flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                      <IconButton label="Duplicate" size="sm" onClick={() => void duplicate(project)}>
                        <IconDuplicate size={13} />
                      </IconButton>
                      <Tooltip content="Rename">
                        <button
                          type="button"
                          onClick={() => {
                            setRenaming(project);
                            setRenameValue(project.name);
                          }}
                          className="rounded-[6px] px-2 text-[11px] text-[var(--color-ink-400)] transition-colors hover:bg-white/5 hover:text-white"
                        >
                          Rename
                        </button>
                      </Tooltip>
                      <div className="flex-1" />
                      <IconButton label="Delete" size="sm" tone="danger" onClick={() => setConfirmDelete(project)}>
                        <IconTrash size={13} />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <input ref={fileRef} type="file" hidden accept="video/*" />

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename project"
        width={420}
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (renaming && renameValue.trim()) {
                  await renameProject(renaming.id, renameValue.trim());
                  refresh();
                }
                setRenaming(null);
              }}
            >
              Rename
            </Button>
          </>
        }
      >
        <TextInput value={renameValue} autoFocus onChange={(e) => setRenameValue(e.target.value)} />
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name}"?`}
        description="This removes the project from this computer. It cannot be undone."
        width={430}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmDelete) await deleteProject(confirmDelete.id);
                setConfirmDelete(null);
                refresh();
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-300)]">
          Your recordings stay in the media library and can be reused in other projects.
        </p>
      </Dialog>
    </Atmosphere>
  );
}

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Decorative product stage — shows what MotionDeck makes without a real thumbnail. */
function StudioPreview() {
  return (
    <div className="relative mx-auto hidden w-full max-w-[420px] md:block" aria-hidden>
      <div className="absolute -inset-6 rounded-[28px] bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,0.18),transparent_65%)] blur-xl" />
      <div className="md-float relative aspect-[4/3] overflow-hidden rounded-[20px] border border-white/10 bg-[#0e1116] shadow-[0_40px_80px_rgba(0,0,0,0.55)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(34,211,238,0.14),transparent_50%),linear-gradient(160deg,#12161d,#080a0d)]" />
        {/* Floating app window */}
        <div className="absolute left-[12%] top-[16%] right-[12%] bottom-[22%] overflow-hidden rounded-[12px] border border-white/12 bg-[#161a22] shadow-[0_24px_48px_rgba(0,0,0,0.5)]">
          <div className="flex h-7 items-center gap-1.5 border-b border-white/8 bg-[#1a1f28] px-3">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff5f57]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#febc2e]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 h-1.5 flex-1 rounded-full bg-white/8" />
          </div>
          <div className="space-y-2.5 p-3.5">
            <div className="h-2 w-1/3 rounded-full bg-[var(--color-accent)]/70" />
            <div className="h-2 w-2/3 rounded-full bg-white/12" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="aspect-[4/3] rounded-md bg-white/6" />
              <div className="aspect-[4/3] rounded-md bg-[var(--color-accent)]/15" />
              <div className="aspect-[4/3] rounded-md bg-white/6" />
            </div>
            <div className="mt-2 h-8 rounded-md bg-white/[0.04]" />
          </div>
        </div>
        {/* Cursor pip */}
        <span className="md-cursor absolute left-[58%] top-[52%] h-3 w-3 rounded-full bg-white shadow-[0_0_0_4px_rgba(34,211,238,0.35)]" />
        <span className="absolute bottom-4 left-4 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-medium tracking-wide text-white/70 backdrop-blur-md">
          Auto camera · Smooth cursor
        </span>
      </div>
    </div>
  );
}

function ProjectPlaceholder() {
  return (
    <span className="absolute inset-0 flex items-center justify-center">
      <span className="h-[58%] w-[72%] overflow-hidden rounded-[10px] border border-white/10 bg-[#151920] shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
        <span className="flex h-5 items-center gap-1 border-b border-white/8 bg-[#1a1f28] px-2">
          <span className="h-1 w-1 rounded-full bg-white/25" />
          <span className="h-1 w-1 rounded-full bg-white/25" />
          <span className="h-1 w-1 rounded-full bg-white/25" />
        </span>
        <span className="block space-y-1.5 p-2.5">
          <span className="block h-1.5 w-1/4 rounded-full bg-[var(--color-accent)]/50" />
          <span className="block h-1.5 w-1/2 rounded-full bg-white/10" />
          <span className="mt-2 grid grid-cols-3 gap-1.5">
            <span className="aspect-video rounded bg-white/5" />
            <span className="aspect-video rounded bg-white/8" />
            <span className="aspect-video rounded bg-white/5" />
          </span>
        </span>
      </span>
    </span>
  );
}
