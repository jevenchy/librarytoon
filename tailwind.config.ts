import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:            "hsl(var(--c-bg))",
        "bg-elevated": "hsl(var(--c-bg-elevated))",
        panel:         "hsl(var(--c-panel))",
        "panel-hover": "hsl(var(--c-panel-hover))",
        edge:          "hsl(var(--c-edge))",
        "edge-dim":    "hsl(var(--c-edge-dim))",
        "edge-bright": "hsl(var(--c-edge-bright))",
        muted:         "hsl(var(--c-muted))",
        background:    "hsl(var(--c-bg))",
        foreground:    "hsl(var(--c-foreground) / <alpha-value>)",
        accent:        "var(--accent)",
        "reader-bg":   "var(--reader-bg)",
        ok:            "var(--ok)",
        warn:          "var(--warn)",
        danger:        "var(--danger)",
      },
      fontFamily: {
        sans:    ["Poppins", "system-ui", "sans-serif"],
        data:    ["'Roboto Mono'", "ui-monospace", "monospace"],
      },
      maxWidth: {
        content: "72rem",
        reader:  "56rem",
      },
      borderRadius: {
        "card-outer": "1.5rem",
        "card-inner": "1.25rem",
      },
      spacing: {
        "card-inset": "3px",
      },
    }
  },
  plugins: [animate]
} satisfies Config;
