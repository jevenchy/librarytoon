import type { ReactNode, CSSProperties } from "react";

export type BadgeColor =
  | "default"
  | "sky"
  | "violet"
  | "amber"
  | "teal"
  | "orange"
  | "ok"
  | "faint"
  | "overlay"
  | "danger"
  | "error";

const BADGE_COLORS: Record<BadgeColor, string> = {
  default: "border-edge-bright text-foreground",
  sky:     "border-sky-500/50    text-foreground",
  violet:  "border-violet-500/50 text-foreground",
  amber:   "border-amber-500/50  text-foreground",
  teal:    "border-teal-500/50   text-foreground",
  orange:  "border-orange-500/50 text-foreground",
  ok:      "border-edge-bright   text-ok",
  faint:   "border-foreground/40 text-foreground",
  overlay: "border-white/40      text-white",
  danger:  "border-danger/60     text-white bg-danger/50",
  error:   "border-edge-bright   text-danger",
};

type Props = {
  children:   ReactNode;
  className?: string;
  variant?:   "plain" | "badge";
  color?:     BadgeColor;
  mono?:      boolean;
  style?:     CSSProperties;
};

export default function MicroLabel({
  children,
  className,
  variant = "plain",
  color   = "default",
  mono    = false,
  style,
}: Props) {
  if (variant === "badge") {
    return (
      <span
        style={style}
        className={`text-xs px-1.5 py-0.5 rounded-chip border border-dashed leading-none transition-colors
          ${mono ? "font-data" : "uppercase tracking-wider"}
          ${BADGE_COLORS[color]}
          ${className ?? ""}`}
      >
        {children}
      </span>
    );
  }

  return (
    <span
      className={`text-xs font-semibold uppercase tracking-widest text-foreground/50 transition-colors
        ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
