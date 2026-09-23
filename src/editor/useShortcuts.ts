import { useEffect } from 'react';
import { useEditor } from '../state/editorStore';
import { createShapeLayer, createTextLayer } from '../core/defaults';

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
};

export interface ShortcutHandlers {
  onExport: () => void;
  onRecord: () => void;
}

/** Global editor shortcuts. Never fires while the user is typing in a field. */
export function useShortcuts({ onExport, onRecord }: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const store = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void store.save();
        return;
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        onExport();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        onRecord();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const id = store.selectedLayerIds[0];
        if (id) store.duplicateLayer(id);
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        store.selectLayers(store.activeScene().layers.map((l) => l.id));
        return;
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) store.ungroupSelectedLayers();
        else store.groupSelectedLayers();
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          store.togglePlay();
          break;
        case 'v':
        case 'V':
          // Select tool — already the default; clear special modes via event.
          window.dispatchEvent(new CustomEvent('motiondeck:select-tool'));
          break;
        case 't':
        case 'T': {
          e.preventDefault();
          const layer = createTextLayer('Your headline', store.playhead);
          store.addLayer(layer, 'Add text');
          break;
        }
        case 'r':
        case 'R': {
          if (mod) break;
          e.preventDefault();
          store.addLayer({ ...createShapeLayer('rect'), start: store.playhead }, 'Add shape');
          break;
        }
        case 'g':
        case 'G':
          if (e.shiftKey) {
            e.preventDefault();
            store.ungroupSelectedLayers();
          } else {
            e.preventDefault();
            store.groupSelectedLayers();
          }
          break;
        case 'a':
        case 'A':
          if (!mod) {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('motiondeck:open-animate'));
          }
          break;
        case 's':
        case 'S':
          e.preventDefault();
          store.splitLayerAtPlayhead();
          break;
        case 'Delete':
        case 'Backspace':
          if (store.selectedLayerIds.length > 0) {
            e.preventDefault();
            store.removeLayers(store.selectedLayerIds);
          }
          break;
        case 'Escape':
          store.selectLayers([]);
          break;
        case '?':
        case 'F1':
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('motiondeck:open-guide'));
          break;
        case 'Home':
          e.preventDefault();
          store.setPlayhead(0);
          break;
        case 'End':
          e.preventDefault();
          store.setPlayhead(store.sceneDuration());
          break;
        case 'ArrowLeft':
          e.preventDefault();
          store.setPlayhead(store.playhead - (e.shiftKey ? 1 : 1 / store.project.fps));
          break;
        case 'ArrowRight':
          e.preventDefault();
          store.setPlayhead(store.playhead + (e.shiftKey ? 1 : 1 / store.project.fps));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onExport, onRecord]);
}
