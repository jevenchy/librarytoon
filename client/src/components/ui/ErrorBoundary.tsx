import { Component, type ReactNode } from "react";
import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import EmptyState from "./EmptyState.js";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[100dvh] bg-bg flex items-center justify-center p-6 select-none">
        <EmptyState
          icon={<FiAlertTriangle size={28} />}
          message="An unexpected error occurred"
          hint={error.message}
          action={
            <button
              onClick={() => window.location.reload()}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/80 active:text-foreground/80 transition-colors"
            >
              <FiRefreshCw size={12} />
              Reload
            </button>
          }
        />
      </div>
    );
  }
}
