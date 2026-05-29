import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  message: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, message, hint, action, className }: EmptyStateProps) {
  return (
    <div className={`rounded-3xl bg-panel p-2 ${className ?? ""}`}>
      <div className="rounded-2xl border border-dashed border-edge-bright p-8 flex flex-col items-center gap-3">
        <div className="text-foreground/10">{icon}</div>
        <p className="text-sm text-foreground/40 text-center">{message}</p>
        {hint && <p className="text-xs text-foreground/25 text-center">{hint}</p>}
        {action}
      </div>
    </div>
  );
}
