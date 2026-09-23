import { useEffect } from 'react';
import clsx from 'clsx';
import { useEditor } from '../state/editorStore';
import { IconAlert, IconCheck, IconClose } from './icons';

/** Single, non-blocking message slot. Errors stay until dismissed. */
export function Toasts() {
  const toast = useEditor((s) => s.toast);
  const dismiss = useEditor((s) => s.dismissToast);

  useEffect(() => {
    if (!toast || toast.tone === 'error') return;
    const id = setTimeout(dismiss, 4200);
    return () => clearTimeout(id);
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[250] -translate-x-1/2">
      <div
        role="status"
        aria-live="polite"
        className={clsx(
          'animate-rise pointer-events-auto flex max-w-[460px] items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 shadow-2xl backdrop-blur',
          toast.tone === 'error'
            ? 'border-[#5c2a2e] bg-[#2a1416]/95'
            : toast.tone === 'success'
              ? 'border-[#1f5344] bg-[#0f2620]/95'
              : 'border-[var(--color-ink-600)] bg-[var(--color-ink-800)]/95',
        )}
      >
        <span
          className={clsx(
            'mt-0.5 shrink-0',
            toast.tone === 'error'
              ? 'text-[var(--color-danger)]'
              : toast.tone === 'success'
                ? 'text-[var(--color-ok)]'
                : 'text-[var(--color-ink-400)]',
          )}
        >
          {toast.tone === 'error' ? <IconAlert size={15} /> : <IconCheck size={15} />}
        </span>
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-100)]">{toast.message}</p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="mt-0.5 shrink-0 text-[var(--color-ink-500)] transition-colors hover:text-white"
        >
          <IconClose size={13} />
        </button>
      </div>
    </div>
  );
}
