/**
 * Left sidebar: Create, Templates, Elements, Project.
 *
 * Four destinations, never more. Everything else lives in the inspector so the
 * navigation stays learnable.
 */

import clsx from 'clsx';
import { useCallback, useRef, useState } from 'react';
import { useEditor, type SidebarSection } from '../state/editorStore';
import { placeVideoAsset } from './placeFootage';
import {
  createAudioLayer,
  createCalloutLayer,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
} from '../core/defaults';
import { importMedia, kindForFile, formatBytes, guessMime } from '../platform/mediaImport';
import { TEMPLATES, TEMPLATE_CATEGORIES, applyTemplate, getTemplate } from '../library/templates';
import type { CalloutLayer, MediaAsset, ShapeLayer, TemplateDefinition } from '../core/types';
import { Button, EmptyState, IconButton, PanelSection, TextInput, Tooltip } from '../ui/primitives';
import {
  IconArrow,
  IconAudio,
  IconCallout,
  IconCursor,
  IconDevice,
  IconElements,
  IconImport,
  IconMedia,
  IconProject,
  IconRecord,
  IconScenes,
  IconShape,
  IconTemplates,
  IconText,
  IconTrash,
} from '../ui/icons';

const NAV: { id: SidebarSection; label: string; icon: typeof IconRecord }[] = [
  { id: 'create', label: 'Create', icon: IconRecord },
  { id: 'templates', label: 'Templates', icon: IconTemplates },
  { id: 'elements', label: 'Elements', icon: IconElements },
  { id: 'project', label: 'Project', icon: IconProject },
];

interface Props {
  onRecord: () => void;
}

export function Sidebar({ onRecord }: Props) {
  const section = useEditor((s) => s.sidebarSection);
  const setSection = useEditor((s) => s.setSidebarSection);

  return (
    <div className="flex shrink-0">
      <nav
        aria-label="Sections"
        className="hairline-r flex w-[62px] shrink-0 flex-col items-center gap-1 bg-[var(--color-ink-900)] py-2.5"
      >
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={section === id ? true : undefined}
            onClick={() => setSection(id)}
            className={clsx(
              'flex h-[52px] w-[52px] flex-col items-center justify-center gap-1 rounded-[9px] transition-colors duration-100',
              section === id
                ? 'bg-[var(--color-ink-750)] text-[var(--color-accent)]'
                : 'text-[var(--color-ink-400)] hover:bg-[var(--color-ink-850)] hover:text-[var(--color-ink-100)]',
            )}
          >
            <Icon size={18} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>

      <div className="hairline-r flex w-[248px] shrink-0 flex-col overflow-hidden bg-[var(--color-ink-850)]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {section === 'create' && <CreatePanel onRecord={onRecord} />}
          {section === 'templates' && <TemplatesPanel />}
          {section === 'elements' && <ElementsPanel />}
          {section === 'project' && <ProjectPanel />}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- create */

export function useMediaImport() {
  const addAssets = useEditor((s) => s.addAssets);
  const addLayer = useEditor((s) => s.addLayer);
  const showToast = useEditor((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setBusy(true);
      const imported: MediaAsset[] = [];

      for (const file of list) {
        const kind = kindForFile(file);
        if (!kind) {
          showToast(`${file.name} is not a video, image or audio file.`, 'error');
          continue;
        }
        try {
          const asset = await importMedia(file, {
            name: file.name,
            mimeType: file.type || guessMime(file.name),
            // recording metadata is seeded inside importMedia for video files
          });
          imported.push(asset);
        } catch (err) {
          console.error('[MotionDeck] import failed', err);
          const { formatImportError } = await import('../platform/normalizeMedia');
          showToast(formatImportError(err, file.name), 'error');
        }
      }

      if (imported.length > 0) {
        addAssets(imported);
        for (const asset of imported) {
          if (asset.kind === 'video') {
            placeVideoAsset(asset);
          } else if (asset.kind === 'image') {
            addLayer(createImageLayer(asset.id, asset.name), 'Add image');
          } else {
            addLayer(createAudioLayer(asset.id, asset.duration || 5, asset.name), 'Add audio');
          }
        }
        showToast(`Imported ${imported.length} file${imported.length === 1 ? '' : 's'}.`, 'success');
      }
      setBusy(false);
    },
    [addAssets, addLayer, showToast],
  );

  return { importFiles, busy };
}

function CreatePanel({ onRecord }: { onRecord: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { importFiles, busy } = useMediaImport();
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <PanelSection title="Create">
        <div className="space-y-2">
          <Button variant="primary" fullWidth size="lg" icon={<IconRecord size={16} />} onClick={onRecord}>
            Record Screen
          </Button>
          <Button fullWidth icon={<IconImport size={15} />} onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? 'Importing…' : 'Import a Recording'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*,image/*,audio/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void importFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </PanelSection>

      <div className="px-3.5 pb-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void importFiles(e.dataTransfer.files);
          }}
          className={clsx(
            'rounded-[10px] border border-dashed px-4 py-7 text-center transition-colors',
            dragging
              ? 'border-[var(--color-accent)] bg-[rgba(34,211,238,0.06)]'
              : 'border-[var(--color-ink-600)]',
          )}
        >
          <IconImport size={22} className="mx-auto mb-2 text-[var(--color-ink-500)]" />
          <p className="text-[12px] leading-relaxed text-[var(--color-ink-300)]">
            Drop a recording here
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--color-ink-500)]">MP4, WebM, MOV, PNG, MP3</p>
        </div>
      </div>

      <PanelSection title="How it works">
        <ol className="mb-3 space-y-2.5 text-[11.5px] leading-relaxed text-[var(--color-ink-400)]">
          <li>
            <span className="font-medium text-[var(--color-ink-200)]">1. Record</span> — capture your
            screen or import a video.
          </li>
          <li>
            <span className="font-medium text-[var(--color-ink-200)]">2. Arrange</span> — drag on the
            canvas; resize with corner handles.
          </li>
          <li>
            <span className="font-medium text-[var(--color-ink-200)]">3. Animate</span> — select
            something and press <kbd className="rounded bg-white/10 px-1">A</kbd> for presets.
          </li>
          <li>
            <span className="font-medium text-[var(--color-ink-200)]">4. Export</span> — preview with
            Space, then Export.
          </li>
        </ol>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('motiondeck:open-guide'))}
          className="text-[11.5px] font-medium text-[var(--color-accent)] hover:opacity-80"
        >
          Open full guide →
        </button>
      </PanelSection>
    </div>
  );
}

/* ------------------------------------------------------------ templates */

function TemplatesPanel() {
  const project = useEditor((s) => s.project);
  const replaceProject = useEditor((s) => s.replaceProject);
  const showToast = useEditor((s) => s.showToast);
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);

  const apply = (template: TemplateDefinition) => {
    const result = applyTemplate(template, { scenes: project.scenes, canvas: project.canvas });
    replaceProject(`Apply ${template.name}`, {
      ...project,
      canvas: result.canvas,
      scenes: result.scenes,
      fps: template.fps,
      templateId: template.id,
      isSample: false,
      exportSettings: { ...project.exportSettings, width: result.canvas.width, height: result.canvas.height },
    });
    const hadFootage = project.scenes.some((s) => s.layers.some((l) => l.type === 'video'));
    showToast(
      hadFootage
        ? `Applied ${template.name} to your recording.`
        : `${template.name} is ready — record or import to fill it.`,
      'success',
    );
  };

  const filtered = query.trim()
    ? TEMPLATES.filter((t) =>
        `${t.name} ${t.description} ${t.aspectLabel}`.toLowerCase().includes(query.toLowerCase()),
      )
    : null;

  return (
    <div>
      <div className="hairline-b px-3.5 py-3">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates"
          aria-label="Search templates"
        />
      </div>

      {filtered ? (
        <PanelSection title={`${filtered.length} result${filtered.length === 1 ? '' : 's'}`}>
          <div className="space-y-2">
            {filtered.map((t) => (
              <TemplateCard key={t.id} template={t} hovered={hovered === t.id} onHover={setHovered} onUse={apply} />
            ))}
          </div>
          {filtered.length === 0 && <EmptyState title="No templates match that." body="Try a different word." />}
        </PanelSection>
      ) : (
        TEMPLATE_CATEGORIES.map((category) => (
          <PanelSection key={category.id} title={category.label}>
            <p className="mb-2.5 -mt-1 text-[11px] text-[var(--color-ink-500)]">{category.blurb}</p>
            <div className="space-y-2">
              {TEMPLATES.filter((t) => t.category === category.id).map((t) => (
                <TemplateCard key={t.id} template={t} hovered={hovered === t.id} onHover={setHovered} onUse={apply} />
              ))}
            </div>
          </PanelSection>
        ))
      )}
    </div>
  );
}

/**
 * Template card with a live CSS preview.
 *
 * Previews animate only on hover, so opening the panel never starts 25 animations
 * at once. Layout varies by category so browsing feels less like a flat list.
 */
function TemplateCard({
  template,
  hovered,
  onHover,
  onUse,
}: {
  template: TemplateDefinition;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onUse: (t: TemplateDefinition) => void;
}) {
  const aspect = template.canvas.width / template.canvas.height;
  const portrait = aspect < 0.9;
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      onPointerEnter={() => onHover(template.id)}
      onPointerLeave={() => onHover(null)}
      className="group overflow-hidden rounded-[9px] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] transition-colors hover:border-[var(--color-ink-500)]"
    >
      <div
        className="relative overflow-hidden"
        style={{ aspectRatio: String(aspect), background: templatePreviewCss(template) }}
      >
        {/* Soft ambient glow on hover */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={{
            opacity: hovered && !reduced ? 1 : 0,
            background: `radial-gradient(circle at 50% 40%, ${template.accent}33, transparent 55%)`,
          }}
        />

        {/* Device / window mock */}
        <div
          className="absolute rounded-[4px] border border-white/15 bg-black/40 shadow-[0_10px_28px_rgba(0,0,0,0.45)] transition-transform duration-[900ms] ease-out"
          style={{
            left: portrait ? '18%' : '12%',
            top: portrait ? '14%' : '20%',
            right: portrait ? '18%' : template.category === 'showcase' ? '38%' : '12%',
            bottom: portrait ? '22%' : '14%',
            transform: hovered && !reduced ? 'scale(1.07) translateY(-4%)' : 'scale(1)',
            borderRadius: template.category === 'cinematic' ? 2 : portrait ? 10 : 5,
          }}
        >
          <div
            className="absolute inset-x-[10%] top-[12%] h-[8%] rounded-full opacity-70 transition-all duration-700"
            style={{
              background: template.accent,
              width: hovered ? '48%' : '28%',
              left: '26%',
            }}
          />
          <div className="absolute inset-x-[10%] top-[28%] h-[6%] rounded-full bg-white/15" />
          <div className="absolute inset-x-[10%] top-[40%] h-[6%] rounded-full bg-white/10" />
          {template.category === 'showcase' && (
            <div
              className="absolute bottom-[14%] left-[10%] right-[10%] h-[18%] rounded-[3px] bg-white/10 transition-opacity duration-500"
              style={{ opacity: hovered ? 1 : 0.45 }}
            />
          )}
        </div>

        {/* Side caption strip for split layouts */}
        {template.category === 'showcase' && !portrait && (
          <div
            className="absolute bottom-[18%] right-[8%] top-[22%] w-[22%] rounded-[3px] bg-white/10 transition-transform duration-700"
            style={{ transform: hovered && !reduced ? 'translateX(-6%)' : 'none' }}
          />
        )}

        {/* Cursor pip that drifts on hover */}
        <span
          className="absolute h-2 w-2 rounded-full bg-white shadow transition-all duration-[1100ms] ease-out"
          style={{
            left: hovered && !reduced ? '62%' : '38%',
            top: hovered && !reduced ? '48%' : '58%',
            opacity: hovered ? 0.95 : 0.35,
            boxShadow: `0 0 0 3px ${template.accent}55`,
          }}
        />

        <span className="absolute bottom-1.5 right-1.5 rounded-[4px] bg-black/60 px-1.5 py-0.5 text-[9.5px] font-medium text-white/85">
          {template.aspectLabel} · {template.duration}s
        </span>
      </div>

      <div className="p-2.5">
        <p className="text-[12.5px] font-semibold text-[var(--color-ink-50)]">{template.name}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-ink-400)]">
          {template.description}
        </p>
        <Button size="sm" fullWidth className="mt-2" onClick={() => onUse(template)}>
          Use Template
        </Button>
      </div>
    </div>
  );
}

function templatePreviewCss(template: TemplateDefinition): string {
  const bg = template.background;
  if (bg.type === 'solid') return bg.color;
  if (bg.type === 'gradient') return `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`;
  if (bg.type === 'mesh')
    return `radial-gradient(at 22% 28%, ${bg.colors[1]}, transparent 60%), radial-gradient(at 78% 72%, ${bg.colors[2]}, transparent 60%), ${bg.colors[0]}`;
  return '#12151a';
}

/* ------------------------------------------------------------- elements */

function ElementsPanel() {
  const addLayer = useEditor((s) => s.addLayer);
  const playhead = useEditor((s) => s.playhead);
  const [tab, setTab] = useState<'insert' | 'layers'>('insert');
  const [query, setQuery] = useState('');

  const add = (layer: Parameters<typeof addLayer>[0], label: string) => {
    const placed = {
      ...layer,
      start: Math.round(playhead * 100) / 100,
      position: layer.position ?? { x: 0, y: 0 },
    };
    // Nudge slightly so stacked inserts don't occupy the exact same centre.
    const nudge = (useEditor.getState().activeScene().layers.length % 5) * 18;
    placed.position = { x: (placed.position?.x ?? 0) + nudge, y: (placed.position?.y ?? 0) + nudge };
    addLayer(placed, label);
  };

  const shapes: { kind: ShapeLayer['shape']; label: string; keywords: string }[] = [
    { kind: 'rect', label: 'Rectangle', keywords: 'shape rect box' },
    { kind: 'ellipse', label: 'Ellipse', keywords: 'shape circle oval' },
    { kind: 'triangle', label: 'Triangle', keywords: 'shape' },
    { kind: 'line', label: 'Line', keywords: 'shape line' },
    { kind: 'arrow', label: 'Arrow', keywords: 'shape arrow pointer' },
  ];

  const callouts: { kind: CalloutLayer['callout']; label: string; keywords: string }[] = [
    { kind: 'circle', label: 'Circle', keywords: 'callout circle' },
    { kind: 'roundedRect', label: 'Box', keywords: 'callout box' },
    { kind: 'highlight', label: 'Highlight', keywords: 'callout highlight' },
    { kind: 'spotlight', label: 'Spotlight', keywords: 'callout spotlight focus' },
    { kind: 'number', label: 'Number', keywords: 'callout badge number' },
    { kind: 'label', label: 'Label', keywords: 'callout label' },
  ];

  const q = query.trim().toLowerCase();
  const match = (label: string, keywords: string) =>
    !q || label.toLowerCase().includes(q) || keywords.includes(q);

  return (
    <div>
      <div className="flex gap-1 border-b border-white/8 px-2.5 py-2">
        <button
          type="button"
          onClick={() => setTab('insert')}
          className={clsx(
            'flex-1 rounded-[6px] py-1.5 text-[11.5px] font-medium',
            tab === 'insert' ? 'bg-white/10 text-white' : 'text-[var(--color-ink-400)]',
          )}
        >
          Insert
        </button>
        <button
          type="button"
          onClick={() => setTab('layers')}
          className={clsx(
            'flex-1 rounded-[6px] py-1.5 text-[11.5px] font-medium',
            tab === 'layers' ? 'bg-white/10 text-white' : 'text-[var(--color-ink-400)]',
          )}
        >
          Layers
        </button>
      </div>

      {tab === 'layers' ? (
        <LayersList />
      ) : (
        <>
          <div className="px-3 pt-3">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search elements…"
              aria-label="Search elements"
            />
          </div>

          <PanelSection title="Text">
            <div className="space-y-1.5">
              {match('Headline', 'text heading title') && (
                <ElementButton
                  icon={<IconText size={15} />}
                  label="Headline"
                  onClick={() => add(createTextLayer('Your headline'), 'Add text')}
                />
              )}
              {match('Subtitle', 'text subtitle body') && (
                <ElementButton
                  icon={<IconText size={15} />}
                  label="Subtitle"
                  onClick={() => {
                    const layer = createTextLayer('Supporting line');
                    layer.fontSize = 38;
                    layer.fontWeight = 400;
                    layer.color = '#9CA3AF';
                    layer.position = { x: 0, y: 90 };
                    add(layer, 'Add text');
                  }}
                />
              )}
              {match('Label', 'text label') && (
                <ElementButton
                  icon={<IconText size={15} />}
                  label="Label"
                  onClick={() => {
                    const layer = createTextLayer('Label');
                    layer.fontSize = 22;
                    layer.fontWeight = 600;
                    layer.color = '#22D3EE';
                    add(layer, 'Add text');
                  }}
                />
              )}
            </div>
          </PanelSection>

          <PanelSection title="Shapes">
            <div className="grid grid-cols-2 gap-1.5">
              {shapes.filter((s) => match(s.label, s.keywords)).map((s) => (
                <ElementButton
                  key={s.kind}
                  icon={s.kind === 'arrow' ? <IconArrow size={15} /> : <IconShape size={15} />}
                  label={s.label}
                  onClick={() => add(createShapeLayer(s.kind), 'Add shape')}
                />
              ))}
            </div>
          </PanelSection>

          <PanelSection title="Callouts">
            <div className="grid grid-cols-2 gap-1.5">
              {callouts.filter((c) => match(c.label, c.keywords)).map((c) => (
                <ElementButton
                  key={c.kind}
                  icon={<IconCallout size={15} />}
                  label={c.label}
                  onClick={() => add(createCalloutLayer(c.kind), 'Add callout')}
                />
              ))}
            </div>
          </PanelSection>

          <PanelSection title="Video tools">
            <p className="text-[11.5px] leading-relaxed text-[var(--color-ink-400)]">
              Select any video clip — recorded or imported — then use{' '}
              <span className="text-[var(--color-ink-200)]">Animate</span>,{' '}
              <span className="text-[var(--color-ink-200)]">Crop App Screen</span>,{' '}
              <span className="text-[var(--color-ink-200)]">Cursor</span>, or{' '}
              <span className="text-[var(--color-ink-200)]">Appearance</span> in the inspector.
              Imported files: use <span className="text-[var(--color-ink-200)]">Detect Taps</span>{' '}
              then review, or <span className="text-[var(--color-ink-200)]">Mark path</span> /{' '}
              <span className="text-[var(--color-ink-200)]">Add Tap</span>. MKV/AVI convert
              in-app (or via system FFmpeg when available).
            </p>
            <div className="mt-2.5 flex gap-2 text-[var(--color-ink-500)]">
              <IconCursor size={16} />
              <IconDevice size={16} />
            </div>
          </PanelSection>
        </>
      )}
    </div>
  );
}

function LayersList() {
  const scene = useEditor((s) => s.project.scenes[s.activeSceneIndex]);
  const selectedIds = useEditor((s) => s.selectedLayerIds);
  const selectLayers = useEditor((s) => s.selectLayers);
  const updateLayer = useEditor((s) => s.updateLayer);
  const moveLayerToIndex = useEditor((s) => s.moveLayerToIndex);
  const [editingId, setEditingId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const layers = [...scene.layers].reverse();

  return (
    <PanelSection title="Layers">
      {layers.length === 0 ? (
        <EmptyState
          icon={<IconElements size={22} />}
          title="No layers"
          body="Insert text, shapes or a recording to begin."
        />
      ) : (
        <ul className="space-y-0.5">
          {layers.map((layer, visualIndex) => {
            const realIndex = scene.layers.length - 1 - visualIndex;
            const glyph =
              layer.type === 'text'
                ? 'T'
                : layer.type === 'shape'
                  ? layer.shape === 'arrow'
                    ? '→'
                    : '▣'
                  : layer.type === 'callout'
                    ? '●'
                    : layer.type === 'video'
                      ? '▶'
                      : layer.type === 'audio'
                        ? '♪'
                        : '▣';
            return (
              <li
                key={layer.id}
                draggable={!layer.locked}
                onDragStart={() => {
                  dragId.current = layer.id;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!dragId.current || dragId.current === layer.id) return;
                  moveLayerToIndex(dragId.current, realIndex);
                  dragId.current = null;
                }}
                onClick={() => selectLayers([layer.id])}
                className={clsx(
                  'group flex cursor-pointer items-center gap-1.5 rounded-[7px] px-1.5 py-1.5',
                  selectedIds.includes(layer.id)
                    ? 'bg-[rgba(34,211,238,0.12)]'
                    : 'hover:bg-white/[0.04]',
                  layer.hidden && 'opacity-45',
                )}
              >
                <button
                  type="button"
                  aria-label={layer.hidden ? 'Show' : 'Hide'}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayer(layer.id, { hidden: !layer.hidden }, 'Toggle visibility');
                  }}
                  className="w-4 text-[11px] text-[var(--color-ink-400)] hover:text-white"
                >
                  {layer.hidden ? '–' : '👁'}
                </button>
                <span className="w-4 text-center text-[11px] text-[var(--color-ink-500)]">{glyph}</span>
                {editingId === layer.id ? (
                  <input
                    autoFocus
                    className="min-w-0 flex-1 rounded-[4px] bg-[var(--color-ink-900)] px-1 text-[12px] text-white outline-none ring-1 ring-[var(--color-accent)]"
                    defaultValue={layer.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      updateLayer(layer.id, { name: e.target.value || layer.name }, 'Rename layer');
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <span
                    className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-ink-100)]"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingId(layer.id);
                    }}
                  >
                    {layer.name}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={layer.locked ? 'Unlock' : 'Lock'}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayer(layer.id, { locked: !layer.locked }, 'Toggle lock');
                  }}
                  className="text-[10px] text-[var(--color-ink-500)] opacity-0 group-hover:opacity-100"
                >
                  {layer.locked ? '🔒' : '○'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PanelSection>
  );
}

function ElementButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-[7px] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] px-2.5 py-2 text-left text-[12px] text-[var(--color-ink-200)] transition-colors hover:border-[var(--color-ink-500)] hover:text-white"
    >
      <span className="text-[var(--color-ink-400)]">{icon}</span>
      {label}
    </button>
  );
}

/* -------------------------------------------------------------- project */

function ProjectPanel() {
  const assets = useEditor((s) => s.project.assets);
  const scenes = useEditor((s) => s.project.scenes);
  const activeIndex = useEditor((s) => s.activeSceneIndex);
  const setActiveScene = useEditor((s) => s.setActiveScene);
  const addLayer = useEditor((s) => s.addLayer);
  const removeAsset = useEditor((s) => s.removeAsset);
  const inputRef = useRef<HTMLInputElement>(null);
  const { importFiles } = useMediaImport();

  const audioAssets = assets.filter((a) => a.kind === 'audio');
  const visualAssets = assets.filter((a) => a.kind !== 'audio');

  return (
    <div>
      <PanelSection
        title="Media"
        action={
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[11px] text-[var(--color-accent)] hover:opacity-80"
          >
            Add
          </button>
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {visualAssets.length === 0 ? (
          <EmptyState
            icon={<IconMedia size={22} />}
            title="No media yet"
            body="Drop a recording here or record your screen."
          />
        ) : (
          <ul className="space-y-1.5">
            {visualAssets.map((asset) => (
              <li
                key={asset.id}
                className="group flex items-center gap-2 rounded-[7px] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] p-1.5"
              >
                <div className="h-9 w-14 shrink-0 overflow-hidden rounded-[4px] bg-[var(--color-ink-800)]">
                  {asset.thumbnail && (
                    <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] text-[var(--color-ink-100)]">{asset.name}</p>
                  <p className="tabular text-[10.5px] text-[var(--color-ink-500)]">
                    {asset.duration > 0 ? `${asset.duration.toFixed(1)}s · ` : ''}
                    {formatBytes(asset.byteSize)}
                    {asset.recording?.cursorCaptured && ' · cursor'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Tooltip content="Add to this scene">
                    <button
                      type="button"
                      aria-label={`Add ${asset.name} to scene`}
                      onClick={() => {
                        if (asset.kind === 'video') {
                          placeVideoAsset(asset);
                        } else {
                          addLayer(createImageLayer(asset.id, asset.name), 'Add image');
                        }
                      }}
                      className="rounded-[4px] px-1 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-ink-800)]"
                    >
                      Add
                    </button>
                  </Tooltip>
                  <IconButton label={`Remove ${asset.name}`} size="sm" tone="danger" onClick={() => removeAsset(asset.id)}>
                    <IconTrash size={11} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>

      <PanelSection title="Scenes">
        <ul className="space-y-1">
          {scenes.map((scene, index) => (
            <li key={scene.id}>
              <button
                type="button"
                onClick={() => setActiveScene(index)}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-[7px] px-2.5 py-2 text-left text-[12px] transition-colors',
                  index === activeIndex
                    ? 'bg-[rgba(34,211,238,0.1)] text-[var(--color-accent)]'
                    : 'text-[var(--color-ink-200)] hover:bg-[var(--color-ink-800)]',
                )}
              >
                <IconScenes size={14} className="shrink-0 opacity-60" />
                <span className="min-w-0 flex-1 truncate">{scene.name}</span>
                <span className="tabular shrink-0 text-[10.5px] opacity-70">{scene.duration.toFixed(1)}s</span>
              </button>
            </li>
          ))}
        </ul>
      </PanelSection>

      <PanelSection title="Audio">
        {audioAssets.length === 0 ? (
          <EmptyState
            icon={<IconAudio size={20} />}
            title="No audio yet"
            body="Import music or a voiceover to add it to the timeline."
          />
        ) : (
          <ul className="space-y-1.5">
            {audioAssets.map((asset) => (
              <li key={asset.id} className="flex items-center gap-2 rounded-[7px] bg-[var(--color-ink-900)] p-2">
                <IconAudio size={14} className="shrink-0 text-[var(--color-ink-400)]" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-ink-100)]">{asset.name}</span>
                <button
                  type="button"
                  onClick={() => addLayer(createAudioLayer(asset.id, asset.duration || 5, asset.name), 'Add audio')}
                  className="shrink-0 text-[10.5px] text-[var(--color-accent)] hover:opacity-80"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
    </div>
  );
}

export { getTemplate };
