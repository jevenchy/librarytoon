import type { ReactNode } from "react";

interface CardShellProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  hoverable?: boolean;
}

export default function CardShell({ children, className, innerClassName, hoverable = false }: CardShellProps) {
  return (
    <div
      className={`rounded-3xl bg-panel p-[3px] ${
        hoverable ? "transition-colors duration-300 hover:bg-panel-hover" : ""
      } ${className ?? ""}`}
    >
      <div className={`rounded-[20px] border border-dashed border-edge ${innerClassName ?? ""}`}>
        {children}
      </div>
    </div>
  );
}
