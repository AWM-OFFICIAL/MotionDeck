/**
 * Last line of defence. A render crash in a creative tool must not lose work, so
 * the boundary explains the situation in plain language and points at recovery,
 * which the autosave layer has already written to disk.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MotionDeck] unrecoverable render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-ink-900)] px-6">
        <div className="max-w-[440px] text-center">
          <img src="/logo-mark.png" alt="" className="mx-auto h-14 w-auto object-contain opacity-70" />
          <h1 className="mt-5 text-[18px] font-semibold text-[var(--color-ink-50)]">
            MotionDeck ran into a problem.
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-400)]">
            Your project was saved automatically. Reload the app and you'll be offered the last
            version of your work.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-[8px] bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-[#04222b] transition-opacity hover:opacity-90"
          >
            Reload MotionDeck
          </button>
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-[11.5px] text-[var(--color-ink-500)]">
              Technical details
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-[8px] bg-[var(--color-ink-850)] p-3 text-[10.5px] leading-relaxed text-[var(--color-ink-400)]">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
