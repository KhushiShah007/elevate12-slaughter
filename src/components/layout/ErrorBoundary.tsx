import { Component, type ReactNode } from 'react';

/** Catches a crash in one screen so the rest of the app keeps working. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  componentDidCatch(error: Error) {
    // No personal data: just the kind of error.
    console.error('[screen] crashed:', error.name);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-gutter my-10 rounded-md border border-line bg-paper p-6 text-center">
        <p className="font-medium text-ink">Something went wrong on this screen.</p>
        <p className="mt-1 text-sm text-muted">Your trips and bookings are safe.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-tap rounded-pill bg-ink px-5 text-sm font-medium text-paper">
          Reload
        </button>
      </div>
    );
  }
}
