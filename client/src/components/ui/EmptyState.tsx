import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  message: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({ icon, message, hint, action, className }: Props) {
  return (
    <div className={`rounded-card-outer bg-panel p-2 transition-colors ${className ?? ""}`}>
      <div className="rounded-card-inner border-2 border-dashed border-edge-bright p-8 flex flex-col items-center gap-3">
        <div className="text-foreground/20">{icon}</div>
        <p className="text-sm text-foreground/60 text-center">{message}</p>
        {hint && <p className="text-xs text-foreground/50 text-center">{hint}</p>}
        {action}
      </div>
    </div>
  );
}
