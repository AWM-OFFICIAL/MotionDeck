/**
 * Application root.
 *
 * Three routes, held in local state rather than a router: the desktop shell never
 * changes URL. Crash recovery is offered before anything else renders.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../core/types';
import { useEditor } from '../state/editorStore';
import { EditorShell } from '../editor/EditorShell';
import { HomeScreen } from './HomeScreen';
import { WelcomeScreen } from './WelcomeScreen';
import { QuickStart } from './QuickStart';
import { Button, Dialog, Spinner } from '../ui/primitives';
import { buildSampleProject } from '../library/sampleProject';
import {
  clearRecovery,
  listProjects,
  readRecovery,
  saveProject,
} from '../platform/projectStore';
import { detectCapabilities } from '../platform/env';
import { persistenceWarning, requestPersistence } from '../platform/mediaVault';
import { createProject } from '../core/defaults';

type Route = 'loading' | 'welcome' | 'home' | 'editor';

export function App() {
  const [route, setRoute] = useState<Route>('loading');
  const [quickOpen, setQuickOpen] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [recovery, setRecovery] = useState<Project | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const loadProjectIntoEditor = useEditor((s) => s.loadProject);
  const setSidebarSection = useEditor((s) => s.setSidebarSection);
  const showToast = useEditor((s) => s.showToast);

  /** Deferred intent from Home/Quick Start, executed once the editor mounts. */
  const pendingAction = useRef<'record' | 'import' | null>(null);

  useEffect(() => {
    void (async () => {
      await detectCapabilities();
      await requestPersistence();
      const warning = persistenceWarning();
      if (warning) setStorageWarning(warning);

      const existing = listProjects();
      const recovered = readRecovery();

      // Only offer recovery when the last session ended with unsaved-looking state.
      if (recovered && existing.length > 0) {
        const indexed = existing.find((p) => p.id === recovered.id);
        if (!indexed || recovered.updatedAt > indexed.updatedAt + 1500) {
          setRecovery(recovered);
        }
      }

      setRoute(existing.length === 0 ? 'welcome' : 'home');
    })();
  }, []);

  const openProject = useCallback(
    (project: Project, next?: 'record' | 'import') => {
      loadProjectIntoEditor(project);
      pendingAction.current = next ?? null;
      void saveProject(project);
      setRoute('editor');
    },
    [loadProjectIntoEditor],
  );

  const openSample = useCallback(async () => {
    setSampleLoading(true);
    try {
      const { project, hasFootage } = await buildSampleProject();
      await saveProject(project);
      openProject(project);
      if (!hasFootage) {
        showToast(
          'The example loaded, but this browser could not generate the demo footage. The layout and animations still work.',
          'info',
        );
      }
    } catch (err) {
      console.error('[MotionDeck] sample project failed', err);
      showToast('The example project could not be created. Start a new project instead.', 'error');
    } finally {
      setSampleLoading(false);
    }
  }, [openProject, showToast]);

  if (route === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-ink-900)]">
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <>
      {route === 'welcome' && (
        <WelcomeScreen
          sampleLoading={sampleLoading}
          onRecord={() => openProject(createProject('Untitled Project'), 'record')}
          onImport={() => openProject(createProject('Untitled Project'), 'import')}
          onTemplates={() => {
            setSidebarSection('templates');
            openProject(createProject('Untitled Project'));
          }}
          onOpenSample={() => void openSample()}
        />
      )}

      {route === 'home' && (
        <HomeScreen
          onOpen={openProject}
          onQuickStart={() => setQuickOpen(true)}
          onBrowseTemplates={() => {
            setSidebarSection('templates');
            openProject(createProject('Untitled Project'));
          }}
        />
      )}

      {route === 'editor' && (
        <EditorShell
          onExit={() => {
            void useEditor.getState().save();
            setRoute('home');
          }}
        />
      )}

      <QuickStart
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onCreate={(project, next) => {
          setQuickOpen(false);
          openProject(project, next === 'editor' ? undefined : next);
        }}
      />

      <Dialog
        open={recovery !== null}
        onClose={() => {
          clearRecovery();
          setRecovery(null);
        }}
        title="Recover your last session?"
        description={`MotionDeck has unsaved changes for "${recovery?.name}".`}
        width={460}
        footer={
          <>
            <Button
              onClick={() => {
                clearRecovery();
                setRecovery(null);
              }}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (recovery) openProject(recovery);
                setRecovery(null);
              }}
            >
              Recover
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-300)]">
          It looks like MotionDeck closed before the last change was written to disk. You can
          restore that version, or discard it and keep what was saved.
        </p>
      </Dialog>

      <Dialog
        open={storageWarning !== null}
        onClose={() => setStorageWarning(null)}
        title="Local storage is limited here"
        width={460}
        footer={
          <Button variant="primary" onClick={() => setStorageWarning(null)}>
            Understood
          </Button>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-300)]">
          MotionDeck could not open its local media vault, so recordings will only be kept for this
          session. Export anything you want to keep before closing the app.
        </p>
        <p className="mt-2 text-[11.5px] text-[var(--color-ink-500)]">{storageWarning}</p>
      </Dialog>

      <PendingActionBridge route={route} pending={pendingAction} />
    </>
  );
}

/**
 * Bridges "open the recorder / file picker right after entering the editor".
 * Kept separate so the editor itself has no knowledge of how it was reached.
 */
function PendingActionBridge({
  route,
  pending,
}: {
  route: Route;
  pending: React.MutableRefObject<'record' | 'import' | null>;
}) {
  const setSidebarSection = useEditor((s) => s.setSidebarSection);

  useEffect(() => {
    if (route !== 'editor' || !pending.current) return;
    const action = pending.current;
    pending.current = null;
    // The editor mounts its dialogs on the next frame; wait for them.
    const id = setTimeout(() => {
      setSidebarSection('create');
      if (action === 'record') {
        window.dispatchEvent(new CustomEvent('motiondeck:open-record'));
      } else {
        window.dispatchEvent(new CustomEvent('motiondeck:open-import'));
      }
    }, 120);
    return () => clearTimeout(id);
  }, [route, pending, setSidebarSection]);

  return null;
}
