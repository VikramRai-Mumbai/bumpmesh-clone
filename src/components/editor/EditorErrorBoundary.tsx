"use client";

// Catches render errors anywhere in the editor and shows a recovery screen instead of a blank page.

import { Component, type ReactNode } from "react";

type State = { error: Error | null };

/** Error boundary around the editor; "Reload" restarts the app. */
export default class EditorErrorBoundary extends Component<
  Readonly<{ children: ReactNode }>,
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Editor crashed:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-app p-6 text-center text-fg">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted">
          The editor hit an unexpected error. Your files were not uploaded
          anywhere. Reload to start again; save your project regularly to keep
          your work.
        </p>
        <p className="max-w-md truncate font-mono text-xs text-muted">
          {this.state.error.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Reload
        </button>
      </div>
    );
  }
}
