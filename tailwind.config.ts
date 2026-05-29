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
        accent:        "#00A3FA",
        "reader-bg":   "#050505",
        ok:            "#22C55E",
        warn:          "#F59E0B",
        danger:        "#EF4444",
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
    }
  },
  plugins: [animate]
} satisfies Config;
